"""Cross-platform smoke test for the frozen LiteLLM sidecar distribution."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import http.client
import json
import os
import queue
import signal
import subprocess
import tempfile
import threading
import time
from pathlib import Path


def _terminate_process_tree(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(process.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name == "nt":
            process.kill()
        else:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        process.wait(timeout=5)


def _read_lines(stream, output: queue.Queue[str]) -> None:
    for line in iter(stream.readline, ""):
        output.put(line)


def run_packaged_smoke_test(executable: Path) -> None:
    executable = executable.resolve(strict=True)
    if os.name != "nt" and not os.access(executable, os.X_OK):
        raise AssertionError(f"Sidecar is not executable: {executable}")

    config = """model_list:
  - model_name: local-smoke
    litellm_params:
      model: ollama/smoke
      api_base: http://127.0.0.1:9
"""
    config_hash = hashlib.sha256(config.encode("utf-8")).hexdigest()

    with tempfile.TemporaryDirectory(prefix="tetheriq-litellm-smoke-") as temp_dir:
        config_path = Path(temp_dir) / "litellm-smoke.yaml"
        config_path.write_text(config, encoding="utf-8", newline="\n")

        env = dict(os.environ)
        env.update(
            {
                "TETHER_SUPERVISED": "1",
                "TETHER_HANDSHAKE_SECRET": "ci-handshake-secret",
                "TETHER_GATEWAY_TOKEN": "ci-gateway-token",
                "TETHER_INSTANCE_ID": "ci-packaged-smoke",
                "TETHER_GENERATION": "7",
                "TETHER_CONFIG_HASH": config_hash,
                "AIR_GAPPED_MODE": "1",
                "PYTHONUNBUFFERED": "1",
            }
        )

        popen_options = {
            "stdout": subprocess.PIPE,
            "stderr": subprocess.STDOUT,
            "text": True,
            "encoding": "utf-8",
            "errors": "replace",
            "env": env,
            "bufsize": 1,
        }
        if os.name == "nt":
            popen_options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            popen_options["start_new_session"] = True

        process = subprocess.Popen(
            [str(executable), "--port", "0", "--config", str(config_path)],
            **popen_options,
        )
        lines: queue.Queue[str] = queue.Queue()
        reader = threading.Thread(
            target=_read_lines,
            args=(process.stdout, lines),
            daemon=True,
        )
        reader.start()

        ready_record = None
        captured = []
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if process.poll() is not None and lines.empty():
                    break
                try:
                    line = lines.get(timeout=0.25)
                except queue.Empty:
                    continue
                captured.append(line)
                if "[TETHER_READY]:" in line:
                    ready_record = json.loads(line.split("[TETHER_READY]:", 1)[1])
                    break

            assert ready_record is not None, (
                "Frozen LiteLLM sidecar failed to become ready. Output:\n"
                + "".join(captured)
            )
            assert ready_record["instance_id"] == "ci-packaged-smoke"
            assert ready_record["generation"] == 7
            assert ready_record["config_hash"] == config_hash
            assert ready_record["air_gapped"] is True
            assert 1024 < ready_record["port"] <= 65535

            connection = http.client.HTTPConnection(
                "127.0.0.1", ready_record["port"], timeout=3
            )
            try:
                connection.request("GET", "/tether/readiness")
                response = connection.getresponse()
                payload = json.loads(response.read(65536).decode("utf-8"))
            finally:
                connection.close()

            assert response.status == 200
            assert payload["status"] == "ready"
            assert payload["instanceId"] == "ci-packaged-smoke"
            assert payload["generation"] == 7
            assert payload["configSha256"] == config_hash
            assert payload["airGapped"] is True

            connection = http.client.HTTPConnection(
                "127.0.0.1", ready_record["port"], timeout=3
            )
            try:
                connection.request(
                    "GET",
                    "/v1/models",
                    headers={"Authorization": "Bearer ci-gateway-token"},
                )
                models_response = connection.getresponse()
                models_payload = json.loads(
                    models_response.read(65536).decode("utf-8")
                )
            finally:
                connection.close()

            assert models_response.status == 200
            assert any(
                model.get("id") == "local-smoke"
                for model in models_payload.get("data", [])
            )


            budget_body = json.dumps(
                {
                    "daily_limit_microusd": 9_000_000,
                    "monthly_limit_microusd": 148_000_000,
                },
                separators=(",", ":"),
            ).encode("utf-8")
            timestamp = str(int(time.time()))
            nonce = "ci-packaged-budget-save"
            request_payload = (
                f"POST\n/spend/budget\n{timestamp}\n{nonce}\n"
                f"{hashlib.sha256(budget_body).hexdigest()}\n7"
            ).encode("utf-8")
            request_signature = hmac.new(
                b"ci-handshake-secret", request_payload, hashlib.sha256
            ).hexdigest()

            connection = http.client.HTTPConnection(
                "127.0.0.1", ready_record["port"], timeout=3
            )
            try:
                connection.request(
                    "POST",
                    "/spend/budget",
                    body=budget_body,
                    headers={
                        "Content-Type": "application/json",
                        "X-Tether-Signature": request_signature,
                        "X-Tether-Timestamp": timestamp,
                        "X-Tether-Nonce": nonce,
                        "X-Tether-Generation": "7",
                    },
                )
                budget_response = connection.getresponse()
                budget_response_body = budget_response.read(65536)
            finally:
                connection.close()

            assert budget_response.status == 200, budget_response_body.decode(
                "utf-8", errors="replace"
            )
            budget_payload = json.loads(budget_response_body.decode("utf-8"))
            assert budget_payload["daily_limit_microusd"] == 9_000_000
            assert budget_payload["monthly_limit_microusd"] == 148_000_000

            response_signature = budget_response.getheader(
                "X-Tether-Response-Signature"
            )
            expected_response_payload = (
                f"{nonce}\n{budget_response.status}\n"
                f"{hashlib.sha256(budget_response_body).hexdigest()}"
            ).encode("utf-8")
            expected_response_signature = hmac.new(
                b"ci-handshake-secret",
                expected_response_payload,
                hashlib.sha256,
            ).hexdigest()
            assert response_signature is not None
            assert hmac.compare_digest(
                response_signature, expected_response_signature
            )
        finally:
            _terminate_process_tree(process)

        assert process.poll() is not None, "Frozen LiteLLM process remained alive"
        if os.name != "nt":
            try:
                os.killpg(process.pid, 0)
            except ProcessLookupError:
                pass
            else:
                raise AssertionError("Frozen LiteLLM process group remained alive")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable", required=True, type=Path)
    args = parser.parse_args()
    run_packaged_smoke_test(args.executable)
    print("Packaged LiteLLM sidecar readiness and process-tree smoke test passed.")


if __name__ == "__main__":
    main()
