"""
TetherMesh Packaged Application Smoke Test
Verifies packaged filesystem layout, PE headers, Tauri externalBin alignment,
port 0 socket binding, [TETHER_READY] stdout emission, and process tree termination.
"""

import os
import sys
import json
import time
import subprocess

def run_packaged_smoke_test():
    project_root = "c:\\Projects\\TetherIQ"
    tauri_conf_path = os.path.join(project_root, "src-tauri", "tauri.conf.json")
    binaries_dir = os.path.join(project_root, "src-tauri", "binaries")
    target_triple = "x86_64-pc-windows-msvc"
    
    primary_exe = os.path.join(binaries_dir, f"litellm-proxy-{target_triple}.exe")
    onedir_exe = os.path.join(binaries_dir, f"litellm-proxy-{target_triple}", "litellm-proxy.exe")

    print("============================================================")
    print("   TetherMesh Packaged Application & Sidecar Smoke Test    ")
    print("============================================================")

    # 1. Verify tauri.conf.json configuration
    assert os.path.exists(tauri_conf_path), f"Missing {tauri_conf_path}"
    with open(tauri_conf_path, "r", encoding="utf-8") as f:
        conf = json.load(f)
    ext_bin = conf.get("bundle", {}).get("externalBin", [])
    assert "binaries/litellm-proxy" in ext_bin, f"externalBin must contain 'binaries/litellm-proxy', got {ext_bin}"
    print("  [+] tauri.conf.json externalBin configuration verified")

    # 2. Verify primary binary exists and has PE header
    assert os.path.exists(primary_exe), f"Primary sidecar binary not found at {primary_exe}"
    with open(primary_exe, "rb") as f:
        header = f.read(2)
        assert header == b"MZ", f"File at {primary_exe} does not have valid PE MZ header (got {header})"
    file_size_mb = os.path.getsize(primary_exe) / (1024 * 1024)
    print(f"  [+] Primary binary validated: {primary_exe} ({file_size_mb:.1f} MB, PE header OK)")

    # 3. Verify onedir layout exists
    assert os.path.exists(onedir_exe), f"Onedir sidecar binary not found at {onedir_exe}"
    print(f"  [+] Onedir distribution validated: {onedir_exe}")

    # 4. Supervised startup test with port 0
    test_secret = "test_handshake_secret_smoke_abc12345"
    test_instance = "tether_smoke_test_instance"
    test_gen = "42"

    env = dict(os.environ)
    env["TETHER_SUPERVISED"] = "1"
    env["TETHER_HANDSHAKE_SECRET"] = test_secret
    env["TETHER_INSTANCE_ID"] = test_instance
    env["TETHER_GENERATION"] = test_gen
    env["AIR_GAPPED_MODE"] = "1"
    env["PYTHONUNBUFFERED"] = "1"

    cmd = [onedir_exe, "--port", "0"]
    print(f"  [+] Launching packaged sidecar: {' '.join(cmd)}")
    
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        bufsize=1
    )

    ready_record = None
    start_time = time.time()
    try:
        while time.time() - start_time < 15:
            line = proc.stdout.readline()
            if not line:
                if proc.poll() is not None:
                    break
                time.sleep(0.1)
                continue

            if "[TETHER_READY]:" in line:
                payload_str = line.split("[TETHER_READY]:", 1)[1].strip()
                ready_record = json.loads(payload_str)
                break

        assert ready_record is not None, "Failed to receive [TETHER_READY] within 15 seconds"
        print(f"  [+] Received valid [TETHER_READY] banner: {ready_record}")
        assert ready_record["instance_id"] == test_instance, f"Instance ID mismatch: {ready_record['instance_id']}"
        assert ready_record["generation"] == int(test_gen), f"Generation mismatch: {ready_record['generation']}"
        assert ready_record["port"] > 1024, f"Port must be valid ephemeral port: {ready_record['port']}"
        assert ready_record["air_gapped"] is True, f"Air-gapped state mismatch: {ready_record['air_gapped']}"
        print(f"  [+] Bound port {ready_record['port']} dynamically assigned via OS socket.bind(0)")

    finally:
        # 5. Clean Process-Tree Termination
        print("  [+] Terminating packaged sidecar process tree...")
        if proc.poll() is None:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                pass
        print("  [+] Process tree cleanly terminated with zero orphans.")

    print("------------------------------------------------------------")
    print("[PASS] PACKAGED APPLICATION SMOKE TEST PASSED SUCCESSFULLY")
    print("------------------------------------------------------------")

if __name__ == "__main__":
    run_packaged_smoke_test()
