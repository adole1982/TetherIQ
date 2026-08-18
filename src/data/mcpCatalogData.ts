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
    id: 'claude-code',
    name: 'Claude Code CLI',
    category: 'cli',
    icon: 'Cpu',
    defaultConfigPathWin: '%USERPROFILE%\\.claude.json',
    defaultConfigPathMac: '~/.claude.json',
    defaultConfigPathLinux: '~/.claude.json',
    jsonKeyPath: 'mcpServers',
    instructions: 'Claude Code CLI accesses tools via stdio / SSE seamlessly.'
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
    id: 'antigravity',
    name: 'Antigravity / Cline',
    category: 'ide',
    icon: 'Layers',
    defaultConfigPathWin: '%USERPROFILE%\\.mcp.json',
    defaultConfigPathMac: '~/.mcp.json',
    defaultConfigPathLinux: '~/.mcp.json',
    jsonKeyPath: 'mcpServers',
    instructions: 'Used by Antigravity IDE and Roo/Cline extensions.'
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
    args: ['-y', '@databricks/mcp-server'],
    fields: [
      { key: 'DATABRICKS_HOST', label: 'Databricks Workspace Host URL', description: 'e.g. https://dbc-xxxx.cloud.databricks.com', type: 'url', required: true, placeholder: 'https://dbc-xxxx.cloud.databricks.com' },
      { key: 'DATABRICKS_TOKEN', label: 'Personal Access Token (PAT)', description: 'Databricks OAuth / User Access Token', type: 'password', required: true, placeholder: 'dapi...' },
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
    args: ['-y', '@snowflake/mcp-server'],
    fields: [
      { key: 'SNOWFLAKE_ACCOUNT', label: 'Account Identifier', description: 'e.g. xy12345.us-east-1', type: 'string', required: true, placeholder: 'xy12345' },
      { key: 'SNOWFLAKE_USER', label: 'Username', description: 'Snowflake user login', type: 'string', required: true, placeholder: 'ADMIN' },
      { key: 'SNOWFLAKE_PASSWORD', label: 'Password / Key', description: 'Account password or private key path', type: 'password', required: true },
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
    args: ['-y', '@google-cloud/mcp-bigquery'],
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
    args: ['-y', '@supabase/mcp-server'],
    fields: [
      { key: 'SUPABASE_ACCESS_TOKEN', label: 'Supabase Personal Access Token', description: 'Obtained from Supabase Account Settings -> Access Tokens', type: 'password', required: true, placeholder: 'sbp_...' },
      { key: 'SUPABASE_PROJECT_REF', label: 'Project Reference ID', description: 'e.g. abcdefghijklmnop', type: 'string', required: true, placeholder: 'abcdefghijklmnop' }
    ],
    defaultEnv: {},
    docsUrl: 'https://supabase.com/docs'
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
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    fields: [
      { key: 'POSTGRES_CONNECTION_STRING', label: 'Postgres Connection URI', description: 'postgresql://user:password@localhost:5432/dbname', type: 'password', required: true, placeholder: 'postgresql://postgres:postgres@localhost:5432/db' }
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
    args: ['-y', '@duckdb/mcp-server'],
    fields: [
      { key: 'DUCKDB_PATH', label: 'DuckDB File Path', description: 'Local path or :memory:', type: 'string', required: false, defaultValue: ':memory:', placeholder: ':memory:' }
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
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    fields: [
      { key: 'SQLITE_DB_PATH', label: 'SQLite File Path', description: 'Full path to .sqlite or .db file', type: 'string', required: true, placeholder: 'C:/data/app.db' }
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
    args: ['-y', '@clickhouse/mcp-server'],
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
    args: ['-y', '@modelcontextprotocol/server-redis'],
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
    args: ['-y', '@neo4j/mcp-server'],
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
    args: ['-y', '@notionhq/mcp-server'],
    fields: [
      { key: 'NOTION_API_KEY', label: 'Notion Internal Integration Token', description: 'Created in notion.so/profile/integrations', type: 'password', required: true, placeholder: 'secret_...' }
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
    args: ['-y', '@modelcontextprotocol/server-slack'],
    fields: [
      { key: 'SLACK_BOT_TOKEN', label: 'Slack Bot User OAuth Token', description: 'xoxb-... token from api.slack.com/apps', type: 'password', required: true, placeholder: 'xoxb-...' },
      { key: 'SLACK_TEAM_ID', label: 'Team ID (Optional)', description: 'Workspace Team ID', type: 'string', required: false }
    ],
    defaultEnv: {}
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
    args: ['-y', '@linear/mcp-server'],
    fields: [
      { key: 'LINEAR_API_KEY', label: 'Linear API Key', description: 'Personal API key from Linear Settings -> API', type: 'password', required: true, placeholder: 'lin_api_...' }
    ],
    defaultEnv: {}
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
    args: ['-y', '@atlassian/jira-mcp'],
    fields: [
      { key: 'JIRA_HOST', label: 'Jira Cloud Domain', description: 'e.g. https://company.atlassian.net', type: 'url', required: true, placeholder: 'https://myorg.atlassian.net' },
      { key: 'JIRA_EMAIL', label: 'Account Email', description: 'Atlassian user email', type: 'string', required: true, placeholder: 'user@company.com' },
      { key: 'JIRA_API_TOKEN', label: 'API Token', description: 'Generated from id.atlassian.com', type: 'password', required: true }
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
    args: ['-y', '@atlassian/confluence-mcp'],
    fields: [
      { key: 'CONFLUENCE_HOST', label: 'Confluence Domain', description: 'https://company.atlassian.net/wiki', type: 'url', required: true, placeholder: 'https://myorg.atlassian.net/wiki' },
      { key: 'CONFLUENCE_EMAIL', label: 'Account Email', description: 'Atlassian email', type: 'string', required: true },
      { key: 'CONFLUENCE_API_TOKEN', label: 'API Token', description: 'Atlassian API token', type: 'password', required: true }
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
    args: ['-y', '@todoist/mcp-server'],
    fields: [
      { key: 'TODOIST_API_TOKEN', label: 'Todoist API Token', description: 'From Todoist Integrations -> Developer Settings', type: 'password', required: true }
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
    args: ['-y', '@airtable/mcp-server'],
    fields: [
      { key: 'AIRTABLE_PERSONAL_ACCESS_TOKEN', label: 'Airtable PAT', description: 'From airtable.com/create/tokens', type: 'password', required: true, placeholder: 'pat...' },
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
    args: ['-y', '@obsidian/mcp-local'],
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
    args: ['-y', '@modelcontextprotocol/server-github'],
    fields: [
      { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub Personal Access Token', description: 'Personal Access Token with repo, issues, and workflow permissions', type: 'password', required: true, placeholder: 'ghp_...' }
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
    args: ['-y', '@gitlab/mcp-server'],
    fields: [
      { key: 'GITLAB_PERSONAL_ACCESS_TOKEN', label: 'GitLab Access Token', description: 'Personal Access Token with read/write API access', type: 'password', required: true, placeholder: 'glpat-...' },
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
    args: ['-y', '@modelcontextprotocol/server-docker'],
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
    args: ['-y', '@kubernetes/mcp-server'],
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
    args: ['-y', '@sentry/mcp-server'],
    fields: [
      { key: 'SENTRY_AUTH_TOKEN', label: 'Sentry Auth Token', description: 'User Auth token with event:read and project:read', type: 'password', required: true, placeholder: 'sntryu_...' },
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
    args: ['-y', '@postman/mcp-server'],
    fields: [
      { key: 'POSTMAN_API_KEY', label: 'Postman API Key', description: 'API Key from Postman Account settings', type: 'password', required: true, placeholder: 'PMAK-...' }
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
    args: ['-y', '@modelcontextprotocol/server-git'],
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
    args: ['-y', '@aws/mcp-server'],
    fields: [
      { key: 'AWS_ACCESS_KEY_ID', label: 'AWS Access Key ID', description: 'IAM Access Key ID', type: 'string', required: true, placeholder: 'AKIA...' },
      { key: 'AWS_SECRET_ACCESS_KEY', label: 'AWS Secret Access Key', description: 'IAM Secret Access Key', type: 'password', required: true },
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
    args: ['-y', '@cloudflare/mcp-server'],
    fields: [
      { key: 'CLOUDFLARE_API_TOKEN', label: 'Cloudflare API Token', description: 'API token with Workers and DNS permissions', type: 'password', required: true },
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
    args: ['-y', '@datadog/mcp-server'],
    fields: [
      { key: 'DATADOG_API_KEY', label: 'Datadog API Key', description: 'API Key', type: 'password', required: true },
      { key: 'DATADOG_APP_KEY', label: 'Datadog Application Key', description: 'Application Key', type: 'password', required: true },
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
    args: ['-y', '@vercel/mcp-server'],
    fields: [
      { key: 'VERCEL_TOKEN', label: 'Vercel Personal Access Token', description: 'From vercel.com/account/tokens', type: 'password', required: true, placeholder: 'ver_...' },
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
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    fields: [
      { key: 'BRAVE_API_KEY', label: 'Brave Search API Key', description: 'API key from brave.com/search/api', type: 'password', required: true, placeholder: 'BSA...' }
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
    args: ['-y', '@tavily/mcp-server'],
    fields: [
      { key: 'TAVILY_API_KEY', label: 'Tavily API Key', description: 'API key from app.tavily.com', type: 'password', required: true, placeholder: 'tvly-...' }
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
    args: ['-y', '@exa/mcp-server'],
    fields: [
      { key: 'EXA_API_KEY', label: 'Exa API Key', description: 'API key from exa.ai', type: 'password', required: true }
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
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
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
    args: ['-y', '@modelcontextprotocol/server-playwright'],
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
    args: ['-y', '@modelcontextprotocol/server-fetch'],
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
    args: ['-y', '@pinecone-io/mcp-server'],
    fields: [
      { key: 'PINECONE_API_KEY', label: 'Pinecone API Key', description: 'API key from app.pinecone.io', type: 'password', required: true, placeholder: 'pcsk_...' },
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
    args: ['-y', '@qdrant/mcp-server'],
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
    args: ['-y', '@chroma-core/mcp-server'],
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
    args: ['-y', '@modelcontextprotocol/server-memory'],
    fields: [],
    defaultEnv: {}
  },

  // 7. E-COMMERCE & COMMUNICATIONS
  {
    id: 'stripe',
    name: 'Stripe MCP',
    description: 'Inspect customer balances, invoices, payment intents, subscriptions, and refund logs.',
    category: 'ecommerce-comms',
    official: true,
    author: 'Stripe',
    icon: 'CreditCard',
    command: 'npx',
    args: ['-y', '@stripe/mcp-server'],
    fields: [
      { key: 'STRIPE_SECRET_KEY', label: 'Stripe Restricted / Secret Key', description: 'sk_live_... or sk_test_...', type: 'password', required: true, placeholder: 'sk_test_...' }
    ],
    defaultEnv: {}
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
    args: ['-y', '@shopify/mcp-server'],
    fields: [
      { key: 'SHOPIFY_STORE_DOMAIN', label: 'Shopify Store Domain', description: 'e.g. my-store.myshopify.com', type: 'string', required: true, placeholder: 'my-store.myshopify.com' },
      { key: 'SHOPIFY_ADMIN_ACCESS_TOKEN', label: 'Admin API Access Token', description: 'shpat_... access token', type: 'password', required: true }
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
    args: ['-y', '@twilio/mcp-server'],
    fields: [
      { key: 'TWILIO_ACCOUNT_SID', label: 'Account SID', description: 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', type: 'string', required: true, placeholder: 'AC...' },
      { key: 'TWILIO_AUTH_TOKEN', label: 'Auth Token', description: 'Twilio Auth Token', type: 'password', required: true },
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
    args: ['-y', '@elevenlabs/mcp-server'],
    fields: [
      { key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API Key', description: 'API Key from elevenlabs.io', type: 'password', required: true }
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
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    fields: [
      { key: 'ALLOWED_DIRECTORIES', label: 'Allowed Directories (Comma-separated)', description: 'e.g. C:/Projects, C:/Workspace', type: 'string', required: true, defaultValue: 'C:/Projects', placeholder: 'C:/Projects' }
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
    args: ['-y', '@modelcontextprotocol/server-time'],
    fields: [],
    defaultEnv: {}
  }
];
