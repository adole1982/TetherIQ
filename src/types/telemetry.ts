export interface TelemetryPoint {
  timestamp: number;
  tokensPerSecond: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costEstimate: number;
  provider: string;
  model: string;
}

export interface SpendBudget {
  dailyLimit: number | null;
  monthlyLimit: number | null;
  currentDailySpend: number;
  currentMonthlySpend: number;
  isCircuitBreakerTripped: boolean;
  hardStopEnabled: boolean;
  lastResetDate: string;
}

export interface ConnectedAgent {
  id: string;
  clientName: string; // 'Claude Code CLI' | 'Cursor IDE' | 'Windsurf' | 'Devin' | 'Aider' | 'Antigravity' | 'Python SDK'
  agentIcon: string;
  ip: string;
  connectedAt: number;
  lastActiveAt: number;
  totalTokens: number;
  totalCost: number;
  activeModel: string;
  status: 'active' | 'idle' | 'rate-limited' | 'blocked-budget';
}
