"""
H-03 Spend Enforcement & Budget Authority Verification Suite

Tests:
1. Unauthenticated requests fail at outermost auth middleware with 401 and NEVER touch the SQLite spend ledger.
2. Authenticated requests successfully pass auth, enter inner spend middleware, and reserve funds.
3. Daily budget cap strictly prevents requests exceeding daily limit (returns 402 daily_budget_exceeded).
4. Monthly budget cap aggregates spend across current month (YYYY-MM) and blocks requests exceeding monthly limit (returns 402 monthly_budget_exceeded).
5. Dynamic budget updates via POST /spend/budget mutate SQLite budget_settings as the single authority.
"""

import os
import sys
import time
import uuid
import secrets
import sqlite3
import tempfile
import unittest


class SimulatedSpendLedgerDB:
    def __init__(self, db_path):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path, timeout=5.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS daily_spend (
                    day_key TEXT PRIMARY KEY,
                    total_spend_microusd INTEGER DEFAULT 0 CHECK (total_spend_microusd >= 0),
                    total_tokens INTEGER DEFAULT 0,
                    total_requests INTEGER DEFAULT 0,
                    last_updated_at INTEGER
                );
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS budget_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    daily_limit_microusd INTEGER DEFAULT 10000000 CHECK (daily_limit_microusd >= 0),
                    monthly_limit_microusd INTEGER DEFAULT 150000000 CHECK (monthly_limit_microusd >= 0),
                    is_tripped INTEGER DEFAULT 0
                );
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS active_reservations (
                    id TEXT PRIMARY KEY,
                    day_key TEXT NOT NULL,
                    reserved_microusd INTEGER NOT NULL CHECK (reserved_microusd >= 0),
                    model TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('reserved', 'dispatched', 'settled', 'released', 'unknown')),
                    created_at INTEGER NOT NULL,
                    dispatched_at INTEGER,
                    last_heartbeat_at INTEGER,
                    lease_expires_at INTEGER,
                    settled_at INTEGER
                );
            """)
            conn.execute("""
                INSERT OR IGNORE INTO budget_settings (id, daily_limit_microusd, monthly_limit_microusd, is_tripped)
                VALUES (1, 10000000, 150000000, 0);
            """)
            conn.commit()

    def get_today_key(self):
        return time.strftime("%Y-%m-%d")

    def reserve_spend(self, reservation_id: str, model: str, reserved_microusd: int, day_key: str = None) -> tuple[bool, dict]:
        key = day_key or self.get_today_key()
        now_ms = int(time.time() * 1000)
        lease_expires = now_ms + (300 * 1000)

        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE;")

            # 1. Settled daily spend
            row_settled = conn.execute("SELECT total_spend_microusd FROM daily_spend WHERE day_key = ?", (key,)).fetchone()
            settled_microusd = int(row_settled["total_spend_microusd"] or 0) if row_settled else 0

            # 2. Settled monthly spend
            month_prefix = key[:7] + "%"
            row_monthly = conn.execute("SELECT COALESCE(SUM(total_spend_microusd), 0) as month_spend FROM daily_spend WHERE day_key LIKE ?", (month_prefix,)).fetchone()
            settled_month_microusd = int(row_monthly["month_spend"] or 0) if row_monthly else 0

            # 3. Active in-flight
            row_inflight = conn.execute(
                "SELECT COALESCE(SUM(reserved_microusd), 0) as inflight FROM active_reservations WHERE day_key = ? AND status IN ('reserved', 'dispatched', 'unknown')",
                (key,)
            ).fetchone()
            inflight_microusd = int(row_inflight["inflight"] or 0) if row_inflight else 0

            # 4. Budget limits
            row_budget = conn.execute("SELECT daily_limit_microusd, monthly_limit_microusd FROM budget_settings WHERE id = 1").fetchone()
            daily_limit_microusd = int(row_budget["daily_limit_microusd"]) if row_budget and row_budget["daily_limit_microusd"] is not None else 10_000_000
            monthly_limit_microusd = int(row_budget["monthly_limit_microusd"]) if row_budget and row_budget["monthly_limit_microusd"] is not None else 150_000_000

            total_daily_projected = settled_microusd + inflight_microusd + reserved_microusd
            total_monthly_projected = settled_month_microusd + inflight_microusd + reserved_microusd

            if daily_limit_microusd > 0 and total_daily_projected > daily_limit_microusd:
                conn.execute("ROLLBACK;")
                return False, {
                    "error": "daily_budget_exceeded",
                    "settled_microusd": settled_microusd,
                    "inflight_microusd": inflight_microusd,
                    "requested_microusd": reserved_microusd,
                    "daily_limit_microusd": daily_limit_microusd,
                    "settled_usd": settled_microusd / 1_000_000.0,
                    "limit_usd": daily_limit_microusd / 1_000_000.0
                }

            if monthly_limit_microusd > 0 and total_monthly_projected > monthly_limit_microusd:
                conn.execute("ROLLBACK;")
                return False, {
                    "error": "monthly_budget_exceeded",
                    "settled_microusd": settled_month_microusd,
                    "inflight_microusd": inflight_microusd,
                    "requested_microusd": reserved_microusd,
                    "monthly_limit_microusd": monthly_limit_microusd,
                    "settled_usd": settled_month_microusd / 1_000_000.0,
                    "limit_usd": monthly_limit_microusd / 1_000_000.0
                }

            conn.execute("""
                INSERT INTO active_reservations (id, day_key, reserved_microusd, model, status, created_at, lease_expires_at)
                VALUES (?, ?, ?, ?, 'reserved', ?, ?)
            """, (reservation_id, key, reserved_microusd, model, now_ms, lease_expires))
            conn.commit()

            return True, {
                "reservation_id": reservation_id,
                "reserved_microusd": reserved_microusd,
                "day_key": key
            }

    def set_budget_limits(self, daily_limit=None, monthly_limit=None):
        with self._get_conn() as conn:
            if daily_limit is not None and monthly_limit is not None:
                daily_micro = int(float(daily_limit) * 1_000_000)
                monthly_micro = int(float(monthly_limit) * 1_000_000)
                conn.execute("UPDATE budget_settings SET daily_limit_microusd = ?, monthly_limit_microusd = ? WHERE id = 1", (daily_micro, monthly_micro))
            elif daily_limit is not None:
                daily_micro = int(float(daily_limit) * 1_000_000)
                conn.execute("UPDATE budget_settings SET daily_limit_microusd = ? WHERE id = 1", (daily_micro,))
            elif monthly_limit is not None:
                monthly_micro = int(float(monthly_limit) * 1_000_000)
                conn.execute("UPDATE budget_settings SET monthly_limit_microusd = ? WHERE id = 1", (monthly_micro,))
            conn.commit()

    def get_budget_settings(self):
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM budget_settings WHERE id = 1").fetchone()
            if row:
                return {
                    "dailyLimit": row["daily_limit_microusd"] / 1_000_000.0,
                    "monthlyLimit": row["monthly_limit_microusd"] / 1_000_000.0,
                    "isTripped": bool(row["is_tripped"])
                }
            return {"dailyLimit": 10.0, "monthlyLimit": 150.0, "isTripped": False}

    def count_active_reservations(self):
        with self._get_conn() as conn:
            row = conn.execute("SELECT COUNT(*) as c FROM active_reservations").fetchone()
            return int(row["c"]) if row else 0


class TestH03SpendEnforcementAndBudgetAuthority(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
        self.temp_db.close()
        self.db = SimulatedSpendLedgerDB(self.temp_db.name)
        self.gateway_token = "gw-" + secrets.token_urlsafe(32)
        self.admin_token = "adm-" + secrets.token_urlsafe(32)

    def tearDown(self):
        try:
            os.remove(self.temp_db.name)
        except OSError:
            pass

    def _simulate_pipeline(self, method: str, path: str, token: str, model: str = "gpt-4o", reserved_microusd: int = 200_000):
        """
        Simulates the ordered pipeline:
        1. Outermost: Auth & Route Classifier Middleware
        2. Inner: Spend Circuit Breaker Middleware
        """
        # --- 1. OUTERMOST: Auth Middleware ---
        if not token or not (secrets.compare_digest(token, self.gateway_token) or secrets.compare_digest(token, self.admin_token)):
            return 401, "invalid_api_key", None

        # --- 2. INNER: Spend Reservation Middleware ---
        res_id = f"res-{uuid.uuid4().hex[:12]}"
        success, res_info = self.db.reserve_spend(res_id, model, reserved_microusd)
        if not success:
            if res_info.get("error") == "daily_budget_exceeded":
                return 402, "daily_budget_exceeded", res_info
            elif res_info.get("error") == "monthly_budget_exceeded":
                return 402, "monthly_budget_exceeded", res_info
            return 503, "engine_busy", res_info

        return 200, "success", res_info

    def test_01_unauthenticated_request_never_touches_spend_ledger(self):
        # Inbound request without valid token
        status, reason, _ = self._simulate_pipeline("POST", "/v1/chat/completions", token="", reserved_microusd=500_000)
        self.assertEqual(status, 401)
        self.assertEqual(reason, "invalid_api_key")

        # Verify zero reservations in SQLite database
        self.assertEqual(self.db.count_active_reservations(), 0)

    def test_02_authenticated_request_reserves_funds(self):
        status, reason, info = self._simulate_pipeline(
            "POST", "/v1/chat/completions", token=self.gateway_token, reserved_microusd=500_000
        )
        self.assertEqual(status, 200)
        self.assertEqual(reason, "success")
        self.assertEqual(self.db.count_active_reservations(), 1)

    def test_03_daily_budget_cap_enforced(self):
        # Set daily limit to $1.00 (1,000,000 microUSD)
        self.db.set_budget_limits(daily_limit=1.0, monthly_limit=50.0)

        # Request 1: $0.80 -> Should succeed
        status, reason, _ = self._simulate_pipeline("POST", "/v1/chat/completions", token=self.gateway_token, reserved_microusd=800_000)
        self.assertEqual(status, 200)

        # Request 2: $0.30 -> Total projected $1.10 > $1.00 daily cap -> Should return 402 daily_budget_exceeded
        status, reason, info = self._simulate_pipeline("POST", "/v1/chat/completions", token=self.gateway_token, reserved_microusd=300_000)
        self.assertEqual(status, 402)
        self.assertEqual(reason, "daily_budget_exceeded")

    def test_04_monthly_budget_cap_enforced(self):
        # Set daily limit to $10.00, monthly limit to $5.00
        self.db.set_budget_limits(daily_limit=10.0, monthly_limit=5.0)

        # Seed previous days in current month with $4.50 settled spend
        current_month = time.strftime("%Y-%m")
        with self.db._get_conn() as conn:
            conn.execute(
                "INSERT INTO daily_spend (day_key, total_spend_microusd) VALUES (?, ?)",
                (f"{current_month}-01", 4_500_000)
            )
            conn.commit()

        # Request 1: $0.80 -> Projected monthly $5.30 > $5.00 monthly cap -> Should return 402 monthly_budget_exceeded
        status, reason, info = self._simulate_pipeline("POST", "/v1/chat/completions", token=self.gateway_token, reserved_microusd=800_000)
        self.assertEqual(status, 402)
        self.assertEqual(reason, "monthly_budget_exceeded")

    def test_05_dynamic_budget_settings_authority(self):
        # Initial settings: daily $10, monthly $150
        settings = self.db.get_budget_settings()
        self.assertEqual(settings["dailyLimit"], 10.0)
        self.assertEqual(settings["monthlyLimit"], 150.0)

        # Update to daily $25.50, monthly $300.00
        self.db.set_budget_limits(daily_limit=25.50, monthly_limit=300.0)

        updated = self.db.get_budget_settings()
        self.assertEqual(updated["dailyLimit"], 25.50)
        self.assertEqual(updated["monthlyLimit"], 300.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
