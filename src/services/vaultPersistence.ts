/**
 * Provider Vault & Routing Persistence Service (H-09 Secure OS Vault)
 *
 * Interacts with the native OS Credential Vault (Windows Credential Manager / macOS Keychain)
 * via write-only / summary-only Tauri IPC. Secrets are never read back to the webview.
 */

import { FallbackChain, VirtualModelAlias } from '../types/routing';

export interface CredentialSummary {
  provider: string;
  configured: boolean;
  display_hint?: string;
  updated_at: number;
}

export interface RoutingMetadata {
  version: number;
  fallback_chains: FallbackChain[];
  virtual_aliases: VirtualModelAlias[];
  last_saved_at: number;
}

export interface ToolCredentialSummary {
  tool_id: string;
  configured: boolean;
  configured_fields: string[];
  display_hints: Record<string, string>;
  updated_at: number;
}

// In-memory test mock for Node.js / CLI testing environments
const memoryCredentialSummaries: Map<string, CredentialSummary> = new Map();
const memoryToolCredentialSummaries: Map<string, ToolCredentialSummary> = new Map();
const memoryToolSecrets: Map<string, Map<string, string>> = new Map();
let memoryRoutingMetadata: RoutingMetadata | null = null;

// Allowlisted non-sensitive Web Storage keys that must be preserved
const ALLOWLISTED_STORAGE_KEYS = new Set([
  'tethermesh_onboarded',
  'tethermesh_theme',
  'tethermesh_locale'
]);

/**
 * Synchronous startup purge of unencrypted Web Storage (localStorage & sessionStorage).
 * Runs before application bootstrap, store hydration, or component rendering.
 * Safely removes legacy secrets and generated config dumps while preserving allowlisted non-sensitive metadata.
 */
export function purgeLegacyWebStorage(): void {
  const purgeStorage = (storage: Storage | undefined) => {
    if (!storage) return;
    try {
      const keysToRemove: string[] = [];
      const len = storage.length;
      for (let i = 0; i < len; i++) {
        const key = storage.key(i);
        if (!key) continue;
        const lowerKey = key.toLowerCase();
        // Check exact legacy keys
        if (
          lowerKey === 'tethermesh_vault' ||
          lowerKey === 'tether_vault_keys' ||
          lowerKey === 'tether_credentials' ||
          lowerKey === 'tethermesh_credentials'
        ) {
          keysToRemove.push(key);
          continue;
        }
        // Check prefix patterns for file and config caches
        if (
          lowerKey.startsWith('tether_file_') ||
          lowerKey.startsWith('tether_config_') ||
          lowerKey.startsWith('tether_secret_') ||
          lowerKey.startsWith('tethermesh_secret_')
        ) {
          keysToRemove.push(key);
          continue;
        }
      }
      for (const key of keysToRemove) {
        if (!ALLOWLISTED_STORAGE_KEYS.has(key)) {
          storage.removeItem(key);
        }
      }
    } catch {
      // Ignore storage access errors in restricted iframe/sandbox environments
    }
  };

  if (typeof localStorage !== 'undefined') {
    purgeStorage(localStorage);
  }
  if (typeof sessionStorage !== 'undefined') {
    purgeStorage(sessionStorage);
  }
}

/**
 * Backward-compatible alias for purgeLegacyWebStorage.
 */
export function purgeLegacyLocalStorageSecrets(): void {
  purgeLegacyWebStorage();
}

/**
 * List credential summaries for all tools from the native OS Credential Vault.
 * Returns only metadata and masked hints, never plaintext secrets.
 */
export async function listToolCredentialSummaries(): Promise<ToolCredentialSummary[]> {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ToolCredentialSummary[]>('list_tool_credential_summaries');
    } catch (e) {
      console.error('[Vault] Failed to list tool credential summaries from native OS vault:', e);
      return [];
    }
  }

  // Node.js / CLI test mode
  return Array.from(memoryToolCredentialSummaries.values());
}

/**
 * Load tool assignments (enabled state and target clients) from native storage.
 */
export async function loadNativeToolAssignments(): Promise<import('../types/tools').ToolAssignmentState[]> {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<import('../types/tools').ToolAssignmentState[]>('get_tool_assignments');
    } catch (e) {
      console.error('[Vault] Failed to load tool assignments from native storage:', e);
      return [];
    }
  }

  return [];
}

/**
 * Save tool assignments (enabled state and target clients) to native storage.
 */
export async function saveNativeToolAssignments(
  assignments: import('../types/tools').ToolAssignmentState[]
): Promise<boolean> {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('save_tool_assignments', { assignments });
    } catch (e) {
      console.error('[Vault] Failed to save tool assignments to native storage:', e);
      return false;
    }
  }

  return true;
}

/**
 * Mutate specific tool credential fields (set or delete) in the native OS Credential Vault.
 */
export async function mutateToolCredentials(
  toolId: string,
  mutations: import('../types/tools').CredentialFieldMutation[]
): Promise<ToolCredentialSummary> {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<ToolCredentialSummary>('mutate_tool_credentials', {
      toolId,
      mutations
    });
  }

  // Node.js / CLI test mode
  const toolSecrets = memoryToolSecrets.get(toolId) || new Map<string, string>();
  for (const m of mutations) {
    if (m.operation === 'delete') {
      toolSecrets.delete(m.field);
    } else if (m.operation === 'set' && m.value !== undefined) {
      const trimmed = m.value.trim();
      if (trimmed) {
        toolSecrets.set(m.field, trimmed);
      } else {
        toolSecrets.delete(m.field);
      }
    }
  }
  memoryToolSecrets.set(toolId, toolSecrets);

  const hints: Record<string, string> = {};
  for (const [k, v] of toolSecrets.entries()) {
    hints[k] = v.length > 4 ? `••••${v.slice(-4)}` : '••••••';
  }

  const summary: ToolCredentialSummary = {
    tool_id: toolId,
    configured: toolSecrets.size > 0,
    configured_fields: Array.from(toolSecrets.keys()),
    display_hints: hints,
    updated_at: Date.now()
  };
  memoryToolCredentialSummaries.set(toolId, summary);
  return summary;
}

/**
 * Revoke a tool completely: prunes all client config files first, then purges keyring credentials.
 */
export async function revokeTool(toolId: string): Promise<import('../types/tools').RevocationResult> {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<import('../types/tools').RevocationResult>('revoke_tool', { toolId });
  }

  // Node.js / CLI test mode
  memoryToolSecrets.delete(toolId);
  memoryToolCredentialSummaries.delete(toolId);
  return {
    tool_id: toolId,
    client_results: {},
    vault_revoked: true,
    success: true
  };
}

/**
 * List credential summaries for all providers.
 * Returns only metadata and masked hints (e.g. "••••a7K2"), never plaintext keys.
 */
export async function listCredentialSummaries(): Promise<CredentialSummary[]> {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CredentialSummary[]>('list_credential_summaries');
    } catch (e) {
      console.error('[Vault] Failed to list credential summaries from native OS vault:', e);
      return [];
    }
  }

  // Node.js / CLI test mode
  return Array.from(memoryCredentialSummaries.values());
}

/**
 * Save a provider API key directly into the native OS Credential Vault.
 * The key is written once to the OS vault and never stored in frontend state.
 */
export async function setProviderCredential(provider: string, credential: string): Promise<CredentialSummary | null> {
  const trimmed = credential.trim();
  if (!trimmed) return null;

  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<CredentialSummary>('set_provider_credential', {
        provider,
        credential: trimmed
      });
    } catch (e) {
      console.error(`[Vault] Failed to save credential for ${provider}:`, e);
      return null;
    }
  }

  // Node.js / CLI test mode
  const summary: CredentialSummary = {
    provider,
    configured: true,
    display_hint: trimmed.length > 4 ? `••••${trimmed.slice(-4)}` : '••••••',
    updated_at: Date.now()
  };
  memoryCredentialSummaries.set(provider, summary);
  return summary;
}

/**
 * Delete a provider API key from the native OS Credential Vault.
 */
export async function deleteProviderCredential(provider: string): Promise<boolean> {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('delete_provider_credential', { provider });
    } catch (e) {
      console.error(`[Vault] Failed to delete credential for ${provider}:`, e);
      return false;
    }
  }

  // Node.js / CLI test mode
  memoryCredentialSummaries.delete(provider);
  return true;
}

/**
 * Load non-secret routing configuration (fallback chains, virtual aliases).
 */
export async function loadRoutingMetadata(): Promise<RoutingMetadata | null> {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<RoutingMetadata | null>('get_routing_metadata');
    } catch (e) {
      console.error('[Vault] Failed to load routing metadata:', e);
      return null;
    }
  }

  return memoryRoutingMetadata;
}

/**
 * Save non-secret routing configuration.
 */
export async function saveRoutingMetadata(data: {
  fallbackChains: FallbackChain[];
  virtualAliases: VirtualModelAlias[];
}): Promise<boolean> {
  const payload: RoutingMetadata = {
    version: 1,
    fallback_chains: data.fallbackChains,
    virtual_aliases: data.virtualAliases,
    last_saved_at: Date.now()
  };

  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('save_routing_metadata', { metadata: payload });
    } catch (e) {
      console.error('[Vault] Failed to save routing metadata:', e);
      return false;
    }
  }

  memoryRoutingMetadata = payload;
  return true;
}
