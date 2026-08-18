export type TargetClientId = 
  | 'cursor'
  | 'windsurf'
  | 'devin'
  | 'claude-code'
  | 'claude-desktop'
  | 'antigravity'
  | 'cline';

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
  type: 'string' | 'password' | 'number' | 'boolean' | 'url';
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
}

export interface McpToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  official: boolean;
  author: string;
  icon: string; // Lucide icon name or svg
  command: string; // e.g. 'npx' | 'docker' | 'uvx' | 'python'
  args: string[];
  fields: ToolCredentialField[];
  defaultEnv: Record<string, string>;
  docsUrl?: string;
}

export interface InstalledToolState {
  toolId: string;
  isEnabled: boolean;
  credentials: Record<string, string>;
  targetClients: TargetClientId[];
  lastSyncedAt?: number;
  syncStatus?: 'synced' | 'pending' | 'error';
  errorMessage?: string;
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
