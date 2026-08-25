import { ConfigSyncService } from '../src/services/configSyncService';
import { MCP_CATALOG, TARGET_CLIENTS_META } from '../src/data/mcpCatalogData';
import { InstalledToolState } from '../src/types/tools';
import fs from 'fs';
import path from 'path';

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
        antigravity: 'C:\\Users\\AlexDev\\.mcp.json'
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
        antigravity: '/Users/alexdev/.mcp.json'
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
        antigravity: '/home/alexdev/.mcp.json'
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
      targetClients: ['cursor', 'windsurf', 'claude-desktop', 'claude-code']
    };

    const formatted = ConfigSyncService.formatToolDefinitionForClient(tool, installedState);

    const validCommand = typeof formatted.command === 'string' && formatted.command.trim().length > 0;
    assert(validCommand, `[Tool: ${tool.id}] Valid MCP command string ("${formatted.command}")`);

    const validArgs = Array.isArray(formatted.args) && formatted.args.every(a => typeof a === 'string');
    assert(validArgs, `[Tool: ${tool.id}] Valid args string array (${JSON.stringify(formatted.args)})`);

    const validEnv = typeof formatted.env === 'object' && !Array.isArray(formatted.env) &&
      Object.entries(formatted.env).every(([k, v]) => typeof k === 'string' && typeof v === 'string');
    assert(validEnv, `[Tool: ${tool.id}] Valid environment key-value map`);

    const serialized = JSON.stringify(formatted);
    const jsonParsed = JSON.parse(serialized);
    const hasForbiddenValues = JSON.stringify(jsonParsed).includes(':null') || JSON.stringify(jsonParsed).includes(':undefined');
    assert(!hasForbiddenValues, `[Tool: ${tool.id}] Strict serialization without nulls or undefined`);
  }
}

// -------------------------------------------------------------
// Test Group 3: Non-Destructive Merge & JSONC Safety
// -------------------------------------------------------------
function testNonDestructiveMerge() {
  console.log('\n\x1b[1m[Suite 3: Non-Destructive Merge & Comment Safety]\x1b[0m');

  const sampleToolDef = {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: { POSTGRES_CONNECTION_STRING: 'postgresql://localhost:5432/db' }
  };

  const toolsToInject = [{ toolId: 'postgres', definition: sampleToolDef }];

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

  const jsoncWithComments = `
  {
    // Developer configuration for Windsurf
    /* Multi-line comment block
       describing custom tools */
    "mcpServers": {
      "legacy-tool": {
        "command": "node",
        "args": ["legacy.js"]
      }
    }
  }
  `;

  const resultB = ConfigSyncService.mergeConfigNonDestructive(
    jsoncWithComments,
    toolsToInject,
    'windsurf'
  );

  let parseBSuccess = true;
  let parsedB: any = {};
  try {
    parsedB = JSON.parse(resultB.updatedJsonStr);
  } catch {
    parseBSuccess = false;
  }

  assert(parseBSuccess, 'Safely parses JSON with single-line & multi-line comments');
  assert(parsedB.mcpServers['legacy-tool'] !== undefined, 'Preserves legacy tool despite comments in source file');
  assert(parsedB.mcpServers['postgres'] !== undefined, 'Injected tool present in comment-cleaned output');

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
}

// -------------------------------------------------------------
// Test Group 4: Automated .bak Backup & Atomic Disk Writes
// -------------------------------------------------------------
async function testBackupAndDiskWrites() {
  console.log('\n\x1b[1m[Suite 4: Safe Disk Writes & Automated .bak Backups]\x1b[0m');

  const testDir = path.resolve(process.cwd(), '.tether_test_configs');
  const targetFile = path.join(testDir, 'mcp_test.json');
  const backupFile = path.join(testDir, 'mcp_test.json.bak');

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

    assert(writeRes.success, 'Atomic write to disk succeeds');
    assert(fs.existsSync(backupFile), 'Creates .bak backup of previous configuration');
    assert(fs.readFileSync(backupFile, 'utf8') === initialContent, 'Backup contains exact original contents');
    assert(fs.readFileSync(targetFile, 'utf8') === updatedContent, 'Target file updated with new contents');
  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
}

// -------------------------------------------------------------
// Test Group 5: Multi-Client Full Mock Sync Execution
// -------------------------------------------------------------
async function testFullMockSync() {
  console.log('\n\x1b[1m[Suite 5: End-to-End Multi-Client Sync Simulation]\x1b[0m');

  const installedTools: InstalledToolState[] = [
    {
      toolId: 'github',
      isEnabled: true,
      credentials: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test_token_12345' },
      targetClients: ['cursor', 'windsurf', 'claude-desktop', 'claude-code', 'devin', 'antigravity']
    },
    {
      toolId: 'postgres',
      isEnabled: true,
      credentials: { POSTGRES_CONNECTION_STRING: 'postgresql://localhost:5432/app' },
      targetClients: ['cursor', 'windsurf', 'claude-desktop']
    },
    {
      toolId: 'databricks',
      isEnabled: false,
      credentials: { DATABRICKS_HOST: 'https://test.databricks.com', DATABRICKS_TOKEN: 'dapi123' },
      targetClients: ['cursor', 'windsurf']
    }
  ];

  if (typeof globalThis.localStorage === 'undefined') {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); }
    };
  }

  const results = await ConfigSyncService.syncToolsToTargetClients(
    installedTools,
    MCP_CATALOG,
    { platform: 'win32' }
  );

  assert(results.length === TARGET_CLIENTS_META.length, `Generated sync results for all ${TARGET_CLIENTS_META.length} clients`);

  for (const res of results) {
    assert(res.isSuccess, `Sync success status for ${res.clientName}`);
    const expectedCount = ['cursor', 'windsurf', 'claude-desktop'].includes(res.clientId) ? 2 : 1;
    assert(res.toolsInjected === expectedCount, `Correct active tool count for ${res.clientName}`);

    const stored = localStorage.getItem(`tether_client_config_${res.clientId}`);
    assert(stored !== null && stored.length > 0, `Config persisted for ${res.clientName}`);

    const parsed = JSON.parse(stored || '{}');
    assert(parsed.mcpServers?.github !== undefined, `${res.clientName} has github MCP configured`);
    assert(parsed.mcpServers?.github?.command === 'npx', `${res.clientName} github command is npx`);
    assert(parsed.mcpServers?.github?.env?.GITHUB_PERSONAL_ACCESS_TOKEN === 'ghp_test_token_12345', `${res.clientName} github credentials injected`);
    assert(parsed.mcpServers?.databricks === undefined, `${res.clientName} excluded disabled databricks tool`);
  }
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
    await testFullMockSync();
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
