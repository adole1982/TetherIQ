import { create } from 'zustand';
import { TelemetryPoint, SpendBudget, ConnectedAgent } from '../types/telemetry';
import { ProviderConfig, FallbackChain, VirtualModelAlias, LocalMeshStatus } from '../types/routing';
import { McpToolDefinition, InstalledToolState, TargetClientId } from '../types/tools';
import { ActivityTrace } from '../types/traces';
import { AppSettings, ClientSyncResult } from '../types/config';
import { MCP_CATALOG } from '../data/mcpCatalogData';
import { ConfigSyncService } from '../services/configSyncService';
import { generateLiteLLMConfig } from '../services/litellmConfigService';
import {
  loadPersistedBudget,
  savePersistedBudget,
  fetchLiteLLMSpend,
  persistedToStoreBudget,
  storeBudgetToPersisted,
  parseDecimalToMicroUsd,
} from '../services/budgetPersistence';
import {
  listCredentialSummaries,
  loadRoutingMetadata,
  saveRoutingMetadata,
  purgeLegacyWebStorage,
  purgeLegacyLocalStorageSecrets,
  mutateToolCredentials,
  listToolCredentialSummaries,
  revokeTool,
  loadNativeToolAssignments,
  saveNativeToolAssignments,
} from '../services/vaultPersistence';

export type NavTab = 'hud' | 'matrix' | 'tools' | 'traces' | 'agents' | 'quickstart' | 'settings';

interface TetherState {
  // Navigation & Modals
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  isQuickstartOpen: boolean;
  setQuickstartOpen: (open: boolean) => void;
  isTerminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  isDiagnosticModalOpen: boolean;
  setDiagnosticModalOpen: (open: boolean) => void;
  isKeyManagerOpen: boolean;
  setKeyManagerOpen: (open: boolean) => void;

  // Proxy Gateway Status
  isProxyRunning: boolean;
  toggleProxy: () => void;
  proxyPort: number;
  proxyHost: string;
  gatewayToken: string | null;
  appVersion: string;
  fetchGatewayHealth: () => Promise<void>;

  // Telemetry & Spend
  telemetryHistory: TelemetryPoint[];
  currentTokensPerSec: number;
  currentLatencyMs: number;
  currentBurnRatePerHour: number;
  budget: SpendBudget;
  updateBudgetLimits: (daily: number | string | null, monthly: number | string | null) => Promise<void>;
  resetCircuitBreaker: () => Promise<void>;
  triggerSpend: (amount: number, tokens: number) => void;

  // Providers & Routing Matrix
  providers: ProviderConfig[];
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void;
  fallbackChains: FallbackChain[];
  updateFallbackChain: (chainId: string, nodes: any[]) => void;
  virtualAliases: VirtualModelAlias[];
  updateVirtualAlias: (alias: string, targetChainId: string) => void;
  isAirGappedMode: boolean;
  toggleAirGappedMode: () => Promise<void>;
  localMeshStatus: LocalMeshStatus | null;
  scanLocalMesh: () => Promise<void>;

  // MCP Tools & Marketplace
  mcpCatalog: McpToolDefinition[];
  installedTools: InstalledToolState[];
  selectedToolForDrawer: McpToolDefinition | null;
  setSelectedToolForDrawer: (tool: McpToolDefinition | null) => void;
  saveToolConfig: (toolId: string, credentials: Record<string, string>, targetClients: TargetClientId[], isEnabled: boolean) => Promise<void>;
  revokeToolConfig: (toolId: string) => Promise<void>;
  toggleToolEnabled: (toolId: string) => void;
  syncAllTools: () => Promise<ClientSyncResult[]>;
  syncResults: ClientSyncResult[];

  // Connected Agents
  connectedAgents: ConnectedAgent[];
  addOrUpdateAgent: (agent: ConnectedAgent) => void;

  // Traces & Observability
  traces: ActivityTrace[];
  selectedTrace: ActivityTrace | null;
  setSelectedTrace: (trace: ActivityTrace | null) => void;
  addTrace: (trace: ActivityTrace) => void;

  // Terminal & PTY
  terminalLogs: string[];
  appendTerminalLog: (text: string) => void;
  clearTerminal: () => void;

  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
}

const INITIAL_PROVIDERS: ProviderConfig[] = [
  { id: 'anthropic', name: 'Anthropic Direct', isEnabled: true, billingMode: 'pay-per-token', isHealthy: true, lastPingMs: 42 },
  { id: 'openai', name: 'OpenAI Direct', isEnabled: true, billingMode: 'pay-per-token', isHealthy: true, lastPingMs: 65 },
  { id: 'openrouter', name: 'OpenRouter Unified', isEnabled: true, billingMode: 'pay-per-token', isHealthy: false, lastPingMs: 0 },
  { id: 'deepseek', name: 'DeepSeek Direct', isEnabled: true, billingMode: 'pay-per-token', isHealthy: false, lastPingMs: 0 },
  { id: 'bedrock', name: 'AWS Bedrock', isEnabled: true, billingMode: 'pay-per-token', awsRegion: 'us-east-1', isHealthy: true, lastPingMs: 78 },
  { id: 'vertex', name: 'Google Vertex AI', isEnabled: true, billingMode: 'subscription-unlimited', vertexProjectId: 'gcp-prod-analytics', vertexLocation: 'us-central1', isHealthy: true, lastPingMs: 55 },
  { id: 'groq', name: 'Groq Cloud', isEnabled: true, billingMode: 'pay-per-token', isHealthy: true, lastPingMs: 18 },
  { id: 'ollama', name: 'Local Ollama (11434)', isEnabled: true, billingMode: 'subscription-unlimited', baseUrl: 'http://localhost:11434', isHealthy: true, lastPingMs: 4 }
];

const INITIAL_FALLBACK_CHAINS: FallbackChain[] = [
  {
    id: 'chain-heavy-reasoning',
    name: 'Heavy Reasoning Chain',
    description: 'High-intelligence coding fallback (Claude 3.7 Sonnet -> Bedrock Claude -> OpenAI o3-mini)',
    nodes: [
      { id: 'n1', provider: 'anthropic', modelIdentifier: 'claude-3-7-sonnet-20250219', displayName: 'Claude 3.7 Sonnet (Direct)', priority: 1, timeoutMs: 30000, costPer1kInput: 0.003, costPer1kOutput: 0.015, maxContextTokens: 200000 },
      { id: 'n2', provider: 'bedrock', modelIdentifier: 'anthropic.claude-3-5-sonnet-20241022-v2:0', displayName: 'AWS Bedrock Claude 3.5 Sonnet', priority: 2, timeoutMs: 25000, costPer1kInput: 0.003, costPer1kOutput: 0.015, maxContextTokens: 200000 },
      { id: 'n3', provider: 'openai', modelIdentifier: 'o3-mini', displayName: 'OpenAI o3-mini', priority: 3, timeoutMs: 25000, costPer1kInput: 0.0011, costPer1kOutput: 0.0044, maxContextTokens: 128000 }
    ]
  },
  {
    id: 'chain-fast-code',
    name: 'Fast Code & Autocomplete Chain',
    description: 'Ultra-low latency code generation (Groq Llama 3.3 70B -> Claude 3.5 Haiku -> Local Ollama)',
    nodes: [
      { id: 'n4', provider: 'groq', modelIdentifier: 'llama-3.3-70b-versatile', displayName: 'Groq Llama 3.3 70B', priority: 1, timeoutMs: 8000, costPer1kInput: 0.00059, costPer1kOutput: 0.00079, maxContextTokens: 128000 },
      { id: 'n5', provider: 'anthropic', modelIdentifier: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', priority: 2, timeoutMs: 10000, costPer1kInput: 0.0008, costPer1kOutput: 0.004, maxContextTokens: 200000 },
      { id: 'n6', provider: 'ollama', modelIdentifier: 'qwen2.5-coder:14b', displayName: 'Local Ollama Qwen 2.5 Coder', priority: 3, timeoutMs: 15000, costPer1kInput: 0.0, costPer1kOutput: 0.0, maxContextTokens: 32000 }
    ]
  }
];

const INITIAL_VIRTUAL_ALIASES: VirtualModelAlias[] = [
  { alias: 'heavy-reasoning', targetChainId: 'chain-heavy-reasoning', description: 'Deep architectural coding, complex refactoring, and multi-file debugging' },
  { alias: 'fast-code', targetChainId: 'chain-fast-code', description: 'Sub-500ms auto-completions, docstrings, unit tests, and terminal explanations' }
];

const INITIAL_INSTALLED_TOOLS: InstalledToolState[] = [
  {
    toolId: 'github',
    isEnabled: true,
    isConfigured: false,
    configuredFields: [],
    fieldHints: {},
    targetClients: ['cursor', 'claude-code', 'windsurf', 'antigravity'],
    syncStatus: 'synced',
    lastSyncedAt: Date.now() - 3600000
  },
  {
    toolId: 'postgres',
    isEnabled: true,
    isConfigured: false,
    configuredFields: [],
    fieldHints: {},
    targetClients: ['cursor', 'claude-code', 'devin'],
    syncStatus: 'synced',
    lastSyncedAt: Date.now() - 3600000
  },
  {
    toolId: 'databricks',
    isEnabled: true,
    isConfigured: false,
    configuredFields: [],
    fieldHints: {},
    targetClients: ['claude-code', 'windsurf', 'antigravity'],
    syncStatus: 'synced',
    lastSyncedAt: Date.now() - 1800000
  },
  {
    toolId: 'brave-search',
    isEnabled: true,
    isConfigured: false,
    configuredFields: [],
    fieldHints: {},
    targetClients: ['cursor', 'claude-code', 'devin', 'windsurf'],
    syncStatus: 'synced',
    lastSyncedAt: Date.now() - 7200000
  }
];

const INITIAL_TRACES: ActivityTrace[] = [
  {
    id: 'tr-001',
    traceId: 'trace-88912-ab',
    timestamp: Date.now() - 120000,
    type: 'llm-proxy',
    clientName: 'Claude Code CLI',
    modelRequested: 'heavy-reasoning',
    modelServed: 'claude-3-7-sonnet-20250219',
    providerServed: 'Anthropic Direct',
    status: 'success',
    statusCode: 200,
    totalDurationMs: 1420,
    promptTokens: 4120,
    completionTokens: 640,
    totalTokens: 4760,
    cost: 0.02196,
    fallbacksTriggered: [],
    spans: [
      { id: 'sp-1', name: 'Proxy Loopback Ingest', startTime: 0, endTime: 4, durationMs: 4, status: 'ok', attributes: { port: 4000, endpoint: '/v1/messages' } },
      { id: 'sp-2', name: 'Virtual Alias Resolution [heavy-reasoning]', startTime: 4, endTime: 6, durationMs: 2, status: 'ok', attributes: { chain: 'Heavy Reasoning Chain' } },
      { id: 'sp-3', name: 'Upstream Inference [Claude 3.7 Sonnet]', startTime: 6, endTime: 1416, durationMs: 1410, status: 'ok', attributes: { provider: 'Anthropic', tokensSec: 45.3 } },
      { id: 'sp-4', name: 'Telemetry & Spend Ledger Ingest', startTime: 1416, endTime: 1420, durationMs: 4, status: 'ok', attributes: { cost: '$0.02196' } }
    ],
    requestPayloadSummary: {
      messagesCount: 4,
      stream: true,
      samplePrompt: "Refactor the authentication middleware to use JWT verification with public key rotating keys."
    },
    responsePayloadSummary: {
      finishReason: 'stop',
      sampleResponse: "Here is the updated JWT verification middleware with RSA key rotation caching..."
    }
  },
  {
    id: 'tr-002',
    traceId: 'trace-88913-cd',
    timestamp: Date.now() - 95000,
    type: 'mcp-tool',
    clientName: 'Cursor IDE',
    modelRequested: 'fast-code',
    modelServed: 'mcp::github::get_pull_request',
    providerServed: 'GitHub MCP Server',
    status: 'success',
    statusCode: 200,
    totalDurationMs: 380,
    promptTokens: 120,
    completionTokens: 840,
    totalTokens: 960,
    cost: 0.0008,
    fallbacksTriggered: [],
    spans: [
      { id: 'sp-5', name: 'MCP Dispatch [github::get_pull_request]', startTime: 0, endTime: 15, durationMs: 15, status: 'ok', attributes: { tool: 'github' } },
      { id: 'sp-6', name: 'GitHub API REST Call', startTime: 15, endTime: 365, durationMs: 350, status: 'ok', attributes: { repo: 'tethermesh/core', pr: 42 } },
      { id: 'sp-7', name: 'Stdio Serialization to Cursor', startTime: 365, endTime: 380, durationMs: 15, status: 'ok', attributes: { bytes: 4200 } }
    ],
    requestPayloadSummary: {
      messagesCount: 1,
      toolsCount: 1,
      stream: false,
      samplePrompt: "Call github::get_pull_request(owner='tethermesh', repo='core', pull_number=42)"
    },
    responsePayloadSummary: {
      toolCallsMade: ['github::get_pull_request'],
      sampleResponse: '{"id": 42, "title": "feat: add multi-client MCP sync engine", "state": "open"}'
    }
  },
  {
    id: 'tr-003',
    traceId: 'trace-88914-ef',
    timestamp: Date.now() - 45000,
    type: 'fallback-event',
    clientName: 'Windsurf IDE',
    modelRequested: 'claude-3-7-sonnet',
    modelServed: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    providerServed: 'AWS Bedrock',
    status: 'fallback-rerouted',
    statusCode: 200,
    totalDurationMs: 1850,
    promptTokens: 5200,
    completionTokens: 920,
    totalTokens: 6120,
    cost: 0.0294,
    fallbacksTriggered: [
      { fromModel: 'claude-3-7-sonnet (Anthropic)', toModel: 'anthropic.claude-3-5-sonnet (AWS Bedrock)', reason: 'HTTP 429 Too Many Requests: Rate limit exceeded on direct tier', durationMs: 140 }
    ],
    spans: [
      { id: 'sp-8', name: 'Attempt Priority 1 [Anthropic Direct]', startTime: 0, endTime: 140, durationMs: 140, status: 'error', attributes: { error: '429 RateLimit' } },
      { id: 'sp-9', name: 'Silent Fallback Evaluation', startTime: 140, endTime: 145, durationMs: 5, status: 'ok', attributes: { target: 'AWS Bedrock' } },
      { id: 'sp-10', name: 'Priority 2 Execution [AWS Bedrock]', startTime: 145, endTime: 1845, durationMs: 1700, status: 'ok', attributes: { region: 'us-east-1' } }
    ],
    requestPayloadSummary: {
      messagesCount: 6,
      stream: true,
      samplePrompt: "Implement a zero-copy circular buffer in Rust with memory safety guarantees."
    }
  }
];

const INITIAL_AGENTS: ConnectedAgent[] = [
  {
    id: 'ag-01',
    clientName: 'Claude Code CLI',
    agentIcon: 'Terminal',
    ip: '127.0.0.1:54231',
    connectedAt: Date.now() - 7200000,
    lastActiveAt: Date.now() - 15000,
    totalTokens: 142800,
    totalCost: 0.64,
    activeModel: 'heavy-reasoning (Claude 3.7 Sonnet)',
    status: 'active'
  },
  {
    id: 'ag-02',
    clientName: 'Cursor IDE (Composer)',
    agentIcon: 'Code2',
    ip: '127.0.0.1:54232',
    connectedAt: Date.now() - 14400000,
    lastActiveAt: Date.now() - 45000,
    totalTokens: 89400,
    totalCost: 0.38,
    activeModel: 'fast-code (Groq Llama 3.3)',
    status: 'active'
  },
  {
    id: 'ag-03',
    clientName: 'Windsurf IDE (Cascade)',
    agentIcon: 'Compass',
    ip: '127.0.0.1:54233',
    connectedAt: Date.now() - 3600000,
    lastActiveAt: Date.now() - 90000,
    totalTokens: 48200,
    totalCost: 0.22,
    activeModel: 'AWS Bedrock Claude 3.5',
    status: 'idle'
  },
  {
    id: 'ag-04',
    clientName: 'Devin',
    agentIcon: 'Bot',
    ip: '127.0.0.1:54234',
    connectedAt: Date.now() - 1800000,
    lastActiveAt: Date.now() - 30000,
    totalTokens: 31000,
    totalCost: 0.14,
    activeModel: 'heavy-reasoning (o3-mini)',
    status: 'active'
  }
];

import { telemetryStreamService } from '../services/telemetryStreamService';

let isTelemetryInitialized = false;

export const useTetherStore = create<TetherState>((set, get) => ({
  // Navigation & Modals
  activeTab: 'hud',
  setActiveTab: (tab) => set({ activeTab: tab }),
  isQuickstartOpen: false,
  setQuickstartOpen: (open) => set({ isQuickstartOpen: open }),
  isTerminalOpen: false,
  setTerminalOpen: (open) => set({ isTerminalOpen: open }),
  isDiagnosticModalOpen: false,
  setDiagnosticModalOpen: (open) => set({ isDiagnosticModalOpen: open }),
  isKeyManagerOpen: false,
  setKeyManagerOpen: (open) => set({ isKeyManagerOpen: open }),

  // Proxy Gateway
  isProxyRunning: true,
  toggleProxy: () => set((state) => ({ isProxyRunning: !state.isProxyRunning })),
  proxyPort: 4000,
  proxyHost: '127.0.0.1',
  gatewayToken: null,
  appVersion: 'v1.0.0',

  fetchGatewayHealth: async () => {
    // 0. Ensure gateway token and authoritative native MCP catalog are populated from Tauri backend
    let currentGatewayToken = get().gatewayToken;

    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        if (!currentGatewayToken) {
          const diag = await invoke<any>('get_gateway_diagnostics');
          if (diag) {
            currentGatewayToken = diag.gateway_token;
            set({ gatewayToken: diag.gateway_token });
          }
        }
        const nativeCatalog = await invoke<any[]>('get_mcp_catalog');
        if (nativeCatalog && nativeCatalog.length > 0) {
          set({ mcpCatalog: nativeCatalog });
        }
      } catch {}
    }

    // Start real-time telemetry stream on first health check
    if (!isTelemetryInitialized) {
      isTelemetryInitialized = true;
      telemetryStreamService.subscribe((update) => {
        set((state) => {
          let nextTraces = state.traces;
          if (update.traces) {
            nextTraces = update.traces;
          } else if (update.newTrace) {
            nextTraces = [update.newTrace, ...state.traces.filter((t) => t.id !== update.newTrace!.id)].slice(0, 100);
          }

          let nextAgents = state.connectedAgents;
          if (update.agents) {
            nextAgents = update.agents;
          } else if (update.updatedAgent) {
            const idx = state.connectedAgents.findIndex((a) => a.id === update.updatedAgent!.id);
            if (idx >= 0) {
              nextAgents = [...state.connectedAgents];
              nextAgents[idx] = update.updatedAgent;
            } else {
              nextAgents = [update.updatedAgent, ...state.connectedAgents];
            }
          }

          let nextHistory = state.telemetryHistory;
          if (update.history && update.history.length > 0) {
            nextHistory = update.history;
          } else if (update.point) {
            nextHistory = [...state.telemetryHistory, update.point].slice(-40);
          }

          const nextTokensPerSec = update.stats?.tokensPerSecond ?? (update.point ? update.point.tokensPerSecond : state.currentTokensPerSec);
          const nextLatency = update.stats?.currentLatencyMs ?? (update.point ? update.point.latencyMs : state.currentLatencyMs);
          const nextBurnRate = update.stats?.currentBurnRatePerHour ?? state.currentBurnRatePerHour;

          return {
            traces: nextTraces,
            connectedAgents: nextAgents,
            telemetryHistory: nextHistory,
            currentTokensPerSec: nextTokensPerSec,
            currentLatencyMs: nextLatency,
            currentBurnRatePerHour: nextBurnRate,
            isProxyRunning: true,
          };
        });
      });
    }

    try {
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__;
      let isRunning = true;
      let proxyPort = 4000;

      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const status = await invoke<{ is_running: boolean; port: number }>('get_proxy_status');
          isRunning = status.is_running;
          if (status.port) proxyPort = status.port;
        } catch {
          isRunning = false;
        }
      }

      if (!isRunning) {
        set({ isProxyRunning: false });
        return;
      }

      set({ isProxyRunning: true, proxyPort });

      // 2. Fetch spend data from LiteLLM database via native IPC
      const spendData = await fetchLiteLLMSpend();

      // 3. Update store with authoritative database values (including explicit null for unlimited)
      set((state) => ({
        budget: {
          ...state.budget,
          currentDailySpend: spendData.dailySpend,
          currentMonthlySpend: spendData.monthlySpend,
          dailyLimit: spendData.dailyLimit !== undefined ? spendData.dailyLimit : state.budget.dailyLimit,
          monthlyLimit: spendData.monthlyLimit !== undefined ? spendData.monthlyLimit : state.budget.monthlyLimit,
          isCircuitBreakerTripped: spendData.isCircuitBreakerTripped,
        }
      }));

      // 4. Update non-authoritative local cache
      try {
        const persisted = await loadPersistedBudget();
        await savePersistedBudget({
          ...persisted,
          dailySpend: spendData.dailySpend,
          monthlySpend: spendData.monthlySpend,
          isCircuitBreakerTripped: spendData.isCircuitBreakerTripped,
          totalTokensProcessed: persisted.totalTokensProcessed + spendData.totalTokens,
        });
      } catch {}

      // 7. Probe real provider health and latency
      try {
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          const { invoke } = await import('@tauri-apps/api/core');
          const provData = await invoke<any>('get_provider_health');
          if (provData && provData.providers) {
            set((state) => ({
              providers: state.providers.map((p) => {
                const live = provData.providers[p.id];
                if (live) {
                  return {
                    ...p,
                    isHealthy: live.isHealthy,
                    lastPingMs: live.latencyMs > 0 ? live.latencyMs : p.lastPingMs,
                  };
                }
                return p;
              })
            }));
          }
        }
      } catch {}

    } catch {
      // Gateway not responding — sidecar may still be starting up
    }
  },

  // Telemetry & Spend (Real dynamic rolling values)
  telemetryHistory: [],
  currentTokensPerSec: 0,
  currentLatencyMs: 0,
  currentBurnRatePerHour: 0,
  budget: {
    dailyLimit: 10.00,
    monthlyLimit: 150.00,
    currentDailySpend: 0.00,
    currentMonthlySpend: 0.00,
    isCircuitBreakerTripped: false,
    hardStopEnabled: true,
    lastResetDate: new Date().toISOString().split('T')[0]
  },
  updateBudgetLimits: async (daily, monthly) => {
    const dailyMicros = parseDecimalToMicroUsd(daily);
    const monthlyMicros = parseDecimalToMicroUsd(monthly);

    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { invoke } = await import('@tauri-apps/api/core');
      const response = await invoke<any>('update_budget_limits', {
        limits: {
          dailyLimitMicrousd: dailyMicros,
          monthlyLimitMicrousd: monthlyMicros,
        },
      });

      const fallbackDaily = dailyMicros !== null ? dailyMicros / 1_000_000 : null;
      const fallbackMonthly = monthlyMicros !== null ? monthlyMicros / 1_000_000 : null;

      const committedDaily: number | null = response.daily_limit_usd !== undefined && response.daily_limit_usd !== null
        ? Number(response.daily_limit_usd)
        : (response.dailyLimit !== undefined && response.dailyLimit !== null ? Number(response.dailyLimit) : fallbackDaily);
      const committedMonthly: number | null = response.monthly_limit_usd !== undefined && response.monthly_limit_usd !== null
        ? Number(response.monthly_limit_usd)
        : (response.monthlyLimit !== undefined && response.monthlyLimit !== null ? Number(response.monthlyLimit) : fallbackMonthly);
      const isTripped = Boolean(response.is_tripped ?? response.isTripped);

      // Only update local store state after authoritative database commit succeeds
      set((state) => ({
        budget: {
          ...state.budget,
          dailyLimit: committedDaily,
          monthlyLimit: committedMonthly,
          isCircuitBreakerTripped: isTripped,
        },
      }));

      // Post-success non-authoritative local cache
      try {
        const persisted = await loadPersistedBudget();
        await savePersistedBudget({
          ...persisted,
          dailyLimit: committedDaily,
          monthlyLimit: committedMonthly,
          isCircuitBreakerTripped: isTripped,
        });
      } catch {}
      console.log('[TetherStore] Authoritatively synchronized budget limits via native IPC');
    } else {
      // Non-Tauri browser development mode
      const fallbackDaily = dailyMicros !== null ? dailyMicros / 1_000_000 : null;
      const fallbackMonthly = monthlyMicros !== null ? monthlyMicros / 1_000_000 : null;
      set((state) => ({
        budget: { ...state.budget, dailyLimit: fallbackDaily, monthlyLimit: fallbackMonthly }
      }));
      try {
        const persisted = await loadPersistedBudget();
        await savePersistedBudget({
          ...persisted,
          dailyLimit: fallbackDaily,
          monthlyLimit: fallbackMonthly,
        });
      } catch {}
    }
  },
  resetCircuitBreaker: async () => {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const resp = await invoke<any>('reset_spend_data');
        if (resp) {
          const dailySpent = Number(resp.daily_spent_usd ?? resp.dailySpentUsd ?? 0);
          const monthlySpent = Number(resp.monthly_spent_usd ?? resp.monthlySpentUsd ?? 0);
          const isTripped = Boolean(resp.is_tripped ?? resp.isTripped ?? false);

          set((state) => ({
            budget: {
              ...state.budget,
              isCircuitBreakerTripped: isTripped,
              currentDailySpend: dailySpent,
              currentMonthlySpend: monthlySpent,
            }
          }));

          try {
            const persisted = await loadPersistedBudget();
            await savePersistedBudget({
              ...persisted,
              dailySpend: dailySpent,
              monthlySpend: monthlySpent,
              isCircuitBreakerTripped: isTripped,
            });
          } catch {}
          return;
        }
      } catch (err) {
        console.error('[TetherStore] Failed to reset spend data via native IPC:', err);
        return;
      }
    }

    // Web fallback
    set((state) => ({
      budget: { ...state.budget, isCircuitBreakerTripped: false, currentDailySpend: 0 }
    }));
    try {
      const persisted = await loadPersistedBudget();
      await savePersistedBudget({
        ...persisted,
        dailySpend: 0,
        isCircuitBreakerTripped: false,
      });
    } catch {}
  },
  triggerSpend: (amount, tokens) => set((state) => {
    const isAllSubscription = state.providers
      .filter((p) => p.isEnabled)
      .every((p) => p.billingMode === 'subscription-unlimited');

    const effectiveAmount = isAllSubscription ? 0 : amount;
    const newDaily = state.budget.currentDailySpend + effectiveAmount;
    const newMonthly = state.budget.currentMonthlySpend + effectiveAmount;
    const tripped = !isAllSubscription && state.budget.hardStopEnabled && state.budget.dailyLimit !== null && newDaily >= state.budget.dailyLimit;
    return {
      budget: {
        ...state.budget,
        currentDailySpend: newDaily,
        currentMonthlySpend: newMonthly,
        isCircuitBreakerTripped: tripped
      }
    };
  }),

  // Providers & Matrix
  providers: INITIAL_PROVIDERS,
  updateProvider: (id, updates) => {
    // Strip apiKey so plaintext credentials never persist in React memory
    const { apiKey, ...cleanUpdates } = updates;
    set((state) => ({
      providers: state.providers.map(p => p.id === id ? { ...p, ...cleanUpdates } : p)
    }));
  },
  fallbackChains: INITIAL_FALLBACK_CHAINS,
  updateFallbackChain: (chainId, nodes) => {
    set((state) => ({
      fallbackChains: state.fallbackChains.map(c => c.id === chainId ? { ...c, nodes } : c)
    }));
    const currentState = get();
    saveRoutingMetadata({
      fallbackChains: currentState.fallbackChains,
      virtualAliases: currentState.virtualAliases,
    });
  },
  virtualAliases: INITIAL_VIRTUAL_ALIASES,
  updateVirtualAlias: (alias, targetChainId) => {
    set((state) => ({
      virtualAliases: state.virtualAliases.map(a => a.alias === alias ? { ...a, targetChainId } : a)
    }));
    const currentState = get();
    saveRoutingMetadata({
      fallbackChains: currentState.fallbackChains,
      virtualAliases: currentState.virtualAliases,
    });
  },

  // Air-Gapped / Offline Local Mesh State
  isAirGappedMode: false,
  localMeshStatus: null,
  toggleAirGappedMode: async () => {
    const currentMode = get().isAirGappedMode;
    const nextMode = !currentMode;

    // In Air-Gapped mode, trigger a local mesh scan first
    if (nextMode) {
      await get().scanLocalMesh();
    }

    // Regenerate YAML configuration for target mode
    const state = get();
    const discoveredModels = state.localMeshStatus?.allModelIdentifiers || state.localMeshStatus?.discoveredModels?.map(m => m.name) || [];
    const configYaml = generateLiteLLMConfig({
      providers: state.providers,
      fallbackChains: state.fallbackChains,
      virtualAliases: state.virtualAliases,
      budget: state.budget,
      isAirGappedMode: nextMode,
      discoveredLocalModels: discoveredModels,
    });

    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('apply_air_gapped_mode', {
          enabled: nextMode,
          newYaml: configYaml,
          yamlContent: configYaml,
        });
        set({ isAirGappedMode: nextMode });
        console.log(`[TetherStore] Transactionally transitioned to ${nextMode ? 'Air-Gapped' : 'Hybrid'} mode with verified configuration`);
      } catch (e) {
        console.error('[TetherStore] Native air-gapped transition failed:', e);
      }
    } else {
      set({ isAirGappedMode: nextMode });
    }
  },
  scanLocalMesh: async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const data = await invoke<any>('get_local_mesh_status');
        if (data) {
          set({
            localMeshStatus: {
              isScanning: false,
              lastScannedAt: Date.now(),
              ollamaRunning: data.ollamaRunning,
              ollamaUrl: data.ollamaUrl,
              lmStudioRunning: data.lmStudioRunning,
              lmStudioUrl: data.lmStudioUrl,
              discoveredModels: data.discoveredModels || [],
              allModelIdentifiers: data.allModelIdentifiers || []
            }
          });
          return;
        }
      }
    } catch {
      // Fallback if proxy route isn't up yet
      set((state) => ({
        localMeshStatus: state.localMeshStatus || {
          isScanning: false,
          lastScannedAt: Date.now(),
          ollamaRunning: false,
          ollamaUrl: 'http://127.0.0.1:11434',
          lmStudioRunning: false,
          lmStudioUrl: 'http://127.0.0.1:1234',
          discoveredModels: [],
          allModelIdentifiers: []
        }
      }));
    }
  },

  // Tools & Marketplace
  mcpCatalog: MCP_CATALOG,
  installedTools: INITIAL_INSTALLED_TOOLS,
  selectedToolForDrawer: null,
  setSelectedToolForDrawer: (tool) => set({ selectedToolForDrawer: tool }),
  saveToolConfig: async (toolId, credentials, targetClients, isEnabled) => {
    // 1. Build typed mutations and write directly to OS Vault
    const mutations: import('../types/tools').CredentialFieldMutation[] = Object.entries(credentials).map(([k, v]) => ({
      field: k,
      operation: v && v.trim() ? 'set' : 'delete',
      value: v
    }));

    const summary = await mutateToolCredentials(toolId, mutations);
    const isConfigured = summary ? summary.configured : false;
    const configuredFields = summary ? summary.configured_fields : [];
    const fieldHints = summary ? summary.display_hints : {};

    let updatedList: InstalledToolState[] = [];
    set((state) => {
      const existingIdx = state.installedTools.findIndex(t => t.toolId === toolId);
      updatedList = [...state.installedTools];
      const entry: InstalledToolState = {
        toolId,
        isEnabled,
        isConfigured,
        configuredFields,
        fieldHints,
        targetClients,
        lastSyncedAt: Date.now(),
        syncStatus: 'synced'
      };
      if (existingIdx >= 0) {
        updatedList[existingIdx] = entry;
      } else {
        updatedList.push(entry);
      }
      return { installedTools: updatedList, selectedToolForDrawer: null };
    });

    // 2. Persist assignments natively
    await saveNativeToolAssignments(
      updatedList.map(t => ({
        tool_id: t.toolId,
        is_enabled: t.isEnabled,
        target_clients: t.targetClients
      }))
    );

    // 3. Sync all tools
    const syncRes = await get().syncAllTools();
    const failedSync = syncRes.find(r => !r.isSuccess);
    if (failedSync) {
      set((state) => ({
        installedTools: state.installedTools.map(t =>
          t.toolId === toolId ? { ...t, syncStatus: 'error', errorMessage: failedSync.message } : t
        )
      }));
      throw new Error(failedSync.message);
    }
  },
  revokeToolConfig: async (toolId: string) => {
    const revResult = await revokeTool(toolId);
    if (!revResult.success) {
      throw new Error(revResult.error || 'Failed to prune tool from all client configuration files');
    }

    let updatedList: InstalledToolState[] = [];
    set((state) => {
      updatedList = state.installedTools.filter(t => t.toolId !== toolId);
      return {
        installedTools: updatedList,
        selectedToolForDrawer: null
      };
    });

    await saveNativeToolAssignments(
      updatedList.map(t => ({
        tool_id: t.toolId,
        is_enabled: t.isEnabled,
        target_clients: t.targetClients
      }))
    );
    await get().syncAllTools();
  },
  toggleToolEnabled: async (toolId) => {
    let updatedList: InstalledToolState[] = [];
    set((state) => {
      updatedList = state.installedTools.map(t => 
        t.toolId === toolId ? { ...t, isEnabled: !t.isEnabled } : t
      );
      return { installedTools: updatedList };
    });

    const saved = await saveNativeToolAssignments(
      updatedList.map(t => ({
        tool_id: t.toolId,
        is_enabled: t.isEnabled,
        target_clients: t.targetClients
      }))
    );
    if (!saved) {
      console.error('[Store] Failed to persist tool assignments to native storage');
    }
    await get().syncAllTools();
  },
  syncResults: [],
  syncAllTools: async () => {
    const results = await ConfigSyncService.syncToolsToTargetClients(
      get().installedTools,
      get().mcpCatalog,
      { writeToDisk: true, createBackups: true }
    );
    set({ syncResults: results });
    return results;
  },

  // Connected Agents (Dynamically auto-detected from incoming requests)
  connectedAgents: [],
  addOrUpdateAgent: (agent) => set((state) => {
    const idx = state.connectedAgents.findIndex(a => a.id === agent.id);
    if (idx >= 0) {
      const list = [...state.connectedAgents];
      list[idx] = agent;
      return { connectedAgents: list };
    }
    return { connectedAgents: [agent, ...state.connectedAgents] };
  }),

  // Traces & Observability (Dynamically ingested from port 4000)
  traces: [],
  selectedTrace: null,
  setSelectedTrace: (trace) => set({ selectedTrace: trace }),
  addTrace: (trace) => set((state) => ({
    traces: [trace, ...state.traces].slice(0, 100)
  })),

  // Terminal & PTY
  terminalLogs: [
    '[TetherMesh] Control Plane Initialized on http://127.0.0.1:4000',
    '[TetherMesh] Environment exports injected: ANTHROPIC_BASE_URL=http://127.0.0.1:4000, OPENAI_BASE_URL=http://127.0.0.1:4000/v1',
    '[TetherMesh] Ready to run Claude Code CLI, Aider, or custom agent scripts.',
    'powershell.exe -NoLogo'
  ],
  appendTerminalLog: (text) => set((state) => ({
    terminalLogs: [...state.terminalLogs, text]
  })),
  clearTerminal: () => set({ terminalLogs: [] }),

  // Settings
  settings: {
    proxyPort: 4000,
    proxyHost: '127.0.0.1',
    autoStartOnBoot: true,
    minimizeToTray: true,
    enableTerminalAutoEnv: true,
    defaultTerminalShell: 'powershell',
    telemetryRetentionHours: 48,
    openAiBaseUrlAlias: 'http://127.0.0.1:4000/v1',
    anthropicBaseUrlAlias: 'http://127.0.0.1:4000'
  },
  updateSettings: (updates) => set((state) => ({
    settings: { ...state.settings, ...updates }
  }))
}));

// Initialize persisted vault, budget, and onboarding state
if (typeof window !== 'undefined') {
  // 0. Synchronous startup purge of Web Storage (localStorage & sessionStorage)
  purgeLegacyWebStorage();

  (async () => {
    try {
      // 1. Check onboarding state
      const onboarded = localStorage.getItem('tethermesh_onboarded');
      if (!onboarded) {
        useTetherStore.setState({ isQuickstartOpen: true });
      }

      // 2a. Load credential summaries from OS vault
      const summaries = await listCredentialSummaries();
      if (summaries && summaries.length > 0) {
        const configuredMap = new Map(summaries.map(s => [s.provider, s.configured]));
        useTetherStore.setState((state) => ({
          providers: state.providers.map(p => ({
            ...p,
            isHealthy: configuredMap.get(p.id) ?? p.isHealthy
          }))
        }));
      }

      // 2b. Load tool assignments & credential summaries from native storage
      const nativeAssignments = await loadNativeToolAssignments();
      const toolSummaries = await listToolCredentialSummaries();
      const toolSummaryMap = new Map((toolSummaries || []).map(s => [s.tool_id, s]));

      if (nativeAssignments && nativeAssignments.length > 0) {
        const installed: InstalledToolState[] = nativeAssignments.map(a => {
          const sum = toolSummaryMap.get(a.tool_id);
          return {
            toolId: a.tool_id,
            isEnabled: a.is_enabled,
            targetClients: a.target_clients,
            isConfigured: sum ? sum.configured : false,
            configuredFields: sum ? sum.configured_fields : [],
            fieldHints: sum ? sum.display_hints : {},
            lastSyncedAt: Date.now(),
            syncStatus: 'synced'
          };
        });
        useTetherStore.setState({ installedTools: installed });
      } else if (toolSummaries && toolSummaries.length > 0) {
        useTetherStore.setState((state) => ({
          installedTools: state.installedTools.map(t => {
            const sum = toolSummaryMap.get(t.toolId);
            if (sum) {
              return {
                ...t,
                isConfigured: sum.configured,
                configuredFields: sum.configured_fields,
                fieldHints: sum.display_hints
              };
            }
            return t;
          })
        }));
      }

      // 3. Load non-secret routing metadata
      const routing = await loadRoutingMetadata();
      if (routing) {
        useTetherStore.setState((state) => ({
          fallbackChains: routing.fallback_chains || state.fallbackChains,
          virtualAliases: routing.virtual_aliases || state.virtualAliases,
        }));
      }

      // 4. Load budget from disk/sidecar SQLite
      const budget = await loadPersistedBudget();
      if (budget) {
        useTetherStore.setState({
          budget: persistedToStoreBudget(budget),
        });
      }
    } catch (e) {
      console.error('[TetherStore] Initialization error:', e);
    }
  })();
}
