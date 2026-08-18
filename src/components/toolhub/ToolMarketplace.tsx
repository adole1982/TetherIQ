import React, { useState } from 'react';
import { 
  Grid, 
  Search, 
  Filter, 
  Check, 
  Plus, 
  Zap, 
  Layers, 
  Database, 
  FileText, 
  ShieldCheck, 
  ExternalLink,
  Sliders
} from 'lucide-react';
import { useTetherStore } from '../../store/useTetherStore';
import { McpToolDefinition, ToolCategory } from '../../types/tools';
import { DynamicCredentialDrawer } from './DynamicCredentialDrawer';

export const ToolMarketplace: React.FC = () => {
  const { 
    mcpCatalog, 
    installedTools, 
    toggleToolEnabled, 
    setSelectedToolForDrawer, 
    syncAllTools,
    syncResults 
  } = useTetherStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isSyncing, setIsSyncing] = useState(false);

  const categories: Array<{ id: string; label: string; count: number }> = [
    { id: 'all', label: 'All MCPs', count: mcpCatalog.length },
    { id: 'data-cloud', label: 'Data & Enterprise', count: mcpCatalog.filter(t => t.category === 'data-cloud').length },
    { id: 'productivity', label: 'Productivity & Comms', count: mcpCatalog.filter(t => t.category === 'productivity').length },
    { id: 'dev-ci', label: 'Dev Tools & CI', count: mcpCatalog.filter(t => t.category === 'dev-ci').length },
    { id: 'cloud-infra', label: 'Cloud & Monitoring', count: mcpCatalog.filter(t => t.category === 'cloud-infra').length },
    { id: 'search-scraping', label: 'Search & Scrapers', count: mcpCatalog.filter(t => t.category === 'search-scraping').length },
    { id: 'ai-vector', label: 'AI & Vector Stores', count: mcpCatalog.filter(t => t.category === 'ai-vector').length },
    { id: 'ecommerce-comms', label: 'E-Commerce & Voice', count: mcpCatalog.filter(t => t.category === 'ecommerce-comms').length },
    { id: 'system', label: 'System & Utilities', count: mcpCatalog.filter(t => t.category === 'system').length },
  ];

  const filteredTools = mcpCatalog.filter((tool) => {
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || tool.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleSyncAll = async () => {
    setIsSyncing(true);
    await syncAllTools();
    setTimeout(() => setIsSyncing(false), 500);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 flex items-center justify-between">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center space-x-2">
            <Grid className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Dynamic Tool-to-Client Architecture</span>
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">50+ Official MCP Tool Catalog</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Select any tool, enter credentials in the dynamic wizard, and check off target clients (<span className="text-cyan-300 font-mono">Cursor, Windsurf, Devin, Claude Code, Claude Desktop, Antigravity</span>) for non-destructive multi-file injection.
          </p>
        </div>

        <button
          onClick={handleSyncAll}
          disabled={isSyncing}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs shadow-lg shadow-cyan-500/20 transition-all"
        >
          <Zap className="w-4 h-4 fill-slate-950" />
          <span>{isSyncing ? 'Synchronizing Files...' : 'Sync Configs Now'}</span>
        </button>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="space-y-3">
        <div className="flex items-center space-x-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search 50+ MCP servers by name, author, or keyword (Databricks, Notion, GitHub, Postgres...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center space-x-1.5 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg">
            <span>Enabled:</span>
            <span className="font-mono text-cyan-400 font-bold">
              {installedTools.filter(t => t.isEnabled).length}
            </span>
            <span className="text-slate-500">/ {mcpCatalog.length}</span>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center space-x-1.5 ${
                selectedCategory === cat.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                  : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              <span>{cat.label}</span>
              <span className="text-[10px] opacity-60 font-mono">({cat.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* MCP Tool Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTools.map((tool) => {
          const installed = installedTools.find(t => t.toolId === tool.id);
          const isEnabled = installed?.isEnabled || false;

          return (
            <div
              key={tool.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                isEnabled
                  ? 'bg-slate-900/90 border-cyan-500/40 shadow-sm shadow-cyan-500/5'
                  : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white flex items-center space-x-1.5">
                        <span>{tool.name}</span>
                        {tool.official && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            Verified
                          </span>
                        )}
                      </h3>
                      <span className="text-[10px] text-slate-500 font-mono">{tool.author}</span>
                    </div>
                  </div>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleToolEnabled(tool.id)}
                      className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-cyan-500 w-4 h-4"
                    />
                  </label>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                  {tool.description}
                </p>

                {/* Target Clients Preview Badge */}
                {installed?.targetClients && installed.targetClients.length > 0 && (
                  <div className="flex items-center space-x-1 text-[10px] text-slate-500 font-mono">
                    <span>Target Clients:</span>
                    <span className="text-cyan-400">{installed.targetClients.join(', ')}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                <span className="font-mono text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {tool.command} {tool.args.slice(0, 2).join(' ')}
                </span>

                <button
                  onClick={() => setSelectedToolForDrawer(tool)}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
                >
                  <Sliders className="w-3 h-3 text-cyan-400" />
                  <span>Configure</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dynamic Credential & Multi-Client Modal Drawer */}
      <DynamicCredentialDrawer />
    </div>
  );
};
