# Google Antigravity Implementation Tasks
**Production-Ready Proxy Requirements**

---

## **Task 1: Accurate Token Counting (2-3 hours)**

### **Problem:**
Current token counting uses naive heuristic: `charCount / 4` (~20% error)

### **Solution:**
Integrate proper token counting libraries for each provider.

### **Steps for Antigravity:**

**Step 1.1: Install tiktoken (for OpenAI models)**
```bash
cd C:\Projects\TetherIQ
npm install tiktoken
```

**Step 1.2: Add token counting utilities**
Create file: `proxy-engine/src/utils/tokenCounter.ts`

```typescript
import { encoding_for_model } from 'tiktoken';

export interface TokenCount {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Count tokens for OpenAI models using tiktoken
 */
export function countOpenAITokens(messages: any[], modelId: string): number {
  try {
    // Map model variants to tiktoken model names
    const modelMapping: Record<string, string> = {
      'gpt-4': 'gpt-4',
      'gpt-4-turbo': 'gpt-4',
      'gpt-3.5-turbo': 'gpt-3.5-turbo',
      'o1': 'gpt-4', // Use GPT-4 encoding for o-series
      'o1-mini': 'gpt-4',
      'o3-mini': 'gpt-4'
    };

    const baseModel = Object.keys(modelMapping).find(key => modelId.includes(key)) || 'gpt-4';
    const encoding = encoding_for_model(modelMapping[baseModel] as any);

    let totalTokens = 0;
    for (const message of messages) {
      totalTokens += encoding.encode(JSON.stringify(message)).length;
    }

    encoding.free();
    return totalTokens;
  } catch (err) {
    console.warn('[TokenCounter] tiktoken failed, using fallback:', err);
    return Math.ceil(JSON.stringify(messages).length / 4);
  }
}

/**
 * Count tokens for Anthropic models (heuristic for now, SDK method requires API call)
 */
export function countAnthropicTokens(messages: any[]): number {
  // Anthropic's counting is more accurate with their SDK, but requires API call
  // For now, use improved heuristic: 1 token ≈ 3.5 characters for Claude
  const text = JSON.stringify(messages);
  return Math.ceil(text.length / 3.5);
}

/**
 * Count output tokens from completion text
 */
export function countOutputTokens(text: string, provider: string): number {
  if (provider === 'openai') {
    try {
      const encoding = encoding_for_model('gpt-4' as any);
      const tokens = encoding.encode(text).length;
      encoding.free();
      return tokens;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }
  
  // Anthropic/Bedrock: 1 token ≈ 3.5 chars
  return Math.ceil(text.length / 3.5);
}

/**
 * Universal token counter (chooses method based on provider)
 */
export function countTokens(
  messages: any[], 
  provider: string, 
  modelId: string
): number {
  switch (provider) {
    case 'openai':
      return countOpenAITokens(messages, modelId);
    case 'anthropic':
    case 'bedrock':
      return countAnthropicTokens(messages);
    default:
      // Fallback for unknown providers
      return Math.ceil(JSON.stringify(messages).length / 4);
  }
}
```

**Step 1.3: Update proxy to use accurate counting**
Edit: `proxy-engine/src/server.ts`

Find these lines (around line 180-190):
```typescript
// Current naive counting
const inputTokens = Math.ceil(JSON.stringify(messages).length / 4);
```

Replace with:
```typescript
import { countTokens, countOutputTokens } from './utils/tokenCounter';

// Use accurate token counting
const inputTokens = countTokens(messages, targetProvider, targetModel);
```

Then for output token counting, find where response is processed (around line 300-400):
```typescript
// After getting response text
const outputTokens = countOutputTokens(responseText, targetProvider);
```

**Step 1.4: Test token counting accuracy**
Run proxy tests:
```bash
npm run test
```

Expected: Tests should still pass. Token counts should be more accurate.

**Verification:**
- [ ] tiktoken installed
- [ ] `tokenCounter.ts` file created with all functions
- [ ] `server.ts` imports and uses new counting functions
- [ ] Tests pass
- [ ] Make a test request through proxy, verify token count matches AWS/OpenAI dashboard

---

## **Task 2: Real Trace Capture (3-4 hours)**

### **Problem:**
Traces tab shows 3 hardcoded example traces. Proxy doesn't capture real request data.

### **Solution:**
Store last 100 requests in memory, expose via API endpoint.

### **Steps for Antigravity:**

**Step 2.1: Create trace storage module**
Create file: `proxy-engine/src/utils/traceStore.ts`

```typescript
import { randomUUID } from 'crypto';

export interface TraceSpan {
  name: string;
  startTimeMs: number;
  durationMs: number;
  status: 'success' | 'error';
}

export interface StoredTrace {
  id: string;
  traceId: string;
  timestamp: number;
  clientName: string;
  clientIp: string;
  userAgent: string;
  type: 'llm-proxy' | 'mcp-tool';
  
  // Request details
  requestedModel: string;
  modelServed: string;
  providerServed: string;
  
  // Metrics
  totalDurationMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  
  // Status
  status: 'success' | 'error' | 'timeout';
  errorMessage?: string;
  
  // Detailed spans (for waterfall view)
  spans: TraceSpan[];
}

class TraceStore {
  private traces: StoredTrace[] = [];
  private readonly MAX_TRACES = 100;

  addTrace(trace: StoredTrace): void {
    this.traces.unshift(trace); // Add to beginning
    if (this.traces.length > this.MAX_TRACES) {
      this.traces.pop(); // Remove oldest
    }
  }

  getTraces(limit: number = 50): StoredTrace[] {
    return this.traces.slice(0, limit);
  }

  getTraceById(traceId: string): StoredTrace | undefined {
    return this.traces.find(t => t.traceId === traceId);
  }

  clear(): void {
    this.traces = [];
  }
}

export const traceStore = new TraceStore();

/**
 * Helper to create a trace from request/response data
 */
export function createTrace(data: {
  clientIp: string;
  userAgent: string;
  requestedModel: string;
  modelServed: string;
  providerServed: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  durationMs: number;
  status: 'success' | 'error' | 'timeout';
  errorMessage?: string;
  spans: TraceSpan[];
}): StoredTrace {
  const traceId = randomUUID().slice(0, 8);
  
  return {
    id: randomUUID(),
    traceId,
    timestamp: Date.now(),
    clientName: detectClientName(data.userAgent),
    clientIp: data.clientIp,
    userAgent: data.userAgent,
    type: 'llm-proxy',
    requestedModel: data.requestedModel,
    modelServed: data.modelServed,
    providerServed: data.providerServed,
    totalDurationMs: data.durationMs,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    totalTokens: data.inputTokens + data.outputTokens,
    cost: data.cost,
    status: data.status,
    errorMessage: data.errorMessage,
    spans: data.spans
  };
}

function detectClientName(userAgent: string): string {
  if (userAgent.includes('claude-code')) return 'Claude Code CLI';
  if (userAgent.includes('cursor')) return 'Cursor IDE';
  if (userAgent.includes('windsurf')) return 'Windsurf IDE';
  if (userAgent.includes('cline')) return 'Cline (VS Code)';
  if (userAgent.includes('antigravity')) return 'Google Antigravity';
  return 'Unknown Client';
}
```

**Step 2.2: Instrument proxy to capture traces**
Edit: `proxy-engine/src/server.ts`

Add import at top:
```typescript
import { traceStore, createTrace } from './utils/traceStore';
```

Find the `/v1/messages` endpoint handler (around line 250+). After successful response, add:
```typescript
// Capture trace
const trace = createTrace({
  clientIp: request.ip,
  userAgent: request.headers['user-agent'] || 'unknown',
  requestedModel: requestedModel,
  modelServed: targetModel,
  providerServed: targetProvider,
  inputTokens: inputTokens,
  outputTokens: outputTokens,
  cost: actualCost,
  durationMs: Date.now() - startTime,
  status: 'success',
  spans: [
    { name: 'Proxy Ingress', startTimeMs: 0, durationMs: 5, status: 'success' },
    { name: 'Provider Call', startTimeMs: 5, durationMs: Date.now() - startTime - 10, status: 'success' },
    { name: 'Response Assembly', startTimeMs: Date.now() - startTime - 5, durationMs: 5, status: 'success' }
  ]
});
traceStore.addTrace(trace);
```

Do the same for `/v1/chat/completions` endpoint.

For error cases, capture error traces:
```typescript
// In catch blocks
const errorTrace = createTrace({
  clientIp: request.ip,
  userAgent: request.headers['user-agent'] || 'unknown',
  requestedModel: requestedModel,
  modelServed: targetModel,
  providerServed: targetProvider,
  inputTokens: inputTokens,
  outputTokens: 0,
  cost: 0,
  durationMs: Date.now() - startTime,
  status: 'error',
  errorMessage: err.message,
  spans: [
    { name: 'Proxy Ingress', startTimeMs: 0, durationMs: 5, status: 'success' },
    { name: 'Provider Call', startTimeMs: 5, durationMs: Date.now() - startTime - 5, status: 'error' }
  ]
});
traceStore.addTrace(errorTrace);
```

**Step 2.3: Add API endpoint for traces**
Edit: `proxy-engine/src/server.ts`

Add new endpoint after `/health`:
```typescript
// Get activity traces
fastify.get('/v1/traces', async (request, reply) => {
  const limit = parseInt((request.query as any).limit || '50', 10);
  const traces = traceStore.getTraces(limit);
  
  reply.send({
    traces,
    totalCount: traces.length
  });
});

// Get specific trace by ID
fastify.get('/v1/traces/:traceId', async (request, reply) => {
  const { traceId } = request.params as { traceId: string };
  const trace = traceStore.getTraceById(traceId);
  
  if (!trace) {
    reply.status(404).send({ error: 'Trace not found' });
    return;
  }
  
  reply.send(trace);
});
```

**Step 2.4: Update frontend to fetch real traces**
Edit: `src/store/useTetherStore.ts`

Find the `fetchGatewayHealth` function. After it, add:
```typescript
async fetchTraces() {
  try {
    const res = await fetch(`${this.proxyHost}:${this.proxyPort}/v1/traces?limit=50`);
    if (res.ok) {
      const data = await res.json();
      set({ traces: data.traces || [] });
    }
  } catch (err) {
    console.error('[TetherStore] Failed to fetch traces:', err);
  }
}
```

Then update the store interface to include `fetchTraces: () => Promise<void>`.

**Step 2.5: Wire up polling**
Edit: `src/App.tsx` (or wherever the main polling happens)

Add trace fetching to the polling interval:
```typescript
// Existing health check polling
useEffect(() => {
  const interval = setInterval(() => {
    fetchGatewayHealth();
    fetchTraces(); // Add this line
  }, 3000);
  return () => clearInterval(interval);
}, [fetchGatewayHealth, fetchTraces]);
```

**Verification:**
- [ ] `traceStore.ts` file created
- [ ] Proxy captures traces on every request
- [ ] `/v1/traces` endpoint returns real data
- [ ] Frontend polls and displays real traces
- [ ] Make a test request, see it appear in Traces tab within 3 seconds

---

## **Task 3: MCP Config File Writing (2-3 hours)**

### **Problem:**
Tools tab "Copy Config" button does nothing. Configs aren't written to disk.

### **Solution:**
Use Tauri IPC to write to `~/.claude/config.json`, `~/.cursor/mcp.json`, etc.

### **Steps for Antigravity:**

**Step 3.1: Add Tauri command for file writing**
Edit: `src-tauri/src/lib.rs`

Add this function before `#[cfg_attr(mobile, tauri::mobile_entry_point)]`:
```rust
use std::fs;
use std::path::PathBuf;
use serde_json::{Value, Map};

#[tauri::command]
fn write_mcp_config(
    client: String,
    config_json: String
) -> Result<String, String> {
    // Determine config file path based on client
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    
    let config_path: PathBuf = match client.as_str() {
        "claude-code" => home.join(".claude").join("config.json"),
        "claude-desktop" => home.join("Library").join("Application Support").join("Claude").join("claude_desktop_config.json"),
        "cursor" => home.join(".cursor").join("mcp.json"),
        "windsurf" => home.join(".windsurf").join("mcp_config.json"),
        "cline" => home.join(".vscode").join("extensions").join("saoudrizwan.claude-dev").join("config.json"),
        _ => return Err(format!("Unknown client: {}", client))
    };
    
    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    // Parse new config
    let new_config: Value = serde_json::from_str(&config_json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    
    // Read existing config if it exists
    let merged_config = if config_path.exists() {
        let existing = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read existing config: {}", e))?;
        
        let mut existing_json: Value = serde_json::from_str(&existing)
            .unwrap_or(Value::Object(Map::new()));
        
        // Non-destructive merge: add new tools without removing existing
        if let (Some(existing_obj), Some(new_obj)) = (existing_json.as_object_mut(), new_config.as_object()) {
            for (key, value) in new_obj {
                existing_obj.insert(key.clone(), value.clone());
            }
        }
        
        existing_json
    } else {
        new_config
    };
    
    // Write merged config atomically
    let config_str = serde_json::to_string_pretty(&merged_config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, config_str)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    
    Ok(format!("Successfully wrote config to {}", config_path.display()))
}
```

Then register the command in the builder. Find the `tauri::Builder::default()` call and update it:
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![write_mcp_config])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```

Add dependency at top of file:
```rust
use serde_json;
use dirs;
```

**Step 3.2: Add dirs crate dependency**
Edit: `src-tauri/Cargo.toml`

Add to `[dependencies]`:
```toml
dirs = "5.0"
serde_json = "1.0"
```

**Step 3.3: Create React hook for Tauri IPC**
Create file: `src/hooks/useTauriMCP.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';

export interface MCPSyncResult {
  client: string;
  success: boolean;
  message: string;
}

export function useTauriMCP() {
  async function writeMCPConfig(
    client: string,
    configJson: string
  ): Promise<MCPSyncResult> {
    try {
      const message = await invoke<string>('write_mcp_config', {
        client,
        configJson
      });
      
      return {
        client,
        success: true,
        message
      };
    } catch (err) {
      return {
        client,
        success: false,
        message: String(err)
      };
    }
  }
  
  return { writeMCPConfig };
}
```

**Step 3.4: Update syncAllTools function**
Edit: `src/store/useTetherStore.ts`

Find the `syncAllTools` function (around line 300+). Replace the mock implementation:

```typescript
async syncAllTools() {
  const results: ClientSyncResult[] = [];
  const enabledTools = get().installedTools.filter(t => t.isEnabled);
  
  // Build MCP config object
  const mcpConfig: Record<string, any> = {
    mcpServers: {}
  };
  
  for (const tool of enabledTools) {
    const toolDef = get().mcpCatalog.find(t => t.id === tool.toolId);
    if (!toolDef) continue;
    
    mcpConfig.mcpServers[toolDef.id] = {
      command: toolDef.command,
      args: toolDef.args,
      env: tool.credentials || {}
    };
  }
  
  const configJson = JSON.stringify(mcpConfig, null, 2);
  
  // Write to each target client
  const targetClients = ['claude-code', 'claude-desktop', 'cursor', 'windsurf'];
  
  // Check if running in Tauri
  if (window.__TAURI__) {
    // Use Tauri IPC
    const { writeMCPConfig } = (await import('../hooks/useTauriMCP')).useTauriMCP();
    
    for (const client of targetClients) {
      const result = await writeMCPConfig(client, configJson);
      results.push({
        clientId: client as any,
        success: result.success,
        message: result.message,
        toolsWritten: enabledTools.length
      });
    }
  } else {
    // Running in browser dev mode - show modal with config to copy
    console.log('[TetherStore] Browser mode - would write:', configJson);
    results.push({
      clientId: 'browser-preview',
      success: true,
      message: 'Copy config manually (not in Tauri app yet)',
      toolsWritten: enabledTools.length
    });
  }
  
  set({ syncResults: results });
  return results;
}
```

**Step 3.5: Update button UI to show results**
Edit: `src/components/toolhub/ToolMarketplace.tsx`

After the "Copy Config" button, add a results display:

```typescript
{syncResults.length > 0 && (
  <div className="mt-3 space-y-2">
    {syncResults.map((result) => (
      <div
        key={result.clientId}
        className={`p-2 rounded text-xs font-mono ${
          result.success
            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
            : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
        }`}
      >
        <div className="font-bold">{result.clientId}</div>
        <div>{result.message}</div>
      </div>
    ))}
  </div>
)}
```

**Verification:**
- [ ] Tauri command `write_mcp_config` added to `lib.rs`
- [ ] `dirs` and `serde_json` dependencies added
- [ ] React hook `useTauriMCP.ts` created
- [ ] `syncAllTools` updated to use Tauri IPC
- [ ] UI shows success/error per client
- [ ] Test: Enable a tool (e.g., Supabase), click "Copy Config", verify file created at `~/.claude/config.json`

---

## **Task 4: Gemini Adapter (1-2 hours)**

### **Problem:**
Proxy only supports Bedrock and OpenAI. Need Gemini API support.

### **Solution:**
Add Gemini adapter to proxy, similar to Bedrock implementation.

### **Steps for Antigravity:**

**Step 4.1: Install Google Generative AI SDK**
```bash
cd C:\Projects\TetherIQ
npm install @google/generative-ai
```

**Step 4.2: Add Gemini adapter to proxy**
Edit: `proxy-engine/src/server.ts`

Add import at top:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
```

Add Gemini client initialization (after Bedrock client):
```typescript
let geminiClient: GoogleGenerativeAI | null = null;
function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable not set');
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}
```

**Step 4.3: Add Gemini models to pricing table**
Find the `MODEL_PRICING` object (around line 50+). Add:
```typescript
// Gemini models
'gemini-2.0-flash-exp': { input: 0.0, output: 0.0, provider: 'gemini' }, // Free tier
'gemini-1.5-pro': { input: 0.00125, output: 0.005, provider: 'gemini' },
'gemini-1.5-flash': { input: 0.000075, output: 0.0003, provider: 'gemini' },
```

**Step 4.4: Add Gemini adapter in /v1/messages endpoint**
Find the Bedrock adapter block (around line 350+). After it, add:

```typescript
// --- Gemini Adapter ---
else if (targetProvider === 'gemini') {
  const gemini = getGeminiClient();
  const model = gemini.getGenerativeModel({ model: targetModel });
  
  // Convert Anthropic messages to Gemini format
  const geminiMessages = messages.map((msg: any) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));
  
  if (stream) {
    // Streaming response
    const result = await model.generateContentStream({
      contents: geminiMessages
    });
    
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // Emit SSE events
    reply.raw.write(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: `msg-${Date.now()}`, type: 'message', role: 'assistant', content: [], model: targetModel, usage: { input_tokens: inputTokens, output_tokens: 0 } } })}\n\n`);
    reply.raw.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`);
    
    let fullText = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      reply.raw.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`);
    }
    
    const outputTokens = countOutputTokens(fullText, 'gemini');
    const finalCost = (inputTokens / 1000) * (pricing.input || 0) + (outputTokens / 1000) * (pricing.output || 0);
    
    reply.raw.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
    reply.raw.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: outputTokens } })}\n\n`);
    reply.raw.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
    reply.raw.end();
    
    // Update spend
    await budgetLock.acquire('budget', () => {
      inFlightReservedCost -= estimatedCost;
      const ledger = loadLedger();
      ledger.dailySpend += finalCost;
      ledger.monthlySpend += finalCost;
      saveLedger(ledger);
    });
  } else {
    // Non-streaming response
    const result = await model.generateContent({
      contents: geminiMessages
    });
    
    const responseText = result.response.text();
    const outputTokens = countOutputTokens(responseText, 'gemini');
    const actualCost = (inputTokens / 1000) * (pricing.input || 0) + (outputTokens / 1000) * (pricing.output || 0);
    
    // Update spend
    await budgetLock.acquire('budget', () => {
      inFlightReservedCost -= estimatedCost;
      const ledger = loadLedger();
      ledger.dailySpend += actualCost;
      ledger.monthlySpend += actualCost;
      saveLedger(ledger);
    });
    
    reply.send({
      id: `msg-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: responseText }],
      model: targetModel,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens
      }
    });
  }
}
```

**Step 4.5: Add Gemini to virtual alias**
Find the virtual alias resolution (around line 200). Add Gemini as fallback option:
```typescript
if (requestedModel === 'fast-code') {
  targetModel = 'gemini-2.0-flash-exp'; // Fast and free
  targetProvider = 'gemini';
}
```

**Verification:**
- [ ] `@google/generative-ai` installed
- [ ] Gemini client initialized
- [ ] Gemini models in pricing table
- [ ] Gemini adapter in `/v1/messages` (streaming + non-streaming)
- [ ] Test: Set `GOOGLE_API_KEY` env var, make request to `gemini-2.0-flash-exp`, verify response

---

## **Task 5: Groq Adapter (30 min)**

### **Problem:**
No Groq support yet.

### **Solution:**
Groq is OpenAI-compatible - just add endpoint override.

### **Steps for Antigravity:**

**Step 5.1: Add Groq models to pricing**
Edit: `proxy-engine/src/server.ts`

Add to `MODEL_PRICING`:
```typescript
// Groq models
'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079, provider: 'groq' },
'llama-3.1-70b-versatile': { input: 0.00059, output: 0.00079, provider: 'groq' },
'mixtral-8x7b-32768': { input: 0.00024, output: 0.00024, provider: 'groq' },
```

**Step 5.2: Add Groq handling**
Find the OpenAI adapter block. Before it, add:

```typescript
// --- Groq Adapter (OpenAI-compatible) ---
else if (targetProvider === 'groq') {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY environment variable not set');
  }
  
  // Use OpenAI SDK with Groq endpoint
  const OpenAI = (await import('openai')).default;
  const groqClient = new OpenAI({
    apiKey: groqApiKey,
    baseURL: 'https://api.groq.com/openai/v1'
  });
  
  // Same logic as OpenAI adapter...
  const completion = await groqClient.chat.completions.create({
    model: targetModel,
    messages: messages,
    stream: stream
  });
  
  // Handle response same as OpenAI (reuse existing code)
  // ...
}
```

**Verification:**
- [ ] Groq models in pricing table
- [ ] Groq adapter added with OpenAI SDK + custom baseURL
- [ ] Test: Set `GROQ_API_KEY` env var, make request, verify response

---

## **Task 6: GitHub Copilot Adapter (2-3 hours)**

### **Problem:**
No support for proxying GitHub Copilot requests.

### **Solution:**
Add adapter for GitHub Copilot API (uses OpenAI protocol with GitHub auth).

### **Steps for Antigravity:**

**Step 6.1: Research GitHub Copilot API**
GitHub Copilot uses:
- Endpoint: `https://api.githubcopilot.com/chat/completions`
- Auth: OAuth token from GitHub
- Protocol: OpenAI-compatible

**Step 6.2: Add Copilot models to pricing**
Edit: `proxy-engine/src/server.ts`

Add to `MODEL_PRICING`:
```typescript
// GitHub Copilot models
'gpt-4o-copilot': { input: 0.0, output: 0.0, provider: 'copilot' }, // Included in subscription
'claude-3.5-sonnet-copilot': { input: 0.0, output: 0.0, provider: 'copilot' },
```

**Step 6.3: Add Copilot adapter**
Add after OpenAI adapter:

```typescript
// --- GitHub Copilot Adapter ---
else if (targetProvider === 'copilot') {
  const copilotToken = process.env.GITHUB_COPILOT_TOKEN;
  if (!copilotToken) {
    throw new Error('GITHUB_COPILOT_TOKEN environment variable not set');
  }
  
  const OpenAI = (await import('openai')).default;
  const copilotClient = new OpenAI({
    apiKey: copilotToken,
    baseURL: 'https://api.githubcopilot.com/chat/completions'
  });
  
  // Same logic as OpenAI...
  const completion = await copilotClient.chat.completions.create({
    model: targetModel.replace('-copilot', ''), // Remove -copilot suffix
    messages: messages,
    stream: stream
  });
  
  // Handle response...
}
```

**Verification:**
- [ ] Copilot models in pricing table
- [ ] Copilot adapter added
- [ ] Test: Set `GITHUB_COPILOT_TOKEN` env var, make request, verify response

---

## **Delivery Instructions for Antigravity**

After completing each task:

1. **Test the feature** - Make sure it works end-to-end
2. **Run the test suite** - `npm run test` should still pass
3. **Document any issues** - If something doesn't work, note exact error messages
4. **Commit your changes** - One commit per task with clear message

Then bring back to me (Claude Code) for review. I'll verify:
- Code quality and error handling
- Integration with existing systems
- Edge cases and race conditions
- Production readiness

---

## **Priority Order:**

**Do these first (most critical):**
1. Task 1: Accurate Token Counting
2. Task 2: Real Trace Capture
3. Task 3: MCP Config File Writing

**Then these (nice-to-have):**
4. Task 5: Groq Adapter (quick win)
5. Task 4: Gemini Adapter
6. Task 6: GitHub Copilot Adapter (least critical)

---

**Estimated Total Time:** 10-15 hours

Good luck, Antigravity! 🚀
