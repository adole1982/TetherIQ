/**
 * Budget Persistence Service
 *
 * Connects the desktop UI to the durable SQLite spend ledger running inside
 * the LiteLLM sidecar on http://127.0.0.1:4000/spend/summary.
 *
 * Flow:
 * 1. On app startup: load persisted budget from disk / sidecar SQLite
 * 2. On health polls: fetch sidecar /spend/summary → update store state
 * 3. On budget limit changes: update sidecar via /spend/budget + persist to local disk
 *
 * The persisted file lives at: <app_data_dir>/TetherMesh/tethermesh_budget.json
 */

import { SpendBudget } from '../types/telemetry';

// ---------------------------------------------------------------------------
// Microdollars Parsing & Conversions (Exact String to Integer Microdollars)
// ---------------------------------------------------------------------------

export function parseDecimalToMicroUsd(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const str = String(input).trim();
  if (str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'unlimited') return null;

  const match = /^([+-]?\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) {
    throw new Error(`Invalid currency format: "${str}"`);
  }

  const intPart = parseInt(match[1], 10);
  if (intPart < 0) {
    throw new Error('Budget limit cannot be negative');
  }

  const fracStr = match[2] || '';
  if (fracStr.length > 6) {
    throw new Error('Currency precision cannot exceed 6 decimal places');
  }

  const fracPart = parseInt(fracStr.padEnd(6, '0'), 10);
  const totalMicros = (intPart * 1_000_000) + fracPart;
  return totalMicros;
}

export function microUsdToUsd(micros: number | null | undefined): number | null {
  if (micros === null || micros === undefined) return null;
  return micros / 1_000_000;
}

// ---------------------------------------------------------------------------
// Persisted budget data shape
// ---------------------------------------------------------------------------
export interface PersistedBudget {
  dailySpend: number;
  monthlySpend: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
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

  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const paths = await invoke<{ app_data_dir: string }>('get_system_paths');
      resolvedBudgetPath = `${paths.app_data_dir}\\TetherMesh\\tethermesh_budget.json`;
    } catch {
      resolvedBudgetPath = `${process.env.APPDATA || ''}\\TetherMesh\\tethermesh_budget.json`;
    }
  } else {
    resolvedBudgetPath = '__browser_dev_mode__';
  }

  return resolvedBudgetPath;
}

// ---------------------------------------------------------------------------
// Load / Save operations via Dedicated Native Budget Commands
// ---------------------------------------------------------------------------

export async function loadPersistedBudget(): Promise<PersistedBudget> {
  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__;

  // Browser dev mode: use localStorage
  if (!isTauri) {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('tethermesh_budget');
      if (stored) {
        try {
          return applyDayReset(JSON.parse(stored));
        } catch {
          return { ...DEFAULT_BUDGET };
        }
      }
    }
    return { ...DEFAULT_BUDGET };
  }

  // Tauri mode: read structured budget via dedicated IPC
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const budget = await invoke<PersistedBudget>('read_budget_config');
    return applyDayReset(budget || { ...DEFAULT_BUDGET });
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}

export async function savePersistedBudget(budget: PersistedBudget): Promise<void> {
  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__;
  const data: PersistedBudget = {
    ...budget,
    lastUpdatedAt: Date.now(),
  };

  // Browser dev mode: use localStorage
  if (!isTauri) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tethermesh_budget', JSON.stringify(data));
    }
    return;
  }

  // Tauri mode: save structured budget via dedicated IPC (no filesystem paths sent)
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('save_budget_config', {
      settings: data,
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
// LiteLLM sidecar spend log & summary fetching
// ---------------------------------------------------------------------------

export interface LiteLLMSpendLogEntry {
  id?: string;
  timestamp?: number;
  day_key?: string;
  model: string;
  provider: string;
  spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  client_name?: string;
}

export async function fetchLiteLLMSpend(proxyUrl?: string): Promise<{
  dailySpend: number;
  monthlySpend: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  totalTokens: number;
  isCircuitBreakerTripped: boolean;
  tripReason?: string | null;
  latestEntries: LiteLLMSpendLogEntry[];
}> {
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const summary = await invoke<any>('get_spend_summary');
        if (summary) {
          const dailySpent = Number(summary.daily_spent_usd ?? summary.dailySpentUsd ?? 0);
          const monthlySpent = Number(summary.monthly_spent_usd ?? summary.monthlySpentUsd ?? 0);
          const dailyLim = summary.daily_limit_usd !== undefined && summary.daily_limit_usd !== null
            ? Number(summary.daily_limit_usd)
            : (summary.dailyLimitUsd !== undefined && summary.dailyLimitUsd !== null ? Number(summary.dailyLimitUsd) : null);
          const monthlyLim = summary.monthly_limit_usd !== undefined && summary.monthly_limit_usd !== null
            ? Number(summary.monthly_limit_usd)
            : (summary.monthlyLimitUsd !== undefined && summary.monthlyLimitUsd !== null ? Number(summary.monthlyLimitUsd) : null);
          const isTripped = Boolean(summary.is_tripped ?? summary.isTripped);
          const tripReason = summary.trip_reason ?? summary.tripReason ?? null;
          const tokens = Number(summary.total_tokens ?? summary.totalTokens ?? 0);

          return {
            dailySpend: dailySpent,
            monthlySpend: monthlySpent,
            dailyLimit: dailyLim,
            monthlyLimit: monthlyLim,
            totalTokens: tokens,
            isCircuitBreakerTripped: isTripped,
            tripReason,
            latestEntries: []
          };
        }
      } catch (err) {
        console.warn('[BudgetPersistence] Native spend summary IPC error:', err);
      }
    }

    return {
      dailySpend: 0,
      monthlySpend: 0,
      dailyLimit: 10,
      monthlyLimit: 150,
      totalTokens: 0,
      isCircuitBreakerTripped: false,
      tripReason: null,
      latestEntries: []
    };
  } catch {
    return {
      dailySpend: 0,
      monthlySpend: 0,
      dailyLimit: 10,
      monthlyLimit: 150,
      totalTokens: 0,
      isCircuitBreakerTripped: false,
      tripReason: null,
      latestEntries: []
    };
  }
}

