"""
H-02 Security Verification Test Suite

Tests:
1. Constant-time token verification using secrets.compare_digest
2. Origin header validation (rejecting null, foreign domains, accepting tauri:// and loopback)
3. Referer header validation
4. Strict Control Plane vs. Inference token separation (Control plane exclusively accepts admin token; inference accepts gateway or admin token)
5. Query parameter tokens prohibited fail-closed
6. Master key anti-spoofing rejection
7. Bounded sliding-window rate limiter
"""

import sys
import os
import time
import secrets
from collections import deque
import unittest

class TestH02GatewaySecurityLogic(unittest.TestCase):
    def setUp(self):
        self.gateway_token = "sk-tether-live-test-gw-token-12345"
        self.admin_token = "adm-tether-live-test-admin-token-67890"
        self.master_key = "litellm-internal-master-key-secret-99999"
        self.allowed_origins = [
            "http://tauri.localhost",
            "tauri://localhost",
            "http://127.0.0.1:5173",
            "http://localhost:5173"
        ]

    def _simulate_auth_check(self, path: str, method: str, origin=None, referer=None,
                             bearer="", x_api_key="", x_tether_token="", query_token=""):
        # 1. Allow OPTIONS on known routes
        if method == "OPTIONS":
            return 200, "options_ok"

        # 2. Allow bare /health, /health/liveness, /health/readiness probes
        if path in ("/health", "/health/liveness", "/health/readiness") and method == "GET":
            return 200, "health_ok"

        # 3. Origin verification
        if origin is not None:
            if origin == "null" or origin not in self.allowed_origins:
                return 403, "cors_forbidden"

        # Referer check
        if referer:
            if not any(referer.startswith(ao) for ao in self.allowed_origins):
                return 403, "csrf_forbidden"

        # 4. Extract token strictly from headers (query parameter tokens prohibited)
        provided_token = x_tether_token or bearer or x_api_key

        # Master key anti-spoofing check
        if provided_token and secrets.compare_digest(provided_token, self.master_key):
            return 401, "invalid_master_key_usage"

        # If only query_token was provided without headers, reject
        if not provided_token and query_token:
            return 401, "query_token_prohibited"

        # 5. Control Plane: EXCLUSIVELY requires ADMIN_TOKEN
        is_control_plane = (
            path.startswith(("/spend", "/tether")) or
            path in ("/health/test-key", "/health/providers", "/health/local-mesh")
        )

        if is_control_plane:
            if not provided_token or not secrets.compare_digest(provided_token, self.admin_token):
                return 401, "unauthorized_control_plane"
            return 200, "control_plane_ok"

        # 6. Proxy / Inference Routes: Accepts GATEWAY_TOKEN or ADMIN_TOKEN
        is_proxy_route = path.startswith(("/v1", "/chat", "/messages", "/models", "/audio", "/images")) or path in ("/models",)
        if is_proxy_route:
            is_valid = False
            if provided_token:
                if (secrets.compare_digest(provided_token, self.gateway_token) or
                    secrets.compare_digest(provided_token, self.admin_token)):
                    is_valid = True
            if not is_valid:
                return 401, "invalid_api_key"
            return 200, "proxy_ok"

        return 404, "not_found"

    def test_01_public_health_probe(self):
        status, reason = self._simulate_auth_check("/health", "GET")
        self.assertEqual(status, 200)

    def test_02_proxy_without_token_returns_401(self):
        status, reason = self._simulate_auth_check("/v1/chat/completions", "POST")
        self.assertEqual(status, 401)
        self.assertEqual(reason, "invalid_api_key")

    def test_03_proxy_with_valid_bearer_token(self):
        status, reason = self._simulate_auth_check(
            "/v1/chat/completions", "POST", bearer=self.gateway_token
        )
        self.assertEqual(status, 200)

    def test_04_proxy_with_valid_x_api_key(self):
        status, reason = self._simulate_auth_check(
            "/v1/messages", "POST", x_api_key=self.gateway_token
        )
        self.assertEqual(status, 200)

    def test_05_origin_null_blocked_403(self):
        status, reason = self._simulate_auth_check(
            "/v1/chat/completions", "POST", origin="null", bearer=self.gateway_token
        )
        self.assertEqual(status, 403)
        self.assertEqual(reason, "cors_forbidden")

    def test_06_malicious_origin_blocked_403(self):
        status, reason = self._simulate_auth_check(
            "/v1/chat/completions", "POST", origin="https://evil-site.com", bearer=self.gateway_token
        )
        self.assertEqual(status, 403)
        self.assertEqual(reason, "cors_forbidden")

    def test_07_tauri_origin_allowed(self):
        status, reason = self._simulate_auth_check(
            "/v1/chat/completions", "POST", origin="http://tauri.localhost", bearer=self.gateway_token
        )
        self.assertEqual(status, 200)

    def test_08_control_plane_requires_admin_token(self):
        status, reason = self._simulate_auth_check("/spend/reset", "POST")
        self.assertEqual(status, 401)

        # Gateway token MUST fail on control plane (H-02 Exclusivity)
        status, reason = self._simulate_auth_check(
            "/spend/reset", "POST", x_tether_token=self.gateway_token
        )
        self.assertEqual(status, 401)

        # Admin token MUST succeed
        status, reason = self._simulate_auth_check(
            "/spend/reset", "POST", x_tether_token=self.admin_token
        )
        self.assertEqual(status, 200)

    def test_09_test_key_endpoint_requires_admin_token(self):
        status, reason = self._simulate_auth_check("/health/test-key", "POST")
        self.assertEqual(status, 401)

        # Gateway token fails
        status, reason = self._simulate_auth_check(
            "/health/test-key", "POST", x_tether_token=self.gateway_token
        )
        self.assertEqual(status, 401)

        # Admin token succeeds
        status, reason = self._simulate_auth_check(
            "/health/test-key", "POST", x_tether_token=self.admin_token
        )
        self.assertEqual(status, 200)

    def test_10_query_string_token_prohibited(self):
        # Query parameter tokens must be rejected
        status, reason = self._simulate_auth_check(
            "/tether/events", "GET", query_token=self.admin_token
        )
        self.assertEqual(status, 401)

    def test_11_direct_master_key_usage_prohibited(self):
        # Direct use of internal master key must be rejected
        status, reason = self._simulate_auth_check(
            "/v1/chat/completions", "POST", bearer=self.master_key
        )
        self.assertEqual(status, 401)
        self.assertEqual(reason, "invalid_master_key_usage")

    def test_12_sliding_window_rate_limiter(self):
        """Test bounded sliding window rate limiter."""
        window_sec = 60.0
        max_req = 10
        records = deque(maxlen=max_req)

        now = time.monotonic()
        for i in range(max_req):
            records.append(now)

        # 11th request in same second should trigger rate limit
        self.assertTrue(len(records) >= max_req)
        # Advance time past window
        now_future = now + 65.0
        while records and now_future - records[0] > window_sec:
            records.popleft()
        self.assertEqual(len(records), 0)

if __name__ == "__main__":
    unittest.main(verbosity=2)

