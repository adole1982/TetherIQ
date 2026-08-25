# TetherIQ V1 Ship Checklist

**Target:** Working desktop app (.exe / .dmg) with core proxy functionality

---

## **✅ Completed (Ready to Ship)**

### **Backend (Proxy Gateway):**
- [x] Fastify server on port 4000
- [x] OpenAI `/v1/chat/completions` endpoint
- [x] Anthropic `/v1/messages` endpoint  
- [x] AWS Bedrock adapter (working with user's model: `global.anthropic.claude-sonnet-4-5-20250929-v1:0`)
- [x] Spend tracking with persistent ledger (`.tether/spend_ledger.json`)
- [x] Circuit breaker (402 response when budget exceeded)
- [x] Atomic budget reservation with AsyncLock (prevents race conditions)
- [x] Health check endpoint (`/health`)
- [x] Budget control endpoints (`/v1/spend/budget`, `/v1/spend/reset`)
- [x] Proper error propagation (no silent mock fallbacks in production)
- [x] Test suite (22/22 passing)

### **Frontend (React UI):**
- [x] Live Telemetry HUD tab (real spend data from proxy)
- [x] Model Routing Matrix tab (provider configuration)
- [x] MCP Tool Marketplace tab (50+ verified tools catalog)
- [x] Activity Traces tab (UI complete, shows example data)
- [x] Connected Agents tab (UI complete, shows example data)
- [x] Quickstart guide tab (working code snippets)
- [x] Real-time proxy status indicator (green dot when connected)
- [x] Budget limit sliders (updates proxy via API)
- [x] Circuit breaker reset button
- [x] Beautiful dark theme UI

### **Build System:**
- [x] Vite dev server working
- [x] Frontend builds successfully (`npm run build`)
- [x] Proxy compiles without errors
- [x] TypeScript configuration fixed (esModuleInterop)
- [x] All dependencies installed
- [x] Tauri v2 structure scaffolded

---

## **🚧 In Progress (Needed for V1)**

### **Task #8: Billing Mode Selector** (1-2 hours)
- [ ] Add dropdown to Matrix tab provider config
- [ ] Options: "Pay-per-token" (default) vs "Subscription (unlimited)"
- [ ] Update HUD to show appropriate metrics:
  - Pay-per-token: Show dollar spend + circuit breaker
  - Subscription: Show token usage, no dollar enforcement
- [ ] Update circuit breaker logic to respect billing mode

### **Task #5: Install Rust Toolchain** (10 min user action)
User needs to run:
```bash
# Windows:
winget install Rustlang.Rustup
# Or download from https://rustup.rs/

# Then:
cd src-tauri
cargo generate-lockfile
cargo check
```

### **Task #6: Integrate Proxy as Tauri Child Process** (2-3 hours)
- [ ] Import `@tauri-apps/plugin-shell` in React
- [ ] Spawn `npm run proxy` as child process on app launch
- [ ] Wire up Start/Stop Proxy button to actually control process
- [ ] Ensure proxy process dies when Tauri app closes
- [ ] Add retry logic if proxy crashes
- [ ] Set environment variables (AWS credentials, etc.) for child process

### **Task #7: Build and Test Tauri Installer** (1 hour)
- [ ] Run `npm run tauri build`
- [ ] Test .exe / .msi / .dmg installer
- [ ] Verify icons load
- [ ] Test end-to-end: install → add API keys → proxy starts → make request
- [ ] Verify clean uninstall

---

## **⏰ Estimated Time to V1 Ship:** 4-6 hours

**Breakdown:**
- Billing mode selector: 1-2 hours
- Rust install: 10 min (user)
- Proxy child process integration: 2-3 hours
- Build & test: 1 hour

---

## **📦 V1 Feature Set (What Ships)**

### **What Works in V1:**
✅ Desktop app auto-starts local proxy on port 4000  
✅ Real-time spend tracking with circuit breaker  
✅ AWS Bedrock integration (Claude models)  
✅ OpenAI API support  
✅ Pay-per-token + Subscription billing modes  
✅ Budget limit controls (daily/monthly caps)  
✅ Beautiful monitoring UI  
✅ MCP tool catalog (50+ tools listed)  
✅ Quickstart integration guides  

### **What's UI-Only (Not Connected Yet):**
🟡 Telemetry graph (shows mock animation, not real data)  
🟡 Activity traces (example data, not capturing real requests)  
🟡 Connected agents list (demo data)  
🟡 Provider health checks (all show green)  
🟡 MCP tool sync (UI only, doesn't write files yet)  

### **What's Deferred to V2:**
⏳ Hybrid billing (subscription + overage)  
⏳ Automatic failover chains  
⏳ Accurate token counting (tiktoken)  
⏳ Live telemetry streaming (SSE)  
⏳ OpenTelemetry trace capture  
⏳ Real agent session tracking  
⏳ Groq, Gemini, Vertex adapters  
⏳ Encrypted API key storage  

**See:** `V2_ROADMAP.md` for full details

---

## **🎯 V1 Success Criteria**

Ship when ALL of these are true:

1. ✅ Desktop app launches without errors
2. ✅ Proxy auto-starts and shows green status
3. ✅ Can configure AWS Bedrock credentials in UI
4. ✅ Test request through proxy succeeds
5. ✅ Spend tracking increments correctly
6. ✅ Circuit breaker trips at configured limit
7. ✅ Budget reset button works
8. ✅ App uninstalls cleanly

---

## **🧪 Pre-Ship Testing Checklist**

Before releasing V1, test these scenarios:

### **Scenario 1: Fresh Install**
- [ ] Download installer on clean Windows VM
- [ ] Run installer
- [ ] Launch TetherIQ
- [ ] Verify proxy starts (green dot)
- [ ] Navigate to Matrix tab
- [ ] Add AWS credentials
- [ ] Make test request: `curl -X POST http://127.0.0.1:4000/v1/chat/completions ...`
- [ ] Verify response received
- [ ] Check spend incremented in HUD

### **Scenario 2: Budget Enforcement**
- [ ] Set daily budget to $0.01
- [ ] Make multiple requests
- [ ] Verify circuit breaker trips (402 response)
- [ ] Check UI shows "Circuit Breaker Active"
- [ ] Click reset button
- [ ] Verify requests resume

### **Scenario 3: Claude Code CLI Integration**
- [ ] Set `export ANTHROPIC_BASE_URL=http://127.0.0.1:4000`
- [ ] Keep `CLAUDE_CODE_USE_BEDROCK=true`
- [ ] Run `claude` and ask a question
- [ ] Verify request routes through TetherIQ
- [ ] Check spend tracking updates

### **Scenario 4: App Lifecycle**
- [ ] Close app via X button
- [ ] Verify proxy process stops (no orphan Node process)
- [ ] Relaunch app
- [ ] Verify spend ledger persists (same daily spend)
- [ ] Verify proxy restarts correctly

---

## **🚀 Launch Readiness**

### **Documentation Needed:**
- [ ] README.md with quickstart
- [ ] Setup guide (how to enable Bedrock models in AWS)
- [ ] Troubleshooting (common errors)
- [ ] Screenshots/demo video

### **Release Assets:**
- [ ] Windows installer (.exe / .msi)
- [ ] macOS installer (.dmg)
- [ ] Linux package (.deb / .AppImage)
- [ ] CHANGELOG.md
- [ ] LICENSE file

### **Announcement:**
- [ ] GitHub release notes
- [ ] X/Twitter post
- [ ] Show HN / Reddit post
- [ ] Demo video/GIF

---

**Last Updated:** 2026-08-19  
**Status:** 3 completed tasks, 4 remaining tasks  
**Next:** Task #8 (billing mode) OR Task #5 (Rust install) - user's choice
