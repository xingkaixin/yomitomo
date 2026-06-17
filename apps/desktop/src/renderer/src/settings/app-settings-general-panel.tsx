import React, { useEffect, useRef, useState } from 'react';
import {
  Book,
  FileText,
  Globe,
  GripVertical,
  Image as ImageIcon,
  Check,
  ChevronDown,
  MessageCircle,
  MoreHorizontal,
  Languages,
  Volume2,
} from 'lucide-react';
import type {
  AppSettings,
  LibraryContentSourceId,
  LibraryContentSourcePreference,
} from '@yomitomo/shared';
import {
  normalizeSoundEffectsVolume,
  normalizeUiLanguage,
  type UiLanguage,
} from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { AutoSaveStatus } from './app-settings-save-status';
import { SettingsElasticSlider } from './app-settings-elastic-slider';
import type { SaveState } from '../shell/app-types';
import {
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsSegmented,
  SettingsToggle,
} from './app-settings-kit';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import {
  allLibraryContentSourceOptions,
  libraryContentSourcePreferences,
  setLibraryContentSourceEnabled,
} from '../reading-library/app-library-content-sources';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';

const translationLanguageOptions = [
  { value: 'zh-CN', labelKey: 'settings.general.translationLanguageZh' },
  { value: 'en', labelKey: 'settings.general.translationLanguageEn' },
] as const;

const translationStyleOptions = [
  { value: 'dashedLine', labelKey: 'settings.general.translationStyleDashedLine' },
  { value: 'blur', labelKey: 'settings.general.translationStyleBlur' },
  { value: 'blockquote', labelKey: 'settings.general.translationStyleBlockquote' },
  { value: 'weakened', labelKey: 'settings.general.translationStyleWeakened' },
  { value: 'border', labelKey: 'settings.general.translationStyleBorder' },
] as const;

type ContentSourceDragSession = {
  cleanup: () => void;
  grabX: number;
  grabY: number;
  id: LibraryContentSourceId;
  moved: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
};

type ContentSourceDragFrame = {
  left: number;
  top: number;
  width: number;
};

type GeneralSaveSection = 'language' | 'translation' | 'sound' | 'collection' | 'libraryEntrances';

const contentSourceIcons: Record<LibraryContentSourceId, React.ReactNode> = {
  web: <Globe size={18} />,
  ebook: <Book size={18} />,
  pdf: <FileText size={18} />,
  weread: <MessageCircle size={18} />,
};

export function GeneralSettings({
  settingsDraft,
  canSave,
  onSettingsChange,
  onSave,
  saveError,
  saveState,
}: {
  settingsDraft: AppSettings;
  canSave: boolean;
  onSettingsChange: (draft: AppSettings) => void;
  onSave: (draft?: AppSettings) => void;
  saveError?: string;
  saveState: SaveState;
}) {
  const { t } = useTranslation();
  const uiLanguage = normalizeUiLanguage(settingsDraft.uiLanguage);
  const sourcePreferences = libraryContentSourcePreferences(settingsDraft);
  const [dragPreviewPreferences, setDragPreviewPreferences] = useState<
    LibraryContentSourcePreference[] | null
  >(null);
  const dragPreviewRef = useRef<LibraryContentSourcePreference[] | null>(null);
  const displayPreferences = dragPreviewPreferences || sourcePreferences;
  const sourceOptions = allLibraryContentSourceOptions(displayPreferences);
  const enabledSourceCount = sourceOptions.filter((option) => option.enabled).length;
  const savedSoundVolumePercent = Math.round(
    normalizeSoundEffectsVolume(settingsDraft.soundEffectsVolume) * 100,
  );
  const [soundVolumePercent, setSoundVolumePercent] = useState(savedSoundVolumePercent);
  const [translationLanguageOpen, setTranslationLanguageOpen] = useState(false);
  const [translationStyleOpen, setTranslationStyleOpen] = useState(false);
  const [draggedSource, setDraggedSource] = useState<LibraryContentSourceId | null>(null);
  const [dragFrame, setDragFrame] = useState<ContentSourceDragFrame | null>(null);
  const [saveSection, setSaveSection] = useState<GeneralSaveSection | null>(null);
  const sourceMenuRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<ContentSourceDragSession | null>(null);
  const committedSoundVolumePercentRef = useRef(savedSoundVolumePercent);
  const draggedOption = draggedSource
    ? sourceOptions.find((option) => option.value === draggedSource)
    : null;

  useEffect(() => {
    return () => {
      dragSessionRef.current?.cleanup();
    };
  }, []);

  useEffect(() => {
    setSoundVolumePercent(savedSoundVolumePercent);
    committedSoundVolumePercentRef.current = savedSoundVolumePercent;
  }, [savedSoundVolumePercent]);

  function saveContentSources(nextSources: AppSettings['libraryContentSources']) {
    const nextDraft = {
      ...settingsDraft,
      libraryContentSources: nextSources,
    };
    onSettingsChange(nextDraft);
    setSaveSection('libraryEntrances');
    onSave(nextDraft);
  }

  function saveUiLanguage(language: UiLanguage) {
    const nextDraft = {
      ...settingsDraft,
      uiLanguage: language,
    };
    onSettingsChange(nextDraft);
    setSaveSection('language');
    onSave(nextDraft);
  }

  function saveTranslationSettings(
    patch: Partial<
      Pick<
        AppSettings,
        | 'bilingualTranslationTargetLanguage'
        | 'bilingualTranslationStyle'
        | 'bilingualTranslationAiContextAware'
      >
    >,
  ) {
    const nextDraft = {
      ...settingsDraft,
      ...patch,
    };
    onSettingsChange(nextDraft);
    setSaveSection('translation');
    onSave(nextDraft);
  }

  function saveSoundSettings(
    patch: Partial<Pick<AppSettings, 'soundEffectsEnabled' | 'soundEffectsVolume'>>,
  ) {
    const nextDraft = {
      ...settingsDraft,
      ...patch,
    };
    onSettingsChange(nextDraft);
    setSaveSection('sound');
    onSave(nextDraft);
    return nextDraft;
  }

  function toggleSoundEffects(checked: boolean) {
    const nextDraft = saveSoundSettings({ soundEffectsEnabled: checked });
    if (checked) playAppSoundEffect('settings.sound_preview', nextDraft);
  }

  function commitSoundVolume(nextPercent = soundVolumePercent) {
    if (committedSoundVolumePercentRef.current === nextPercent) return;
    committedSoundVolumePercentRef.current = nextPercent;
    const nextVolume = nextPercent / 100;
    const nextDraft = saveSoundSettings({ soundEffectsVolume: nextVolume });
    playAppSoundEffect('settings.sound_preview', nextDraft);
  }

  function retrySave(section: GeneralSaveSection) {
    setSaveSection(section);
    onSave();
  }

  function toggleContentSource(option: (typeof sourceOptions)[number]) {
    if (option.enabled && enabledSourceCount <= 1) return;
    saveContentSources(
      setLibraryContentSourceEnabled(sourcePreferences, option.value, !option.enabled),
    );
  }

  function toggleContentSourceById(id: LibraryContentSourceId) {
    const option = sourceOptions.find((item) => item.value === id);
    if (option) toggleContentSource(option);
  }

  function moveContentSourceByKeyboard(id: LibraryContentSourceId, direction: -1 | 1) {
    const currentIndex = sourcePreferences.findIndex((preference) => preference.id === id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sourcePreferences.length) return;
    const nextSources = [...sourcePreferences];
    const [moved] = nextSources.splice(currentIndex, 1);
    nextSources.splice(targetIndex, 0, moved);
    saveContentSources(nextSources);
  }

  function finishContentSourceDrag(nextSources?: LibraryContentSourcePreference[]) {
    const session = dragSessionRef.current;
    session?.cleanup();
    document.body.style.userSelect = '';
    dragSessionRef.current = null;
    dragPreviewRef.current = null;
    setDraggedSource(null);
    setDragFrame(null);
    setDragPreviewPreferences(null);
    if (nextSources && !sameLibraryContentSourcePreferences(sourcePreferences, nextSources)) {
      saveContentSources(nextSources);
    }
  }

  function startContentSourcePointerDrag(
    event: React.PointerEvent<HTMLElement>,
    id: LibraryContentSourceId,
  ) {
    if (event.button !== 0 || ('isPrimary' in event && !event.isPrimary)) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const handlePointerMove = (moveEvent: PointerEvent) => moveContentSourceDrag(moveEvent);
    const handlePointerUp = (upEvent: PointerEvent) => commitContentSourceDrag(upEvent);
    const handlePointerCancel = (cancelEvent: PointerEvent) => cancelContentSourceDrag(cancelEvent);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    dragSessionRef.current = {
      cleanup: () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
      },
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      id,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
    };
  }

  function moveContentSourceDrag(event: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId'>) {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const movedDistance = Math.hypot(
      event.clientX - session.startX,
      event.clientY - session.startY,
    );
    if (!session.moved && movedDistance < 5) return;
    if (!session.moved) {
      session.moved = true;
      setDraggedSource(session.id);
      dragPreviewRef.current = sourcePreferences;
      setDragPreviewPreferences(sourcePreferences);
      document.body.style.userSelect = 'none';
    }
    setDragFrame({
      left: event.clientX - session.grabX,
      top: event.clientY - session.grabY,
      width: session.width,
    });

    const nextPreview = contentSourcePointerOrder(
      sourceMenuRef.current,
      dragPreviewRef.current || dragPreviewPreferences || sourcePreferences,
      session.id,
      event.clientY,
    );
    if (
      sameLibraryContentSourcePreferences(dragPreviewRef.current || sourcePreferences, nextPreview)
    )
      return;
    dragPreviewRef.current = nextPreview;
    setDragPreviewPreferences(nextPreview);
  }

  function commitContentSourceDrag(event: Pick<PointerEvent, 'pointerId'>) {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const nextSources = dragPreviewRef.current || dragPreviewPreferences || sourcePreferences;
    const shouldToggle = !session.moved;
    finishContentSourceDrag(session.moved ? nextSources : undefined);
    if (shouldToggle) toggleContentSourceById(session.id);
  }

  function cancelContentSourceDrag(event: Pick<PointerEvent, 'pointerId'>) {
    const session = dragSessionRef.current;
    if (session?.pointerId === event.pointerId) finishContentSourceDrag();
  }

  return (
    <SettingsPage
      trail={[t('settings.general.trailRoot'), t('settings.general.trailPage')]}
      description={t('settings.general.description')}
    >
      <SettingsGroup
        label={t('settings.general.languageGroup')}
        aside={
          <AutoSaveStatus
            error={saveError}
            state={saveSection === 'language' ? saveState : 'idle'}
            onRetry={canSave ? () => retrySave('language') : undefined}
          />
        }
      >
        <SettingsRow
          align="start"
          leading={<Globe size={20} />}
          title={t('settings.general.languageTitle')}
          description={t('settings.general.languageDescription')}
        >
          <SettingsSegmented
            ariaLabel={t('settings.general.languageTitle')}
            value={uiLanguage}
            options={[
              { label: t('settings.general.languageZh'), value: 'zh-CN' },
              { label: t('settings.general.languageEn'), value: 'en' },
            ]}
            onChange={saveUiLanguage}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        label={t('settings.general.translationGroup')}
        aside={
          <AutoSaveStatus
            error={saveError}
            state={saveSection === 'translation' ? saveState : 'idle'}
            onRetry={canSave ? () => retrySave('translation') : undefined}
          />
        }
      >
        <SettingsRow
          align="start"
          leading={<Languages size={20} />}
          title={t('settings.general.translationTargetTitle')}
          description={t('settings.general.translationTargetDescription')}
        >
          <Popover open={translationLanguageOpen} onOpenChange={setTranslationLanguageOpen}>
            <PopoverTrigger asChild>
              <button
                aria-expanded={translationLanguageOpen}
                aria-label={t('settings.general.translationTargetTitle')}
                className="settings-combobox-trigger"
                role="combobox"
                type="button"
              >
                <span>
                  {t(
                    translationLanguageOptions.find(
                      (option) =>
                        option.value ===
                        (settingsDraft.bilingualTranslationTargetLanguage || 'zh-CN'),
                    )?.labelKey || 'settings.general.translationLanguageZh',
                  )}
                </span>
                <ChevronDown size={15} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="settings-combobox-popover" sideOffset={8}>
              <div className="settings-combobox-list" role="listbox">
                {translationLanguageOptions.map((option) => {
                  const selected =
                    option.value === (settingsDraft.bilingualTranslationTargetLanguage || 'zh-CN');
                  return (
                    <button
                      aria-selected={selected}
                      className={
                        selected
                          ? 'settings-combobox-option is-selected'
                          : 'settings-combobox-option'
                      }
                      key={option.value}
                      role="option"
                      type="button"
                      onClick={() => {
                        saveTranslationSettings({
                          bilingualTranslationTargetLanguage: option.value,
                        });
                        setTranslationLanguageOpen(false);
                      }}
                    >
                      <span>{t(option.labelKey)}</span>
                      {selected ? <Check size={14} /> : null}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </SettingsRow>
        <SettingsRow
          align="start"
          className="settings-translation-style-row"
          leading={<Languages size={20} />}
          title={t('settings.general.translationStyleTitle')}
          description={t('settings.general.translationStyleDescription')}
        >
          <>
            <div className="settings-translation-style-control">
              <Popover open={translationStyleOpen} onOpenChange={setTranslationStyleOpen}>
                <PopoverTrigger asChild>
                  <button
                    aria-expanded={translationStyleOpen}
                    aria-label={t('settings.general.translationStyleTitle')}
                    className="settings-combobox-trigger"
                    role="combobox"
                    type="button"
                  >
                    <span>
                      {t(
                        translationStyleOptions.find(
                          (option) =>
                            option.value ===
                            (settingsDraft.bilingualTranslationStyle || 'dashedLine'),
                        )?.labelKey || 'settings.general.translationStyleDashedLine',
                      )}
                    </span>
                    <ChevronDown size={15} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="settings-combobox-popover" sideOffset={8}>
                  <div className="settings-combobox-list" role="listbox">
                    {translationStyleOptions.map((option) => {
                      const selected =
                        option.value === (settingsDraft.bilingualTranslationStyle || 'dashedLine');
                      return (
                        <button
                          aria-selected={selected}
                          className={
                            selected
                              ? 'settings-combobox-option is-selected'
                              : 'settings-combobox-option'
                          }
                          key={option.value}
                          role="option"
                          type="button"
                          onClick={() => {
                            saveTranslationSettings({
                              bilingualTranslationStyle: option.value,
                            });
                            setTranslationStyleOpen(false);
                          }}
                        >
                          <span>{t(option.labelKey)}</span>
                          {selected ? <Check size={14} /> : null}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div
              className="settings-translation-style-preview"
              data-style={settingsDraft.bilingualTranslationStyle || 'dashedLine'}
            >
              <p>{t('settings.general.translationStylePreviewSource')}</p>
              <p data-translation-preview="true">
                {t('settings.general.translationStylePreviewTranslation')}
              </p>
            </div>
          </>
        </SettingsRow>
        <SettingsRow
          align="start"
          leading={<Languages size={20} />}
          title={t('settings.general.translationAiContextTitle')}
          description={t('settings.general.translationAiContextDescription')}
        >
          <SettingsToggle
            id="general-translation-ai-context"
            checked={Boolean(settingsDraft.bilingualTranslationAiContextAware)}
            label={t('settings.general.translationAiContextTitle')}
            onChange={(checked) =>
              saveTranslationSettings({ bilingualTranslationAiContextAware: checked })
            }
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        label={t('settings.general.soundGroup')}
        aside={
          <AutoSaveStatus
            error={saveError}
            state={saveSection === 'sound' ? saveState : 'idle'}
            onRetry={canSave ? () => retrySave('sound') : undefined}
          />
        }
      >
        <SettingsRow
          align="start"
          leading={<Volume2 size={20} />}
          title={t('settings.general.soundEffectsTitle')}
          description={t('settings.general.soundEffectsDescription')}
        >
          <SettingsToggle
            id="general-sound-effects"
            checked={settingsDraft.soundEffectsEnabled ?? true}
            label={t('settings.general.soundEffectsTitle')}
            onChange={toggleSoundEffects}
          />
        </SettingsRow>
        <SettingsRow
          align="start"
          leading={<Volume2 size={20} />}
          title={t('settings.general.soundVolumeTitle')}
          description={t('settings.general.soundVolumeDescription')}
        >
          <SettingsElasticSlider
            ariaLabel={t('settings.general.soundVolumeTitle')}
            disabled={settingsDraft.soundEffectsEnabled === false}
            formatValue={(value) => t('settings.general.soundVolumeValue', { value })}
            label={t('settings.general.soundVolumeTitle')}
            max={100}
            min={0}
            step={5}
            value={soundVolumePercent}
            onCommit={commitSoundVolume}
            onValueChange={setSoundVolumePercent}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        label={t('settings.general.collectionGroup')}
        aside={
          <AutoSaveStatus
            error={saveError}
            state={saveSection === 'collection' ? saveState : 'idle'}
            onRetry={canSave ? () => retrySave('collection') : undefined}
          />
        }
      >
        <SettingsRow
          align="start"
          leading={<ImageIcon size={20} />}
          title={t('settings.general.saveImagesTitle')}
          description={t('settings.general.saveImagesDescription')}
        >
          <SettingsToggle
            id="general-save-images"
            checked={Boolean(settingsDraft.saveArticleImages)}
            label={t('settings.general.saveImagesTitle')}
            onChange={(checked) => {
              const nextDraft = { ...settingsDraft, saveArticleImages: checked };
              onSettingsChange(nextDraft);
              setSaveSection('collection');
              onSave(nextDraft);
            }}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        label={t('settings.general.libraryEntrancesGroup')}
        note={t('settings.general.libraryEntrancesNote')}
        aside={
          <AutoSaveStatus
            error={saveError}
            state={saveSection === 'libraryEntrances' ? saveState : 'idle'}
            onRetry={canSave ? () => retrySave('libraryEntrances') : undefined}
          />
        }
        flush
      >
        <div
          className="settings-card settings-source-list"
          ref={sourceMenuRef}
          role="group"
          aria-label={t('settings.general.libraryEntrancesGroup')}
        >
          {sourceOptions.map((option) => {
            const disableBlocked = option.enabled && enabledSourceCount <= 1;
            const sourceLabel = t(`library.sources.${option.value}`);
            return (
              <div
                className={[
                  'settings-source-row',
                  option.enabled ? 'is-enabled' : 'is-disabled',
                  draggedSource === option.value ? 'is-dragging' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-library-source-card={option.value}
                key={option.value}
                role="button"
                tabIndex={0}
                aria-disabled={disableBlocked || undefined}
                aria-keyshortcuts="Enter Space ArrowUp ArrowDown"
                aria-pressed={option.enabled}
                aria-label={t('settings.general.libraryEntranceControl', {
                  label: sourceLabel,
                })}
                onPointerDown={(event) => startContentSourcePointerDrag(event, option.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveContentSourceByKeyboard(option.value, event.key === 'ArrowUp' ? -1 : 1);
                    return;
                  }
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleContentSource(option);
                  }
                }}
              >
                <span className="settings-source-grip" aria-hidden="true">
                  <GripVertical size={16} />
                </span>
                <span className="settings-source-icon" aria-hidden="true">
                  {contentSourceIcons[option.value]}
                </span>
                <span className="settings-source-label">{sourceLabel}</span>
                <span
                  className={
                    option.enabled ? 'settings-source-switch is-on' : 'settings-source-switch'
                  }
                  aria-hidden="true"
                />
              </div>
            );
          })}
          <div className="settings-source-row is-coming-soon">
            <span className="settings-source-icon" aria-hidden="true">
              <MoreHorizontal size={18} />
            </span>
            <span className="settings-source-label">{t('settings.general.moreTypes')}</span>
            <span className="settings-source-soon">{t('settings.general.comingSoon')}</span>
          </div>
        </div>
        {draggedOption && dragFrame ? (
          <div
            aria-hidden="true"
            className={[
              'settings-source-row',
              'is-floating-drag',
              draggedOption.enabled ? 'is-enabled' : 'is-disabled',
            ].join(' ')}
            style={
              {
                left: dragFrame.left,
                top: dragFrame.top,
                width: dragFrame.width,
              } as React.CSSProperties
            }
          >
            <span className="settings-source-grip" aria-hidden="true">
              <GripVertical size={16} />
            </span>
            <span className="settings-source-icon" aria-hidden="true">
              {contentSourceIcons[draggedOption.value]}
            </span>
            <span className="settings-source-label">
              {t(`library.sources.${draggedOption.value}`)}
            </span>
            <span
              className={
                draggedOption.enabled ? 'settings-source-switch is-on' : 'settings-source-switch'
              }
              aria-hidden="true"
            />
          </div>
        ) : null}
      </SettingsGroup>
    </SettingsPage>
  );
}

function contentSourcePointerOrder(
  row: HTMLElement | null,
  preferences: LibraryContentSourcePreference[],
  draggedId: LibraryContentSourceId,
  clientY: number,
) {
  if (!row) return preferences;
  const mids = Array.from(row.querySelectorAll<HTMLElement>('[data-library-source-card]'))
    .filter((element) => element.dataset.librarySourceCard !== draggedId)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
  const targetIndex = mids.filter((mid) => clientY > mid).length;
  const currentIndex = preferences.findIndex((preference) => preference.id === draggedId);
  if (currentIndex < 0 || targetIndex === currentIndex) return preferences;
  const next = [...preferences];
  const [dragged] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}

function sameLibraryContentSourcePreferences(
  left: LibraryContentSourcePreference[],
  right: LibraryContentSourcePreference[],
) {
  if (left.length !== right.length) return false;
  return left.every(
    (item, index) => item.id === right[index]?.id && item.enabled === right[index]?.enabled,
  );
}
