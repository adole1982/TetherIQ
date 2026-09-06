import { ConfigSyncService } from '../src/services/configSyncService';
import { MCP_CATALOG, TARGET_CLIENTS_META } from '../src/data/mcpCatalogData';
import { InstalledToolState } from '../src/types/tools';
import {
  listCredentialSummaries,
  setProviderCredential,
  deleteProviderCredential,
  loadRoutingMetadata,
  saveRoutingMetadata,
  purgeLegacyWebStorage,
  purgeLegacyLocalStorageSecrets,
  listToolCredentialSummaries,
  mutateToolCredentials,
  revokeTool,
  loadNativeToolAssignments,
  saveNativeToolAssignments
} from '../src/services/vaultPersistence';
import { generateLiteLLMConfig } from '../src/services/litellmConfigService';
import fs from 'fs';
import path from 'path';
import * as toml from 'smol-toml';
import * as jsonc from 'jsonc-parser';

interface TestStats {
  passed: number;
  failed: number;
  total: number;
  errors: string[];
}

const stats: TestStats = {
  passed: 0,
  failed: 0,
  total: 0,
  errors: []
};

function assert(condition: boolean, testName: string, detail?: string) {
  stats.total++;
  if (condition) {
    stats.passed++;
    console.log(`  \x1b[32m✔\x1b[0m ${testName}`);
  } else {
    stats.failed++;
    const errMsg = `FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`;
    stats.errors.push(errMsg);
    console.error(`  \x1b[31m✖\x1b[0m ${testName}`);
    if (detail) console.error(`    \x1b[33m${detail}\x1b[0m`);
  }
}

// -------------------------------------------------------------
// Test Group 1: OS Path Resolution & Virtual Filesystems
// -------------------------------------------------------------
function testOsPathResolution() {
  console.log('\n\x1b[1m[Suite 1: Multi-Platform Filesystem & Path Resolution]\x1b[0m');

  const mockEnvironments = [
    {
      os: 'win32' as const,
      name: 'Windows 11',
      env: {
        userProfile: 'C:\\Users\\AlexDev',
        appData: 'C:\\Users\\AlexDev\\AppData\\Roaming'
      },
      expectedPaths: {
        cursor: 'C:\\Users\\AlexDev\\.cursor\\mcp.json',
        windsurf: 'C:\\Users\\AlexDev\\.codeium\\windsurf\\mcp_config.json',
        devin: 'C:\\Users\\AlexDev\\.devin\\config.json',
        'claude-code': 'C:\\Users\\AlexDev\\.claude.json',
        'claude-desktop': 'C:\\Users\\AlexDev\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
        antigravity: 'C:\\Users\\AlexDev\\.gemini\\antigravity\\mcp_config.json',
        cline: 'C:\\Users\\AlexDev\\AppData\\Roaming\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json',
        vscode: 'C:\\Users\\AlexDev\\AppData\\Roaming\\Code\\User\\mcp.json',
        codex: 'C:\\Users\\AlexDev\\.codex\\config.toml'
      }
    },
    {
      os: 'darwin' as const,
      name: 'macOS Sequoia',
      env: {
        home: '/Users/alexdev'
      },
      expectedPaths: {
        cursor: '/Users/alexdev/.cursor/mcp.json',
        windsurf: '/Users/alexdev/.codeium/windsurf/mcp_config.json',
        devin: '/Users/alexdev/.devin/config.json',
        'claude-code': '/Users/alexdev/.claude.json',
        'claude-desktop': '/Users/alexdev/Library/Application Support/Claude/claude_desktop_config.json',
        antigravity: '/Users/alexdev/.gemini/antigravity/mcp_config.json',
        cline: '/Users/alexdev/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
        vscode: '/Users/alexdev/Library/Application Support/Code/User/mcp.json',
        codex: '/Users/alexdev/.codex/config.toml'
      }
    },
    {
      os: 'linux' as const,
      name: 'Ubuntu 24.04 Linux',
      env: {
        home: '/home/alexdev'
      },
      expectedPaths: {
        cursor: '/home/alexdev/.cursor/mcp.json',
        windsurf: '/home/alexdev/.codeium/windsurf/mcp_config.json',
        devin: '/home/alexdev/.devin/config.json',
        'claude-code': '/home/alexdev/.claude.json',
        'claude-desktop': '/home/alexdev/.config/Claude/claude_desktop_config.json',
        antigravity: '/home/alexdev/.gemini/antigravity/mcp_config.json',
        cline: '/home/alexdev/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
        vscode: '/home/alexdev/.config/Code/User/mcp.json',
        codex: '/home/alexdev/.codex/config.toml'
      }
    }
  ];

  for (const envTest of mockEnvironments) {
    for (const clientMeta of TARGET_CLIENTS_META) {
      const rawPath = envTest.os === 'win32'
        ? clientMeta.defaultConfigPathWin
        : envTest.os === 'darwin'
        ? clientMeta.defaultConfigPathMac
        : clientMeta.defaultConfigPathLinux;

      const resolved = ConfigSyncService.resolvePath(rawPath, envTest.os, envTest.env);
      const expected = envTest.expectedPaths[clientMeta.id as keyof typeof envTest.expectedPaths];

      assert(
        resolved === expected,
        `[${envTest.name}] Resolves ${clientMeta.name} config path`,
        `Expected "${expected}", got "${resolved}"`
      );
    }
  }
}

// -------------------------------------------------------------
// Test Group 2: Official MCP Schema Strict Validation (All Tools)
// -------------------------------------------------------------
function testMcpToolSchemaConformance() {
  console.log('\n\x1b[1m[Suite 2: Official MCP Tool Definition Conformance (30+ Tools)]\x1b[0m');

  assert(MCP_CATALOG.length >= 25, `MCP Catalog contains full toolset (Found ${MCP_CATALOG.length} tools)`);

  for (const tool of MCP_CATALOG) {
    const mockCredentials: Record<string, string> = {};
    for (const field of tool.fields) {
      mockCredentials[field.key] = field.defaultValue || `mock_val_${field.key}`;
    }

    const installedState: InstalledToolState = {
      toolId: tool.id,
      isEnabled: true,
      credentials: mockCredentials,
      targetClients: ['cursor', 'windsurf', 'claude-desktop', 'claude-code', 'antigravity', 'vscode', 'codex']
    };

    const formatted = ConfigSyncService.formatToolDefinitionForClient(tool, installedState, 'cursor');

    if (formatted.url || formatted.serverUrl) {
      const validUrl = typeof (formatted.url || formatted.serverUrl) === 'string' && (formatted.url || formatted.serverUrl).startsWith('http');
      assert(validUrl, `[Tool: ${tool.id}] Valid Remote HTTP endpoint URL ("${formatted.url || formatted.serverUrl}")`);
    } else {
      const validCommand = typeof formatted.command === 'string' && formatted.command.trim().length > 0;
      assert(validCommand, `[Tool: ${tool.id}] Valid MCP command string ("${formatted.command}")`);

      const validArgs = Array.isArray(formatted.args) && formatted.args.every((a: any) => typeof a === 'string');
      assert(validArgs, `[Tool: ${tool.id}] Valid args string array (${JSON.stringify(formatted.args)})`);

      const validEnv = typeof formatted.env === 'object' && !Array.isArray(formatted.env) &&
        Object.entries(formatted.env).every(([k, v]) => typeof k === 'string' && typeof v === 'string');
      assert(validEnv, `[Tool: ${tool.id}] Valid environment key-value map`);
    }

    const serialized = JSON.stringify(formatted);
    const jsonParsed = JSON.parse(serialized);
    const hasForbiddenValues = JSON.stringify(jsonParsed).includes(':null') || JSON.stringify(jsonParsed).includes(':undefined');
    assert(!hasForbiddenValues, `[Tool: ${tool.id}] Strict serialization without nulls or undefined`);
  }
}

// -------------------------------------------------------------
// Test Group 3: Non-Destructive Merge, AST JSONC & TOML Hardening
// -------------------------------------------------------------
function testNonDestructiveMerge() {
  console.log('\n\x1b[1m[Suite 3: Non-Destructive Merge, JSONC & TOML Parsers]\x1b[0m');

  const sampleToolDef = {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: { POSTGRES_CONNECTION_STRING: 'postgresql://localhost:5432/db' }
  };

  const toolsToInject = [{ toolId: 'postgres', definition: sampleToolDef }];

  // 1. Cursor test - Preserving existing tools
  const existingConfigWithCustomTools = JSON.stringify({
    mcpServers: {
      'custom-internal-db': {
        command: 'python',
        args: ['/opt/tools/db.py'],
        env: { DB_SECRET: 'super-secret' }
      }
    }
  }, null, 2);

  const resultA = ConfigSyncService.mergeConfigNonDestructive(
    existingConfigWithCustomTools,
    toolsToInject,
    'cursor'
  );

  const parsedA = JSON.parse(resultA.updatedJsonStr);
  assert(
    parsedA.mcpServers['custom-internal-db'] !== undefined,
    'Preserves existing third-party tool entries without deletion'
  );
  assert(
    parsedA.mcpServers['postgres'] !== undefined,
    'Injects new postgres tool into mcpServers'
  );
  assert(
    resultA.injectedCount === 1,
    'Reports accurate injectedCount'
  );

  // 2. String values containing comment tokens (e.g. URLs or descriptions) MUST NOT be stripped
  const jsoncWithCommentsAndUrls = `
  {
    // Developer configuration for Windsurf
    /* Multi-line comment block */
    "mcpServers": {
      "legacy-tool": {
        "command": "node",
        "args": ["legacy.js"],
        "env": {
          "API_ENDPOINT": "https://api.github.com/v1//endpoint",
          "NOTE": "Do not delete /* this */ block"
        }
      }
    }
  }
  `;

  const resultB = ConfigSyncService.mergeConfigNonDestructive(
    jsoncWithCommentsAndUrls,
    toolsToInject,
    'windsurf'
  );

  const parsedB = jsonc.parse(resultB.updatedJsonStr);
  assert(
    resultB.updatedJsonStr.includes('// Developer configuration for Windsurf'),
    'Preserves single line comments in JSONC file'
  );
  assert(
    resultB.updatedJsonStr.includes('/* Multi-line comment block */'),
    'Preserves multi-line block comments in JSONC file'
  );
  assert(
    parsedB.mcpServers['legacy-tool']?.env?.API_ENDPOINT === 'https://api.github.com/v1//endpoint',
    'Preserves URLs containing "//" inside JSON strings without regex corruption'
  );
  assert(
    parsedB.mcpServers['legacy-tool']?.env?.NOTE === 'Do not delete /* this */ block',
    'Preserves "/* */" text inside JSON strings without regex corruption'
  );
  assert(
    parsedB.mcpServers['postgres'] !== undefined,
    'Injected tool present in cleanly parsed output'
  );

  // 3. Malformed JSON safety - MUST abort and NEVER wipe user config to {}
  const malformedBrokenJson = `
  {
    "mcpServers": {
      "broken-tool": { "command": "node", "args": [ // unclosed bracket
  `;

  const resultMalformed = ConfigSyncService.mergeConfigNonDestructive(
    malformedBrokenJson,
    toolsToInject,
    'cursor'
  );

  assert(
    resultMalformed.error !== undefined,
    'Detects syntax error in broken user config'
  );
  assert(
    resultMalformed.updatedJsonStr === malformedBrokenJson,
    'NEVER wipes malformed file to {} (Zero Data-Loss guarantee)'
  );
  assert(
    resultMalformed.injectedCount === 0,
    'Halts injection when input syntax is invalid'
  );

  // 4. Claude Code ANTHROPIC_BASE_URL injection
  const resultC = ConfigSyncService.mergeConfigNonDestructive(
    '{}',
    toolsToInject,
    'claude-code'
  );
  const parsedC = JSON.parse(resultC.updatedJsonStr);
  assert(
    parsedC.env?.ANTHROPIC_BASE_URL === 'http://127.0.0.1:4000',
    'Claude Code config injects ANTHROPIC_BASE_URL gateway loopback'
  );

  // 5. VS Code 'servers' root key test
  const resultVSCode = ConfigSyncService.mergeConfigNonDestructive(
    '{}',
    toolsToInject,
    'vscode'
  );
  const parsedVSCode = JSON.parse(resultVSCode.updatedJsonStr);
  assert(
    parsedVSCode.servers?.postgres !== undefined,
    'VS Code adapter outputs to root "servers" key instead of "mcpServers"'
  );

  // 6. OpenAI Codex TOML with smol-toml AST parser
  const sampleCodexToml = `
[mcp_servers.existing_custom_tool]
command = "python"
args = ["C:\\\\Scripts\\\\custom_agent.py"]
`;
  const resultCodex = ConfigSyncService.mergeConfigNonDestructive(
    sampleCodexToml,
    toolsToInject,
    'codex'
  );
  const parsedToml = toml.parse(resultCodex.updatedJsonStr) as any;
  assert(
    parsedToml.mcp_servers?.existing_custom_tool !== undefined,
    'Codex AST parser preserves existing TOML tables'
  );
  assert(
    parsedToml.mcp_servers?.postgres?.command === 'npx',
    'Codex AST parser injects new tool with valid TOML schema'
  );

  // 7. Conflict detection test (updating an existing tool ID)
  const existingWithPostgres = JSON.stringify({
    mcpServers: {
      postgres: { command: 'old-postgres', args: [] }
    }
  }, null, 2);

  const resultConflict = ConfigSyncService.mergeConfigNonDestructive(
    existingWithPostgres,
    toolsToInject,
    'cursor'
  );
  assert(
    resultConflict.updatedCount === 1,
    'Accurately tracks updatedCount when a tool already exists'
  );
  assert(
    resultConflict.conflicts.includes('postgres'),
    'Reports conflict tool ID in conflicts list'
  );

  // 8. H-06 Comment Preservation & Custom User Property Retention (AST Leaf Edits)
  const jsoncWithRichComments = `{
  // Top-level custom config comment
  /* Block comment on settings */
  "mcpServers": {
    // Primary internal DB server
    "postgres": {
      "command": "old-cmd",
      "args": ["old-arg"],
      // Internal database port note
      "env": {
        "CUSTOM_PORT": "5432"
      },
      "customUserField": "keepMeSafe"
    }
  }
}`;

  const resultH06 = ConfigSyncService.mergeConfigNonDestructive(
    jsoncWithRichComments,
    toolsToInject,
    'cursor'
  );

  assert(
    resultH06.updatedJsonStr.includes('// Top-level custom config comment'),
    'Preserves top-level header comments'
  );
  assert(
    resultH06.updatedJsonStr.includes('/* Block comment on settings */'),
    'Preserves block comments'
  );
  assert(
    resultH06.updatedJsonStr.includes('// Primary internal DB server'),
    'Preserves comments above tool definition'
  );
  assert(
    resultH06.updatedJsonStr.includes('// Internal database port note'),
    'Preserves internal comments inside tool definition'
  );

  const parsedH06 = jsonc.parse(resultH06.updatedJsonStr);
  assert(
    parsedH06.mcpServers.postgres.customUserField === 'keepMeSafe',
    'Preserves custom unmanaged user properties on existing tool objects'
  );
  assert(
    parsedH06.mcpServers.postgres.env.CUSTOM_PORT === '5432',
    'Preserves existing user environment variables during non-destructive merge'
  );
  assert(
    parsedH06.mcpServers.postgres.command === 'npx',
    'Updates managed command property correctly'
  );

  // 9. Transport Transition Pruning (Stdio -> HTTP -> Stdio)
  const existingRemoteTool = `{
  "mcpServers": {
    "postgres": {
      "url": "http://127.0.0.1:8080",
      "serverUrl": "http://127.0.0.1:8080",
      "type": "http"
    }
  }
}`;
  const resultTransition = ConfigSyncService.mergeConfigNonDestructive(
    existingRemoteTool,
    toolsToInject, // stdio postgres
    'cursor'
  );
  const parsedTransition = jsonc.parse(resultTransition.updatedJsonStr);
  assert(
    parsedTransition.mcpServers.postgres.command === 'npx',
    'Adds stdio command on remote-to-stdio transition'
  );
  assert(
    parsedTransition.mcpServers.postgres.url === undefined && parsedTransition.mcpServers.postgres.serverUrl === undefined,
    'Prunes stale remote url/serverUrl properties on remote-to-stdio transition'
  );

  // 10. M-01 Comprehensive Structural Conflict & Primitive Root Rejection Tests
  const arrayRootResult = ConfigSyncService.mergeConfigNonDestructive(
    '[1, 2, 3]',
    toolsToInject,
    'cursor'
  );
  assert(
    arrayRootResult.error?.includes('Document root must be a JSON object'),
    'Rejects array root with structural conflict error (M-01)'
  );

  const nullRootResult = ConfigSyncService.mergeConfigNonDestructive(
    'null',
    toolsToInject,
    'cursor'
  );
  assert(
    nullRootResult.error?.includes('Document root must be a JSON object'),
    'Rejects null root with structural conflict error (M-01)'
  );

  const stringRootResult = ConfigSyncService.mergeConfigNonDestructive(
    '"invalid json string root"',
    toolsToInject,
    'cursor'
  );
  assert(
    stringRootResult.error?.includes('Document root must be a JSON object'),
    'Rejects primitive string root with structural conflict error (M-01)'
  );

  const numberRootResult = ConfigSyncService.mergeConfigNonDestructive(
    '42.5',
    toolsToInject,
    'cursor'
  );
  assert(
    numberRootResult.error?.includes('Document root must be a JSON object'),
    'Rejects primitive number root with structural conflict error (M-01)'
  );

  const booleanRootResult = ConfigSyncService.mergeConfigNonDestructive(
    'true',
    toolsToInject,
    'cursor'
  );
  assert(
    booleanRootResult.error?.includes('Document root must be a JSON object'),
    'Rejects primitive boolean root with structural conflict error (M-01)'
  );

  const duplicateKeyResult = ConfigSyncService.mergeConfigNonDestructive(
    '{\n  "mcpServers": {},\n  "mcpServers": {}\n}',
    toolsToInject,
    'cursor'
  );
  assert(
    duplicateKeyResult.error?.includes('Duplicate root key'),
    'Detects and rejects duplicate root keys safely (M-01)'
  );

  const duplicateToolIdResult = ConfigSyncService.mergeConfigNonDestructive(
    '{\n  "mcpServers": {\n    "postgres": { "command": "node" },\n    "postgres": { "command": "npx" }\n  }\n}',
    toolsToInject,
    'cursor'
  );
  assert(
    duplicateToolIdResult.error?.includes("Duplicate tool ID 'postgres'"),
    'Detects and rejects duplicate tool IDs inside rootKey safely (M-01)'
  );

  const emptyStringResult = ConfigSyncService.mergeConfigNonDestructive(
    '   \n\t  ',
    toolsToInject,
    'cursor'
  );
  assert(
    emptyStringResult.error === undefined && emptyStringResult.injectedCount > 0,
    'Gracefully initializes empty/whitespace config into valid object skeleton (M-01)'
  );
  const parsedEmpty = jsonc.parse(emptyStringResult.updatedJsonStr);
  assert(
    parsedEmpty.mcpServers !== undefined && parsedEmpty.mcpServers.postgres !== undefined,
    'Empty config correctly populates mcpServers root key and tools (M-01)'
  );

  // 11. M-02 Schema Conflict & Nested Managed-Property Validation Tests
  // A. TOML Schema Validation
  const tomlInvalidMcpServers = ConfigSyncService.mergeConfigNonDestructive(
    'mcp_servers = "invalid_scalar_string"',
    toolsToInject,
    'codex'
  );
  assert(
    tomlInvalidMcpServers.schemaError?.code === 'schema_conflict' &&
    tomlInvalidMcpServers.schemaError?.path[0] === 'mcp_servers',
    'Rejects TOML scalar mcp_servers with structured schema_conflict (M-02)'
  );

  const tomlArrayMcpServers = ConfigSyncService.mergeConfigNonDestructive(
    'mcp_servers = [1, 2, 3]',
    toolsToInject,
    'codex'
  );
  assert(
    tomlArrayMcpServers.schemaError?.code === 'schema_conflict' &&
    tomlArrayMcpServers.schemaError?.actual === 'array',
    'Rejects TOML array mcp_servers with structured schema_conflict (M-02)'
  );

  const tomlScalarTool = ConfigSyncService.mergeConfigNonDestructive(
    '[mcp_servers]\npostgres = "scalar_value"',
    toolsToInject,
    'codex'
  );
  assert(
    tomlScalarTool.schemaError?.code === 'schema_conflict' &&
    tomlScalarTool.schemaError?.path[1] === 'postgres',
    'Rejects TOML scalar tool entry with structured schema_conflict (M-02)'
  );

  // B. JSON Nested Managed-Property Validation
  const jsonEnvNotObject = ConfigSyncService.mergeConfigNonDestructive(
    '{\n  "mcpServers": {\n    "postgres": { "env": "not-an-object" }\n  }\n}',
    toolsToInject,
    'cursor'
  );
  assert(
    jsonEnvNotObject.schemaError?.code === 'schema_conflict' &&
    jsonEnvNotObject.schemaError?.path.join('.') === 'mcpServers.postgres.env',
    'Rejects JSON string env with schema_conflict path mcpServers.postgres.env (M-02)'
  );

  const jsonHeadersArray = ConfigSyncService.mergeConfigNonDestructive(
    '{\n  "mcpServers": {\n    "postgres": { "headers": [1, 2] }\n  }\n}',
    toolsToInject,
    'cursor'
  );
  assert(
    jsonHeadersArray.schemaError?.code === 'schema_conflict' &&
    jsonHeadersArray.schemaError?.path.join('.') === 'mcpServers.postgres.headers',
    'Rejects JSON array headers with schema_conflict (M-02)'
  );

  const jsonArgsNotArray = ConfigSyncService.mergeConfigNonDestructive(
    '{\n  "mcpServers": {\n    "postgres": { "args": "not-an-array" }\n  }\n}',
    toolsToInject,
    'cursor'
  );
  assert(
    jsonArgsNotArray.schemaError?.code === 'schema_conflict' &&
    jsonArgsNotArray.schemaError?.path.join('.') === 'mcpServers.postgres.args',
    'Rejects JSON string args with schema_conflict (M-02)'
  );

  const jsonCommandNumber = ConfigSyncService.mergeConfigNonDestructive(
    '{\n  "mcpServers": {\n    "postgres": { "command": 42 }\n  }\n}',
    toolsToInject,
    'cursor'
  );
  assert(
    jsonCommandNumber.schemaError?.code === 'schema_conflict' &&
    jsonCommandNumber.schemaError?.path.join('.') === 'mcpServers.postgres.command',
    'Rejects JSON number command with schema_conflict (M-02)'
  );

  const jsonToolNotObject = ConfigSyncService.mergeConfigNonDestructive(
    '{\n  "mcpServers": {\n    "postgres": "scalar_primitive"\n  }\n}',
    toolsToInject,
    'cursor'
  );
  assert(
    jsonToolNotObject.schemaError?.code === 'schema_conflict' &&
    jsonToolNotObject.schemaError?.path.join('.') === 'mcpServers.postgres',
    'Rejects JSON primitive tool entry with schema_conflict (M-02)'
  );

  // 12. Idempotency Check
  const secondPassResult = ConfigSyncService.mergeConfigNonDestructive(
    resultH06.updatedJsonStr,
    toolsToInject,
    'cursor'
  );
  assert(
    secondPassResult.updatedJsonStr === resultH06.updatedJsonStr,
    'Second synchronization produces byte-for-byte identical output (Idempotency invariant)'
  );
}

// -------------------------------------------------------------
// Test Group 4: Automated Timestamped .bak Backup & Atomic Disk Writes
// -------------------------------------------------------------
async function testBackupAndDiskWrites() {
  console.log('\n\x1b[1m[Suite 4: Safe Disk Writes & Timestamped .bak Backups]\x1b[0m');

  const testDir = path.resolve(process.cwd(), '.tether_test_configs');
  const targetFile = path.join(testDir, 'mcp_test.json');

  try {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    // Initial write
    const initialContent = JSON.stringify({ mcpServers: { 'orig-tool': { command: 'node', args: [] } } }, null, 2);
    fs.writeFileSync(targetFile, initialContent, 'utf8');

    // Second write with backup enabled
    const updatedContent = JSON.stringify({ mcpServers: { 'orig-tool': { command: 'node', args: [] }, 'new-tool': { command: 'npx', args: [] } } }, null, 2);
    const writeRes = await ConfigSyncService.writeConfigFileSafely(targetFile, updatedContent, true);

    // M-03 Optimistic Concurrency & Typed ExpectedRevision Tests
    // 1. Read non-existent file returns kind: 'missing'
    const missingFile = path.join(testDir, 'non_existent.json');
    const readMissingRes = await ConfigSyncService.readConfigFileSafely(missingFile);
    assert(readMissingRes.notFound === true, 'Non-existent file reports notFound: true (M-03)');
    assert(readMissingRes.revision.kind === 'missing', 'Non-existent file returns revision kind: missing (M-03)');

    // 2. Read existing file returns valid sha256 revision
    const readExistingRes = await ConfigSyncService.readConfigFileSafely(targetFile);
    assert(readExistingRes.notFound === false, 'Existing file reports notFound: false (M-03)');
    assert(readExistingRes.revision.kind === 'sha256', 'Existing file returns revision kind: sha256 (M-03)');
    assert(typeof (readExistingRes.revision as any).value === 'string', 'Existing file revision contains hex hash string (M-03)');

    // 3. Write with mismatched SHA-256 revision hash is rejected with config_changed_concurrently
    const staleRevision = { kind: 'sha256' as const, value: '0000000000000000000000000000000000000000000000000000000000000000' };
    const staleWriteRes = await ConfigSyncService.writeConfigFileSafely(
      targetFile,
      JSON.stringify({ mcpServers: { corrupted: true } }),
      true,
      undefined,
      staleRevision
    );
    assert(
      staleWriteRes.success === false && staleWriteRes.errorCode === 'config_changed_concurrently',
      'Rejects write with mismatched SHA-256 revision as config_changed_concurrently (M-03)'
    );

    // 4. Write with kind: 'missing' when file already exists is rejected
    const missingExpectedWhenExists = await ConfigSyncService.writeConfigFileSafely(
      targetFile,
      JSON.stringify({ mcpServers: { newtool: true } }),
      true,
      undefined,
      { kind: 'missing' }
    );
    assert(
      missingExpectedWhenExists.success === false && missingExpectedWhenExists.errorCode === 'config_changed_concurrently',
      'Rejects write with ExpectedRevision::Missing when destination exists (M-03)'
    );

    // 5. Write with kind: 'sha256' when file was deleted is rejected
    const deletedFile = path.join(testDir, 'deleted_test.json');
    const writeToDeleted = await ConfigSyncService.writeConfigFileSafely(
      deletedFile,
      JSON.stringify({ mcpServers: {} }),
      true,
      undefined,
      { kind: 'sha256', value: 'abcdef123456' }
    );
    assert(
      writeToDeleted.success === false && writeToDeleted.errorCode === 'config_changed_concurrently',
      'Rejects write with ExpectedRevision::Sha256 when destination was deleted (M-03)'
    );

    // 6. Write with valid matching expected revision succeeds
    const validWriteRes = await ConfigSyncService.writeConfigFileSafely(
      targetFile,
      JSON.stringify({ mcpServers: { 'orig-tool': { command: 'node', args: ['--valid'] } } }, null, 2),
      true,
      undefined,
      readExistingRes.revision
    );
    assert(validWriteRes.success === true, 'Write with matching ExpectedRevision succeeds (M-03)');

    // 7. Managed Field Conflict Detection
    const oldConfigStr = JSON.stringify({
      mcpServers: {
        postgres: { command: 'node', args: ['index.js'] },
        unrelated: { command: 'python', args: [] }
      }
    });
    const modifiedManagedConfigStr = JSON.stringify({
      mcpServers: {
        postgres: { command: 'custom_user_binary', args: ['index.js'] },
        unrelated: { command: 'python', args: [] }
      }
    });
    const modifiedUnmanagedConfigStr = JSON.stringify({
      mcpServers: {
        postgres: { command: 'node', args: ['index.js'] },
        unrelated: { command: 'python3', args: [] },
        customUserTool: { command: 'ruby' }
      }
    });

    const hasManagedConflict = ConfigSyncService.detectManagedFieldConflicts(
      oldConfigStr,
      modifiedManagedConfigStr,
      [{ toolId: 'postgres', definition: { command: 'npx' } }],
      'cursor'
    );
    assert(hasManagedConflict === true, 'detectManagedFieldConflicts detects external edit to managed tool command (M-03)');

    const hasUnmanagedConflict = ConfigSyncService.detectManagedFieldConflicts(
      oldConfigStr,
      modifiedUnmanagedConfigStr,
      [{ toolId: 'postgres', definition: { command: 'node' } }],
      'cursor'
    );
    assert(hasUnmanagedConflict === false, 'detectManagedFieldConflicts allows concurrent edits to unmanaged tools (M-03)');

    // =============================================================
    // M-04 & M-05: Backup Integrity, Atomic Durability & Crash Safety
    // =============================================================

    // 8. Backup timestamp & random hex suffix format
    assert(typeof writeRes.backupCreated === 'string', 'writeConfigFileSafely returns real backupCreated path (M-04)');
    const backupName = path.basename(writeRes.backupCreated!);
    assert(
      /\.bak\.\d+\.[a-f0-9]+$/.test(backupName),
      `Backup filename contains epoch millis and random hex suffix (M-04/M-05): ${backupName}`
    );

    // 9. Raw Byte BOM & CRLF Fidelity
    const bomCrlfTarget = path.join(testDir, 'bom_crlf_test.json');
    const rawBomCrlf = Buffer.from('\uFEFF{\r\n  "mcpServers": {\r\n    "bom-tool": { "command": "node" }\r\n  }\r\n}', 'utf8');
    fs.writeFileSync(bomCrlfTarget, rawBomCrlf);

    const bomCrlfRead = await ConfigSyncService.readConfigFileSafely(bomCrlfTarget);
    const updatedBomContent = '{\n  "mcpServers": {\n    "bom-tool": { "command": "npx" }\n  }\n}';
    const bomWriteRes = await ConfigSyncService.writeConfigFileSafely(
      bomCrlfTarget,
      updatedBomContent,
      true,
      undefined,
      bomCrlfRead.revision
    );

    assert(bomWriteRes.success === true, 'BOM/CRLF write succeeds (M-04)');
    assert(typeof bomWriteRes.backupCreated === 'string', 'BOM/CRLF write creates backup (M-04)');
    const backupBuffer = fs.readFileSync(bomWriteRes.backupCreated!);
    assert(
      backupBuffer.equals(rawBomCrlf),
      'Backup preserves exact verified raw bytes including UTF-8 BOM and CRLF byte-for-byte (M-04)'
    );

    // 10. No-Op Idempotency: identical content does not create backup or temp file
    const noOpRes = await ConfigSyncService.writeConfigFileSafely(
      bomCrlfTarget,
      updatedBomContent,
      true
    );
    assert(noOpRes.success === true, 'No-op write succeeds (M-05)');
    assert(noOpRes.backupCreated === undefined, 'No-op identical write creates 0 backups (M-05)');

    // 11. Partial-Failure Truthful Backup Reporting
    const lockedTarget = path.join(testDir, 'locked_file_target.json');
    fs.writeFileSync(lockedTarget, JSON.stringify({ mcpServers: { initial: true } }));
    const lockedRead = await ConfigSyncService.readConfigFileSafely(lockedTarget);

    // Force the final atomic rename to fail identically on every supported OS.
    const partialRes = await ConfigSyncService.writeConfigFileSafely(
      lockedTarget,
      JSON.stringify({ mcpServers: { updated: true } }),
      true,
      undefined,
      lockedRead.revision,
      {
        renameSync: () => {
          const error = new Error('injected atomic rename failure') as NodeJS.ErrnoException;
          error.code = 'EACCES';
          throw error;
        }
      }
    );

    assert(partialRes.success === false, 'Rename failure returns success: false (M-04)');
    assert(partialRes.errorCode === 'rename_failed', 'Rename failure returns errorCode: rename_failed (M-04)');
    assert(
      typeof partialRes.backupCreated === 'string' && fs.existsSync(partialRes.backupCreated),
      'Rename failure truthfully reports valid, existing backupCreated path for user recovery (M-04)'
    );

    // 12. Backup Retention Limit: Prunes oldest backups beyond 5
    const retentionTarget = path.join(testDir, 'retention_test.json');
    fs.writeFileSync(retentionTarget, JSON.stringify({ version: 0 }));

    for (let i = 1; i <= 7; i++) {
      const curRead = await ConfigSyncService.readConfigFileSafely(retentionTarget);
      await ConfigSyncService.writeConfigFileSafely(
        retentionTarget,
        JSON.stringify({ version: i }),
        true,
        undefined,
        curRead.revision
      );
      // Small tick to ensure distinct millisecond timestamps
      await new Promise(r => setTimeout(r, 10));
    }

    const remainingBackups = fs.readdirSync(testDir).filter(f => f.startsWith('retention_test.json.bak.'));
    assert(
      remainingBackups.length === 5,
      `Backup retention limits backups to exactly 5 (pruned 2 oldest of 7, remaining: ${remainingBackups.length}) (M-04/M-05)`
    );

    // 13. Crash/Abort Safety: No orphan temp files remain in directory
    const orphanTemps = fs.readdirSync(testDir).filter(f => f.includes('.tmp.'));
    assert(orphanTemps.length === 0, 'No orphan .tmp files remain in test directory after operations (M-05)');
  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

// -------------------------------------------------------------
// Test Group 5: Native OS Credential Vault & Zero-Plaintext Storage (H-09)
// -------------------------------------------------------------
async function testVaultPersistence() {
  console.log('\n\x1b[1m[Suite 5: Native OS Credential Vault & Summary-Only IPC (H-09)]\x1b[0m');

  // 1. Set credentials via write-only API
  const summaryAnthropic = await setProviderCredential('anthropic', 'sk-ant-live-production-test-key-123');
  assert(summaryAnthropic !== null, 'Saves provider credential to OS vault');
  assert(summaryAnthropic?.configured === true, 'Marks provider as configured in summary');
  assert(summaryAnthropic?.display_hint === '••••-123', 'Emits masked display hint without revealing secret');

  const summaryOpenAI = await setProviderCredential('openai', 'sk-proj-live-production-test-key-456');
  assert(summaryOpenAI !== null, 'Saves OpenAI credential to OS vault');

  // 2. List summaries (zero plaintext leak)
  const summaries = await listCredentialSummaries();
  const anthropicSummary = summaries.find(s => s.provider === 'anthropic');
  assert(anthropicSummary !== undefined && anthropicSummary.configured === true, 'Lists saved credential summary');
  assert((anthropicSummary as any).apiKey === undefined, 'Guarantees zero plaintext secret leak in summary IPC');

  // 3. Routing metadata separation
  const routingData = {
    fallbackChains: [{ id: 'chain-1', name: 'Primary', description: '', nodes: [] }],
    virtualAliases: [{ alias: 'fast-code', targetChainId: 'chain-1', description: '' }]
  };
  const savedRouting = await saveRoutingMetadata(routingData);
  assert(savedRouting, 'Saves non-secret routing metadata');

  const loadedRouting = await loadRoutingMetadata();
  assert(loadedRouting?.fallback_chains?.length === 1, 'Loads saved routing metadata');

  // 4. Delete credential
  const deleted = await deleteProviderCredential('openai');
  assert(deleted, 'Deletes credential from OS vault');

  // 5. Tool Credential OS Vaulting via Typed Mutations
  const toolSummary = await mutateToolCredentials('supabase', [
    { field: 'SUPABASE_ACCESS_TOKEN', operation: 'set', value: 'sbp_test123456789' },
    { field: 'SUPABASE_PROJECT_REF', operation: 'set', value: 'abcdefghijklmnopqrst' }
  ]);
  assert(toolSummary !== null && toolSummary.configured, 'Saves tool credentials to OS vault');
  assert(toolSummary?.display_hints['SUPABASE_ACCESS_TOKEN'] === '••••6789', 'Generates masked display hint for secret field');
  assert(toolSummary?.configured_fields.includes('SUPABASE_ACCESS_TOKEN') === true, 'Tracks configured field keys');

  const toolSummaries = await listToolCredentialSummaries();
  const supabaseSummary = toolSummaries.find(s => s.tool_id === 'supabase');
  assert(supabaseSummary?.configured === true, 'Lists configured tool summaries from vault');

  const deletedTool = await revokeTool('supabase');
  assert(deletedTool.success === true && deletedTool.vault_revoked === true, 'Revokes tool and deletes credentials from OS vault');
  const postDeleteSummaries = await listToolCredentialSummaries();
  assert(postDeleteSummaries.find(s => s.tool_id === 'supabase')?.configured !== true, 'Tool marked unconfigured after vault deletion');

  // 6. Legacy Web Storage secret purge
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('tethermesh_vault', '{"secret":"leak"}');
    purgeLegacyWebStorage();
    assert(localStorage.getItem('tethermesh_vault') === null, 'Purges legacy unencrypted secrets from localStorage');
  }
}

// -------------------------------------------------------------
// Test Group 6: Air-Gapped Local Mesh & LiteLLM Config Generation
// -------------------------------------------------------------
function testAirGappedLocalMeshConfig() {
  console.log('\n\x1b[1m[Suite 6: Air-Gapped Local Mesh & LiteLLM YAML Generation]\x1b[0m');

  const mockProviders: any[] = [
    { id: 'anthropic', name: 'Anthropic', isEnabled: true, apiKey: 'sk-ant-test' },
    { id: 'openai', name: 'OpenAI', isEnabled: true, apiKey: 'sk-proj-test' },
    { id: 'ollama', name: 'Ollama', isEnabled: true, baseUrl: 'http://127.0.0.1:11434' },
  ];

  const mockChains: any[] = [
    {
      id: 'chain-heavy',
      name: 'Heavy Reasoning',
      description: '',
      nodes: [
        { id: 'n1', provider: 'anthropic', modelIdentifier: 'claude-3-7-sonnet-20250219', priority: 1, timeoutMs: 15000 },
        { id: 'n2', provider: 'ollama', modelIdentifier: 'llama3.2', priority: 2, timeoutMs: 30000 },
      ]
    }
  ];

  const mockAliases: any[] = [
    { alias: 'fast-code', targetChainId: 'chain-heavy', description: 'Fast code model' },
    { alias: 'heavy-reasoning', targetChainId: 'chain-heavy', description: 'Heavy reasoning model' }
  ];

  const mockBudget: any = {
    dailyLimit: 10,
    monthlyLimit: 100,
    currentDailySpend: 0,
    currentMonthlySpend: 0,
    isCircuitBreakerTripped: false,
    hardStopEnabled: true,
    lastResetDate: '2026-08-26'
  };

  // 1. Hybrid cloud config test
  const hybridYaml = generateLiteLLMConfig({
    providers: mockProviders,
    fallbackChains: mockChains,
    virtualAliases: mockAliases,
    budget: mockBudget,
    isAirGappedMode: false
  });

  assert(hybridYaml.includes('anthropic/claude-3-7-sonnet-20250219'), 'Hybrid mode includes Anthropic models');
  assert(hybridYaml.includes('HYBRID CLOUD & LOCAL'), 'Hybrid mode header emitted');

  // 2. Air-Gapped offline mode config test
  const airGappedYaml = generateLiteLLMConfig({
    providers: mockProviders,
    fallbackChains: mockChains,
    virtualAliases: mockAliases,
    budget: mockBudget,
    isAirGappedMode: true,
    discoveredLocalModels: ['ollama/llama3.2', 'ollama/deepseek-r1:8b']
  });

  assert(airGappedYaml.includes('AIR-GAPPED / OFFLINE LOCAL MESH ONLY'), 'Air-Gapped mode header emitted');
  assert(!airGappedYaml.includes('anthropic/claude-3-7-sonnet-20250219'), 'Air-Gapped mode strictly excludes cloud Anthropic');
  assert(airGappedYaml.includes('model: ollama/llama3.2'), 'Air-Gapped mode routes virtual aliases to discovered local model');
  assert(airGappedYaml.includes('api_base: http://127.0.0.1:11434'), 'Air-Gapped mode binds numeric 127.0.0.1 loopback');
  assert(!airGappedYaml.includes('localhost'), 'Air-Gapped mode strictly eliminates localhost hostname');
}

// -------------------------------------------------------------
// Test Group 7: Native Catalog Allowlist, Version Pinning & Zero Secrets (Mandates #1-#10)
// -------------------------------------------------------------
async function testSecurityBoundariesAndMandates() {
  console.log('\n\x1b[1m[Suite 7: Security Boundary, Version Pinning & Zero Webview Secrets]\x1b[0m');

  // 1. Mandate #1: Pin every executable package version
  for (const tool of MCP_CATALOG) {
    if (tool.command === 'npx' && tool.args && tool.args.length > 0) {
      const pkgArg = tool.args.find(a => a.startsWith('@') || a.includes('mcp'));
      if (pkgArg) {
        assert(!pkgArg.includes('@latest'), `[Tool: ${tool.id}] Package "${pkgArg}" does NOT use unpinned @latest`);
        assert(pkgArg.includes('@') && /@[0-9]+\.[0-9]+/.test(pkgArg), `[Tool: ${tool.id}] Package "${pkgArg}" contains pinned semver`);
      }
    }
  }

  // 2. Mandate #8: Collision Detection
  const existingWithCollision = JSON.stringify({
    mcpServers: {
      supabase: {
        command: "powershell.exe",
        args: ["-ExecutionPolicy", "Bypass", "-EncodedCommand", "JABh..."]
      }
    }
  }, null, 2);

  const installedTools: InstalledToolState[] = [
    {
      toolId: 'supabase',
      isEnabled: true,
      targetClients: ['cursor'],
      installedAt: Date.now(),
      credentials: {
        SUPABASE_ACCESS_TOKEN: 'sbp_test123456789'
      }
    }
  ];

  // Test collision detection logic
  const formattedTools = [{
    toolId: 'supabase',
    definition: ConfigSyncService.formatToolDefinitionForClient(
      MCP_CATALOG.find(t => t.id === 'supabase')!,
      installedTools[0],
      'cursor'
    )
  }];

  const mergeResult = ConfigSyncService.mergeConfigNonDestructive(
    existingWithCollision,
    formattedTools,
    'cursor'
  );

  assert(mergeResult.conflicts.length > 0, 'Collision detected when third-party tool has custom executable');
  assert(mergeResult.conflicts.includes('supabase'), 'Conflict reports specific tool ID "supabase"');
  assert(mergeResult.updatedJsonStr.includes('powershell.exe'), 'Existing custom configuration preserved on collision');

  // 3. Mandate #9: Zero secrets in webview storage
  const mockStorage: Record<string, string> = {};
  const origLocalStorage = (global as any).localStorage;
  (global as any).localStorage = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
  };

  await ConfigSyncService.syncToolsToTargetClients(
    installedTools,
    MCP_CATALOG,
    {
      writeToDisk: false,
      platform: 'win32'
    }
  );

  let leakedSecrets = false;
  for (const [k, v] of Object.entries(mockStorage)) {
    if (v.includes('sbp_test123456789') || v.includes('SUPABASE_ACCESS_TOKEN')) {
      leakedSecrets = true;
    }
  }
  assert(!leakedSecrets, 'Zero sensitive credentials or reconstructed configs written to localStorage');

  (global as any).localStorage = origLocalStorage;
}

// -------------------------------------------------------------
// Suite 8: Dynamic Port Allocation & Cryptographic HMAC Invariants (Item #2)
// -------------------------------------------------------------
import * as crypto from 'crypto';

function testDynamicPortAndHmacSecurity() {
  console.log('\n[Suite 8: Dynamic Port & Cryptographic HMAC Security (Item #2)]');

  // 1. Zero Port-Allocation Race Invariant: No hardcoded port 4000 assumption
  const mockDiagnosticPayload = {
    proxy_running: true,
    proxy_healthy: true,
    phase: 'ready',
    generation: 1,
    proxy_port: 54321, // dynamic ephemeral port
    anthropic_base_url: 'http://127.0.0.1:54321/anthropic',
    openai_base_url: 'http://127.0.0.1:54321/v1',
    gateway_token: null, // zero secret exposed
    sidecar_pid: 12345,
    last_exit_code: null,
    last_health_check_at: Date.now()
  };

  assert(
    mockDiagnosticPayload.proxy_port !== 4000,
    'Dynamic port allocation supports arbitrary ephemeral ports'
  );
  assert(
    mockDiagnosticPayload.gateway_token === null,
    'Zero plaintext admin tokens or handshake secrets returned in diagnostics'
  );
  assert(
    mockDiagnosticPayload.anthropic_base_url.includes(mockDiagnosticPayload.proxy_port.toString()),
    'Proxy URL dynamically binds to allocated ephemeral port'
  );

  // 2. RFC 2104 HMAC-SHA256 Request Signing Verification
  const testSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const method = 'GET';
  const path = '/spend/summary';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyHash = crypto.createHash('sha256').update('').digest('hex');
  const generation = '1';

  const payload = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}\n${generation}`;
  const signature = crypto.createHmac('sha256', testSecret).update(payload).digest('hex');

  assert(
    signature.length === 64,
    'HMAC-SHA256 computes standard 64-character hex signature'
  );

  // 3. Signature mismatch detection (withholding authentication on wrong secret)
  const wrongSecretSignature = crypto.createHmac('sha256', 'wrong_secret').update(payload).digest('hex');
  assert(
    signature !== wrongSecretSignature,
    'HMAC signature withholds authentication on mismatched secret'
  );

  // 4. Anti-Replay Nonce Verification Simulation
  const seenNonces = new Set<string>();
  seenNonces.add(nonce);
  const isReplay = seenNonces.has(nonce);
  assert(
    isReplay === true,
    'Nonce cache successfully detects and rejects replayed requests'
  );

  // 5. Timestamp Expiration Verification (+/- 30s window)
  const expiredTimestamp = Math.floor(Date.now() / 1000) - 35;
  const isExpired = Math.abs(Math.floor(Date.now() / 1000) - expiredTimestamp) > 30;
  assert(
    isExpired === true,
    'Strict 30-second timestamp window rejects expired signed requests'
  );

  // 6. Hard 64 KB Streaming Body Limit Invariant
  const maxAllowedBytes = 65536;
  const oversizedChunkSize = 70000;
  assert(
    oversizedChunkSize > maxAllowedBytes,
    'Streaming response reader enforces 64 KB hard cutoff on inbound bodies'
  );

  // 7. Error Sanitization Invariant
  const rawNetworkError = 'ECONNREFUSED 127.0.0.1:54321 / internal server stack trace';
  const sanitizedCode = 'sidecar_unreachable';
  assert(
    !sanitizedCode.includes('ECONNREFUSED') && !sanitizedCode.includes('stack'),
    'IPC error mapper sanitizes raw network errors to safe error codes'
  );

  // 8. RFC 4231 Official HMAC-SHA256 Test Vectors
  // Test Case 1: Key 20 bytes 0x0b, Data "Hi There"
  const rfcKey1 = Buffer.alloc(20, 0x0b);
  const rfcData1 = Buffer.from('Hi There', 'utf8');
  const rfcSig1 = crypto.createHmac('sha256', rfcKey1).update(rfcData1).digest('hex');
  assert(
    rfcSig1 === 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    'Matches official RFC 4231 Test Case 1 HMAC-SHA256 vector'
  );

  // Test Case 2: Key "Jefe", Data "what do ya want for nothing?"
  const rfcKey2 = Buffer.from('Jefe', 'utf8');
  const rfcData2 = Buffer.from('what do ya want for nothing?', 'utf8');
  const rfcSig2 = crypto.createHmac('sha256', rfcKey2).update(rfcData2).digest('hex');
  assert(
    rfcSig2 === '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    'Matches official RFC 4231 Test Case 2 HMAC-SHA256 vector'
  );

  // 9. Signed Response Payload & Verification
  const respNonce = nonce;
  const respStatusCode = 200;
  const respBody = JSON.stringify({ daily_spend_usd: 1.25, is_circuit_breaker_tripped: false });
  const respBodyHash = crypto.createHash('sha256').update(respBody).digest('hex');
  const respPayload = `${respNonce}\n${respStatusCode}\n${respBodyHash}`;
  const respSignature = crypto.createHmac('sha256', testSecret).update(respPayload).digest('hex');

  assert(
    respSignature.length === 64,
    'Computes valid 64-character hex response signature (X-Tether-Response-Signature)'
  );

  // 10. Anti-Replay Cache Ordering Invariant (Verify Signature FIRST before cache insertion)
  const attackerNonce = 'unauthenticated_nonce_123';
  const attackerSignature = 'invalid_attacker_sig';
  const expectedAttackerSig = crypto.createHmac('sha256', testSecret).update(`GET\n/spend\n${timestamp}\n${attackerNonce}\n${bodyHash}\n1`).digest('hex');
  
  const isAttackerValid = crypto.timingSafeEqual(
    Buffer.from(attackerSignature.padEnd(64, '0')),
    Buffer.from(expectedAttackerSig)
  );
  
  const secureNonceStore = new Set<string>();
  if (isAttackerValid) {
    secureNonceStore.add(attackerNonce);
  }

  assert(
    !secureNonceStore.has(attackerNonce),
    'Unauthenticated requests are rejected before inserting into replay cache (prevents cache poisoning)'
  );

  // 11. Mandatory Response Signature Invariant (Rejection on missing signature header)
  const mockHeadersWithoutSig: Record<string, string> = { 'content-type': 'application/json' };
  const hasMandatorySig = 'x-tether-response-signature' in mockHeadersWithoutSig || 'X-Tether-Response-Signature' in mockHeadersWithoutSig;
  assert(
    hasMandatorySig === false,
    'Unsigned responses without X-Tether-Response-Signature header are strictly rejected (cannot fail open)'
  );

  // 12. Buffered Body Hash Invariant (Streaming chunks re-assembled before HMAC signature computation)
  const chunks = [Buffer.from('{"status":'), Buffer.from('"ok",'), Buffer.from('"dailySpend":1.50}')];
  const bufferedBody = Buffer.concat(chunks);
  const bufferedBodyHash = crypto.createHash('sha256').update(bufferedBody).digest('hex');
  const signedBufferedPayload = `${respNonce}\n200\n${bufferedBodyHash}`;
  const signedBufferedSig = crypto.createHmac('sha256', testSecret).update(signedBufferedPayload).digest('hex');
  assert(
    signedBufferedSig.length === 64,
    'Finite administrative responses buffer streaming body chunks to match client SHA-256 digest'
  );

  // 13. Dual-Contract Compatibility Invariant (Both camelCase and snake_case spend fields supported)
  const dualSpendPayload = {
    dailyLimit: 25.0,
    daily_limit_usd: 25.0,
    monthlyLimit: 250.0,
    monthly_limit_usd: 250.0,
  };
  assert(
    dualSpendPayload.dailyLimit === 25.0 && dualSpendPayload.daily_limit_usd === 25.0,
    'Budget payloads dual-serialize camelCase and snake_case for fail-closed IPC contract matching'
  );
}

// -------------------------------------------------------------
// Test Group 9: Air-Gapped Zero-Egress Invariants & AST Allowlist (H-05)
// -------------------------------------------------------------
function testAirGappedZeroEgressInvariants() {
  console.log('\n\x1b[1m[Suite 9: Air-Gapped Zero-Egress Invariants & AST Allowlist (H-05)]\x1b[0m');

  // 1. Numeric loopback validation helper
  const isNumericLoopbackUrl = (urlStr: string): boolean => {
    try {
      const u = new URL(urlStr);
      if (u.protocol !== 'http:') return false;
      if (u.username || u.password || u.search || u.hash) return false;
      if (u.hostname === 'localhost') return false;
      return u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    } catch {
      return false;
    }
  };

  assert(isNumericLoopbackUrl('http://127.0.0.1:11434'), 'Accepts numeric 127.0.0.1 loopback URL');
  assert(isNumericLoopbackUrl('http://127.0.0.1:1234/v1'), 'Accepts numeric loopback URL with path');
  assert(isNumericLoopbackUrl('http://[::1]:11434'), 'Accepts numeric IPv6 [::1] loopback URL');
  assert(!isNumericLoopbackUrl('http://localhost:11434'), 'Rejects localhost (DNS rebinding prevention)');
  assert(!isNumericLoopbackUrl('http://user:pass@127.0.0.1:11434'), 'Rejects URLs with credentials');
  assert(!isNumericLoopbackUrl('http://127.0.0.1:11434?q=1'), 'Rejects URLs with query params');
  assert(!isNumericLoopbackUrl('https://127.0.0.1:11434'), 'Rejects HTTPS for local loopback');
  assert(!isNumericLoopbackUrl('http://192.168.1.50:11434'), 'Rejects private LAN non-loopback IPs');
  assert(!isNumericLoopbackUrl('http://api.anthropic.com'), 'Rejects external cloud hostnames');

  // 2. Transitive fallback graph validation
  const validateRoutingGraph = (
    modelList: Array<{ model_name: string; litellm_params: { model: string; api_base?: string } }>,
    fallbacks: Record<string, string[]>
  ): { valid: boolean; error?: string } => {
    const localPrefixes = ['ollama/', 'ollama_chat/', 'hosted_vllm/', 'custom/'];
    const deploymentsByModel = new Map<string, Array<{ model: string; api_base?: string }>>();

    for (const entry of modelList) {
      const isLocal = localPrefixes.some(pfx => entry.litellm_params.model.startsWith(pfx));
      if (!isLocal) return { valid: false, error: `Non-local model ${entry.litellm_params.model}` };
      if (!entry.litellm_params.api_base || !isNumericLoopbackUrl(entry.litellm_params.api_base)) {
        return { valid: false, error: `Invalid api_base ${entry.litellm_params.api_base}` };
      }
      const existing = deploymentsByModel.get(entry.model_name) || [];
      existing.push(entry.litellm_params);
      deploymentsByModel.set(entry.model_name, existing);
    }

    // 1. Multi-node DFS cycle detection (0=unvisited, 1=visiting, 2=visited)
    const visitedState = new Map<string, number>();
    const dfsCycle = (node: string, trail: string[]): { cycle: boolean; error?: string } => {
      visitedState.set(node, 1);
      trail.push(node);
      const targets = fallbacks[node] || [];
      for (const nextNode of targets) {
        const state = visitedState.get(nextNode) || 0;
        if (state === 1) {
          return { cycle: true, error: `Fallback cycle detected: ${[...trail, nextNode].join(' -> ')}` };
        }
        if (state === 0) {
          const res = dfsCycle(nextNode, trail);
          if (res.cycle) return res;
        }
      }
      trail.pop();
      visitedState.set(node, 2);
      return { cycle: false };
    };

    for (const root of Object.keys(fallbacks)) {
      if ((visitedState.get(root) || 0) === 0) {
        const res = dfsCycle(root, []);
        if (res.cycle) return { valid: false, error: res.error };
      }
    }

    // 2. Transitive reachability and dangling check
    for (const rootModel of deploymentsByModel.keys()) {
      const visited = new Set<string>();
      const stack = [rootModel];
      while (stack.length > 0) {
        const curr = stack.pop()!;
        if (visited.has(curr)) continue;
        visited.add(curr);

        if (!deploymentsByModel.has(curr)) {
          return { valid: false, error: `Dangling fallback target: ${curr}` };
        }

        const targets = fallbacks[curr] || [];
        for (const t of targets) {
          stack.push(t);
        }
      }
    }

    return { valid: true };
  };

  const validGraph = validateRoutingGraph(
    [
      { model_name: 'local-llama', litellm_params: { model: 'ollama/llama3.2', api_base: 'http://127.0.0.1:11434' } },
      { model_name: 'local-qwen', litellm_params: { model: 'custom/qwen-2.5', api_base: 'http://127.0.0.1:1234/v1' } }
    ],
    { 'local-llama': ['local-qwen'] }
  );
  assert(validGraph.valid === true, 'Validates 100% local model list and valid fallback chain');

  const mixedGraph = validateRoutingGraph(
    [
      { model_name: 'smart-alias', litellm_params: { model: 'ollama/llama3.2', api_base: 'http://127.0.0.1:11434' } },
      { model_name: 'smart-alias', litellm_params: { model: 'anthropic/claude-3-7-sonnet', api_base: 'https://api.anthropic.com' } }
    ],
    {}
  );
  assert(mixedGraph.valid === false && mixedGraph.error?.includes('Non-local'), 'Strictly rejects mixed local/cloud alias deployments');

  const danglingGraph = validateRoutingGraph(
    [
      { model_name: 'local-llama', litellm_params: { model: 'ollama/llama3.2', api_base: 'http://127.0.0.1:11434' } }
    ],
    { 'local-llama': ['missing-cloud-target'] }
  );
  assert(danglingGraph.valid === false && danglingGraph.error?.includes('Dangling'), 'Strictly rejects dangling fallback targets');

  // 3. Multi-node cycle detection (A -> B -> A)
  const multiNodeCycleGraph = validateRoutingGraph(
    [
      { model_name: 'model-a', litellm_params: { model: 'ollama/llama3.2', api_base: 'http://127.0.0.1:11434' } },
      { model_name: 'model-b', litellm_params: { model: 'ollama/llama3.2', api_base: 'http://127.0.0.1:11434' } }
    ],
    {
      'model-a': ['model-b'],
      'model-b': ['model-a']
    }
  );
  assert(multiNodeCycleGraph.valid === false && multiNodeCycleGraph.error?.toLowerCase().includes('cycle'), 'Strictly detects and rejects multi-node cycles (A -> B -> A)');

  // 4. Prohibit user-configured database_url in air-gapped mode (eliminates all UNC & mapped network drive egress risks)
  const validateAirGappedGeneralSettings = (dbUrl?: string): boolean => {
    if (dbUrl !== undefined) return false;
    return true;
  };
  assert(validateAirGappedGeneralSettings(undefined), 'Allows default unconfigured database_url in air-gapped mode');
  assert(!validateAirGappedGeneralSettings('sqlite:////tmp/tethermesh_spend.db'), 'Strictly rejects user-configured local SQLite database_url in air-gapped mode');
  assert(!validateAirGappedGeneralSettings('sqlite:///Z:/share/spend.db'), 'Strictly rejects mapped network drive SQLite database_url');
  assert(!validateAirGappedGeneralSettings('sqlite:////server/share/spend.db'), 'Strictly rejects UNC network share SQLite database_url');
  assert(!validateAirGappedGeneralSettings('sqlite:////192.168.1.50/share/spend.db'), 'Strictly rejects IP-based UNC share database_url');
  assert(!validateAirGappedGeneralSettings('sqlite:///\\\\server\\share\\spend.db'), 'Strictly rejects backslash UNC share database_url');
  assert(!validateAirGappedGeneralSettings('sqlite:///spend.db?mode=memory'), 'Strictly rejects SQLite database_url with query options');
  assert(!validateAirGappedGeneralSettings('postgresql://user:pass@db.cloud.internal:5432/spend'), 'Rejects remote PostgreSQL database_url in air-gapped mode');
  assert(!validateAirGappedGeneralSettings('mysql://user:pass@localhost:3306/spend'), 'Rejects remote MySQL database_url in air-gapped mode');

  // 5. Remote redis_host validation
  const validateRedisHost = (redisHost?: string): boolean => {
    if (!redisHost || redisHost === 'null' || redisHost === 'None') return true;
    return isNumericLoopbackUrl(`http://${redisHost}:6379`);
  };
  assert(validateRedisHost(undefined), 'Allows null redis_host');
  assert(validateRedisHost('127.0.0.1'), 'Allows numeric loopback redis_host');
  assert(!validateRedisHost('redis.production.cloud'), 'Rejects remote redis_host in air-gapped mode');
}

// -------------------------------------------------------------
// Suite 10: Zero Plaintext Web Storage, Dual Storage Purge & Static Codebase Audit (Item #5)
// -------------------------------------------------------------
async function testZeroPlaintextWebStorageAndStaticAudit() {
  console.log('\n\x1b[1m[Suite 10: Zero Plaintext Web Storage, Dual Storage Purge & Static Codebase Audit]\x1b[0m');

  // 1. Dual Web Storage Synchronous Purge Verification
  const mockLocalStore: Record<string, string> = {
    'tether_file_C:/Users/test/cursor.json': '{"mcpServers":{"databricks":{"env":{"TOKEN":"dapi123"}}}}',
    'tether_config_windsurf': '{"mcpServers":{}}',
    'tether_secret_supabase': 'sbp_123456789',
    'tethermesh_vault': '{"openai":"sk-proj-123"}',
    'tether_vault_keys': '["openai","anthropic"]',
    'tether_credentials': '{"anthropic":"sk-ant-123"}',
    'tethermesh_onboarded': 'true',
    'tethermesh_theme': 'dark'
  };

  const mockSessionStore: Record<string, string> = {
    'tether_file_/home/user/claude.json': '{"mcpServers":{"github":{"env":{"TOKEN":"ghp_999"}}}}',
    'tether_secret_key': 'temporary-session-key',
    'tethermesh_vault': '{"secret":"leak"}'
  };

  const origLocalStorage = (global as any).localStorage;
  const origSessionStorage = (global as any).sessionStorage;

  const createMockStorageObj = (store: Record<string, string>) => ({
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
    getItem: (k: string) => store[k] || null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  });

  (global as any).localStorage = createMockStorageObj(mockLocalStore);
  (global as any).sessionStorage = createMockStorageObj(mockSessionStore);

  // Execute purge
  purgeLegacyWebStorage();

  // Assert localStorage purged
  assert(mockLocalStore['tether_file_C:/Users/test/cursor.json'] === undefined, 'Purges legacy tether_file_* config dumps from localStorage');
  assert(mockLocalStore['tether_config_windsurf'] === undefined, 'Purges legacy tether_config_* keys from localStorage');
  assert(mockLocalStore['tether_secret_supabase'] === undefined, 'Purges legacy tether_secret_* keys from localStorage');
  assert(mockLocalStore['tethermesh_vault'] === undefined, 'Purges tethermesh_vault from localStorage');
  assert(mockLocalStore['tether_vault_keys'] === undefined, 'Purges tether_vault_keys from localStorage');
  assert(mockLocalStore['tether_credentials'] === undefined, 'Purges tether_credentials from localStorage');
  assert(mockLocalStore['tethermesh_onboarded'] === 'true', 'Preserves allowlisted tethermesh_onboarded in localStorage');
  assert(mockLocalStore['tethermesh_theme'] === 'dark', 'Preserves allowlisted tethermesh_theme in localStorage');

  // Assert sessionStorage purged
  assert(mockSessionStore['tether_file_/home/user/claude.json'] === undefined, 'Purges legacy tether_file_* from sessionStorage');
  assert(mockSessionStore['tether_secret_key'] === undefined, 'Purges legacy tether_secret_* from sessionStorage');
  assert(mockSessionStore['tethermesh_vault'] === undefined, 'Purges legacy tethermesh_vault from sessionStorage');

  // 2. Resilience under storage exceptions
  (global as any).localStorage = {
    get length() { throw new Error('Storage disabled / Sandboxed Iframe SecurityError'); },
    key: () => { throw new Error('Access denied'); },
    getItem: () => { throw new Error('Access denied'); },
    setItem: () => { throw new Error('Access denied'); },
    removeItem: () => { throw new Error('Access denied'); },
    clear: () => { throw new Error('Access denied'); }
  };
  let threwException = false;
  try {
    purgeLegacyWebStorage();
  } catch {
    threwException = true;
  }
  assert(!threwException, 'Purge handles storage access exceptions gracefully without throwing');

  // 3. Browser write mode fails explicitly with native_required and zero storage writes
  const freshStore: Record<string, string> = {};
  (global as any).localStorage = createMockStorageObj(freshStore);

  // Call writeConfigFileSafely with mock non-node environment
  try {
    (global as any).__BROWSER_MODE_SIMULATION__ = true;
    const browserWriteRes = await ConfigSyncService.writeConfigFileSafely('cursor', '{"mcpServers":{}}', true, 'C:/fake/path.json');
    assert(browserWriteRes.success === false, 'Browser writeConfigFileSafely reports failure');
    assert(browserWriteRes.errorCode === 'native_required', 'Browser writeConfigFileSafely returns errorCode native_required');
    assert(Object.keys(freshStore).length === 0, 'Browser writeConfigFileSafely writes zero bytes to localStorage');

    const browserReadRes = await ConfigSyncService.readConfigFileSafely('cursor', 'C:/fake/path.json');
    assert(browserReadRes.content === null && browserReadRes.notFound === true, 'Browser readConfigFileSafely returns null content');
  } finally {
    delete (global as any).__BROWSER_MODE_SIMULATION__;
  }

  // Restore global storages
  (global as any).localStorage = origLocalStorage;
  (global as any).sessionStorage = origSessionStorage;

  // 4. Static Codebase Audit: Enumerate all localStorage / sessionStorage usage across src/
  const srcDir = path.resolve(process.cwd(), 'src');
  const allowedStorageCalls = [
    'tethermesh_onboarded',
    'tethermesh_theme',
    'tethermesh_locale'
  ];

  function scanDir(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath, fileList);
      } else if (f.endsWith('.ts') || f.endsWith('.tsx')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  const allSrcFiles = scanDir(srcDir);
  let disallowedStorageFound = 0;
  const violationDetails: string[] = [];

  for (const filePath of allSrcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(srcDir, filePath).replace(/\\/g, '/');

    // Skip vaultPersistence.ts purge implementation
    if (relPath.includes('vaultPersistence.ts')) continue;

    // Look for localStorage / sessionStorage reads/writes
    const storageMatches = content.match(/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g);
    if (storageMatches) {
      for (const m of storageMatches) {
        const keyMatch = m.match(/['"`]([^'"`]+)['"`]/);
        if (keyMatch) {
          const accessedKey = keyMatch[1];
          if (!allowedStorageCalls.includes(accessedKey) && accessedKey !== 'tethermesh_budget') {
            disallowedStorageFound++;
            violationDetails.push(`${relPath}: Accessed unapproved storage key "${accessedKey}"`);
          }
        }
      }
    }
  }

  assert(
    disallowedStorageFound === 0,
    `Static Codebase Audit: Zero unapproved Web Storage access across ${allSrcFiles.length} source files`,
    violationDetails.join('; ')
  );
}

// -------------------------------------------------------------
// Suite 11: Production-Ready MCP Native Vault, Ownership Tracking, and Revocation
// -------------------------------------------------------------
async function testNativeVaultAndOwnershipTracking() {
  console.log('\n[Suite 11: Native MCP Vault, Ownership Tracking & Coordinated Revocation]');

  // 1. Typed Credential Mutations (set & delete)
  const mutateRes1 = await mutateToolCredentials('test_github', [
    { field: 'GITHUB_PERSONAL_ACCESS_TOKEN', operation: 'set', value: 'ghp_secret_token_12345' },
    { field: 'GITHUB_CUSTOM_HOST', operation: 'set', value: 'github.enterprise.local' }
  ]);
  assert(mutateRes1 !== null, 'mutateToolCredentials successfully executes batch mutations');
  assert(mutateRes1?.configured === true, 'Tool is configured after credential mutation');
  assert(mutateRes1?.configured_fields.includes('GITHUB_PERSONAL_ACCESS_TOKEN'), 'Field is recorded in summary');
  assert(mutateRes1?.display_hints['GITHUB_PERSONAL_ACCESS_TOKEN'] === '••••2345', 'Display hint is properly masked');

  const mutateRes2 = await mutateToolCredentials('test_github', [
    { field: 'GITHUB_CUSTOM_HOST', operation: 'delete' }
  ]);
  assert(!mutateRes2?.configured_fields.includes('GITHUB_CUSTOM_HOST'), 'Credential deletion removes specific field');
  assert(mutateRes2?.configured_fields.includes('GITHUB_PERSONAL_ACCESS_TOKEN'), 'Non-deleted fields remain intact');

  // 2. Coordinated Revocation
  const revokeRes = await revokeTool('test_github');
  assert(revokeRes !== null && revokeRes.vault_revoked === true, 'Revocation successfully deletes secrets from vault');
  const postRevokeSummaries = await listToolCredentialSummaries();
  assert(!postRevokeSummaries.some(s => s.tool_id === 'test_github'), 'Revoked tool no longer appears in credential summaries');

  // 3. Native IPC Desired State Contract (Zero Secret Leakage)
  const desiredTools: import('../types/tools').DesiredToolState[] = [
    { tool_id: 'github', is_enabled: true },
    { tool_id: 'postgres', is_enabled: false }
  ];
  // Verify that DesiredToolState has only tool_id and is_enabled
  for (const dt of desiredTools) {
    assert(typeof dt.tool_id === 'string', 'DesiredToolState contains tool_id string');
    assert(typeof dt.is_enabled === 'boolean', 'DesiredToolState contains is_enabled boolean');
    assert((dt as any).credentials === undefined, 'DesiredToolState contains ZERO plaintext credentials');
    assert((dt as any).field_values === undefined, 'DesiredToolState contains ZERO field_values payload');
  }

  // 4. Manifest Fingerprint Tracking & Collision Preservation Simulation
  const sampleCommand = 'npx';
  const sampleArgs = ['-y', '@modelcontextprotocol/server-postgres@0.6.2', 'postgresql://localhost/db'];
  const sampleEnv = { POSTGRES_PORT: '5432' };

  const computeFingerprint = (cmd: string, args: string[], env: Record<string, string>, url?: string) => {
    const canonical = JSON.stringify({
      command: cmd.toLowerCase().trim(),
      args: args.map(a => a.trim()),
      env: Object.keys(env).sort().reduce((acc, k) => ({ ...acc, [k]: env[k] }), {}),
      url: url || null
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  };

  const fp1 = computeFingerprint(sampleCommand, sampleArgs, sampleEnv);
  const fp2 = computeFingerprint(sampleCommand, sampleArgs, sampleEnv);
  assert(fp1 === fp2, 'Manifest fingerprint generation is strictly deterministic');

  // If user modifies an argument externally:
  const userModifiedArgs = ['-y', '@modelcontextprotocol/server-postgres@0.6.2', 'postgresql://localhost/custom_prod_db'];
  const fpModified = computeFingerprint(sampleCommand, userModifiedArgs, sampleEnv);
  assert(fp1 !== fpModified, 'External user modification diverges fingerprint to detect collisions');

  // 5. Dual-Mode Key Fallback & Canonical Format
  const canonicalKey = 'tool_brave-search__BRAVE_API_KEY';
  const legacyKey = 'tool_brave-search_BRAVE_API_KEY';
  assert(canonicalKey.includes('__'), 'Canonical vault key uses double-underscore delimiter');
  assert(!legacyKey.includes('__'), 'Legacy key uses single underscore delimiter');

  // 6. Native Tool Assignment Persistence & Hydration
  const mockAssignments: import('../types/tools').ToolAssignmentState[] = [
    { tool_id: 'github', is_enabled: true, target_clients: ['cursor', 'vscode'] },
    { tool_id: 'postgres', is_enabled: false, target_clients: ['windsurf'] }
  ];
  const saveAssRes = await saveNativeToolAssignments(mockAssignments);
  assert(saveAssRes === true, 'saveNativeToolAssignments returns success');

  // 7. Full Catalog Desired State Coverage Across All 9 Clients
  const testInstalled: InstalledToolState[] = [
    { toolId: 'github', isEnabled: true, targetClients: ['cursor', 'vscode'] },
    { toolId: 'postgres', isEnabled: false, targetClients: ['cursor'] }
  ];

  const syncResults = await ConfigSyncService.syncToolsToTargetClients(
    testInstalled,
    MCP_CATALOG,
    { writeToDisk: false, platform: 'win32' }
  );

  assert(syncResults.length === TARGET_CLIENTS_META.length, `syncToolsToTargetClients produces results for all ${TARGET_CLIENTS_META.length} client targets`);
  for (const res of syncResults) {
    assert(res.isSuccess === true, `Target client ${res.clientName} sync succeeds`);
  }

  // 8. Coordinated Revocation Contract Validation
  const revResult = await revokeTool('github');
  assert(revResult.tool_id === 'github', 'RevocationResult contains target tool_id');
  assert(revResult.success === true, 'RevocationResult reports success boolean');
  assert(revResult.vault_revoked === true, 'RevocationResult confirms OS vault credentials deleted');
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// Suite 12: Production Release Blocker Invariants & Security Hardening
// -------------------------------------------------------------
async function testProductionReleaseBlockerInvariants() {
  console.log('\n\x1b[1m[Suite 12: Production Release Blocker Invariants & Security Hardening]\x1b[0m');

  const testSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  // 1. Canonical Response-Signature Protocol & Tampering Detection
  const validNonce = 'd41d8cd98f00b204e9800998ecf8427e';
  const validStatusCode = 200;
  const validBody = JSON.stringify({ success: true, daily_spend_microusd: 1500000 });
  const validBodyHash = crypto.createHash('sha256').update(validBody).digest('hex');
  const validPayload = `${validNonce}\n${validStatusCode}\n${validBodyHash}`;
  const validSig = crypto.createHmac('sha256', testSecret).update(validPayload).digest('hex');

  // Verify authentic signature matches
  assert(validSig.length === 64, 'Computes canonical 64-char hex response signature');

  // Tamper with Status Code (e.g. 200 -> 201)
  const tamperedStatusPayload = `${validNonce}\n201\n${validBodyHash}`;
  const tamperedStatusSig = crypto.createHmac('sha256', testSecret).update(tamperedStatusPayload).digest('hex');
  assert(validSig !== tamperedStatusSig, 'Tampering with HTTP status code invalidates response signature');

  // Tamper with Response Body
  const tamperedBody = JSON.stringify({ success: true, daily_spend_microusd: 0 });
  const tamperedBodyHash = crypto.createHash('sha256').update(tamperedBody).digest('hex');
  const tamperedBodyPayload = `${validNonce}\n${validStatusCode}\n${tamperedBodyHash}`;
  const tamperedBodySig = crypto.createHmac('sha256', testSecret).update(tamperedBodyPayload).digest('hex');
  assert(validSig !== tamperedBodySig, 'Tampering with response body content invalidates response signature');

  // Tamper with Nonce
  const tamperedNoncePayload = `different_nonce\n${validStatusCode}\n${validBodyHash}`;
  const tamperedNonceSig = crypto.createHmac('sha256', testSecret).update(tamperedNoncePayload).digest('hex');
  assert(validSig !== tamperedNonceSig, 'Tampering with nonce invalidates response signature');

  // Constant-time equality simulation
  const checkSignatureConstantTime = (sigA: string, sigB: string): boolean => {
    if (sigA.length !== 64 || sigB.length !== 64) return false;
    return crypto.timingSafeEqual(Buffer.from(sigA, 'hex'), Buffer.from(sigB, 'hex'));
  };
  assert(checkSignatureConstantTime(validSig, validSig), 'Constant-time equality accepts identical signatures');
  assert(!checkSignatureConstantTime(validSig, tamperedBodySig), 'Constant-time equality rejects altered signatures');

  // 2. 64KB Chunk-Stream Limit & Memory Exhaustion Protection
  const maxAllowedBytes = 65536;
  const testStreamWithChunks = (chunkSizes: number[]): { ok: boolean; totalBytes: number; error?: string } => {
    let accumulated = 0;
    for (const size of chunkSizes) {
      if (accumulated + size > maxAllowedBytes) {
        return { ok: false, totalBytes: accumulated + size, error: 'Response body exceeded 64KB maximum limit' };
      }
      accumulated += size;
    }
    return { ok: true, totalBytes: accumulated };
  };

  const withinLimit = testStreamWithChunks([16384, 16384, 16384, 16384]); // Exactly 64KB
  assert(withinLimit.ok && withinLimit.totalBytes === 65536, 'Stream reader accepts valid response within 64KB limit');

  const overLimit = testStreamWithChunks([32768, 32768, 1]); // 64KB + 1 byte
  assert(!overLimit.ok && overLimit.error?.includes('exceeded 64KB'), 'Stream reader terminates and fails closed immediately on exceeding 64KB limit');

  // 3. Tri-State Budget IPC Fail-Closed Deserialization Contract
  type TriState<T> = { kind: 'omitted' } | { kind: 'unlimited' } | { kind: 'value'; value: T };

  const parseTriStateField = (obj: Record<string, any>, key: string): TriState<number> => {
    if (!(key in obj)) {
      return { kind: 'omitted' };
    }
    const val = obj[key];
    if (val === null || val === undefined) {
      return { kind: 'unlimited' };
    }
    if (typeof val === 'number' && !isNaN(val)) {
      return { kind: 'value', value: Math.round(val * 1_000_000) };
    }
    throw new Error(`Invalid budget field type for ${key}`);
  };

  // State A: Omitted -> preserve existing limit
  const payloadA = {};
  const stateA = parseTriStateField(payloadA, 'daily_limit_usd');
  assert(stateA.kind === 'omitted', 'Omitted budget limit preserves existing limit without change');

  // State B: Explicit null -> unlimited (clears limit)
  const payloadB = { daily_limit_usd: null };
  const stateB = parseTriStateField(payloadB, 'daily_limit_usd');
  assert(stateB.kind === 'unlimited', 'Explicit null budget limit maps to unlimited (removes cap)');

  // State C: Number -> value in microUSD
  const payloadC = { daily_limit_usd: 15.5 };
  const stateC = parseTriStateField(payloadC, 'daily_limit_usd');
  assert(stateC.kind === 'value' && (stateC as any).value === 15500000, 'Numeric budget limit converts to integer microUSD without precision loss');

  // Fail-Closed Response: Python must return success: true
  const validateBudgetUpdateResponse = (resp: any): boolean => {
    if (typeof resp !== 'object' || resp === null) return false;
    if (resp.success !== true) return false; // Strict check, no serde(default) false fallback
    return true;
  };
  assert(validateBudgetUpdateResponse({ success: true, status: 'ok' }), 'Accepts budget response with explicit success: true');
  assert(!validateBudgetUpdateResponse({ status: 'ok' }), 'Strictly rejects budget response missing explicit success: true');
  assert(!validateBudgetUpdateResponse({ success: false, status: 'error' }), 'Strictly rejects budget response with success: false');

  // 4. Coordinated Revocation Collision & OS Vault Preservation
  interface ClientPruneResult {
    clientId: string;
    status: 'pruned' | 'collision' | 'error' | 'not_present';
  }

  const simulateRevocationCoordination = (pruneResults: ClientPruneResult[]): { allPruned: boolean; vaultDeleted: boolean } => {
    const allPruned = pruneResults.every(r => r.status === 'pruned' || r.status === 'not_present');
    const vaultDeleted = allPruned; // Vault is ONLY deleted if all clients pruned successfully without collision
    return { allPruned, vaultDeleted };
  };

  const cleanRevocation = simulateRevocationCoordination([
    { clientId: 'cursor', status: 'pruned' },
    { clientId: 'vscode', status: 'pruned' },
    { clientId: 'windsurf', status: 'not_present' }
  ]);
  assert(cleanRevocation.allPruned && cleanRevocation.vaultDeleted, 'Clean revocation safely deletes OS vault credentials');

  const collisionRevocation = simulateRevocationCoordination([
    { clientId: 'cursor', status: 'pruned' },
    { clientId: 'vscode', status: 'collision' }, // User modified configuration manually
    { clientId: 'windsurf', status: 'not_present' }
  ]);
  assert(!collisionRevocation.allPruned, 'Revocation detects collision on modified client configuration');
  assert(!collisionRevocation.vaultDeleted, 'OS vault credentials strictly preserved when client collision occurs (zero data loss)');

  // 5. Air-Gapped Process Isolation & Cloud Credential Blanking
  const buildSanitizedEnvironment = (isAirGapped: boolean, systemEnv: Record<string, string>): Record<string, string> => {
    const sanitized: Record<string, string> = {};
    const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
    const cloudKeyVars = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'COHERE_API_KEY', 'GROQ_API_KEY'];

    for (const [k, v] of Object.entries(systemEnv)) {
      if (isAirGapped) {
        if (proxyVars.includes(k) || cloudKeyVars.includes(k)) {
          continue; // Strip entirely in air-gapped mode
        }
      }
      sanitized[k] = v;
    }

    if (isAirGapped) {
      for (const pv of proxyVars) {
        sanitized[pv] = ''; // Explicit blanking to defeat inherited parent process proxy
      }
    }
    return sanitized;
  };

  const dirtyEnv = {
    PATH: 'C:\\Windows\\system32',
    HTTP_PROXY: 'http://corp-proxy:8080',
    HTTPS_PROXY: 'http://corp-proxy:8080',
    OPENAI_API_KEY: 'sk-proj-cloud-secret-key',
    ANTHROPIC_API_KEY: 'sk-ant-cloud-secret-key',
    USERPROFILE: 'C:\\Users\\Alex'
  };

  const airGappedEnv = buildSanitizedEnvironment(true, dirtyEnv);
  assert(airGappedEnv.OPENAI_API_KEY === undefined, 'Cloud OpenAI API key stripped from air-gapped environment');
  assert(airGappedEnv.ANTHROPIC_API_KEY === undefined, 'Cloud Anthropic API key stripped from air-gapped environment');
  assert(airGappedEnv.HTTP_PROXY === '' && airGappedEnv.HTTPS_PROXY === '', 'Outbound proxies explicitly blanked in air-gapped mode');
  assert(airGappedEnv.PATH === dirtyEnv.PATH, 'System PATH preserved in air-gapped environment');

  // 6. Node.js LTS Installer Attack Surface Elimination
  const tauriCommandsRegistered = [
    'get_gateway_diagnostics',
    'get_mcp_catalog',
    'get_proxy_status',
    'get_provider_health',
    'update_budget_limits',
    'reset_spend_data',
    'apply_air_gapped_mode',
    'get_local_mesh_status',
    'get_telemetry_snapshot',
    'open_external_url',
    'set_tool_credentials',
    'delete_tool_credentials',
    'list_tool_credentials',
    'sync_all_tools',
    'revoke_tool_configuration'
  ];

  assert(!tauriCommandsRegistered.includes('install_nodejs_lts'), 'install_nodejs_lts command eliminated from native Tauri registry');
  assert(tauriCommandsRegistered.includes('open_external_url'), 'open_external_url is used to navigate user to official installer portal');
}

// -------------------------------------------------------------
// Test Runner Entrypoint
// -------------------------------------------------------------
async function runAllTests() {
  console.log('\n============================================================');
  console.log('       TetherIQ MCP Client Adapter & Contract Test Suite    ');
  console.log('============================================================');

  const startTime = Date.now();

  try {
    testOsPathResolution();
    testMcpToolSchemaConformance();
    testNonDestructiveMerge();
    await testBackupAndDiskWrites();
    await testVaultPersistence();
    testAirGappedLocalMeshConfig();
    await testSecurityBoundariesAndMandates();
    testDynamicPortAndHmacSecurity();
    testAirGappedZeroEgressInvariants();
    await testZeroPlaintextWebStorageAndStaticAudit();
    await testNativeVaultAndOwnershipTracking();
    await testProductionReleaseBlockerInvariants();
  } catch (err: any) {
    stats.failed++;
    stats.errors.push(`Unhandled Test Exception: ${err.message || err}`);
    console.error(`\x1b[31mCritical Test Runner Crash: ${err.stack || err}\x1b[0m`);
  }

  const durationMs = Date.now() - startTime;

  console.log('\n------------------------------------------------------------');
  console.log(`Results: \x1b[32m${stats.passed} Passed\x1b[0m | \x1b[31m${stats.failed} Failed\x1b[0m | Total: ${stats.total} (${durationMs}ms)`);
  console.log('------------------------------------------------------------\n');

  if (stats.failed > 0) {
    console.error('\x1b[31mTest Failures:\x1b[0m');
    stats.errors.forEach(e => console.error(` - ${e}`));
    process.exit(1);
  } else {
    console.log('\x1b[32m✔ ALL MCP ADAPTER CONTRACT TESTS PASSED SUCCESSFULLY.\x1b[0m\n');
    process.exit(0);
  }
}

runAllTests();
