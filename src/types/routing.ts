export type ProviderId = 
  | 'anthropic'
  | 'openai'
  | 'bedrock'
  | 'vertex'
  | 'groq'
  | 'ollama'
  | 'mistral';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  isEnabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  awsRegion?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  vertexProjectId?: string;
  vertexLocation?: string;
  customHeaders?: Record<string, string>;
  isHealthy: boolean;
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
