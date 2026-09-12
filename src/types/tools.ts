export type TargetClientId = 
  | 'cursor'
  | 'windsurf'
  | 'devin'
  | 'claude-code'
  | 'claude-desktop'
  | 'antigravity'
  | 'cline'
  | 'vscode'
  | 'codex';

export type ToolCategory = 
  | 'data-cloud'
  | 'productivity'
  | 'dev-ci'
  | 'cloud-infra'
  | 'search-scraping'
  | 'ai-vector'
  | 'ecommerce-comms'
  | 'system';

export interface ToolCredentialField {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'password' | 'number' | 'boolean' | 'url' | 'path';
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
  validationRegex?: string;
  validationMessage?: string;
  helpUrl?: string;
  isPositionalArg?: boolean;
}

export interface RuntimeEnvironment {
  hasNode: boolean;
  nodeVersion?: string;
  hasNpx: boolean;
  hasPython: boolean;
  pythonVersion?: string;
}

export interface McpToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  official: boolean;
  author: string;
  icon: string; // Lucide icon name or svg
  transportType?: 'stdio' | 'http' | 'sse';
  command: string; // e.g. 'npx' | 'docker' | 'uvx' | 'python'
  args: string[];
  fields: ToolCredentialField[];
  defaultEnv: Record<string, string>;
  url?: string;
  serverUrl?: string;
  headers?: Record<string, string>;
  docsUrl?: string;
}

export interface InstalledToolState {
  toolId: string;
  isEnabled: boolean;
  isConfigured?: boolean;
  configuredFields?: string[];
  fieldHints?: Record<string, string>;
  credentials?: Record<string, string>;
  targetClients: TargetClientId[];
  lastSyncedAt?: number;
  syncStatus?: 'synced' | 'pending' | 'error';
  errorMessage?: string;
}

export type ToolSyncStatus =
  | 'installed'
  | 'updated'
  | 'removed'
  | 'unchanged'
  | 'collision'
  | 'missing_credential'
  | 'error';

export interface StructuredToolResult {
  tool_id: string;
  status: ToolSyncStatus;
  message?: string;
  collision_details?: string;
  missing_fields?: string[];
}

export interface DesiredToolState {
  tool_id: string;
  is_enabled: boolean;
}

export interface CredentialFieldMutation {
  field: string;
  operation: 'set' | 'delete';
  value?: string;
}

export interface ToolAssignmentState {
  tool_id: string;
  is_enabled: boolean;
  target_clients: TargetClientId[];
}

export interface RevocationResult {
  tool_id: string;
  client_results: Record<string, StructuredToolResult>;
  vault_revoked: boolean;
  success: boolean;
  error?: string;
}

export interface TargetClientMeta {
  id: TargetClientId;
  name: string;
  category: 'ide' | 'cli' | 'desktop' | 'agent';
  icon: string;
  defaultConfigPathWin: string;
  defaultConfigPathMac: string;
  defaultConfigPathLinux: string;
  jsonKeyPath: string; // e.g. 'mcpServers' or 'tools'
  instructions: string;
}

