/**
 * LiteLLM Config Service
 *
 * Generates a `litellm_config.yaml` string from the TetherMesh Zustand store state.
 * The generated YAML is written to the Tauri app data directory and consumed by
 * the LiteLLM sidecar process.
 *
 * This replaces the need for manually maintaining proxy adapter code — LiteLLM
 * handles all provider routing, token counting, and protocol translation natively.
 */

import { ProviderConfig, ProviderId, FallbackChain, VirtualModelAlias } from '../types/routing';
import { SpendBudget } from '../types/telemetry';

// ---------------------------------------------------------------------------
// Provider → LiteLLM model prefix mapping
// ---------------------------------------------------------------------------
const PROVIDER_PREFIX: Record<string, string> = {
  anthropic: 'anthropic/',
  openai: 'openai/',
  bedrock: 'bedrock/',
  vertex: 'vertex_ai/',
  groq: 'groq/',
  ollama: 'ollama/',
};

// ---------------------------------------------------------------------------
// Provider → credential env var mapping
// ---------------------------------------------------------------------------
interface ProviderCredentialBlock {
  [key: string]: string;
}

function getCredentialBlock(provider: ProviderConfig): ProviderCredentialBlock {
  switch (provider.id) {
    case 'anthropic':
      return { api_key: 'os.environ/ANTHROPIC_API_KEY' };
    case 'openai':
      return { api_key: 'os.environ/OPENAI_API_KEY' };
    case 'bedrock':
      return {
        aws_access_key_id: 'os.environ/AWS_ACCESS_KEY_ID',
        aws_secret_access_key: 'os.environ/AWS_SECRET_ACCESS_KEY',
        aws_region_name: provider.awsRegion || 'us-east-1',
      };
    case 'vertex':
      return {
        vertex_project: provider.vertexProjectId || 'os.environ/VERTEX_PROJECT',
        vertex_location: provider.vertexLocation || 'us-central1',
      };
    case 'groq':
      return { api_key: 'os.environ/GROQ_API_KEY' };
    case 'ollama':
      return { api_base: provider.baseUrl || 'http://127.0.0.1:11434' };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// YAML generation helpers (simple serialization, no external dep needed)
// ---------------------------------------------------------------------------
function indent(text: string, level: number): string {
  const spaces = '  '.repeat(level);
  return text
    .split('\n')
    .map((line) => (line.trim() ? `${spaces}${line}` : ''))
    .join('\n');
}

function yamlValue(val: unknown): string {
  if (typeof val === 'string') {
    // Don't quote os.environ/ references or simple strings
    if (val.startsWith('os.environ/') || /^[a-zA-Z0-9_.:/-]+$/.test(val)) {
      return val;
    }
    return `"${val.replace(/"/g, '\\"')}"`;
  }
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LiteLLMConfigInput {
  providers: ProviderConfig[];
  fallbackChains: FallbackChain[];
  virtualAliases: VirtualModelAlias[];
  budget: SpendBudget;
  isAirGappedMode?: boolean;
  discoveredLocalModels?: string[];
}

/**
 * Generate a complete `litellm_config.yaml` from TetherMesh store state.
 */
export function generateLiteLLMConfig(input: LiteLLMConfigInput): string {
  const { providers, fallbackChains, virtualAliases, budget, isAirGappedMode, discoveredLocalModels = [] } = input;

  // In Air-Gapped mode, strictly allow local providers (Ollama / Local OpenAI endpoints)
  const enabledProviders = isAirGappedMode
    ? providers.filter((p) => p.id === 'ollama')
    : providers.filter((p) => p.isEnabled);
  const providerMap = new Map(enabledProviders.map((p) => [p.id, p]));

  const lines: string[] = [
    '# TetherMesh LiteLLM Configuration — Auto-generated',
    `# Generated at: ${new Date().toISOString()}`,
    `# Mode: ${isAirGappedMode ? 'AIR-GAPPED / OFFLINE LOCAL MESH ONLY' : 'HYBRID CLOUD & LOCAL'}`,
    '# Edit via the TetherMesh desktop UI (Matrix tab) or modify this file directly.',
    '',
    'model_list:',
  ];

  // If Air-Gapped mode is active, strictly bind virtual aliases and models to loopback local engines
  if (isAirGappedMode) {
    const localOllama = providerMap.get('ollama');
    const rawOllamaBaseUrl = localOllama?.baseUrl || 'http://127.0.0.1:11434';
    const ollamaBaseUrl = rawOllamaBaseUrl.replace('//localhost:', '//127.0.0.1:').replace('//localhost/', '//127.0.0.1/');
    const lmStudioBaseUrl = 'http://127.0.0.1:1234/v1';
    const primaryLocalModel = discoveredLocalModels[0] || 'ollama/llama3.2';
    const primaryBaseUrl = (primaryLocalModel.startsWith('openai/') || primaryLocalModel.startsWith('lm-studio/'))
      ? lmStudioBaseUrl
      : ollamaBaseUrl;

    lines.push('  # --- Air-Gapped Offline Local Mesh Aliases ---');
    for (const alias of virtualAliases) {
      lines.push(`  - model_name: ${alias.alias}`);
      lines.push(`    litellm_params:`);
      lines.push(`      model: ${primaryLocalModel}`);
      lines.push(`      api_base: ${yamlValue(primaryBaseUrl)}`);
      lines.push('');
    }

    for (const localMod of discoveredLocalModels) {
      const isLmStudio = localMod.startsWith('openai/') || localMod.startsWith('lm-studio/');
      const targetBaseUrl = isLmStudio ? lmStudioBaseUrl : ollamaBaseUrl;
      const cleanName = localMod.replace('ollama/', '').replace('openai/', '').replace('lm-studio/', '');

      lines.push(`  - model_name: ${cleanName}`);
      lines.push(`    litellm_params:`);
      lines.push(`      model: ${localMod}`);
      lines.push(`      api_base: ${yamlValue(targetBaseUrl)}`);
      lines.push('');
    }

    // Router settings for air-gapped mode (only local aliases)
    lines.push('router_settings:');
    lines.push('  routing_strategy: "least-busy"');
    lines.push('  num_retries: 2');
    lines.push('  retry_after: 1');
    lines.push('  cooldown_time: 30');
    lines.push('  allowed_fails: 2');

    if (virtualAliases.length > 1) {
      lines.push('  fallbacks:');
      for (let i = 0; i < virtualAliases.length - 1; i++) {
        const currentAlias = virtualAliases[i];
        const nextAliases = virtualAliases.slice(i + 1).map((a) => `"${a.alias}"`);
        if (nextAliases.length > 0) {
          lines.push(`    - ${currentAlias.alias}: [${nextAliases.join(', ')}]`);
        }
      }
    }
  } else {
    // --- HYBRID MODE: Generate model_list entries from fallback chains + virtual aliases ---
    for (const alias of virtualAliases) {
      const chain = fallbackChains.find((c) => c.id === alias.targetChainId);
      if (!chain) continue;

      lines.push(`  # --- ${alias.alias} virtual alias ---`);

      for (const node of chain.nodes) {
        const provider = providerMap.get(node.provider);
        if (!provider) continue;

        const prefix = PROVIDER_PREFIX[node.provider] || '';
        const litellmModel = prefix + node.modelIdentifier;
        const creds = getCredentialBlock(provider);

        lines.push(`  - model_name: ${alias.alias}`);
        lines.push(`    litellm_params:`);
        lines.push(`      model: ${litellmModel}`);

        for (const [key, val] of Object.entries(creds)) {
          lines.push(`      ${key}: ${yamlValue(val)}`);
        }

        if (node.timeoutMs) {
          lines.push(`      timeout: ${Math.round(node.timeoutMs / 1000)}`);
        }

        lines.push('');
      }
    }

    // --- Add standalone model bindings for each enabled provider's models ---
    lines.push('  # --- Standalone model bindings ---');
    const standaloneModels: Array<{ name: string; provider: ProviderId; model: string }> = [
      { name: 'gpt-4o', provider: 'openai', model: 'openai/gpt-4o' },
      { name: 'gpt-4o-mini', provider: 'openai', model: 'openai/gpt-4o-mini' },
      { name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', model: 'anthropic/claude-3-7-sonnet-20250219' },
      { name: 'claude-3-5-sonnet-20241022', provider: 'anthropic', model: 'anthropic/claude-3-5-sonnet-20241022' },
      { name: 'claude-3-5-haiku-20241022', provider: 'anthropic', model: 'anthropic/claude-3-5-haiku-20241022' },
    ];

    for (const m of standaloneModels) {
      const provider = providerMap.get(m.provider);
      if (!provider) continue;

      const creds = getCredentialBlock(provider);
      lines.push(`  - model_name: ${m.name}`);
      lines.push(`    litellm_params:`);
      lines.push(`      model: ${m.model}`);
      for (const [key, val] of Object.entries(creds)) {
        lines.push(`      ${key}: ${yamlValue(val)}`);
      }
      lines.push('');
    }

    // --- Router settings (fallback chains) ---
    lines.push('router_settings:');
    lines.push('  routing_strategy: "least-busy"');
    lines.push('  num_retries: 2');
    lines.push('  retry_after: 1');
    lines.push('  cooldown_time: 30');
    lines.push('  allowed_fails: 2');

    if (virtualAliases.length > 0) {
      lines.push('  fallbacks:');
      for (const alias of virtualAliases) {
        const otherAliases = virtualAliases
          .filter((a) => a.alias !== alias.alias)
          .map((a) => a.alias);
        
        const fallbackTargets = [...standaloneModels.map((m) => m.name).slice(0, 1), ...otherAliases];
        if (fallbackTargets.length > 0) {
          const fallbackList = fallbackTargets.map((f) => `"${f}"`).join(', ');
          lines.push(`    - ${alias.alias}: [${fallbackList}]`);
        }
      }
    }
  }

  lines.push('');

  // --- LiteLLM settings ---
  lines.push('litellm_settings:');
  lines.push('  drop_params: true');
  lines.push('  set_verbose: false');
  lines.push('  request_timeout: 60');
  if (budget.dailyLimit !== null) {
    lines.push(`  max_budget: ${budget.dailyLimit.toFixed(1)}`);
    lines.push('  budget_duration: "1d"');
  }
  lines.push('');

  // --- General settings ---
  lines.push('general_settings:');
  lines.push('  disable_admin_ui: true');
  lines.push('');

  return lines.join('\n');
}
