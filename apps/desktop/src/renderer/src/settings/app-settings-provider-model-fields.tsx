import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowDown01Icon,
  Delete02Icon,
  KeyboardIcon,
  PencilIcon,
  Refresh01Icon,
  Search01Icon,
  Tick01Icon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';
import { useCallback, useMemo, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const [{ customModel, editingModel, menuPlacement, open, query }, dispatch] = useReducer(
    providerModelPickerReducer,
    initialProviderModelPickerState,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedModels = useMemo(() => mergeModelNames(models), [models]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = useMemo(
    () => normalizedModels.filter((model) => model.toLowerCase().includes(normalizedQuery)),
    [normalizedModels, normalizedQuery],
  );
  const hiddenPresetModels = useMemo(
    () =>
      presetModels.filter(
        (model) =>
          !normalizedModels.includes(model) && model.toLowerCase().includes(normalizedQuery),
      ),
    [normalizedModels, normalizedQuery, presetModels],
  );

  const attachMenu = useCallback((menu: HTMLDivElement) => {
    function updateMenuPlacement() {
      if (!rootRef.current) return;
      dispatch({
        type: 'placementMeasured',
        placement: getProviderModelMenuPlacement(rootRef.current),
      });
    }
    function closeOnOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menu.contains(target)) return;
      dispatch({ type: 'closed' });
    }
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    document.addEventListener('mousedown', closeOnOutsidePointer);
    window.addEventListener('resize', updateMenuPlacement);
    window.addEventListener('scroll', updateMenuPlacement, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', closeOnOutsidePointer);
      window.removeEventListener('resize', updateMenuPlacement);
      window.removeEventListener('scroll', updateMenuPlacement, true);
    };
  }, []);

  function toggleMenu() {
    if (open || !rootRef.current) {
      dispatch({ type: 'closed' });
      return;
    }
    dispatch({ type: 'opened', placement: getProviderModelMenuPlacement(rootRef.current) });
  }

  function submitCustomModel() {
    const nextModel = customModel.trim();
    if (!nextModel) return;
    if (editingModel) onUpdateCustomModel(editingModel, nextModel);
    else onAddCustomModel(nextModel);
    dispatch({ type: 'customModelSubmitted' });
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
            ref={attachMenu}
            style={menuStyle}
          >
            <label className="provider-model-search">
              <HugeiconsIcon icon={Search01Icon} size={14} />
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder={t('settings.models.searchModel')}
                onChange={(event) => dispatch({ type: 'queryChanged', query: event.target.value })}
              />
            </label>
            <div className="provider-model-scroll">
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
                          dispatch({ type: 'closed' });
                        }}
                      >
                        <span className="provider-model-radio">
                          {selected ? <HugeiconsIcon icon={Tick01Icon} size={12} /> : null}
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
                          <HugeiconsIcon icon={ViewOffIcon} size={14} />
                        </button>
                      ) : (
                        <>
                          <button
                            className="provider-model-row-action"
                            type="button"
                            aria-label={t('settings.models.editCustomModel', { model })}
                            onClick={() => dispatch({ type: 'customModelEditStarted', model })}
                          >
                            <HugeiconsIcon icon={PencilIcon} size={14} />
                          </button>
                          <button
                            className="provider-model-row-action"
                            disabled={!canRemove}
                            type="button"
                            aria-label={t('settings.models.deleteCustomModel', { model })}
                            onClick={() => onDeleteCustomModel(model)}
                          >
                            <HugeiconsIcon icon={Delete02Icon} size={14} />
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
              {hiddenPresetModels.length > 0 ? (
                <div className="provider-model-hidden-presets">
                  <span>{t('settings.models.hiddenPresetModels')}</span>
                  <div>
                    {hiddenPresetModels.map((model) => (
                      <button key={model} type="button" onClick={() => onShowPresetModel(model)}>
                        <HugeiconsIcon icon={ViewIcon} size={13} />
                        {model}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="provider-model-menu-footer">
              <label className="provider-model-custom-input">
                <HugeiconsIcon icon={KeyboardIcon} size={15} />
                <Input
                  aria-label={t('settings.models.customModelName')}
                  autoComplete="off"
                  placeholder={t('settings.models.customModelName')}
                  value={customModel}
                  onChange={(event) =>
                    dispatch({ type: 'customModelChanged', customModel: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitCustomModel();
                    if (event.key === 'Escape') dispatch({ type: 'customModelEditCancelled' });
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
                {editingModel ? (
                  <HugeiconsIcon icon={PencilIcon} size={14} />
                ) : (
                  <HugeiconsIcon icon={Add01Icon} size={14} />
                )}
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
                  onClick={() => dispatch({ type: 'customModelEditCancelled' })}
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
                <HugeiconsIcon icon={Refresh01Icon} size={14} />
                {modelLoading
                  ? t('settings.models.fetchingModel')
                  : t('settings.models.fetchModel')}
              </Button>
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
        onClick={toggleMenu}
      >
        {modelName ? (
          <span className="provider-model-value">{modelName}</span>
        ) : (
          <span className="provider-model-placeholder">{t('settings.models.chooseModel')}</span>
        )}
        <HugeiconsIcon icon={ArrowDown01Icon} className="provider-model-trigger-icon" size={16} />
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

type ProviderModelPickerState = {
  customModel: string;
  editingModel: string;
  menuPlacement: ProviderModelMenuPlacement | null;
  open: boolean;
  query: string;
};

type ProviderModelPickerEvent =
  | { type: 'closed' }
  | { type: 'customModelChanged'; customModel: string }
  | { type: 'customModelEditCancelled' }
  | { type: 'customModelEditStarted'; model: string }
  | { type: 'customModelSubmitted' }
  | { type: 'opened'; placement: ProviderModelMenuPlacement }
  | { type: 'placementMeasured'; placement: ProviderModelMenuPlacement }
  | { type: 'queryChanged'; query: string };

const initialProviderModelPickerState: ProviderModelPickerState = {
  customModel: '',
  editingModel: '',
  menuPlacement: null,
  open: false,
  query: '',
};

function providerModelPickerReducer(
  state: ProviderModelPickerState,
  event: ProviderModelPickerEvent,
): ProviderModelPickerState {
  switch (event.type) {
    case 'closed':
      return { ...state, menuPlacement: null, open: false };
    case 'customModelChanged':
      return { ...state, customModel: event.customModel };
    case 'customModelEditCancelled':
      return { ...state, customModel: '', editingModel: '' };
    case 'customModelEditStarted':
      return { ...state, customModel: event.model, editingModel: event.model };
    case 'customModelSubmitted':
      return { ...state, customModel: '', editingModel: '', menuPlacement: null, open: false };
    case 'opened':
      return { ...state, menuPlacement: event.placement, open: true, query: '' };
    case 'placementMeasured':
      return { ...state, menuPlacement: event.placement };
    case 'queryChanged':
      return { ...state, query: event.query };
  }
}

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
