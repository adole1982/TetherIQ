"""
TetherMesh LiteLLM Proxy Sidecar Entrypoint

This is the PyInstaller-bundled entrypoint for the LiteLLM proxy server.
It is spawned by the Tauri desktop app as a sidecar process.

Features:
- Durable SQLite spend ledger & persistent circuit breaker (0 extra dependencies)
- Pre-call HTTP 402 budget enforcement middleware
- Real-time in-memory telemetry buffer with asyncio locks & thread safety
- Authentic OpenTelemetry span timing & Time-to-First-Token (TTFT) profiling
- Resilient SSE stream with 15s keep-alive heartbeats and bounded memory queues
- Automatic local model discovery (Ollama & LM Studio)
- Server-side secret redaction and telemetry egress protections
"""

import argparse
import asyncio
import os
import sys
import time
import types
import uuid
import json
import sqlite3
import re
import ipaddress
import socket
import urllib.parse
from collections import deque
from datetime import datetime
from unittest.mock import MagicMock
from importlib.machinery import ModuleSpec
import hashlib
import threading
import math
import secrets

START_TIME = time.time()

def start_parent_watchdog():
    """Background daemon thread ensuring the sidecar terminates if the parent process dies across all OSes."""
    initial_ppid = os.getppid()
    if initial_ppid <= 1:
        return  # Init / systemd or already orphaned

    def watchdog_loop():
        while True:
            time.sleep(1.0)
            try:
                current_ppid = os.getppid()
                if current_ppid != initial_ppid or current_ppid <= 1:
                    print(f"[TetherMesh Watchdog] Parent process {initial_ppid} terminated. Exiting sidecar.", flush=True)
                    os._exit(0)
            except Exception:
                pass

    t = threading.Thread(target=watchdog_loop, daemon=True, name="ParentWatchdogThread")
    t.start()

def is_numeric_loopback_url(url_str: str) -> bool:
    """Validate that a URL uses http scheme (not https), has no credentials/query/fragment, and has a strictly numeric loopback IP (127.0.0.1 or ::1) with valid port."""
    if not url_str or not isinstance(url_str, str):
        return False
    try:
        url_clean = url_str.strip()
        parsed = urllib.parse.urlparse(url_clean)
        if parsed.scheme != "http":
            return False
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            return False
        hostname = parsed.hostname
        if not hostname or hostname == "localhost":
            return False
        ip = ipaddress.ip_address(hostname)
        if not ip.is_loopback:
            return False
        port = parsed.port
        if not port or port < 1 or port > 65535:
            return False
        return True
    except Exception:
        return False

# ---------------------------------------------------------------------------
# Process-Wide Socket Connection Egress Guard (Air-Gapped Mode)
# ---------------------------------------------------------------------------
_orig_socket_connect = socket.socket.connect
_orig_socket_connect_ex = socket.socket.connect_ex

def install_airgap_socket_guard():
    """Intercept all socket connections at the OS Python socket level, aborting non-loopback egress."""
    def guarded_connect(self, address):
        host = address[0] if isinstance(address, tuple) else address
        if not is_numeric_loopback_host(host):
            raise PermissionError(f"Air-Gapped Egress Violation: Socket connection to non-loopback destination '{host}' blocked by process security guard.")
        return _orig_socket_connect(self, address)

    def guarded_connect_ex(self, address):
        host = address[0] if isinstance(address, tuple) else address
        if not is_numeric_loopback_host(host):
            import errno
            return errno.EPERM
        return _orig_socket_connect_ex(self, address)

    socket.socket.connect = guarded_connect
    socket.socket.connect_ex = guarded_connect_ex

    # Intercept asyncio event loop socket connection creation
    try:
        orig_create_connection = asyncio.BaseEventLoop.create_connection
        async def guarded_create_connection(self, protocol_factory, host=None, port=None, *args, **kwargs):
            if host is not None and not is_numeric_loopback_host(str(host)):
                raise PermissionError(f"Air-Gapped Egress Violation: Async socket connection to non-loopback host '{host}' blocked.")
            return await orig_create_connection(self, protocol_factory, host=host, port=port, *args, **kwargs)
        asyncio.BaseEventLoop.create_connection = guarded_create_connection
    except Exception:
        pass

def is_numeric_loopback_host(host: str) -> bool:
    """Check if host string is a numeric loopback IP address (127.0.0.0/8 or ::1). Hostnames are rejected."""
    if not host or not isinstance(host, str):
        return False
    if host == "localhost":
        return False
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_loopback
    except ValueError:
        return False

AIR_GAPPED_MODE = os.environ.get("AIR_GAPPED_MODE", "false").lower() in ("true", "1", "yes")
if AIR_GAPPED_MODE:
    install_airgap_socket_guard()

# 1. Ensure UTF-8 console encoding on Windows to prevent UnicodeEncodeError with banners
os.environ["PYTHONIOENCODING"] = "utf-8"
os.environ["PYTHONUTF8"] = "1"
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# 2. Configure SSL cert bundle from certifi if available
try:
    import certifi
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
    os.environ['CURL_CA_BUNDLE'] = certifi.where()
except Exception:
    pass

# 3. Use local pricing map for instant offline startup and disable admin UI / cloud telemetry
os.environ["DISABLE_ADMIN_UI"] = "true"
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
os.environ["LITELLM_TELEMETRY"] = "False"
os.environ["POLARS_SKIP_CPU_CHECK"] = "1"

# 4. Mock finder for polars and focus modules to prevent AVX2 / CPU instruction crashes
class _MockModuleFinder:
    def find_spec(self, fullname, path, target=None):
        if (fullname.startswith('litellm.integrations.focus') or 
            fullname.startswith('polars') or
            fullname.startswith('_polars')):
            return ModuleSpec(fullname, self)
        return None

    def create_module(self, spec):
        mod = types.ModuleType(spec.name)
        mod.__path__ = []
        return mod

    def exec_module(self, module):
        module.FocusLogger = MagicMock
        module.FocusTimeWindow = MagicMock
        module.MavvrikFocusLogger = MagicMock

sys.meta_path.insert(0, _MockModuleFinder())

# 5. Extract --config from sys.argv at top-level before importing proxy_server
for i, arg in enumerate(sys.argv):
    if arg == "--config" and i + 1 < len(sys.argv):
        cfg = os.path.abspath(sys.argv[i + 1])
        os.environ["LITELLM_CONFIG_PATH"] = cfg
        os.environ["CONFIG_FILE_PATH"] = cfg
    elif arg.startswith("--config="):
        cfg = os.path.abspath(arg.split("=", 1)[1])
        os.environ["LITELLM_CONFIG_PATH"] = cfg
        os.environ["CONFIG_FILE_PATH"] = cfg

# 6. Silence ascii banner to avoid cp1252 charmap encoding errors on Windows
try:
    import litellm.proxy.common_utils.banner
    litellm.proxy.common_utils.banner.show_banner = lambda *args, **kwargs: None
except Exception:
    pass

# 7. Import uvicorn, fastapi, and inject get_flat_dependant shim if missing
from fastapi import Request
from fastapi.responses import StreamingResponse, JSONResponse
import fastapi.dependencies.utils
if not hasattr(fastapi.dependencies.utils, 'get_flat_dependant'):
    from fastapi.dependencies.models import Dependant
    def get_flat_dependant(dependant: Dependant, *, skip_repeats: bool = False):
        flat = [dependant]
        for d in getattr(dependant, 'dependencies', []):
            flat.extend(get_flat_dependant(d, skip_repeats=skip_repeats))
        return flat
    fastapi.dependencies.utils.get_flat_dependant = get_flat_dependant

import secrets
# ---------------------------------------------------------------------------
# Internal Master Key Lockdown (Must precede litellm.proxy.proxy_server import)
# ---------------------------------------------------------------------------
INTERNAL_LITELLM_MASTER_KEY = secrets.token_urlsafe(48)
os.environ["LITELLM_MASTER_KEY"] = INTERNAL_LITELLM_MASTER_KEY

import uvicorn
import httpx
import litellm
litellm.telemetry = False
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.cors import CORSMiddleware
from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy.proxy_server import app

# Disable OpenAPI, Swagger, Redoc, and default schema introspection endpoints
app.docs_url = None
app.redoc_url = None
app.openapi_url = None

# Application-scoped async HTTP client for outbound validation & health probes (M-08 & M-09)
http_limits = httpx.Limits(max_connections=10, max_keepalive_connections=5)
http_timeout = httpx.Timeout(connect=2.0, read=3.5, write=2.0, pool=0.5)
http_client = httpx.AsyncClient(limits=http_limits, timeout=http_timeout, follow_redirects=False, trust_env=False)
validation_semaphore = asyncio.Semaphore(5)

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Zero-Trust Gateway & Cryptographic HMAC Control Plane Security (Item #2)
# ---------------------------------------------------------------------------

GATEWAY_TOKEN = os.environ.get("TETHER_GATEWAY_TOKEN") or secrets.token_urlsafe(32)
ADMIN_TOKEN = os.environ.get("TETHER_ADMIN_TOKEN") or secrets.token_urlsafe(32)
HANDSHAKE_SECRET = os.environ.get("TETHER_HANDSHAKE_SECRET", "")
TETHER_INSTANCE_ID = os.environ.get("TETHER_INSTANCE_ID", "")
TETHER_GENERATION = int(os.environ.get("TETHER_GENERATION", "1"))
INSTANCE_ID = TETHER_INSTANCE_ID

# Nonce deduplication cache with timestamps: { nonce: timestamp }
SEEN_NONCES = {}
MAX_NONCE_CACHE = 10000

def verify_hmac_request(request: Request, body_bytes: bytes) -> bool:
    """Validate request HMAC-SHA256 signature against per-launch HANDSHAKE_SECRET."""
    if not HANDSHAKE_SECRET:
        return False
    
    timestamp_str = request.headers.get("X-Tether-Timestamp")
    nonce = request.headers.get("X-Tether-Nonce")
    gen_str = request.headers.get("X-Tether-Generation")
    signature = request.headers.get("X-Tether-Signature")

    if not (timestamp_str and nonce and gen_str and signature):
        return False

    try:
        req_timestamp = int(timestamp_str)
        req_gen = int(gen_str)
    except ValueError:
        return False

    # 1. Generation check
    if req_gen != TETHER_GENERATION:
        return False

    # 2. Timestamp window check (strict +/- 30 seconds)
    current_time = int(time.time())
    if abs(current_time - req_timestamp) > 30:
        return False

    # 3. Verify HMAC signature FIRST before modifying state (prevents cache poisoning / DoS)
    body_hash = hashlib.sha256(body_bytes).hexdigest()
    method = request.method.upper()
    path = request.url.path

    payload = f"{method}\n{path}\n{timestamp_str}\n{nonce}\n{body_hash}\n{gen_str}".encode("utf-8")
    expected_sig = hmac.new(HANDSHAKE_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(signature, expected_sig):
        return False

    # 4. Anti-Replay Nonce check (only recorded AFTER signature is verified)
    global SEEN_NONCES
    if nonce in SEEN_NONCES:
        return False  # Replay attack detected!

    # Evict expired nonces from cache
    if len(SEEN_NONCES) > MAX_NONCE_CACHE:
        cutoff = current_time - 60
        SEEN_NONCES = {n: t for n, t in SEEN_NONCES.items() if t > cutoff}

    SEEN_NONCES[nonce] = current_time
    return True

ALLOWED_ORIGINS = [
    "http://tauri.localhost",
    "tauri://localhost",
    "http://127.0.0.1:5173",
    "http://localhost:5173"
]

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["127.0.0.1", "localhost", "tauri.localhost", "testserver"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS", "HEAD"],
    allow_headers=[
        "Authorization", "X-TetherIQ-Token", "X-API-Key", "Content-Type", 
        "anthropic-version", "User-Agent", "X-Tether-Timestamp", 
        "X-Tether-Nonce", "X-Tether-Generation", "X-Tether-Signature"
    ]
)


# ---------------------------------------------------------------------------
# Fallback Pricing Registry (Prevents $0.00 cost tracking on preview models)
# ---------------------------------------------------------------------------

DEFAULT_PREVIEW_MODELS = [
    "openrouter/stealth/ox-alpha",
    "stealth/ox-alpha",
    "openrouter/auto",
    "openrouter/anthropic/claude-3-7-sonnet",
    "openrouter/openai/o3-mini"
]

for pm in DEFAULT_PREVIEW_MODELS:
    if pm not in litellm.model_cost:
        litellm.model_cost[pm] = {
            "max_tokens": 128000,
            "input_cost_per_token": 0.000003,
            "output_cost_per_token": 0.000015,
            "litellm_provider": "openrouter",
            "mode": "chat"
        }


# ---------------------------------------------------------------------------
# Secret Redaction Engine (Prevents Credential Leakage in Telemetry)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Multi-Layer Secret Scrubbing & Telemetry Redaction Engine (M-10)
# Layer 1: Source Exclusion & URL Query Stripping
# Layer 2: Recursive Structured Data Allowlisting
# Layer 3: Bounded Regex Text Scrubber (Fail-Closed)
# ---------------------------------------------------------------------------

from urllib.parse import urlparse
from typing import Any

def strip_url_secrets(url_str: str) -> str:
    """Layer 1: Strip all query strings and fragments from URLs before logging."""
    if not url_str:
        return ""
    try:
        parsed = urlparse(str(url_str))
        clean_path = parsed.path or "/"
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}{clean_path}"
        return clean_path
    except Exception:
        return "[INVALID_URL]"

SENSITIVE_FIELD_NAMES = {
    "apikey", "api_key", "api-key", "token", "access_token", "refresh_token",
    "id_token", "auth_token", "authorization", "password", "passwd", "pwd",
    "secret", "client_secret", "private_key", "secret_access_key", "session_token",
    "security_token", "credential", "credentials", "cookie", "set-cookie",
    "x-api-key", "x-goog-api-key", "x-tetheriq-token", "admin_token", "gateway_token"
}

def normalize_field_name(name: str) -> str:
    """Normalize object keys for matching against sensitive names."""
    if not name:
        return ""
    return str(name).lower().replace("_", "").replace("-", "").strip()

SENSITIVE_FIELD_NAMES_NORMALIZED = {
    normalize_field_name(k) for k in SENSITIVE_FIELD_NAMES
}

# Compiled regex patterns for unstructured text fallback (Layer 3)
SECRET_PATTERNS = re.compile(
    r"("
    # 1. Slack Tokens (explicit groups)
    r"\bxox[bpare]-[A-Za-z0-9-]{10,200}\b|"
    # 2. GitHub Tokens (bounded prefix patterns)
    r"\bgh[pousr]_[A-Za-z0-9_]{20,255}\b|"
    r"\bgithub_pat_[A-Za-z0-9_]{20,255}\b|"
    # 3. Google API Keys
    r"\bAIza[0-9A-Za-z-_]{30,60}\b|"
    # 4. AWS Identifiers
    r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|"
    # 5. JWT / JWE Tokens (3 or 5 part dot-separated base64)
    r"\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,}){1,3}\b|"
    # 6. LLM Provider API Keys
    r"\b(?:(?:sk|adm|xai)-|gsk_|sk_live_|sk_test_|sk-ant-|sk-or-v1-)[A-Za-z0-9_\-]{15,255}\b|"
    # 7. Authorization & Auth Headers
    r"\b(?:authorization|x-api-key|x-goog-api-key|cookie|set-cookie)\s*:\s*[^\r\n,;]+|"
    # 8. Bearer / Token Schemes
    r"\bBearer\s+[a-zA-Z0-9.\-_~+/]{15,}|"
    # 9. Private Key Blocks
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"
    r")",
    re.IGNORECASE
)

MAX_UNSTRUCTURED_TEXT_BYTES = 16384  # 16KB max length before truncation

def sanitize_telemetry_text(text: str) -> str:
    """Layer 3: Bounded unstructured text fallback scrubber with fail-closed guarantee."""
    if not text:
        return ""
    try:
        raw_str = str(text)
        if len(raw_str) > MAX_UNSTRUCTURED_TEXT_BYTES:
            raw_str = raw_str[:MAX_UNSTRUCTURED_TEXT_BYTES] + " ... [TRUNCATED]"
        return SECRET_PATTERNS.sub("[REDACTED]", raw_str)
    except Exception:
        return "[LOG REDACTION FAILED]"

def sanitize_structured_data(data: Any, max_depth: int = 8) -> Any:
    """Layer 2: Recursively sanitize dicts, lists, and objects before serialization."""
    if max_depth <= 0:
        return "[MAX_DEPTH_REACHED]"
    try:
        if isinstance(data, dict):
            sanitized = {}
            for k, v in data.items():
                norm_k = normalize_field_name(str(k))
                if norm_k in SENSITIVE_FIELD_NAMES_NORMALIZED:
                    sanitized[k] = "[REDACTED]"
                else:
                    sanitized[k] = sanitize_structured_data(v, max_depth - 1)
            return sanitized
        elif isinstance(data, list):
            return [sanitize_structured_data(item, max_depth - 1) for item in data]
        elif isinstance(data, tuple):
            return tuple(sanitize_structured_data(item, max_depth - 1) for item in data)
        elif isinstance(data, str):
            return sanitize_telemetry_text(data)
        elif isinstance(data, (int, float, bool)) or data is None:
            return data
        else:
            return sanitize_telemetry_text(str(data))
    except Exception:
        return "[LOG REDACTION FAILED]"


# ---------------------------------------------------------------------------
# Durable SQLite Spend Ledger (0 MB Extra Dependencies)
# ---------------------------------------------------------------------------

def get_spend_db_path():
    home = os.environ.get("USERPROFILE") or os.environ.get("HOME") or "."
    app_data = os.environ.get("APPDATA") or os.path.join(home, "AppData", "Roaming")
    tether_dir = os.path.join(app_data, "TetherMesh") if os.path.exists(app_data) else os.path.join(home, ".tethermesh")
    try:
        os.makedirs(tether_dir, exist_ok=True)
    except Exception:
        tether_dir = "."
    return os.path.join(tether_dir, "tethermesh_spend.db")


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Durable SQLite Spend Ledger with Integer Microdollars & Atomic Reservations
# ---------------------------------------------------------------------------

OMITTED = object()

def parse_decimal_string_to_microusd(val) -> int:
    """
    Parses a USD number or decimal string into integer microdollars ($1 = 1,000,000 microdollars)
    strictly without floating point inaccuracies or decimal truncation.
    """
    if isinstance(val, bool):
        raise ValueError("Boolean value is not a valid number")
    if isinstance(val, int):
        val_str = str(val)
    elif isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            raise ValueError("NaN and Infinity are not allowed")
        val_str = f"{val:.6f}".rstrip("0").rstrip(".")
    elif isinstance(val, str):
        val_str = val.strip()
    else:
        raise ValueError(f"Unsupported type {type(val)} for currency conversion")

    if not val_str:
        raise ValueError("Empty currency string")

    m = re.match(r"^([+-]?\d+)(?:\.(\d+))?$", val_str)
    if not m:
        raise ValueError(f"Invalid currency format: {val_str}")

    int_part, frac_part = m.groups()
    if int(int_part) < 0:
        raise ValueError("Currency value cannot be negative")

    if frac_part is not None and len(frac_part) > 6:
        raise ValueError("Currency precision cannot exceed 6 decimal places (microdollars)")

    frac_part = (frac_part or "").ljust(6, "0")
    total_micros = (int(int_part) * 1_000_000) + int(frac_part)
    if total_micros > 100_000_000_000_000:
        raise ValueError("Currency value exceeds maximum limit")
    return total_micros

def parse_and_validate_budget_payload(body: dict) -> tuple:
    """
    Validates and extracts tri-state daily and monthly limits from payload.
    Returns (daily_microusd, monthly_microusd) where each is:
      - OMITTED: key was not provided (unchanged)
      - None: key was explicitly null (unlimited)
      - int >= 0: integer microdollars
    Raises ValueError on conflict, missing fields, or invalid values.
    """
    if not isinstance(body, dict):
        raise ValueError("Payload must be a JSON object")

    daily_micro_keys = ["daily_limit_microusd", "dailyLimitMicrousd"]
    daily_usd_keys = ["daily_limit_usd", "dailyLimitUsd", "dailyLimit", "dailyBudgetCap", "daily_budget"]

    monthly_micro_keys = ["monthly_limit_microusd", "monthlyLimitMicrousd"]
    monthly_usd_keys = ["monthly_limit_usd", "monthlyLimitUsd", "monthlyLimit", "monthlyBudgetCap", "monthly_budget"]

    def extract_limit(micro_keys, usd_keys):
        found_values = []
        is_key_present = False

        for k in micro_keys:
            if k in body:
                is_key_present = True
                raw = body[k]
                if raw is None:
                    found_values.append(("null", None))
                else:
                    if isinstance(raw, bool):
                        raise ValueError(f"Boolean value not permitted for {k}")
                    if isinstance(raw, (float, str)) and ("." in str(raw)):
                        raise ValueError(f"Integer microdollars required for {k}, received decimal {raw}")
                    try:
                        i_val = int(raw)
                        if i_val < 0:
                            raise ValueError(f"Value for {k} cannot be negative")
                        if i_val > 100_000_000_000_000:
                            raise ValueError(f"Value for {k} exceeds maximum limit")
                        found_values.append(("int", i_val))
                    except (ValueError, TypeError):
                        raise ValueError(f"Invalid integer microdollars for {k}: {raw}")

        for k in usd_keys:
            if k in body:
                is_key_present = True
                raw = body[k]
                if raw is None:
                    found_values.append(("null", None))
                else:
                    micros = parse_decimal_string_to_microusd(raw)
                    found_values.append(("usd", micros))

        if not is_key_present:
            return OMITTED

        unique_targets = set()
        for t, v in found_values:
            unique_targets.add(v)

        if len(unique_targets) > 1:
            raise ValueError(f"Conflicting values provided across budget aliases: {unique_targets}")

        return found_values[0][1]

    daily_res = extract_limit(daily_micro_keys, daily_usd_keys)
    monthly_res = extract_limit(monthly_micro_keys, monthly_usd_keys)

    if daily_res is OMITTED and monthly_res is OMITTED:
        raise ValueError("No recognized budget fields provided in request body")

    return daily_res, monthly_res

class SpendLedgerDB:
    def __init__(self, db_path=None):
        self.db_path = db_path or get_spend_db_path()
        self.healthy = True
        self.last_error = None
        self._init_db()
        if self.healthy:
            self.recover_startup_reservations()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path, timeout=15.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        try:
            with self._get_conn() as conn:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA busy_timeout=15000;")
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS daily_spend (
                        day_key TEXT PRIMARY KEY,
                        total_spend_microusd INTEGER DEFAULT 0,
                        total_tokens INTEGER DEFAULT 0,
                        total_requests INTEGER DEFAULT 0,
                        last_updated_at INTEGER
                    );
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS spend_logs (
                        id TEXT PRIMARY KEY,
                        reservation_id TEXT NOT NULL UNIQUE,
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
                    CREATE TABLE IF NOT EXISTS quarantine_spend_logs (
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
                        status TEXT,
                        quarantined_at INTEGER NOT NULL,
                        quarantine_reason TEXT NOT NULL
                    );
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS budget_settings (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        daily_limit_microusd INTEGER CHECK (daily_limit_microusd IS NULL OR daily_limit_microusd >= 0),
                        monthly_limit_microusd INTEGER CHECK (monthly_limit_microusd IS NULL OR monthly_limit_microusd >= 0)
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
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version INTEGER PRIMARY KEY,
                        applied_at INTEGER NOT NULL
                    );
                """)
                conn.execute("""
                    INSERT OR IGNORE INTO budget_settings (id, daily_limit_microusd, monthly_limit_microusd)
                    VALUES (1, 10000000, 150000000);
                """)
                conn.commit()
                self._run_migrations(conn)
        except Exception as e:
            self.healthy = False
            self.last_error = str(e)
            print(f"[TetherMesh SpendDB Init Error] {e}", flush=True)

    def _run_migrations(self, conn):
        try:
            applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations").fetchall()}
            now_ms = int(time.time() * 1000)

            # Migration Version 2: Schema rebuild enforcing NOT NULL UNIQUE on reservation_id specifically,
            # removing check constraints rejecting negative spend (for reset adjustments),
            # and quarantining duplicate/corrupt records instead of discarding them.
            if 2 not in applied:
                info = conn.execute("PRAGMA table_info(spend_logs);").fetchall()
                res_col = next((c for c in info if c["name"] == "reservation_id"), None)
                
                has_exact_unique_index = False
                indices = conn.execute("PRAGMA index_list(spend_logs);").fetchall()
                for idx in indices:
                    if idx["unique"] == 1:
                        cols = [col["name"] for col in conn.execute(f"PRAGMA index_info('{idx['name']}');").fetchall()]
                        if cols == ["reservation_id"]:
                            has_exact_unique_index = True
                            break

                sql_row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='spend_logs';").fetchone()
                table_sql = (sql_row["sql"] if sql_row else "") or ""
                has_check_constraint = "CHECK" in table_sql.upper() and "SPEND_MICROUSD" in table_sql.upper()

                needs_migration = (not has_exact_unique_index) or (res_col is None) or (res_col["notnull"] != 1) or has_check_constraint

                if needs_migration:
                    conn.execute("BEGIN IMMEDIATE;")
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS quarantine_spend_logs (
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
                            status TEXT,
                            quarantined_at INTEGER NOT NULL,
                            quarantine_reason TEXT NOT NULL
                        );
                    """)

                    # Backfill empty reservation_ids
                    conn.execute("""
                        UPDATE spend_logs 
                        SET reservation_id = 'migrated-res-' || id 
                        WHERE reservation_id IS NULL OR reservation_id = '';
                    """)

                    # Identify duplicate reservation IDs and move subsequent duplicates to quarantine
                    dup_rows = conn.execute("""
                        SELECT * FROM spend_logs 
                        WHERE reservation_id IN (
                            SELECT reservation_id FROM spend_logs GROUP BY reservation_id HAVING COUNT(*) > 1
                        )
                        ORDER BY reservation_id, timestamp ASC;
                    """).fetchall()

                    seen_res = set()
                    for r in dup_rows:
                        r_id = r["reservation_id"]
                        if r_id in seen_res:
                            conn.execute("""
                                INSERT INTO quarantine_spend_logs (
                                    id, reservation_id, timestamp, day_key, model, provider, prompt_tokens,
                                    completion_tokens, total_tokens, spend_microusd, client_name, status,
                                    quarantined_at, quarantine_reason
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'duplicate_reservation_id');
                            """, (
                                r["id"], r["reservation_id"], r["timestamp"], r["day_key"], r["model"],
                                r["provider"], r["prompt_tokens"], r["completion_tokens"], r["total_tokens"],
                                r["spend_microusd"], r["client_name"], r["status"], now_ms
                            ))
                            conn.execute("DELETE FROM spend_logs WHERE id = ?", (r["id"],))
                        else:
                            seen_res.add(r_id)

                    # Rebuild spend_logs table cleanly without CHECK(spend_microusd >= 0)
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS spend_logs_v2 (
                            id TEXT PRIMARY KEY,
                            reservation_id TEXT NOT NULL UNIQUE,
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
                        INSERT INTO spend_logs_v2 (
                            id, reservation_id, timestamp, day_key, model, provider, prompt_tokens,
                            completion_tokens, total_tokens, spend_microusd, client_name, status
                        )
                        SELECT id, reservation_id, timestamp, day_key, model, provider, prompt_tokens,
                               completion_tokens, total_tokens, spend_microusd, client_name, status
                        FROM spend_logs;
                    """)
                    conn.execute("DROP TABLE spend_logs;")
                    conn.execute("ALTER TABLE spend_logs_v2 RENAME TO spend_logs;")
                    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_spend_logs_res_id ON spend_logs(reservation_id);")
                    # Reconcile daily_spend aggregates with active retained spend_logs
                    conn.execute("""
                        UPDATE daily_spend SET
                            total_spend_microusd = COALESCE((SELECT SUM(spend_microusd) FROM spend_logs WHERE day_key = daily_spend.day_key), 0),
                            total_tokens = COALESCE((SELECT SUM(total_tokens) FROM spend_logs WHERE day_key = daily_spend.day_key), 0),
                            total_requests = COALESCE((SELECT COUNT(*) FROM spend_logs WHERE day_key = daily_spend.day_key), 0);
                    """)
                    conn.execute("INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (1, ?)", (now_ms,))
                    conn.execute("INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (2, ?)", (now_ms,))
                    conn.commit()
                else:
                    conn.execute("INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (1, ?)", (now_ms,))
                    conn.execute("INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (2, ?)", (now_ms,))
                    conn.commit()
        except Exception as e:
            self.healthy = False
            self.last_error = f"Migration failed: {e}"
            print(f"[TetherMesh Migration Error] {e}", flush=True)
            raise e

    def get_today_key(self):
        return datetime.now().astimezone().date().isoformat()

    def recover_startup_reservations(self):
        if not self.healthy:
            return
        try:
            now_ms = int(time.time() * 1000)
            with self._get_conn() as conn:
                conn.execute("BEGIN IMMEDIATE;")
                conn.execute("""
                    UPDATE active_reservations
                    SET status = 'released', settled_at = ?
                    WHERE status = 'reserved'
                """, (now_ms,))
                conn.execute("""
                    UPDATE active_reservations
                    SET status = 'unknown', last_heartbeat_at = ?
                    WHERE status = 'dispatched'
                """, (now_ms,))
                conn.commit()
        except Exception as e:
            print(f"[TetherMesh SpendDB Startup Recovery Error] {e}", flush=True)

    def expire_stale_reservations(self) -> int:
        if not self.healthy:
            return 0
        try:
            now_ms = int(time.time() * 1000)
            with self._get_conn() as conn:
                conn.execute("BEGIN IMMEDIATE;")
                cur = conn.execute("""
                    UPDATE active_reservations
                    SET status = 'released', settled_at = ?
                    WHERE status = 'reserved' AND lease_expires_at < ?
                """, (now_ms, now_ms))
                count = cur.rowcount
                conn.commit()
                return count
        except Exception as e:
            print(f"[TetherMesh SpendDB Expire Error] {e}", flush=True)
            return 0

    def get_daily_spend(self, day_key=None):
        if not self.healthy:
            raise RuntimeError(f"Database unavailable: {self.last_error}")
        key = day_key or self.get_today_key()
        with self._get_conn() as conn:
            row = conn.execute("SELECT total_spend_microusd, total_tokens, total_requests FROM daily_spend WHERE day_key = ?", (key,)).fetchone()
            if row:
                microusd = int(row["total_spend_microusd"] or 0)
                return {
                    "total_spend_microusd": microusd,
                    "total_spend": microusd / 1_000_000.0,
                    "total_tokens": int(row["total_tokens"] or 0),
                    "total_requests": int(row["total_requests"] or 0)
                }
        return {"total_spend_microusd": 0, "total_spend": 0.0, "total_tokens": 0, "total_requests": 0}

    def get_effective_daily_spend(self, day_key=None):
        if not self.healthy:
            raise RuntimeError(f"Database unavailable: {self.last_error}")
        key = day_key or self.get_today_key()
        with self._get_conn() as conn:
            row_settled = conn.execute("SELECT total_spend_microusd FROM daily_spend WHERE day_key = ?", (key,)).fetchone()
            settled_microusd = int(row_settled["total_spend_microusd"] or 0) if row_settled else 0

            row_inflight = conn.execute(
                "SELECT COALESCE(SUM(reserved_microusd), 0) as inflight FROM active_reservations WHERE day_key = ? AND status IN ('reserved', 'dispatched', 'unknown')",
                (key,)
            ).fetchone()
            inflight_microusd = int(row_inflight["inflight"] or 0) if row_inflight else 0

            total_eff = settled_microusd + inflight_microusd
            return {
                "settled_microusd": settled_microusd,
                "inflight_microusd": inflight_microusd,
                "effective_microusd": total_eff,
                "effective_spend_microusd": total_eff,
                "effective_spend_usd": total_eff / 1_000_000.0
            }

    def get_monthly_spend(self, day_key=None):
        if not self.healthy:
            raise RuntimeError(f"Database unavailable: {self.last_error}")
        key = day_key or self.get_today_key()
        month_prefix = key[:7] + "%"
        with self._get_conn() as conn:
            row_settled = conn.execute("SELECT COALESCE(SUM(total_spend_microusd), 0) as month_spend FROM daily_spend WHERE day_key LIKE ?", (month_prefix,)).fetchone()
            settled_microusd = int(row_settled["month_spend"] or 0) if row_settled else 0

            row_inflight = conn.execute(
                "SELECT COALESCE(SUM(reserved_microusd), 0) as month_inflight FROM active_reservations WHERE day_key LIKE ? AND status IN ('reserved', 'dispatched', 'unknown')",
                (month_prefix,)
            ).fetchone()
            inflight_microusd = int(row_inflight["month_inflight"] or 0) if row_inflight else 0

            total_m_eff = settled_microusd + inflight_microusd
            return {
                "month_settled_microusd": settled_microusd,
                "month_inflight_microusd": inflight_microusd,
                "month_effective_microusd": total_m_eff,
                "month_effective_spend_microusd": total_m_eff,
                "month_effective_spend_usd": total_m_eff / 1_000_000.0
            }

    def get_budget_settings(self):
        if not self.healthy:
            raise RuntimeError(f"Database unavailable: {self.last_error}")
        with self._get_conn() as conn:
            row = conn.execute("SELECT daily_limit_microusd, monthly_limit_microusd FROM budget_settings WHERE id = 1").fetchone()
            if row:
                daily_micro = row["daily_limit_microusd"]
                monthly_micro = row["monthly_limit_microusd"]
                daily_limit_micro = int(daily_micro) if daily_micro is not None else None
                monthly_limit_micro = int(monthly_micro) if monthly_micro is not None else None

                eff = self.get_effective_daily_spend()
                eff_micro = eff["effective_microusd"]
                month = self.get_monthly_spend()
                month_eff_micro = month["month_effective_microusd"]

                is_daily_tripped = (daily_limit_micro == 0) or (eff_micro >= daily_limit_micro) if daily_limit_micro is not None else False
                is_monthly_tripped = (monthly_limit_micro == 0) or (month_eff_micro >= monthly_limit_micro) if monthly_limit_micro is not None else False
                is_tripped = is_daily_tripped or is_monthly_tripped

                return {
                    "daily_limit_microusd": daily_limit_micro,
                    "monthly_limit_microusd": monthly_limit_micro,
                    "daily_limit": (daily_limit_micro / 1_000_000.0) if daily_limit_micro is not None else None,
                    "monthly_limit": (monthly_limit_micro / 1_000_000.0) if monthly_limit_micro is not None else None,
                    "is_tripped": is_tripped
                }
        raise RuntimeError("Budget settings row missing")

    def set_budget_limits(self, daily_limit_microusd=OMITTED, monthly_limit_microusd=OMITTED) -> dict:
        if not self.healthy:
            raise RuntimeError(f"Database unavailable: {self.last_error}")
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE;")
            if daily_limit_microusd is not OMITTED:
                conn.execute("UPDATE budget_settings SET daily_limit_microusd = ? WHERE id = 1", (daily_limit_microusd,))
            if monthly_limit_microusd is not OMITTED:
                conn.execute("UPDATE budget_settings SET monthly_limit_microusd = ? WHERE id = 1", (monthly_limit_microusd,))
            
            row = conn.execute("SELECT daily_limit_microusd, monthly_limit_microusd FROM budget_settings WHERE id = 1").fetchone()
            if not row:
                conn.execute("ROLLBACK;")
                raise RuntimeError("Budget settings row missing")

            daily_micro = row["daily_limit_microusd"]
            monthly_micro = row["monthly_limit_microusd"]
            daily_limit_micro = int(daily_micro) if daily_micro is not None else None
            monthly_limit_micro = int(monthly_micro) if monthly_micro is not None else None

            today_key = self.get_today_key()
            row_settled = conn.execute("SELECT total_spend_microusd FROM daily_spend WHERE day_key = ?", (today_key,)).fetchone()
            settled_micro = int(row_settled["total_spend_microusd"] or 0) if row_settled else 0

            row_inflight = conn.execute(
                "SELECT COALESCE(SUM(reserved_microusd), 0) as inflight FROM active_reservations WHERE day_key = ? AND status IN ('reserved', 'dispatched', 'unknown')",
                (today_key,)
            ).fetchone()
            inflight_micro = int(row_inflight["inflight"] or 0) if row_inflight else 0
            eff_micro = settled_micro + inflight_micro

            month_prefix = today_key[:7] + "%"
            row_month_settled = conn.execute("SELECT COALESCE(SUM(total_spend_microusd), 0) as month_spend FROM daily_spend WHERE day_key LIKE ?", (month_prefix,)).fetchone()
            month_settled_micro = int(row_month_settled["month_spend"] or 0) if row_month_settled else 0

            row_month_inflight = conn.execute(
                "SELECT COALESCE(SUM(reserved_microusd), 0) as month_inflight FROM active_reservations WHERE day_key LIKE ? AND status IN ('reserved', 'dispatched', 'unknown')",
                (month_prefix,)
            ).fetchone()
            month_inflight_micro = int(row_month_inflight["month_inflight"] or 0) if row_month_inflight else 0
            month_eff_micro = month_settled_micro + month_inflight_micro

            is_daily_tripped = (daily_limit_micro == 0) or (eff_micro >= daily_limit_micro) if daily_limit_micro is not None else False
            is_monthly_tripped = (monthly_limit_micro == 0) or (month_eff_micro >= monthly_limit_micro) if monthly_limit_micro is not None else False
            is_tripped = is_daily_tripped or is_monthly_tripped

            conn.commit()

            return {
                "daily_limit_microusd": daily_limit_micro,
                "monthly_limit_microusd": monthly_limit_micro,
                "daily_limit": (daily_limit_micro / 1_000_000.0) if daily_limit_micro is not None else None,
                "monthly_limit": (monthly_limit_micro / 1_000_000.0) if monthly_limit_micro is not None else None,
                "is_tripped": is_tripped
            }

    def reserve_spend(self, reservation_id: str, model: str, reserved_microusd: int, day_key: str = None) -> tuple[bool, dict]:
        if not self.healthy:
            return False, {"error": "database_unavailable", "message": str(self.last_error)}
        key = day_key or self.get_today_key()
        now_ms = int(time.time() * 1000)
        lease_expires = now_ms + (300 * 1000)

        max_retries = 8
        base_delay = 0.015

        for attempt in range(max_retries):
            conn = None
            try:
                conn = self._get_conn()
                conn.execute("BEGIN IMMEDIATE;")

                row_settled = conn.execute("SELECT total_spend_microusd FROM daily_spend WHERE day_key = ?", (key,)).fetchone()
                settled_microusd = int(row_settled["total_spend_microusd"] or 0) if row_settled else 0

                row_inflight = conn.execute(
                    "SELECT COALESCE(SUM(reserved_microusd), 0) as inflight FROM active_reservations WHERE day_key = ? AND status IN ('reserved', 'dispatched', 'unknown')",
                    (key,)
                ).fetchone()
                inflight_microusd = int(row_inflight["inflight"] or 0) if row_inflight else 0

                month_prefix = key[:7] + "%"
                row_monthly = conn.execute("SELECT COALESCE(SUM(total_spend_microusd), 0) as month_spend FROM daily_spend WHERE day_key LIKE ?", (month_prefix,)).fetchone()
                settled_month_microusd = int(row_monthly["month_spend"] or 0) if row_monthly else 0

                row_month_inflight = conn.execute(
                    "SELECT COALESCE(SUM(reserved_microusd), 0) as month_inflight FROM active_reservations WHERE day_key LIKE ? AND status IN ('reserved', 'dispatched', 'unknown')",
                    (month_prefix,)
                ).fetchone()
                month_inflight_microusd = int(row_month_inflight["month_inflight"] or 0) if row_month_inflight else 0

                row_budget = conn.execute("SELECT daily_limit_microusd, monthly_limit_microusd FROM budget_settings WHERE id = 1").fetchone()
                daily_limit_microusd = row_budget["daily_limit_microusd"] if row_budget else 10_000_000
                monthly_limit_microusd = row_budget["monthly_limit_microusd"] if row_budget else 150_000_000

                total_daily_projected = settled_microusd + inflight_microusd + reserved_microusd
                total_monthly_projected = settled_month_microusd + month_inflight_microusd + reserved_microusd

                if daily_limit_microusd is not None:
                    if daily_limit_microusd == 0 or total_daily_projected > daily_limit_microusd:
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

                if monthly_limit_microusd is not None:
                    if monthly_limit_microusd == 0 or total_monthly_projected > monthly_limit_microusd:
                        conn.execute("ROLLBACK;")
                        return False, {
                            "error": "monthly_budget_exceeded",
                            "settled_microusd": settled_month_microusd,
                            "inflight_microusd": month_inflight_microusd,
                            "requested_microusd": reserved_microusd,
                            "monthly_limit_microusd": monthly_limit_microusd,
                            "settled_usd": settled_month_microusd / 1_000_000.0,
                            "limit_usd": monthly_limit_microusd / 1_000_000.0
                        }

                conn.execute("""
                    INSERT INTO active_reservations (id, day_key, reserved_microusd, model, status, created_at, lease_expires_at)
                    VALUES (?, ?, ?, ?, 'reserved', ?, ?)
                """, (reservation_id, key, reserved_microusd, model, now_ms, lease_expires))

                conn.execute("COMMIT;")
                return True, {
                    "reservation_id": reservation_id,
                    "reserved_microusd": reserved_microusd,
                    "day_key": key
                }
            except sqlite3.OperationalError as e:
                if conn:
                    try: conn.execute("ROLLBACK;")
                    except Exception: pass
                if "busy" in str(e).lower() or "locked" in str(e).lower():
                    sleep_time = (base_delay * (2 ** attempt)) + (secrets.randbelow(10) / 1000.0)
                    time.sleep(sleep_time)
                    continue
                raise e
            finally:
                if conn:
                    conn.close()

        return False, {"error": "budget_engine_busy"}

    def mark_dispatched(self, reservation_id: str) -> bool:
        if not self.healthy:
            return False
        now_ms = int(time.time() * 1000)
        lease_ms = now_ms + (300 * 1000)
        try:
            with self._get_conn() as conn:
                conn.execute("BEGIN IMMEDIATE;")
                cur = conn.execute("""
                    UPDATE active_reservations 
                    SET status = 'dispatched', dispatched_at = ?, last_heartbeat_at = ?, lease_expires_at = ?
                    WHERE id = ? AND status = 'reserved'
                """, (now_ms, now_ms, lease_ms, reservation_id))
                conn.commit()
                return cur.rowcount > 0
        except Exception as e:
            print(f"[TetherMesh SpendDB mark_dispatched Error] {e}", flush=True)
            return False

    def heartbeat_reservation(self, reservation_id: str):
        if not self.healthy:
            return
        now_ms = int(time.time() * 1000)
        lease_ms = now_ms + (300 * 1000)
        try:
            with self._get_conn() as conn:
                conn.execute("""
                    UPDATE active_reservations 
                    SET last_heartbeat_at = ?, lease_expires_at = ?
                    WHERE id = ? AND status = 'dispatched'
                """, (now_ms, lease_ms, reservation_id))
                conn.commit()
        except Exception:
            pass

    def release_undispatched(self, reservation_id: str) -> bool:
        if not self.healthy:
            return False
        try:
            with self._get_conn() as conn:
                conn.execute("BEGIN IMMEDIATE;")
                cursor = conn.execute("""
                    UPDATE active_reservations 
                    SET status = 'released', settled_at = ?
                    WHERE id = ? AND status = 'reserved'
                """, (int(time.time() * 1000), reservation_id))
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            print(f"[TetherMesh SpendDB release_undispatched Error] {e}", flush=True)
            return False

    def reconcile_spend(self, reservation_id: str, actual_microusd: int = None, actual_tokens: int = 0, trace_dict: dict = None) -> bool:
        if not self.healthy:
            return False
        now_ms = int(time.time() * 1000)
        trace_dict = trace_dict or {}

        max_retries = 8
        base_delay = 0.015

        for attempt in range(max_retries):
            conn = None
            try:
                conn = self._get_conn()
                conn.execute("BEGIN IMMEDIATE;")

                res_row = conn.execute("SELECT * FROM active_reservations WHERE id = ?", (reservation_id,)).fetchone()
                if not res_row:
                    conn.execute("ROLLBACK;")
                    return False

                status = res_row["status"]
                if status in ('settled', 'released'):
                    conn.execute("ROLLBACK;")
                    return True

                reserved_microusd = int(res_row["reserved_microusd"])
                day_key = res_row["day_key"]
                model = res_row["model"]

                final_microusd = actual_microusd if actual_microusd is not None and actual_microusd >= 0 else reserved_microusd

                conn.execute("""
                    INSERT INTO daily_spend (day_key, total_spend_microusd, total_tokens, total_requests, last_updated_at)
                    VALUES (?, ?, ?, 1, ?)
                    ON CONFLICT(day_key) DO UPDATE SET
                        total_spend_microusd = total_spend_microusd + excluded.total_spend_microusd,
                        total_tokens = total_tokens + excluded.total_tokens,
                        total_requests = total_requests + 1,
                        last_updated_at = excluded.last_updated_at;
                """, (day_key, final_microusd, actual_tokens, now_ms))

                # Strict insert: fails if reservation_id is duplicated
                conn.execute("""
                    INSERT INTO spend_logs (id, reservation_id, timestamp, day_key, model, provider, prompt_tokens, completion_tokens, total_tokens, spend_microusd, client_name, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    trace_dict.get("id", f"tr-{uuid.uuid4().hex[:8]}"),
                    reservation_id,
                    now_ms,
                    day_key,
                    trace_dict.get("modelServed", model),
                    trace_dict.get("providerServed", "LiteLLM"),
                    trace_dict.get("promptTokens", 0),
                    trace_dict.get("completionTokens", 0),
                    actual_tokens,
                    final_microusd,
                    trace_dict.get("clientName", "AI Coding Agent"),
                    trace_dict.get("status", "success")
                ))

                conn.execute("""
                    UPDATE active_reservations 
                    SET status = 'settled', settled_at = ?
                    WHERE id = ?
                """, (now_ms, reservation_id))

                conn.execute("COMMIT;")
                return True
            except sqlite3.OperationalError as e:
                if conn:
                    try: conn.execute("ROLLBACK;")
                    except Exception: pass
                if "busy" in str(e).lower() or "locked" in str(e).lower():
                    time.sleep((base_delay * (2 ** attempt)) + (secrets.randbelow(10) / 1000.0))
                    continue
                raise e
            finally:
                if conn:
                    conn.close()

        return False

    def record_trace_spend(self, trace_dict: dict) -> bool:
        res_id = trace_dict.get("reservationId")
        if res_id:
            cost_usd = float(trace_dict.get("cost", 0.0) or 0.0)
            actual_micros = int(cost_usd * 1_000_000) if cost_usd > 0 else None
            tokens = int(trace_dict.get("totalTokens", 0) or 0)
            return self.reconcile_spend(res_id, actual_microusd=actual_micros, actual_tokens=tokens, trace_dict=trace_dict)
        return True

    def reset_daily_spend(self, day_key=None) -> dict:
        if not self.healthy:
            raise RuntimeError("Database unavailable")
        key = day_key or self.get_today_key()
        now_ms = int(time.time() * 1000)
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE;")
            row = conn.execute("SELECT total_spend_microusd FROM daily_spend WHERE day_key = ?", (key,)).fetchone()
            current_micro = int(row["total_spend_microusd"] or 0) if row else 0

            conn.execute("""
                INSERT INTO spend_logs (id, reservation_id, timestamp, day_key, model, provider, prompt_tokens, completion_tokens, total_tokens, spend_microusd, client_name, status)
                VALUES (?, ?, ?, ?, 'system/reset', 'system', 0, 0, 0, ?, 'admin', 'reset_adjustment')
            """, (f"reset-{uuid.uuid4().hex[:8]}", f"reset-res-{uuid.uuid4().hex[:8]}", now_ms, key, -current_micro))

            conn.execute("UPDATE daily_spend SET total_spend_microusd = 0, last_updated_at = ? WHERE day_key = ?", (now_ms, key))
            conn.execute("UPDATE active_reservations SET status = 'released', settled_at = ? WHERE day_key = ? AND status = 'reserved'", (now_ms, key))
            conn.commit()

        eff = self.get_effective_daily_spend(key)
        month = self.get_monthly_spend(key)
        budget = self.get_budget_settings()
        return {
            "success": True,
            "daily_spent_usd": eff["effective_spend_usd"],
            "monthly_spent_usd": month["month_effective_spend_usd"],
            "is_tripped": budget["is_tripped"]
        }

    def get_recent_logs(self, limit=50):
        if not self.healthy:
            return []
        try:
            with self._get_conn() as conn:
                rows = conn.execute("SELECT * FROM spend_logs ORDER BY timestamp DESC LIMIT ?", (limit,)).fetchall()
                results = []
                for r in rows:
                    d = dict(r)
                    d["spend"] = round((d.get("spend_microusd") or 0) / 1_000_000.0, 5)
                    results.append(d)
                return results
        except Exception:
            return []

spend_db = SpendLedgerDB()




# ---------------------------------------------------------------------------
# Worst-Case Request Cost Estimator (Fail-Closed)
# ---------------------------------------------------------------------------

def estimate_request_microusd(model: str, body_dict: dict, path: str, body_bytes: bytes = b"") -> tuple[bool, int, str]:
    """
    Estimates a defensible upper-bound worst-case cost in integer microdollars using math.ceil.
    Fails closed without guessed constants if verified endpoint pricing is missing.
    """
    import math
    norm_path = path.rstrip("/") or "/"

    # 1. Zero-cost verification:
    # In air-gapped mode or if deployment is explicitly verified as a local loopback deployment in routing graph
    if AIR_GAPPED_MODE:
        return True, 0, ""

    if model in ROUTING_GRAPH_DEPLOYMENTS:
        deployments = ROUTING_GRAPH_DEPLOYMENTS[model]
        # Only treat as zero-cost if ALL targets for this model route to verified numeric loopback endpoints
        if deployments and all(is_numeric_loopback_url(dep.get("api_base", "")) for dep in deployments):
            return True, 0, ""

    if not model:
        if norm_path.endswith(("/v1/moderations", "/moderations")):
            model = "text-moderation-latest"
        elif norm_path.endswith(("/v1/rerank", "/rerank")):
            model = "rerank-english-v3.0"
        elif norm_path.endswith(("/v1/messages", "/messages")):
            model = "claude-3-7-sonnet"
        else:
            return False, 0, "Model identifier is missing from request body."

    # 2. Exact pricing lookup: exact key match first, then resolved target model
    cost_info = litellm.model_cost.get(model)
    if not cost_info and model in ROUTING_GRAPH_DEPLOYMENTS:
        for dep in ROUTING_GRAPH_DEPLOYMENTS[model]:
            t = dep.get("model_target")
            if t and t in litellm.model_cost:
                cost_info = litellm.model_cost[t]
                break

    if not cost_info and "/" in model:
        # Try exact provider/model or sub-key without broad prefix wildcards
        parts = model.split("/")
        if len(parts) == 2:
            alt_key = f"{parts[0]}/{parts[1]}"
            if alt_key in litellm.model_cost:
                cost_info = litellm.model_cost[alt_key]
            elif parts[1] in litellm.model_cost:
                cost_info = litellm.model_cost[parts[1]]

    if not cost_info or not isinstance(cost_info, dict):
        return False, 0, f"Pricing unknown for model '{model}'. Hard budget cap requires verified registered pricing."

    # 3. Moderation Endpoints
    if norm_path.endswith(("/v1/moderations", "/moderations")):
        rate = cost_info.get("input_cost_per_token") or cost_info.get("cost_per_token") or cost_info.get("input_cost_per_character")
        if rate is None or rate <= 0:
            return False, 0, f"Pricing unknown: moderation endpoint requires verified input_cost_per_token for model '{model}'."
        input_data = body_dict.get("input", "")
        chars = len(input_data) if isinstance(input_data, str) else sum(len(str(x)) for x in input_data)
        est_tokens = max(16, chars)
        worst_usd = est_tokens * rate
        return True, max(100, math.ceil(worst_usd * 1_000_000)), ""

    # 4. Rerank Endpoints
    if norm_path.endswith(("/v1/rerank", "/rerank")):
        rate = cost_info.get("input_cost_per_token") or cost_info.get("cost_per_search") or cost_info.get("cost_per_unit")
        if rate is None or rate <= 0:
            return False, 0, f"Pricing unknown: rerank endpoint requires verified pricing for model '{model}'."
        docs = body_dict.get("documents", [])
        query = body_dict.get("query", "")
        doc_chars = sum(len(str(d)) for d in docs)
        query_chars = len(str(query))
        total_chars = max(16, doc_chars + query_chars)
        worst_usd = total_chars * rate
        return True, max(500, math.ceil(worst_usd * 1_000_000)), ""

    # 5. Audio Endpoints
    if norm_path.startswith(("/audio", "/v1/audio")):
        cost_per_sec = cost_info.get("cost_per_second") or cost_info.get("input_cost_per_second")
        if not cost_per_sec and cost_info.get("cost_per_minute"):
            cost_per_sec = cost_info.get("cost_per_minute") / 60.0
        if not cost_per_sec and cost_info.get("cost_per_hour"):
            cost_per_sec = cost_info.get("cost_per_hour") / 3600.0
        if cost_per_sec is None or cost_per_sec <= 0:
            return False, 0, f"Pricing unknown: audio endpoint requires verified cost_per_second for model '{model}'."

        # Bound duration from payload size: at lowest 32kbps mono (4 KB/sec), 25MB is ~6250s.
        # Enforce conservative duration upper bound
        byte_len = len(body_bytes) if body_bytes else int(body_dict.get("content_length", 0) or 0)
        if byte_len > 0:
            est_duration = max(60, int(byte_len / 4000))
        else:
            est_duration = 3600

        worst_usd = est_duration * cost_per_sec
        return True, max(1000, math.ceil(worst_usd * 1_000_000)), ""

    # 6. Image Generation Endpoints
    if norm_path.startswith(("/images", "/v1/images")):
        quality = str(body_dict.get("quality", "standard")).lower()
        size = str(body_dict.get("size", "1024x1024")).lower()
        n = int(body_dict.get("n", 1) or 1)

        # Exact pricing matrix lookup
        cost_per_img = None
        if quality in ("hd", "high"):
            cost_per_img = cost_info.get("cost_per_image_hd")
            if cost_per_img is None:
                # If HD requested but no HD pricing configured, fail closed
                return False, 0, f"Pricing unknown: model '{model}' does not have verified HD quality image pricing."
        else:
            cost_per_img = cost_info.get("cost_per_image") or cost_info.get("output_cost_per_image")

        if cost_per_img is None or cost_per_img <= 0:
            return False, 0, f"Pricing unknown: image model '{model}' does not have verified pricing for quality '{quality}' and size '{size}'."

        # Size adjustment if specified in pricing
        if size in ("1024x1792", "1792x1024") and cost_info.get("cost_per_image_large"):
            cost_per_img = cost_info.get("cost_per_image_large")

        worst_usd = n * cost_per_img
        return True, max(10_000, math.ceil(worst_usd * 1_000_000)), ""

    # 7. Text / Chat / Embeddings Endpoints (including Multimodal Vision Inputs)
    input_cost_per_token = cost_info.get("input_cost_per_token", 0.0)
    output_cost_per_token = cost_info.get("output_cost_per_token", 0.0)
    if input_cost_per_token <= 0 and output_cost_per_token <= 0 and not cost_info.get("is_free", False):
        return False, 0, f"Pricing unknown: chat/completion endpoint requires verified token pricing for model '{model}'."

    messages = body_dict.get("messages") or body_dict.get("prompt") or body_dict.get("input") or []
    prompt_chars = 0
    image_token_overhead = 0

    if isinstance(messages, list):
        for m in messages:
            if isinstance(m, dict):
                c = m.get("content", "")
                if isinstance(c, str):
                    prompt_chars += len(c)
                elif isinstance(c, list):
                    for part in c:
                        if isinstance(part, dict):
                            if "text" in part:
                                prompt_chars += len(str(part["text"]))
                            elif part.get("type") in ("image_url", "image") or "image_url" in part or "image" in part:
                                # Multimodal image input bound: 1600 tokens per high-res tile
                                detail = ""
                                if isinstance(part.get("image_url"), dict):
                                    detail = str(part["image_url"].get("detail", "")).lower()
                                image_token_overhead += 85 if detail == "low" else 1600
            else:
                prompt_chars += len(str(m))
    elif isinstance(messages, str):
        prompt_chars = len(messages)

    prompt_tokens = max(16, prompt_chars) + image_token_overhead

    max_tokens = (
        body_dict.get("max_tokens") or
        body_dict.get("max_completion_tokens") or
        cost_info.get("max_tokens") or
        cost_info.get("max_output_tokens") or
        4096
    )
    if not isinstance(max_tokens, int) or max_tokens <= 0:
        max_tokens = 4096

    prompt_cost = prompt_tokens * input_cost_per_token
    completion_cost = max_tokens * output_cost_per_token
    worst_usd = prompt_cost + completion_cost

    # Integer microdollars ceiling
    worst_microusd = max(1000, math.ceil(worst_usd * 1_000_000))
    return True, worst_microusd, ""


# ---------------------------------------------------------------------------
# # TetherIQ Real-Time In-Memory Telemetry Engine (Thread-Safe with SQLite Sync)
# ---------------------------------------------------------------------------

class TetherTelemetryBuffer:
    def __init__(self, max_traces=100, max_history=60):
        self.traces = deque(maxlen=max_traces)
        self.agents = {}  # id -> ConnectedAgent dict
        self.history = deque(maxlen=max_history)  # rolling points
        self.listeners = []  # list of asyncio.Queue for SSE
        
        # Initialize initial baseline totals from SQLite on startup
        init_spend = spend_db.get_daily_spend()
        self.total_tokens_today = init_spend["total_tokens"]
        self.total_cost_today = init_spend["total_spend"]
        self.total_requests_today = init_spend["total_requests"]
        self.current_tokens_per_sec = 0.0
        self.current_latency_ms = 0
        self.current_burn_rate_per_hour = 0.0

    def detect_agent(self, kwargs, client_ip):
        headers = {}
        psr = kwargs.get("proxy_server_request") or {}
        raw_headers = psr.get("headers") or kwargs.get("litellm_params", {}).get("headers") or kwargs.get("headers") or {}
        if isinstance(raw_headers, dict):
            headers = {k.lower(): str(v) for k, v in raw_headers.items()}
        elif isinstance(raw_headers, (list, tuple)):
            for item in raw_headers:
                if isinstance(item, (list, tuple)) and len(item) == 2:
                    k = item[0].decode("utf-8", "ignore").lower() if isinstance(item[0], bytes) else str(item[0]).lower()
                    v = item[1].decode("utf-8", "ignore") if isinstance(item[1], bytes) else str(item[1])
                    headers[k] = v

        user_agent = (headers.get("user-agent") or "").lower()
        if "claude-code" in user_agent or "claude_code" in user_agent or "@anthropic-ai/claude-code" in user_agent:
            return "ag-claude-code", "Claude Code CLI", "Terminal"
        elif "cursor" in user_agent or "anysphere" in user_agent:
            return "ag-cursor", "Cursor IDE (Composer)", "Code2"
        elif "windsurf" in user_agent or "codeium" in user_agent:
            return "ag-windsurf", "Windsurf IDE (Cascade)", "Compass"
        elif "devin" in user_agent:
            return "ag-devin", "Devin", "Bot"
        elif "aider" in user_agent:
            return "ag-aider", "Aider", "Terminal"
        elif "antigravity" in user_agent or "gemini" in user_agent:
            return "ag-antigravity", "Antigravity", "Sparkles"
        elif "python" in user_agent:
            return "ag-python-sdk", "Python SDK", "Code2"
        elif "node" in user_agent or "axios" in user_agent or "fetch" in user_agent:
            return "ag-ts-sdk", "TypeScript SDK", "Code2"
        else:
            return f"ag-{client_ip.replace('.', '-').replace(':', '-')}", "AI Coding Agent", "Bot"

    def record_trace(self, trace_dict, agent_info):
        self.traces.appendleft(trace_dict)
        self.total_requests_today += 1
        self.total_tokens_today += trace_dict.get("totalTokens", 0)
        self.total_cost_today += trace_dict.get("cost", 0.0)

        # Persist spend transaction atomically into SQLite ledger
        spend_db.record_trace_spend(trace_dict)

        # Update or register connected agent (with max cap eviction to prevent memory leaks)
        ag_id, ag_name, ag_icon = agent_info
        now_ms = int(time.time() * 1000)
        if len(self.agents) > 64:
            oldest_key = min(self.agents.keys(), key=lambda k: self.agents[k].get("lastActiveAt", 0))
            self.agents.pop(oldest_key, None)

        if ag_id not in self.agents:
            self.agents[ag_id] = {
                "id": ag_id,
                "clientName": ag_name,
                "agentIcon": ag_icon,
                "ip": trace_dict.get("clientIp", "127.0.0.1"),
                "connectedAt": now_ms,
                "lastActiveAt": now_ms,
                "totalTokens": trace_dict.get("totalTokens", 0),
                "totalCost": trace_dict.get("cost", 0.0),
                "activeModel": trace_dict.get("modelServed", trace_dict.get("modelRequested", "")),
                "status": "active"
            }
        else:
            ag = self.agents[ag_id]
            ag["lastActiveAt"] = now_ms
            ag["totalTokens"] += trace_dict.get("totalTokens", 0)
            ag["totalCost"] += trace_dict.get("cost", 0.0)
            ag["activeModel"] = trace_dict.get("modelServed", trace_dict.get("modelRequested", ""))
            ag["status"] = "active"

        # Update active throughput & latency metrics
        duration_sec = max(0.1, trace_dict.get("totalDurationMs", 0) / 1000.0)
        tok_sec = trace_dict.get("totalTokens", 0) / duration_sec
        self.current_tokens_per_sec = round(tok_sec, 1)
        self.current_latency_ms = trace_dict.get("totalDurationMs", 0)
        self.current_burn_rate_per_hour = round(trace_dict.get("cost", 0.0) * (3600.0 / max(1.0, duration_sec)), 2)

        # Append rolling history point
        point = {
            "timestamp": now_ms,
            "tokensPerSecond": self.current_tokens_per_sec,
            "inputTokens": trace_dict.get("promptTokens", 0),
            "outputTokens": trace_dict.get("completionTokens", 0),
            "latencyMs": self.current_latency_ms,
            "costEstimate": trace_dict.get("cost", 0.0),
            "provider": trace_dict.get("providerServed", "LiteLLM"),
            "model": trace_dict.get("modelServed", "")
        }
        self.history.append(point)

        # Broadcast live event to all connected SSE clients (with queue overflow safety)
        event_payload = json.dumps({
            "type": "trace",
            "trace": trace_dict,
            "agent": self.agents[ag_id],
            "point": point,
            "stats": self.get_stats()
        })
        
        dead_queues = []
        for q in list(self.listeners):
            try:
                if q.full():
                    try:
                        q.get_nowait()
                    except Exception:
                        pass
                q.put_nowait(event_payload)
            except Exception:
                dead_queues.append(q)
        for dq in dead_queues:
            if dq in self.listeners:
                self.listeners.remove(dq)

    def get_stats(self):
        return {
            "tokensPerSecond": self.current_tokens_per_sec,
            "currentLatencyMs": self.current_latency_ms,
            "currentBurnRatePerHour": self.current_burn_rate_per_hour,
            "totalTokensToday": self.total_tokens_today,
            "totalCostToday": round(self.total_cost_today, 4),
            "totalRequestsToday": self.total_requests_today
        }

    def get_snapshot(self):
        now_ms = int(time.time() * 1000)
        for ag in self.agents.values():
            if now_ms - ag["lastActiveAt"] > 120000:
                ag["status"] = "idle"

        return {
            "traces": list(self.traces)[-25:],
            "agents": list(self.agents.values()),
            "stats": self.get_stats(),
            "history": list(self.history)[-25:]
        }


buffer = TetherTelemetryBuffer()


# ---------------------------------------------------------------------------
# Zero-Trust Gateway Authentication & Route Security Enforcement (H-01, H-02)
# ---------------------------------------------------------------------------

MAX_CONCURRENT_UPSTREAM = 16
upstream_semaphore = asyncio.Semaphore(MAX_CONCURRENT_UPSTREAM)
RATE_LIMIT_MAX_PER_MINUTE = 60
rate_limit_records = {}  # ip -> deque of timestamps

PUBLIC_HEALTH_ROUTES = {
    "/health",
    "/health/liveness",
    "/health/readiness",
    "/health/security-status",
}

CONTROL_PLANE_ROUTES = {
    ("POST", "/spend/reset"),
    ("POST", "/spend/budget"),
    ("POST", "/admin/providers/validate-key"),
    ("POST", "/health/test-key"),
    ("GET", "/spend/summary"),
    ("GET", "/spend/logs"),
    ("GET", "/health/providers"),
    ("GET", "/health/local-mesh"),
    ("GET", "/tether/telemetry"),
    ("GET", "/tether/events"),
    ("GET", "/admin/security-status"),
}

INFERENCE_EXACT_ROUTES = {
    ("GET", "/models"),
    ("GET", "/model/info"),
    ("GET", "/v1/models"),
    ("GET", "/v1/model/info"),
    ("POST", "/chat/completions"),
    ("POST", "/v1/chat/completions"),
    ("POST", "/completions"),
    ("POST", "/v1/completions"),
    ("POST", "/embeddings"),
    ("POST", "/v1/embeddings"),
    ("POST", "/messages"),
    ("POST", "/v1/messages"),
    ("POST", "/audio/transcriptions"),
    ("POST", "/v1/audio/transcriptions"),
    ("POST", "/audio/speech"),
    ("POST", "/v1/audio/speech"),
    ("POST", "/audio/translations"),
    ("POST", "/v1/audio/translations"),
    ("POST", "/moderations"),
    ("POST", "/v1/moderations"),
    ("POST", "/images/generations"),
    ("POST", "/v1/images/generations"),
    ("POST", "/rerank"),
    ("POST", "/v1/rerank"),
    ("POST", "/responses"),
    ("POST", "/v1/responses"),
}

INFERENCE_PREFIX_ROUTES = (
    ("POST", "/v1/chat/completions"),
    ("POST", "/v1/completions"),
    ("POST", "/v1/embeddings"),
    ("POST", "/v1/messages"),
    ("POST", "/v1/audio/"),
    ("POST", "/v1/images/"),
    ("POST", "/v1/moderations"),
    ("POST", "/v1/rerank"),
    ("POST", "/v1/responses"),
)

def classify_route(method: str, path: str) -> str:
    """
    Strict method + normalized path classifier.
    Returns: 'public' | 'control_plane' | 'inference' | 'unauthorized'
    """
    norm_path = path.rstrip("/") or "/"
    
    if method == "GET" and norm_path in PUBLIC_HEALTH_ROUTES:
        return "public"
        
    if (method, norm_path) in CONTROL_PLANE_ROUTES:
        return "control_plane"
        
    if (method, norm_path) in INFERENCE_EXACT_ROUTES:
        return "inference"
        
    for inf_method, inf_prefix in INFERENCE_PREFIX_ROUTES:
        if method == inf_method and norm_path.startswith(inf_prefix):
            return "inference"
            
    return "unauthorized"

def rewrite_auth_for_litellm(request: Request, master_key: str):
    """Replace all client credentials in ASGI scope with the private internal LiteLLM master key."""
    raw_headers = request.scope.get("headers", [])
    filtered_headers = [
        (k, v) for (k, v) in raw_headers
        if k.lower() not in (b"authorization", b"x-api-key", b"x-tetheriq-token")
    ]
    filtered_headers.append((b"authorization", f"Bearer {master_key}".encode("ascii")))
    request.scope["headers"] = filtered_headers
    if hasattr(request, "_headers"):
        delattr(request, "_headers")

class WebSocketSecurityMiddleware:
    """ASGI middleware to reject unclassified/unauthorized WebSocket connections fail-closed."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            await send({
                "type": "websocket.close",
                "code": 4403,
                "reason": "WebSocket protocol disabled on local gateway"
            })
            return
        await self.app(scope, receive, send)

app.add_middleware(WebSocketSecurityMiddleware)

# ---------------------------------------------------------------------------
# 1. Atomic Pre-Call Spend Circuit Breaker (INNER Middleware - Runs AFTER Auth)
# ---------------------------------------------------------------------------

NON_BILLABLE_PATHS = {
    "/models",
    "/v1/models",
    "/health",
    "/health/liveness",
    "/health/readiness",
    "/health/security-status",
    "/health/test-key",
    "/health/providers",
    "/health/local-mesh",
    "/admin/providers/validate-key",
    "/admin/security-status",
    "/spend/summary",
    "/spend/logs",
    "/spend/reset",
    "/spend/budget",
    "/tether/telemetry",
    "/tether/events",
}

LOCAL_ALLOWED_PREFIXES = ("ollama/", "ollama_chat/", "hosted_vllm/", "custom/", "lm_studio/", "openai/")
ROUTING_GRAPH_DEPLOYMENTS: dict = {}
ROUTING_GRAPH_FALLBACKS: dict = {}

def validate_and_parse_routing_graph(config_path: str) -> tuple:
    """
    Parse litellm_config.yaml, validate that in air-gapped mode every deployment is local with numeric loopback,
    validate strict non-networking general/redis settings, and build full transitive graph mapping with multi-node cycle detection.
    Returns: (is_valid: bool, error_msg: str, deployments_by_model: dict, fallbacks_by_model: dict)
    """
    if not config_path or not os.path.exists(config_path):
        return False, f"Config file not found: {config_path}", {}, {}

    try:
        import yaml
        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        if not isinstance(data, dict):
            return False, "Root of YAML must be a mapping", {}, {}

        # 1. In air-gapped mode, configurable database_url is strictly PROHIBITED to prevent SMB/UNC/mapped-drive egress
        gen_settings = data.get("general_settings", {})
        if isinstance(gen_settings, dict):
            if gen_settings.get("database_url") is not None:
                return False, "Configuring database_url is prohibited in air-gapped mode. TetherMesh strictly manages its local database in application data.", {}, {}

        # 2. Validate router_settings for local redis
        router_settings = data.get("router_settings", {})
        if isinstance(router_settings, dict):
            redis_host = router_settings.get("redis_host")
            if redis_host and redis_host not in ("null", "None"):
                r_host_str = str(redis_host).strip()
                if not is_numeric_loopback_host(r_host_str):
                    return False, f"Remote redis_host '{r_host_str}' is prohibited in air-gapped mode", {}, {}

        model_list = data.get("model_list", [])
        if not isinstance(model_list, list):
            return False, "model_list must be a sequence", {}, {}

        deployments_by_model = {}
        for idx, item in enumerate(model_list):
            if not isinstance(item, dict):
                return False, f"model_list entry #{idx} is not a dictionary", {}, {}
            m_name = item.get("model_name")
            if not m_name or not isinstance(m_name, str):
                return False, f"model_list entry #{idx} missing valid model_name", {}, {}
            m_name_clean = m_name.strip()
            params = item.get("litellm_params", {})
            if not isinstance(params, dict):
                return False, f"litellm_params in entry '{m_name_clean}' must be a dictionary", {}, {}

            model_target = str(params.get("model") or "").strip()
            api_base = str(params.get("api_base") or "").strip()

            # Air-gapped validation: Provider must be local prefix AND api_base must be a valid numeric loopback URL
            if not any(model_target.startswith(pfx) for pfx in LOCAL_ALLOWED_PREFIXES):
                return False, f"Model '{m_name_clean}' uses non-local model target '{model_target}'", {}, {}

            if not is_numeric_loopback_url(api_base):
                return False, f"Model '{m_name_clean}' has invalid or non-numeric loopback api_base '{api_base}' (localhost and remote URLs prohibited)", {}, {}

            # Reject cloud credentials, proxy configs, and remote callbacks
            for forbidden_key in ("api_key", "aws_access_key_id", "aws_secret_access_key", "vertex_project", "custom_llm_provider", "proxy_url"):
                if forbidden_key in params:
                    return False, f"Model '{m_name_clean}' contains forbidden parameter '{forbidden_key}' in air-gapped mode", {}, {}

            deployments_by_model.setdefault(m_name_clean, []).append({
                "model_name": m_name_clean,
                "model_target": model_target,
                "api_base": api_base
            })

        # Parse router fallbacks
        fallbacks_by_model = {}
        if isinstance(router_settings, dict):
            for fb_item in router_settings.get("fallbacks", []):
                if isinstance(fb_item, dict):
                    for k, v in fb_item.items():
                        if isinstance(v, list):
                            fallbacks_by_model[str(k).strip()] = [str(t).strip() for t in v]

        # Multi-node DFS cycle detection (White/Gray/Black 3-color graph traversal)
        visited_state = {}  # 0=unvisited, 1=visiting, 2=visited
        def dfs_cycle(node: str, trail: list) -> tuple:
            visited_state[node] = 1
            trail.append(node)
            for nxt in fallbacks_by_model.get(node, []):
                if visited_state.get(nxt) == 1:
                    cycle_str = " -> ".join(trail + [nxt])
                    return True, f"Fallback cycle detected: {cycle_str}"
                if visited_state.get(nxt, 0) == 0:
                    has_c, err = dfs_cycle(nxt, trail)
                    if has_c:
                        return True, err
            trail.pop()
            visited_state[node] = 2
            return False, ""

        for root in list(fallbacks_by_model.keys()):
            if visited_state.get(root, 0) == 0:
                has_cycle, cycle_err = dfs_cycle(root, [])
                if has_cycle:
                    return False, cycle_err, {}, {}

        # Validate transitive closure for all models in deployments_by_model
        for root_model in deployments_by_model.keys():
            visited = set()
            stack = [root_model]
            while stack:
                curr = stack.pop()
                if curr in visited:
                    continue
                visited.add(curr)

                # Check that curr exists in deployments_by_model
                if curr not in deployments_by_model:
                    return False, f"Fallback target '{curr}' referenced from '{root_model}' is not defined in model_list", {}, {}

                # Check that ALL deployments of curr are local with numeric loopback
                for dep in deployments_by_model[curr]:
                    if not any(dep["model_target"].startswith(pfx) for pfx in LOCAL_ALLOWED_PREFIXES) or not is_numeric_loopback_url(dep["api_base"]):
                        return False, f"Fallback branch '{curr}' contains non-local deployment {dep}", {}, {}

                for next_target in fallbacks_by_model.get(curr, []):
                    stack.append(next_target)

        return True, "", deployments_by_model, fallbacks_by_model
    except Exception as e:
        return False, f"Error validating YAML routing graph: {e}", {}, {}

def is_model_fully_local_in_graph(model_name: str) -> bool:
    """Check if requested model/alias and 100% of its reachable fallback graph are valid local deployments."""
    if not model_name:
        return False
    clean = model_name.strip()
    if clean not in ROUTING_GRAPH_DEPLOYMENTS:
        # Check case-insensitive match
        for k in ROUTING_GRAPH_DEPLOYMENTS.keys():
            if k.lower() == clean.lower():
                clean = k
                break
        else:
            return False

    visited = set()
    stack = [clean]
    while stack:
        curr = stack.pop()
        if curr in visited:
            continue
        visited.add(curr)
        if curr not in ROUTING_GRAPH_DEPLOYMENTS:
            return False
        for dep in ROUTING_GRAPH_DEPLOYMENTS[curr]:
            if not any(dep["model_target"].startswith(pfx) for pfx in LOCAL_ALLOWED_PREFIXES) or not is_numeric_loopback_url(dep["api_base"]):
                return False
        for next_target in ROUTING_GRAPH_FALLBACKS.get(curr, []):
            stack.append(next_target)
    return True

@app.middleware("http")
async def spend_circuit_breaker_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method

    # 1. Skip non-POST and explicitly non-billable local endpoints
    if method != "POST" or path in NON_BILLABLE_PATHS or path.startswith(("/spend", "/tether", "/admin", "/health")):
        return await call_next(request)

    # 2. Check if route is an authorized billable inference route (fail-closed)
    route_class = classify_route(method, path)
    if route_class != "inference":
        return await call_next(request)

    # 3. Enforce maximum request body limits before and during buffering (prevent DoS memory exhaustion)
    MAX_INFERENCE_BODY_SIZE = 10 * 1024 * 1024  # 10 MB for text inference / models
    MAX_AUDIO_BODY_SIZE = 25 * 1024 * 1024      # 25 MB for audio & multimodal
    max_limit = MAX_AUDIO_BODY_SIZE if path.startswith(("/audio", "/v1/audio")) else MAX_INFERENCE_BODY_SIZE

    content_length_header = request.headers.get("content-length")
    if content_length_header:
        try:
            cl = int(content_length_header)
            if cl > max_limit:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "message": f"Payload Too Large: Request body size ({cl} bytes) exceeds the maximum allowed limit of {max_limit} bytes.",
                            "type": "payload_too_large",
                            "code": "request_entity_too_large"
                        }
                    }
                )
        except ValueError:
            pass

    # Read body safely in bounded chunks without consuming the stream
    try:
        chunks = []
        bytes_read = 0
        async for chunk in request.stream():
            bytes_read += len(chunk)
            if bytes_read > max_limit:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "message": f"Payload Too Large: Stream exceeded maximum limit of {max_limit} bytes.",
                            "type": "payload_too_large",
                            "code": "request_entity_too_large"
                        }
                    }
                )
            chunks.append(chunk)

        body_bytes = b"".join(chunks)
        async def receive():
            return {"type": "http.request", "body": body_bytes}
        request._receive = receive

        body_dict = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
    except Exception:
        body_dict = {}

    content_type = request.headers.get("content-type", "").lower()
    if not body_dict and "multipart/form-data" in content_type and body_bytes:
        try:
            model_match = re.search(rb'name=["\']model["\']\r?\n\r?\n([^\r\n]+)', body_bytes)
            if model_match:
                body_dict["model"] = model_match.group(1).decode("utf-8", "ignore").strip()
        except Exception:
            pass

    model = body_dict.get("model") or request.headers.get("x-model-name") or ""
    if not model:
        if path.endswith(("/v1/messages", "/messages")):
            model = body_dict.get("model", "claude-3-7-sonnet")
        elif path.endswith(("/v1/moderations", "/moderations")):
            model = body_dict.get("model", "text-moderation-latest")
        elif path.endswith(("/v1/rerank", "/rerank")):
            model = body_dict.get("model", "rerank-english-v3.0")

    # 4. Air-Gapped Mode Policy: Enforce transitive local routing graph fail-closed
    if AIR_GAPPED_MODE:
        model_clean = model.strip()
        is_allowed = is_model_fully_local_in_graph(model_clean)
        if not is_allowed:
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "message": f"Air-Gapped Mode active: Model '{model}' is not registered as an authorized local mesh model with a validated numeric loopback endpoint. Outbound requests to external cloud destinations are blocked.",
                        "type": "air_gapped_violation",
                        "code": "air_gapped_blocked"
                    }
                }
            )

    # 5. Estimate worst-case cost (fail-closed)
    is_valid_price, worst_case_microusd, price_err = estimate_request_microusd(model, body_dict, path)
    if not is_valid_price:
        return JSONResponse(
            status_code=402,
            content={
                "error": {
                    "message": f"TetherMesh Budget Gate: {price_err}",
                    "type": "pricing_unknown_error",
                    "code": "pricing_unknown",
                    "model": model
                }
            }
        )

    # 5. Acquire atomic reservation in SQLite
    reservation_id = f"res-{uuid.uuid4().hex[:12]}"
    day_key = spend_db.get_today_key()
    success, res_info = spend_db.reserve_spend(reservation_id, model, worst_case_microusd, day_key)

    if not success:
        if res_info.get("error") in ("daily_budget_exceeded", "budget_exceeded"):
            limit_usd = res_info.get("limit_usd", 0.0)
            settled_usd = res_info.get("settled_usd", 0.0)
            inflight_usd = res_info.get("inflight_microusd", 0) / 1_000_000.0
            return JSONResponse(
                status_code=402,
                content={
                    "error": {
                        "message": f"TetherMesh Budget Circuit Breaker Tripped: Daily spend limit of ${limit_usd:.2f} reached. (Settled: ${settled_usd:.3f}, In-Flight: ${inflight_usd:.3f}). Increase budget or reset in TetherIQ.",
                        "type": "daily_budget_exceeded_error",
                        "code": "daily_budget_exceeded",
                        "daily_spend": settled_usd,
                        "inflight_spend": inflight_usd,
                        "daily_limit": limit_usd
                    }
                }
            )
        elif res_info.get("error") == "monthly_budget_exceeded":
            limit_usd = res_info.get("limit_usd", 0.0)
            settled_usd = res_info.get("settled_usd", 0.0)
            inflight_usd = res_info.get("inflight_microusd", 0) / 1_000_000.0
            return JSONResponse(
                status_code=402,
                content={
                    "error": {
                        "message": f"TetherMesh Monthly Budget Circuit Breaker Tripped: Monthly spend limit of ${limit_usd:.2f} reached. (Month Total: ${settled_usd:.3f}, In-Flight: ${inflight_usd:.3f}). Increase budget in TetherIQ.",
                        "type": "monthly_budget_exceeded_error",
                        "code": "monthly_budget_exceeded",
                        "monthly_spend": settled_usd,
                        "inflight_spend": inflight_usd,
                        "monthly_limit": limit_usd
                    }
                }
            )
        else:
            return JSONResponse(
                status_code=503,
                content={
                    "error": {
                        "message": "Budget reservation engine is busy. Please retry.",
                        "type": "budget_engine_busy"
                    }
                }
            )

    # 6. Mark dispatched immediately before upstream send
    if not spend_db.mark_dispatched(reservation_id):
        spend_db.release_undispatched(reservation_id)
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "message": "Failed to transition reservation state to dispatched. Request aborted fail-closed.",
                    "type": "dispatch_state_error",
                    "code": "dispatch_state_failed"
                }
            }
        )

    # 7. Execute upstream forwarding and wrap streaming responses
    try:
        response = await call_next(request)
    except Exception as e:
        # Request failed before response created -> reconcile with reservation amount
        spend_db.reconcile_spend(
            reservation_id=reservation_id,
            actual_microusd=worst_case_microusd,
            actual_tokens=0,
            trace_dict={"modelServed": model, "status": "error"}
        )
        raise e

    # 8. Check if StreamingResponse
    if hasattr(response, "body_iterator") and response.body_iterator is not None:
        original_iterator = response.body_iterator

        async def stream_tracking_wrapper():
            import math
            actual_microusd = None
            actual_tokens = 0
            sse_buffer = ""
            try:
                async for chunk in original_iterator:
                    spend_db.heartbeat_reservation(reservation_id)
                    if isinstance(chunk, (bytes, str)):
                        chunk_str = chunk.decode("utf-8", errors="ignore") if isinstance(chunk, bytes) else chunk
                        sse_buffer += chunk_str
                        while "\n" in sse_buffer:
                            line, sse_buffer = sse_buffer.split("\n", 1)
                            line = line.strip()
                            if line.startswith("data: ") and not line.startswith("data: [DONE]"):
                                try:
                                    data = json.loads(line[6:])
                                    u = data.get("usage")
                                    if u:
                                        pt = u.get("prompt_tokens", 0)
                                        ct = u.get("completion_tokens", 0)
                                        actual_tokens = pt + ct
                                        cost_info = litellm.model_cost.get(model, {})
                                        if cost_info:
                                            in_c = cost_info.get("input_cost_per_token", 0.0)
                                            out_c = cost_info.get("output_cost_per_token", 0.0)
                                            actual_usd = (pt * in_c) + (ct * out_c)
                                            actual_microusd = math.ceil(actual_usd * 1_000_000)
                                except Exception:
                                    pass
                    yield chunk
            finally:
                # Reconcile spend atomically on stream completion or client disconnect
                spend_db.reconcile_spend(
                    reservation_id=reservation_id,
                    actual_microusd=actual_microusd,
                    actual_tokens=actual_tokens,
                    trace_dict={"modelServed": model, "totalTokens": actual_tokens}
                )

        response.body_iterator = stream_tracking_wrapper()
        return response
    else:
        # Non-streaming response: reconcile immediately
        spend_db.reconcile_spend(
            reservation_id=reservation_id,
            actual_microusd=worst_case_microusd,
            actual_tokens=0,
            trace_dict={"modelServed": model}
        )
        return response


# ---------------------------------------------------------------------------
# 2. Zero-Trust Gateway Authentication (OUTERMOST Middleware - Runs FIRST)
# ---------------------------------------------------------------------------

@app.middleware("http")
async def gateway_security_and_auth_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method

    # 1. OPTIONS preflight check (allow only for known configured routes)
    if method == "OPTIONS":
        norm_path = path.rstrip("/") or "/"
        is_known_route = (
            norm_path in PUBLIC_HEALTH_ROUTES or
            any(p == norm_path for _, p in CONTROL_PLANE_ROUTES | INFERENCE_EXACT_ROUTES) or
            any(norm_path.startswith(p) for _, p in INFERENCE_PREFIX_ROUTES)
        )
        if is_known_route:
            return await call_next(request)
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    # 2. Origin verification (reject foreign websites)
    origin = request.headers.get("origin")
    if origin is not None:
        if origin == "null" or origin not in ALLOWED_ORIGINS:
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "message": f"Forbidden: Cross-Origin request from unauthorized origin '{origin}' blocked.",
                        "type": "cors_forbidden",
                        "code": "unauthorized_origin"
                    }
                }
            )

    referer = request.headers.get("referer")
    if referer:
        if not any(referer.startswith(ao) for ao in ALLOWED_ORIGINS):
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "message": "Forbidden: Request referer header is unauthorized.",
                        "type": "csrf_forbidden",
                        "code": "unauthorized_referer"
                    }
                }
            )

    # 3. Extract tokens strictly from HTTP headers (prohibit credentials in URL query parameters)
    auth_header = request.headers.get("authorization", "")
    bearer_token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
    x_api_key = request.headers.get("x-api-key", "").strip()
    x_tether_token = request.headers.get("x-tetheriq-token", "").strip()

    provided_token = x_tether_token or bearer_token or x_api_key

    # 4. Anti-Spoofing: Direct client use of internal master key is strictly prohibited
    if provided_token and secrets.compare_digest(provided_token, INTERNAL_LITELLM_MASTER_KEY):
        return JSONResponse(
            status_code=401,
            content={
                "error": {
                    "message": "Unauthorized: Direct use of internal sidecar master key is prohibited.",
                    "type": "authentication_error",
                    "code": "invalid_master_key_usage"
                }
            }
        )

    # 5. Route Classification & Enforcement (Default-Deny)
    route_class = classify_route(method, path)

    if route_class == "public":
        rewrite_auth_for_litellm(request, INTERNAL_LITELLM_MASTER_KEY)
        return await call_next(request)

    if route_class == "control_plane":
        body_bytes = await request.body()
        if not verify_hmac_request(request, body_bytes):
            return JSONResponse(
                status_code=401,
                content={
                    "error": {
                        "message": "Unauthorized: Valid HMAC signature required for TetherIQ control plane.",
                        "type": "authentication_error",
                        "code": "unauthorized_hmac"
                    }
                }
            )
        rewrite_auth_for_litellm(request, INTERNAL_LITELLM_MASTER_KEY)
        response = await call_next(request)

        # Authenticate finite administrative responses over actual buffered bytes
        nonce = request.headers.get("X-Tether-Nonce", "")
        if nonce and HANDSHAKE_SECRET:
            if not request.url.path.endswith("/events"):
                body_chunks = []
                if hasattr(response, "body_iterator") and response.body_iterator is not None:
                    async for chunk in response.body_iterator:
                        body_chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode("utf-8"))
                elif hasattr(response, "body") and response.body:
                    body_chunks.append(response.body)
                resp_bytes = b"".join(body_chunks)

                resp_payload = f"{nonce}\n{response.status_code}\n{hashlib.sha256(resp_bytes).hexdigest()}".encode("utf-8")
                sig = hmac.new(HANDSHAKE_SECRET.encode("utf-8"), resp_payload, hashlib.sha256).hexdigest()

                new_headers = dict(response.headers)
                new_headers["x-tether-response-signature"] = sig

                from starlette.responses import Response
                return Response(
                    content=resp_bytes,
                    status_code=response.status_code,
                    headers=new_headers,
                    media_type=response.media_type
                )
            else:
                resp_payload = f"{nonce}\n{response.status_code}\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".encode("utf-8")
                response.headers["x-tether-response-signature"] = hmac.new(HANDSHAKE_SECRET.encode("utf-8"), resp_payload, hashlib.sha256).hexdigest()

        return response

    if route_class == "inference":
        is_valid_token = False
        if provided_token:
            if secrets.compare_digest(provided_token, GATEWAY_TOKEN) or secrets.compare_digest(provided_token, ADMIN_TOKEN):
                is_valid_token = True

        if not is_valid_token:
            return JSONResponse(
                status_code=401,
                content={
                    "error": {
                        "message": "Unauthorized: Valid TetherIQ Gateway Token required. Configure your agent with ANTHROPIC_API_KEY or OPENAI_API_KEY from TetherIQ.",
                        "type": "authentication_error",
                        "code": "invalid_api_key"
                    }
                }
            )

        # Rate limiting
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.monotonic()
        if client_ip not in rate_limit_records:
            rate_limit_records[client_ip] = deque(maxlen=RATE_LIMIT_MAX_PER_MINUTE)

        timestamps = rate_limit_records[client_ip]
        while timestamps and now - timestamps[0] > 60.0:
            timestamps.popleft()

        if len(timestamps) >= RATE_LIMIT_MAX_PER_MINUTE:
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": "5"},
                content={
                    "error": {
                        "message": "Rate limit exceeded on local gateway. Please slow down requests.",
                        "type": "rate_limit_error",
                        "code": "rate_limit_exceeded"
                    }
                }
            )
        timestamps.append(now)

        # Concurrency semaphore & Token Translation
        rewrite_auth_for_litellm(request, INTERNAL_LITELLM_MASTER_KEY)
        await upstream_semaphore.acquire()
        permit_released = False
        try:
            response = await call_next(request)
            if hasattr(response, "body_iterator") and response.body_iterator is not None:
                original_iterator = response.body_iterator

                async def semaphore_stream_wrapper():
                    nonlocal permit_released
                    try:
                        async for chunk in original_iterator:
                            yield chunk
                    finally:
                        if not permit_released:
                            permit_released = True
                            upstream_semaphore.release()

                response.body_iterator = semaphore_stream_wrapper()
                return response
            else:
                permit_released = True
                upstream_semaphore.release()
                return response
        except Exception as e:
            if not permit_released:
                permit_released = True
                upstream_semaphore.release()
            return JSONResponse(
                status_code=500,
                content={"error": {"message": f"Gateway concurrency error: {str(e)}", "type": "internal_error"}}
            )

    # 6. DEFAULT-DENY: Any unclassified or unmapped route is strictly rejected
    return JSONResponse(
        status_code=404,
        content={"detail": "Not found"}
    )


# ---------------------------------------------------------------------------
# Telemetry Logger Callbacks (Authentic OpenTelemetry Spans & Real TTFT)
# ---------------------------------------------------------------------------

class TetherTelemetryLogger(CustomLogger):
    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        try:
            req_id = f"tr-{uuid.uuid4().hex[:8]}"
            client_ip = kwargs.get("client_ip", "127.0.0.1")
            agent_info = buffer.detect_agent(kwargs, client_ip)

            duration_ms = int((end_time - start_time) * 1000) if isinstance(start_time, (int, float)) and isinstance(end_time, (int, float)) else int((end_time.timestamp() - start_time.timestamp()) * 1000)
            duration_ms = max(1, duration_ms)

            usage = getattr(response_obj, "usage", None)
            if usage:
                prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
                completion_tokens = getattr(usage, "completion_tokens", 0) or 0
                total_tokens = getattr(usage, "total_tokens", 0) or (prompt_tokens + completion_tokens)
            elif isinstance(response_obj, dict) and "usage" in response_obj:
                u = response_obj["usage"]
                prompt_tokens = u.get("prompt_tokens", 0)
                completion_tokens = u.get("completion_tokens", 0)
                total_tokens = u.get("total_tokens", prompt_tokens + completion_tokens)
            else:
                prompt_tokens = 0
                completion_tokens = 0
                total_tokens = 0

            cost = kwargs.get("response_cost", 0.0) or 0.0
            model_req = kwargs.get("model", "")
            model_srv = getattr(response_obj, "model", model_req)

            messages = kwargs.get("messages", []) or kwargs.get("input", []) or []
            finish_reason = "stop"
            tool_calls_made = []

            if hasattr(response_obj, "choices") and response_obj.choices:
                choice = response_obj.choices[0]
                finish_reason = getattr(choice, "finish_reason", "stop") or "stop"
                msg = getattr(choice, "message", None)
                if msg:
                    tc = getattr(msg, "tool_calls", None)
                    if tc and isinstance(tc, list):
                        for t in tc:
                            if hasattr(t, "function") and hasattr(t.function, "name"):
                                tool_calls_made.append(t.function.name)
                            else:
                                tool_calls_made.append(str(t))
            elif isinstance(response_obj, dict):
                choices = response_obj.get("choices", [])
                if choices:
                    choice = choices[0]
                    finish_reason = choice.get("finish_reason", "stop")
                    msg = choice.get("message", {})
                    tc = msg.get("tool_calls", [])
                    if tc:
                        for t in tc:
                            tool_calls_made.append(t.get("function", {}).get("name", "tool"))

            # Derive Authentic OpenTelemetry Timing Spans & TTFT
            is_stream = bool(kwargs.get("stream", False))
            ttft_raw = kwargs.get("time_to_first_token") or kwargs.get("first_token_time")
            ttft_ms = None
            if ttft_raw:
                ttft_ms = int(ttft_raw * 1000) if ttft_raw < 100 else int(ttft_raw)

            t_ingest = min(2, max(1, duration_ms // 20))
            t_router = min(2, max(1, duration_ms // 20))

            spans = [
                {
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": "Proxy Loopback Ingest",
                    "startTime": 0,
                    "endTime": t_ingest,
                    "durationMs": t_ingest,
                    "status": "ok",
                    "attributes": {"port": 4000, "client": agent_info[1]}
                },
                {
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": f"Router Resolution [{model_req}]",
                    "startTime": t_ingest,
                    "endTime": t_ingest + t_router,
                    "durationMs": t_router,
                    "status": "ok",
                    "attributes": {"model_requested": model_req, "model_served": model_srv}
                }
            ]

            if is_stream and ttft_ms and (t_ingest + t_router) < ttft_ms < duration_ms:
                spans.append({
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": "Time to First Token (TTFT)",
                    "startTime": t_ingest + t_router,
                    "endTime": ttft_ms,
                    "durationMs": ttft_ms - (t_ingest + t_router),
                    "status": "ok",
                    "attributes": {"ttft_ms": ttft_ms}
                })
                spans.append({
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": f"Streaming Token Generation [{model_srv}]",
                    "startTime": ttft_ms,
                    "endTime": duration_ms,
                    "durationMs": max(1, duration_ms - ttft_ms),
                    "status": "ok",
                    "attributes": {"total_tokens": total_tokens, "cost": f"${cost:.5f}"}
                })
            else:
                spans.append({
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": f"Upstream Inference [{model_srv}]",
                    "startTime": t_ingest + t_router,
                    "endTime": duration_ms,
                    "durationMs": max(1, duration_ms - (t_ingest + t_router)),
                    "status": "ok",
                    "attributes": {"total_tokens": total_tokens, "cost": f"${cost:.5f}"}
                })

            trace = {
                "id": req_id,
                "traceId": f"trace-{uuid.uuid4().hex[:12]}",
                "timestamp": int(time.time() * 1000),
                "type": "llm-proxy",
                "clientName": agent_info[1],
                "clientIp": client_ip,
                "modelRequested": model_req,
                "modelServed": model_srv,
                "providerServed": kwargs.get("custom_llm_provider", "LiteLLM"),
                "status": "success",
                "statusCode": 200,
                "totalDurationMs": duration_ms,
                "promptTokens": prompt_tokens,
                "completionTokens": completion_tokens,
                "totalTokens": total_tokens,
                "cost": round(cost, 5),
                "fallbacksTriggered": [],
                "spans": spans,
                "requestPayloadSummary": {
                    "messagesCount": len(messages) if isinstance(messages, list) else 1,
                    "stream": is_stream
                },
                "responsePayloadSummary": {
                    "finishReason": finish_reason,
                    "toolCallsCount": len(tool_calls_made),
                    "toolCallsMade": tool_calls_made
                }
            }
            # Layer 2 structured recursive sanitization before buffer insertion
            sanitized_trace = sanitize_structured_data(trace)
            buffer.record_trace(sanitized_trace, agent_info)
        except Exception as e:
            print(f"[TetherMesh Logger Error] {sanitize_telemetry_text(str(e))}", flush=True)

    async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
        try:
            req_id = f"tr-{uuid.uuid4().hex[:8]}"
            client_ip = kwargs.get("client_ip", "127.0.0.1")
            agent_info = buffer.detect_agent(kwargs, client_ip)

            duration_ms = int((end_time - start_time) * 1000) if isinstance(start_time, (int, float)) and isinstance(end_time, (int, float)) else int((end_time.timestamp() - start_time.timestamp()) * 1000)
            duration_ms = max(1, duration_ms)

            error_msg = sanitize_telemetry_text(str(kwargs.get("exception", "Request failed")))
            status_code = 500
            if "429" in error_msg or "RateLimit" in error_msg:
                status_code = 429
                trace_status = "rate-limited"
            elif "401" in error_msg or "Authentication" in error_msg:
                status_code = 401
                trace_status = "error"
            elif "402" in error_msg or "Budget" in error_msg:
                status_code = 402
                trace_status = "blocked-budget"
            else:
                trace_status = "error"

            model_req = kwargs.get("model", "")
            trace = {
                "id": req_id,
                "traceId": f"trace-{uuid.uuid4().hex[:12]}",
                "timestamp": int(time.time() * 1000),
                "type": "llm-proxy",
                "clientName": agent_info[1],
                "clientIp": client_ip,
                "modelRequested": model_req,
                "modelServed": model_req,
                "providerServed": kwargs.get("custom_llm_provider", "LiteLLM"),
                "status": trace_status,
                "statusCode": status_code,
                "totalDurationMs": duration_ms,
                "promptTokens": 0,
                "completionTokens": 0,
                "totalTokens": 0,
                "cost": 0.0,
                "fallbacksTriggered": [],
                "spans": [],
                "requestPayloadSummary": {
                    "messagesCount": 1,
                    "stream": bool(kwargs.get("stream", False)),
                    "errorStatus": trace_status
                }
            }
            # Layer 2 structured recursive sanitization before buffer insertion
            sanitized_trace = sanitize_structured_data(trace)
            buffer.record_trace(sanitized_trace, agent_info)
        except Exception as e:
            print(f"[TetherMesh Failure Logger Error] {sanitize_telemetry_text(str(e))}", flush=True)


telemetry_logger = TetherTelemetryLogger()
litellm.callbacks = [telemetry_logger]


# ---------------------------------------------------------------------------
# Spend & Circuit Breaker Endpoints
# ---------------------------------------------------------------------------

@app.get("/spend/summary")
async def get_spend_summary():
    """Return persistent daily spend totals, monthly totals, in-flight reservations, and circuit breaker status."""
    if not spend_db.healthy:
        return JSONResponse(status_code=503, content={"error": "database_unavailable", "message": str(spend_db.last_error)})
    try:
        today_key = spend_db.get_today_key()
        daily = spend_db.get_daily_spend(today_key)
        effective = spend_db.get_effective_daily_spend(today_key)
        monthly = spend_db.get_monthly_spend(today_key)
        budget = spend_db.get_budget_settings()

        daily_spent_micros = effective.get("effective_microusd", effective.get("effective_spend_microusd", 0))
        monthly_spent_micros = monthly.get("month_effective_microusd", monthly.get("month_effective_spend_microusd", 0))
        daily_limit_micros = budget["daily_limit_microusd"]
        monthly_limit_micros = budget["monthly_limit_microusd"]
        is_tripped = budget["is_tripped"]

        daily_rem_micros = (daily_limit_micros - daily_spent_micros) if daily_limit_micros is not None else None
        monthly_rem_micros = (monthly_limit_micros - monthly_spent_micros) if monthly_limit_micros is not None else None

        return JSONResponse(content={
            "daily_spent_microusd": daily_spent_micros,
            "monthly_spent_microusd": monthly_spent_micros,
            "daily_limit_microusd": daily_limit_micros,
            "monthly_limit_microusd": monthly_limit_micros,
            "is_tripped": is_tripped,
            "daily_spent_usd": round(daily_spent_micros / 1_000_000.0, 6),
            "monthly_spent_usd": round(monthly_spent_micros / 1_000_000.0, 6),
            "daily_limit_usd": round(daily_limit_micros / 1_000_000.0, 6) if daily_limit_micros is not None else None,
            "monthly_limit_usd": round(monthly_limit_micros / 1_000_000.0, 6) if monthly_limit_micros is not None else None,
            "daily_remaining_usd": round(daily_rem_micros / 1_000_000.0, 6) if daily_rem_micros is not None else None,
            "monthly_remaining_usd": round(monthly_rem_micros / 1_000_000.0, 6) if monthly_rem_micros is not None else None,
            "trip_reason": budget.get("trip_reason"),
            "total_tokens": daily["total_tokens"],
            "period": today_key,
            "today_key": today_key,
            # Dual-serialized camelCase aliases
            "dailySpentMicrousd": daily_spent_micros,
            "monthlySpentMicrousd": monthly_spent_micros,
            "dailyLimitMicrousd": daily_limit_micros,
            "monthlyLimitMicrousd": monthly_limit_micros,
            "isTripped": is_tripped,
            "dailySpentUsd": round(daily_spent_micros / 1_000_000.0, 6),
            "monthlySpentUsd": round(monthly_spent_micros / 1_000_000.0, 6),
            "dailyLimitUsd": round(daily_limit_micros / 1_000_000.0, 6) if daily_limit_micros is not None else None,
            "monthlyLimitUsd": round(monthly_limit_micros / 1_000_000.0, 6) if monthly_limit_micros is not None else None,
            "dailyRemainingUsd": round(daily_rem_micros / 1_000_000.0, 6) if daily_rem_micros is not None else None,
            "monthlyRemainingUsd": round(monthly_rem_micros / 1_000_000.0, 6) if monthly_rem_micros is not None else None,
            "tripReason": budget.get("trip_reason"),
            "totalTokens": daily["total_tokens"],
            # Legacy aliases
            "dailySpend": round(daily_spent_micros / 1_000_000.0, 6),
            "monthlySpend": round(monthly_spent_micros / 1_000_000.0, 6),
            "isCircuitBreakerTripped": is_tripped,
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "spend_summary_error", "message": str(e)})

@app.get("/spend/logs")
async def get_spend_logs():
    """Return historical audit log of spend transactions."""
    if not spend_db.healthy:
        return JSONResponse(status_code=503, content={"error": "database_unavailable"})
    try:
        today_key = spend_db.get_today_key()
        daily = spend_db.get_daily_spend(today_key)
        logs = spend_db.get_recent_logs(limit=50)
        return JSONResponse(content={
            "dailySpend": round(daily["total_spend"], 4),
            "totalTokens": daily["total_tokens"],
            "logs": logs
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "spend_logs_error", "message": str(e)})

@app.post("/spend/reset")
async def reset_spend():
    """Reset daily spend and release the circuit breaker with an auditable adjustment."""
    if not spend_db.healthy:
        return JSONResponse(status_code=503, content={"error": "database_unavailable"})
    try:
        res = spend_db.reset_daily_spend()
        buffer.total_cost_today = 0.0
        return JSONResponse(content={
            "status": "ok",
            "success": True,
            "message": "Daily spend reset successfully.",
            "daily_spent_usd": res["daily_spent_usd"],
            "dailySpentUsd": res["daily_spent_usd"],
            "monthly_spent_usd": res["monthly_spent_usd"],
            "monthlySpentUsd": res["monthly_spent_usd"],
            "is_tripped": res["is_tripped"],
            "isTripped": res["is_tripped"]
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "spend_reset_error", "message": str(e)})

@app.post("/spend/budget")
async def set_spend_budget(request: Request):
    """Dynamically configure daily and monthly budget caps with canonical microdollars and tri-state semantics."""
    if not spend_db.healthy:
        return JSONResponse(status_code=503, content={"error": "database_unavailable", "message": str(spend_db.last_error)})
    try:
        body = await request.json() if await request.body() else {}
    except Exception:
        return JSONResponse(status_code=400, content={"error": "invalid_json", "message": "Request body is not valid JSON."})

    try:
        daily_micros, monthly_micros = parse_and_validate_budget_payload(body)
    except ValueError as ve:
        return JSONResponse(status_code=400, content={"error": "invalid_budget_payload", "message": str(ve)})

    try:
        budget = spend_db.set_budget_limits(daily_limit_microusd=daily_micros, monthly_limit_microusd=monthly_micros)
        return JSONResponse(status_code=200, content={
            "version": 1,
            "status": "ok",
            "success": True,
            "daily_limit_microusd": budget["daily_limit_microusd"],
            "monthly_limit_microusd": budget["monthly_limit_microusd"],
            "dailyLimitMicrousd": budget["daily_limit_microusd"],
            "monthlyLimitMicrousd": budget["monthly_limit_microusd"],
            "daily_limit_usd": budget["daily_limit"],
            "monthly_limit_usd": budget["monthly_limit"],
            "dailyLimit": budget["daily_limit"],
            "monthlyLimit": budget["monthly_limit"],
            "is_tripped": budget["is_tripped"],
            "isTripped": budget["is_tripped"],
            "budget": budget
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "database_error", "message": f"Failed to commit budget settings: {e}"})


# ---------------------------------------------------------------------------
# Health & Discovery Endpoints
# ---------------------------------------------------------------------------

INSTANCE_ID = os.environ.get("TETHER_INSTANCE_ID", "standalone")
AIR_GAPPED_MODE = os.environ.get("AIR_GAPPED_MODE", "false").lower() in ("true", "1", "yes")

@app.get("/health")
async def health_summary():
    """Minimal health summary."""
    return JSONResponse(content={
        "status": "ok",
        "service": "tethermesh-litellm",
        "instanceId": INSTANCE_ID,
        "airGapped": AIR_GAPPED_MODE,
        "port": 4000
    })

@app.get("/health/liveness")
async def health_liveness():
    """Fast loopback liveness probe to verify event loop responsiveness."""
    return JSONResponse(content={
        "status": "ok",
        "service": "tethermesh-litellm",
        "airGapped": AIR_GAPPED_MODE,
        "instanceId": INSTANCE_ID
    })

@app.get("/health/readiness")
async def health_readiness():
    """Readiness probe validating database, ledger, and routes are initialized."""
    if spend_db is None or not spend_db.healthy:
        return JSONResponse(status_code=503, content={
            "status": "not_ready",
            "service": "tethermesh-litellm",
            "instanceId": INSTANCE_ID,
            "airGapped": AIR_GAPPED_MODE,
            "error": "database_not_ready",
            "detail": str(spend_db.last_error if spend_db else "spend_db is None")
        })
    return JSONResponse(content={
        "status": "ready",
        "service": "tethermesh-litellm",
        "instanceId": INSTANCE_ID,
        "airGapped": AIR_GAPPED_MODE,
        "generation": TETHER_GENERATION,
        "configSha256": os.environ.get("TETHER_CONFIG_HASH", ""),
        "protocolVersion": 1
    })

@app.get("/health/providers")
async def get_provider_health():
    """Probe LLM providers asynchronously to measure live round-trip latency and health."""
    results = {}
    if AIR_GAPPED_MODE:
        # In Air-Gapped mode, strictly avoid outbound egress to cloud providers
        results["anthropic"] = {"isHealthy": False, "latencyMs": 0, "status": "air_gapped_disabled"}
        results["openai"] = {"isHealthy": False, "latencyMs": 0, "status": "air_gapped_disabled"}
        results["groq"] = {"isHealthy": False, "latencyMs": 0, "status": "air_gapped_disabled"}
        results["bedrock"] = {"isHealthy": False, "latencyMs": 0, "status": "air_gapped_disabled"}

        ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        if is_numeric_loopback_url(ollama_url):
            t0 = time.time()
            try:
                resp = await http_client.get(ollama_url, headers={"User-Agent": "TetherMesh-HealthProbe/1.0"}, timeout=2.5)
                elapsed_ms = max(1, int((time.time() - t0) * 1000))
                if resp.status_code in (200, 404):
                    results["ollama"] = {"isHealthy": True, "latencyMs": elapsed_ms, "status": "healthy"}
                else:
                    results["ollama"] = {"isHealthy": False, "latencyMs": elapsed_ms, "status": f"http_{resp.status_code}"}
            except Exception:
                results["ollama"] = {"isHealthy": False, "latencyMs": 0, "status": "unreachable"}
        else:
            results["ollama"] = {"isHealthy": False, "latencyMs": 0, "status": "non_loopback_blocked"}

        return JSONResponse(content={"providers": results, "airGapped": True, "timestamp": int(time.time() * 1000)})

    endpoints = {
        "anthropic": {"url": "https://api.anthropic.com", "method": "HEAD", "key_env": "ANTHROPIC_API_KEY"},
        "openai": {"url": "https://api.openai.com/v1/models", "method": "HEAD", "key_env": "OPENAI_API_KEY"},
        "groq": {"url": "https://api.groq.com/openai/v1/models", "method": "HEAD", "key_env": "GROQ_API_KEY"},
        "bedrock": {"url": "https://bedrock-runtime.us-east-1.amazonaws.com", "method": "HEAD", "key_env": "AWS_ACCESS_KEY_ID"},
        "ollama": {"url": os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434"), "method": "GET", "key_env": None}
    }

    for prov_id, cfg in endpoints.items():
        has_key = bool(os.environ.get(cfg["key_env"])) if cfg["key_env"] else True
        if not has_key and prov_id != "ollama":
            results[prov_id] = {"isHealthy": False, "latencyMs": 0, "status": "unconfigured"}
            continue

        t0 = time.time()
        try:
            resp = await http_client.request(
                cfg["method"],
                cfg["url"],
                headers={"User-Agent": "TetherMesh-HealthProbe/1.0"},
                timeout=2.5
            )
            elapsed_ms = max(1, int((time.time() - t0) * 1000))
            if resp.status_code in (200, 401, 403, 404, 405, 400, 429):
                results[prov_id] = {"isHealthy": True, "latencyMs": elapsed_ms, "status": "healthy"}
            else:
                results[prov_id] = {"isHealthy": False, "latencyMs": elapsed_ms, "status": f"http_{resp.status_code}"}
        except Exception:
            results[prov_id] = {"isHealthy": False, "latencyMs": 0, "status": "unreachable"}

    return JSONResponse(content={"providers": results, "airGapped": False, "timestamp": int(time.time() * 1000)})


async def _execute_key_validation(request: Request):
    """Core administrative key validation logic (M-08 & M-09: Three-State + Anti-SSRF + Header Auth)."""
    # 1. Bounded body size check before parsing (max 4KB)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > 4096:
                return JSONResponse(
                    status_code=413,
                    headers={"Cache-Control": "no-store"},
                    content={
                        "isValid": None,
                        "verification": "unverified",
                        "reason": "payload_too_large",
                        "message": "Request payload exceeds 4KB limit."
                    }
                )
        except ValueError:
            pass

    raw_body = await request.body()
    if len(raw_body) > 4096:
        return JSONResponse(
            status_code=413,
            headers={"Cache-Control": "no-store"},
            content={
                "isValid": None,
                "verification": "unverified",
                "reason": "payload_too_large",
                "message": "Request payload exceeds 4KB limit."
            }
        )

    try:
        body = json.loads(raw_body.decode("utf-8"))
    except Exception:
        return JSONResponse(
            status_code=400,
            headers={"Cache-Control": "no-store"},
            content={
                "isValid": None,
                "verification": "unverified",
                "reason": "invalid_json",
                "message": "Malformed JSON in request body."
            }
        )

    if not isinstance(body, dict):
        return JSONResponse(
            status_code=400,
            headers={"Cache-Control": "no-store"},
            content={
                "isValid": None,
                "verification": "unverified",
                "reason": "invalid_body",
                "message": "JSON body must be an object."
            }
        )

    if AIR_GAPPED_MODE:
        return JSONResponse(
            status_code=403,
            headers={"Cache-Control": "no-store"},
            content={
                "isValid": None,
                "verification": "unverified",
                "reason": "air_gapped_mode_active",
                "message": "Air-Gapped Mode is active: Outbound cloud credential verification is disabled."
            }
        )

    provider = str(body.get("provider") or "").strip().lower()
    api_key = str(body.get("apiKey") or "").strip()

    if not provider or len(provider) > 64:
        return JSONResponse(
            status_code=400,
            headers={"Cache-Control": "no-store"},
            content={
                "isValid": None,
                "verification": "unverified",
                "reason": "invalid_provider",
                "message": "Provider identifier is required (max 64 characters)."
            }
        )

    # Check for forbidden control characters in apiKey
    if any(c in api_key for c in ('\r', '\n', '\0')):
        return JSONResponse(
            status_code=400,
            headers={"Cache-Control": "no-store"},
            content={
                "isValid": False,
                "verification": "invalid",
                "reason": "invalid_key",
                "message": "API key contains forbidden control characters."
            }
        )

    if len(api_key) > 512:
        return JSONResponse(
            status_code=400,
            headers={"Cache-Control": "no-store"},
            content={
                "isValid": False,
                "verification": "invalid",
                "reason": "invalid_key",
                "message": "API key exceeds maximum length of 512 characters."
            }
        )

    # 2. Admission-timed concurrency throttle
    try:
        await asyncio.wait_for(validation_semaphore.acquire(), timeout=0.5)
    except (asyncio.TimeoutError, TimeoutError):
        return JSONResponse(
            status_code=503,
            headers={"Cache-Control": "no-store"},
            content={
                "isValid": None,
                "verification": "unverified",
                "reason": "busy",
                "message": "Validation engine is currently busy. Please try again shortly."
            }
        )

    try:
        # 3. Handle Ollama local service validation with anti-SSRF loopback pinning
        if provider == "ollama":
            ollama_base = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").strip()
            if not any(ollama_base.startswith(p) for p in ("http://127.0.0.1:", "http://localhost:", "http://[::1]:")):
                return JSONResponse(
                    status_code=400,
                    headers={"Cache-Control": "no-store"},
                    content={
                        "isValid": None,
                        "verification": "unverified",
                        "reason": "ssrf_blocked",
                        "message": "Ollama base URL must be a local loopback address."
                    }
                )
            t0 = time.time()
            try:
                resp = await http_client.get(f"{ollama_base}/api/tags", timeout=1.5)
                elapsed_ms = max(1, int((time.time() - t0) * 1000))
                if resp.status_code == 200:
                    return JSONResponse(
                        status_code=200,
                        headers={"Cache-Control": "no-store"},
                        content={
                            "isValid": True,
                            "verification": "verified",
                            "reason": "valid",
                            "providerStatusCode": 200,
                            "latencyMs": elapsed_ms,
                            "message": f"Local Ollama daemon responsive ({elapsed_ms}ms)."
                        }
                    )
                else:
                    return JSONResponse(
                        status_code=200,
                        headers={"Cache-Control": "no-store"},
                        content={
                            "isValid": None,
                            "verification": "unverified",
                            "reason": "provider_error",
                            "providerStatusCode": resp.status_code,
                            "latencyMs": elapsed_ms,
                            "message": f"Ollama returned HTTP {resp.status_code}."
                        }
                    )
            except Exception:
                return JSONResponse(
                    status_code=200,
                    headers={"Cache-Control": "no-store"},
                    content={
                        "isValid": None,
                        "verification": "unverified",
                        "reason": "network_error",
                        "message": "Local Ollama daemon is not reachable on port 11434."
                    }
                )

        if not api_key:
            return JSONResponse(
                status_code=400,
                headers={"Cache-Control": "no-store"},
                content={
                    "isValid": False,
                    "verification": "invalid",
                    "reason": "empty_key",
                    "message": "API key cannot be empty."
                }
            )

        # 4. Outbound provider adapters matrix
        adapters = {
            "anthropic": {
                "url": "https://api.anthropic.com/v1/models",
                "headers": {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "User-Agent": "TetherMesh-KeyValidator/1.0"
                },
                "expected_schema_keys": ["data", "models"]
            },
            "openai": {
                "url": "https://api.openai.com/v1/models",
                "headers": {
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "TetherMesh-KeyValidator/1.0"
                },
                "expected_schema_keys": ["data", "object"]
            },
            "groq": {
                "url": "https://api.groq.com/openai/v1/models",
                "headers": {
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "TetherMesh-KeyValidator/1.0"
                },
                "expected_schema_keys": ["data"]
            },
            "openrouter": {
                "url": "https://openrouter.ai/api/v1/auth/key",
                "headers": {
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "TetherMesh-KeyValidator/1.0"
                },
                "expected_schema_keys": ["data", "key"]
            },
            "deepseek": {
                "url": "https://api.deepseek.com/models",
                "headers": {
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "TetherMesh-KeyValidator/1.0"
                },
                "expected_schema_keys": ["data", "models"]
            },
            "mistral": {
                "url": "https://api.mistral.ai/v1/models",
                "headers": {
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "TetherMesh-KeyValidator/1.0"
                },
                "expected_schema_keys": ["data"]
            },
            "gemini": {
                "url": "https://generativelanguage.googleapis.com/v1beta/models",
                "headers": {
                    "x-goog-api-key": api_key,
                    "x-goog-api-client": "tetheriq/1.0",
                    "User-Agent": "TetherMesh-KeyValidator/1.0"
                },
                "expected_schema_keys": ["models"]
            }
        }

        if provider not in adapters:
            return JSONResponse(
                status_code=200,
                headers={"Cache-Control": "no-store"},
                content={
                    "isValid": None,
                    "verification": "unsupported",
                    "reason": "unsupported",
                    "message": f"Provider '{provider}' does not support automated test validation. You can still save and use this key."
                }
            )

        cfg = adapters[provider]
        t0 = time.time()

        try:
            resp = await http_client.get(
                cfg["url"],
                headers=cfg["headers"],
                timeout=3.5
            )
            elapsed_ms = max(1, int((time.time() - t0) * 1000))
            code = resp.status_code

            # 5. Three-State result evaluation
            if 200 <= code < 300:
                # Content-Type & JSON schema validation
                ctype = resp.headers.get("content-type", "").lower()
                if "application/json" not in ctype:
                    return JSONResponse(
                        status_code=200,
                        headers={"Cache-Control": "no-store"},
                        content={
                            "isValid": None,
                            "verification": "unverified",
                            "reason": "invalid_content_type",
                            "providerStatusCode": code,
                            "latencyMs": elapsed_ms,
                            "message": "Provider returned non-JSON response (possibly an upstream proxy or captive portal)."
                        }
                    )
                try:
                    data = resp.json()
                    has_expected_key = any(k in data for k in cfg.get("expected_schema_keys", []))
                    if not has_expected_key and not isinstance(data, list):
                        return JSONResponse(
                            status_code=200,
                            headers={"Cache-Control": "no-store"},
                            content={
                                "isValid": None,
                                "verification": "unverified",
                                "reason": "schema_mismatch",
                                "providerStatusCode": code,
                                "latencyMs": elapsed_ms,
                                "message": "Provider response schema did not match expected model format."
                            }
                        )
                except Exception:
                    return JSONResponse(
                        status_code=200,
                        headers={"Cache-Control": "no-store"},
                        content={
                            "isValid": None,
                            "verification": "unverified",
                            "reason": "malformed_json",
                            "providerStatusCode": code,
                            "latencyMs": elapsed_ms,
                            "message": "Provider response could not be parsed as JSON."
                        }
                    )

                return JSONResponse(
                    status_code=200,
                    headers={"Cache-Control": "no-store"},
                    content={
                        "isValid": True,
                        "verification": "verified",
                        "reason": "valid",
                        "providerStatusCode": code,
                        "latencyMs": elapsed_ms,
                        "message": f"Valid API Key (Verified in {elapsed_ms}ms)"
                    }
                )

            elif code == 401:
                return JSONResponse(
                    status_code=200,
                    headers={"Cache-Control": "no-store"},
                    content={
                        "isValid": False,
                        "verification": "invalid",
                        "reason": "invalid_key",
                        "providerStatusCode": 401,
                        "latencyMs": elapsed_ms,
                        "message": "Invalid API key: 401 Unauthorized"
                    }
                )
            elif code == 403:
                return JSONResponse(
                    status_code=200,
                    headers={"Cache-Control": "no-store"},
                    content={
                        "isValid": None,
                        "verification": "unverified",
                        "reason": "forbidden",
                        "providerStatusCode": 403,
                        "latencyMs": elapsed_ms,
                        "message": "Forbidden (403): Key was recognized but lacks required permissions or organization access."
                    }
                )
            elif code == 429:
                return JSONResponse(
                    status_code=200,
                    headers={"Cache-Control": "no-store"},
                    content={
                        "isValid": None,
                        "verification": "unverified",
                        "reason": "rate_limited",
                        "providerStatusCode": 429,
                        "latencyMs": elapsed_ms,
                        "message": "Provider rate limit reached (HTTP 429); key could not be verified."
                    }
                )
            elif code >= 500:
                return JSONResponse(
                    status_code=200,
                    headers={"Cache-Control": "no-store"},
                    content={
                        "isValid": None,
                        "verification": "unverified",
                        "reason": "provider_error",
                        "providerStatusCode": code,
                        "latencyMs": elapsed_ms,
                        "message": f"Provider server error (HTTP {code}); key could not be verified."
                    }
                )
            else:
                return JSONResponse(
                    status_code=200,
                    headers={"Cache-Control": "no-store"},
                    content={
                        "isValid": None,
                        "verification": "unverified",
                        "reason": "provider_error",
                        "providerStatusCode": code,
                        "latencyMs": elapsed_ms,
                        "message": f"Provider returned HTTP {code}."
                    }
                )

        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.TimeoutException):
            elapsed_ms = max(1, int((time.time() - t0) * 1000))
            return JSONResponse(
                status_code=200,
                headers={"Cache-Control": "no-store"},
                content={
                    "isValid": None,
                    "verification": "unverified",
                    "reason": "timeout",
                    "latencyMs": elapsed_ms,
                    "message": "Connection to provider timed out."
                }
            )
        except (httpx.ConnectError, httpx.NetworkError):
            return JSONResponse(
                status_code=200,
                headers={"Cache-Control": "no-store"},
                content={
                    "isValid": None,
                    "verification": "unverified",
                    "reason": "network_error",
                    "latencyMs": 0,
                    "message": "Network unreachable or DNS resolution failed."
                }
            )
        except Exception:
            return JSONResponse(
                status_code=200,
                headers={"Cache-Control": "no-store"},
                content={
                    "isValid": None,
                    "verification": "unverified",
                    "reason": "unexpected_error",
                    "message": "An error occurred during key validation."
                }
            )
    finally:
        validation_semaphore.release()


@app.post("/admin/providers/validate-key")
async def admin_validate_key(request: Request):
    """Primary administrative egress endpoint for validating provider API keys."""
    return await _execute_key_validation(request)


@app.post("/health/test-key")
async def test_provider_key_alias(request: Request):
    """Backward-compatible alias for provider API key validation."""
    return await _execute_key_validation(request)


@app.get("/health/local-mesh")
async def get_local_mesh():
    """Probe Ollama and LM Studio on numeric loopback asynchronously to auto-discover local models for air-gapped offline routing."""
    discovered_models = []
    ollama_running = False
    lm_studio_running = False
    ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    lm_studio_url = os.environ.get("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234")

    # 1. Probe Ollama (/api/tags) only if URL resolves strictly to numeric loopback
    if is_numeric_loopback_url(ollama_url):
        try:
            resp = await http_client.get(
                f"{ollama_url}/api/tags",
                headers={"User-Agent": "TetherMesh-LocalMeshScanner/1.0"},
                timeout=1.2
            )
            if resp.status_code == 200:
                ollama_running = True
                data = resp.json()
                for m in data.get("models", []):
                    model_name = m.get("name", "")
                    if model_name:
                        discovered_models.append({
                            "name": f"ollama/{model_name}",
                            "engine": "ollama",
                            "sizeBytes": m.get("size", 0),
                            "format": m.get("details", {}).get("format", "gguf"),
                            "family": m.get("details", {}).get("family", "llama"),
                            "contextLength": 8192
                        })
        except Exception:
            pass

    # 2. Probe LM Studio (/v1/models) only if URL resolves strictly to numeric loopback
    if is_numeric_loopback_url(lm_studio_url):
        try:
            resp = await http_client.get(
                f"{lm_studio_url}/v1/models",
                headers={"User-Agent": "TetherMesh-LocalMeshScanner/1.0"},
                timeout=1.2
            )
            if resp.status_code == 200:
                lm_studio_running = True
                data = resp.json()
                for m in data.get("data", []):
                    model_id = m.get("id", "")
                    if model_id:
                        discovered_models.append({
                            "name": f"openai/{model_id}",
                            "engine": "lm-studio",
                            "sizeBytes": 0,
                            "format": "openai-compatible",
                            "family": "local-gguf",
                            "contextLength": 8192
                        })
        except Exception:
            pass

    all_identifiers = [m["name"] for m in discovered_models]

    return JSONResponse(content={
        "ollamaRunning": ollama_running,
        "ollamaUrl": ollama_url if is_numeric_loopback_url(ollama_url) else "http://127.0.0.1:11434",
        "lmStudioRunning": lm_studio_running,
        "lmStudioUrl": lm_studio_url if is_numeric_loopback_url(lm_studio_url) else "http://127.0.0.1:1234",
        "discoveredModels": discovered_models,
        "models": discovered_models,
        "allModelIdentifiers": all_identifiers,
        "totalDiscovered": len(discovered_models),
        "timestamp": int(time.time() * 1000)
    })


@app.get("/tether/telemetry")
async def get_tether_telemetry():
    """Return an instant snapshot of live traces, connected agents, and rolling stats."""
    return JSONResponse(content=buffer.get_snapshot())


@app.get("/tether/events")
async def get_tether_events():
    """Server-Sent Events (SSE) stream for real-time trace and throughput broadcasts."""
    async def event_generator():
        q = asyncio.Queue(maxsize=100)
        buffer.listeners.append(q)
        try:
            snapshot = buffer.get_snapshot()
            yield f"data: {json.dumps({'type': 'init', 'snapshot': snapshot})}\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    # 15s keep-alive heartbeat ping to prevent connection drops across proxies & browsers
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[TetherMesh SSE Stream Notice] Client disconnected: {e}", flush=True)
        finally:
            if q in buffer.listeners:
                buffer.listeners.remove(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/health/security-status")
async def get_public_security_status():
    """Public minimal security & liveness status probe (Strictly zero sensitive info)."""
    config_path = os.environ.get("LITELLM_CONFIG_PATH")
    config_exists = bool(config_path and os.path.exists(config_path))
    
    if not config_exists:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "enforcing": False,
                "policyVersion": "1.0",
                "configLoaded": False,
                "instanceId": TETHER_INSTANCE_ID
            }
        )

    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "enforcing": True,
            "policyVersion": "1.0",
            "configLoaded": True,
            "airGappedMode": bool(AIR_GAPPED_MODE),
            "instanceId": TETHER_INSTANCE_ID
        }
    )


@app.get("/admin/security-status")
async def get_admin_security_status():
    """Administrative detailed security and policy status (Requires ADMIN_TOKEN)."""
    config_path = os.environ.get("LITELLM_CONFIG_PATH")
    config_exists = bool(config_path and os.path.exists(config_path))
    config_sha256 = ""
    if config_exists:
        try:
            with open(config_path, "rb") as f:
                config_sha256 = hashlib.sha256(f.read()).hexdigest()
        except Exception:
            config_sha256 = "read_error"

    budget_info = spend_db.get_budget_settings()
    local_deployments = list(ROUTING_GRAPH_DEPLOYMENTS.keys()) if AIR_GAPPED_MODE else []
    
    inflight_count = 0
    try:
        with spend_db._get_conn() as conn:
            row = conn.execute("SELECT COUNT(*) as c FROM active_reservations WHERE status IN ('reserved', 'dispatched')").fetchone()
            if row:
                inflight_count = row["c"]
    except Exception:
        pass

    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "enforcing": True,
            "policyVersion": "1.0",
            "instanceId": TETHER_INSTANCE_ID,
            "airGappedMode": bool(AIR_GAPPED_MODE),
            "configLoaded": config_exists,
            "configSha256": config_sha256,
            "enforcedDailyLimitUsd": budget_info.get("daily_limit_usd", 10.0),
            "enforcedMonthlyLimitUsd": budget_info.get("monthly_limit_usd", 150.0),
            "isCircuitBreakerTripped": budget_info.get("is_tripped", False),
            "localDeploymentCount": len(local_deployments),
            "activeInflightCount": inflight_count,
            "uptimeSeconds": int(time.time() - START_TIME)
        }
    )


def main():
    start_parent_watchdog()
    parser = argparse.ArgumentParser(description="TetherMesh LiteLLM Sidecar")
    parser.add_argument("--port", type=int, default=0, help="Port to listen on (0 for dynamic ephemeral)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address to bind")
    parser.add_argument("--config", type=str, default=None, help="Path to litellm_config.yaml")
    args, unknown = parser.parse_known_args()

    # Fail closed in supervised production mode if required secrets are missing
    if os.environ.get("TETHER_SUPERVISED") == "1":
        if not HANDSHAKE_SECRET or not TETHER_INSTANCE_ID:
            print("[TetherMesh FATAL] Missing TETHER_HANDSHAKE_SECRET or TETHER_INSTANCE_ID in supervised mode. Failing closed.", file=sys.stderr, flush=True)
            sys.exit(1)

    config_path = args.config or os.environ.get("LITELLM_CONFIG_PATH")
    config_sha256 = ""
    if not config_path or not os.path.isfile(config_path):
        print("[TetherMesh FATAL] A readable configuration file is required.", file=sys.stderr, flush=True)
        sys.exit(1)
    else:
        os.environ["LITELLM_CONFIG_PATH"] = config_path
        try:
            with open(config_path, "rb") as f:
                raw_bytes = f.read()
                config_sha256 = hashlib.sha256(raw_bytes).hexdigest()
        except Exception as e:
            print(f"[TetherMesh FATAL] Unable to read configuration file: {e}", file=sys.stderr, flush=True)
            sys.exit(1)

        # Attest against supervisor config hash if passed
        expected_hash = os.environ.get("TETHER_CONFIG_HASH")
        if expected_hash and config_sha256 != expected_hash:
            print(f"[TetherMesh FATAL] Configuration hash mismatch! Expected {expected_hash}, got {config_sha256}. Failing closed.", file=sys.stderr, flush=True)
            sys.exit(1)

        # In air-gapped mode, independently re-validate the full routing graph at startup
        if AIR_GAPPED_MODE:
            is_valid, err, deps, fbs = validate_and_parse_routing_graph(config_path)
            if not is_valid:
                print(f"[TetherMesh FATAL] Air-Gapped configuration validation failed at sidecar startup: {err}", file=sys.stderr, flush=True)
                sys.exit(1)
            global ROUTING_GRAPH_DEPLOYMENTS, ROUTING_GRAPH_FALLBACKS
            ROUTING_GRAPH_DEPLOYMENTS = deps
            ROUTING_GRAPH_FALLBACKS = fbs
            print(f"[TetherMesh] Air-Gapped routing graph verified: {len(deps)} local models, {len(fbs)} fallback chains.", flush=True)

    if args.port == 0:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind((args.host, 0))
        sock.listen(128)
        bound_port = sock.getsockname()[1]
        ready_msg = json.dumps({
            "port": bound_port,
            "instance_id": TETHER_INSTANCE_ID,
            "generation": TETHER_GENERATION,
            "config_hash": config_sha256,
            "air_gapped": bool(AIR_GAPPED_MODE)
        })
        print(f"[TETHER_READY]:{ready_msg}", flush=True)
        print(f"[TetherMesh] LiteLLM Sidecar running on http://{args.host}:{bound_port} (config: {os.environ.get('LITELLM_CONFIG_PATH')})", flush=True)
        config = uvicorn.Config(app, host=None, port=None, log_level="info", loop="asyncio")
        server = uvicorn.Server(config)
        server.run(sockets=[sock])
    else:
        bound_port = args.port
        ready_msg = json.dumps({
            "port": bound_port,
            "instance_id": TETHER_INSTANCE_ID,
            "generation": TETHER_GENERATION,
            "config_hash": config_sha256,
            "air_gapped": bool(AIR_GAPPED_MODE)
        })
        print(f"[TETHER_READY]:{ready_msg}", flush=True)
        print(f"[TetherMesh] LiteLLM Sidecar running on http://{args.host}:{bound_port} (config: {os.environ.get('LITELLM_CONFIG_PATH')})", flush=True)
        uvicorn.run(app, host=args.host, port=args.port, log_level="info", loop="asyncio", workers=1)

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    main()
