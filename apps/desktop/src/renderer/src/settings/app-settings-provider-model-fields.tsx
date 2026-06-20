import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Keyboard,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
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
  presetModels,
  visibleModels,
  onChange,
  onFetchModels,
}: {
  draft: ProviderDraft;
  modelError: string;
  modelLoading: boolean;
  modelNotice: string;
  presetModels: string[];
  visibleModels: string[];
  onChange: (draft: ProviderDraft) => void;
  onFetchModels: () => void;
}) {
  const { t } = useTranslation();

  function updateModels(nextModels: string[], preferredModelName?: string) {
    const modelNames = mergeModelNames(nextModels);
    const currentModelName = preferredModelName || draft.modelName || '';
    onChange({
      ...draft,
      modelInputMode: 'list',
      modelName: modelNames.includes(currentModelName) ? currentModelName : modelNames[0] || '',
      modelNames,
    });
  }

  function selectModel(modelName: string) {
    updateModels(visibleModels, modelName);
  }

  function addCustomModel(modelName: string) {
    updateModels(mergeModelNames(visibleModels, [modelName]), modelName);
  }

  function updateCustomModel(modelName: string, nextModelName: string) {
    if (presetModels.includes(modelName)) return;
    const normalizedModelName = nextModelName.trim();
    if (!normalizedModelName) {
      deleteCustomModel(modelName);
      return;
    }
    const nextModels = mergeModelNames(
      visibleModels.map((item) => (item === modelName ? normalizedModelName : item)),
    );
    updateModels(nextModels, draft.modelName === modelName ? normalizedModelName : draft.modelName);
  }

  function deleteCustomModel(modelName: string) {
    if (presetModels.includes(modelName)) return;
    if (visibleModels.length <= 1) return;
    updateModels(
      visibleModels.filter((item) => item !== modelName),
      draft.modelName === modelName ? undefined : draft.modelName,
    );
  }

  function hidePresetModel(modelName: string) {
    if (!presetModels.includes(modelName)) return;
    if (visibleModels.length <= 1) return;
    updateModels(
      visibleModels.filter((item) => item !== modelName),
      draft.modelName === modelName ? undefined : draft.modelName,
    );
  }

  function showPresetModel(modelName: string) {
    if (!presetModels.includes(modelName)) return;
    updateModels(
      restorePresetModel(visibleModels, presetModels, modelName),
      draft.modelName || modelName,
    );
  }

  return (
    <Field id="provider-model" label={t('settings.models.model')}>
      <div className="provider-model-field">
        <ProviderModelPicker
          id="provider-model"
          labelledBy="provider-model-label"
          modelLoading={modelLoading}
          modelName={draft.modelName || ''}
          models={visibleModels}
          presetModels={presetModels}
          onAddCustomModel={addCustomModel}
          onChange={selectModel}
          onDeleteCustomModel={deleteCustomModel}
          onFetchModels={onFetchModels}
          onHidePresetModel={hidePresetModel}
          onShowPresetModel={showPresetModel}
          onUpdateCustomModel={updateCustomModel}
        />
      </div>
      {modelNotice ? <p className="field-inline-note">{modelNotice}</p> : null}
      {modelError ? <p className="field-inline-error">{modelError}</p> : null}
    </Field>
  );
}

function ProviderModelPicker({
  id,
  labelledBy,
  modelLoading,
  modelName,
  models,
  presetModels,
  onAddCustomModel,
  onChange,
  onDeleteCustomModel,
  onFetchModels,
  onHidePresetModel,
  onShowPresetModel,
  onUpdateCustomModel,
}: {
  id: string;
  labelledBy: string;
  modelLoading: boolean;
  modelName: string;
  models: string[];
  presetModels: string[];
  onAddCustomModel: (modelName: string) => void;
  onChange: (modelName: string) => void;
  onDeleteCustomModel: (modelName: string) => void;
  onFetchModels: () => void;
  onHidePresetModel: (modelName: string) => void;
  onShowPresetModel: (modelName: string) => void;
  onUpdateCustomModel: (modelName: string, nextModelName: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [editingModel, setEditingModel] = useState('');
  const [menuPlacement, setMenuPlacement] = useState<ProviderModelMenuPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedModels = useMemo(() => mergeModelNames(models), [models]);
  const hiddenPresetModels = useMemo(
    () => presetModels.filter((model) => !normalizedModels.includes(model)),
    [normalizedModels, presetModels],
  );
  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return normalizedModels;
    return normalizedModels.filter((model) => model.toLowerCase().includes(normalizedQuery));
  }, [normalizedModels, query]);
  const updateMenuPlacement = useCallback(() => {
    if (!rootRef.current) return;
    setMenuPlacement(getProviderModelMenuPlacement(rootRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPlacement(null);
      return;
    }
    updateMenuPlacement();
  }, [open, updateMenuPlacement]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    function closeOnOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    if (!open) return undefined;
    document.addEventListener('mousedown', closeOnOutsidePointer);
    return () => document.removeEventListener('mousedown', closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', updateMenuPlacement);
    window.addEventListener('scroll', updateMenuPlacement, true);
    return () => {
      window.removeEventListener('resize', updateMenuPlacement);
      window.removeEventListener('scroll', updateMenuPlacement, true);
    };
  }, [open, updateMenuPlacement]);

  function submitCustomModel() {
    const nextModel = customModel.trim();
    if (!nextModel) return;
    if (editingModel) {
      onUpdateCustomModel(editingModel, nextModel);
      setEditingModel('');
    } else {
      onAddCustomModel(nextModel);
    }
    setCustomModel('');
    setOpen(false);
  }

  function editCustomModel(model: string) {
    setEditingModel(model);
    setCustomModel(model);
  }

  function cancelCustomEdit() {
    setEditingModel('');
    setCustomModel('');
  }

  const menuStyle = menuPlacement
    ? menuPlacement.side === 'top'
      ? {
          bottom: menuPlacement.offset,
          left: menuPlacement.left,
          width: menuPlacement.width,
          maxHeight: menuPlacement.maxHeight,
        }
      : {
          top: menuPlacement.offset,
          left: menuPlacement.left,
          width: menuPlacement.width,
          maxHeight: menuPlacement.maxHeight,
        }
    : undefined;
  const menu =
    open && menuPlacement && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="provider-model-menu theme-select-content"
            data-side={menuPlacement.side}
            ref={menuRef}
            style={menuStyle}
          >
            <label className="provider-model-search">
              <Search size={14} />
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder={t('settings.models.searchModel')}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="provider-model-options" role="listbox" aria-labelledby={labelledBy}>
              {filteredModels.map((model) => {
                const isPreset = presetModels.includes(model);
                const selected = modelName === model;
                const canRemove = normalizedModels.length > 1;
                return (
                  <div
                    className={
                      selected ? 'provider-model-option is-selected' : 'provider-model-option'
                    }
                    key={model}
                    role="option"
                    aria-selected={selected}
                  >
                    <button
                      className="provider-model-option-main"
                      type="button"
                      onClick={() => {
                        onChange(model);
                        setOpen(false);
                      }}
                    >
                      <span className="provider-model-radio">
                        {selected ? <Check size={12} /> : null}
                      </span>
                      <span className="provider-model-option-name">{model}</span>
                      <span className="provider-model-option-tag">
                        {isPreset
                          ? t('settings.models.presetModelTag')
                          : t('settings.models.customModelTag')}
                      </span>
                    </button>
                    {isPreset ? (
                      <button
                        className="provider-model-row-action"
                        disabled={!canRemove}
                        type="button"
                        aria-label={t('settings.models.hidePresetModel', { model })}
                        onClick={() => onHidePresetModel(model)}
                      >
                        <EyeOff size={14} />
                      </button>
                    ) : (
                      <>
                        <button
                          className="provider-model-row-action"
                          type="button"
                          aria-label={t('settings.models.editCustomModel', { model })}
                          onClick={() => editCustomModel(model)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="provider-model-row-action"
                          disabled={!canRemove}
                          type="button"
                          aria-label={t('settings.models.deleteCustomModel', { model })}
                          onClick={() => onDeleteCustomModel(model)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
              {filteredModels.length === 0 ? (
                <span className="provider-model-empty">
                  {query.trim()
                    ? t('settings.models.noMatchedModelWithQuery', { query: query.trim() })
                    : t('settings.models.noModelsYet')}
                </span>
              ) : null}
            </div>
            <div className="provider-model-menu-footer">
              <label className="provider-model-custom-input">
                <Keyboard size={15} />
                <Input
                  aria-label={t('settings.models.customModelName')}
                  autoComplete="off"
                  placeholder={t('settings.models.customModelName')}
                  value={customModel}
                  onChange={(event) => setCustomModel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitCustomModel();
                    if (event.key === 'Escape') cancelCustomEdit();
                  }}
                />
              </label>
              <Button
                className="action-button provider-model-footer-button"
                disabled={!customModel.trim()}
                size="sm"
                type="button"
                variant="secondary"
                onClick={submitCustomModel}
              >
                {editingModel ? <Pencil size={14} /> : <Plus size={14} />}
                {editingModel
                  ? t('settings.models.updateCustomModel')
                  : t('settings.models.useCustomModel')}
              </Button>
              {editingModel ? (
                <Button
                  className="action-button provider-model-footer-button"
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={cancelCustomEdit}
                >
                  {t('settings.models.cancelCustomModelEdit')}
                </Button>
              ) : null}
              <Button
                className="action-button provider-model-footer-button"
                disabled={modelLoading}
                size="sm"
                type="button"
                variant="secondary"
                onClick={onFetchModels}
              >
                <RefreshCw size={14} />
                {modelLoading
                  ? t('settings.models.fetchingModel')
                  : t('settings.models.fetchModel')}
              </Button>
              {hiddenPresetModels.length > 0 ? (
                <div className="provider-model-hidden-presets">
                  <span>{t('settings.models.hiddenPresetModels')}</span>
                  <div>
                    {hiddenPresetModels.map((model) => (
                      <button key={model} type="button" onClick={() => onShowPresetModel(model)}>
                        <Eye size={13} />
                        {model}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="provider-model-picker" ref={rootRef}>
      <button
        id={id}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={labelledBy}
        className={open ? 'provider-model-select-trigger is-open' : 'provider-model-select-trigger'}
        role="combobox"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {modelName ? (
          <span className="provider-model-value">{modelName}</span>
        ) : (
          <span className="provider-model-placeholder">{t('settings.models.chooseModel')}</span>
        )}
        <ChevronDown className="provider-model-trigger-icon" size={16} />
      </button>
      {menu}
    </div>
  );
}

type ProviderModelMenuPlacement = {
  left: number;
  width: number;
  maxHeight: number;
  offset: number;
  side: 'top' | 'bottom';
};

const modelMenuGap = 8;
const modelMenuViewportPadding = 16;
const modelMenuMaxHeight = 430;
const modelMenuMinHeight = 220;

function getProviderModelMenuPlacement(anchor: HTMLElement): ProviderModelMenuPlacement {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportHeightLimit = Math.max(120, viewportHeight - modelMenuViewportPadding * 2);
  const availableBelow = viewportHeight - rect.bottom - modelMenuViewportPadding - modelMenuGap;
  const availableAbove = rect.top - modelMenuViewportPadding - modelMenuGap;
  const side =
    availableBelow < modelMenuMinHeight && availableAbove > availableBelow ? 'top' : 'bottom';
  const availableHeight = side === 'top' ? availableAbove : availableBelow;
  const minHeight = Math.min(modelMenuMinHeight, viewportHeightLimit);
  const maxHeight = Math.min(
    modelMenuMaxHeight,
    viewportHeightLimit,
    Math.max(minHeight, availableHeight),
  );
  const width = Math.min(rect.width, Math.max(0, viewportWidth - modelMenuViewportPadding * 2));
  const maxLeft = Math.max(
    modelMenuViewportPadding,
    viewportWidth - modelMenuViewportPadding - width,
  );
  const left = Math.min(Math.max(modelMenuViewportPadding, rect.left), maxLeft);
  const preferredTop = rect.bottom + modelMenuGap;
  const maxTop = Math.max(
    modelMenuViewportPadding,
    viewportHeight - modelMenuViewportPadding - maxHeight,
  );
  const offset =
    side === 'top'
      ? Math.max(modelMenuViewportPadding, viewportHeight - rect.top + modelMenuGap)
      : Math.min(Math.max(modelMenuViewportPadding, preferredTop), maxTop);

  return { left, width, maxHeight, offset, side };
}

function mergeModelNames(...groups: Array<readonly string[]>) {
  const names: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const modelName = item.trim();
      if (!modelName || names.includes(modelName)) continue;
      names.push(modelName);
    }
  }
  return names;
}

function restorePresetModel(
  visibleModels: readonly string[],
  presetModels: readonly string[],
  modelName: string,
) {
  const customModels = visibleModels.filter((item) => !presetModels.includes(item));
  const visiblePresetModels = presetModels.filter(
    (item) => item === modelName || visibleModels.includes(item),
  );
  return mergeModelNames(visiblePresetModels, customModels);
}
