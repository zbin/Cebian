import { Fragment, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ProviderEditorDialog, type ProviderEditorTarget } from '@/components/settings/provider/ProviderEditorDialog';
import type { OAuthPhase } from '@/components/settings/provider/ProviderOAuthItem';
import { ProviderSummary } from '@/components/settings/provider/ProviderSummary';
import { useStorageItem } from '@/hooks/useStorageItem';
import {
  providerCredentials,
  lastSelectedModel,
  customProviders,
  type ApiKeyCredential,
  type OAuthCredential,
  type ProviderCredentials,
  type CustomProviderConfig,
} from '@/lib/persistence/storage';
import { listConfiguredProviders, type ConfiguredProvider } from '@/lib/providers/registry';
import { customProviderKey } from '@/lib/providers/custom-models';
import { loginGitHubCopilot, loginOpenAICodex } from '@/lib/providers/oauth';
import { t } from '@/lib/i18n';

function editTargetOf(entry: ConfiguredProvider): ProviderEditorTarget {
  if (entry.kind === 'custom') return { kind: 'custom', intent: 'edit', id: entry.customId! };
  return { kind: entry.kind, provider: entry.provider, intent: 'edit' };
}

/** AI 提供商设置编排：持有配置与 OAuth 状态，列表行通过共享对话框管理。 */
export function ProvidersSection() {
  const [providers, setProviders] = useStorageItem(providerCredentials, {});
  const [currentModel, setCurrentModel] = useStorageItem(lastSelectedModel, null);
  const [customs, setCustoms] = useStorageItem(customProviders, []);
  const [oauthStates, setOAuthStates] = useState<Record<string, OAuthPhase>>({});
  const [dialogTarget, setDialogTarget] = useState<ProviderEditorTarget | null>(null);
  const abortRefs = useRef<Record<string, AbortController>>({});

  const configuredProviders = useMemo(
    () => listConfiguredProviders(
      providers,
      customs,
      new Set(Object.entries(oauthStates).filter(([, state]) => state.phase === 'authorizing').map(([provider]) => provider)),
    ),
    [providers, customs, oauthStates],
  );

  const getOAuthState = (provider: string): OAuthPhase =>
    oauthStates[provider] ?? { phase: 'idle' };

  const setOAuthState = (provider: string, state: OAuthPhase) =>
    setOAuthStates((prev) => ({ ...prev, [provider]: state }));

  const clearActiveModelIfNeeded = (provider: string) => {
    if (currentModel?.provider === provider) {
      setCurrentModel(null);
    }
  };

  const handleCredentialSave = (provider: string, credential: ApiKeyCredential | OAuthCredential) => {
    setProviders({ ...providers, [provider]: credential });
  };

  const handleApiKeyRemove = (provider: string) => {
    const next: ProviderCredentials = { ...providers };
    delete next[provider];
    setProviders(next);
    clearActiveModelIfNeeded(provider);
  };

  const handleOAuthLogin = async (provider: string) => {
    if (abortRefs.current[provider]) return;

    const abort = new AbortController();
    abortRefs.current[provider] = abort;
    setOAuthState(provider, { phase: 'authorizing' });
    try {
      let result;
      switch (provider) {
        case 'github-copilot':
          result = await loginGitHubCopilot({
            onDeviceCode: (code) => setOAuthState(provider, { phase: 'authorizing', deviceCode: code }),
            signal: abort.signal,
          });
          break;
        case 'openai-codex':
          result = await loginOpenAICodex(abort.signal);
          break;
        default:
          return;
      }

      handleCredentialSave(provider, {
        authType: 'oauth',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        verified: true,
        extra: result.extra,
      });
      setOAuthState(provider, { phase: 'success' });
      setTimeout(() => setOAuthState(provider, { phase: 'idle' }), 3000);
    } catch (err) {
      if (abort.signal.aborted) return;
      setOAuthState(provider, {
        phase: 'error',
        message: err instanceof Error ? err.message : t('provider.oauth.authFailed'),
      });
    } finally {
      delete abortRefs.current[provider];
    }
  };

  const handleOAuthCancel = (provider: string) => {
    abortRefs.current[provider]?.abort();
    delete abortRefs.current[provider];
    setOAuthState(provider, { phase: 'idle' });
  };

  const handleOAuthLogout = (provider: string) => {
    const next: ProviderCredentials = { ...providers };
    delete next[provider];
    setProviders(next);
    clearActiveModelIfNeeded(provider);
    setOAuthState(provider, { phase: 'idle' });
  };

  const handleAddCustomProvider = (config: CustomProviderConfig, apiKey?: string) => {
    if (customs.some((custom) => custom.id === config.id)) return;
    setCustoms([...customs, config]);
    if (apiKey) {
      handleCredentialSave(customProviderKey(config.id), { authType: 'apiKey', apiKey, verified: false });
    }
  };

  const handleUpdateCustomProvider = (config: CustomProviderConfig, apiKey?: string) => {
    setCustoms(customs.map((custom) => (custom.id === config.id ? config : custom)));
    const key = customProviderKey(config.id);
    if (apiKey) handleCredentialSave(key, { authType: 'apiKey', apiKey, verified: false });
    else if (providers[key]) handleApiKeyRemove(key);
  };

  const handleRemoveCustomProvider = (id: string) => {
    setCustoms(customs.filter((custom) => custom.id !== id));
    handleApiKeyRemove(customProviderKey(id));
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('settings.providers.title')}</h2>
        <Button onClick={() => setDialogTarget({ kind: 'catalog' })}>
          <Plus data-icon="inline-start" />
          {t('provider.management.addProvider')}
        </Button>
      </div>

      <div className="space-y-4">
        {configuredProviders.map((entry, index) => (
          <Fragment key={entry.provider}>
            {index > 0 && <Separator />}
            <ProviderSummary
              provider={entry.provider}
              label={entry.label}
              kind={entry.kind}
              credential={providers[entry.provider]}
              customProviders={customs}
              oauthState={entry.kind === 'oauth' ? getOAuthState(entry.provider) : undefined}
              onEdit={() => setDialogTarget(editTargetOf(entry))}
            />
          </Fragment>
        ))}
      </div>

      <ProviderEditorDialog
        target={dialogTarget}
        credentials={providers}
        customProviders={customs}
        oauthStates={oauthStates}
        onTargetChange={setDialogTarget}
        onSaveCredential={handleCredentialSave}
        onRemoveCredential={handleApiKeyRemove}
        onOAuthLogin={handleOAuthLogin}
        onOAuthLogout={handleOAuthLogout}
        onOAuthCancel={handleOAuthCancel}
        onAddCustomProvider={handleAddCustomProvider}
        onUpdateCustomProvider={handleUpdateCustomProvider}
        onRemoveCustomProvider={handleRemoveCustomProvider}
      />
    </div>
  );
}
