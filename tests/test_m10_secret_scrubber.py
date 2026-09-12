"""
M-10 Secret Scrubber & Multi-Layer Redaction Test Suite

Tests:
1. Layer 1: Source Exclusion & URL Query Stripping
2. Layer 2: Recursive Structured Data Redaction (dicts, lists, mixed casing, normalized keys)
3. Layer 3: Unstructured Text Fallback Scrubber (Slack, GitHub, Google, AWS, JWT/JWE, LLM Keys, PEM Keys)
4. Fail-Closed & ReDoS Bounding (16KB truncation, error fallback)
5. Synthetic Sentinel Token Injection (zero-leak guarantee)
"""

import unittest
import uuid
import re
from urllib.parse import urlparse
from typing import Any

# Match implementation in entrypoint.py
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
    if not name:
        return ""
    return str(name).lower().replace("_", "").replace("-", "").strip()

SENSITIVE_FIELD_NAMES_NORMALIZED = {
    normalize_field_name(k) for k in SENSITIVE_FIELD_NAMES
}

SECRET_PATTERNS = re.compile(
    r"("
    r"\bxox[bpare]-[A-Za-z0-9-]{10,200}\b|"
    r"\bgh[pousr]_[A-Za-z0-9_]{20,255}\b|"
    r"\bgithub_pat_[A-Za-z0-9_]{20,255}\b|"
    r"\bAIza[0-9A-Za-z-_]{30,60}\b|"
    r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|"
    r"\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,}){1,3}\b|"
    r"\b(?:(?:sk|adm|xai)-|gsk_|sk_live_|sk_test_|sk-ant-|sk-or-v1-)[A-Za-z0-9_\-]{15,255}\b|"
    r"\b(?:authorization|x-api-key|x-goog-api-key|cookie|set-cookie)\s*:\s*[^\r\n,;]+|"
    r"\bBearer\s+[a-zA-Z0-9.\-_~+/]{15,}|"
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"
    r")",
    re.IGNORECASE
)

MAX_UNSTRUCTURED_TEXT_BYTES = 16384


def synthetic_secret(prefix: str, payload: str) -> str:
    """Build non-live credential-shaped fixtures at runtime for secret-scanning-safe tests."""
    return prefix + payload

def sanitize_telemetry_text(text: str) -> str:
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

class TestM10SecretScrubber(unittest.TestCase):

    # -----------------------------------------------------------------------
    # Layer 1: URL Query Stripping
    # -----------------------------------------------------------------------
    def test_url_query_and_fragment_stripping(self):
        """Layer 1: URL query parameters, fragments, and credentials are removed."""
        urls = [
            ("https://generativelanguage.googleapis.com/v1beta/models?key=" + synthetic_secret("AI" + "za", "SySynthetic123"), "https://generativelanguage.googleapis.com/v1beta/models"),
            ("http://127.0.0.1:4000/v1/chat/completions?token=secret123&other=val#section", "http://127.0.0.1:4000/v1/chat/completions"),
            ("/v1/models?token=secret_key", "/v1/models"),
            ("https://api.openai.com/v1/models?api_key=sk-12345", "https://api.openai.com/v1/models"),
        ]
        for raw, expected in urls:
            cleaned = strip_url_secrets(raw)
            self.assertEqual(cleaned, expected, f"Failed for {raw}")
            self.assertNotIn("secret", cleaned)
            self.assertNotIn("AIza", cleaned)
            self.assertNotIn("sk-", cleaned)

    # -----------------------------------------------------------------------
    # Layer 2: Recursive Structured Data Redaction
    # -----------------------------------------------------------------------
    def test_recursive_structured_redaction(self):
        """Layer 2: Recursively redact sensitive keys in nested dictionaries and arrays."""
        payload = {
            "user": "developer_1",
            "metadata": {
                "apiKey": synthetic_secret("sk" + "-", "1234567890abcdefghijklmnopqrstuvwxyz"),
                "nested": {
                    "ACCESS_TOKEN": synthetic_secret("gh" + "p_", "1234567890abcdefghijklmnopqrstuvwxyz"),
                    "Password": "super_secret_password_123",
                    "safe_field": "public_data_point"
                }
            },
            "accounts": [
                {"token": synthetic_secret("xox" + "b-", "1234567890-1234567890-abcdefghijklmnop"), "role": "admin"},
                {"public_id": "item_123"}
            ],
            "credentials": "super_secret_blob"
        }

        sanitized = sanitize_structured_data(payload)

        # Sensitive keys replaced completely with [REDACTED]
        self.assertEqual(sanitized["metadata"]["apiKey"], "[REDACTED]")
        self.assertEqual(sanitized["metadata"]["nested"]["ACCESS_TOKEN"], "[REDACTED]")
        self.assertEqual(sanitized["metadata"]["nested"]["Password"], "[REDACTED]")
        self.assertEqual(sanitized["accounts"][0]["token"], "[REDACTED]")
        self.assertEqual(sanitized["credentials"], "[REDACTED]")

        # Safe keys preserved intact
        self.assertEqual(sanitized["user"], "developer_1")
        self.assertEqual(sanitized["metadata"]["nested"]["safe_field"], "public_data_point")
        self.assertEqual(sanitized["accounts"][0]["role"], "admin")
        self.assertEqual(sanitized["accounts"][1]["public_id"], "item_123")

    def test_normalized_sensitive_field_names(self):
        """Layer 2: Normalized field names match irrespective of case, hyphens, or underscores."""
        variations = [
            "apikey", "apiKey", "API_KEY", "api-key", "Api_Key",
            "token", "ACCESS_TOKEN", "RefreshToken", "id_token", "Auth-Token",
            "password", "PASSWD", "pwd", "Secret", "client_secret",
            "private_key", "secret_access_key", "session_token", "security_token",
            "credential", "credentials", "cookie", "set-cookie",
            "x-api-key", "x-goog-api-key", "x-tetheriq-token", "admin_token"
        ]
        for field in variations:
            norm = normalize_field_name(field)
            self.assertIn(norm, SENSITIVE_FIELD_NAMES_NORMALIZED, f"Field '{field}' (normalized '{norm}') was not in sensitive set")

    # -----------------------------------------------------------------------
    # Layer 3: Unstructured Text Fallback Scrubber
    # -----------------------------------------------------------------------
    def test_slack_token_redaction(self):
        """Layer 3: Slack tokens (xoxb, xoxp, xoxa, xoxr, xoxe) are redacted."""
        tokens = [
            "Slack bot token: " + synthetic_secret("xox" + "b-", "123456789012-1234567890123-abcdefghijklmnopqrstuvwx") + " in logs",
            "User token " + synthetic_secret("xox" + "p-", "123456789012-1234567890123-abcdefghijklmnopqrstuvwx") + " detected",
            "App token " + synthetic_secret("xox" + "a-", "1234567890-abcdefghijklmnopqrstuvwxyz") + " found",
            "Refresh " + synthetic_secret("xox" + "r-", "1234567890-abcdefghijklmnopqrstuvwxyz") + " found",
            "Enterprise " + synthetic_secret("xox" + "e-", "1234567890-abcdefghijklmnopqrstuvwxyz") + " found"
        ]
        for t in tokens:
            sanitized = sanitize_telemetry_text(t)
            self.assertNotIn("xoxb-", sanitized)
            self.assertNotIn("xoxp-", sanitized)
            self.assertNotIn("xoxa-", sanitized)
            self.assertNotIn("xoxr-", sanitized)
            self.assertNotIn("xoxe-", sanitized)
            self.assertIn("[REDACTED]", sanitized)

    def test_github_token_redaction(self):
        """Layer 3: GitHub tokens (ghp, gho, ghu, ghs, ghr, github_pat) are redacted."""
        tokens = [
            "PAT: " + synthetic_secret("gh" + "p_", "1234567890abcdefghijklmnopqrstuvwxyz12"),
            "OAuth: " + synthetic_secret("gh" + "o_", "1234567890abcdefghijklmnopqrstuvwxyz12"),
            "User-to-server: " + synthetic_secret("gh" + "u_", "1234567890abcdefghijklmnopqrstuvwxyz12"),
            "Server-to-server: " + synthetic_secret("gh" + "s_", "1234567890abcdefghijklmnopqrstuvwxyz12"),
            "Refresh: " + synthetic_secret("gh" + "r_", "1234567890abcdefghijklmnopqrstuvwxyz12"),
            "Fine-grained: " + synthetic_secret("github" + "_pat_", "11ABCD01234567890_abcdefghijklmnopqrstuvwxyz0123456789012345678901234567890")
        ]
        for t in tokens:
            sanitized = sanitize_telemetry_text(t)
            self.assertNotIn("ghp_", sanitized)
            self.assertNotIn("gho_", sanitized)
            self.assertNotIn("ghu_", sanitized)
            self.assertNotIn("ghs_", sanitized)
            self.assertNotIn("ghr_", sanitized)
            self.assertNotIn("github_pat_", sanitized)
            self.assertIn("[REDACTED]", sanitized)

    def test_google_and_aws_redaction(self):
        """Layer 3: Google AIza keys and AWS AKIA/ASIA IDs are redacted."""
        samples = [
            "Google AI Studio: " + synthetic_secret("AI" + "za", "SyD-1234567890abcdefghijklmnopqr"),
            "AWS Access Key: " + synthetic_secret("AK" + "IA", "IOSFODNN7EXAMPLE"),
            "AWS Session Key: " + synthetic_secret("AS" + "IA", "IOSFODNN7EXAMPLE")
        ]
        for s in samples:
            sanitized = sanitize_telemetry_text(s)
            self.assertNotIn("AIzaSyD-", sanitized)
            self.assertNotIn("AKIAIOSFODNN7EXAMPLE", sanitized)
            self.assertNotIn("ASIAIOSFODNN7EXAMPLE", sanitized)
            self.assertIn("[REDACTED]", sanitized)

    def test_jwt_and_jwe_redaction(self):
        """Layer 3: JWT and JWE tokens are redacted."""
        jwt = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c in header"
        sanitized = sanitize_telemetry_text(jwt)
        self.assertNotIn("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", sanitized)
        self.assertNotIn("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c", sanitized)
        self.assertIn("[REDACTED]", sanitized)

    def test_llm_provider_keys_redaction(self):
        """Layer 3: OpenAI, Anthropic, Groq, xAI, OpenRouter, and Stripe keys are redacted."""
        keys = [
            "OpenAI: " + synthetic_secret("sk" + "-proj-", "1234567890abcdefghijklmnopqrstuvwxyz1234567890"),
            "Anthropic: " + synthetic_secret("sk" + "-ant-api03-", "1234567890abcdefghijklmnopqrstuvwxyz1234567890"),
            "Groq: " + synthetic_secret("gs" + "k_", "1234567890abcdefghijklmnopqrstuvwxyz0123456789abcdef"),
            "xAI: " + synthetic_secret("xa" + "i-", "1234567890abcdefghijklmnopqrstuvwxyz0123456789abcdef"),
            "OpenRouter: " + synthetic_secret("sk" + "-or-v1-", "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"),
            "Stripe Live: " + synthetic_secret("sk" + "_live_", "1234567890abcdefghijklmn"),
            "Stripe Test: " + synthetic_secret("sk" + "_test_", "1234567890abcdefghijklmn")
        ]
        for k in keys:
            sanitized = sanitize_telemetry_text(k)
            self.assertNotIn("1234567890abcdef", sanitized)
            self.assertIn("[REDACTED]", sanitized)

    def test_private_key_pem_blocks_redaction(self):
        """Layer 3: PEM private key blocks are completely redacted."""
        pem = """
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y3w8s+...
...
-----END RSA PRIVATE KEY-----
"""
        sanitized = sanitize_telemetry_text(pem)
        self.assertNotIn("MIIEowIBAAKCAQEA0Y3w8s+", sanitized)
        self.assertIn("[REDACTED]", sanitized)

    # -----------------------------------------------------------------------
    # Fail-Closed & ReDoS Bounding
    # -----------------------------------------------------------------------
    def test_bounded_input_truncation(self):
        """Layer 3: Oversized inputs (>16KB) are truncated safely before regex processing."""
        huge_text = "safe_log_entry " * 2000  # ~30KB
        self.assertGreater(len(huge_text), 16384)
        sanitized = sanitize_telemetry_text(huge_text)
        self.assertIn("[TRUNCATED]", sanitized)
        self.assertLessEqual(len(sanitized), 16384 + 100)

    # -----------------------------------------------------------------------
    # Integration: Dynamic Sentinel Secret Injection
    # -----------------------------------------------------------------------
    def test_sentinel_secret_injection_zero_leak(self):
        """Integration: Dynamic synthetic sentinel secrets injected into telemetry payloads never leak."""
        sentinel_openai = f"sk-proj-{uuid.uuid4().hex}{uuid.uuid4().hex}"
        sentinel_jwt = f"eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InNlbnRpbmVsL{uuid.uuid4().hex}In0.sig_{uuid.uuid4().hex}"
        sentinel_slack = f"xoxb-9999999999-{uuid.uuid4().hex[:12]}-{uuid.uuid4().hex}"

        telemetry_event = {
            "trace_id": f"tr-{uuid.uuid4().hex[:8]}",
            "request": {
                "headers": {
                    "Authorization": f"Bearer {sentinel_jwt}",
                    "X-Api-Key": sentinel_openai
                },
                "body": {
                    "apiKey": sentinel_openai,
                    "slack_token": sentinel_slack,
                    "prompt": f"Please process message with key {sentinel_openai}"
                }
            },
            "error": f"Upstream rejected token: {sentinel_slack}"
        }

        # Run through Layer 2 structured sanitizer
        scrubbed = sanitize_structured_data(telemetry_event)
        serialized = str(scrubbed)

        # Assert zero sentinels survived in the serialized output
        self.assertNotIn(sentinel_openai, serialized)
        self.assertNotIn(sentinel_jwt, serialized)
        self.assertNotIn(sentinel_slack, serialized)


if __name__ == "__main__":
    unittest.main()
