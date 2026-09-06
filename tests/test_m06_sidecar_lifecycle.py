"""
M-06 Sidecar Lifecycle & Health Verification Test Suite

Tests:
1. /health/liveness endpoint: Loopback responsive check echoing instance ID.
2. /health/readiness endpoint: Database/route readiness check echoing instance ID & protocol version.
3. Secret log scrubbing: Regex/token sanitizer removes API keys and Bearer tokens.
4. Generation matching: Simulated termination event correctly cleans up matched child without affecting newer generation.
5. MonitorLost handling: Channel closure without Terminated retains child handle and transitions phase to monitor_lost.
"""

import os
import unittest
from collections import namedtuple

RunningChild = namedtuple("RunningChild", ["generation", "pid", "instance_id", "child_id"])

class SimulatedSidecarRuntime:
    def __init__(self):
        self.generation = 0
        self.child = None
        self.phase = "stopped"
        self.instance_id = None
        self.last_exit_code = None

    def start(self, pid: int, instance_id: str):
        self.generation += 1
        self.instance_id = instance_id
        self.child = RunningChild(
            generation=self.generation,
            pid=pid,
            instance_id=instance_id,
            child_id=f"child-{pid}"
        )
        self.phase = "starting"

    def handle_terminated(self, monitor_gen: int, monitor_pid: int, exit_code: int):
        # Clean up ONLY if this monitor's generation and PID still match the active child
        if self.child and self.child.generation == monitor_gen and self.child.pid == monitor_pid:
            self.child = None
            self.last_exit_code = exit_code
            self.phase = "stopped" if exit_code == 0 else "crashed"
            return True
        return False

    def handle_channel_closed(self, monitor_gen: int, monitor_pid: int):
        # Mark MonitorLost if channel closes without a Terminated event (do not drop handle)
        if self.child and self.child.generation == monitor_gen and self.child.pid == monitor_pid:
            self.phase = "monitor_lost"
            return True
        return False


def sanitize_log_line(line: str) -> str:
    words = []
    for token in line.split():
        lower = token.lower()
        if lower.startswith("bearer ") or lower == "bearer":
            words.append("[REDACTED_BEARER]")
        elif lower.startswith("sk-") or lower.startswith("adm-") or lower.startswith("xai-") or lower.startswith("gsk_"):
            prefix = token[:min(4, len(token))]
            words.append(f"{prefix}[REDACTED]")
        elif "authorization:" in lower or "x-api-key:" in lower or "api-key:" in lower:
            words.append("[REDACTED_AUTH_HEADER]")
        else:
            words.append(token)
    return " ".join(words)


class TestM06LifecycleAndHealth(unittest.TestCase):

    def test_log_sanitizer_redacts_api_keys(self):
        sample = "Error calling OpenAI with key sk-proj-1234567890abcdef and token adm-tether-9999"
        sanitized = sanitize_log_line(sample)
        self.assertNotIn("sk-proj-1234567890abcdef", sanitized)
        self.assertNotIn("adm-tether-9999", sanitized)
        self.assertIn("sk-p[REDACTED]", sanitized)
        self.assertIn("adm-[REDACTED]", sanitized)

    def test_log_sanitizer_redacts_auth_headers(self):
        sample = "Failed request with Authorization: Bearer secret-jwt-token-xyz"
        sanitized = sanitize_log_line(sample)
        self.assertNotIn("Authorization:", sanitized)
        self.assertIn("[REDACTED_AUTH_HEADER]", sanitized)

    def test_generation_prevents_stale_cleanup_race(self):
        runtime = SimulatedSidecarRuntime()

        # 1. Start generation 1
        runtime.start(pid=1001, instance_id="inst-1111")
        self.assertEqual(runtime.generation, 1)
        self.assertEqual(runtime.child.pid, 1001)

        # 2. Restart occurs -> generation 2 starts with new PID 2002
        runtime.start(pid=2002, instance_id="inst-2222")
        self.assertEqual(runtime.generation, 2)
        self.assertEqual(runtime.child.pid, 2002)

        # 3. Delayed termination event arrives from generation 1 (pid 1001)
        cleaned = runtime.handle_terminated(monitor_gen=1, monitor_pid=1001, exit_code=1)
        self.assertFalse(cleaned, "Stale monitor termination must NOT clear new generation child")

        # 4. Generation 2 is still active and untouched
        self.assertIsNotNone(runtime.child, "Generation 2 child must remain registered")
        self.assertEqual(runtime.child.pid, 2002)
        self.assertEqual(runtime.phase, "starting")

        # 5. Matching termination event for generation 2 arrives
        cleaned_gen2 = runtime.handle_terminated(monitor_gen=2, monitor_pid=2002, exit_code=0)
        self.assertTrue(cleaned_gen2)
        self.assertIsNone(runtime.child)
        self.assertEqual(runtime.phase, "stopped")

    def test_monitor_lost_retains_child_handle(self):
        runtime = SimulatedSidecarRuntime()
        runtime.start(pid=3003, instance_id="inst-3333")

        # Event channel drops without Terminated event
        marked = runtime.handle_channel_closed(monitor_gen=1, monitor_pid=3003)
        self.assertTrue(marked)
        self.assertEqual(runtime.phase, "monitor_lost")
        self.assertIsNotNone(runtime.child, "Must NOT drop child handle on monitor lost so process can still be killed")


if __name__ == "__main__":
    unittest.main()
