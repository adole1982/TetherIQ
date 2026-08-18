import { create } from 'zustand';
import { TelemetryPoint, SpendBudget, ConnectedAgent } from '../types/telemetry';
import { ProviderConfig, FallbackChain, VirtualModelAlias } from '../types/routing';
import { McpToolDefinition, InstalledToolState, TargetClientId } from '../types/tools';
import { ActivityTrace } from '../types/traces';
import { AppSettings, ClientSyncResult } from '../types/config';
import { MCP_CATALOG } from '../data/mcpCatalogData';
import { ConfigSyncService } from '../services/configSyncService';

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
  appVersion: string;

  // Telemetry & Spend
  telemetryHistory: TelemetryPoint[];
  currentTokensPerSec: number;
  currentLatencyMs: number;
  currentBurnRatePerHour: number;
  budget: SpendBudget;
  updateBudgetLimits: (daily: number, monthly: number) => void;
  resetCircuitBreaker: () => void;
  triggerSpend: (amount: number, tokens: number) => void;

  // Providers & Routing Matrix
  providers: ProviderConfig[];
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void;
  fallbackChains: FallbackChain[];
  updateFallbackChain: (chainId: string, nodes: any[]) => void;
  virtualAliases: VirtualModelAlias[];
  updateVirtualAlias: (alias: string, targetChainId: string) => void;

  // MCP Tools & Marketplace
  mcpCatalog: McpToolDefinition[];
  installedTools: InstalledToolState[];
  selectedToolForDrawer: McpToolDefinition | null;
  setSelectedToolForDrawer: (tool: McpToolDefinition | null) => void;
  saveToolConfig: (toolId: string, credentials: Record<string, string>, targetClients: TargetClientId[], isEnabled: boolean) => Promise<void>;
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
  { id: 'anthropic', name: 'Anthropic Direct', isEnabled: true, apiKey: 'sk-ant-api03-live-sample-tether-992384', isHealthy: true, lastPingMs: 42 },
  { id: 'openai', name: 'OpenAI Direct', isEnabled: true, apiKey: 'sk-proj-sample-key-tether-992134', isHealthy: true, lastPingMs: 65 },
  { id: 'bedrock', name: 'AWS Bedrock', isEnabled: true, awsRegion: 'us-east-1', awsAccessKey: 'AKIAIOSFODNN7EXAMPLE', awsSecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', isHealthy: true, lastPingMs: 78 },
  { id: 'vertex', name: 'Google Vertex AI', isEnabled: true, vertexProjectId: 'gcp-prod-analytics', vertexLocation: 'us-central1', isHealthy: true, lastPingMs: 55 },
  { id: 'groq', name: 'Groq Cloud', isEnabled: true, apiKey: 'gsk_sample_live_key_9934', isHealthy: true, lastPingMs: 18 },
  { id: 'ollama', name: 'Local Ollama (11434)', isEnabled: true, baseUrl: 'http://localhost:11434', isHealthy: true, lastPingMs: 4 }
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
    credentials: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_liveDevDemoKey7788990011223344' },
    targetClients: ['cursor', 'claude-code', 'windsurf', 'antigravity'],
    syncStatus: 'synced',
    lastSyncedAt: Date.now() - 3600000
  },
  {
    toolId: 'postgres',
    isEnabled: true,
    credentials: { POSTGRES_CONNECTION_STRING: 'postgresql://postgres:postgres@localhost:5432/app_development' },
    targetClients: ['cursor', 'claude-code', 'devin'],
    syncStatus: 'synced',
    lastSyncedAt: Date.now() - 3600000
  },
  {
    toolId: 'databricks',
    isEnabled: true,
    credentials: { DATABRICKS_HOST: 'https://dbc-12345.cloud.databricks.com', DATABRICKS_TOKEN: 'dapi1234567890abcdef' },
    targetClients: ['claude-code', 'windsurf', 'antigravity'],
    syncStatus: 'synced',
    lastSyncedAt: Date.now() - 1800000
  },
  {
    toolId: 'brave-search',
    isEnabled: true,
    credentials: { BRAVE_API_KEY: 'BSA_sample_live_token_7788' },
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
      { id: 'sp-6', name: 'GitHub API REST Call', startTime: 15, endTime: 365, durationMs: 350, status: 'ok', attributes: { repo: 'tetheriq/core', pr: 42 } },
      { id: 'sp-7', name: 'Stdio Serialization to Cursor', startTime: 365, endTime: 380, durationMs: 15, status: 'ok', attributes: { bytes: 4200 } }
    ],
    requestPayloadSummary: {
      messagesCount: 1,
      toolsCount: 1,
      stream: false,
      samplePrompt: "Call github::get_pull_request(owner='tetheriq', repo='core', pull_number=42)"
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
  appVersion: 'v1.0.0',

  // Telemetry & Spend
  telemetryHistory: Array.from({ length: 20 }, (_, i) => ({
    timestamp: Date.now() - (20 - i) * 3000,
    tokensPerSecond: Math.floor(25 + Math.random() * 45),
    inputTokens: 1200 + Math.floor(Math.random() * 400),
    outputTokens: 350 + Math.floor(Math.random() * 150),
    latencyMs: Math.floor(350 + Math.random() * 180),
    costEstimate: 0.008 + Math.random() * 0.005,
    provider: 'Anthropic Direct',
    model: 'claude-3-7-sonnet'
  })),
  currentTokensPerSec: 54.2,
  currentLatencyMs: 385,
  currentBurnRatePerHour: 1.38,
  budget: {
    dailyLimit: 10.00,
    monthlyLimit: 150.00,
    currentDailySpend: 1.38,
    currentMonthlySpend: 24.80,
    isCircuitBreakerTripped: false,
    hardStopEnabled: true,
    lastResetDate: new Date().toISOString().split('T')[0]
  },
  updateBudgetLimits: (daily, monthly) => set((state) => ({
    budget: { ...state.budget, dailyLimit: daily, monthlyLimit: monthly }
  })),
  resetCircuitBreaker: () => set((state) => ({
    budget: { ...state.budget, isCircuitBreakerTripped: false }
  })),
  triggerSpend: (amount, tokens) => set((state) => {
    const newDaily = state.budget.currentDailySpend + amount;
    const newMonthly = state.budget.currentMonthlySpend + amount;
    const tripped = state.budget.hardStopEnabled && newDaily >= state.budget.dailyLimit;
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
  updateProvider: (id, updates) => set((state) => ({
    providers: state.providers.map(p => p.id === id ? { ...p, ...updates } : p)
  })),
  fallbackChains: INITIAL_FALLBACK_CHAINS,
  updateFallbackChain: (chainId, nodes) => set((state) => ({
    fallbackChains: state.fallbackChains.map(c => c.id === chainId ? { ...c, nodes } : c)
  })),
  virtualAliases: INITIAL_VIRTUAL_ALIASES,
  updateVirtualAlias: (alias, targetChainId) => set((state) => ({
    virtualAliases: state.virtualAliases.map(a => a.alias === alias ? { ...a, targetChainId } : a)
  })),

  // Tools & Marketplace
  mcpCatalog: MCP_CATALOG,
  installedTools: INITIAL_INSTALLED_TOOLS,
  selectedToolForDrawer: null,
  setSelectedToolForDrawer: (tool) => set({ selectedToolForDrawer: tool }),
  saveToolConfig: async (toolId, credentials, targetClients, isEnabled) => {
    set((state) => {
      const existingIdx = state.installedTools.findIndex(t => t.toolId === toolId);
      const updatedList = [...state.installedTools];
      if (existingIdx >= 0) {
        updatedList[existingIdx] = {
          toolId,
          isEnabled,
          credentials,
          targetClients,
          lastSyncedAt: Date.now(),
          syncStatus: 'synced'
        };
      } else {
        updatedList.push({
          toolId,
          isEnabled,
          credentials,
          targetClients,
          lastSyncedAt: Date.now(),
          syncStatus: 'synced'
        });
      }
      return { installedTools: updatedList, selectedToolForDrawer: null };
    });

    // Auto-sync
    await get().syncAllTools();
  },
  toggleToolEnabled: (toolId) => {
    set((state) => ({
      installedTools: state.installedTools.map(t => 
        t.toolId === toolId ? { ...t, isEnabled: !t.isEnabled } : t
      )
    }));
    get().syncAllTools();
  },
  syncResults: [],
  syncAllTools: async () => {
    const results = await ConfigSyncService.syncToolsToTargetClients(
      get().installedTools,
      get().mcpCatalog
    );
    set({ syncResults: results });
    return results;
  },

  // Connected Agents
  connectedAgents: INITIAL_AGENTS,
  addOrUpdateAgent: (agent) => set((state) => {
    const idx = state.connectedAgents.findIndex(a => a.id === agent.id);
    if (idx >= 0) {
      const list = [...state.connectedAgents];
      list[idx] = agent;
      return { connectedAgents: list };
    }
    return { connectedAgents: [agent, ...state.connectedAgents] };
  }),

  // Traces & Observability
  traces: INITIAL_TRACES,
  selectedTrace: null,
  setSelectedTrace: (trace) => set({ selectedTrace: trace }),
  addTrace: (trace) => set((state) => ({
    traces: [trace, ...state.traces].slice(0, 100)
  })),

  // Terminal & PTY
  terminalLogs: [
    '[TetherIQ] Control Plane Initialized on http://127.0.0.1:4000',
    '[TetherIQ] Environment exports injected: ANTHROPIC_BASE_URL=http://127.0.0.1:4000, OPENAI_BASE_URL=http://127.0.0.1:4000/v1',
    '[TetherIQ] Ready to run Claude Code CLI, Aider, or custom agent scripts.',
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
