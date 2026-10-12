import { useRef } from 'react';
import {
  ArrowLeft,
  KeyRound,
  LogIn,
  Plus,
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProviderApiKeyItem } from '@/components/settings/provider/ProviderApiKeyItem';
import { ProviderOAuthItem, type OAuthPhase } from '@/components/settings/provider/ProviderOAuthItem';
import { CustomProviderForm } from '@/components/settings/provider/CustomProviderForm';
import {
  APIKEY_PROVIDERS,
  OAUTH_PROVIDERS,
  partitionApiKeyProviders,
} from '@/lib/providers/registry';
import { customProviderKey } from '@/lib/providers/custom-models';
import type {
  ApiKeyCredential,
  CustomProviderConfig,
  OAuthCredential,
  ProviderCredentials,
} from '@/lib/persistence/storage';
import { t } from '@/lib/i18n';

type ProviderEditorTarget =
  | { kind: 'catalog' }
  | { kind: 'apiKey'; provider: string; intent: 'add' | 'edit' }
  | { kind: 'oauth'; provider: string; intent: 'add' | 'edit' }
  | { kind: 'custom'; intent: 'add' }
  | { kind: 'custom'; intent: 'edit'; id: string };

interface ProviderEditorDialogProps {
  target: ProviderEditorTarget | null;
  credentials: ProviderCredentials;
  customProviders: CustomProviderConfig[];
  oauthStates: Record<string, OAuthPhase>;
  onTargetChange: (target: ProviderEditorTarget | null) => void;
  onSaveCredential: (provider: string, credential: ApiKeyCredential | OAuthCredential) => void;
  onRemoveCredential: (provider: string) => void;
  onOAuthLogin: (provider: string) => void;
  onOAuthLogout: (provider: string) => void;
  onOAuthCancel: (provider: string) => void;
  onAddCustomProvider: (config: CustomProviderConfig, apiKey?: string) => void;
  onUpdateCustomProvider: (config: CustomProviderConfig, apiKey?: string) => void;
  onRemoveCustomProvider: (id: string) => void;
}

function ProviderEditorDialog({
  target,
  credentials,
  customProviders,
  oauthStates,
  onTargetChange,
  onSaveCredential,
  onRemoveCredential,
  onOAuthLogin,
  onOAuthLogout,
  onOAuthCancel,
  onAddCustomProvider,
  onUpdateCustomProvider,
  onRemoveCustomProvider,
}: ProviderEditorDialogProps) {
  const targetRef = useRef(target);
  targetRef.current = target;
  const changeTarget = (next: ProviderEditorTarget | null) => {
    targetRef.current = next;
    onTargetChange(next);
  };
  const { unconfigured: apiKeyCatalog } = partitionApiKeyProviders(credentials);
  const oauthCatalog = OAUTH_PROVIDERS.filter((provider) => {
    const credential = credentials[provider.provider];
    const phase = oauthStates[provider.provider]?.phase ?? 'idle';
    return !(credential?.authType === 'oauth' && credential.verified) && phase === 'idle';
  });
  const isAdding = target?.kind === 'catalog' || (target !== null && 'intent' in target && target.intent === 'add');
  const showBack = target !== null && target.kind !== 'catalog' && target.intent === 'add';

  const close = (expectedTarget: ProviderEditorTarget | null) => {
    if (targetRef.current !== expectedTarget) return;
    if (expectedTarget?.kind === 'oauth' && oauthStates[expectedTarget.provider]?.phase === 'authorizing') {
      onOAuthCancel(expectedTarget.provider);
    }
    changeTarget(null);
  };
  const backToCatalog = () => {
    const activeTarget = targetRef.current;
    if (activeTarget?.kind === 'oauth' && oauthStates[activeTarget.provider]?.phase === 'authorizing') {
      onOAuthCancel(activeTarget.provider);
    }
    changeTarget({ kind: 'catalog' });
  };

  const apiKeyProvider =
    target?.kind === 'apiKey'
      ? APIKEY_PROVIDERS.find((provider) => provider.provider === target.provider)
      : undefined;
  const oauthProvider =
    target?.kind === 'oauth'
      ? OAUTH_PROVIDERS.find((provider) => provider.provider === target.provider)
      : undefined;
  const customConfig =
    target?.kind === 'custom' && target.intent === 'edit'
      ? customProviders.find((provider) => provider.id === target.id)
      : undefined;
  const apiKeyCredentialValue =
    target?.kind === 'apiKey' && target.intent === 'edit'
      ? credentials[target.provider]
      : undefined;
  const apiKeyCredential =
    apiKeyCredentialValue?.authType === 'apiKey' ? apiKeyCredentialValue : undefined;
  const oauthCredentialValue =
    target?.kind === 'oauth' ? credentials[target.provider] : undefined;
  const oauthCredential =
    oauthCredentialValue?.authType === 'oauth' ? oauthCredentialValue : undefined;
  const customApiKeyValue = customConfig
    ? credentials[customProviderKey(customConfig.id)]
    : undefined;
  const customApiKey =
    customApiKeyValue?.authType === 'apiKey' ? customApiKeyValue.apiKey : '';

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) close(target); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-left">
          {showBack && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit px-0"
              onClick={backToCatalog}
            >
              <ArrowLeft data-icon="inline-start" />
              {t('provider.management.back')}
            </Button>
          )}
          <DialogTitle>
            {isAdding ? t('provider.management.addProvider') : t('provider.management.editTitle')}
          </DialogTitle>
          <DialogDescription>
            {target?.kind === 'catalog'
              ? t('provider.management.addDescription')
              : isAdding
                ? t('provider.management.configureDescription')
                : t('provider.management.editDescription')}
          </DialogDescription>
        </DialogHeader>

        {target?.kind === 'catalog' && (
          <Command className="min-w-0 rounded-md border">
            <CommandInput
              placeholder={t('provider.management.search')}
              aria-label={t('provider.management.search')}
            />
            <CommandList className="max-h-[60vh]">
              <CommandEmpty>{t('provider.management.noMatch')}</CommandEmpty>
              {apiKeyCatalog.length > 0 && (
                <CommandGroup heading={t('provider.type.apiKey')}>
                  {apiKeyCatalog.map((provider) => (
                    <CommandItem
                      key={provider.provider}
                      value={`${provider.label} ${provider.provider}`}
                      onSelect={() => changeTarget({ kind: 'apiKey', provider: provider.provider, intent: 'add' })}
                    >
                      <KeyRound data-icon="inline-start" />
                      <span>{provider.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {oauthCatalog.length > 0 && (
                <CommandGroup heading={t('provider.type.oauth')}>
                  {oauthCatalog.map((provider) => (
                    <CommandItem
                      key={provider.provider}
                      value={`${provider.label} ${provider.provider}`}
                      onSelect={() => changeTarget({ kind: 'oauth', provider: provider.provider, intent: 'add' })}
                    >
                      <LogIn data-icon="inline-start" />
                      <span>{provider.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup heading={t('provider.type.custom')}>
                <CommandItem
                  value={`${t('provider.form.addCustom')} custom openai compatible`}
                  onSelect={() => changeTarget({ kind: 'custom', intent: 'add' })}
                >
                  <Plus data-icon="inline-start" />
                  <span>{t('provider.form.addCustom')}</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}

        {target?.kind === 'apiKey' && apiKeyProvider && (
          <ProviderApiKeyItem
            key={`${target.intent}:${target.provider}`}
            provider={target.provider}
            label={apiKeyProvider.label}
            credential={apiKeyCredential}
            onSave={(credential) => {
              onSaveCredential(target.provider, credential);
              close(target);
            }}
            onRemove={
              target.intent === 'edit'
                ? () => {
                    onRemoveCredential(target.provider);
                    close(target);
                  }
                : undefined
            }
          />
        )}

        {target?.kind === 'oauth' && oauthProvider && (
          <ProviderOAuthItem
            key={`${target.intent}:${target.provider}`}
            provider={target.provider}
            label={oauthProvider.label}
            description={oauthProvider.getDescription()}
            flow={oauthProvider.flow}
            credential={oauthCredential}
            oauthState={oauthStates[target.provider] ?? { phase: 'idle' }}
            onLogin={() => onOAuthLogin(target.provider)}
            onLogout={() => onOAuthLogout(target.provider)}
            onCancel={() => onOAuthCancel(target.provider)}
          />
        )}

        {target?.kind === 'custom' && (
          target.intent === 'add' || customConfig ? (
            <CustomProviderForm
              key={target.intent === 'edit' ? target.id : 'add-custom-provider'}
              initial={
                customConfig
                  ? {
                      config: customConfig,
                      apiKey: customApiKey,
                    }
                  : undefined
              }
              onSave={(config, apiKey) => {
                if (target.intent === 'edit') onUpdateCustomProvider(config, apiKey);
                else onAddCustomProvider(config, apiKey);
                close(target);
              }}
              onRemove={
                target.intent === 'edit'
                  ? () => {
                      onRemoveCustomProvider(target.id);
                      close(target);
                    }
                  : undefined
              }
              onCancel={() => {
                if (target.intent === 'add') changeTarget({ kind: 'catalog' });
                else close(target);
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t('provider.management.providerRemoved')}</p>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

export { ProviderEditorDialog };
export type { ProviderEditorTarget, ProviderEditorDialogProps };
