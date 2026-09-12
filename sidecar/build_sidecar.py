"""
TetherIQ Sidecar Freezer Script
Compiles sidecar/entrypoint.py into a standalone executable:
src-tauri/binaries/litellm-proxy-x86_64-pc-windows-msvc.exe
"""

import os
import sys
import subprocess
import shutil

def freeze_sidecar():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    entrypoint = os.path.join(base_dir, "sidecar", "entrypoint.py")
    output_dir = os.path.join(base_dir, "src-tauri", "binaries")
    os.makedirs(output_dir, exist_ok=True)

    target_name = "litellm-proxy-x86_64-pc-windows-msvc" if sys.platform == "win32" else (
        "litellm-proxy-x86_64-apple-darwin" if sys.platform == "darwin" else "litellm-proxy-x86_64-unknown-linux-gnu"
    )

    print(f"[TetherIQ Freezer] Freezing sidecar into standalone binary: {target_name}...")

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--clean",
        "--name",
        target_name,
        "--distpath",
        output_dir,
        "--workpath",
        os.path.join(base_dir, "build_pyinstaller"),
        "--hidden-import", "litellm",
        "--hidden-import", "litellm.proxy.proxy_server",
        "--hidden-import", "uvicorn",
        "--hidden-import", "fastapi",
        "--hidden-import", "sqlite3",
        "--hidden-import", "pydantic",
        "--hidden-import", "anyio",
        "--hidden-import", "certifi",
        entrypoint
    ]

    print(f"[TetherIQ Freezer] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd)
    if result.returncode == 0:
        print(f"[TetherIQ Freezer] SUCCESS: Sidecar frozen into {output_dir}/{target_name}")
    else:
        print(f"[TetherIQ Freezer] Freezing failed with exit code {result.returncode}")
        sys.exit(result.returncode)

if __name__ == "__main__":
    freeze_sidecar()
