/**
 * Budget Persistence Service
 *
 * Persists spend tracking data locally so budget state survives app restarts.
 * Uses a simple JSON file in the Tauri app data directory (via the existing
 * Tauri IPC write_system_config_file command) — no SQLite or external DB needed.
 *
 * Flow:
 * 1. On app startup: load persisted budget from disk → pre-seed store state
 * 2. On each health poll: fetch LiteLLM /spend/logs → compute cumulative spend
 *    → merge with persisted baseline → update store + persist to disk
 * 3. On app close / budget reset: persist current state
 *
 * The persisted file lives at: <app_data_dir>/tethermesh_budget.json
 */

import { SpendBudget } from '../types/telemetry';

// ---------------------------------------------------------------------------
// Persisted budget data shape
// ---------------------------------------------------------------------------
export interface PersistedBudget {
  dailySpend: number;
  monthlySpend: number;
  dailyLimit: number;
  monthlyLimit: number;
  isCircuitBreakerTripped: boolean;
  lastResetDate: string;        // YYYY-MM-DD, auto-resets on new day
  lastUpdatedAt: number;        // epoch ms
  totalTokensProcessed: number;
}

const DEFAULT_BUDGET: PersistedBudget = {
  dailySpend: 0,
  monthlySpend: 0,
  dailyLimit: 10.0,
  monthlyLimit: 150.0,
  isCircuitBreakerTripped: false,
  lastResetDate: new Date().toISOString().split('T')[0],
  lastUpdatedAt: Date.now(),
  totalTokensProcessed: 0,
};

// ---------------------------------------------------------------------------
// File I/O via Tauri IPC (works in Tauri) or localStorage (browser dev mode)
// ---------------------------------------------------------------------------

let resolvedBudgetPath: string | null = null;

async function getBudgetFilePath(): Promise<string> {
  if (resolvedBudgetPath) return resolvedBudgetPath;

  if (window.__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const paths = await invoke<{ app_data_dir: string }>('get_system_paths');
      resolvedBudgetPath = `${paths.app_data_dir}\\TetherMesh\\tethermesh_budget.json`;
    } catch {
      // Fallback: use APPDATA directly
      resolvedBudgetPath = `${process.env.APPDATA || ''}\\TetherMesh\\tethermesh_budget.json`;
    }
  } else {
    // Browser dev mode — use a sentinel path (localStorage fallback below)
    resolvedBudgetPath = '__browser_dev_mode__';
  }

  return resolvedBudgetPath;
}

// ---------------------------------------------------------------------------
// Load / Save operations
// ---------------------------------------------------------------------------

export async function loadPersistedBudget(): Promise<PersistedBudget> {
  const filePath = await getBudgetFilePath();

  // Browser dev mode: use localStorage
  if (filePath === '__browser_dev_mode__') {
    const stored = localStorage.getItem('tethermesh_budget');
    if (stored) {
      try {
        return applyDayReset(JSON.parse(stored));
      } catch {
        return { ...DEFAULT_BUDGET };
      }
    }
    return { ...DEFAULT_BUDGET };
  }

  // Tauri mode: read from disk via IPC
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const content = await invoke<string>('read_system_config_file', { filePath });
    
    // read_system_config_file returns a default MCP JSON for non-existent files
    if (content.includes('mcpServers')) {
      return { ...DEFAULT_BUDGET };
    }

    return applyDayReset(JSON.parse(content));
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}

export async function savePersistedBudget(budget: PersistedBudget): Promise<void> {
  const filePath = await getBudgetFilePath();
  const data: PersistedBudget = {
    ...budget,
    lastUpdatedAt: Date.now(),
  };

  // Browser dev mode: use localStorage
  if (filePath === '__browser_dev_mode__') {
    localStorage.setItem('tethermesh_budget', JSON.stringify(data));
    return;
  }

  // Tauri mode: write to disk via IPC
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_system_config_file', {
      filePath,
      content: JSON.stringify(data, null, 2),
      createBackup: false,
    });
  } catch (err) {
    console.error('[BudgetPersistence] Failed to save budget:', err);
  }
}

// ---------------------------------------------------------------------------
// Day reset logic — auto-reset daily spend on calendar day change
// ---------------------------------------------------------------------------

function applyDayReset(budget: PersistedBudget): PersistedBudget {
  const today = new Date().toISOString().split('T')[0];
  if (budget.lastResetDate !== today) {
    return {
      ...budget,
      dailySpend: 0,
      isCircuitBreakerTripped: false,
      lastResetDate: today,
    };
  }
  return budget;
}

// ---------------------------------------------------------------------------
// Conversion helpers between PersistedBudget ↔ SpendBudget (store shape)
// ---------------------------------------------------------------------------

export function persistedToStoreBudget(persisted: PersistedBudget): SpendBudget {
  return {
    dailyLimit: persisted.dailyLimit,
    monthlyLimit: persisted.monthlyLimit,
    currentDailySpend: persisted.dailySpend,
    currentMonthlySpend: persisted.monthlySpend,
    isCircuitBreakerTripped: persisted.isCircuitBreakerTripped,
    hardStopEnabled: true,
    lastResetDate: persisted.lastResetDate,
  };
}

export function storeBudgetToPersisted(
  storeBudget: SpendBudget,
  totalTokens: number = 0
): PersistedBudget {
  return {
    dailySpend: storeBudget.currentDailySpend,
    monthlySpend: storeBudget.currentMonthlySpend,
    dailyLimit: storeBudget.dailyLimit,
    monthlyLimit: storeBudget.monthlyLimit,
    isCircuitBreakerTripped: storeBudget.isCircuitBreakerTripped,
    lastResetDate: storeBudget.lastResetDate,
    lastUpdatedAt: Date.now(),
    totalTokensProcessed: totalTokens,
  };
}

// ---------------------------------------------------------------------------
// LiteLLM spend log parsing
// ---------------------------------------------------------------------------

export interface LiteLLMSpendLogEntry {
  startTime: string;
  endTime: string;
  model: string;
  api_key: string;
  spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  request_id: string;
}

/**
 * Fetch spend logs from LiteLLM and compute cumulative spend for today.
 * Returns the total daily spend and token count from LiteLLM's perspective.
 */
export async function fetchLiteLLMSpend(proxyUrl: string): Promise<{
  dailySpend: number;
  totalTokens: number;
  latestEntries: LiteLLMSpendLogEntry[];
}> {
  try {
    const res = await fetch(`${proxyUrl}/spend/logs`);
    if (!res.ok) {
      // LiteLLM might not have this endpoint in all modes
      return { dailySpend: 0, totalTokens: 0, latestEntries: [] };
    }
    
    const logs: LiteLLMSpendLogEntry[] = await res.json();
    const today = new Date().toISOString().split('T')[0];
    
    // Filter to today's entries
    const todayLogs = logs.filter((entry) => {
      const entryDate = entry.startTime?.split('T')[0];
      return entryDate === today;
    });

    const dailySpend = todayLogs.reduce((sum, entry) => sum + (entry.spend || 0), 0);
    const totalTokens = todayLogs.reduce((sum, entry) => sum + (entry.total_tokens || 0), 0);

    return { dailySpend, totalTokens, latestEntries: todayLogs.slice(-20) };
  } catch {
    // LiteLLM not running or spend endpoint not available
    return { dailySpend: 0, totalTokens: 0, latestEntries: [] };
  }
}
