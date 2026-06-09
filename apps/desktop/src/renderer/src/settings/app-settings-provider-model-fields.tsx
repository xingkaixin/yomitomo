import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Keyboard, RefreshCw, Search } from 'lucide-react';
import type { ProviderDraft } from './app-settings';
import { Field } from '../shell/app-ui';
import { Button } from '../components/ui/button';
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
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<ProviderModelMenuPosition | null>(null);
  const selectedModel = models.includes(modelName) ? modelName : '';
  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return models;
    return models.filter((model) => model.toLowerCase().includes(normalizedQuery));
  }, [models, query]);

  useEffect(() => {
    setQuery('');
  }, [models]);

  useEffect(() => {
    optionRefs.current = [];
    setActiveIndex((current) =>
      filteredModels.length === 0 ? 0 : Math.min(current, filteredModels.length - 1),
    );
  }, [filteredModels]);

  useEffect(() => {
    if (!open) return;

    function closeOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    }

    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (models.length > 8) {
      searchRef.current?.focus();
      return;
    }
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, models.length, open]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      setMenuPosition(providerModelMenuPosition(triggerRef.current, models.length > 8));
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [models.length, open]);

  function closePicker() {
    setOpen(false);
    setQuery('');
  }

  function openPicker() {
    setMenuPosition(providerModelMenuPosition(triggerRef.current, models.length > 8));
    setActiveIndex(Math.max(0, models.indexOf(selectedModel)));
    setOpen(true);
  }

  function selectModel(nextModel: string) {
    onChange(nextModel);
    closePicker();
  }

  function focusOption(index: number) {
    setActiveIndex(index);
    optionRefs.current[index]?.focus();
  }

  function moveActiveOption(direction: -1 | 1) {
    if (filteredModels.length === 0) return;
    const nextIndex = (activeIndex + direction + filteredModels.length) % filteredModels.length;
    focusOption(nextIndex);
  }

  function handleOptionsKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveOption(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveOption(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusOption(Math.max(0, filteredModels.length - 1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const model = filteredModels[activeIndex];
      if (model) selectModel(model);
      return;
    }
    if (event.key === 'Escape') {
      closePicker();
      triggerRef.current?.focus();
    }
  }

  return (
    <div className="provider-model-picker" ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={labelledBy}
        className="provider-model-trigger"
        disabled={models.length === 0}
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            closePicker();
            return;
          }
          openPicker();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
          if (event.key === 'Escape') closePicker();
        }}
      >
        <span className={selectedModel ? 'provider-model-value' : 'provider-model-placeholder'}>
          {selectedModel || t('settings.models.chooseModel')}
        </span>
        <ChevronDown size={16} />
      </button>
      {open && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="provider-model-menu theme-select-content"
              ref={menuRef}
              style={{
                left: menuPosition.left,
                top: menuPosition.top,
                width: menuPosition.width,
              }}
            >
              {models.length > 8 ? (
                <div className="provider-model-search">
                  <Search size={15} />
                  <Input
                    aria-label={t('settings.models.searchModel')}
                    autoComplete="off"
                    placeholder={t('settings.models.searchModel')}
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') closePicker();
                      if (event.key === 'ArrowDown' && filteredModels.length > 0) {
                        event.preventDefault();
                        focusOption(activeIndex);
                      }
                    }}
                  />
                </div>
              ) : null}
              <div
                className="provider-model-options"
                id={listboxId}
                role="listbox"
                aria-activedescendant={
                  filteredModels[activeIndex]
                    ? providerModelOptionId(listboxId, activeIndex)
                    : undefined
                }
                style={{ maxHeight: menuPosition.optionsMaxHeight }}
                tabIndex={models.length > 8 ? -1 : 0}
                onKeyDown={handleOptionsKeyDown}
              >
                {filteredModels.map((model, index) => (
                  <div
                    aria-selected={model === selectedModel}
                    className="provider-model-option"
                    id={providerModelOptionId(listboxId, index)}
                    key={model}
                    role="option"
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    tabIndex={index === activeIndex ? 0 : -1}
                    onClick={() => selectModel(model)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {model}
                  </div>
                ))}
              </div>
              {filteredModels.length === 0 ? (
                <p className="provider-model-empty">{t('settings.models.noMatchedModel')}</p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type ProviderModelMenuPosition = CSSProperties & {
  optionsMaxHeight: number;
  width: number;
  left: number;
  top: number;
};

function providerModelMenuPosition(
  trigger: HTMLButtonElement | null,
  hasSearch: boolean,
): ProviderModelMenuPosition {
  const fallback = { left: 24, top: 24, width: 360, optionsMaxHeight: 320 };
  if (!trigger || typeof window === 'undefined') return fallback;

  const rect = trigger.getBoundingClientRect();
  const padding = 24;
  const gap = 8;
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;
  const width = Math.min(
    640,
    Math.max(rect.width, 360),
    Math.max(rect.width, viewportWidth - padding * 2),
  );
  const left = Math.min(
    Math.max(padding, rect.left),
    Math.max(padding, viewportWidth - width - padding),
  );
  const below = viewportHeight - rect.bottom - padding;
  const above = rect.top - padding;
  const placeAbove = below < 220 && above > below;
  const available = Math.max(180, (placeAbove ? above : below) - gap);
  const menuMaxHeight = Math.min(420, available);
  const top = placeAbove
    ? Math.max(padding, rect.top - gap - menuMaxHeight)
    : Math.min(rect.bottom + gap, viewportHeight - padding);
  const searchReserve = hasSearch ? 66 : 18;

  return {
    left,
    optionsMaxHeight: Math.max(120, menuMaxHeight - searchReserve),
    top,
    width,
  };
}

function providerModelOptionId(listboxId: string, index: number) {
  return `${listboxId}-option-${index}`;
}
