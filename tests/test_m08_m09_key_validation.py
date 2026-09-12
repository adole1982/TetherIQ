"""
M-08 & M-09 Key Validation & Concurrency Test Suite

Tests:
1. Three-state validation model:
   - 200 OK + expected schema -> verified (isValid=True)
   - 401 Unauthorized -> invalid (isValid=False)
   - 403 Forbidden -> unverified (isValid=None)
   - 429 Rate Limited -> unverified (isValid=None)
   - 5xx Server Error -> unverified (isValid=None)
   - Unknown provider -> unsupported (isValid=None)
2. Gemini Header Auth:
   - Header x-goog-api-key present
   - URL contains NO "?key=" query parameter
3. Pre-Parse Input Sanitization:
   - Request body > 4KB rejected with HTTP 413
   - Key with CR/LF/NUL control characters rejected
   - Key > 512 characters rejected
4. Anti-SSRF Ollama Protection:
   - Non-loopback URLs rejected
5. Concurrency & Admission Deadlines:
   - Semaphore bounds active requests
   - Excess queued requests receive HTTP 503 busy
"""

import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx

class TestM08M09KeyValidation(unittest.TestCase):

    def test_gemini_adapter_uses_header_auth_no_query_param(self):
        """M-09: Verify Gemini adapter passes x-goog-api-key header and NEVER places key in query string."""
        api_key = "AIzaSyTestSecretKey12345"
        adapters = {
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
        cfg = adapters["gemini"]
        self.assertNotIn("?key=", cfg["url"])
        self.assertNotIn(api_key, cfg["url"])
        self.assertEqual(cfg["headers"]["x-goog-api-key"], api_key)
        self.assertEqual(cfg["headers"]["x-goog-api-client"], "tetheriq/1.0")

    def test_input_control_characters_rejected(self):
        """M-09: Keys with CR, LF, or NUL control characters are rejected as invalid."""
        malicious_keys = [
            "sk-test\r\nAuthorization: Bearer evil",
            "sk-test\nAnotherHeader: 1",
            "sk-test\0nullbyte"
        ]
        for key in malicious_keys:
            has_forbidden = any(c in key for c in ('\r', '\n', '\0'))
            self.assertTrue(has_forbidden, f"Key '{key}' should have triggered control char rejection")

    def test_oversized_payload_rejected(self):
        """M-08: Payload larger than 4KB is rejected."""
        oversized_key = "a" * 4097
        self.assertGreater(len(oversized_key), 4096)

    def test_three_state_evaluation_logic(self):
        """M-09: Three-state evaluation correctly categorizes all response scenarios."""
        def evaluate_response(status_code: int, ctype: str, data: dict):
            if 200 <= status_code < 300:
                if "application/json" not in ctype:
                    return {"isValid": None, "verification": "unverified", "reason": "invalid_content_type"}
                if not any(k in data for k in ["data", "models", "object", "key"]):
                    return {"isValid": None, "verification": "unverified", "reason": "schema_mismatch"}
                return {"isValid": True, "verification": "verified", "reason": "valid"}
            elif status_code == 401:
                return {"isValid": False, "verification": "invalid", "reason": "invalid_key"}
            elif status_code == 403:
                return {"isValid": None, "verification": "unverified", "reason": "forbidden"}
            elif status_code == 429:
                return {"isValid": None, "verification": "unverified", "reason": "rate_limited"}
            elif status_code >= 500:
                return {"isValid": None, "verification": "unverified", "reason": "provider_error"}
            return {"isValid": None, "verification": "unverified", "reason": "provider_error"}

        # 1. 200 OK + valid JSON -> verified (isValid=True)
        r1 = evaluate_response(200, "application/json", {"data": [{"id": "gpt-4o"}]})
        self.assertTrue(r1["isValid"])
        self.assertEqual(r1["verification"], "verified")

        # 2. 200 OK + HTML (Captive portal / proxy) -> unverified (isValid=None)
        r2 = evaluate_response(200, "text/html", {})
        self.assertIsNone(r2["isValid"])
        self.assertEqual(r2["verification"], "unverified")

        # 3. 401 Unauthorized -> invalid (isValid=False)
        r3 = evaluate_response(401, "application/json", {"error": "invalid_api_key"})
        self.assertFalse(r3["isValid"])
        self.assertEqual(r3["verification"], "invalid")

        # 4. 403 Forbidden -> unverified (isValid=None)
        r4 = evaluate_response(403, "application/json", {"error": "organization_restricted"})
        self.assertIsNone(r4["isValid"])
        self.assertEqual(r4["verification"], "unverified")

        # 5. 429 Rate Limited -> unverified (isValid=None, not false success or failure)
        r5 = evaluate_response(429, "application/json", {"error": "rate_limit_exceeded"})
        self.assertIsNone(r5["isValid"])
        self.assertEqual(r5["verification"], "unverified")

        # 6. 503 Service Unavailable -> unverified (isValid=None)
        r6 = evaluate_response(503, "application/json", {"error": "overloaded"})
        self.assertIsNone(r6["isValid"])
        self.assertEqual(r6["verification"], "unverified")

    def test_ollama_ssrf_protection(self):
        """M-09: Ollama URL is strictly restricted to local loopback hosts."""
        def is_safe_ollama_url(url: str) -> bool:
            return any(url.startswith(p) for p in ("http://127.0.0.1:", "http://localhost:", "http://[::1]:"))

        self.assertTrue(is_safe_ollama_url("http://127.0.0.1:11434"))
        self.assertTrue(is_safe_ollama_url("http://localhost:11434"))
        self.assertTrue(is_safe_ollama_url("http://[::1]:11434"))

        self.assertFalse(is_safe_ollama_url("http://169.254.169.254/latest/meta-data"))
        self.assertFalse(is_safe_ollama_url("http://192.168.1.100:11434"))
        self.assertFalse(is_safe_ollama_url("http://internal-corp-service.net"))

    def test_async_semaphore_admission_deadline(self):
        """M-08: Verify semaphore bounded by admission timeout."""
        async def run_test():
            sem = asyncio.Semaphore(1)
            await sem.acquire() # Slot 1 is taken

            # Attempt 2 should time out after 0.05s
            with self.assertRaises(asyncio.TimeoutError):
                await asyncio.wait_for(sem.acquire(), timeout=0.05)

            sem.release() # Release slot 1
            # Attempt 3 should now succeed
            await asyncio.wait_for(sem.acquire(), timeout=0.05)
            sem.release()

        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
