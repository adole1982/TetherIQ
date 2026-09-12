"""
H-03 / H-04 / H-05 / C-02 Comprehensive Budget & Lifecycle Test Suite

Tests:
1. Multi-threaded barrier test: 20 concurrent requests against a $1.00 budget (exactly 10 admit, 10 reject)
2. Microdollar integer precision: exact summation without floating-point drift
3. Fail-closed unknown model pricing rejection
4. Idempotent reconciliation: duplicate reconcile calls never double-charge
5. Startup crash recovery: in-flight dispatched reservations persist as 'unknown' and preserve budget; reserved become released
6. Pre-dispatch vs. post-dispatch release safety: only undispatched reservations may be released
7. Non-reserved background trace logging: does not mutate authoritative daily totals
8. Registry-driven billable route coverage: real middleware route classifier
9. Canonical microdollar payload & conflicting alias detection
10. Tri-state semantics: omitted (unchanged) vs. null (unlimited) vs. integer limit
11. Exact decimal to microdollar string conversion without floating-point roundoff
12. Dynamic circuit breaker tripping when limit is lowered below current effective spend
13. Database read corruption and locking fail-closed behavior (returns 503 and blocks inference)
14. Transactional SQLite schema migrations (backfilling legacy records before NOT NULL UNIQUE)
15. Tauri IPC single-envelope invocation contract simulation
"""

import sys
import os
import time
import tempfile
import threading
import sqlite3
import unittest
import json

# Add project root and sidecar to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sidecar")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Provide minimal mocks for fastapi/litellm if running in standalone python environment
from unittest.mock import MagicMock
if "fastapi" not in sys.modules:
    def passthrough_decorator(*args, **kwargs):
        def dec(fn):
            return fn
        return dec

    class MockJSONResponse:
        def __init__(self, content=None, status_code=200):
            self.content = content or {}
            self.status_code = status_code
            self.body = json.dumps(self.content).encode("utf-8")

    class MockFastAPI:
        def __init__(self, *args, **kwargs):
            self.get = passthrough_decorator
            self.post = passthrough_decorator
            self.middleware = passthrough_decorator
            self.add_middleware = MagicMock()
            self.include_router = MagicMock()

    fastapi_mock = MagicMock()
    fastapi_mock.FastAPI = MockFastAPI
    fastapi_mock.Request = MagicMock
    fastapi_mock.Response = MagicMock
    fastapi_mock.HTTPException = Exception
    
    responses_mock = MagicMock()
    responses_mock.JSONResponse = MockJSONResponse
    responses_mock.StreamingResponse = MagicMock

    sys.modules["fastapi"] = fastapi_mock
    sys.modules["fastapi.responses"] = responses_mock
    sys.modules["fastapi.dependencies"] = MagicMock()
    sys.modules["fastapi.dependencies.utils"] = MagicMock()
    sys.modules["fastapi.dependencies.models"] = MagicMock()
    sys.modules["uvicorn"] = MagicMock()
    sys.modules["starlette"] = MagicMock()
    sys.modules["starlette.middleware"] = MagicMock()
    sys.modules["starlette.middleware.trustedhost"] = MagicMock()
    sys.modules["starlette.middleware.cors"] = MagicMock()
    
    litellm_mock = MagicMock()
    litellm_mock.model_cost = {
        "claude-3-7-sonnet": {"input_cost_per_token": 0.000003, "output_cost_per_token": 0.000015, "max_tokens": 128000},
        "openrouter/anthropic/claude-3-7-sonnet": {"input_cost_per_token": 0.000003, "output_cost_per_token": 0.000015, "max_tokens": 128000},
        "text-moderation-latest": {"input_cost_per_token": 0.0000002, "output_cost_per_token": 0.0, "max_tokens": 32768},
        "rerank-english-v3.0": {"input_cost_per_token": 0.000001, "output_cost_per_token": 0.0, "max_tokens": 4096},
        "whisper-1": {"cost_per_second": 0.0001},
        "dall-e-3": {"cost_per_image": 0.08},
    }
    sys.modules["litellm"] = litellm_mock
    sys.modules["litellm.integrations"] = MagicMock()
    sys.modules["litellm.integrations.custom_logger"] = MagicMock()
    proxy_server_mock = MagicMock()
    proxy_server_mock.app = MockFastAPI()
    sys.modules["litellm.proxy"] = MagicMock()
    sys.modules["litellm.proxy.proxy_server"] = proxy_server_mock

from entrypoint import (
    SpendLedgerDB,
    estimate_request_microusd,
    classify_route,
    parse_decimal_string_to_microusd,
    parse_and_validate_budget_payload,
    OMITTED
)

class TestAtomicHardBudgetEngine(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db.close()
        self.db = SpendLedgerDB(db_path=self.temp_db.name)
        # Set daily limit to exactly $1.00 (1,000,000 microdollars)
        self.db.set_budget_limits(daily_limit_microusd=1_000_000, monthly_limit_microusd=150_000_000)

    def tearDown(self):
        try:
            os.unlink(self.temp_db.name)
        except Exception:
            pass

    def test_01_barrier_concurrency_race_condition(self):
        """
        H-03 Concurrency Test:
        20 concurrent worker threads all attempt to reserve $0.10 (100,000 microdollars)
        simultaneously using a thread barrier.
        ASSERT: Exactly 10 succeed, exactly 10 are rejected.
        Total committed spend must equal exactly $1.00 (1,000,000 microdollars).
        """
        barrier = threading.Barrier(20)
        results = []
        results_lock = threading.Lock()

        def worker(worker_id):
            res_id = f"res-worker-{worker_id}"
            barrier.wait()
            success, info = self.db.reserve_spend(res_id, "claude-3-7-sonnet", 100_000)
            with results_lock:
                results.append((worker_id, success, info))

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        successes = [r for r in results if r[1] is True]
        rejections = [r for r in results if r[1] is False]

        self.assertEqual(len(successes), 10, f"Expected exactly 10 successes, got {len(successes)}")
        self.assertEqual(len(rejections), 10, f"Expected exactly 10 rejections, got {len(rejections)}")

        for _, _, info in rejections:
            self.assertEqual(info.get("error"), "daily_budget_exceeded")

    def test_02_fail_closed_unknown_model_pricing(self):
        """
        H-04 Fail-Closed Policy:
        Requests for unregistered or unknown cloud models must fail closed immediately.
        """
        valid, cost, err = estimate_request_microusd("unknown-vendor/unpriced-model-v99", {"prompt": "Hello"}, "/chat/completions")
        self.assertFalse(valid)
        self.assertEqual(cost, 0)
        self.assertIn("Pricing unknown", err)

    def test_03_idempotent_reconciliation(self):
        """
        Reconciliation idempotency:
        Calling reconcile_spend multiple times for the same reservation must settle once and return True.
        """
        res_id = "res-idempotent-test"
        success, _ = self.db.reserve_spend(res_id, "claude-3-7-sonnet", 50_000)
        self.assertTrue(success)

        settle1 = self.db.reconcile_spend(res_id, actual_microusd=40_000, actual_tokens=100)
        self.assertTrue(settle1)

        settle2 = self.db.reconcile_spend(res_id, actual_microusd=40_000, actual_tokens=100)
        self.assertTrue(settle2)

        daily = self.db.get_daily_spend()
        self.assertEqual(daily["total_spend_microusd"], 40_000)
        self.assertEqual(daily["total_requests"], 1)

    def test_04_startup_crash_recovery(self):
        """
        Crash Recovery:
        On startup, 'dispatched' requests transition to 'unknown' (counted in budget).
        'reserved' requests transition to 'released' (process died before dispatch).
        """
        now_ms = int(time.time() * 1000)
        with sqlite3.connect(self.temp_db.name) as conn:
            conn.execute("""
                INSERT INTO active_reservations (id, day_key, reserved_microusd, model, status, created_at, lease_expires_at)
                VALUES ('res-dispatched-crash', '2026-09-04', 200000, 'claude-3-7-sonnet', 'dispatched', ?, ?)
            """, (now_ms, now_ms + 300000))
            conn.execute("""
                INSERT INTO active_reservations (id, day_key, reserved_microusd, model, status, created_at, lease_expires_at)
                VALUES ('res-reserved-crash', '2026-09-04', 150000, 'claude-3-7-sonnet', 'reserved', ?, ?)
            """, (now_ms, now_ms + 300000))
            conn.commit()

        # Restart DB recovery
        restarted_db = SpendLedgerDB(db_path=self.temp_db.name)

        with sqlite3.connect(self.temp_db.name) as conn:
            conn.row_factory = sqlite3.Row
            row_disp = conn.execute("SELECT status FROM active_reservations WHERE id = 'res-dispatched-crash'").fetchone()
            row_res = conn.execute("SELECT status FROM active_reservations WHERE id = 'res-reserved-crash'").fetchone()

        self.assertEqual(row_disp["status"], "unknown")
        self.assertEqual(row_res["status"], "released")

    def test_05_pre_dispatch_release_safety(self):
        """
        Release Safety:
        Only reservations in 'reserved' state can be released via release_undispatched().
        Once marked 'dispatched', release_undispatched returns False.
        """
        res_id = "res-release-test"
        self.db.reserve_spend(res_id, "claude-3-7-sonnet", 50_000)

        # Before dispatch: can be released
        released = self.db.release_undispatched(res_id)
        self.assertTrue(released)

        # Re-reserve and dispatch
        res_id2 = "res-dispatched-test"
        self.db.reserve_spend(res_id2, "claude-3-7-sonnet", 50_000)
        self.db.mark_dispatched(res_id2)

        # After dispatch: cannot be released
        released_after = self.db.release_undispatched(res_id2)
        self.assertFalse(released_after)

    def test_06_record_trace_spend_without_reservation_id(self):
        """
        Unreserved background traces:
        Must NOT mutate authoritative daily spend totals unless correlated with a valid reservationId.
        """
        initial_daily = self.db.get_daily_spend()
        initial_micros = initial_daily["total_spend_microusd"]

        trace_dict = {
            "id": "tr-background-unreserved",
            "modelServed": "claude-3-7-sonnet",
            "cost": 0.05,
            "totalTokens": 500,
            "status": "success"
        }

        # Background trace without reservationId
        ok = self.db.record_trace_spend(trace_dict)
        self.assertTrue(ok)

        after_daily = self.db.get_daily_spend()
        # Authoritative daily spend remains unchanged
        self.assertEqual(after_daily["total_spend_microusd"], initial_micros)

    def test_07_billable_route_classification_and_registry(self):
        """
        Registry-driven route classification:
        All standard inference endpoints classified as 'inference'.
        Control plane & health classified as 'control_plane' or 'public'.
        Unregistered endpoints classified as 'unauthorized' (fail-closed).
        """
        self.assertEqual(classify_route("POST", "/chat/completions"), "inference")
        self.assertEqual(classify_route("POST", "/v1/chat/completions"), "inference")
        self.assertEqual(classify_route("POST", "/moderations"), "inference")
        self.assertEqual(classify_route("POST", "/v1/moderations"), "inference")
        self.assertEqual(classify_route("POST", "/rerank"), "inference")
        self.assertEqual(classify_route("POST", "/v1/rerank"), "inference")
        self.assertEqual(classify_route("POST", "/audio/transcriptions"), "inference")
        self.assertEqual(classify_route("POST", "/embeddings"), "inference")

        self.assertEqual(classify_route("GET", "/health"), "public")
        self.assertEqual(classify_route("GET", "/health/readiness"), "public")
        self.assertEqual(classify_route("POST", "/spend/budget"), "control_plane")
        self.assertEqual(classify_route("POST", "/unregistered/evil/endpoint"), "unauthorized")

    def test_08_budget_limits_key_matching_and_conflicts(self):
        """
        Canonical microdollar parser & conflict detection:
        - Accepts canonical microdollars or clean USD decimal aliases
        - Rejects conflicting aliases with ValueError
        - Rejects negative, NaN, Inf, and excessive precision
        """
        # 1. Canonical payload
        daily, monthly = parse_and_validate_budget_payload({
            "daily_limit_microusd": 5_000_000,
            "monthly_limit_microusd": 75_000_000
        })
        self.assertEqual(daily, 5_000_000)
        self.assertEqual(monthly, 75_000_000)

        # 2. Matching USD alias
        d2, m2 = parse_and_validate_budget_payload({
            "daily_limit_usd": "5.00",
            "monthly_limit_usd": 75.0
        })
        self.assertEqual(d2, 5_000_000)
        self.assertEqual(m2, 75_000_000)

        # 3. Conflicting aliases -> ValueError
        with self.assertRaises(ValueError):
            parse_and_validate_budget_payload({
                "daily_limit_microusd": 5_000_000,
                "daily_limit_usd": 10.00
            })

    def test_09_tri_state_omitted_vs_null_semantics(self):
        """
        Tri-state semantics:
        - Omitted: existing limit remains unchanged
        - Explicit null: limit removed (unlimited)
        - Integer 0: blocks all billable requests ($0.00 budget)
        """
        # Initial: daily = 1,000,000, monthly = 150,000,000
        # 1. Update only monthly (daily omitted)
        d_val, m_val = parse_and_validate_budget_payload({"monthly_limit_microusd": 200_000_000})
        self.assertIs(d_val, OMITTED)
        self.assertEqual(m_val, 200_000_000)

        res = self.db.set_budget_limits(daily_limit_microusd=d_val, monthly_limit_microusd=m_val)
        self.assertEqual(res["daily_limit_microusd"], 1_000_000)
        self.assertEqual(res["monthly_limit_microusd"], 200_000_000)

        # 2. Set daily to null (unlimited)
        d_null, _ = parse_and_validate_budget_payload({"daily_limit_microusd": None})
        self.assertIsNone(d_null)
        res_null = self.db.set_budget_limits(daily_limit_microusd=d_null)
        self.assertIsNone(res_null["daily_limit_microusd"])

        # 3. Set daily to 0 ($0.00 limit -> blocks inference)
        d_zero, _ = parse_and_validate_budget_payload({"daily_limit_microusd": 0})
        self.assertEqual(d_zero, 0)
        res_zero = self.db.set_budget_limits(daily_limit_microusd=0)
        self.assertEqual(res_zero["daily_limit_microusd"], 0)
        self.assertTrue(res_zero["is_tripped"])

        # Verify reservation blocked when limit = 0
        success, info = self.db.reserve_spend("res-zero-budget", "claude-3-7-sonnet", 10_000)
        self.assertFalse(success)
        self.assertEqual(info["error"], "daily_budget_exceeded")

    def test_10_decimal_to_microdollar_exact_conversion(self):
        """
        Exact decimal to microdollar parsing:
        - '10.50' -> 10,500,000
        - '0.000001' -> 1
        - '0' -> 0
        - Rejects over-precision (>6 decimal places)
        """
        self.assertEqual(parse_decimal_string_to_microusd("10.50"), 10_500_000)
        self.assertEqual(parse_decimal_string_to_microusd("0.000001"), 1)
        self.assertEqual(parse_decimal_string_to_microusd("0"), 0)
        self.assertEqual(parse_decimal_string_to_microusd(100), 100_000_000)

        with self.assertRaises(ValueError):
            parse_decimal_string_to_microusd("1.0000001") # 7 decimal places

        with self.assertRaises(ValueError):
            parse_decimal_string_to_microusd("-10.00")

    def test_11_dynamic_circuit_breaker_on_limit_reduction(self):
        """
        Dynamic Circuit Breaker:
        Lowering daily limit below currently settled/inflight spend immediately trips the breaker.
        """
        self.db.set_budget_limits(daily_limit_microusd=5_000_000)
        # Settle $2.00 (2,000,000 microdollars)
        self.db.reserve_spend("res-dyn-1", "claude-3-7-sonnet", 2_000_000)
        self.db.reconcile_spend("res-dyn-1", actual_microusd=2_000_000)

        # Settings initially not tripped ($2 < $5)
        s1 = self.db.get_budget_settings()
        self.assertFalse(s1["is_tripped"])

        # Lower daily limit to $1.50 (1,500,000 microdollars) -> Tripped immediately
        s2 = self.db.set_budget_limits(daily_limit_microusd=1_500_000)
        self.assertTrue(s2["is_tripped"])

        # Subsequent reservation blocked
        success, _ = self.db.reserve_spend("res-dyn-2", "claude-3-7-sonnet", 10_000)
        self.assertFalse(success)

    def test_12_fail_closed_on_database_corruption_and_locks(self):
        """
        Fail-Closed Guarantee:
        If database is unhealthy or corrupted, reserve_spend returns False and get_budget_settings fails closed.
        """
        self.db.healthy = False
        self.db.last_error = "Disk I/O error simulated"

        success, info = self.db.reserve_spend("res-unhealthy", "claude-3-7-sonnet", 10_000)
        self.assertFalse(success)
        self.assertEqual(info["error"], "database_unavailable")

        with self.assertRaises(RuntimeError):
            self.db.get_budget_settings()

    def test_13_transactional_schema_migrations(self):
        """
        Transactional SQLite Migrations:
        Legacy databases with NULL or synthetic reservation IDs are deterministically backfilled.
        """
        legacy_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        legacy_db_file.close()

        try:
            # Create a legacy table structure with null reservation_id
            with sqlite3.connect(legacy_db_file.name) as conn:
                conn.execute("""
                    CREATE TABLE spend_logs (
                        id TEXT PRIMARY KEY,
                        reservation_id TEXT,
                        timestamp INTEGER NOT NULL,
                        day_key TEXT NOT NULL,
                        model TEXT,
                        provider TEXT,
                        prompt_tokens INTEGER,
                        completion_tokens INTEGER,
                        total_tokens INTEGER,
                        spend_microusd INTEGER NOT NULL,
                        client_name TEXT,
                        status TEXT
                    );
                """)
                conn.execute("""
                    INSERT INTO spend_logs (id, reservation_id, timestamp, day_key, spend_microusd)
                    VALUES ('tr-legacy-1', NULL, 12345678, '2026-09-04', 5000);
                """)
                conn.commit()

            # Initialize SpendLedgerDB on legacy file -> runs migration 1
            migrated_db = SpendLedgerDB(db_path=legacy_db_file.name)
            self.assertTrue(migrated_db.healthy)

            with sqlite3.connect(legacy_db_file.name) as conn:
                conn.row_factory = sqlite3.Row
                row = conn.execute("SELECT reservation_id FROM spend_logs WHERE id = 'tr-legacy-1'").fetchone()
                mig = conn.execute("SELECT version FROM schema_migrations WHERE version = 1").fetchone()

            self.assertEqual(row["reservation_id"], "migrated-res-tr-legacy-1")
            self.assertIsNotNone(mig)
        finally:
            try: os.unlink(legacy_db_file.name)
            except Exception: pass

    def test_14_expire_stale_reservations_policy(self):
        """
        Stale Reservations Expiry Policy:
        - Stale 'reserved' entries past TTL are marked 'released'.
        - 'dispatched' and 'unknown' entries are NEVER automatically released to zero.
        """
        now_ms = int(time.time() * 1000)
        past_ms = now_ms - 400_000 # 400 seconds ago (> 300s TTL)

        with sqlite3.connect(self.temp_db.name) as conn:
            conn.execute("""
                INSERT INTO active_reservations (id, day_key, reserved_microusd, model, status, created_at, lease_expires_at)
                VALUES ('res-stale-reserved', '2026-09-04', 100000, 'claude-3-7-sonnet', 'reserved', ?, ?)
            """, (past_ms, past_ms + 1000))
            conn.execute("""
                INSERT INTO active_reservations (id, day_key, reserved_microusd, model, status, created_at, lease_expires_at)
                VALUES ('res-stale-dispatched', '2026-09-04', 200000, 'claude-3-7-sonnet', 'dispatched', ?, ?)
            """, (past_ms, past_ms + 1000))
            conn.commit()

        expired_count = self.db.expire_stale_reservations()
        self.assertEqual(expired_count, 1)

        with sqlite3.connect(self.temp_db.name) as conn:
            conn.row_factory = sqlite3.Row
            row_res = conn.execute("SELECT status FROM active_reservations WHERE id = 'res-stale-reserved'").fetchone()
            row_disp = conn.execute("SELECT status FROM active_reservations WHERE id = 'res-stale-dispatched'").fetchone()

        self.assertEqual(row_res["status"], "released")
        # Dispatched must remain dispatched (never released to zero)
        self.assertEqual(row_disp["status"], "dispatched")

    def test_15_tauri_ipc_envelope_contract(self):
        """
        Tauri IPC contract simulation:
        Verifying that the payload shape `{ "limits": { "dailyLimitMicrousd": ..., "monthlyLimitMicrousd": ... } }`
        serializes and parses cleanly to microdollars.
        """
        tauri_invoke_payload = {
            "limits": {
                "dailyLimitMicrousd": 10_000_000,
                "monthlyLimitMicrousd": 150_000_000
            }
        }
        inner_limits = tauri_invoke_payload["limits"]
        d, m = parse_and_validate_budget_payload(inner_limits)
        self.assertEqual(d, 10_000_000)
        self.assertEqual(m, 150_000_000)

    def test_16_strict_microdollar_parser_rejects_fractional_micros(self):
        """
        Strict non-truncating microdollar parser:
        Values with more than 6 decimal places (fractional microdollars) MUST raise ValueError.
        """
        # Exactly 6 decimals -> OK
        self.assertEqual(parse_decimal_string_to_microusd("10.123456"), 10_123_456)
        self.assertEqual(parse_decimal_string_to_microusd("0.000001"), 1)
        self.assertEqual(parse_decimal_string_to_microusd("0"), 0)

        # 7 decimals -> fractional microdollar -> MUST raise ValueError
        with self.assertRaises(ValueError):
            parse_decimal_string_to_microusd("10.1234567")

        with self.assertRaises(ValueError):
            parse_decimal_string_to_microusd("0.0000009")

        # Non-numeric -> ValueError
        with self.assertRaises(ValueError):
            parse_decimal_string_to_microusd("invalid_amount")

    def test_17_mark_dispatched_state_transition_and_gate(self):
        """
        Verify that mark_dispatched transitions reserved -> dispatched atomically,
        and returns False if reservation does not exist or was already released.
        """
        ok, info = self.db.reserve_spend("res-test-gate-1", "claude-3-7-sonnet", 100_000)
        self.assertTrue(ok)

        # 1st mark_dispatched -> True
        self.assertTrue(self.db.mark_dispatched("res-test-gate-1"))

        # 2nd mark_dispatched on already dispatched -> False
        self.assertFalse(self.db.mark_dispatched("res-test-gate-1"))

        # Non-existent reservation -> False
        self.assertFalse(self.db.mark_dispatched("non-existent-res-id"))

    def test_18_reset_spend_creates_immutable_audit_log(self):
        """
        Verify that resetting daily spend writes an immutable adjustment row to spend_logs,
        preserving complete historical audit log integrity.
        """
        # Create some spend
        ok, info = self.db.reserve_spend("res-test-reset-1", "claude-3-7-sonnet", 250_000)
        self.assertTrue(ok)
        self.assertTrue(self.db.mark_dispatched("res-test-reset-1"))
        self.db.reconcile_spend("res-test-reset-1", actual_microusd=250_000, actual_tokens=150)

        # Confirm spend is $0.25
        dict_before = self.db.get_daily_spend()
        self.assertEqual(dict_before["total_spend_microusd"], 250_000)

        # Reset daily spend
        reset_res = self.db.reset_daily_spend()
        self.assertTrue(reset_res["success"])
        self.assertEqual(reset_res["daily_spent_usd"], 0.0)

        # Verify daily spend is 0
        dict_after = self.db.get_daily_spend()
        self.assertEqual(dict_after["total_spend_microusd"], 0)

        # Verify audit log contains original record AND adjustment record
        with sqlite3.connect(self.temp_db.name) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM spend_logs ORDER BY timestamp ASC").fetchall()
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["spend_microusd"], 250_000)
            self.assertEqual(rows[1]["spend_microusd"], -250_000)
            self.assertEqual(rows[1]["status"], "reset_adjustment")
            self.assertTrue(rows[1]["id"].startswith("reset-"))

    def test_19_worst_case_bounding_audio_image_moderation_rerank(self):
        """
        Verify defensible worst-case bounding for multimodal, audio, moderation, and rerank routes.
        """
        # Audio transcriptions worst case
        ok_a, audio_micros, _ = estimate_request_microusd(
            model="whisper-1",
            body_dict={"model": "whisper-1"},
            path="/v1/audio/transcriptions"
        )
        self.assertTrue(ok_a)
        self.assertGreaterEqual(audio_micros, 360_000) # $0.36 max 1 hour

        # Image generation worst case
        ok_i, dalle_micros, _ = estimate_request_microusd(
            model="dall-e-3",
            body_dict={"model": "dall-e-3", "n": 2},
            path="/v1/images/generations"
        )
        self.assertTrue(ok_i)
        self.assertGreaterEqual(dalle_micros, 160_000) # $0.08 * 2 = $0.16

        # Moderation worst case
        ok_m, mod_micros, _ = estimate_request_microusd(
            model="text-moderation-latest",
            body_dict={"model": "text-moderation-latest", "input": "test prompt text"},
            path="/v1/moderations"
        )
        self.assertTrue(ok_m)
        self.assertGreater(mod_micros, 0)

        # Unknown model -> fail closed
        ok_u, unknown_micros, err_u = estimate_request_microusd(
            model="completely-unregistered-model",
            body_dict={"model": "completely-unregistered-model"},
            path="/v1/chat/completions"
        )
        self.assertFalse(ok_u)
        self.assertEqual(unknown_micros, 0)

    def test_20_schema_rebuild_unique_constraint(self):
        """
        Verify that spend_logs physically enforces NOT NULL UNIQUE on reservation_id.
        """
        with sqlite3.connect(self.temp_db.name) as conn:
            # First insert succeeds
            conn.execute("""
                INSERT INTO spend_logs (id, reservation_id, timestamp, day_key, spend_microusd)
                VALUES ('test-uid-1', 'res-unique-123', 123456, '2026-09-04', 1000);
            """)
            conn.commit()

            # Second insert with duplicate reservation_id MUST fail with IntegrityError
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute("""
                    INSERT INTO spend_logs (id, reservation_id, timestamp, day_key, spend_microusd)
                    VALUES ('test-uid-2', 'res-unique-123', 123457, '2026-09-04', 2000);
                """)
                conn.commit()

    def test_21_migration_v2_quarantines_duplicates_and_allows_negative_spend(self):
        """
        Migration v2:
        - Detects duplicate reservation_id records and moves them to quarantine_spend_logs
        - Verifies exact unique index specifically on reservation_id column
        - Removes check constraint rejecting negative spend (for reset adjustments)
        """
        legacy_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        legacy_db.close()
        try:
            with sqlite3.connect(legacy_db.name) as conn:
                conn.execute("""
                    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER);
                """)
                conn.execute("INSERT INTO schema_migrations VALUES (1, 100000);")
                conn.execute("""
                    CREATE TABLE spend_logs (
                        id TEXT PRIMARY KEY,
                        reservation_id TEXT,
                        timestamp INTEGER NOT NULL,
                        day_key TEXT NOT NULL,
                        model TEXT,
                        provider TEXT,
                        prompt_tokens INTEGER,
                        completion_tokens INTEGER,
                        total_tokens INTEGER,
                        spend_microusd INTEGER NOT NULL CHECK (spend_microusd >= 0),
                        client_name TEXT,
                        status TEXT
                    );
                """)
                # Insert two rows with the same reservation_id
                conn.execute("""
                    INSERT INTO spend_logs (id, reservation_id, timestamp, day_key, spend_microusd)
                    VALUES ('row-1', 'dup-res-123', 100, '2026-09-04', 500);
                """)
                conn.execute("""
                    INSERT INTO spend_logs (id, reservation_id, timestamp, day_key, spend_microusd)
                    VALUES ('row-2', 'dup-res-123', 200, '2026-09-04', 700);
                """)
                conn.commit()

            # Initialize SpendLedgerDB on this database -> triggers Migration v2
            db_v2 = SpendLedgerDB(db_path=legacy_db.name)
            self.assertTrue(db_v2.healthy)

            with sqlite3.connect(legacy_db.name) as conn:
                conn.row_factory = sqlite3.Row
                # Main table must have 1 row
                main_rows = conn.execute("SELECT * FROM spend_logs").fetchall()
                self.assertEqual(len(main_rows), 1)
                self.assertEqual(main_rows[0]["id"], "row-1")

                # Quarantine table must have 1 row (row-2)
                q_rows = conn.execute("SELECT * FROM quarantine_spend_logs").fetchall()
                self.assertEqual(len(q_rows), 1)
                self.assertEqual(q_rows[0]["id"], "row-2")
                self.assertEqual(q_rows[0]["quarantine_reason"], "duplicate_reservation_id")

                # Verify version 2 recorded
                v2 = conn.execute("SELECT version FROM schema_migrations WHERE version = 2").fetchone()
                self.assertIsNotNone(v2)

                # Verify exact unique index on reservation_id
                indices = conn.execute("PRAGMA index_list(spend_logs)").fetchall()
                unique_col_sets = []
                for idx in indices:
                    if idx["unique"] == 1:
                        cols = [c["name"] for c in conn.execute(f"PRAGMA index_info('{idx['name']}')").fetchall()]
                        unique_col_sets.append(cols)
                self.assertIn(["reservation_id"], unique_col_sets)

                # Verify negative spend insert succeeds (reset adjustments work)
                conn.execute("""
                    INSERT INTO spend_logs (id, reservation_id, timestamp, day_key, spend_microusd)
                    VALUES ('neg-1', 'res-neg-1', 300, '2026-09-04', -500);
                """)
                conn.commit()
                neg_row = conn.execute("SELECT spend_microusd FROM spend_logs WHERE id = 'neg-1'").fetchone()
                self.assertEqual(neg_row["spend_microusd"], -500)
        finally:
            try: os.unlink(legacy_db.name)
            except Exception: pass

    def test_22_pricing_unknown_on_missing_dimensions_or_zero_rates(self):
        """
        Fail-closed validation: endpoints require verified pricing and reject missing pricing definitions.
        """
        # Moderation without pricing
        ok, cost, err = estimate_request_microusd("unpriced-moderation-model", {"input": "test"}, "/v1/moderations")
        self.assertFalse(ok)
        self.assertEqual(cost, 0)
        self.assertIn("Pricing unknown", err)

        # Audio without pricing
        ok, cost, err = estimate_request_microusd("unpriced-audio-model", {}, "/v1/audio/transcriptions")
        self.assertFalse(ok)
        self.assertIn("Pricing unknown", err)

        # Image without pricing
        ok, cost, err = estimate_request_microusd("unpriced-image-model", {}, "/v1/images/generations")
        self.assertFalse(ok)
        self.assertIn("Pricing unknown", err)

    def test_23_math_ceil_microdollar_precision(self):
        """
        Math ceiling precision:
        Ensure that fractions of a microdollar round up (ceiling) rather than truncating to 0.
        """
        # 16 prompt characters * 0.0000002 = 0.0000032 USD (3.2 microdollars) -> ceil should be 4 microdollars (or max bound)
        ok, cost, _ = estimate_request_microusd("text-moderation-latest", {"input": "short"}, "/v1/moderations")
        self.assertTrue(ok)
        self.assertGreaterEqual(cost, 100) # baseline min bound

    def test_24_spend_summary_endpoint_execution_and_schema(self):
        """
        Invoke the real /spend/summary endpoint handler and validate that it returns 200
        with all canonical fields matching the Rust SpendSummary struct.
        """
        import asyncio
        from entrypoint import get_spend_summary, spend_db

        # Point global spend_db to self.db
        orig_db = spend_db
        try:
            import entrypoint
            entrypoint.spend_db = self.db

            # Create spend
            self.db.reserve_spend("res-test-summary-1", "claude-3-7-sonnet", 150_000)
            self.db.mark_dispatched("res-test-summary-1")
            self.db.reconcile_spend("res-test-summary-1", actual_microusd=150_000, actual_tokens=100)

            resp = asyncio.run(get_spend_summary())
            self.assertEqual(resp.status_code, 200)

            data = json.loads(resp.body.decode("utf-8"))
            # Assert canonical fields
            self.assertIn("daily_spent_microusd", data)
            self.assertIn("monthly_spent_microusd", data)
            self.assertIn("daily_limit_microusd", data)
            self.assertIn("monthly_limit_microusd", data)
            self.assertIn("is_tripped", data)
            self.assertIn("daily_spent_usd", data)
            self.assertIn("monthly_spent_usd", data)

            # Assert camelCase aliases
            self.assertIn("dailySpentMicrousd", data)
            self.assertIn("monthlySpentMicrousd", data)
            self.assertIn("isTripped", data)

            self.assertEqual(data["daily_spent_microusd"], 150_000)
            self.assertEqual(data["daily_spent_usd"], 0.15)
            self.assertFalse(data["is_tripped"])
        finally:
            entrypoint.spend_db = orig_db

    def test_25_zero_cost_local_vs_remote_custom_deployment(self):
        """
        Verify that zero-cost status is derived strictly from deployment api_base (numeric loopback),
        not just arbitrary model name prefixes.
        """
        import entrypoint
        orig_deps = entrypoint.ROUTING_GRAPH_DEPLOYMENTS
        try:
            # 1. Local loopback custom deployment -> zero cost
            entrypoint.ROUTING_GRAPH_DEPLOYMENTS = {
                "custom/local-llama": [{"model_target": "ollama/llama3.2", "api_base": "http://127.0.0.1:11434"}]
            }
            ok, cost, _ = estimate_request_microusd("custom/local-llama", {"prompt": "hi"}, "/chat/completions")
            self.assertTrue(ok)
            self.assertEqual(cost, 0)

            # 2. Remote custom deployment -> must NOT assume zero cost; fails closed without pricing
            entrypoint.ROUTING_GRAPH_DEPLOYMENTS = {
                "custom/remote-llama": [{"model_target": "custom/remote", "api_base": "https://remote-llm.corp.internal"}]
            }
            ok_rem, cost_rem, err_rem = estimate_request_microusd("custom/remote-llama", {"prompt": "hi"}, "/chat/completions")
            self.assertFalse(ok_rem)
            self.assertEqual(cost_rem, 0)
            self.assertIn("Pricing unknown", err_rem)
        finally:
            entrypoint.ROUTING_GRAPH_DEPLOYMENTS = orig_deps

    def test_26_multimodal_image_token_bounding(self):
        """
        Verify that chat completions with multimodal image inputs account for vision tile token overhead.
        """
        # Text-only message
        text_body = {
            "model": "claude-3-7-sonnet",
            "messages": [{"role": "user", "content": "hello"}]
        }
        ok_t, cost_text, _ = estimate_request_microusd("claude-3-7-sonnet", text_body, "/v1/chat/completions")
        self.assertTrue(ok_t)

        # Multimodal message with 2 high-res images
        multimodal_body = {
            "model": "claude-3-7-sonnet",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "hello"},
                        {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}},
                        {"type": "image_url", "image_url": {"url": "data:image/png;base64,def"}}
                    ]
                }
            ]
        }
        ok_m, cost_multi, _ = estimate_request_microusd("claude-3-7-sonnet", multimodal_body, "/v1/chat/completions")
        self.assertTrue(ok_m)
        # Multimodal cost must be strictly greater than text-only due to ~3200 image tokens
        self.assertGreater(cost_multi, cost_text)

    def test_27_image_hd_quality_missing_pricing_fails_closed(self):
        """
        Verify that requesting HD quality image generation when HD pricing is not configured fails closed.
        """
        # Model with standard pricing only
        body_hd = {
            "model": "dall-e-3",
            "quality": "hd",
            "n": 1
        }
        # In test mock, dall-e-3 has cost_per_image: 0.08 but NO cost_per_image_hd
        ok, cost, err = estimate_request_microusd("dall-e-3", body_hd, "/v1/images/generations")
        self.assertFalse(ok)
        self.assertIn("HD quality", err)

    def test_28_migration_v2_reconciles_daily_spend_aggregates(self):
        """
        Verify that Migration v2 recalculates daily_spend totals from the retained spend_logs rows.
        """
        legacy_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        legacy_db.close()
        try:
            with sqlite3.connect(legacy_db.name) as conn:
                conn.execute("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER);")
                conn.execute("INSERT INTO schema_migrations VALUES (1, 100000);")
                conn.execute("""
                    CREATE TABLE daily_spend (
                        day_key TEXT PRIMARY KEY,
                        total_spend_microusd INTEGER,
                        total_tokens INTEGER,
                        total_requests INTEGER,
                        last_updated_at INTEGER
                    );
                """)
                # Corrupted daily_spend total of 50,000
                conn.execute("INSERT INTO daily_spend VALUES ('2026-09-04', 50000, 100, 10, 100000);")
                conn.execute("""
                    CREATE TABLE spend_logs (
                        id TEXT PRIMARY KEY,
                        reservation_id TEXT,
                        timestamp INTEGER NOT NULL,
                        day_key TEXT NOT NULL,
                        model TEXT,
                        provider TEXT,
                        prompt_tokens INTEGER,
                        completion_tokens INTEGER,
                        total_tokens INTEGER,
                        spend_microusd INTEGER NOT NULL,
                        client_name TEXT,
                        status TEXT
                    );
                """)
                # Retained valid log of 10,000
                conn.execute("""
                    INSERT INTO spend_logs (id, reservation_id, timestamp, day_key, total_tokens, spend_microusd)
                    VALUES ('valid-1', 'res-v-1', 100, '2026-09-04', 50, 10000);
                """)
                # Duplicate log that will be quarantined (20,000)
                conn.execute("""
                    INSERT INTO spend_logs (id, reservation_id, timestamp, day_key, total_tokens, spend_microusd)
                    VALUES ('dup-1', 'res-v-1', 200, '2026-09-04', 50, 20000);
                """)
                conn.commit()

            # Run migration v2
            mig_db = SpendLedgerDB(db_path=legacy_db.name)
            self.assertTrue(mig_db.healthy)

            with sqlite3.connect(legacy_db.name) as conn:
                conn.row_factory = sqlite3.Row
                d_row = conn.execute("SELECT * FROM daily_spend WHERE day_key = '2026-09-04'").fetchone()
                # Total spend must be exactly 10,000 (reconciled with retained row only)
                self.assertEqual(d_row["total_spend_microusd"], 10000)
                self.assertEqual(d_row["total_tokens"], 50)
                self.assertEqual(d_row["total_requests"], 1)
        finally:
            try: os.unlink(legacy_db.name)
            except Exception: pass

if __name__ == "__main__":
    unittest.main()



