export type ProviderId = 
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'deepseek'
  | 'bedrock'
  | 'vertex'
  | 'groq'
  | 'ollama'
  | 'mistral';

export type BillingMode = 'pay-per-token' | 'subscription-unlimited';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  isEnabled: boolean;
  billingMode?: BillingMode; // Default: 'pay-per-token'
  apiKey?: string;
  baseUrl?: string;
  awsRegion?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  vertexProjectId?: string;
  vertexLocation?: string;
  customHeaders?: Record<string, string>;
  isHealthy: boolean;
  isConfigured?: boolean;
  keyHint?: string;
  lastPingMs?: number;
}

export interface ModelFallbackNode {
  id: string;
  provider: ProviderId;
  modelIdentifier: string;
  displayName: string;
  priority: number; // 1 = Highest
  timeoutMs: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  maxContextTokens: number;
}

export interface FallbackChain {
  id: string;
  name: string;
  description: string;
  nodes: ModelFallbackNode[];
}

export interface VirtualModelAlias {
  alias: string; // e.g. 'fast-code', 'heavy-reasoning', 'cheapest'
  targetChainId: string;
  description: string;
}

export interface DiscoveredLocalModel {
  name: string;
  engine: 'ollama' | 'lm-studio' | 'vllm';
  sizeBytes?: number;
  format?: string;
  family?: string;
  contextLength?: number;
}

export interface LocalMeshStatus {
  isScanning: boolean;
  lastScannedAt?: number;
  ollamaRunning: boolean;
  ollamaUrl: string;
  lmStudioRunning: boolean;
  lmStudioUrl: string;
  discoveredModels: DiscoveredLocalModel[];
  allModelIdentifiers: string[];
}
