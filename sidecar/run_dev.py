"""
TetherMesh Direct LiteLLM Proxy Runner
"""

import os
import sys

os.environ["DISABLE_ADMIN_UI"] = "true"
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
os.environ["POLARS_SKIP_CPU_CHECK"] = "1"
os.environ["LITELLM_CONFIG_PATH"] = os.path.abspath(os.path.join(os.path.dirname(__file__), "dev_config.yaml"))

try:
    import certifi
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
except Exception:
    pass

import uvicorn
from litellm.proxy.proxy_server import app

if __name__ == "__main__":
    print(f"[TetherMesh] Starting LiteLLM proxy on 127.0.0.1:4000 with config: {os.environ['LITELLM_CONFIG_PATH']}")
    uvicorn.run(app, host="127.0.0.1", port=4000, log_level="info")
