import { InstalledToolState, McpToolDefinition, TargetClientId } from '../types/tools';
import { ClientSyncResult } from '../types/config';
import { TARGET_CLIENTS_META } from '../data/mcpCatalogData';

export class ConfigSyncService {
  /**
   * Resolve an OS path with environment variables and home expansion
   */
  public static resolvePath(rawPath: string, platform: 'win32' | 'darwin' | 'linux' = 'win32'): string {
    let resolved = rawPath;
    if (platform === 'win32') {
      const userProfile = 'C:\\Users\\Developer';
      const appData = 'C:\\Users\\Developer\\AppData\\Roaming';
      resolved = resolved
        .replace(/%USERPROFILE%/gi, userProfile)
        .replace(/%APPDATA%/gi, appData);
    } else {
      const home = '/Users/developer';
      resolved = resolved.replace(/^~(?=$|\/|\\)/, home);
    }
    return resolved;
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
      if (value) {
        env[field.key] = value;
      }
    }

    return {
      command: tool.command,
      args: tool.args,
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
        parsed = JSON.parse(existingJsonStr);
      }
    } catch {
      parsed = {};
    }

    const rootKey = clientTarget === 'devin' ? 'mcpServers' : 'mcpServers';

    if (!parsed[rootKey] || typeof parsed[rootKey] !== 'object' || Array.isArray(parsed[rootKey])) {
      parsed[rootKey] = {};
    }

    let injectedCount = 0;
    for (const { toolId, definition } of toolsToInject) {
      parsed[rootKey][toolId] = definition;
      injectedCount++;
    }

    // Claude Code also accepts ANTHROPIC_BASE_URL inside settings
    if (clientTarget === 'claude-code') {
      if (!parsed.env) parsed.env = {};
      parsed.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:4000';
    }

    return {
      updatedJsonStr: JSON.stringify(parsed, null, 2),
      injectedCount
    };
  }

  /**
   * Perform sync across all selected client targets
   */
  public static async syncToolsToTargetClients(
    installedTools: InstalledToolState[],
    allToolDefs: McpToolDefinition[],
    mockExistingFiles: Record<string, string> = {}
  ): Promise<ClientSyncResult[]> {
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

      const path = ConfigSyncService.resolvePath(meta.defaultConfigPathWin, 'win32');
      const existing = mockExistingFiles[path] || '{\n  "mcpServers": {}\n}';

      const formattedTools = tools.map(t => {
        const inst = installedTools.find(i => i.toolId === t.id)!;
        return {
          toolId: t.id,
          definition: ConfigSyncService.formatToolDefinitionForClient(t, inst)
        };
      });

      const { updatedJsonStr, injectedCount } = ConfigSyncService.mergeConfigNonDestructive(
        existing,
        formattedTools,
        meta.id
      );

      // In browser / dev environment, save into localStorage / state store
      localStorage.setItem(`tether_client_config_${meta.id}`, updatedJsonStr);

      results.push({
        clientId: meta.id,
        clientName: meta.name,
        filePath: path,
        isSuccess: true,
        toolsInjected: injectedCount,
        message: `Successfully synchronized ${injectedCount} MCP tools to ${meta.name}`,
        timestamp: Date.now()
      });
    }

    return results;
  }
}
