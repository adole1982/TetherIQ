import React, { useState } from 'react';
import { 
  Search, 
  Layers, 
  Check, 
  ShieldCheck, 
  ExternalLink, 
  Copy, 
  Database, 
  Cloud, 
  GitBranch, 
  MessageSquare, 
  Terminal, 
  Lock, 
  Sliders, 
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Download
} from 'lucide-react';

interface McpPageProps {
  navigate: (route: string) => void;
  onOpenDownload: () => void;
}

export const McpPage: React.FC<McpPageProps> = ({ navigate, onOpenDownload }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedTool, setSelectedTool] = useState<string | null>('databricks');

  const categories = ['All', 'Data & Warehouses', 'Developer Tools', 'Cloud & Databases', 'Productivity', 'Search & Web'];

  const tools = [
    {
      id: 'databricks',
      name: 'Databricks Genie & SQL',
      category: 'Data & Warehouses',
      description: 'Natural language queries against Unity Catalog, run lakehouse analytics, and discover table schemas.',
      envVars: ['DATABRICKS_HOST', 'DATABRICKS_TOKEN', 'DATABRICKS_HTTP_PATH'],
      verified: true,
      downloads: 'Planned',
      badge: 'Enterprise'
    },
    {
      id: 'snowflake',
      name: 'Snowflake Analytics',
      category: 'Data & Warehouses',
      description: 'Execute warehouse queries, discover tables, and manage warehouse schemas via secure SQL connector.',
      envVars: ['SNOWFLAKE_ACCOUNT', 'SNOWFLAKE_USER', 'SNOWFLAKE_PASSWORD'],
      verified: true,
      downloads: 'Planned',
      badge: 'Enterprise'
    },
    {
      id: 'supabase',
      name: 'Supabase Database & Auth',
      category: 'Cloud & Databases',
      description: 'Run SQL migrations, inspect database schemas, manage auth policies, and query Postgres.',
      envVars: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      verified: true,
      downloads: 'Planned',
      badge: 'Popular'
    },
    {
      id: 'postgres',
      name: 'PostgreSQL & pgvector',
      category: 'Cloud & Databases',
      description: 'Full database introspection, query execution, and semantic vector similarity search via pgvector.',
      envVars: ['POSTGRES_CONNECTION_STRING'],
      verified: true,
      downloads: 'Planned',
      badge: 'Essential'
    },
    {
      id: 'github',
      name: 'GitHub & Git Workflow',
      category: 'Developer Tools',
      description: 'Automate PR reviews, inspect diffs, search repositories, create issues, and manage CI/CD runs.',
      envVars: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
      verified: true,
      downloads: 'Planned',
      badge: 'Essential'
    },
    {
      id: 'slack',
      name: 'Slack & Team Comms',
      category: 'Productivity',
      description: 'Read thread replies, post automated incident updates, and notify engineering channels.',
      envVars: ['SLACK_BOT_TOKEN'],
      verified: true,
      downloads: 'Planned',
      badge: 'Popular'
    },
    {
      id: 'brave',
      name: 'Brave Search API',
      category: 'Search & Web',
      description: 'Privacy-focused web search, document retrieval, and up-to-date real-time context fetching for agents.',
      envVars: ['BRAVE_SEARCH_API_KEY'],
      verified: true,
      downloads: 'Planned',
      badge: 'Popular'
    },
    {
      id: 'docker',
      name: 'Docker Desktop Engine',
      category: 'Developer Tools',
      description: 'Manage local containers, inspect container logs, build images, and orchestrate dev environments.',
      envVars: ['DOCKER_HOST'],
      verified: true,
      downloads: 'Planned',
      badge: 'DevOps'
    },
    {
      id: 'jira',
      name: 'Jira Software & Confluence',
      category: 'Productivity',
      description: 'Create sprint tickets, update issue statuses, query sprint backlogs, and sync requirements.',
      envVars: ['JIRA_INSTANCE_URL', 'JIRA_API_TOKEN'],
      verified: true,
      downloads: 'Planned',
      badge: 'Enterprise'
    },
    {
      id: 'sentry',
      name: 'Sentry Error Monitoring',
      category: 'Developer Tools',
      description: 'Fetch real-time stack traces, search production issues, and auto-diagnose crash events.',
      envVars: ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG'],
      verified: true,
      downloads: 'Planned',
      badge: 'DevOps'
    },
    {
      id: 'notion',
      name: 'Notion Workspace API',
      category: 'Productivity',
      description: 'Read project documentation, update product requirements, and append agent summaries to pages.',
      envVars: ['NOTION_API_KEY'],
      verified: true,
      downloads: 'Planned',
      badge: 'Productivity'
    },
    {
      id: 'pinecone',
      name: 'Pinecone Vector DB',
      category: 'Cloud & Databases',
      description: 'High-speed semantic search, vector upserts, and index management for RAG pipelines.',
      envVars: ['PINECONE_API_KEY', 'PINECONE_ENVIRONMENT'],
      verified: true,
      downloads: 'Planned',
      badge: 'AI/RAG'
    }
  ];

  const filteredTools = tools.filter(tool => {
    const matchesCategory = selectedCategory === 'All' || tool.category === selectedCategory;
    const matchesQuery = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const activeToolData = tools.find(t => t.id === selectedTool) || tools[0];

  return (
    <div className="min-h-screen bg-white">
      {/* 1. Hero Section */}
      <section className="pt-12 pb-14 md:pt-20 md:pb-20 border-b border-slate-100 bg-slate-50/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-cyan-50 border border-cyan-200 text-xs font-semibold text-cyan-800 mb-6">
            <Layers className="w-4 h-4 text-cyan-600" />
            <span>50+ Planned Integrations for Launch</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
            1-Click MCP Sync. <br />
            <span className="brand-gradient-text">Zero JSON Config.</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-3xl mx-auto mb-8">
            Connect databases, developer tools, and cloud platforms to Cursor, Claude Code, Windsurf, 
            and Antigravity simultaneously without manual JSON editing or schema headaches.
          </p>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto relative mb-6">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search MCP tools (e.g. Databricks, Supabase, GitHub)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm placeholder:text-slate-400"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. 1-Click Multi-Client Sync Banner */}
      <section className="py-8 bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500 flex items-center justify-center text-cyan-400">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-white text-sm">Automated Multi-Target Configuration Injection</span>
                <p className="text-slate-400">TetherMesh writes verified JSON schemas to all your installed IDEs in parallel with automatic .bak rollbacks.</p>
              </div>
            </div>

            <div className="flex items-center space-x-2 font-mono text-[11px] text-cyan-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 shrink-0">
              <span>Syncing:</span>
              <span className="text-white">Cursor</span>
              <span>•</span>
              <span className="text-white">Claude</span>
              <span>•</span>
              <span className="text-white">Windsurf</span>
              <span>•</span>
              <span className="text-white">Devin</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Main Catalog & Inspector Grid */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Tool Cards (2 Columns on Large Screens) */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Showing {filteredTools.length} verified MCP connectors</span>
                <span>Pre-Validated JSON Schemas</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredTools.map((tool) => {
                  const isSelected = selectedTool === tool.id;
                  return (
                    <div
                      key={tool.id}
                      onClick={() => setSelectedTool(tool.id)}
                      className={`p-5 rounded-xl border cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-cyan-500 bg-cyan-50/20 ring-1 ring-cyan-400 shadow-sm' 
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {tool.category}
                        </span>
                        <span className="text-[10px] font-semibold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                          {tool.badge}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 text-sm">{tool.name}</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">
                        {tool.description}
                      </p>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          1-Click Sync
                        </span>
                        <span>{tool.envVars.length} Env Keys</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Credential Inspector & Schema Preview (Right Column) */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 p-6 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-xl space-y-6">
                <div>
                  <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-bold mb-1">
                    Live Schema Inspector
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{activeToolData.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{activeToolData.description}</p>
                </div>

                {/* Required Credentials */}
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase text-slate-300 flex items-center justify-between">
                    <span>Required Variables</span>
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      100% Local Machine
                    </span>
                  </div>
                  <div className="space-y-1.5 font-mono text-xs">
                    {activeToolData.envVars.map((env) => (
                      <div key={env} className="p-2 rounded bg-slate-950 border border-slate-800 text-cyan-300 text-[11px] flex items-center justify-between">
                        <span>{env}</span>
                        <span className="text-[10px] text-slate-500">Required</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Target JSON Injection Preview */}
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase text-slate-300">Generated MCP Config</div>
                  <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
                    {JSON.stringify(
                      {
                        mcpServers: {
                          [activeToolData.id]: {
                            command: 'npx',
                            args: ['-y', `@modelcontextprotocol/server-${activeToolData.id}`],
                            env: activeToolData.envVars.reduce((acc, curr) => ({ ...acc, [curr]: `\${${curr}}` }), {})
                          }
                        }
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>

                <button
                  onClick={onOpenDownload}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Join Waitlist for 1-Click Sync</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
