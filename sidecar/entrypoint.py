"""
TetherMesh LiteLLM Proxy Sidecar Entrypoint

This is the PyInstaller-bundled entrypoint for the LiteLLM proxy server.
It is spawned by the Tauri desktop app as a sidecar process.

Usage (standalone dev):
  python entrypoint.py --port 4000 --host 127.0.0.1 --config dev_config.yaml

Usage (via Tauri sidecar):
  Automatically launched by TetherMesh with appropriate args.
"""

import argparse
import asyncio
import os
import sys
import time
import types
import uuid
import json
from collections import deque
from datetime import datetime
from unittest.mock import MagicMock
from importlib.machinery import ModuleSpec

# 1. Ensure UTF-8 console encoding on Windows to prevent UnicodeEncodeError with banners
os.environ["PYTHONIOENCODING"] = "utf-8"
os.environ["PYTHONUTF8"] = "1"
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# 2. Configure SSL cert bundle from certifi if available
try:
    import certifi
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
    os.environ['CURL_CA_BUNDLE'] = certifi.where()
except Exception:
    pass

# 3. Use local pricing map for instant offline startup and disable admin UI
os.environ["DISABLE_ADMIN_UI"] = "true"
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
os.environ["POLARS_SKIP_CPU_CHECK"] = "1"

# 4. Mock finder for polars and focus modules to prevent AVX2 / CPU instruction crashes
class _MockModuleFinder:
    def find_spec(self, fullname, path, target=None):
        if (fullname.startswith('litellm.integrations.focus') or 
            fullname.startswith('polars') or
            fullname.startswith('_polars')):
            return ModuleSpec(fullname, self)
        return None

    def create_module(self, spec):
        mod = types.ModuleType(spec.name)
        mod.__path__ = []
        return mod

    def exec_module(self, module):
        module.FocusLogger = MagicMock
        module.FocusTimeWindow = MagicMock
        module.MavvrikFocusLogger = MagicMock

sys.meta_path.insert(0, _MockModuleFinder())

# 5. Extract --config from sys.argv at top-level before importing proxy_server
for i, arg in enumerate(sys.argv):
    if arg == "--config" and i + 1 < len(sys.argv):
        cfg = os.path.abspath(sys.argv[i + 1])
        os.environ["LITELLM_CONFIG_PATH"] = cfg
        os.environ["CONFIG_FILE_PATH"] = cfg
    elif arg.startswith("--config="):
        cfg = os.path.abspath(arg.split("=", 1)[1])
        os.environ["LITELLM_CONFIG_PATH"] = cfg
        os.environ["CONFIG_FILE_PATH"] = cfg

# 6. Silence ascii banner to avoid cp1252 charmap encoding errors on Windows
try:
    import litellm.proxy.common_utils.banner
    litellm.proxy.common_utils.banner.show_banner = lambda *args, **kwargs: None
except Exception:
    pass

# 7. Import uvicorn, fastapi, and inject get_flat_dependant shim if missing
from fastapi import Request
from fastapi.responses import StreamingResponse, JSONResponse
import fastapi.dependencies.utils
if not hasattr(fastapi.dependencies.utils, 'get_flat_dependant'):
    from fastapi.dependencies.models import Dependant
    def get_flat_dependant(dependant: Dependant, *, skip_repeats: bool = False):
        flat = [dependant]
        for d in getattr(dependant, 'dependencies', []):
            flat.extend(get_flat_dependant(d, skip_repeats=skip_repeats))
        return flat
    fastapi.dependencies.utils.get_flat_dependant = get_flat_dependant

import uvicorn
import litellm
from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy.proxy_server import app


# ---------------------------------------------------------------------------
# TetherIQ Real-Time In-Memory Telemetry Engine
# ---------------------------------------------------------------------------

class TetherTelemetryBuffer:
    def __init__(self, max_traces=100, max_history=60):
        self.traces = deque(maxlen=max_traces)
        self.agents = {}  # id -> ConnectedAgent dict
        self.history = deque(maxlen=max_history)  # rolling points
        self.listeners = []  # list of asyncio.Queue for SSE
        self.total_tokens_today = 0
        self.total_cost_today = 0.0
        self.total_requests_today = 0
        self.current_tokens_per_sec = 0.0
        self.current_latency_ms = 0
        self.current_burn_rate_per_hour = 0.0

    def detect_agent(self, kwargs, client_ip):
        headers = {}
        # Try getting headers from proxy_server_request
        psr = kwargs.get("proxy_server_request") or {}
        raw_headers = psr.get("headers") or kwargs.get("litellm_params", {}).get("headers") or kwargs.get("headers") or {}
        if isinstance(raw_headers, dict):
            headers = {k.lower(): str(v) for k, v in raw_headers.items()}
        elif isinstance(raw_headers, (list, tuple)):
            for item in raw_headers:
                if isinstance(item, (list, tuple)) and len(item) == 2:
                    k = item[0].decode("utf-8", "ignore").lower() if isinstance(item[0], bytes) else str(item[0]).lower()
                    v = item[1].decode("utf-8", "ignore") if isinstance(item[1], bytes) else str(item[1])
                    headers[k] = v

        user_agent = (headers.get("user-agent") or "").lower()
        if "claude-code" in user_agent or "claude_code" in user_agent or "@anthropic-ai/claude-code" in user_agent:
            return "ag-claude-code", "Claude Code CLI", "Terminal"
        elif "cursor" in user_agent or "anysphere" in user_agent:
            return "ag-cursor", "Cursor IDE (Composer)", "Code2"
        elif "windsurf" in user_agent or "codeium" in user_agent:
            return "ag-windsurf", "Windsurf IDE (Cascade)", "Compass"
        elif "devin" in user_agent:
            return "ag-devin", "Devin", "Bot"
        elif "aider" in user_agent:
            return "ag-aider", "Aider", "Terminal"
        elif "antigravity" in user_agent or "gemini" in user_agent:
            return "ag-antigravity", "Antigravity", "Sparkles"
        elif "python" in user_agent:
            return "ag-python-sdk", "Python SDK", "Code2"
        elif "node" in user_agent or "axios" in user_agent or "fetch" in user_agent:
            return "ag-ts-sdk", "TypeScript SDK", "Code2"
        else:
            return f"ag-{client_ip.replace('.', '-').replace(':', '-')}", "AI Coding Agent", "Bot"

    def record_trace(self, trace_dict, agent_info):
        self.traces.appendleft(trace_dict)
        self.total_requests_today += 1
        self.total_tokens_today += trace_dict.get("totalTokens", 0)
        self.total_cost_today += trace_dict.get("cost", 0.0)

        # Update or register connected agent
        ag_id, ag_name, ag_icon = agent_info
        now_ms = int(time.time() * 1000)
        if ag_id not in self.agents:
            self.agents[ag_id] = {
                "id": ag_id,
                "clientName": ag_name,
                "agentIcon": ag_icon,
                "ip": trace_dict.get("clientIp", "127.0.0.1"),
                "connectedAt": now_ms,
                "lastActiveAt": now_ms,
                "totalTokens": trace_dict.get("totalTokens", 0),
                "totalCost": trace_dict.get("cost", 0.0),
                "activeModel": trace_dict.get("modelServed", trace_dict.get("modelRequested", "")),
                "status": "active"
            }
        else:
            ag = self.agents[ag_id]
            ag["lastActiveAt"] = now_ms
            ag["totalTokens"] += trace_dict.get("totalTokens", 0)
            ag["totalCost"] += trace_dict.get("cost", 0.0)
            ag["activeModel"] = trace_dict.get("modelServed", trace_dict.get("modelRequested", ""))
            ag["status"] = "active"

        # Update active throughput & latency metrics
        duration_sec = max(0.1, trace_dict.get("totalDurationMs", 0) / 1000.0)
        tok_sec = trace_dict.get("totalTokens", 0) / duration_sec
        self.current_tokens_per_sec = round(tok_sec, 1)
        self.current_latency_ms = trace_dict.get("totalDurationMs", 0)
        self.current_burn_rate_per_hour = round(trace_dict.get("cost", 0.0) * (3600.0 / max(1.0, duration_sec)), 2)

        # Append rolling history point
        point = {
            "timestamp": now_ms,
            "tokensPerSecond": self.current_tokens_per_sec,
            "inputTokens": trace_dict.get("promptTokens", 0),
            "outputTokens": trace_dict.get("completionTokens", 0),
            "latencyMs": self.current_latency_ms,
            "costEstimate": trace_dict.get("cost", 0.0),
            "provider": trace_dict.get("providerServed", "LiteLLM"),
            "model": trace_dict.get("modelServed", "")
        }
        self.history.append(point)

        # Broadcast live event to all connected SSE clients
        event_payload = json.dumps({
            "type": "trace",
            "trace": trace_dict,
            "agent": self.agents[ag_id],
            "point": point,
            "stats": self.get_stats()
        })
        for q in list(self.listeners):
            try:
                q.put_nowait(event_payload)
            except Exception:
                pass

    def get_stats(self):
        return {
            "tokensPerSecond": self.current_tokens_per_sec,
            "currentLatencyMs": self.current_latency_ms,
            "currentBurnRatePerHour": self.current_burn_rate_per_hour,
            "totalTokensToday": self.total_tokens_today,
            "totalCostToday": round(self.total_cost_today, 4),
            "totalRequestsToday": self.total_requests_today
        }

    def get_snapshot(self):
        now_ms = int(time.time() * 1000)
        for ag in self.agents.values():
            if now_ms - ag["lastActiveAt"] > 120000:
                ag["status"] = "idle"

        return {
            "traces": list(self.traces),
            "agents": list(self.agents.values()),
            "stats": self.get_stats(),
            "history": list(self.history)
        }


buffer = TetherTelemetryBuffer()


class TetherTelemetryLogger(CustomLogger):
    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        try:
            req_id = f"tr-{uuid.uuid4().hex[:8]}"
            headers = kwargs.get("litellm_params", {}).get("headers", {}) or kwargs.get("headers", {}) or {}
            client_ip = kwargs.get("client_ip", "127.0.0.1")
            agent_info = buffer.detect_agent(kwargs, client_ip)

            duration_ms = int((end_time - start_time) * 1000) if isinstance(start_time, (int, float)) and isinstance(end_time, (int, float)) else int((end_time.timestamp() - start_time.timestamp()) * 1000)
            duration_ms = max(1, duration_ms)

            usage = getattr(response_obj, "usage", None)
            if usage:
                prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
                completion_tokens = getattr(usage, "completion_tokens", 0) or 0
                total_tokens = getattr(usage, "total_tokens", 0) or (prompt_tokens + completion_tokens)
            elif isinstance(response_obj, dict) and "usage" in response_obj:
                u = response_obj["usage"]
                prompt_tokens = u.get("prompt_tokens", 0)
                completion_tokens = u.get("completion_tokens", 0)
                total_tokens = u.get("total_tokens", prompt_tokens + completion_tokens)
            else:
                prompt_tokens = 0
                completion_tokens = 0
                total_tokens = 0

            cost = kwargs.get("response_cost", 0.0) or 0.0
            model_req = kwargs.get("model", "")
            model_srv = getattr(response_obj, "model", model_req)

            messages = kwargs.get("messages", []) or kwargs.get("input", []) or []
            sample_prompt = ""
            if messages and isinstance(messages, list):
                last_msg = messages[-1]
                if isinstance(last_msg, dict):
                    sample_prompt = str(last_msg.get("content", ""))[:200]
                else:
                    sample_prompt = str(last_msg)[:200]

            spans = [
                {
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": "Proxy Loopback Ingest",
                    "startTime": 0,
                    "endTime": 3,
                    "durationMs": 3,
                    "status": "ok",
                    "attributes": {"port": 4000, "client": agent_info[1]}
                },
                {
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": f"Router Resolution [{model_req}]",
                    "startTime": 3,
                    "endTime": 6,
                    "durationMs": 3,
                    "status": "ok",
                    "attributes": {"model_requested": model_req, "model_served": model_srv}
                },
                {
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": f"Upstream Inference [{model_srv}]",
                    "startTime": 6,
                    "endTime": max(7, duration_ms - 2),
                    "durationMs": max(1, duration_ms - 8),
                    "status": "ok",
                    "attributes": {"total_tokens": total_tokens, "cost": f"${cost:.5f}"}
                },
                {
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": "Telemetry & Spend Ledger Ingest",
                    "startTime": max(7, duration_ms - 2),
                    "endTime": duration_ms,
                    "durationMs": 2,
                    "status": "ok",
                    "attributes": {"cost": f"${cost:.5f}"}
                }
            ]

            trace = {
                "id": req_id,
                "traceId": f"trace-{uuid.uuid4().hex[:12]}",
                "timestamp": int(time.time() * 1000),
                "type": "llm-proxy",
                "clientName": agent_info[1],
                "clientIp": client_ip,
                "modelRequested": model_req,
                "modelServed": model_srv,
                "providerServed": kwargs.get("custom_llm_provider", "LiteLLM"),
                "status": "success",
                "statusCode": 200,
                "totalDurationMs": duration_ms,
                "promptTokens": prompt_tokens,
                "completionTokens": completion_tokens,
                "totalTokens": total_tokens,
                "cost": round(cost, 5),
                "fallbacksTriggered": [],
                "spans": spans,
                "requestPayloadSummary": {
                    "messagesCount": len(messages) if isinstance(messages, list) else 1,
                    "stream": bool(kwargs.get("stream", False)),
                    "samplePrompt": sample_prompt
                }
            }
            buffer.record_trace(trace, agent_info)
        except Exception as e:
            print(f"[TetherMesh Logger Error] {e}", flush=True)

    async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
        try:
            req_id = f"tr-{uuid.uuid4().hex[:8]}"
            headers = kwargs.get("litellm_params", {}).get("headers", {}) or kwargs.get("headers", {}) or {}
            client_ip = kwargs.get("client_ip", "127.0.0.1")
            agent_info = buffer.detect_agent(kwargs, client_ip)

            duration_ms = int((end_time - start_time) * 1000) if isinstance(start_time, (int, float)) and isinstance(end_time, (int, float)) else int((end_time.timestamp() - start_time.timestamp()) * 1000)
            duration_ms = max(1, duration_ms)

            error_msg = str(kwargs.get("exception", "Request failed"))
            status_code = 500
            if "429" in error_msg or "RateLimit" in error_msg:
                status_code = 429
                trace_status = "rate-limited"
            elif "401" in error_msg or "Authentication" in error_msg:
                status_code = 401
                trace_status = "error"
            elif "402" in error_msg or "Budget" in error_msg:
                status_code = 402
                trace_status = "blocked-budget"
            else:
                trace_status = "error"

            model_req = kwargs.get("model", "")

            spans = [
                {
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": "Proxy Loopback Ingest",
                    "startTime": 0,
                    "endTime": 3,
                    "durationMs": 3,
                    "status": "ok",
                    "attributes": {"port": 4000, "client": agent_info[1]}
                },
                {
                    "id": f"sp-{uuid.uuid4().hex[:6]}",
                    "name": f"Upstream Execution Attempt [{model_req}]",
                    "startTime": 3,
                    "endTime": duration_ms,
                    "durationMs": max(1, duration_ms - 3),
                    "status": "error",
                    "attributes": {"error": error_msg[:120]}
                }
            ]

            trace = {
                "id": req_id,
                "traceId": f"trace-{uuid.uuid4().hex[:12]}",
                "timestamp": int(time.time() * 1000),
                "type": "llm-proxy",
                "clientName": agent_info[1],
                "clientIp": client_ip,
                "modelRequested": model_req,
                "modelServed": model_req,
                "providerServed": kwargs.get("custom_llm_provider", "LiteLLM"),
                "status": trace_status,
                "statusCode": status_code,
                "totalDurationMs": duration_ms,
                "promptTokens": 0,
                "completionTokens": 0,
                "totalTokens": 0,
                "cost": 0.0,
                "fallbacksTriggered": [],
                "spans": spans,
                "requestPayloadSummary": {
                    "messagesCount": 1,
                    "stream": bool(kwargs.get("stream", False)),
                    "samplePrompt": error_msg[:200]
                }
            }
            buffer.record_trace(trace, agent_info)
        except Exception as e:
            print(f"[TetherMesh Failure Logger Error] {e}", flush=True)


# Register TetherTelemetryLogger with LiteLLM callbacks
telemetry_logger = TetherTelemetryLogger()
litellm.callbacks = [telemetry_logger]


# ---------------------------------------------------------------------------
# Custom TetherIQ API Endpoints on Port 4000
# ---------------------------------------------------------------------------

@app.get("/tether/telemetry")
async def get_tether_telemetry():
    """Return an instant snapshot of live traces, connected agents, and rolling stats."""
    return JSONResponse(content=buffer.get_snapshot())

@app.get("/tether/events")
async def get_tether_events():
    """Server-Sent Events (SSE) stream for real-time trace and throughput broadcasts."""
    async def event_generator():
        q = asyncio.Queue()
        buffer.listeners.append(q)
        try:
            # Send initial snapshot immediately on connect
            snapshot = buffer.get_snapshot()
            yield f"data: {json.dumps({'type': 'init', 'snapshot': snapshot})}\n\n"
            while True:
                data = await q.get()
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if q in buffer.listeners:
                buffer.listeners.remove(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def main():
    parser = argparse.ArgumentParser(description="TetherMesh LiteLLM Sidecar")
    parser.add_argument("--port", type=int, default=4000, help="Port to listen on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address to bind")
    parser.add_argument("--config", type=str, default=None, help="Path to litellm_config.yaml")
    args, unknown = parser.parse_known_args()

    print(f"[TetherMesh] LiteLLM Sidecar running on http://{args.host}:{args.port} (config: {os.environ.get('LITELLM_CONFIG_PATH')})", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info", loop="asyncio", workers=1)

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    main()
