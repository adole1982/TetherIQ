# TetherIQ V2 Enhancement Roadmap

**Purpose:** Track deferred features and architectural decisions for post-V1 release.

---

## **V1 Scope (Current Release)**
- ✅ Pay-per-token pricing mode (default)
- ✅ Subscription-unlimited mode (manual toggle)
- ✅ Basic circuit breaker (dollar-based for paid, disabled for subscription)
- ✅ AWS Bedrock adapter (working with user's free credits)
- ✅ OpenAI adapter (implemented)
- ✅ Desktop app (Tauri v2)
- ✅ MCP tool marketplace (UI only, sync via Tauri IPC)
- ✅ Real-time spend tracking from proxy `/health` endpoint
- ✅ Manual provider configuration in Matrix tab

---

## **V2 Planned Enhancements**

### **1. Hybrid Billing Mode** 🎯 *HIGH PRIORITY*

**Problem Statement:**  
Many services offer subscription plans with included usage + overage charges:
- Claude Pro: $20/mo with "5× free tier" → then pay-per-token overage
- Google AI Studio Pro: Unlimited for certain models, paid for others
- AWS Bedrock: Reserved capacity + burst pricing
- OpenAI Plus: ChatGPT included, API usage billed separately

**V1 Limitation:**  
Current "Subscription-unlimited" mode doesn't track overage costs.

**V2 Solution:**
```typescript
interface HybridBillingConfig {
  monthlyFee: number;                    // $20/mo base
  includedTokensPerDay?: number;         // 500k tokens/day included
  includedRequestsPerMin?: number;       // 60 rpm included
  overagePricing: {
    inputPer1k: number;                  // $0.003 after limit
    outputPer1k: number;                 // $0.015 after limit
  };
  overageThreshold: number;              // Warn at 80% of included usage
}
```

**UI Changes Needed:**
- Matrix tab: Add "Hybrid" billing mode option
- HUD: Show "Included usage: 142k / 500k tokens" progress bar
- Circuit breaker: Warn at included limit, enforce on overage dollar cap
- Telemetry: Separate graphs for included vs overage usage

**Estimated Effort:** 3-4 hours

---

### **2. Provider Health Checks & Auto-Failover** 🔄

**V1 Limitation:**  
- Provider status indicators show mock data (all green)
- Fallback chains defined in UI but not enforced by proxy (Issue S4 from audit)

**V2 Solution:**
- Background health check pings to each provider (every 60s)
- Detect 429 rate limits, 503 service unavailable
- Auto-failover to next provider in fallback chain
- UI shows real provider latency/status

**Implementation:**
```typescript
// proxy-engine/src/server.ts
async function executeWithFallback(
  request: ProxyRequest,
  fallbackChain: ModelFallbackNode[]
): Promise<ProxyResponse> {
  for (const node of fallbackChain.sort((a, b) => a.priority - b.priority)) {
    try {
      const result = await callProvider(node, request);
      if (result.ok) return result;
    } catch (err) {
      if (err.status === 429 || err.status === 503) {
        console.log(`[Failover] ${node.provider} unavailable, trying next...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error('All providers in fallback chain failed');
}
```

**Estimated Effort:** 4-6 hours

---

### **3. Accurate Token Counting** 📊

**V1 Limitation:**  
Token counting uses naive heuristic (`charCount / 4`), resulting in ~20% error margin.

**V2 Solution:**
- Integrate `tiktoken` for OpenAI models
- Use Anthropic SDK's `countTokens()` helper
- Support Bedrock's token counting API

**Impact:**
- Accurate spend tracking (critical for billing reconciliation)
- Circuit breaker trips at correct thresholds
- Telemetry matches provider dashboards

**Estimated Effort:** 2-3 hours (Issue S3 from audit)

---

### **4. Live Telemetry Streaming** 📡

**V1 Limitation:**  
HUD telemetry graph shows mock animated wave, not real request data.

**V2 Solution:**
- Add `/v1/telemetry/stream` SSE endpoint to proxy
- Emit events on each request completion:
  ```typescript
  {
    timestamp: Date.now(),
    tokensPerSecond: 45.2,
    latencyMs: 380,
    provider: 'bedrock',
    model: 'claude-3-5-sonnet',
    cost: 0.0082
  }
  ```
- Frontend subscribes to SSE stream
- Update Recharts graph with real-time data points

**Estimated Effort:** 2-3 hours

---

### **5. OpenTelemetry Trace Capture** 🔍

**V1 Limitation:**  
Activity Traces tab shows 3 hardcoded example traces.

**V2 Solution:**
- Instrument proxy with OpenTelemetry
- Capture spans:
  - Proxy ingress
  - Virtual alias resolution
  - Upstream provider call
  - Token counting
  - Spend ledger write
- Store last 100 traces in memory (or SQLite)
- Expose via `/v1/traces` API
- Frontend fetches and displays real traces

**Estimated Effort:** 4-5 hours

---

### **6. Agent Session Tracking** 🤖

**V1 Limitation:**  
"Active Client Agents" shows 4 mock agents with fake token counts.

**V2 Solution:**
- Track client sessions by IP + User-Agent
- Detect client type from headers:
  - `User-Agent: claude-code/2.1.235` → Claude Code CLI
  - `Referer: vscode://cursor` → Cursor IDE
  - Custom header `X-Client-Name: windsurf` → Windsurf
- Per-session token/spend accounting
- Real-time "last active" timestamps
- Idle timeout (5 min no requests = mark idle)

**Estimated Effort:** 3-4 hours

---

### **7. MCP Tool Config Sync (via Tauri IPC)** 🧰

**V1 Limitation:**  
"Sync to Clients" button in Tools tab is cosmetic - doesn't write actual files.

**V2 Solution:**
- Wire up Tauri IPC commands:
  ```rust
  #[tauri::command]
  fn sync_mcp_tools(tools: Vec<ToolConfig>, targets: Vec<TargetClient>) -> Result<Vec<SyncResult>, String> {
    // Write to ~/.cursor/mcp.json, ~/.claude/config.json, etc.
  }
  ```
- Use `configSyncService.ts` logic (already implemented)
- Non-destructive JSON merging with atomic writes
- Return sync status per client

**Estimated Effort:** 2-3 hours (Issue from audit - deferred)

---

### **8. Groq & Gemini Adapters** 🌐

**V1 Status:**  
AWS Bedrock adapter implemented and tested.

**V2 Priority:**
1. **Groq** - OpenAI-compatible, simple to add (30 min)
2. **Gemini** - Different protocol, needs adapter (1-2 hours)

**Why V2:**  
User has Bedrock working. Add these when users request them or for failover diversity.

---

### **9. Provider API Key Storage** 🔐

**V1 Limitation:**  
Matrix tab lets you enter API keys, but they're stored in React state only (lost on refresh).  
Proxy reads keys from environment variables.

**V2 Solution:**
- Store encrypted API keys via Tauri's secure storage:
  ```rust
  #[tauri::command]
  fn store_api_key(provider: String, key: String) -> Result<(), String> {
    // Use OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service)
  }
  ```
- Proxy reads keys from Tauri-managed storage
- Keys never touch localStorage (security risk)

**Estimated Effort:** 3-4 hours

---

### **10. Free Tier Quota Monitoring** 📈

**Problem:**  
Services like Google AI Studio Free have daily/monthly limits (1M tokens/day, 60 rpm).

**V2 Solution:**
- Add "Free Tier" billing mode
- Track quota usage separately
- Show progress bars: "850k / 1M tokens today (85%)"
- Warn at 80% usage
- Pause requests at 100% (prevents errors)

**Estimated Effort:** 2-3 hours

---

## **V2 Non-Feature Improvements**

### **Code Quality:**
- [ ] Replace heuristic token counting with tiktoken (S3)
- [ ] Add fallback chain enforcement (S4)
- [ ] Add stream abort cleanup for reserved cost (O2 from audit)
- [ ] Add file locking for concurrent config writes (O1 from audit)
- [ ] Add React error boundaries (O4 from audit)

### **Testing:**
- [ ] Add integration tests for live API calls
- [ ] Test concurrent request race conditions
- [ ] Verify circuit breaker under high load
- [ ] Test all provider adapters end-to-end

### **Documentation:**
- [ ] User guide for setting up each provider
- [ ] AWS Bedrock model access guide
- [ ] MCP tool configuration examples
- [ ] Troubleshooting common issues

---

## **V2 Release Criteria**

Ship V2 when ANY of these happen:
1. 🔥 **Users request hybrid billing** (Claude Pro users hitting overage)
2. 🔥 **Failover needed** (provider outages causing failures)
3. 📊 **Telemetry complaints** ("Why is the graph fake?")
4. 🔐 **Security concerns** (API keys in localStorage)

---

## **Decision Log**

### **2026-08-19: Billing Mode Scope**
- **Decision:** Ship V1 with pay-per-token + subscription-unlimited only
- **Rationale:** Hybrid mode adds complexity; most users have simple billing
- **Deferred:** Hybrid mode with overage tracking to V2
- **Who decided:** User + AI pair programming session

### **2026-08-19: Provider Adapters**
- **Decision:** Ship V1 with Bedrock + OpenAI only
- **Rationale:** User has working Bedrock setup; validate architecture first
- **Deferred:** Groq, Gemini, Vertex, Mistral to V2
- **Next:** Add adapters when users request them

### **2026-08-19: Telemetry vs Shipping**
- **Decision:** Ship V1 with mock telemetry graph
- **Rationale:** Core proxy + circuit breaker + spend tracking work correctly
- **Deferred:** Live SSE streaming, trace capture, agent tracking to V2
- **Trade-off:** Beautiful UI now, real-time data later

---

## **How to Use This Document**

1. **Before starting V2 work:**
   - Read this file
   - Review "Decision Log" to understand why we made trade-offs
   - Check if priorities changed (user feedback may reorder features)

2. **When users report issues:**
   - Check if it's a V2 feature ("When will the telemetry graph be real?")
   - Point them to this roadmap
   - Add +1 vote to priority

3. **When V2 development starts:**
   - Convert each section to GitHub issues
   - Estimate effort may change (re-assess after V1 ship)
   - Test each feature with real user scenarios

---

**Last Updated:** 2026-08-19  
**Status:** V1 in development, V2 roadmap finalized
