export interface AppSettings {
  proxyPort: number;
  proxyHost: string;
  autoStartOnBoot: boolean;
  minimizeToTray: boolean;
  enableTerminalAutoEnv: boolean;
  defaultTerminalShell: 'powershell' | 'pwsh' | 'bash' | 'zsh' | 'cmd';
  telemetryRetentionHours: number;
  openAiBaseUrlAlias: string;
  anthropicBaseUrlAlias: string;
}

export interface ClientSyncResult {
  clientId: string;
  clientName: string;
  filePath: string;
  isSuccess: boolean;
  toolsInjected: number;
  message: string;
  timestamp: number;
}
