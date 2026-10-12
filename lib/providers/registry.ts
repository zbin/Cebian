// ─── Provider registry ───

import { t } from '@/lib/i18n';
import type { CustomProviderConfig, ProviderCredentials } from '@/lib/persistence/storage';
import { customProviderKey } from '@/lib/providers/custom-models';

export const OAUTH_PROVIDERS = [
  { provider: 'github-copilot', label: 'GitHub Copilot', getDescription: () => t('provider.oauth.descriptions.githubCopilot'), flow: 'device-code' as const },
  { provider: 'openai-codex', label: 'OpenAI Codex', getDescription: () => t('provider.oauth.descriptions.openaiCodex'), flow: 'auth-code' as const },
] as const satisfies readonly {
  provider: string;
  label: string;
  getDescription: () => string;
  flow: 'device-code' | 'auth-code';
}[];

export const APIKEY_PROVIDERS = [
  { provider: 'ant-ling', label: 'Ant Ling' },
  { provider: 'anthropic', label: 'Anthropic' },
  { provider: 'cerebras', label: 'Cerebras' },
  { provider: 'deepseek', label: 'DeepSeek' },
  { provider: 'fireworks', label: 'Fireworks' },
  { provider: 'google', label: 'Google Gemini' },
  { provider: 'groq', label: 'Groq' },
  { provider: 'huggingface', label: 'Hugging Face' },
  { provider: 'kimi-coding', label: 'Kimi Coding Plan' },
  { provider: 'minimax', label: 'MiniMax' },
  { provider: 'minimax-cn', label: 'MiniMax (CN)' },
  { provider: 'mistral', label: 'Mistral' },
  { provider: 'moonshotai', label: 'Moonshot' },
  { provider: 'moonshotai-cn', label: 'Moonshot (CN)' },
  { provider: 'nvidia', label: 'NVIDIA NIM' },
  { provider: 'openai', label: 'OpenAI' },
  { provider: 'openrouter', label: 'OpenRouter' },
  { provider: 'together', label: 'Together AI' },
  { provider: 'vercel-ai-gateway', label: 'Vercel AI Gateway' },
  { provider: 'xai', label: 'xAI' },
  { provider: 'xiaomi', label: 'Xiaomi MiMo' },
  { provider: 'xiaomi-token-plan-cn', label: 'Xiaomi MiMo Plan (CN)' },
  { provider: 'zai', label: 'zAI' },
] as const;

type ApiKeyProvider = (typeof APIKEY_PROVIDERS)[number];

function partitionApiKeyProviders(credentials: ProviderCredentials): {
  configured: ApiKeyProvider[];
  unconfigured: ApiKeyProvider[];
} {
  const configured: ApiKeyProvider[] = [];
  const unconfigured: ApiKeyProvider[] = [];

  for (const provider of APIKEY_PROVIDERS) {
    const credential = credentials[provider.provider];
    if (credential?.authType === 'apiKey' && credential.apiKey !== '') {
      configured.push(provider);
    } else {
      unconfigured.push(provider);
    }
  }

  return { configured, unconfigured };
}

type ProviderKind = 'apiKey' | 'oauth' | 'custom';

interface ConfiguredProvider {
  /** 存储 key：内置为 provider id，自定义为 `custom:<id>`。 */
  provider: string;
  label: string;
  kind: ProviderKind;
  /** 仅自定义 provider 有：配置 id（不含前缀）。 */
  customId?: string;
}

/**
 * 合并 API Key / OAuth / 自定义 provider 为一张按名称排序的「已管理」列表。
 * - API Key：非空 key 即算已配置（与模型可用性门控一致，不看 verified）；
 * - OAuth：已验证，或登录流程仍在进行 / 出错（`activeOAuth`），避免流程中途从列表消失；
 * - 自定义：用户创建即在列表中。
 */
function listConfiguredProviders(
  credentials: ProviderCredentials,
  customProviders: readonly CustomProviderConfig[],
  activeOAuth: ReadonlySet<string>,
): ConfiguredProvider[] {
  const entries: ConfiguredProvider[] = [];

  for (const provider of OAUTH_PROVIDERS) {
    const credential = credentials[provider.provider];
    const verified = credential?.authType === 'oauth' && credential.verified;
    if (verified || activeOAuth.has(provider.provider)) {
      entries.push({ provider: provider.provider, label: provider.label, kind: 'oauth' });
    }
  }
  for (const provider of partitionApiKeyProviders(credentials).configured) {
    entries.push({ provider: provider.provider, label: provider.label, kind: 'apiKey' });
  }
  for (const custom of customProviders) {
    entries.push({
      provider: customProviderKey(custom.id),
      label: custom.name,
      kind: 'custom',
      customId: custom.id,
    });
  }

  return entries.sort(
    (a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }) || a.provider.localeCompare(b.provider),
  );
}

export { partitionApiKeyProviders, listConfiguredProviders };
export type { ConfiguredProvider, ProviderKind };
