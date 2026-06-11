import { useEffect, useMemo, useState } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, Keyboard, RefreshCw } from 'lucide-react';
import type { ProviderDraft } from './app-settings';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { useTranslation } from 'react-i18next';

export function ProviderModelFields({
  draft,
  modelError,
  modelLoading,
  modelNotice,
  visibleModels,
  onChange,
  onFetchModels,
  onUseCustomModel,
}: {
  draft: ProviderDraft;
  modelError: string;
  modelLoading: boolean;
  modelNotice: string;
  visibleModels: string[];
  onChange: (draft: ProviderDraft) => void;
  onFetchModels: () => void;
  onUseCustomModel: () => void;
}) {
  const { t } = useTranslation();
  const isCustomModel = (draft.modelInputMode || 'list') === 'custom';

  return (
    <Field id="provider-model" label={t('settings.models.model')}>
      <div className="provider-model-field">
        {isCustomModel ? (
          <Input
            id="provider-model"
            name="provider-model"
            autoComplete="off"
            value={draft.modelName || ''}
            onChange={(event) => onChange({ ...draft, modelName: event.target.value })}
          />
        ) : (
          <ProviderModelPicker
            id="provider-model"
            labelledBy="provider-model-label"
            modelName={draft.modelName || ''}
            models={visibleModels}
            onChange={(modelName) => onChange({ ...draft, modelName })}
          />
        )}
        <Button
          className={
            isCustomModel
              ? 'action-button provider-model-mode-button is-active'
              : 'action-button provider-model-mode-button'
          }
          type="button"
          variant="secondary"
          onClick={onUseCustomModel}
        >
          <Keyboard size={15} />
          {t('settings.models.customModel')}
        </Button>
        <Button
          className="action-button"
          type="button"
          variant="secondary"
          disabled={modelLoading}
          onClick={onFetchModels}
        >
          <RefreshCw size={15} />
          {modelLoading ? t('settings.models.fetchingModel') : t('settings.models.fetchModel')}
        </Button>
      </div>
      {modelNotice ? <p className="field-inline-note">{modelNotice}</p> : null}
      {modelError ? <p className="field-inline-error">{modelError}</p> : null}
    </Field>
  );
}

function ProviderModelPicker({
  id,
  labelledBy,
  modelName,
  models,
  onChange,
}: {
  id: string;
  labelledBy: string;
  modelName: string;
  models: string[];
  onChange: (modelName: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(modelName);
  const selectedModel = models.includes(modelName) ? modelName : null;
  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery || query === selectedModel) return models;
    return models.filter((model) => model.toLowerCase().includes(normalizedQuery));
  }, [models, query, selectedModel]);

  useEffect(() => {
    if (!open) {
      setQuery(selectedModel || '');
    }
  }, [open, selectedModel]);

  useEffect(() => {
    setQuery(selectedModel || '');
  }, [models, selectedModel]);

  return (
    <Combobox.Root
      autoComplete="list"
      autoHighlight
      disabled={models.length === 0}
      filteredItems={filteredModels}
      inputValue={query}
      items={models}
      modal={false}
      open={open}
      openOnInputClick
      value={selectedModel}
      onInputValueChange={(value) => {
        setQuery(value);
        if (!open) setOpen(true);
      }}
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      onValueChange={(value) => {
        if (value) {
          onChange(value);
          setQuery(value);
        }
      }}
    >
      <div className="provider-model-picker">
        <Combobox.InputGroup className="provider-model-trigger">
          <Combobox.Input
            aria-labelledby={labelledBy}
            autoComplete="off"
            className={selectedModel ? 'provider-model-value' : 'provider-model-placeholder'}
            id={id}
            placeholder={t('settings.models.chooseModel')}
          />
          <Combobox.Trigger
            className="provider-model-combobox-trigger"
            aria-label={t('settings.models.chooseModel')}
          >
            <ChevronDown size={16} />
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner className="z-[var(--app-z-tooltip)]" align="start" sideOffset={8}>
            <Combobox.Popup className="provider-model-menu theme-select-content">
              <Combobox.List className="provider-model-options">
                {filteredModels.map((model, index) => (
                  <Combobox.Item
                    className="provider-model-option"
                    index={index}
                    key={model}
                    value={model}
                  >
                    <span>{model}</span>
                    <Combobox.ItemIndicator className="provider-model-option-indicator">
                      <Check size={16} />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                ))}
              </Combobox.List>
              {filteredModels.length === 0 ? (
                <Combobox.Empty className="provider-model-empty">
                  {t('settings.models.noMatchedModel')}
                </Combobox.Empty>
              ) : null}
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </div>
    </Combobox.Root>
  );
}
