export interface ClientIntegrationGuide {
  id: string;
  name: string;
  category: 'cli' | 'ide' | 'agent' | 'sdk';
  badge: string;
  description: string;
  icon: string;
  oneClickAutoConfigAvailable: boolean;
  commandSnippet: string;
  codeSnippet?: string;
  envSnippet?: string;
  configLocationDescription: string;
  docsUrl: string;
}

export const CLIENT_INTEGRATIONS: ClientIntegrationGuide[] = [
  {
    id: 'claude-code',
    name: 'Claude Code CLI',
    category: 'cli',
    badge: 'Recommended',
    description: 'Anthropic\'s official terminal agent. Injects TetherIQ proxy gateway as base URL with automatic model failover & spend limits.',
    icon: 'Terminal',
    oneClickAutoConfigAvailable: true,
    commandSnippet: 'export ANTHROPIC_BASE_URL=http://127.0.0.1:4000\nclaude',
    envSnippet: 'ANTHROPIC_BASE_URL="http://127.0.0.1:4000"',
    configLocationDescription: '~/.claude.json or active terminal session',
    docsUrl: 'https://docs.anthropic.com/en/docs/agents-and-tools/claude-code'
  },
  {
    id: 'cursor',
    name: 'Cursor IDE',
    category: 'ide',
    badge: 'Popular',
    description: 'AI code editor. Route all Cursor Composer and Chat completions through TetherIQ with OpenAI compatibility and MCP sync.',
    icon: 'Code2',
    oneClickAutoConfigAvailable: true,
    commandSnippet: '# Cursor Settings -> Models -> OpenAI API Key -> Base URL\nhttp://127.0.0.1:4000/v1',
    codeSnippet: '{\n  "modelName": "fast-code",\n  "overrideBaseUrl": "http://127.0.0.1:4000/v1"\n}',
    configLocationDescription: '~/.cursor/mcp.json and Cursor UI Settings',
    docsUrl: 'https://cursor.com'
  },
  {
    id: 'windsurf',
    name: 'Windsurf IDE (Cascade)',
    category: 'ide',
    badge: 'Cascade Agent',
    description: 'Codeium Windsurf editor. Connect Cascade to the TetherIQ gateway and auto-sync your 50+ MCP tool definitions.',
    icon: 'Compass',
    oneClickAutoConfigAvailable: true,
    commandSnippet: '# Windsurf MCP Settings File\n~/.codeium/windsurf/mcp_config.json',
    codeSnippet: '{\n  "mcpServers": {\n    /* auto-injected by TetherIQ */\n  }\n}',
    configLocationDescription: '~/.codeium/windsurf/mcp_config.json',
    docsUrl: 'https://codeium.com/windsurf'
  },
  {
    id: 'devin',
    name: 'Devin',
    category: 'agent',
    badge: 'Autonomous',
    description: 'Cognition Devin autonomous software engineer. Pre-configure workspace tools and cost tethering.',
    icon: 'Bot',
    oneClickAutoConfigAvailable: true,
    commandSnippet: '# Devin Workspace Config\ndevin.json',
    codeSnippet: '{\n  "mcpServers": {\n    /* auto-injected by TetherIQ */\n  }\n}',
    configLocationDescription: '~/.devin/config.json or project devin.json',
    docsUrl: 'https://devin.ai'
  },
  {
    id: 'antigravity',
    name: 'Google Antigravity & Cline',
    category: 'agent',
    badge: 'Deep Coding',
    description: 'Autonomous multi-agent IDE and Cline extension. Full OpenTelemetry trace streaming and dynamic tool execution.',
    icon: 'Layers',
    oneClickAutoConfigAvailable: true,
    commandSnippet: '# Antigravity Workspace MCP Registry\n.mcp.json',
    codeSnippet: '{\n  "mcpServers": {\n    /* auto-injected by TetherIQ */\n  }\n}',
    configLocationDescription: '.mcp.json or ~/.mcp.json',
    docsUrl: 'https://antigravity.google'
  },
  {
    id: 'python-sdk',
    name: 'Python (OpenAI / Anthropic SDK)',
    category: 'sdk',
    badge: 'Scripts',
    description: 'Drop-in proxy redirect for custom Python AI agents, LangChain, LlamaIndex, or CrewAI.',
    icon: 'FileCode',
    oneClickAutoConfigAvailable: false,
    commandSnippet: 'pip install openai anthropic',
    codeSnippet: `from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:4000/v1",
    api_key="tetheriq-local-key"  # Handled locally by TetherIQ Vault
)

response = client.chat.completions.create(
    model="fast-code",  # Or 'heavy-reasoning', 'claude-3-7-sonnet'
    messages=[{"role": "user", "content": "Refactor this function"}]
)
print(response.choices[0].message.content)`,
    configLocationDescription: 'Direct SDK Client Initialization',
    docsUrl: 'https://github.com/openai/openai-python'
  },
  {
    id: 'nodejs-sdk',
    name: 'Node.js / TypeScript SDK',
    category: 'sdk',
    badge: 'Vercel AI SDK',
    description: 'Use with standard OpenAI Node SDK or Vercel AI SDK with zero configuration changes.',
    icon: 'Cpu',
    oneClickAutoConfigAvailable: false,
    commandSnippet: 'npm install openai @ai-sdk/openai',
    codeSnippet: `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://127.0.0.1:4000/v1",
  apiKey: "tetheriq-local-key",
});

const completion = await openai.chat.completions.create({
  model: "heavy-reasoning",
  messages: [{ role: "user", content: "Build a full REST endpoint" }],
});
console.log(completion.choices[0].message.content);`,
    configLocationDescription: 'Direct TypeScript / Node Script',
    docsUrl: 'https://github.com/openai/openai-node'
  }
];
