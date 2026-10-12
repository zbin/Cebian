import { getBuiltinModels, type BuiltinProvider } from '@earendil-works/pi-ai/providers/all';
import type { Api, Model } from '@earendil-works/pi-ai';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProviderCredential, CustomProviderConfig } from '@/lib/persistence/storage';
import { isCustomProvider, findCustomProvider, getCustomModels } from '@/lib/providers/custom-models';
import type { OAuthPhase } from '@/components/settings/provider/ProviderOAuthItem';
import { t } from '@/lib/i18n';
import type { ProviderKind } from '@/lib/providers/registry';

interface ProviderSummaryProps {
  provider: string;
  label: string;
  kind: ProviderKind;
  credential?: ProviderCredential;
  customProviders: CustomProviderConfig[];
  oauthState?: OAuthPhase;
  onEdit: () => void;
}

export function ProviderSummary({
  provider,
  label,
  kind,
  credential,
  customProviders,
  oauthState,
  onEdit,
}: ProviderSummaryProps) {
  let models: Model<Api>[] = [];
  const custom = isCustomProvider(provider)
    ? findCustomProvider(customProviders, provider)
    : undefined;

  if (custom) {
    models = getCustomModels(custom);
  } else {
    try {
      models = getBuiltinModels(provider as BuiltinProvider) as Model<Api>[];
    } catch {
      // Unknown provider.
    }
  }

  const typeLabel = t(`provider.type.${kind}`);
  let statusText: string;
  let statusClassName: string;
  if (kind === 'oauth') {
    if (oauthState?.phase === 'authorizing') {
      statusText = t('provider.oauth.authorizing');
      statusClassName = 'text-primary border-primary/20 bg-primary/5';
    } else if (oauthState?.phase === 'error') {
      statusText = t('provider.status.failed');
      statusClassName = 'text-destructive border-destructive/20 bg-destructive/5';
    } else if (credential?.authType === 'oauth' && credential.verified) {
      statusText = t('provider.oauth.loggedIn');
      statusClassName = 'text-success border-success/20 bg-success/5';
    } else {
      statusText = t('provider.oauth.notLoggedIn');
      statusClassName = 'text-muted-foreground border-border';
    }
  } else if (kind === 'apiKey') {
    const apiKeyCredential = credential?.authType === 'apiKey' ? credential : undefined;
    if (apiKeyCredential?.verified) {
      statusText = t('provider.status.connected');
      statusClassName = 'text-success border-success/20 bg-success/5';
    } else if (apiKeyCredential?.apiKey) {
      statusText = t('provider.status.unverified');
      statusClassName = 'text-muted-foreground border-border';
    } else {
      statusText = t('provider.status.notConfigured');
      statusClassName = 'text-muted-foreground border-border';
    }
  } else {
    // 自定义 provider 由用户主动创建，无 key 的本地服务（Ollama 等）同样是有效配置。
    statusText = t('provider.status.configured');
    statusClassName = 'text-primary border-primary/20 bg-primary/5';
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          <Badge variant="outline" className="text-[0.65rem] h-4 px-1.5">
            {typeLabel}
          </Badge>
          <Badge variant="outline" className={cn('text-[0.65rem] h-4 px-1.5', statusClassName)}>
            {statusText}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('provider.summary.modelsAvailable', [typeLabel, models.length])}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Pencil data-icon="inline-start" />
        {t('common.edit')}
      </Button>
    </div>
  );
}
