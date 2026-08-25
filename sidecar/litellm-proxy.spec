# -*- mode: python ; coding: utf-8 -*-
# TetherMesh LiteLLM Proxy — PyInstaller Spec File
#
# Uses --onedir (COLLECT) to avoid antivirus false positives and cold-start
# extraction delays that --onefile causes on Windows.

import os
import sys
import ssl
import importlib

os.environ["POLARS_SKIP_CPU_CHECK"] = "1"

# Ensure HTTPS requests from tiktoken/requests during build can complete
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except Exception:
    pass

try:
    import requests
    import urllib3
    urllib3.disable_warnings()
    _orig_send = requests.Session.send
    def _unverified_send(self, request, **kwargs):
        kwargs['verify'] = False
        return _orig_send(self, request, **kwargs)
    requests.Session.send = _unverified_send
except Exception:
    pass

block_cipher = None

from PyInstaller.utils.hooks import collect_data_files, copy_metadata, collect_submodules

# ---------------------------------------------------------------------------
# Resolve data files that LiteLLM needs at runtime
# ---------------------------------------------------------------------------
datas = []
try:
    datas += collect_data_files('litellm')
    datas += collect_data_files('tiktoken')
    datas += collect_data_files('certifi')
    datas += copy_metadata('litellm')
    datas += copy_metadata('tiktoken')
except Exception as e:
    print(f"WARNING collecting data files: {e}")

# ---------------------------------------------------------------------------
# Hidden imports — modules that PyInstaller's static analyzer misses
# ---------------------------------------------------------------------------
hiddenimports = [
    # Uvicorn internals
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
    # FastAPI & dependencies
    'fastapi',
    'starlette',
    'pydantic',
    'pydantic_core',
    'pydantic.deprecated.decorator',
    # tiktoken tokenizer extensions
    'tiktoken_ext',
    'tiktoken_ext.openai_public',
    # Async utilities
    'asyncio',
    'backoff',
    'httpx',
    'httpx._transports',
    'httpx._transports.default',
    # Provider SDKs
    'openai',
    'anthropic',
    'boto3',
    'botocore',
]

# Collect all litellm submodules (integrations, proxy endpoints, logger registry, etc.)
try:
    hiddenimports += collect_submodules('litellm')
except Exception as e:
    print(f"WARNING collecting submodules: {e}")

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
a = Analysis(
    ['entrypoint.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'polars',
        '_polars_runtime_32',
        'pyarrow',
        'pandas',
        'litellm.integrations.focus',
        'tkinter',
        'matplotlib',
        'notebook',
        'scipy',
        'torch',
        'tensorflow',
        'PIL',
        'cv2',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

# ---------------------------------------------------------------------------
# Executable (console mode so Tauri can read stdout/stderr)
# ---------------------------------------------------------------------------
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='litellm-proxy',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,         # Disable UPX to prevent Windows Defender false positives
    console=True,      # Console mode: Tauri reads stdout/stderr via sidecar pipe
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# ---------------------------------------------------------------------------
# Collect into directory (--onedir mode)
# ---------------------------------------------------------------------------
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='litellm-proxy',
)
