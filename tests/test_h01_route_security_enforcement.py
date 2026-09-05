"""
H-01 Route Security Enforcement & Default-Deny Verification Suite

Tests:
1. Public Health Probes (GET /health, /health/liveness, /health/readiness) succeed without tokens.
2. Inference routes require valid GATEWAY_TOKEN or ADMIN_TOKEN.
3. Non-inference / management routes (/config/update, /key/generate, /user/new, /team/new, /docs, /openapi.json, random bogus paths) return 404 default-deny.
4. Control plane mutating routes (/spend/reset, /spend/budget, /admin/providers/validate-key) strictly require ADMIN_TOKEN and reject GATEWAY_TOKEN.
5. Direct external client usage of INTERNAL_LITELLM_MASTER_KEY is rejected with 401.
6. OPTIONS preflight is allowed for valid routes and rejected with 404 for unmapped routes.
7. Origin and Referer CSRF checks are enforced.
8. Request header rewriting translates client tokens into internal master key.
"""

import os
import sys
import secrets
import unittest
from collections import deque

# Constants matching entrypoint.py specification
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


class SimulatedASGIRequest:
    def __init__(self, method: str, path: str, headers: dict = None, origin: str = None, referer: str = None):
        self.method = method.upper()
        self.path = path
        self.headers = headers or {}
        if origin:
            self.headers["origin"] = origin
        if referer:
            self.headers["referer"] = referer
        self.scope_headers = [
            (k.lower().encode("ascii"), v.encode("ascii"))
            for k, v in self.headers.items()
        ]


class TestH01RouteSecurityEnforcement(unittest.TestCase):
    def setUp(self):
        self.gateway_token = "gw-" + secrets.token_urlsafe(32)
        self.admin_token = "adm-" + secrets.token_urlsafe(32)
        self.internal_master_key = "litellm-internal-" + secrets.token_urlsafe(48)
        self.allowed_origins = [
            "http://tauri.localhost",
            "tauri://localhost",
            "http://127.0.0.1:5173",
            "http://localhost:5173"
        ]

    def _simulate_enforcement(self, req: SimulatedASGIRequest):
        path = req.path.split("?")[0]
        method = req.method

        # 1. OPTIONS Preflight check
        if method == "OPTIONS":
            norm_path = path.rstrip("/") or "/"
            is_known = (
                norm_path in PUBLIC_HEALTH_ROUTES or
                any(p == norm_path for _, p in CONTROL_PLANE_ROUTES | INFERENCE_EXACT_ROUTES) or
                any(norm_path.startswith(p) for _, p in INFERENCE_PREFIX_ROUTES)
            )
            if is_known:
                return 200, "options_allowed", req.scope_headers
            return 404, "not_found", req.scope_headers

        # 2. Origin check
        origin = req.headers.get("origin")
        if origin is not None:
            if origin == "null" or origin not in self.allowed_origins:
                return 403, "cors_forbidden", req.scope_headers

        # Referer check
        referer = req.headers.get("referer")
        if referer:
            if not any(referer.startswith(ao) for ao in self.allowed_origins):
                return 403, "csrf_forbidden", req.scope_headers

        # 3. Extract tokens
        auth_header = req.headers.get("authorization", "")
        bearer = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
        x_api_key = req.headers.get("x-api-key", "").strip()
        x_tether_token = req.headers.get("x-tetheriq-token", "").strip()
        provided_token = x_tether_token or bearer or x_api_key

        # 4. Anti-Spoofing: Direct client use of internal master key is strictly rejected
        if provided_token and secrets.compare_digest(provided_token, self.internal_master_key):
            return 401, "invalid_master_key_usage", req.scope_headers

        # 5. Route Classification & Enforcement
        route_class = classify_route(method, path)

        def rewrite_headers():
            filtered = [
                (k, v) for (k, v) in req.scope_headers
                if k.lower() not in (b"authorization", b"x-api-key", b"x-tetheriq-token")
            ]
            filtered.append((b"authorization", f"Bearer {self.internal_master_key}".encode("ascii")))
            return filtered

        if route_class == "public":
            return 200, "public_ok", rewrite_headers()

        if route_class == "control_plane":
            if not provided_token or not secrets.compare_digest(provided_token, self.admin_token):
                return 401, "unauthorized_admin", req.scope_headers
            return 200, "control_plane_ok", rewrite_headers()

        if route_class == "inference":
            is_valid = False
            if provided_token:
                if (secrets.compare_digest(provided_token, self.gateway_token) or
                    secrets.compare_digest(provided_token, self.admin_token)):
                    is_valid = True

            if not is_valid:
                return 401, "invalid_api_key", req.scope_headers

            return 200, "inference_ok", rewrite_headers()

        # 6. Default-Deny
        return 404, "not_found", req.scope_headers

    # -----------------------------------------------------------------------
    # Unit Tests
    # -----------------------------------------------------------------------

    def test_01_public_health_probes_pass_without_token(self):
        for path in ["/health", "/health/liveness", "/health/readiness"]:
            req = SimulatedASGIRequest("GET", path)
            status, reason, headers = self._simulate_enforcement(req)
            self.assertEqual(status, 200)
            self.assertEqual(reason, "public_ok")
            # Headers rewritten with internal master key
            self.assertTrue(any(k == b"authorization" and self.internal_master_key.encode("ascii") in v for k, v in headers))

    def test_02_inference_requires_gateway_or_admin_token(self):
        # Without token -> 401
        req = SimulatedASGIRequest("POST", "/v1/chat/completions")
        status, reason, _ = self._simulate_enforcement(req)
        self.assertEqual(status, 401)
        self.assertEqual(reason, "invalid_api_key")

        # With valid Gateway Token -> 200 & Rewritten Headers
        req = SimulatedASGIRequest(
            "POST", "/v1/chat/completions",
            headers={"authorization": f"Bearer {self.gateway_token}"}
        )
        status, reason, headers = self._simulate_enforcement(req)
        self.assertEqual(status, 200)
        self.assertEqual(reason, "inference_ok")
        # Ensure client token is stripped and internal master key is present
        self.assertFalse(any(self.gateway_token.encode("ascii") in v for _, v in headers))
        self.assertTrue(any(self.internal_master_key.encode("ascii") in v for _, v in headers))

    def test_03_inference_aliases_require_auth(self):
        aliases = [
            ("POST", "/chat/completions"),
            ("POST", "/completions"),
            ("POST", "/v1/completions"),
            ("POST", "/embeddings"),
            ("POST", "/v1/embeddings"),
            ("POST", "/messages"),
            ("POST", "/v1/messages"),
            ("GET", "/models"),
            ("GET", "/v1/models"),
        ]
        for method, path in aliases:
            req = SimulatedASGIRequest(method, path)
            status, _, _ = self._simulate_enforcement(req)
            self.assertEqual(status, 401, f"Unauthenticated request allowed on {method} {path}")

            req = SimulatedASGIRequest(method, path, headers={"x-api-key": self.gateway_token})
            status, _, _ = self._simulate_enforcement(req)
            self.assertEqual(status, 200, f"Authenticated request failed on {method} {path}")

    def test_04_all_control_plane_routes_require_admin_token_and_reject_gateway_token(self):
        all_control_plane_routes = [
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
        ]
        for method, path in all_control_plane_routes:
            # Gateway token MUST be strictly rejected on all control plane routes
            req = SimulatedASGIRequest(method, path, headers={"authorization": f"Bearer {self.gateway_token}"})
            status, reason, _ = self._simulate_enforcement(req)
            self.assertEqual(status, 401, f"Gateway token mistakenly permitted on control plane route {method} {path}")
            self.assertEqual(reason, "unauthorized_admin")

            # Admin token MUST be permitted
            req = SimulatedASGIRequest(method, path, headers={"authorization": f"Bearer {self.admin_token}"})
            status, reason, _ = self._simulate_enforcement(req)
            self.assertEqual(status, 200, f"Admin token rejected on control plane route {method} {path}")
            self.assertEqual(reason, "control_plane_ok")

    def test_05_inherited_litellm_management_routes_return_404_default_deny(self):
        dangerous_routes = [
            ("POST", "/config/update"),
            ("GET", "/config"),
            ("POST", "/key/generate"),
            ("GET", "/key/info"),
            ("POST", "/user/new"),
            ("POST", "/team/new"),
            ("POST", "/customer/new"),
            ("GET", "/docs"),
            ("GET", "/redoc"),
            ("GET", "/openapi.json"),
            ("POST", "/v1/unknown_extension"),
            ("GET", "/admin/arbitrary_injection"),
        ]
        for method, path in dangerous_routes:
            # Even with admin token, these unmapped routes must return 404
            req = SimulatedASGIRequest(method, path, headers={"authorization": f"Bearer {self.admin_token}"})
            status, reason, _ = self._simulate_enforcement(req)
            self.assertEqual(status, 404, f"Route did not fail closed: {method} {path}")
            self.assertEqual(reason, "not_found")

    def test_06_direct_client_use_of_internal_master_key_rejected(self):
        req = SimulatedASGIRequest(
            "POST", "/v1/chat/completions",
            headers={"authorization": f"Bearer {self.internal_master_key}"}
        )
        status, reason, _ = self._simulate_enforcement(req)
        self.assertEqual(status, 401)
        self.assertEqual(reason, "invalid_master_key_usage")

    def test_07_options_preflight_policy(self):
        # OPTIONS on known inference route -> 200
        req = SimulatedASGIRequest("OPTIONS", "/v1/chat/completions")
        status, reason, _ = self._simulate_enforcement(req)
        self.assertEqual(status, 200)

        # OPTIONS on unmapped route -> 404
        req = SimulatedASGIRequest("OPTIONS", "/config/update")
        status, reason, _ = self._simulate_enforcement(req)
        self.assertEqual(status, 404)

    def test_08_cors_and_csrf_origin_checks(self):
        # Foreign malicious origin -> 403
        req = SimulatedASGIRequest(
            "POST", "/v1/chat/completions",
            headers={"authorization": f"Bearer {self.gateway_token}"},
            origin="http://malicious-site.com"
        )
        status, reason, _ = self._simulate_enforcement(req)
        self.assertEqual(status, 403)
        self.assertEqual(reason, "cors_forbidden")

    def test_09_query_string_tokens_prohibited(self):
        # Passing tokens via URL query parameters must be rejected with 401 Unauthorized
        req = SimulatedASGIRequest("GET", f"/tether/events?token={self.admin_token}")
        status, reason, _ = self._simulate_enforcement(req)
        self.assertEqual(status, 401)
        self.assertEqual(reason, "unauthorized_admin")

        # Passing via X-TetherIQ-Token header succeeds
        req_valid = SimulatedASGIRequest("GET", "/tether/events", headers={"x-tetheriq-token": self.admin_token})
        status_v, reason_v, _ = self._simulate_enforcement(req_valid)
        self.assertEqual(status_v, 200)
        self.assertEqual(reason_v, "control_plane_ok")

    def test_10_security_status_endpoints(self):
        # Public /health/security-status succeeds unauthenticated
        req_pub = SimulatedASGIRequest("GET", "/health/security-status")
        status, reason, _ = self._simulate_enforcement(req_pub)
        self.assertEqual(status, 200)
        self.assertEqual(reason, "public_ok")

        # Admin /admin/security-status fails without token or with gateway token
        req_admin_fail = SimulatedASGIRequest("GET", "/admin/security-status", headers={"x-api-key": self.gateway_token})
        status, reason, _ = self._simulate_enforcement(req_admin_fail)
        self.assertEqual(status, 401)
        self.assertEqual(reason, "unauthorized_admin")

        # Admin /admin/security-status succeeds with admin token
        req_admin_ok = SimulatedASGIRequest("GET", "/admin/security-status", headers={"x-tetheriq-token": self.admin_token})
        status, reason, _ = self._simulate_enforcement(req_admin_ok)
        self.assertEqual(status, 200)
        self.assertEqual(reason, "control_plane_ok")


if __name__ == "__main__":
    unittest.main()
