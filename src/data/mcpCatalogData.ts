import { McpToolDefinition, TargetClientMeta } from '../types/tools';

export const TARGET_CLIENTS_META: TargetClientMeta[] = [
  {
    id: 'cursor',
    name: 'Cursor IDE',
    category: 'ide',
    icon: 'Terminal',
    defaultConfigPathWin: '%USERPROFILE%\\.cursor\\mcp.json',
    defaultConfigPathMac: '~/.cursor/mcp.json',
    defaultConfigPathLinux: '~/.cursor/mcp.json',
    jsonKeyPath: 'mcpServers',
    instructions: 'Cursor loads MCP servers dynamically. Restart Cursor or reload window to apply.'
  },
  {
    id: 'windsurf',
    name: 'Windsurf IDE',
    category: 'ide',
    icon: 'Compass',
    defaultConfigPathWin: '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json',
    defaultConfigPathMac: '~/.codeium/windsurf/mcp_config.json',
    defaultConfigPathLinux: '~/.codeium/windsurf/mcp_config.json',
    jsonKeyPath: 'mcpServers',
    instructions: 'Cascade agent picks up configured tools in real-time.'
  },
  {
    id: 'claude-code',
    name: 'Claude Code CLI',
    category: 'cli',
    icon: 'Cpu',
    defaultConfigPathWin: '%USERPROFILE%\\.claude.json',
    defaultConfigPathMac: '~/.claude.json',
    defaultConfigPathLinux: '~/.claude.json',
    jsonKeyPath: 'mcpServers',
    instructions: 'Claude Code CLI accesses tools via stdio / SSE seamlessly. ANTHROPIC_BASE_URL is auto-configured.'
  },
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    category: 'ide',
    icon: 'Layers',
    defaultConfigPathWin: '%USERPROFILE%\\.gemini\\antigravity\\mcp_config.json',
    defaultConfigPathMac: '~/.gemini/antigravity/mcp_config.json',
    defaultConfigPathLinux: '~/.gemini/antigravity/mcp_config.json',
    jsonKeyPath: 'mcpServers',
    instructions: 'Antigravity reads ~/.gemini/antigravity/mcp_config.json. Reload window or run /mcp to apply.'
  },
  {
    id: 'cline',
    name: 'Cline (VS Code)',
    category: 'ide',
    icon: 'Bot',
    defaultConfigPathWin: '%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json',
    defaultConfigPathMac: '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
    defaultConfigPathLinux: '~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
    jsonKeyPath: 'mcpServers',
    instructions: 'Cline MCP settings. Reload VS Code window to activate newly configured tools.'
  },
  {
    id: 'vscode',
    name: 'VS Code Copilot / MCP',
    category: 'ide',
    icon: 'Code2',
    defaultConfigPathWin: '%APPDATA%\\Code\\User\\mcp.json',
    defaultConfigPathMac: '~/Library/Application Support/Code/User/mcp.json',
    defaultConfigPathLinux: '~/.config/Code/User/mcp.json',
    jsonKeyPath: 'servers',
    instructions: 'VS Code MCP global configuration. Reload window to activate.'
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    category: 'desktop',
    icon: 'MessageSquare',
    defaultConfigPathWin: '%APPDATA%\\Claude\\claude_desktop_config.json',
    defaultConfigPathMac: '~/Library/Application Support/Claude/claude_desktop_config.json',
    defaultConfigPathLinux: '~/.config/Claude/claude_desktop_config.json',
    jsonKeyPath: 'mcpServers',
    instructions: 'Claude Desktop official app config.'
  },
  {
    id: 'devin',
    name: 'Devin',
    category: 'agent',
    icon: 'Bot',
    defaultConfigPathWin: '%USERPROFILE%\\.devin\\config.json',
    defaultConfigPathMac: '~/.devin/config.json',
    defaultConfigPathLinux: '~/.devin/config.json',
    jsonKeyPath: 'mcpServers',
    instructions: 'Injected into Devin workspace tool registry for autonomous execution.'
  },
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    category: 'cli',
    icon: 'Terminal',
    defaultConfigPathWin: '%USERPROFILE%\\.codex\\config.toml',
    defaultConfigPathMac: '~/.codex/config.toml',
    defaultConfigPathLinux: '~/.codex/config.toml',
    jsonKeyPath: 'mcp_servers',
    instructions: 'OpenAI Codex CLI configuration in TOML.'
  }
];

export const MCP_CATALOG: McpToolDefinition[] = [
  // 1. DATA & CLOUD
  {
    id: 'databricks',
    name: 'Databricks MCP',
    description: 'Query Unity Catalog tables, run SQL warehouses, manage Genie spaces and compute clusters directly from agents.',
    category: 'data-cloud',
    official: true,
    author: 'Databricks',
    icon: 'Database',
    command: 'npx',
    args: ['-y', '@databricks/mcp-server@0.2.1'],
    fields: [
      { key: 'DATABRICKS_HOST', label: 'Databricks Workspace Host URL', description: 'e.g. https://dbc-xxxx.cloud.databricks.com', type: 'url', required: true, placeholder: 'https://dbc-xxxx.cloud.databricks.com' },
      { key: 'DATABRICKS_TOKEN', label: 'Personal Access Token (PAT)', description: 'Databricks OAuth / User Access Token', type: 'password', required: true, placeholder: 'dapi...', helpUrl: 'https://docs.databricks.com/en/dev-tools/auth/pat.html' },
      { key: 'DATABRICKS_WAREHOUSE_ID', label: 'SQL Warehouse ID (Optional)', description: 'Default warehouse for SQL execution', type: 'string', required: false, placeholder: '1a2b3c4d5e6f7g8h' }
    ],
    defaultEnv: {},
    docsUrl: 'https://docs.databricks.com'
  },
  {
    id: 'snowflake',
    name: 'Snowflake MCP',
    description: 'Execute analytical queries, explore schema metadata, and inspect Cortex LLM features in Snowflake.',
    category: 'data-cloud',
    official: true,
    author: 'Snowflake',
    icon: 'Cloud',
    command: 'npx',
    args: ['-y', '@snowflake/mcp-server@0.1.5'],
    fields: [
      { key: 'SNOWFLAKE_ACCOUNT', label: 'Account Identifier', description: 'e.g. xy12345.us-east-1', type: 'string', required: true, placeholder: 'xy12345' },
      { key: 'SNOWFLAKE_USER', label: 'Username', description: 'Snowflake user login', type: 'string', required: true, placeholder: 'ADMIN' },
      { key: 'SNOWFLAKE_PASSWORD', label: 'Password / Key', description: 'Account password or private key path', type: 'password', required: true, helpUrl: 'https://docs.snowflake.com/en/user-guide/admin-user-management' },
      { key: 'SNOWFLAKE_WAREHOUSE', label: 'Warehouse Name', description: 'e.g. COMPUTE_WH', type: 'string', required: true, placeholder: 'COMPUTE_WH' },
      { key: 'SNOWFLAKE_DATABASE', label: 'Database Name', description: 'e.g. ANALYTICS_PROD', type: 'string', required: true, placeholder: 'ANALYTICS_PROD' }
    ],
    defaultEnv: {},
    docsUrl: 'https://snowflake.com'
  },
  {
    id: 'bigquery',
    name: 'Google BigQuery MCP',
    description: 'Query BigQuery datasets, analyze tables, and run high-concurrency SQL analytics on GCP.',
    category: 'data-cloud',
    official: true,
    author: 'Google Cloud',
    icon: 'Database',
    command: 'npx',
    args: ['-y', '@google-cloud/mcp-bigquery@0.1.2'],
    fields: [
      { key: 'GOOGLE_APPLICATION_CREDENTIALS', label: 'Service Account JSON Path', description: 'Path to GCP service account key', type: 'string', required: true, placeholder: '/path/to/key.json' },
      { key: 'GCP_PROJECT_ID', label: 'GCP Project ID', description: 'Google Cloud Project ID', type: 'string', required: true, placeholder: 'my-gcp-project' }
    ],
    defaultEnv: {}
  },
  {
    id: 'supabase',
    name: 'Supabase MCP',
    description: 'Manage Postgres schemas, run SQL queries, inspect Edge Functions, and manage storage buckets.',
    category: 'data-cloud',
    official: true,
    author: 'Supabase',
    icon: 'Zap',
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase@0.4.1'],
    fields: [
      { 
        key: 'SUPABASE_ACCESS_TOKEN', 
        label: 'Supabase Personal Access Token', 
        description: 'Obtained from Supabase Account Settings -> Access Tokens', 
        type: 'password', 
        required: true, 
        placeholder: 'sbp_...', 
        validationRegex: '^sbp_[a-zA-Z0-9_-]+$',
        validationMessage: 'Token must begin with "sbp_"',
        helpUrl: 'https://supabase.com/dashboard/account/tokens'
      },
      { 
        key: 'SUPABASE_PROJECT_REF', 
        label: 'Project Reference ID (Optional for Remote HTTP)', 
        description: 'e.g. abcdefghijklmnop', 
        type: 'string', 
        required: false, 
        placeholder: 'abcdefghijklmnop',
        validationRegex: '^[a-z]{20}$',
        validationMessage: 'Project Ref is 20 lowercase letters',
        helpUrl: 'https://supabase.com/dashboard/projects'
      }
    ],
    defaultEnv: {},
    docsUrl: 'https://supabase.com/docs/guides/ai/mcp-server'
  },
  {
    id: 'postgres',
    name: 'PostgreSQL MCP',
    description: 'Read-only and write inspection of PostgreSQL databases with schema reflection and parameter validation.',
    category: 'data-cloud',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'Database',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres@0.6.2'],
    fields: [
      { 
        key: 'POSTGRES_CONNECTION_STRING', 
        label: 'Postgres Connection URI', 
        description: 'postgresql://user:password@localhost:5432/dbname', 
        type: 'password', 
        required: true, 
        placeholder: 'postgresql://postgres:postgres@localhost:5432/db',
        isPositionalArg: true
      }
    ],
    defaultEnv: {}
  },
  {
    id: 'duckdb',
    name: 'DuckDB MCP',
    description: 'Blazing fast local analytical SQL engine on parquet, CSV, and embedded databases.',
    category: 'data-cloud',
    official: true,
    author: 'DuckDB Labs',
    icon: 'Box',
    command: 'npx',
    args: ['-y', '@duckdb/mcp-server@0.1.3'],
    fields: [
      { key: 'DUCKDB_PATH', label: 'DuckDB File Path', description: 'Local path or :memory:', type: 'string', required: false, defaultValue: ':memory:', placeholder: ':memory:', isPositionalArg: true }
    ],
    defaultEnv: {}
  },
  {
    id: 'sqlite',
    name: 'SQLite MCP',
    description: 'Query, explore schemas, and manipulate local SQLite databases safely.',
    category: 'data-cloud',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'Database',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite@0.6.2', '--db-path'],
    fields: [
      { 
        key: 'SQLITE_DB_PATH', 
        label: 'SQLite File Path', 
        description: 'Full path to .sqlite or .db file', 
        type: 'string', 
        required: true, 
        placeholder: 'C:/data/app.db',
        isPositionalArg: true
      }
    ],
    defaultEnv: {}
  },
  {
    id: 'clickhouse',
    name: 'ClickHouse MCP',
    description: 'Fast open-source column-oriented DBMS for real-time analytical reporting.',
    category: 'data-cloud',
    official: true,
    author: 'ClickHouse',
    icon: 'Server',
    command: 'npx',
    args: ['-y', '@clickhouse/mcp-server@0.1.4'],
    fields: [
      { key: 'CLICKHOUSE_HOST', label: 'ClickHouse Host', description: 'Host endpoint URL', type: 'url', required: true, placeholder: 'https://clickhouse.example.com:8443' },
      { key: 'CLICKHOUSE_USER', label: 'Username', description: 'User login', type: 'string', required: true, defaultValue: 'default' },
      { key: 'CLICKHOUSE_PASSWORD', label: 'Password', description: 'Password', type: 'password', required: true }
    ],
    defaultEnv: {}
  },
  {
    id: 'redis',
    name: 'Redis MCP',
    description: 'Interact with Redis key-value stores, pub/sub channels, and memory caching structures.',
    category: 'data-cloud',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'Layers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-redis@0.6.2'],
    fields: [
      { key: 'REDIS_URL', label: 'Redis URL', description: 'e.g. redis://localhost:6379', type: 'string', required: true, defaultValue: 'redis://localhost:6379', placeholder: 'redis://localhost:6379' }
    ],
    defaultEnv: {}
  },
  {
    id: 'neo4j',
    name: 'Neo4j Graph MCP',
    description: 'Execute Cypher graph queries and explore relationship knowledge graphs.',
    category: 'data-cloud',
    official: true,
    author: 'Neo4j',
    icon: 'Share2',
    command: 'npx',
    args: ['-y', '@neo4j/mcp-server@0.1.2'],
    fields: [
      { key: 'NEO4J_URI', label: 'Bolt URI', description: 'bolt://localhost:7687 or neo4j+s://...', type: 'string', required: true, placeholder: 'bolt://localhost:7687' },
      { key: 'NEO4J_USERNAME', label: 'Username', description: 'Neo4j user', type: 'string', required: true, defaultValue: 'neo4j' },
      { key: 'NEO4J_PASSWORD', label: 'Password', description: 'Neo4j password', type: 'password', required: true }
    ],
    defaultEnv: {}
  },

  // 2. PRODUCTIVITY & MANAGEMENT
  {
    id: 'notion',
    name: 'Notion MCP',
    description: 'Read and update Notion databases, pages, tasks, documentation, and comments via official Notion API.',
    category: 'productivity',
    official: true,
    author: 'Notion',
    icon: 'FileText',
    command: 'npx',
    args: ['-y', '@notionhq/mcp-server@0.1.5'],
    fields: [
      { key: 'NOTION_API_KEY', label: 'Notion Internal Integration Token', description: 'Created in notion.so/profile/integrations', type: 'password', required: true, placeholder: 'secret_...', helpUrl: 'https://www.notion.so/my-integrations' }
    ],
    defaultEnv: {},
    docsUrl: 'https://developers.notion.com'
  },
  {
    id: 'slack',
    name: 'Slack MCP',
    description: 'Send channel messages, read threads, list users, and interact with Slack workspaces.',
    category: 'productivity',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'MessageSquare',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack@0.6.2'],
    fields: [
      { 
        key: 'SLACK_BOT_TOKEN', 
        label: 'Slack Bot User OAuth Token', 
        description: 'xoxb-... bot token from api.slack.com/apps', 
        type: 'password', 
        required: true, 
        placeholder: 'xoxb-...',
        validationRegex: '^xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+$',
        validationMessage: 'Slack Bot Token must begin with "xoxb-"',
        helpUrl: 'https://api.slack.com/apps'
      },
      { 
        key: 'SLACK_TEAM_ID', 
        label: 'Team ID (Optional)', 
        description: 'Workspace Team ID (e.g. T01234567)', 
        type: 'string', 
        required: false,
        placeholder: 'T01234567',
        validationRegex: '^T[A-Z0-9]+$',
        validationMessage: 'Team ID starts with "T"'
      }
    ],
    defaultEnv: {},
    docsUrl: 'https://api.slack.com/apps'
  },
  {
    id: 'linear',
    name: 'Linear MCP',
    description: 'Create, search, update, and manage Linear issues, projects, cycles, and roadmaps.',
    category: 'productivity',
    official: true,
    author: 'Linear',
    icon: 'CheckSquare',
    command: 'npx',
    args: ['-y', '@linear/mcp-server@0.1.3'],
    fields: [
      { 
        key: 'LINEAR_API_KEY', 
        label: 'Linear API Key', 
        description: 'Personal API key from Linear Settings -> API', 
        type: 'password', 
        required: true, 
        placeholder: 'lin_api_...',
        validationRegex: '^lin_api_[a-zA-Z0-9]+$',
        validationMessage: 'Linear key must begin with "lin_api_"',
        helpUrl: 'https://linear.app/settings/api'
      }
    ],
    defaultEnv: {},
    docsUrl: 'https://linear.app/settings/api'
  },
  {
    id: 'jira',
    name: 'Atlassian Jira MCP',
    description: 'Search Jira tickets with JQL, create bugs/tasks, and update sprint workflows.',
    category: 'productivity',
    official: true,
    author: 'Atlassian',
    icon: 'Clipboard',
    command: 'npx',
    args: ['-y', '@atlassian/jira-mcp@0.1.2'],
    fields: [
      { key: 'JIRA_HOST', label: 'Jira Cloud Domain', description: 'e.g. https://company.atlassian.net', type: 'url', required: true, placeholder: 'https://myorg.atlassian.net' },
      { key: 'JIRA_EMAIL', label: 'Account Email', description: 'Atlassian user email', type: 'string', required: true, placeholder: 'user@company.com' },
      { key: 'JIRA_API_TOKEN', label: 'API Token', description: 'Generated from id.atlassian.com', type: 'password', required: true, helpUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens' }
    ],
    defaultEnv: {}
  },
  {
    id: 'confluence',
    name: 'Atlassian Confluence MCP',
    description: 'Search knowledge base docs, read space architecture specs, and write documentation pages.',
    category: 'productivity',
    official: true,
    author: 'Atlassian',
    icon: 'BookOpen',
    command: 'npx',
    args: ['-y', '@atlassian/confluence-mcp@0.1.2'],
    fields: [
      { key: 'CONFLUENCE_HOST', label: 'Confluence Domain', description: 'https://company.atlassian.net/wiki', type: 'url', required: true, placeholder: 'https://myorg.atlassian.net/wiki' },
      { key: 'CONFLUENCE_EMAIL', label: 'Account Email', description: 'Atlassian email', type: 'string', required: true },
      { key: 'CONFLUENCE_API_TOKEN', label: 'API Token', description: 'Atlassian API token', type: 'password', required: true, helpUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens' }
    ],
    defaultEnv: {}
  },
  {
    id: 'todoist',
    name: 'Todoist MCP',
    description: 'Manage personal and project task lists, due dates, labels, and reminders.',
    category: 'productivity',
    official: true,
    author: 'Doist',
    icon: 'CheckCircle',
    command: 'npx',
    args: ['-y', '@todoist/mcp-server@0.1.1'],
    fields: [
      { key: 'TODOIST_API_TOKEN', label: 'Todoist API Token', description: 'From Todoist Integrations -> Developer Settings', type: 'password', required: true, helpUrl: 'https://todoist.com/app/settings/integrations/developer' }
    ],
    defaultEnv: {}
  },
  {
    id: 'airtable',
    name: 'Airtable MCP',
    description: 'Query, insert, and update structured records in Airtable bases.',
    category: 'productivity',
    official: true,
    author: 'Airtable',
    icon: 'Grid',
    command: 'npx',
    args: ['-y', '@airtable/mcp-server@0.1.2'],
    fields: [
      { key: 'AIRTABLE_PERSONAL_ACCESS_TOKEN', label: 'Airtable PAT', description: 'From airtable.com/create/tokens', type: 'password', required: true, placeholder: 'pat...', helpUrl: 'https://airtable.com/create/tokens' },
      { key: 'AIRTABLE_BASE_ID', label: 'Base ID (Optional)', description: 'e.g. appXXXXXXXXXXXXXX', type: 'string', required: false }
    ],
    defaultEnv: {}
  },
  {
    id: 'obsidian',
    name: 'Obsidian Local Vault MCP',
    description: 'Search markdown notes, extract frontmatter tags, and link knowledge graph in local Obsidian vaults.',
    category: 'productivity',
    official: false,
    author: 'Obsidian Community',
    icon: 'Edit3',
    command: 'npx',
    args: ['-y', '@obsidian/mcp-local@0.1.0'],
    fields: [
      { key: 'OBSIDIAN_VAULT_PATH', label: 'Vault Directory Path', description: 'Absolute path to your local markdown vault', type: 'string', required: true, placeholder: 'C:/Users/name/Documents/Vault' }
    ],
    defaultEnv: {}
  },

  // 3. DEVELOPER TOOLS & DEVOPS
  {
    id: 'github',
    name: 'GitHub MCP Server',
    description: 'Search repositories, manage pull requests, create and read issues, inspect file trees, and commit code.',
    category: 'dev-ci',
    official: true,
    author: 'GitHub / Anthropic',
    icon: 'GitPullRequest',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github@0.6.2'],
    fields: [
      { 
        key: 'GITHUB_PERSONAL_ACCESS_TOKEN', 
        label: 'GitHub Personal Access Token', 
        description: 'Personal Access Token with repo, issues, and workflow permissions', 
        type: 'password', 
        required: true, 
        placeholder: 'ghp_...',
        validationRegex: '^(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})$',
        validationMessage: 'GitHub PAT must begin with "ghp_" or "github_pat_"',
        helpUrl: 'https://github.com/settings/tokens'
      }
    ],
    defaultEnv: {},
    docsUrl: 'https://github.com'
  },
  {
    id: 'gitlab',
    name: 'GitLab MCP Server',
    description: 'Interact with GitLab merge requests, CI pipelines, and repository files.',
    category: 'dev-ci',
    official: true,
    author: 'GitLab',
    icon: 'GitBranch',
    command: 'npx',
    args: ['-y', '@gitlab/mcp-server@0.1.3'],
    fields: [
      { key: 'GITLAB_PERSONAL_ACCESS_TOKEN', label: 'GitLab Access Token', description: 'Personal Access Token with read/write API access', type: 'password', required: true, placeholder: 'glpat-...', helpUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens' },
      { key: 'GITLAB_URL', label: 'GitLab Instance URL (Optional)', description: 'Default https://gitlab.com', type: 'url', required: false, defaultValue: 'https://gitlab.com' }
    ],
    defaultEnv: {}
  },
  {
    id: 'docker',
    name: 'Docker MCP',
    description: 'List, start, stop, inspect, and build Docker containers and compose stacks locally.',
    category: 'dev-ci',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'Package',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-docker@0.6.2'],
    fields: [
      { key: 'DOCKER_HOST', label: 'Docker Socket / Host (Optional)', description: 'Default npipe:////./pipe/docker_engine on Windows or unix:///var/run/docker.sock', type: 'string', required: false }
    ],
    defaultEnv: {}
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes MCP',
    description: 'Inspect K8s pods, deployments, services, logs, and apply cluster manifests.',
    category: 'dev-ci',
    official: true,
    author: 'Kubernetes SIGs',
    icon: 'Anchor',
    command: 'npx',
    args: ['-y', '@kubernetes/mcp-server@0.1.2'],
    fields: [
      { key: 'KUBECONFIG', label: 'Kubeconfig File Path (Optional)', description: 'Default ~/.kube/config', type: 'string', required: false, placeholder: '~/.kube/config' }
    ],
    defaultEnv: {}
  },
  {
    id: 'sentry',
    name: 'Sentry MCP',
    description: 'Retrieve real-time error traces, stack traces, issue frequency, and performance anomalies.',
    category: 'dev-ci',
    official: true,
    author: 'Sentry',
    icon: 'AlertTriangle',
    command: 'npx',
    args: ['-y', '@sentry/mcp-server@0.1.4'],
    fields: [
      { key: 'SENTRY_AUTH_TOKEN', label: 'Sentry Auth Token', description: 'User Auth token with event:read and project:read', type: 'password', required: true, placeholder: 'sntryu_...', helpUrl: 'https://sentry.io/settings/account/api/auth-tokens/' },
      { key: 'SENTRY_ORG', label: 'Organization Slug', description: 'Your Sentry organization slug', type: 'string', required: true, placeholder: 'my-org' }
    ],
    defaultEnv: {}
  },
  {
    id: 'postman',
    name: 'Postman MCP',
    description: 'Execute API collections, test REST endpoints, and inspect OpenAPI specifications.',
    category: 'dev-ci',
    official: true,
    author: 'Postman',
    icon: 'Send',
    command: 'npx',
    args: ['-y', '@postman/mcp-server@0.1.1'],
    fields: [
      { key: 'POSTMAN_API_KEY', label: 'Postman API Key', description: 'API Key from Postman Account settings', type: 'password', required: true, placeholder: 'PMAK-...', helpUrl: 'https://web.postman.co/settings/me/api-keys' }
    ],
    defaultEnv: {}
  },
  {
    id: 'git',
    name: 'Git CLI MCP',
    description: 'Run local git operations: diff, log, branch, stash, status, and blame.',
    category: 'dev-ci',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'GitCommit',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git@0.6.2'],
    fields: [
      { key: 'GIT_ROOT_DIR', label: 'Root Repository Directory (Optional)', description: 'Directory to run git commands in', type: 'string', required: false }
    ],
    defaultEnv: {}
  },

  // 4. CLOUD & INFRASTRUCTURE
  {
    id: 'aws',
    name: 'AWS Cloud MCP',
    description: 'Interact with AWS S3, CloudWatch logs, DynamoDB, Bedrock, and Lambda functions.',
    category: 'cloud-infra',
    official: true,
    author: 'Amazon Web Services',
    icon: 'Cloud',
    command: 'npx',
    args: ['-y', '@aws/mcp-server@0.1.5'],
    fields: [
      { key: 'AWS_ACCESS_KEY_ID', label: 'AWS Access Key ID', description: 'IAM Access Key ID', type: 'string', required: true, placeholder: 'AKIA...', helpUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials' },
      { key: 'AWS_SECRET_ACCESS_KEY', label: 'AWS Secret Access Key', description: 'IAM Secret Access Key', type: 'password', required: true, helpUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials' },
      { key: 'AWS_REGION', label: 'Default AWS Region', description: 'e.g. us-east-1', type: 'string', required: true, defaultValue: 'us-east-1' }
    ],
    defaultEnv: {}
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare MCP',
    description: 'Manage Cloudflare DNS, Workers, KV stores, and R2 object storage.',
    category: 'cloud-infra',
    official: true,
    author: 'Cloudflare',
    icon: 'Globe',
    command: 'npx',
    args: ['-y', '@cloudflare/mcp-server@0.1.3'],
    fields: [
      { key: 'CLOUDFLARE_API_TOKEN', label: 'Cloudflare API Token', description: 'API token with Workers and DNS permissions', type: 'password', required: true, helpUrl: 'https://dash.cloudflare.com/profile/api-tokens' },
      { key: 'CLOUDFLARE_ACCOUNT_ID', label: 'Account ID', description: 'Cloudflare Account ID', type: 'string', required: true }
    ],
    defaultEnv: {}
  },
  {
    id: 'datadog',
    name: 'Datadog MCP',
    description: 'Query APM metrics, monitor alerts, inspect trace spans, and search host logs.',
    category: 'cloud-infra',
    official: true,
    author: 'Datadog',
    icon: 'Activity',
    command: 'npx',
    args: ['-y', '@datadog/mcp-server@0.1.2'],
    fields: [
      { key: 'DATADOG_API_KEY', label: 'Datadog API Key', description: 'API Key', type: 'password', required: true, helpUrl: 'https://app.datadoghq.com/organization-settings/api-keys' },
      { key: 'DATADOG_APP_KEY', label: 'Datadog Application Key', description: 'Application Key', type: 'password', required: true, helpUrl: 'https://app.datadoghq.com/organization-settings/api-keys' },
      { key: 'DATADOG_SITE', label: 'Site (Optional)', description: 'datadoghq.com or datadoghq.eu', type: 'string', required: false, defaultValue: 'datadoghq.com' }
    ],
    defaultEnv: {}
  },
  {
    id: 'vercel',
    name: 'Vercel MCP',
    description: 'Inspect deployment status, build logs, environment variables, and project domains.',
    category: 'cloud-infra',
    official: true,
    author: 'Vercel',
    icon: 'Triangle',
    command: 'npx',
    args: ['-y', '@vercel/mcp-server@0.1.4'],
    fields: [
      { key: 'VERCEL_TOKEN', label: 'Vercel Personal Access Token', description: 'From vercel.com/account/tokens', type: 'password', required: true, placeholder: 'ver_...', helpUrl: 'https://vercel.com/account/tokens' },
      { key: 'VERCEL_TEAM_ID', label: 'Team ID (Optional)', description: 'Optional team context', type: 'string', required: false }
    ],
    defaultEnv: {}
  },

  // 5. SEARCH & SCRAPING
  {
    id: 'brave-search',
    name: 'Brave Search MCP',
    description: 'Live private web search, news queries, local business data, and web results without tracking.',
    category: 'search-scraping',
    official: true,
    author: 'Brave Software / Anthropic',
    icon: 'Search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search@0.6.2'],
    fields: [
      { key: 'BRAVE_API_KEY', label: 'Brave Search API Key', description: 'API key from brave.com/search/api', type: 'password', required: true, placeholder: 'BSA...', helpUrl: 'https://brave.com/search/api/' }
    ],
    defaultEnv: {},
    docsUrl: 'https://brave.com/search/api/'
  },
  {
    id: 'tavily',
    name: 'Tavily AI Search MCP',
    description: 'Search engine optimized specifically for LLMs and autonomous agents with clean extracted text.',
    category: 'search-scraping',
    official: true,
    author: 'Tavily',
    icon: 'Compass',
    command: 'npx',
    args: ['-y', '@tavily/mcp-server@0.1.2'],
    fields: [
      { key: 'TAVILY_API_KEY', label: 'Tavily API Key', description: 'API key from app.tavily.com', type: 'password', required: true, placeholder: 'tvly-...', helpUrl: 'https://app.tavily.com/home' }
    ],
    defaultEnv: {}
  },
  {
    id: 'exa',
    name: 'Exa AI Neural Search MCP',
    description: 'Neural search designed for research, finding similar links, and extracting full web content.',
    category: 'search-scraping',
    official: true,
    author: 'Exa',
    icon: 'Search',
    command: 'npx',
    args: ['-y', '@exa/mcp-server@0.1.3'],
    fields: [
      { key: 'EXA_API_KEY', label: 'Exa API Key', description: 'API key from exa.ai', type: 'password', required: true, helpUrl: 'https://dashboard.exa.ai/api-keys' }
    ],
    defaultEnv: {}
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer Browser MCP',
    description: 'Control headless Chrome to render JavaScript, click buttons, fill forms, and take screenshots.',
    category: 'search-scraping',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'Monitor',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer@0.6.2'],
    fields: [],
    defaultEnv: {}
  },
  {
    id: 'playwright',
    name: 'Playwright Browser MCP',
    description: 'Automate Chromium, Firefox, and WebKit for robust cross-browser scraping and E2E validation.',
    category: 'search-scraping',
    official: true,
    author: 'Microsoft Playwright',
    icon: 'Eye',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-playwright@0.1.2'],
    fields: [],
    defaultEnv: {}
  },
  {
    id: 'fetch',
    name: 'Fetch & Markdown Scraper MCP',
    description: 'Converts any web page into clean, token-efficient Markdown for LLM ingestion.',
    category: 'search-scraping',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'FileCode',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch@0.6.2'],
    fields: [],
    defaultEnv: {}
  },

  // 6. AI & VECTOR STORES
  {
    id: 'pinecone',
    name: 'Pinecone Vector DB MCP',
    description: 'Query vector indexes, upsert embeddings, and perform ultra-low latency semantic retrieval.',
    category: 'ai-vector',
    official: true,
    author: 'Pinecone',
    icon: 'Cpu',
    command: 'npx',
    args: ['-y', '@pinecone-io/mcp-server@0.1.2'],
    fields: [
      { key: 'PINECONE_API_KEY', label: 'Pinecone API Key', description: 'API key from app.pinecone.io', type: 'password', required: true, placeholder: 'pcsk_...', helpUrl: 'https://app.pinecone.io/keys' },
      { key: 'PINECONE_INDEX_NAME', label: 'Index Name', description: 'Target vector index', type: 'string', required: true, placeholder: 'my-index' }
    ],
    defaultEnv: {}
  },
  {
    id: 'qdrant',
    name: 'Qdrant Vector DB MCP',
    description: 'Vector similarity search engine with rich payload filtering and fast distance metrics.',
    category: 'ai-vector',
    official: true,
    author: 'Qdrant',
    icon: 'Target',
    command: 'npx',
    args: ['-y', '@qdrant/mcp-server@0.1.3'],
    fields: [
      { key: 'QDRANT_URL', label: 'Qdrant Server URL', description: 'e.g. http://localhost:6333', type: 'url', required: true, defaultValue: 'http://localhost:6333' },
      { key: 'QDRANT_API_KEY', label: 'API Key (Optional)', description: 'For Qdrant Cloud instances', type: 'password', required: false }
    ],
    defaultEnv: {}
  },
  {
    id: 'chroma',
    name: 'ChromaDB MCP',
    description: 'Embedded AI vector database for document embeddings and collections.',
    category: 'ai-vector',
    official: true,
    author: 'Chroma',
    icon: 'Database',
    command: 'npx',
    args: ['-y', '@chroma-core/mcp-server@0.1.1'],
    fields: [
      { key: 'CHROMA_SERVER_URL', label: 'Chroma Server URL (Optional)', description: 'Default localhost:8000', type: 'url', required: false, defaultValue: 'http://localhost:8000' }
    ],
    defaultEnv: {}
  },
  {
    id: 'memory',
    name: 'Semantic Long-Term Memory MCP',
    description: 'Graph-based persistent knowledge memory that remembers user preferences and project facts across sessions.',
    category: 'ai-vector',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'Brain',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory@0.6.2'],
    fields: [],
    defaultEnv: {}
  },

  // 7. E-COMMERCE & COMMUNICATIONS
  {
    id: 'stripe',
    name: 'Stripe MCP',
    description: 'Inspect customer balances, invoices, payment intents, subscriptions, and refund logs via official Stripe MCP.',
    category: 'ecommerce-comms',
    official: true,
    author: 'Stripe',
    icon: 'CreditCard',
    command: 'npx',
    args: ['-y', '@stripe/mcp@0.1.5', '--tools=all'],
    transportType: 'stdio',
    url: 'https://mcp.stripe.com',
    fields: [
      { key: 'STRIPE_SECRET_KEY', label: 'Stripe Restricted / Secret Key', description: 'sk_live_... or sk_test_... (or use remote OAuth)', type: 'password', required: true, placeholder: 'sk_test_...', helpUrl: 'https://dashboard.stripe.com/apikeys' }
    ],
    defaultEnv: {},
    docsUrl: 'https://docs.stripe.com'
  },
  {
    id: 'shopify',
    name: 'Shopify Store MCP',
    description: 'Manage storefront products, inventory quantities, customer orders, and discounts.',
    category: 'ecommerce-comms',
    official: true,
    author: 'Shopify',
    icon: 'ShoppingBag',
    command: 'npx',
    args: ['-y', '@shopify/mcp-server@0.1.2'],
    fields: [
      { key: 'SHOPIFY_STORE_DOMAIN', label: 'Shopify Store Domain', description: 'e.g. my-store.myshopify.com', type: 'string', required: true, placeholder: 'my-store.myshopify.com' },
      { key: 'SHOPIFY_ADMIN_ACCESS_TOKEN', label: 'Admin API Access Token', description: 'shpat_... access token', type: 'password', required: true, helpUrl: 'https://help.shopify.com/en/manual/apps/app-types/custom-apps' }
    ],
    defaultEnv: {}
  },
  {
    id: 'twilio',
    name: 'Twilio MCP',
    description: 'Send SMS notifications, check delivery statuses, and handle voice calling webhooks.',
    category: 'ecommerce-comms',
    official: true,
    author: 'Twilio',
    icon: 'PhoneCall',
    command: 'npx',
    args: ['-y', '@twilio/mcp-server@0.1.2'],
    fields: [
      { key: 'TWILIO_ACCOUNT_SID', label: 'Account SID', description: 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', type: 'string', required: true, placeholder: 'AC...', helpUrl: 'https://console.twilio.com/' },
      { key: 'TWILIO_AUTH_TOKEN', label: 'Auth Token', description: 'Twilio Auth Token', type: 'password', required: true, helpUrl: 'https://console.twilio.com/' },
      { key: 'TWILIO_PHONE_NUMBER', label: 'Sender Phone Number', description: '+1234567890', type: 'string', required: true }
    ],
    defaultEnv: {}
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs Voice AI MCP',
    description: 'Generate lifelike voice speech, text-to-speech audio files, and voice cloning models.',
    category: 'ecommerce-comms',
    official: true,
    author: 'ElevenLabs',
    icon: 'Volume2',
    command: 'npx',
    args: ['-y', '@elevenlabs/mcp-server@0.1.2'],
    fields: [
      { key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API Key', description: 'API Key from elevenlabs.io', type: 'password', required: true, helpUrl: 'https://elevenlabs.io/app/speech-synthesis/api-keys' }
    ],
    defaultEnv: {}
  },

  // 8. SYSTEM & UTILITIES
  {
    id: 'filesystem',
    name: 'Local Filesystem MCP',
    description: 'Read and write local files and directories within secure permitted paths.',
    category: 'system',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'Folder',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem@0.6.2'],
    fields: [
      { 
        key: 'ALLOWED_DIRECTORIES', 
        label: 'Allowed Directories (Comma-separated)', 
        description: 'Absolute directories the agent may read/write (e.g. C:/Projects, C:/Workspace)', 
        type: 'string', 
        required: true, 
        defaultValue: 'C:/Projects', 
        placeholder: 'C:/Projects',
        isPositionalArg: true
      }
    ],
    defaultEnv: {}
  },
  {
    id: 'time',
    name: 'Time & Clock MCP',
    description: 'Provides exact local and UTC time, timezone conversions, and date calculations for agents.',
    category: 'system',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'Clock',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-time@0.6.2'],
    fields: [],
    defaultEnv: {}
  },

  // 9. REASONING, MEDIA & GOOGLE WORKSPACE
  {
    id: 'gdrive',
    name: 'Google Drive MCP',
    description: 'Search, list, and read documents, spreadsheets, and files directly from Google Drive.',
    category: 'productivity',
    official: true,
    author: 'Model Context Protocol Community',
    icon: 'HardDrive',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive@0.6.2'],
    fields: [
      { key: 'GDRIVE_CLIENT_ID', label: 'OAuth Client ID', description: 'From Google Cloud Console', type: 'string', required: true },
      { key: 'GDRIVE_CLIENT_SECRET', label: 'OAuth Client Secret', description: 'Google Cloud OAuth secret', type: 'password', required: true }
    ],
    defaultEnv: {}
  },
  {
    id: 'google-maps',
    name: 'Google Maps & Places MCP',
    description: 'Search locations, calculate travel directions, lookup place reviews, and geocode addresses.',
    category: 'search-scraping',
    official: true,
    author: 'Model Context Protocol Community',
    icon: 'Compass',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps@0.6.2'],
    fields: [
      { key: 'GOOGLE_MAPS_API_KEY', label: 'Google Maps API Key', description: 'From Google Cloud Maps Platform', type: 'password', required: true, helpUrl: 'https://console.cloud.google.com/google/maps-apis' }
    ],
    defaultEnv: {}
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking MCP',
    description: 'Dynamic problem-solving and structured multi-step reasoning framework for complex tasks.',
    category: 'system',
    official: true,
    author: 'Anthropic Model Context Protocol',
    icon: 'Sparkles',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking@0.6.2'],
    fields: [],
    defaultEnv: {}
  },
  {
    id: 'everart',
    name: 'Everart AI Media MCP',
    description: 'Generate high-resolution images, brand visuals, and creative assets using curated models.',
    category: 'ecommerce-comms',
    official: true,
    author: 'Everart AI',
    icon: 'Image',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everart@0.1.1'],
    fields: [
      { key: 'EVERART_API_KEY', label: 'Everart API Key', description: 'From everart.ai dashboard', type: 'password', required: true, helpUrl: 'https://www.everart.ai' }
    ],
    defaultEnv: {}
  },

  // 10. ENTERPRISE CRM & CUSTOMER SUPPORT
  {
    id: 'hubspot',
    name: 'HubSpot CRM MCP',
    description: 'Search contacts, companies, deals, tickets, and log sales activities directly in HubSpot.',
    category: 'data-cloud',
    official: true,
    author: 'HubSpot',
    icon: 'Users',
    command: 'npx',
    args: ['-y', '@hubspot/mcp-server@0.1.3'],
    fields: [
      { key: 'HUBSPOT_ACCESS_TOKEN', label: 'Private App Access Token', description: 'From HubSpot Settings -> Integrations -> Private Apps', type: 'password', required: true, helpUrl: 'https://app.hubspot.com' }
    ],
    defaultEnv: {}
  },
  {
    id: 'zendesk',
    name: 'Zendesk Support MCP',
    description: 'Query customer support tickets, manage agent responses, and search help center knowledge bases.',
    category: 'productivity',
    official: true,
    author: 'Zendesk',
    icon: 'LifeBuoy',
    command: 'npx',
    args: ['-y', '@zendesk/mcp-server@0.1.2'],
    fields: [
      { key: 'ZENDESK_SUBDOMAIN', label: 'Zendesk Subdomain', description: 'e.g. "mycompany" (from mycompany.zendesk.com)', type: 'string', required: true, placeholder: 'mycompany' },
      { key: 'ZENDESK_EMAIL', label: 'Agent Email', description: 'your-email@company.com', type: 'string', required: true },
      { key: 'ZENDESK_API_TOKEN', label: 'API Token', description: 'From Zendesk Admin Center -> API', type: 'password', required: true }
    ],
    defaultEnv: {}
  },
  {
    id: 'intercom',
    name: 'Intercom Customer Messaging MCP',
    description: 'Access customer conversations, lookup user profiles, and send automated in-app support messages.',
    category: 'productivity',
    official: true,
    author: 'Intercom',
    icon: 'MessageCircle',
    command: 'npx',
    args: ['-y', '@intercom/mcp-server@0.1.1'],
    fields: [
      { key: 'INTERCOM_ACCESS_TOKEN', label: 'Intercom Access Token', description: 'From Intercom Developer Hub', type: 'password', required: true, helpUrl: 'https://developers.intercom.com/' }
    ],
    defaultEnv: {}
  },
  {
    id: 'salesforce',
    name: 'Salesforce CRM MCP',
    description: 'SOQL queries, lead generation, account management, and enterprise CRM record updates.',
    category: 'data-cloud',
    official: true,
    author: 'Salesforce',
    icon: 'Cloud',
    command: 'npx',
    args: ['-y', '@salesforce/mcp-server@0.1.4'],
    fields: [
      { key: 'SALESFORCE_INSTANCE_URL', label: 'Instance URL', description: 'https://yourinstance.salesforce.com', type: 'string', required: true },
      { key: 'SALESFORCE_ACCESS_TOKEN', label: 'Connected App Token', description: 'OAuth access token', type: 'password', required: true }
    ],
    defaultEnv: {}
  },

  // 11. CLOUD STORAGE & WORK MANAGEMENT
  {
    id: 'dropbox',
    name: 'Dropbox MCP',
    description: 'Search files, download documents, and upload agent output directly to Dropbox folders.',
    category: 'productivity',
    official: true,
    author: 'Dropbox',
    icon: 'Box',
    command: 'npx',
    args: ['-y', '@dropbox/mcp-server@0.1.1'],
    fields: [
      { key: 'DROPBOX_ACCESS_TOKEN', label: 'Dropbox App Access Token', description: 'From Dropbox App Console', type: 'password', required: true, helpUrl: 'https://www.dropbox.com/developers/apps' }
    ],
    defaultEnv: {}
  },
  {
    id: 'box',
    name: 'Box Enterprise Content MCP',
    description: 'Enterprise secure content management, document search, and metadata classification in Box.',
    category: 'productivity',
    official: true,
    author: 'Box',
    icon: 'Folder',
    command: 'npx',
    args: ['-y', '@box/mcp-server@0.1.1'],
    fields: [
      { key: 'BOX_DEVELOPER_TOKEN', label: 'Developer Token', description: 'From Box Developer Console', type: 'password', required: true, helpUrl: 'https://developer.box.com/' }
    ],
    defaultEnv: {}
  },
  {
    id: 'asana',
    name: 'Asana MCP',
    description: 'Search tasks, create project milestones, manage subtasks, and track project deadlines in Asana.',
    category: 'productivity',
    official: true,
    author: 'Asana',
    icon: 'CheckSquare',
    command: 'npx',
    args: ['-y', '@asana/mcp-server@0.1.2'],
    fields: [
      { key: 'ASANA_ACCESS_TOKEN', label: 'Personal Access Token', description: 'From Asana Developer Console -> Personal Access Tokens', type: 'password', required: true, helpUrl: 'https://app.asana.com/0/developer-console' }
    ],
    defaultEnv: {}
  },
  {
    id: 'monday',
    name: 'Monday.com Work OS MCP',
    description: 'Read and update boards, items, columns, and team automation workflows in Monday.com.',
    category: 'productivity',
    official: true,
    author: 'Monday.com',
    icon: 'Layout',
    command: 'npx',
    args: ['-y', '@monday/mcp-server@0.1.2'],
    fields: [
      { key: 'MONDAY_API_TOKEN', label: 'Personal API v2 Token', description: 'From Monday.com -> Admin -> API', type: 'password', required: true, helpUrl: 'https://developer.monday.com/api-reference' }
    ],
    defaultEnv: {}
  },
  {
    id: 'clickup',
    name: 'ClickUp Workspace MCP',
    description: 'Create tasks, organize spaces, track sprint backlogs, and update task statuses in ClickUp.',
    category: 'productivity',
    official: true,
    author: 'ClickUp',
    icon: 'CheckCircle',
    command: 'npx',
    args: ['-y', '@clickup/mcp-server@0.1.3'],
    fields: [
      { key: 'CLICKUP_API_TOKEN', label: 'ClickUp API Token', description: 'From ClickUp Settings -> Apps -> API Token', type: 'password', required: true, helpUrl: 'https://app.clickup.com/settings/apps' }
    ],
    defaultEnv: {}
  },
  {
    id: 'trello',
    name: 'Trello Kanban MCP',
    description: 'Create cards, move lists, manage board labels, and organize sprints across Trello boards.',
    category: 'productivity',
    official: true,
    author: 'Atlassian',
    icon: 'Columns',
    command: 'npx',
    args: ['-y', '@atlassian/mcp-server-trello@0.1.1'],
    fields: [
      { key: 'TRELLO_API_KEY', label: 'Trello API Key', description: 'From Atlassian Developer Portal', type: 'string', required: true, helpUrl: 'https://trello.com/app-key' },
      { key: 'TRELLO_TOKEN', label: 'User Token', description: 'OAuth Token generated from Trello App Key page', type: 'password', required: true }
    ],
    defaultEnv: {}
  },

  // 12. TEAM COMMS, MEDIA & WEB SEARCH
  {
    id: 'discord',
    name: 'Discord Community MCP',
    description: 'Post messages, monitor channels, manage server roles, and trigger notifications on Discord.',
    category: 'productivity',
    official: true,
    author: 'Model Context Protocol Community',
    icon: 'MessageSquare',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-discord@0.6.2'],
    fields: [
      { key: 'DISCORD_BOT_TOKEN', label: 'Bot Token', description: 'From Discord Developer Portal -> Bot -> Token', type: 'password', required: true, helpUrl: 'https://discord.com/developers/applications' }
    ],
    defaultEnv: {}
  },
  {
    id: 'teams',
    name: 'Microsoft Teams MCP',
    description: 'Post notifications, send channel cards, and automate team announcements in Microsoft Teams.',
    category: 'productivity',
    official: true,
    author: 'Microsoft Community',
    icon: 'Users',
    command: 'npx',
    args: ['-y', '@microsoft/mcp-teams@0.1.2'],
    fields: [
      { key: 'TEAMS_WEBHOOK_URL', label: 'Incoming Webhook URL', description: 'Configured webhook URL from Teams channel connectors', type: 'password', required: true }
    ],
    defaultEnv: {}
  },
  {
    id: 'spotify',
    name: 'Spotify Music MCP',
    description: 'Search tracks, query playlists, fetch artist metadata, and control audio playback.',
    category: 'ecommerce-comms',
    official: true,
    author: 'Spotify Community',
    icon: 'Music',
    command: 'npx',
    args: ['-y', '@spotify/mcp-server@0.1.1'],
    fields: [
      { key: 'SPOTIFY_CLIENT_ID', label: 'Client ID', description: 'From Spotify Developer Dashboard', type: 'string', required: true, helpUrl: 'https://developer.spotify.com/dashboard' },
      { key: 'SPOTIFY_CLIENT_SECRET', label: 'Client Secret', description: 'Spotify Client Secret', type: 'password', required: true }
    ],
    defaultEnv: {}
  },
  {
    id: 'youtube',
    name: 'YouTube Transcripts & Data MCP',
    description: 'Extract video transcripts, search channels, lookup video metadata and view statistics.',
    category: 'search-scraping',
    official: true,
    author: 'Model Context Protocol Community',
    icon: 'Video',
    command: 'npx',
    args: ['-y', '@youtube/mcp-server@0.1.2'],
    fields: [
      { key: 'YOUTUBE_API_KEY', label: 'YouTube Data API Key', description: 'From Google Cloud Console -> YouTube Data API v3', type: 'password', required: true, helpUrl: 'https://console.cloud.google.com/' }
    ],
    defaultEnv: {}
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI Search MCP',
    description: 'Grounded web research, live citation retrieval, and real-time fact checking via Perplexity API.',
    category: 'search-scraping',
    official: true,
    author: 'Perplexity AI',
    icon: 'Search',
    command: 'npx',
    args: ['-y', '@perplexity/mcp-server@0.1.3'],
    fields: [
      { key: 'PERPLEXITY_API_KEY', label: 'Perplexity API Key', description: 'From perplexity.ai settings -> API', type: 'password', required: true, helpUrl: 'https://www.perplexity.ai/settings/api' }
    ],
    defaultEnv: {}
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo Instant Search MCP',
    description: 'Fast, private web search, instant answers, and news queries with zero API key required.',
    category: 'search-scraping',
    official: true,
    author: 'Model Context Protocol Community',
    icon: 'Globe',
    command: 'npx',
    args: ['-y', '@duckduckgo/mcp-server@0.1.2'],
    fields: [],
    defaultEnv: {}
  }
];
