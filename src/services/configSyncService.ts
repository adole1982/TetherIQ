import { InstalledToolState, McpToolDefinition, TargetClientId } from '../types/tools';
import { ClientSyncResult } from '../types/config';
import { TARGET_CLIENTS_META } from '../data/mcpCatalogData';

export interface SyncOptions {
  platform?: 'win32' | 'darwin' | 'linux';
  customEnv?: { userProfile?: string; appData?: string; home?: string };
  writeToDisk?: boolean;
  createBackups?: boolean;
  mockExistingFiles?: Record<string, string>;
}

export class ConfigSyncService {
  /**
   * Automatically detects current operating system
   */
  public static detectPlatform(): 'win32' | 'darwin' | 'linux' {
    if (typeof process !== 'undefined' && process.platform) {
      if (process.platform === 'win32') return 'win32';
      if (process.platform === 'darwin') return 'darwin';
      return 'linux';
    }
    if (typeof navigator !== 'undefined') {
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes('win')) return 'win32';
      if (userAgent.includes('mac')) return 'darwin';
      return 'linux';
    }
    return 'win32';
  }

  /**
   * Resolve an OS path with environment variables and home expansion
   */
  public static resolvePath(
    rawPath: string,
    platform: 'win32' | 'darwin' | 'linux' = 'win32',
    customEnv?: { userProfile?: string; appData?: string; home?: string }
  ): string {
    let resolved = rawPath;
    if (platform === 'win32') {
      const userProfile = customEnv?.userProfile || (typeof process !== 'undefined' && process.env?.USERPROFILE) || 'C:\\Users\\Developer';
      const appData = customEnv?.appData || (typeof process !== 'undefined' && process.env?.APPDATA) || `${userProfile}\\AppData\\Roaming`;
      resolved = resolved
        .replace(/%USERPROFILE%/gi, userProfile)
        .replace(/%APPDATA%/gi, appData);
    } else {
      const home = customEnv?.home || (typeof process !== 'undefined' && process.env?.HOME) || '/Users/developer';
      resolved = resolved.replace(/^~(?=$|\/|\\)/, home);
    }
    return resolved;
  }

  /**
   * Strip single and multi-line comments from JSONC before parsing
   */
  public static stripJsonComments(jsonc: string): string {
    return jsonc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^\\:])\/\/.*$/gm, '$1')
      .trim();
  }

  /**
   * Generates the standard mcpServers definition for a tool with filled credentials
   */
  public static formatToolDefinitionForClient(
    tool: McpToolDefinition,
    installed: InstalledToolState
  ): { command: string; args: string[]; env: Record<string, string> } {
    const env: Record<string, string> = { ...tool.defaultEnv };
    for (const field of tool.fields) {
      const value = installed.credentials[field.key] || field.defaultValue;
      if (value !== undefined && value !== null && value !== '') {
        env[field.key] = String(value);
      }
    }

    return {
      command: tool.command,
      args: [...tool.args],
      env: Object.keys(env).length > 0 ? env : {}
    };
  }

  /**
   * Non-destructively merges new MCP tool configurations into an existing client JSON string
   */
  public static mergeConfigNonDestructive(
    existingJsonStr: string,
    toolsToInject: Array<{ toolId: string; definition: { command: string; args: string[]; env: Record<string, string> } }>,
    clientTarget: TargetClientId
  ): { updatedJsonStr: string; injectedCount: number } {
    let parsed: any = {};
    try {
      if (existingJsonStr && existingJsonStr.trim().length > 0) {
        const sanitized = ConfigSyncService.stripJsonComments(existingJsonStr);
        parsed = JSON.parse(sanitized);
      }
    } catch {
      parsed = {};
    }

    const rootKey = 'mcpServers';

    if (!parsed[rootKey] || typeof parsed[rootKey] !== 'object' || Array.isArray(parsed[rootKey])) {
      parsed[rootKey] = {};
    }

    let injectedCount = 0;
    for (const { toolId, definition } of toolsToInject) {
      parsed[rootKey][toolId] = definition;
      injectedCount++;
    }

    // Claude Code CLI also accepts ANTHROPIC_BASE_URL inside settings / env
    if (clientTarget === 'claude-code') {
      if (!parsed.env || typeof parsed.env !== 'object' || Array.isArray(parsed.env)) {
        parsed.env = {};
      }
      parsed.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:4000';
    }

    return {
      updatedJsonStr: JSON.stringify(parsed, null, 2),
      injectedCount
    };
  }

  /**
   * Safely writes a file to disk with atomic write and automated .bak backup
   */
  public static async writeConfigFileSafely(
    filePath: string,
    content: string,
    createBackup: boolean = true
  ): Promise<{ success: boolean; backupCreated?: string; error?: string }> {
    try {
      // Check Node.js fs availability
      if (typeof process !== 'undefined' && process.versions?.node) {
        const fs = await import('fs');
        const path = await import('path');

        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        let backupCreated: string | undefined;
        if (createBackup && fs.existsSync(filePath)) {
          const backupPath = `${filePath}.bak`;
          fs.copyFileSync(filePath, backupPath);
          backupCreated = backupPath;
        }

        // Atomic write via temp file
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        fs.writeFileSync(tempPath, content, 'utf8');
        fs.renameSync(tempPath, filePath);

        return { success: true, backupCreated };
      }

      // Browser / webview storage fallback
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`tether_file_${filePath}`, content);
        return { success: true };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }

  /**
   * Perform sync across all selected client targets
   */
  public static async syncToolsToTargetClients(
    installedTools: InstalledToolState[],
    allToolDefs: McpToolDefinition[],
    options: SyncOptions = {}
  ): Promise<ClientSyncResult[]> {
    const platform = options.platform || ConfigSyncService.detectPlatform();
    const mockFiles = options.mockExistingFiles || {};
    const results: ClientSyncResult[] = [];
    const clientMap = new Map<TargetClientId, McpToolDefinition[]>();

    for (const meta of TARGET_CLIENTS_META) {
      clientMap.set(meta.id, []);
    }

    // Group enabled tools by client
    for (const installed of installedTools) {
      if (!installed.isEnabled) continue;
      const def = allToolDefs.find(d => d.id === installed.toolId);
      if (!def) continue;

      for (const clientId of installed.targetClients) {
        const list = clientMap.get(clientId) || [];
        list.push(def);
        clientMap.set(clientId, list);
      }
    }

    // For each client, compute the non-destructive result
    for (const meta of TARGET_CLIENTS_META) {
      const tools = clientMap.get(meta.id) || [];
      if (tools.length === 0) continue;

      const rawPath = platform === 'win32'
        ? meta.defaultConfigPathWin
        : platform === 'darwin'
        ? meta.defaultConfigPathMac
        : meta.defaultConfigPathLinux;

      const resolvedPath = ConfigSyncService.resolvePath(rawPath, platform, options.customEnv);
      
      // Determine existing content
      let existingContent = mockFiles[resolvedPath];
      if (!existingContent && typeof process !== 'undefined' && process.versions?.node) {
        try {
          const fs = await import('fs');
          if (fs.existsSync(resolvedPath)) {
            existingContent = fs.readFileSync(resolvedPath, 'utf8');
          }
        } catch {
          // ignore read error, fallback to default
        }
      }

      if (!existingContent) {
        existingContent = '{\n  "mcpServers": {}\n}';
      }

      const formattedTools = tools.map(t => {
        const inst = installedTools.find(i => i.toolId === t.id)!;
        return {
          toolId: t.id,
          definition: ConfigSyncService.formatToolDefinitionForClient(t, inst)
        };
      });

      const { updatedJsonStr, injectedCount } = ConfigSyncService.mergeConfigNonDestructive(
        existingContent,
        formattedTools,
        meta.id
      );

      // In browser / storage mode, also persist to localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`tether_client_config_${meta.id}`, updatedJsonStr);
      }

      let writeResult: { success: boolean; backupCreated?: string; error?: string } = { success: true };
      if (options.writeToDisk) {
        writeResult = await ConfigSyncService.writeConfigFileSafely(
          resolvedPath,
          updatedJsonStr,
          options.createBackups !== false
        );
      }

      results.push({
        clientId: meta.id,
        clientName: meta.name,
        filePath: resolvedPath,
        isSuccess: writeResult.success,
        toolsInjected: injectedCount,
        message: writeResult.success
          ? `Successfully synchronized ${injectedCount} MCP tools to ${meta.name}${writeResult.backupCreated ? ` (Backup created at ${writeResult.backupCreated})` : ''}`
          : `Failed to write config: ${writeResult.error}`,
        timestamp: Date.now()
      });
    }

    return results;
  }
}
