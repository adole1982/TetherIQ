# TetherMesh ⚡

> **Zero-config local desktop control plane and proxy gateway (`127.0.0.1:4000`) for autonomous AI coding agents.**  
> Provides automatic model failovers, hard runaway spend caps, 1-click dynamic MCP tool syncing across 6+ client environments, live token telemetry HUD, and full-spectrum activity tracing.

---

## ⚡ 60-Second Quickstart Guide

Get up and running with TetherMesh in 3 effortless steps:

### 1. Download & Launch TetherMesh
- Run the TetherMesh desktop application (`.exe`, `.dmg`, or `.deb`).
- TetherMesh automatically spins up the local proxy gateway on `http://127.0.0.1:4000`.

### 2. Enter Your Provider API Keys
- Click **"Keys"** or open the **60-Second Quickstart Wizard** in the top bar.
- Add your Anthropic, OpenAI, AWS Bedrock, Google Vertex, Groq, or Local Ollama credentials.  
*(Keys remain strictly local in your desktop vault and are never sent to third-party cloud servers).*

### 3. Connect Your Coding Agent / Tool
Choose your agent below and connect in one step:

#### 🟢 Claude Code CLI
```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:4000
claude
```
*Or click "Auto-Configure Claude Code" in TetherMesh to inject it into `~/.claude.json`.*

#### 🟣 AI IDEs (Cursor, Windsurf, Devin, Antigravity)
- **Base URL:** `http://127.0.0.1:4000/v1`
- **Model:** `fast-code` (low-latency) or `heavy-reasoning` (deep reasoning)
- **MCP Auto-Sync:** Click **"Connect & Auto-Configure All Files"** in TetherMesh's Tool Hub to inject any of the 50+ MCP servers into `~/.cursor/mcp.json`, `~/.codeium/windsurf/mcp_config.json`, `devin.json`, or `.mcp.json`.

#### 🔵 Python & TypeScript SDKs
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:4000/v1",
    api_key="tethermesh-local"
)

response = client.chat.completions.create(
    model="heavy-reasoning",
    messages=[{"role": "user", "content": "Refactor this architecture"}]
)
print(response.choices[0].message.content)
```

---

## 🛡️ Core Features

1. **Dual Gateway Engine (`127.0.0.1:4000`):**
   - Full OpenAI (`/v1/chat/completions`, `/v1/models`) and Anthropic (`/v1/messages`) protocol compatibility.
   - Low loopback latency ($< 5\text{ ms}$).

2. **Resilient Model Failover Matrix:**
   - Linear and tiered priority chains (e.g. Anthropic $\rightarrow$ AWS Bedrock $\rightarrow$ Groq $\rightarrow$ Ollama).
   - Silent `429 Too Many Requests` and `503 Service Unavailable` recovery without breaking active agent CLI sessions.
   - Virtual Model Aliases: `fast-code` and `heavy-reasoning`.

3. **Hard Runaway Spend Circuit Breakers:**
   - Visual daily and monthly spend limit dials (e.g. \$10.00/day).
   - Automatically short-circuits runaway recursive agent loops with `HTTP 402 Budget Exceeded: TetherMesh spend limit reached`.

4. **50+ Official & Verified MCP Tool Marketplace:**
   - Verified schemas for **Databricks, Snowflake, Supabase, PostgreSQL, Notion, Slack, Jira, GitHub, Docker, Sentry, Brave Search, Pinecone**, and 40+ more.
   - 1-Click simultaneous non-destructive configuration file injection across Cursor, Windsurf, Devin, Claude Code CLI, Claude Desktop, and Antigravity.

5. **Deep Observability & Activity Tracing:**
   - Real-time span waterfall visualizer.
   - Microsecond latency breakdowns, prompt/payload inspectors, and OpenTelemetry-compatible traces.

6. **Embedded Execution Terminal:**
   - Integrated drawer running native host shells (`powershell.exe`, `zsh`, `bash`) with pre-loaded proxy gateway environment variables.

7. **1-Click Sanitized Debug Reporter:**
   - Generates clean GitHub issue markdown with all API keys and bearer tokens automatically redacted (`sk-ant-***`, `ghp_***`).

---

## 🛠️ Development & Building Locally

```bash
# Install dependencies
npm install

# Start Vite React UI
npm run dev

# (Option A) Run LiteLLM Proxy in Development
litellm --port 4000 --host 127.0.0.1 --config sidecar/dev_config.yaml

# (Option B) Build LiteLLM Standalone Sidecar Binary (Windows)
npm run sidecar:build

# Build production frontend bundle
npm run build
```

---
*Built with Tauri v2, React 19, TypeScript, Tailwind CSS, and official LiteLLM Proxy Core.*
