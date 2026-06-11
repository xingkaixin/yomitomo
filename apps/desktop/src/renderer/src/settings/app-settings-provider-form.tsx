import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { providerPresets } from '@yomitomo/shared';
import type { ProviderDraft } from './app-settings';
import { Field } from '../shell/app-ui';
import { providerLogoMap } from './app-settings-provider-assets';
import { useProviderModelFetch } from './app-settings-provider-model-fetch';
import { ProviderModelFields } from './app-settings-provider-model-fields';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useTranslation } from 'react-i18next';
import { providerPresetDisplayName } from '../i18n/app-i18n-labels';

export function ProviderForm({
  draft,
  onChange,
  selectContentClassName = 'theme-select-content',
}: {
  draft: ProviderDraft;
  onChange: (draft: ProviderDraft) => void;
  selectContentClassName?: string;
}) {
  const { t } = useTranslation();
  const { fetchModels, clearModelStatus, modelError, modelLoading, modelNotice, visibleModels } =
    useProviderModelFetch(draft, onChange);

  function applyPreset(presetId: string) {
    const preset = providerPresets.find((item) => item.id === presetId);
    if (!preset) return;
    clearModelStatus();
    onChange({
      ...draft,
      presetId: preset.id,
      name: providerPresetDisplayName(preset.id, preset.name),
      type: preset.type,
      logo: preset.logo,
      baseUrl: preset.baseUrl,
      modelName: preset.modelName,
      modelNames: preset.modelNames,
      modelInputMode: 'list',
      reasoningEffort: 'none',
    });
  }

  function useCustomModel() {
    clearModelStatus();
    onChange({
      ...draft,
      modelInputMode: 'custom',
      modelNames: undefined,
    });
  }

  const selectedPreset = providerPresets.find((preset) => preset.id === draft.presetId);

  return (
    <div className="settings-form-grid">
      <Field
        id="provider-preset"
        className="col-span-2"
        label={t('settings.models.presetProvider')}
      >
        <Select value={draft.presetId || ''} onValueChange={applyPreset}>
          <SelectTrigger
            id="provider-preset"
            aria-labelledby="provider-preset-label"
            className="provider-select-trigger"
          >
            <SelectValue placeholder={t('settings.models.chooseProviderPreset')}>
              {selectedPreset ? (
                <span className="provider-preset-item">
                  <img
                    className="provider-preset-logo"
                    src={providerLogoMap[selectedPreset.logo]}
                    alt=""
                  />
                  {providerPresetDisplayName(selectedPreset.id, selectedPreset.name)}
                </span>
              ) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className={selectContentClassName}>
            <SelectGroup>
              {providerPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <span className="provider-preset-item">
                    <img
                      className="provider-preset-logo"
                      src={providerLogoMap[preset.logo]}
                      alt=""
                    />
                    {providerPresetDisplayName(preset.id, preset.name)}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field id="provider-name" label={t('settings.models.providerName')}>
        <Input
          id="provider-name"
          name="provider-name"
          autoComplete="off"
          value={draft.name || ''}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </Field>
      <Field id="provider-base-url" label="Base URL">
        <Input
          id="provider-base-url"
          name="provider-base-url"
          type="url"
          autoComplete="off"
          value={draft.baseUrl || ''}
          onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })}
        />
      </Field>
      <ProviderModelFields
        draft={draft}
        modelError={modelError}
        modelLoading={modelLoading}
        modelNotice={modelNotice}
        visibleModels={visibleModels}
        onChange={onChange}
        onFetchModels={fetchModels}
        onUseCustomModel={useCustomModel}
      />
      <Field id="provider-api-key" className="col-span-2" label="API Key">
        <SecretInput
          id="provider-api-key"
          hasStoredValue={Boolean(draft.hasApiKey)}
          storedValueId={draft.id}
          value={draft.apiKey || ''}
          onChange={(apiKey) => onChange({ ...draft, apiKey, removeApiKey: false })}
          onRevealStoredValue={() =>
            draft.id && window.yomitomoDesktop
              ? window.yomitomoDesktop.readProviderApiKey(draft.id)
              : Promise.resolve('')
          }
          onRemove={() => onChange({ ...draft, apiKey: '', hasApiKey: false, removeApiKey: true })}
        />
      </Field>
    </div>
  );
}

function SecretInput({
  hasStoredValue,
  id,
  storedValueId,
  value,
  onChange,
  onRevealStoredValue,
  onRemove,
}: {
  hasStoredValue?: boolean;
  id: string;
  storedValueId?: string;
  value: string;
  onChange: (value: string) => void;
  onRevealStoredValue?: () => Promise<string>;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [revealedStoredValue, setRevealedStoredValue] = useState('');
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealError, setRevealError] = useState('');
  const revealRequestRef = useRef(0);
  const displayValue = value || (visible ? revealedStoredValue : '');

  async function toggleVisible() {
    if (visible) {
      setVisible(false);
      setRevealedStoredValue('');
      setRevealError('');
      return;
    }

    if (value || !hasStoredValue) {
      setVisible(true);
      return;
    }

    setRevealError('');
    setRevealLoading(true);
    const requestId = ++revealRequestRef.current;
    try {
      const storedValue = (await onRevealStoredValue?.()) || '';
      if (requestId !== revealRequestRef.current) return;
      setRevealedStoredValue(storedValue);
      setVisible(true);
      if (!storedValue) setRevealError(t('settings.models.noStoredKey'));
    } catch {
      if (requestId !== revealRequestRef.current) return;
      setRevealError(t('settings.models.readStoredKeyFailed'));
    } finally {
      if (requestId === revealRequestRef.current) setRevealLoading(false);
    }
  }

  useEffect(() => {
    revealRequestRef.current += 1;
    setVisible(false);
    setRevealedStoredValue('');
    setRevealError('');
    setRevealLoading(false);
  }, [storedValueId]);

  useEffect(() => {
    if (hasStoredValue && !value) return;
    revealRequestRef.current += 1;
    setRevealedStoredValue('');
    setRevealError('');
    setRevealLoading(false);
    if (!value) setVisible(false);
  }, [hasStoredValue, value]);

  return (
    <div className="secret-input">
      <div className="relative">
        <Input
          id={id}
          className="pr-12"
          name={id}
          autoComplete="off"
          placeholder={hasStoredValue ? t('settings.models.apiKeyStoredPlaceholder') : undefined}
          spellCheck={false}
          type={visible ? 'text' : 'password'}
          value={displayValue}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="secret-toggle"
          type="button"
          disabled={revealLoading}
          aria-label={visible ? t('settings.models.hideApiKey') : t('settings.models.showApiKey')}
          onClick={toggleVisible}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {revealError ? <p className="secret-input-error">{revealError}</p> : null}
      {hasStoredValue && !value ? (
        <Button className="secret-remove" type="button" variant="secondary" onClick={onRemove}>
          <Trash2 size={14} />
          {t('settings.models.removeStoredKey')}
        </Button>
      ) : null}
    </div>
  );
}
