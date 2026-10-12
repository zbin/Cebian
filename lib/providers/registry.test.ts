import { describe, expect, it, vi } from 'vitest';
import type { ProviderCredentials } from '@/lib/persistence/storage';
import { APIKEY_PROVIDERS, listConfiguredProviders, partitionApiKeyProviders } from './registry';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));

describe('partitionApiKeyProviders', () => {
  it('keeps non-empty API keys regardless of verification and hides empty or mismatched credentials', () => {
    const credentials: ProviderCredentials = {
      anthropic: { authType: 'apiKey', apiKey: 'sk-anthropic', verified: true },
      deepseek: { authType: 'apiKey', apiKey: '', verified: true },
      google: { authType: 'oauth', accessToken: 'token', verified: true },
      openai: { authType: 'apiKey', apiKey: 'sk-openai', verified: false },
    };

    const { configured, unconfigured } = partitionApiKeyProviders(credentials);

    expect(configured.map(({ provider }) => provider)).toEqual(['anthropic', 'openai']);
    expect(unconfigured.map(({ provider }) => provider)).toEqual(
      APIKEY_PROVIDERS.map(({ provider }) => provider).filter(
        (provider) => !['anthropic', 'openai'].includes(provider),
      ),
    );
  });
});

describe('listConfiguredProviders', () => {
  it('merges all kinds into one name-sorted list and applies per-kind visibility rules', () => {
    const credentials: ProviderCredentials = {
      openai: { authType: 'apiKey', apiKey: 'sk', verified: false },
      anthropic: { authType: 'apiKey', apiKey: '', verified: true },
      'github-copilot': { authType: 'oauth', accessToken: 't', verified: true },
      'openai-codex': { authType: 'oauth', accessToken: 't', verified: false },
    };
    const customs = [{ id: 'a1', name: 'Ollama', baseUrl: 'http://localhost:11434/v1', models: [] }];

    const list = listConfiguredProviders(credentials, customs, new Set());

    expect(list.map(({ provider, kind }) => [provider, kind])).toEqual([
      ['github-copilot', 'oauth'],
      ['custom:a1', 'custom'],
      ['openai', 'apiKey'],
    ]);
    expect(list[1].customId).toBe('a1');
  });

  it('keeps an OAuth provider listed while its login flow is active even if unverified', () => {
    const list = listConfiguredProviders({}, [], new Set(['openai-codex']));
    expect(list.map(({ provider }) => provider)).toEqual(['openai-codex']);
  });
});
