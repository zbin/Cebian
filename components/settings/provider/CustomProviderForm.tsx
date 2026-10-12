import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { DialogFooter } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionItem, AccordionContent, AccordionTrigger } from '@/components/ui/accordion';
import type { CustomProviderConfig, CustomModelDef } from '@/lib/persistence/storage';
import { applyFetchedSelection, fetchRemoteModels } from '@/lib/providers/custom-models';
import { ModelList } from '@/components/settings/provider/ModelList';
import type { ModelFieldPatch } from '@/components/settings/provider/ModelListItem';
import { HeadersEditor, headerRowsToRecord, recordToHeaderRows, type HeaderRow } from '@/components/settings/HeadersEditor';
import { t } from '@/lib/i18n';

// ─── Shared form body (used by both create and edit) ───

interface ProviderFormFields {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: CustomModelDef[];
  headers: HeaderRow[];
  manualModelId: string;
  fetching: boolean;
  fetchError: string;
  /** 「自动获取」拿到的远端模型 id，等用户在弹窗里勾选；`null` = 弹窗未打开。 */
  pickerRemoteIds: string[] | null;
}

function ProviderFormBody({
  fields,
  onFieldChange,
  onFetchModels,
  onConfirmPicked,
  onCancelPick,
  onAddManualModel,
  onRemoveModels,
  onToggleReasoning,
  onToggleImage,
  onModelFieldChange,
  onSubmit,
  onCancel,
  onRemove,
  submitLabel,
  submitDisabled,
}: {
  fields: ProviderFormFields;
  onFieldChange: (patch: Partial<ProviderFormFields>) => void;
  onFetchModels: () => void;
  onConfirmPicked: (selected: ReadonlySet<string>) => void;
  onCancelPick: () => void;
  onAddManualModel: () => void;
  onRemoveModels: (modelIds: string[]) => void;
  onToggleReasoning: (modelId: string) => void;
  onToggleImage: (modelId: string) => void;
  onModelFieldChange: (modelId: string, patch: ModelFieldPatch) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onRemove?: () => void;
  submitLabel: string;
  submitDisabled: boolean;
}) {
  const nameId = useId();
  const baseUrlId = useId();
  const apiKeyId = useId();
  const authConflict = fields.apiKey.trim() !== '' &&
    fields.headers.some((header) => {
      const key = header.key.trim().toLowerCase();
      return key === 'authorization' || key === 'cf-aig-authorization';
    });

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor={nameId}>{t('provider.form.name')}</FieldLabel>
            <Input
              id={nameId}
              value={fields.name}
              onChange={(event) => onFieldChange({ name: event.target.value })}
              placeholder={t('provider.form.namePlaceholder')}
              className="h-8 text-sm"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={baseUrlId}>{t('provider.form.baseUrl')}</FieldLabel>
            <Input
              id={baseUrlId}
              value={fields.baseUrl}
              onChange={(event) => onFieldChange({ baseUrl: event.target.value })}
              placeholder={t('provider.form.baseUrlPlaceholder')}
              className="h-8 text-sm"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={apiKeyId}>{t('provider.form.apiKeyOptional')}</FieldLabel>
            <PasswordInput
              id={apiKeyId}
              value={fields.apiKey}
              onChange={(event) => onFieldChange({ apiKey: event.target.value })}
              placeholder={t('provider.form.apiKeyPlaceholder')}
              className="h-8 text-sm"
            />
          </Field>
        </FieldGroup>

        <Separator />

        <ModelList
          models={fields.models}
          canFetch={fields.baseUrl.trim() !== ''}
          fetching={fields.fetching}
          fetchError={fields.fetchError}
          pickerRemoteIds={fields.pickerRemoteIds}
          manualModelId={fields.manualModelId}
          onManualModelIdChange={(value) => onFieldChange({ manualModelId: value })}
          onFetchModels={onFetchModels}
          onConfirmPicked={onConfirmPicked}
          onCancelPick={onCancelPick}
          onAddManualModel={onAddManualModel}
          onRemoveModels={onRemoveModels}
          onToggleReasoning={onToggleReasoning}
          onToggleImage={onToggleImage}
          onModelFieldChange={onModelFieldChange}
        />

        <Separator />

        <Accordion type="single" collapsible>
          <AccordionItem value="advanced" className="border-0">
            <AccordionTrigger className="py-1 text-xs font-medium hover:no-underline">
              {t('provider.form.advanced')}
            </AccordionTrigger>
            <AccordionContent className="pb-1">
              <FieldSet className="gap-2">
                <FieldLegend variant="label">{t('provider.form.headers')}</FieldLegend>
                <HeadersEditor
                  rows={fields.headers}
                  onChange={(headers) => onFieldChange({ headers })}
                />
                {authConflict && (
                  <FieldDescription className="text-amber-500">
                    {t('provider.form.authOverrideHint')}
                  </FieldDescription>
                )}
              </FieldSet>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <DialogFooter className={onRemove ? 'sm:justify-between' : undefined}>
        {onRemove && (
          <Button type="button" variant="destructive" onClick={onRemove}>
            <Trash2 data-icon="inline-start" />
            {t('common.delete')}
          </Button>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

// ─── Shared form logic hook ───

function useProviderForm(initial?: { name: string; baseUrl: string; apiKey: string; models: CustomModelDef[]; headers?: Record<string, string> }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [models, setModels] = useState<CustomModelDef[]>(initial?.models ?? []);
  const [headers, setHeaders] = useState<HeaderRow[]>(recordToHeaderRows(initial?.headers));
  const [manualModelId, setManualModelId] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [pickerRemoteIds, setPickerRemoteIds] = useState<string[] | null>(null);
  // 拉取代次：表单被重置 / 重新打开编辑、或端点参数变了，在途的拉取就作废——否则迟到的结果
  // 会在之后的表单里弹出上一个端点的模型勾选框（最长等 10 秒超时）。
  const fetchGenerationRef = useRef(0);
  const apiKeyEditedRef = useRef(false);
  const initialApiKey = initial?.apiKey ?? '';
  useEffect(() => () => {
    fetchGenerationRef.current++;
  }, []);
  const invalidateFetch = useCallback(() => {
    fetchGenerationRef.current += 1;
    setFetching(false);
  }, []);
  useEffect(() => {
    if (apiKeyEditedRef.current) return;
    invalidateFetch();
    setApiKey(initialApiKey);
  }, [initialApiKey, invalidateFetch]);

  const fields: ProviderFormFields = { name, baseUrl, apiKey, models, headers, manualModelId, fetching, fetchError, pickerRemoteIds };

  const onFieldChange = (patch: Partial<ProviderFormFields>) => {
    if (patch.baseUrl !== undefined || patch.apiKey !== undefined || patch.headers !== undefined) invalidateFetch();
    if (patch.name !== undefined) setName(patch.name);
    if (patch.baseUrl !== undefined) setBaseUrl(patch.baseUrl);
    if (patch.apiKey !== undefined) setApiKey(patch.apiKey);
    if (patch.models !== undefined) setModels(patch.models);
    if (patch.headers !== undefined) setHeaders(patch.headers);
    if (patch.manualModelId !== undefined) setManualModelId(patch.manualModelId);
    if (patch.pickerRemoteIds !== undefined) setPickerRemoteIds(patch.pickerRemoteIds);
    if (patch.apiKey !== undefined) apiKeyEditedRef.current = true;
  };

  const handleFetchModels = async () => {
    if (!baseUrl.trim()) return;
    const generation = ++fetchGenerationRef.current;
    setFetching(true);
    setFetchError('');
    try {
      const remote = await fetchRemoteModels(baseUrl, apiKey, headerRowsToRecord(headers));
      if (generation !== fetchGenerationRef.current) return;
      // 不直接改列表：先让用户在弹窗里勾选（issue #86），确定时再按勾选合并
      setPickerRemoteIds([...new Set(remote.map(r => r.id))]);
      setFetchError('');
    } catch {
      if (generation !== fetchGenerationRef.current) return;
      setFetchError(t('provider.form.fetchFailed'));
    } finally {
      if (generation === fetchGenerationRef.current) setFetching(false);
    }
  };

  const handleConfirmPicked = (selected: ReadonlySet<string>) => {
    const remoteIds = pickerRemoteIds;
    setPickerRemoteIds(null);
    if (!remoteIds) return;
    // 按 modelId 合并：勾上的保留既有配置，不在这次获取结果里的（如手动添加的）不受影响
    setModels(prev => applyFetchedSelection(prev, remoteIds, selected));
  };

  const handleCancelPick = () => setPickerRemoteIds(null);

  const handleAddManualModel = () => {
    const id = manualModelId.trim();
    if (!id || models.some(m => m.modelId === id)) return;
    setModels([...models, { modelId: id, name: id, reasoning: false, image: false }]);
    setManualModelId('');
  };

  const handleRemoveModels = (modelIds: string[]) => {
    const removed = new Set(modelIds);
    setModels(prev => prev.filter(m => !removed.has(m.modelId)));
  };

  const handleToggleReasoning = (modelId: string) =>
    setModels(models.map(m => m.modelId === modelId ? { ...m, reasoning: !m.reasoning } : m));

  const handleToggleImage = (modelId: string) =>
    setModels(models.map(m => m.modelId === modelId ? { ...m, image: !m.image } : m));

  const handleModelFieldChange = (
    modelId: string,
    patch: ModelFieldPatch,
  ) => setModels(models.map(m => (m.modelId === modelId ? { ...m, ...patch } : m)));
  return {
    fields,
    onFieldChange,
    handleFetchModels,
    handleConfirmPicked,
    handleCancelPick,
    handleAddManualModel,
    handleRemoveModels,
    handleToggleReasoning,
    handleToggleImage,
    handleModelFieldChange,
  };

}

interface CustomProviderFormProps {
  initial?: { config: CustomProviderConfig; apiKey: string };
  onSave: (config: CustomProviderConfig, apiKey?: string) => void;
  onRemove?: () => void;
  onCancel: () => void;
}

export function CustomProviderForm({ initial, onSave, onRemove, onCancel }: CustomProviderFormProps) {
  const form = useProviderForm(initial ? {
    name: initial.config.name,
    baseUrl: initial.config.baseUrl,
    apiKey: initial.apiKey,
    models: initial.config.models,
    headers: initial.config.headers,
  } : undefined);

  const handleSubmit = () => {
    const { name, baseUrl, apiKey, models, headers } = form.fields;
    if (!name.trim() || !baseUrl.trim() || models.length === 0) return;

    const headerRecord = headerRowsToRecord(headers);
    const config: CustomProviderConfig = {
      id: initial?.config.id ?? crypto.randomUUID(),
      name: name.trim(),
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      models,
      ...(headerRecord ? { headers: headerRecord } : {}),
    };
    if (initial) {
      const keyChanged = apiKey.trim() !== initial.apiKey;
      onSave(config, keyChanged ? apiKey.trim() || undefined : initial.apiKey || undefined);
    } else {
      onSave(config, apiKey.trim() || undefined);
    }
  };

  return (
    <ProviderFormBody
      fields={form.fields}
      onFieldChange={form.onFieldChange}
      onFetchModels={form.handleFetchModels}
      onConfirmPicked={form.handleConfirmPicked}
      onCancelPick={form.handleCancelPick}
      onAddManualModel={form.handleAddManualModel}
      onRemoveModels={form.handleRemoveModels}
      onToggleReasoning={form.handleToggleReasoning}
      onToggleImage={form.handleToggleImage}
      onModelFieldChange={form.handleModelFieldChange}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onRemove={onRemove}
      submitLabel={initial ? t('common.save') : t('common.add')}
      submitDisabled={!form.fields.name.trim() || !form.fields.baseUrl.trim() || form.fields.models.length === 0}
    />
  );
}
