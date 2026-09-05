import { InstalledToolState, McpToolDefinition, TargetClientId } from '../types/tools';
import { ClientSyncResult } from '../types/config';
import { TARGET_CLIENTS_META } from '../data/mcpCatalogData';
import * as jsonc from 'jsonc-parser';
import * as toml from 'smol-toml';

export type ExpectedRevision =
  | { kind: 'missing' }
  | { kind: 'sha256'; value: string };

export interface SyncOptions {
  platform?: 'win32' | 'darwin' | 'linux';
  customEnv?: { userProfile?: string; appData?: string; home?: string };
  writeToDisk?: boolean;
  createBackups?: boolean;
  mockExistingFiles?: Record<string, string>;
}

export interface SchemaError {
  code: 'schema_conflict';
  path: string[];
  expected: string;
  actual: string;
  message: string;
}

export interface MergeResult {
  updatedJsonStr: string;
  injectedCount: number;
  updatedCount: number;
  conflicts: string[];
  error?: string;
  schemaError?: SchemaError;
}

export interface DetectedFormatting {
  eol: '\r\n' | '\n';
  insertSpaces: boolean;
  tabSize: number;
  hasBom: boolean;
  hasTrailingNewline: boolean;
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
   * Helper to normalize path separators (Windows backslashes to forward slashes)
   * to avoid broken escape sequences in JSON configs.
   */
  public static normalizePathSlashes(input: string): string {
    if (!input || typeof input !== 'string') return input;
    if (input.includes('\\') && (input.includes(':\\') || input.startsWith('\\') || input.includes('\\Users\\') || input.includes('\\AppData\\') || input.includes('\\Projects\\') || input.includes('\\'))) {
      return input.replace(/\\/g, '/');
    }
    return input;
  }

  /**
   * Generates the standard definition for a tool with filled credentials formatted per client
   */
  public static formatToolDefinitionForClient(
    tool: McpToolDefinition,
    installed: InstalledToolState,
    clientTarget?: TargetClientId
  ): any {
    const env: Record<string, string> = { ...tool.defaultEnv };
    const customArgs: string[] = [...tool.args];

    for (const field of tool.fields) {
      const value = installed.credentials?.[field.key] || field.defaultValue;
      if (value !== undefined && value !== null && value !== '') {
        const normalized = ConfigSyncService.normalizePathSlashes(String(value));
        if (field.isPositionalArg) {
          // Handle comma-separated lists for positional directory paths (e.g. Filesystem MCP)
          if (normalized.includes(',')) {
            normalized.split(',').forEach((p) => {
              const trimmed = p.trim();
              if (trimmed && !customArgs.includes(trimmed)) customArgs.push(trimmed);
            });
          } else if (!customArgs.includes(normalized)) {
            customArgs.push(normalized);
          }
        } else {
          env[field.key] = normalized;
        }
      }
    }

    // Remote HTTP / SSE MCP server format
    if (tool.transportType === 'http' || tool.transportType === 'sse' || tool.serverUrl || tool.url) {
      const targetUrl = tool.serverUrl || tool.url;
      const headers = tool.headers || (Object.keys(env).length > 0 ? env : undefined);

      if (clientTarget === 'windsurf' || clientTarget === 'antigravity') {
        return {
          serverUrl: targetUrl,
          ...(headers ? { headers } : {})
        };
      }

      if (clientTarget === 'vscode') {
        return {
          type: 'http',
          url: targetUrl,
          ...(headers ? { headers } : {})
        };
      }

      return {
        type: 'http',
        url: targetUrl,
        ...(headers ? { headers } : {})
      };
    }

    // VS Code specific stdio format
    if (clientTarget === 'vscode') {
      return {
        type: 'stdio',
        command: tool.command,
        args: customArgs,
        env: Object.keys(env).length > 0 ? env : {}
      };
    }

    // Cline specific stdio format (requires disabled and autoApprove keys)
    if (clientTarget === 'cline') {
      return {
        command: tool.command,
        args: customArgs,
        env: Object.keys(env).length > 0 ? env : {},
        disabled: false,
        autoApprove: []
      };
    }

    // Standard stdio MCP format (Cursor, Claude Code, Windsurf, Antigravity, Claude Desktop, Devin)
    return {
      command: tool.command,
      args: customArgs,
      env: Object.keys(env).length > 0 ? env : {}
    };
  }

  /**
   * Detects document formatting conventions (indentation, line endings, BOM, trailing newline)
   */
  public static detectFormatting(text: string): DetectedFormatting {
    const hasBom = text.charCodeAt(0) === 0xFEFF;
    const clean = hasBom ? text.slice(1) : text;
    const eol = clean.includes('\r\n') ? '\r\n' : '\n';
    const hasTrailingNewline = clean.endsWith('\n') || clean.endsWith('\r\n');

    let insertSpaces = true;
    let tabSize = 2;

    const lines = clean.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^(\t+| +)/);
      if (match) {
        const indent = match[1];
        if (indent.startsWith('\t')) {
          insertSpaces = false;
          tabSize = 1;
          break;
        } else {
          insertSpaces = true;
          tabSize = indent.length % 4 === 0 ? 4 : 2;
          break;
        }
      }
    }

    return { eol, insertSpaces, tabSize, hasBom, hasTrailingNewline };
  }

  /**
   * Validates document AST to catch structural conflicts (null root, arrays, duplicate keys, malformed tool objects)
   */
  public static validateStructureAndDuplicates(
    text: string,
    rootKey: string
  ): { valid: boolean; error?: string; schemaError?: SchemaError } {
    const parseErrors: jsonc.ParseError[] = [];
    const tree = jsonc.parseTree(text, parseErrors, { allowTrailingComma: true });

    if (parseErrors.length > 0) {
      const firstErr = parseErrors[0];
      return {
        valid: false,
        error: `JSONC syntax error code ${firstErr.error} at offset ${firstErr.offset}. Synchronization aborted to protect your files.`
      };
    }

    if (!tree || tree.type !== 'object') {
      const actualType = tree ? tree.type : 'null';
      return {
        valid: false,
        error: 'Structural conflict: Document root must be a JSON object, not a null, array, or primitive.',
        schemaError: {
          code: 'schema_conflict',
          path: [],
          expected: 'object',
          actual: actualType,
          message: 'Structural conflict: Document root must be a JSON object, not a null, array, or primitive.'
        }
      };
    }

    // Check for duplicate keys in root and in rootKey
    const seenRootKeys = new Set<string>();
    for (const prop of tree.children || []) {
      if (prop.type === 'property' && prop.children && prop.children[0]) {
        const keyName = String(prop.children[0].value);
        if (seenRootKeys.has(keyName)) {
          return {
            valid: false,
            error: `Structural conflict: Duplicate root key '${keyName}' detected in configuration.`,
            schemaError: {
              code: 'schema_conflict',
              path: [keyName],
              expected: 'unique_key',
              actual: 'duplicate_key',
              message: `Structural conflict: Duplicate root key '${keyName}' detected in configuration.`
            }
          };
        }
        seenRootKeys.add(keyName);

        if (keyName === rootKey) {
          const valNode = prop.children[1];
          if (valNode && valNode.type !== 'object') {
            return {
              valid: false,
              error: `Structural conflict: '${rootKey}' must be an object, but found ${valNode.type}.`,
              schemaError: {
                code: 'schema_conflict',
                path: [rootKey],
                expected: 'object',
                actual: valNode.type,
                message: `Structural conflict: '${rootKey}' must be an object, but found ${valNode.type}.`
              }
            };
          }
          if (valNode && valNode.children) {
            const seenToolKeys = new Set<string>();
            for (const toolProp of valNode.children) {
              if (toolProp.type === 'property' && toolProp.children && toolProp.children[0]) {
                const toolKey = String(toolProp.children[0].value);
                if (seenToolKeys.has(toolKey)) {
                  return {
                    valid: false,
                    error: `Structural conflict: Duplicate tool ID '${toolKey}' in '${rootKey}'.`,
                    schemaError: {
                      code: 'schema_conflict',
                      path: [rootKey, toolKey],
                      expected: 'unique_key',
                      actual: 'duplicate_key',
                      message: `Structural conflict: Duplicate tool ID '${toolKey}' in '${rootKey}'.`
                    }
                  };
                }
                seenToolKeys.add(toolKey);

                // Validate that each individual tool definition is an object
                const toolValNode = toolProp.children[1];
                if (toolValNode && toolValNode.type !== 'object') {
                  return {
                    valid: false,
                    error: `Structural conflict: Tool '${toolKey}' in '${rootKey}' must be an object, but found ${toolValNode.type}.`,
                    schemaError: {
                      code: 'schema_conflict',
                      path: [rootKey, toolKey],
                      expected: 'object',
                      actual: toolValNode.type,
                      message: `Structural conflict: Tool '${toolKey}' in '${rootKey}' must be an object, but found ${toolValNode.type}.`
                    }
                  };
                }
              }
            }
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validates nested managed properties on existing tools to ensure leaf edits don't fail or corrupt AST.
   */
  public static validateManagedProperties(
    parsed: Record<string, any>,
    rootKey: string,
    toolIds: string[]
  ): SchemaError | null {
    const tools = parsed[rootKey];
    if (!tools || typeof tools !== 'object') return null;

    for (const toolId of toolIds) {
      const tool = tools[toolId];
      if (!tool || typeof tool !== 'object' || Array.isArray(tool)) continue;

      // command, url, serverUrl, type: string when present
      for (const field of ['command', 'url', 'serverUrl', 'type'] as const) {
        if (tool[field] !== undefined && typeof tool[field] !== 'string') {
          return {
            code: 'schema_conflict',
            path: [rootKey, toolId, field],
            expected: 'string',
            actual: Array.isArray(tool[field]) ? 'array' : typeof tool[field],
            message: `Structural conflict: '${field}' in tool '${toolId}' must be a string, but found ${
              Array.isArray(tool[field]) ? 'array' : typeof tool[field]
            }.`
          };
        }
      }

      // args: array when present (and each element must be a string)
      if (tool.args !== undefined) {
        if (!Array.isArray(tool.args)) {
          return {
            code: 'schema_conflict',
            path: [rootKey, toolId, 'args'],
            expected: 'array',
            actual: typeof tool.args,
            message: `Structural conflict: 'args' in tool '${toolId}' must be an array, but found ${typeof tool.args}.`
          };
        }
        for (let i = 0; i < tool.args.length; i++) {
          if (typeof tool.args[i] !== 'string') {
            return {
              code: 'schema_conflict',
              path: [rootKey, toolId, 'args', String(i)],
              expected: 'string',
              actual: typeof tool.args[i],
              message: `Structural conflict: 'args[${i}]' in tool '${toolId}' must be a string, but found ${typeof tool.args[i]}.`
            };
          }
        }
      }

      // env, headers: object (not array, not null) when present
      for (const field of ['env', 'headers'] as const) {
        if (tool[field] !== undefined) {
          if (typeof tool[field] !== 'object' || Array.isArray(tool[field]) || tool[field] === null) {
            return {
              code: 'schema_conflict',
              path: [rootKey, toolId, field],
              expected: 'object',
              actual: Array.isArray(tool[field]) ? 'array' : typeof tool[field],
              message: `Structural conflict: '${field}' in tool '${toolId}' must be an object, but found ${
                Array.isArray(tool[field]) ? 'array' : typeof tool[field]
              }.`
            };
          }
        }
      }

      // disabled: boolean when present
      if (tool.disabled !== undefined && typeof tool.disabled !== 'boolean') {
        return {
          code: 'schema_conflict',
          path: [rootKey, toolId, 'disabled'],
          expected: 'boolean',
          actual: typeof tool.disabled,
          message: `Structural conflict: 'disabled' in tool '${toolId}' must be a boolean, but found ${typeof tool.disabled}.`
        };
      }

      // autoApprove: array when present
      if (tool.autoApprove !== undefined && !Array.isArray(tool.autoApprove)) {
        return {
          code: 'schema_conflict',
          path: [rootKey, toolId, 'autoApprove'],
          expected: 'array',
          actual: typeof tool.autoApprove,
          message: `Structural conflict: 'autoApprove' in tool '${toolId}' must be an array, but found ${typeof tool.autoApprove}.`
        };
      }
    }

    return null;
  }

  /**
   * Non-destructively merges new MCP tool configurations into an existing client config string.
   * Uses jsonc-parser sequential leaf modifications to preserve user comments, formatting, and custom keys.
   */
  public static mergeConfigNonDestructive(
    existingContent: string,
    toolsToInject: Array<{ toolId: string; definition: any }>,
    clientTarget: TargetClientId
  ): MergeResult {
    // -------------------------------------------------------------------------
    // 1. OpenAI Codex CLI (TOML Configuration)
    // -------------------------------------------------------------------------
    if (clientTarget === 'codex') {
      let parsedToml: Record<string, any> = {};
      const trimmed = (existingContent || '').trim();

      if (trimmed.length > 0) {
        try {
          parsedToml = toml.parse(trimmed) as Record<string, any>;
        } catch (err: any) {
          return {
            updatedJsonStr: existingContent,
            injectedCount: 0,
            updatedCount: 0,
            conflicts: [],
            error: `Syntax error in existing TOML config: ${err.message || String(err)}`
          };
        }
      }

      // Schema validation: if mcp_servers exists, it must be a table (not string, array, number, Date, etc.)
      if (parsedToml.mcp_servers !== undefined) {
        if (
          typeof parsedToml.mcp_servers !== 'object' ||
          Array.isArray(parsedToml.mcp_servers) ||
          parsedToml.mcp_servers === null ||
          parsedToml.mcp_servers instanceof Date
        ) {
          const actualType = parsedToml.mcp_servers instanceof Date
            ? 'datetime'
            : Array.isArray(parsedToml.mcp_servers)
            ? 'array'
            : typeof parsedToml.mcp_servers;
          return {
            updatedJsonStr: existingContent,
            injectedCount: 0,
            updatedCount: 0,
            conflicts: [],
            error: `Structural conflict: 'mcp_servers' must be a TOML table, but found ${actualType}.`,
            schemaError: {
              code: 'schema_conflict',
              path: ['mcp_servers'],
              expected: 'table',
              actual: actualType,
              message: `Structural conflict: 'mcp_servers' must be a TOML table, but found ${actualType}.`
            }
          };
        }

        // Validate individual tool entries in mcp_servers
        for (const [toolKey, toolVal] of Object.entries(parsedToml.mcp_servers)) {
          if (
            typeof toolVal !== 'object' ||
            Array.isArray(toolVal) ||
            toolVal === null ||
            toolVal instanceof Date
          ) {
            const actualType = toolVal instanceof Date
              ? 'datetime'
              : Array.isArray(toolVal)
              ? 'array'
              : typeof toolVal;
            return {
              updatedJsonStr: existingContent,
              injectedCount: 0,
              updatedCount: 0,
              conflicts: [],
              error: `Structural conflict: Tool '${toolKey}' in 'mcp_servers' must be a TOML table, but found ${actualType}.`,
              schemaError: {
                code: 'schema_conflict',
                path: ['mcp_servers', toolKey],
                expected: 'table',
                actual: actualType,
                message: `Structural conflict: Tool '${toolKey}' in 'mcp_servers' must be a TOML table, but found ${actualType}.`
              }
            };
          }
        }
      } else {
        parsedToml.mcp_servers = {};
      }

      let injectedCount = 0;
      let updatedCount = 0;
      const conflicts: string[] = [];

      for (const { toolId, definition } of toolsToInject) {
        if (parsedToml.mcp_servers[toolId]) {
          updatedCount++;
          conflicts.push(toolId);
        } else {
          injectedCount++;
        }

        const tomlToolEntry: Record<string, any> = { ...parsedToml.mcp_servers[toolId] };
        if (definition.command) tomlToolEntry.command = definition.command;
        if (definition.args && Array.isArray(definition.args)) tomlToolEntry.args = definition.args;
        if (definition.serverUrl || definition.url) tomlToolEntry.url = definition.serverUrl || definition.url;
        if (definition.env && Object.keys(definition.env).length > 0) {
          tomlToolEntry.env = { ...(tomlToolEntry.env || {}), ...definition.env };
        }

        parsedToml.mcp_servers[toolId] = tomlToolEntry;
      }

      try {
        const serializedToml = toml.stringify(parsedToml);
        return {
          updatedJsonStr: serializedToml,
          injectedCount,
          updatedCount,
          conflicts
        };
      } catch (err: any) {
        return {
          updatedJsonStr: existingContent,
          injectedCount: 0,
          updatedCount: 0,
          conflicts: [],
          error: `Failed to serialize TOML config: ${err.message || String(err)}`
        };
      }
    }

    // -------------------------------------------------------------------------
    // 2. Standard JSON / JSONC Clients (Cursor, Claude Code, Windsurf, etc.)
    // -------------------------------------------------------------------------
    const rootKey = clientTarget === 'vscode' ? 'servers' : 'mcpServers';
    const fmt = ConfigSyncService.detectFormatting(existingContent || '');
    const cleanContent = fmt.hasBom ? existingContent.slice(1) : (existingContent || '').trim();

    let currentText = cleanContent;
    if (!currentText) {
      currentText = rootKey === 'servers' ? '{\n  "servers": {}\n}' : '{\n  "mcpServers": {}\n}';
    }

    // Validate structure and duplicates
    const validation = ConfigSyncService.validateStructureAndDuplicates(currentText, rootKey);
    if (!validation.valid) {
      return {
        updatedJsonStr: existingContent,
        injectedCount: 0,
        updatedCount: 0,
        conflicts: [],
        error: validation.error,
        schemaError: validation.schemaError
      };
    }

    const parseErrors: jsonc.ParseError[] = [];
    const parsed = jsonc.parse(currentText, parseErrors, { allowTrailingComma: true }) || {};

    // Validate managed nested properties on existing tools to prevent corrupted leaf edits
    const managedError = ConfigSyncService.validateManagedProperties(
      parsed,
      rootKey,
      toolsToInject.map(t => t.toolId)
    );
    if (managedError) {
      return {
        updatedJsonStr: existingContent,
        injectedCount: 0,
        updatedCount: 0,
        conflicts: [],
        error: managedError.message,
        schemaError: managedError
      };
    }

    const formattingOptions: jsonc.FormattingOptions = {
      insertSpaces: fmt.insertSpaces,
      tabSize: fmt.tabSize,
      eol: fmt.eol
    };

    // Ensure rootKey object node exists in JSONC
    if (parsed[rootKey] === undefined) {
      const edits = jsonc.modify(currentText, [rootKey], {}, { formattingOptions });
      currentText = jsonc.applyEdits(currentText, edits);
    }

    let injectedCount = 0;
    let updatedCount = 0;
    const conflicts: string[] = [];

    for (const { toolId, definition } of toolsToInject) {
      const existingTool = parsed[rootKey]?.[toolId];

      if (existingTool === undefined) {
        injectedCount++;
        // New tool: insert full definition
        const edits = jsonc.modify(currentText, [rootKey, toolId], definition, { formattingOptions });
        currentText = jsonc.applyEdits(currentText, edits);
      } else {
        updatedCount++;
        conflicts.push(toolId);

        // Mandate #8: Collision Detection against custom/unmanaged third-party executables
        const isDangerousCustomCollision = (() => {
          if (!existingTool || typeof existingTool !== 'object') return false;
          const cmd = String(existingTool.command || '').toLowerCase();
          if (['powershell.exe', 'powershell', 'cmd.exe', 'cmd', 'bash', 'sh', 'cscript.exe', 'wscript.exe'].includes(cmd)) {
            return true;
          }
          if (Array.isArray(existingTool.args)) {
            const argsStr = existingTool.args.map((a: any) => String(a).toLowerCase()).join(' ');
            if (argsStr.includes('-encodedcommand') || argsStr.includes('-enc ') || argsStr.includes('invoke-expression')) {
              return true;
            }
          }
          return false;
        })();

        if (isDangerousCustomCollision) {
          // Preserve existing unmanaged tool configuration without overwrite
          continue;
        }

        // Existing tool: patch managed properties sequentially to preserve internal comments & custom keys
        if (definition.command !== undefined) {
          const edits = jsonc.modify(currentText, [rootKey, toolId, 'command'], definition.command, { formattingOptions });
          currentText = jsonc.applyEdits(currentText, edits);
        }
        if (definition.args !== undefined) {
          const edits = jsonc.modify(currentText, [rootKey, toolId, 'args'], definition.args, { formattingOptions });
          currentText = jsonc.applyEdits(currentText, edits);
        }
        if (definition.type !== undefined) {
          const edits = jsonc.modify(currentText, [rootKey, toolId, 'type'], definition.type, { formattingOptions });
          currentText = jsonc.applyEdits(currentText, edits);
        }
        if (definition.url !== undefined) {
          const edits = jsonc.modify(currentText, [rootKey, toolId, 'url'], definition.url, { formattingOptions });
          currentText = jsonc.applyEdits(currentText, edits);
        }
        if (definition.serverUrl !== undefined) {
          const edits = jsonc.modify(currentText, [rootKey, toolId, 'serverUrl'], definition.serverUrl, { formattingOptions });
          currentText = jsonc.applyEdits(currentText, edits);
        }

        // Transport transitions: clean up stale opposite transport fields
        if (definition.command !== undefined && (existingTool.url !== undefined || existingTool.serverUrl !== undefined)) {
          const editsUrl = jsonc.modify(currentText, [rootKey, toolId, 'url'], undefined, { formattingOptions });
          currentText = jsonc.applyEdits(currentText, editsUrl);
          const editsServerUrl = jsonc.modify(currentText, [rootKey, toolId, 'serverUrl'], undefined, { formattingOptions });
          currentText = jsonc.applyEdits(currentText, editsServerUrl);
        } else if ((definition.url !== undefined || definition.serverUrl !== undefined) && (existingTool.command !== undefined || existingTool.args !== undefined)) {
          const editsCmd = jsonc.modify(currentText, [rootKey, toolId, 'command'], undefined, { formattingOptions });
          currentText = jsonc.applyEdits(currentText, editsCmd);
          const editsArgs = jsonc.modify(currentText, [rootKey, toolId, 'args'], undefined, { formattingOptions });
          currentText = jsonc.applyEdits(currentText, editsArgs);
        }

        // Merge environment variables sequentially
        if (definition.env && typeof definition.env === 'object') {
          for (const [envKey, envVal] of Object.entries(definition.env)) {
            const edits = jsonc.modify(currentText, [rootKey, toolId, 'env', envKey], envVal, { formattingOptions });
            currentText = jsonc.applyEdits(currentText, edits);
          }
        }

        // Merge headers sequentially
        if (definition.headers && typeof definition.headers === 'object') {
          for (const [hdrKey, hdrVal] of Object.entries(definition.headers)) {
            const edits = jsonc.modify(currentText, [rootKey, toolId, 'headers', hdrKey], hdrVal, { formattingOptions });
            currentText = jsonc.applyEdits(currentText, edits);
          }
        }
      }
    }

    // Claude Code CLI: Auto-configure ANTHROPIC_BASE_URL to permanently route to proxy
    if (clientTarget === 'claude-code') {
      const edits = jsonc.modify(currentText, ['env', 'ANTHROPIC_BASE_URL'], 'http://127.0.0.1:4000', { formattingOptions });
      currentText = jsonc.applyEdits(currentText, edits);
    }

    // Restore BOM and final newline conventions
    let finalStr = currentText;
    if (fmt.hasBom && !finalStr.startsWith('\uFEFF')) {
      finalStr = '\uFEFF' + finalStr;
    }
    if (fmt.hasTrailingNewline && !finalStr.endsWith('\n')) {
      finalStr = finalStr + fmt.eol;
    }

    return {
      updatedJsonStr: finalStr,
      injectedCount,
      updatedCount,
      conflicts
    };
  }

  /**
   * Safely reads a config file from disk (Tauri IPC with typed Target and revision, Node fs, or mock)
   */
  public static async readConfigFileSafely(
    targetOrPath: TargetClientId | string,
    filePath?: string
  ): Promise<{ content: string | null; revision: ExpectedRevision; notFound: boolean; error?: string; configuredToolIds?: string[]; schemaValid?: boolean }> {
    const isTargetId = TARGET_CLIENTS_META.some(m => m.id === targetOrPath);
    const target = isTargetId ? (targetOrPath as TargetClientId) : undefined;
    const path = isTargetId ? filePath : targetOrPath;

    // 1. Tauri environment with strongly-typed ConfigTarget and ExpectedRevision
    if (typeof window !== 'undefined' && (window as any).__TAURI__ && target) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<{ exists: boolean; revision: ExpectedRevision; configured_tool_ids: string[]; schema_valid: boolean }>('read_client_config', { target });
        return {
          content: null, // Zero raw document content returned to webview
          revision: res.revision,
          notFound: !res.exists,
          configuredToolIds: res.configured_tool_ids,
          schemaValid: res.schema_valid
        };
      } catch (err: any) {
        return { content: null, revision: { kind: 'missing' }, notFound: false, error: err?.message || String(err) };
      }
    }

    // 2. Node.js environment (for tests/CLI)
    if (typeof process !== 'undefined' && process.versions?.node && path && !(global as any).__BROWSER_MODE_SIMULATION__) {
      try {
        const fs = await import('fs');
        if (fs.existsSync(path)) {
          const content = fs.readFileSync(path, 'utf8');
          const crypto = await import('crypto');
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          return { content, revision: { kind: 'sha256', value: hash }, notFound: false };
        }
        return { content: null, revision: { kind: 'missing' }, notFound: true };
      } catch (err: any) {
        return { content: null, revision: { kind: 'missing' }, notFound: false, error: err?.message || String(err) };
      }
    }

    // 3. Browser / Webview fallback (Zero persistent web storage invariant)
    return { content: null, revision: { kind: 'missing' }, notFound: true };
  }

  /**
   * Safely synchronizes tools via native parameter-only IPC in Tauri mode
  /**
   * Safely synchronizes tools via native desired-state-only IPC in Tauri mode
   * (Secrets are resolved directly by Rust from the OS Keyring Vault)
   */
  public static async syncClientConfigSafely(
    target: TargetClientId,
    tools: import('../types/tools').DesiredToolState[],
    createBackup: boolean = true,
    expectedRevision?: ExpectedRevision
  ): Promise<{
    success: boolean;
    backupCreated?: string;
    error?: string;
    errorCode?: string;
    toolResults?: import('../types/tools').StructuredToolResult[];
  }> {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<{
          success: boolean;
          backup_path: string | null;
          tool_results: import('../types/tools').StructuredToolResult[];
          error: string | null;
        }>('sync_client_config', {
          target,
          tools,
          createBackup,
          expectedRevision: expectedRevision || { kind: 'missing' }
        });
        return {
          success: res.success,
          backupCreated: res.backup_path || undefined,
          toolResults: res.tool_results,
          error: res.error || undefined
        };
      }
      return { success: true, toolResults: [] };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
        errorCode: err?.code || 'native_sync_error',
        backupCreated: err?.backup_path || undefined,
        toolResults: err?.tool_results || []
      };
    }
  }

  /**
   * Safely writes a file to disk with optimistic concurrency verification (expectedRevision) and automated timestamped .bak backup
   */
  public static async writeConfigFileSafely(
    targetOrPath: TargetClientId | string,
    content: string,
    createBackup: boolean = true,
    filePath?: string,
    expectedRevision?: ExpectedRevision
  ): Promise<{ success: boolean; backupCreated?: string; error?: string; errorCode?: string }> {
    try {
      const isTargetId = TARGET_CLIENTS_META.some(m => m.id === targetOrPath);
      const target = isTargetId ? (targetOrPath as TargetClientId) : undefined;
      const path = isTargetId ? filePath : targetOrPath;

      // 1. Tauri mode (real native app with strongly-typed ConfigTarget)
      if (typeof window !== 'undefined' && (window as any).__TAURI__ && target) {
        // In Tauri mode, client synchronizations must go through syncClientConfigSafely
        return { success: true };
      }

      // 2. Node.js mode (TEST-ONLY: Used exclusively by unit and contract test suites)
      if (typeof process !== 'undefined' && process.versions?.node && path && !(global as any).__BROWSER_MODE_SIMULATION__) {
        const fs = await import('fs');
        const pathModule = await import('path');
        const crypto = await import('crypto');

        const dir = pathModule.dirname(path);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Concurrency check before mutation
        if (expectedRevision) {
          if (expectedRevision.kind === 'missing') {
            if (fs.existsSync(path)) {
              return {
                success: false,
                errorCode: 'config_changed_concurrently',
                error: 'Configuration file was created by another process.'
              };
            }
          } else if (expectedRevision.kind === 'sha256') {
            if (!fs.existsSync(path)) {
              return {
                success: false,
                errorCode: 'config_changed_concurrently',
                error: 'Configuration file was deleted since last read.'
              };
            }
            const currentBytes = fs.readFileSync(path);
            const currentHash = crypto.createHash('sha256').update(currentBytes).digest('hex');
            if (currentHash !== expectedRevision.value) {
              return {
                success: false,
                errorCode: 'config_changed_concurrently',
                error: 'Configuration file was modified by another process. Please reload and try again.'
              };
            }
          }
        }

        // Idempotency: if content is identical, do not create backup or rewrite
        if (fs.existsSync(path)) {
          const current = fs.readFileSync(path, 'utf8');
          if (current === content) {
            return { success: true };
          }
        }

        // Atomic write via unique temp file with exclusive creation ('wx') & 0o600 mode
        const tempRandomSuffix = crypto.randomBytes(8).toString('hex');
        const tempPath = `${path}.tmp.${tempRandomSuffix}`;
        const tempFd = fs.openSync(tempPath, 'wx', 0o600);
        fs.writeSync(tempFd, content, 0, 'utf8');
        fs.fsyncSync(tempFd);
        fs.closeSync(tempFd);

        // FINAL RECHECK immediately before rename
        let verifiedBytes: Buffer | null = null;
        if (expectedRevision?.kind === 'sha256') {
          if (!fs.existsSync(path)) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            return {
              success: false,
              errorCode: 'config_changed_concurrently',
              error: 'Destination file was removed immediately before replacement.'
            };
          }
          verifiedBytes = fs.readFileSync(path);
          const finalHash = crypto.createHash('sha256').update(verifiedBytes).digest('hex');
          if (finalHash !== expectedRevision.value) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            return {
              success: false,
              errorCode: 'config_changed_concurrently',
              error: 'Configuration file was modified by an external process immediately before replacement.'
            };
          }
        }

        let backupCreated: string | undefined;
        if (createBackup && fs.existsSync(path)) {
          // If we haven't already read the verified bytes during Sha256 check, read raw bytes now
          if (!verifiedBytes) {
            verifiedBytes = fs.readFileSync(path);
          }
          const backupRandomSuffix = crypto.randomBytes(4).toString('hex');
          const backupPath = `${path}.bak.${Date.now()}.${backupRandomSuffix}`;
          try {
            const backupFd = fs.openSync(backupPath, 'wx', 0o600);
            fs.writeSync(backupFd, verifiedBytes);
            fs.fsyncSync(backupFd);
            fs.closeSync(backupFd);
            backupCreated = backupPath;

            // Prune excess backups beyond 5 for this target file
            try {
              const baseName = pathModule.basename(path);
              const parentDir = pathModule.dirname(path);
              const prefix = `${baseName}.bak.`;
              const entries = fs.readdirSync(parentDir);
              const matchingBackups = entries
                .filter(name => name.startsWith(prefix))
                .map(name => {
                  const full = pathModule.join(parentDir, name);
                  const stat = fs.statSync(full);
                  return { path: full, mtime: stat.mtimeMs };
                })
                .sort((a, b) => b.mtime - a.mtime); // newest first

              if (matchingBackups.length > 5) {
                for (let i = 5; i < matchingBackups.length; i++) {
                  try { fs.unlinkSync(matchingBackups[i].path); } catch (_) {}
                }
              }
            } catch (_) {}
          } catch (bErr: any) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            return {
              success: false,
              errorCode: 'backup_failed',
              error: `Failed to create and sync backup at ${backupPath}: ${bErr.message || String(bErr)}`
            };
          }
        }

        try {
          fs.renameSync(tempPath, path);
          return { success: true, backupCreated };
        } catch (renameErr: any) {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          return {
            success: false,
            errorCode: 'rename_failed',
            backupCreated,
            error: `Failed to atomically replace ${path}: ${renameErr.message || String(renameErr)}`
          };
        }
      }

      // 3. Browser / Webview fallback (Zero persistent web storage invariant)
      return {
        success: false,
        errorCode: 'native_required',
        error: 'Target configuration synchronization requires native desktop runtime.'
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || (typeof err === 'string' ? err : JSON.stringify(err)),
        errorCode: err.code || (err.errorCode as string) || undefined,
        backupCreated: err.backup_path || err.backupCreated || undefined
      };
    }
  }

  /**
   * Detects whether an external modification touched fields that TetherIQ actively manages.
   */
  public static detectManagedFieldConflicts(
    oldContent: string,
    newContent: string,
    toolsToInject: Array<{ toolId: string; definition: any }>,
    clientTarget: TargetClientId
  ): boolean {
    if (!oldContent || !newContent) return false;
    try {
      if (clientTarget === 'codex') {
        const oldToml = toml.parse(oldContent) as any;
        const newToml = toml.parse(newContent) as any;
        for (const { toolId } of toolsToInject) {
          const oldTool = oldToml?.mcp_servers?.[toolId];
          const newTool = newToml?.mcp_servers?.[toolId];
          if (oldTool && newTool) {
            for (const field of ['command', 'url', 'args']) {
              if (JSON.stringify(oldTool[field]) !== JSON.stringify(newTool[field])) {
                return true;
              }
            }
          }
        }
        return false;
      }

      const rootKey = clientTarget === 'vscode' ? 'servers' : 'mcpServers';
      const oldParsed = jsonc.parse(oldContent) || {};
      const newParsed = jsonc.parse(newContent) || {};

      for (const { toolId } of toolsToInject) {
        const oldTool = oldParsed[rootKey]?.[toolId];
        const newTool = newParsed[rootKey]?.[toolId];
        if (oldTool && newTool) {
          for (const field of ['command', 'args', 'type', 'url', 'serverUrl']) {
            if (JSON.stringify(oldTool[field]) !== JSON.stringify(newTool[field])) {
              return true;
            }
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Perform sync across all client targets with retry loop and managed-conflict detection
   */
  public static async syncToolsToTargetClients(
    installedTools: InstalledToolState[],
    allToolDefs: McpToolDefinition[],
    options: SyncOptions = {}
  ): Promise<ClientSyncResult[]> {
    const platform = options.platform || ConfigSyncService.detectPlatform();
    const mockFiles = options.mockExistingFiles || {};
    const results: ClientSyncResult[] = [];
    const MAX_RETRIES = 3;
    const JITTER_BASE_MS = 50;

    // For each client target, send desired state for ALL catalog tools
    for (const meta of TARGET_CLIENTS_META) {
      const rawPath = platform === 'win32'
        ? meta.defaultConfigPathWin
        : platform === 'darwin'
        ? meta.defaultConfigPathMac
        : meta.defaultConfigPathLinux;

      const resolvedPath = ConfigSyncService.resolvePath(rawPath, platform, options.customEnv);

      // Build complete desired state across all catalog tools
      const nativeTools: import('../types/tools').DesiredToolState[] = allToolDefs.map(def => {
        const isEnabled = installedTools.some(
          inst => inst.toolId === def.id && inst.isEnabled && inst.targetClients.includes(meta.id)
        );
        return {
          tool_id: def.id,
          is_enabled: isEnabled
        };
      });

      // Filter enabled tools for JS merge fallback / Node.js test mode
      const enabledDefs = allToolDefs.filter(def => 
        installedTools.some(inst => inst.toolId === def.id && inst.isEnabled && inst.targetClients.includes(meta.id))
      );

      const formattedTools = enabledDefs.map(t => {
        const inst = installedTools.find(i => i.toolId === t.id) || {
          toolId: t.id,
          isEnabled: true,
          targetClients: [meta.id]
        };
        return {
          toolId: t.id,
          definition: ConfigSyncService.formatToolDefinitionForClient(t, inst, meta.id)
        };
      });

      let lastWriteResult: {
        success: boolean;
        backupCreated?: string;
        error?: string;
        errorCode?: string;
        toolResults?: import('../types/tools').StructuredToolResult[];
      } = { success: false };
      let lastMergeResult: MergeResult | undefined = undefined;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        let existingContent = mockFiles[resolvedPath];
        let readRevision: ExpectedRevision = { kind: 'missing' };

        if (!existingContent) {
          const readResult = await ConfigSyncService.readConfigFileSafely(meta.id, resolvedPath);
          if (readResult.error && !readResult.notFound) {
            lastWriteResult = {
              success: false,
              error: `Failed to read existing config: ${readResult.error}`
            };
            break;
          }
          existingContent = readResult.content || '';
          readRevision = readResult.revision;
        }

        if (!existingContent) {
          existingContent = meta.id === 'codex' ? '' : meta.id === 'vscode' ? '{\n  "servers": {}\n}' : '{\n  "mcpServers": {}\n}';
        }

        const mergeResult = ConfigSyncService.mergeConfigNonDestructive(
          existingContent,
          formattedTools,
          meta.id
        );
        lastMergeResult = mergeResult;

        if (mergeResult.error || mergeResult.schemaError) {
          // Schema errors and parse errors are non-retryable
          lastWriteResult = {
            success: false,
            error: mergeResult.error
          };
          break;
        }

        if (options.writeToDisk !== false) {
          if (typeof window !== 'undefined' && (window as any).__TAURI__) {
            lastWriteResult = await ConfigSyncService.syncClientConfigSafely(
              meta.id,
              nativeTools,
              options.createBackups !== false,
              readRevision
            );

            // Check if any tool resulted in collision, missing credential, or error
            if (lastWriteResult.toolResults && lastWriteResult.toolResults.length > 0) {
              const failedTools = lastWriteResult.toolResults.filter(
                r => r.status === 'collision' || r.status === 'missing_credential' || r.status === 'error'
              );
              if (failedTools.length > 0) {
                lastWriteResult.success = false;
                lastWriteResult.error = failedTools
                  .map(f => `${f.tool_id}: ${f.message || f.status}`)
                  .join('; ');
              }
            }
          } else {
            lastWriteResult = await ConfigSyncService.writeConfigFileSafely(
              meta.id,
              mergeResult.updatedJsonStr,
              options.createBackups !== false,
              resolvedPath,
              readRevision
            );
          }

          if (lastWriteResult.success) {
            break;
          }

          if (lastWriteResult.errorCode === 'config_changed_concurrently' && attempt < MAX_RETRIES) {
            // Jittered backoff before retry
            await new Promise(r => setTimeout(r, JITTER_BASE_MS * attempt + Math.random() * JITTER_BASE_MS));
            continue;
          }
          break;
        } else {
          lastWriteResult = { success: true };
          break;
        }
      }

      const totalEffected = (lastMergeResult?.injectedCount || 0) + (lastMergeResult?.updatedCount || 0);
      results.push({
        clientId: meta.id,
        clientName: meta.name,
        filePath: resolvedPath,
        isSuccess: lastWriteResult.success,
        toolsInjected: lastWriteResult.success ? totalEffected : 0,
        message: lastWriteResult.success
          ? `Successfully synchronized ${totalEffected} MCP tools to ${meta.name} (${lastMergeResult?.injectedCount || 0} added, ${lastMergeResult?.updatedCount || 0} updated)${lastWriteResult.backupCreated ? ` (Backup created: ${lastWriteResult.backupCreated})` : ''}`
          : `Failed to sync ${meta.name}: ${lastWriteResult.error || 'Unknown error'}`,
        timestamp: Date.now()
      });
    }

    return results;
  }
}
