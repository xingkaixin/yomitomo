import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  GlobeIcon,
  Image01Icon,
  InternetAntenna01Icon,
  LanguageCircleIcon,
  LockKeyIcon,
  SecurityWarningIcon,
  Tick01Icon,
  VolumeHighIcon,
} from '@hugeicons/core-free-icons';
import React, { useEffect, useRef, useState } from 'react';
import type { AppSettings } from '@yomitomo/shared';
import {
  normalizeSoundEffectsVolume,
  normalizeUiLanguage,
  type UiLanguage,
} from '@yomitomo/shared';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { useTranslation } from 'react-i18next';
import { AutoSaveStatus } from './app-settings-save-status';
import { SettingsConfirmDialog } from './app-settings-confirm-dialog';
import { SettingsElasticSlider } from './app-settings-elastic-slider';
import {
  SettingsGroup,
  SettingsInfoIndicator,
  SettingsPage,
  SettingsRow,
  SettingsSegmented,
  SettingsToggle,
} from './app-settings-kit';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Kbd } from '../components/ui/kbd';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import type { SaveableDraft } from './use-saveable-draft';
import { useAppLockSettingsWorkflow } from './use-app-lock-settings-workflow';

const appLockShortcutKeys = [getShortcutModifier(), 'L'];

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

type GeneralSaveSection =
  | 'language'
  | 'translation'
  | 'sound'
  | 'appLock'
  | 'collection'
  | 'telemetry';
export function GeneralSettings({ draft }: { draft: SaveableDraft<AppSettings> }) {
  const { value: settingsDraft, update: onSettingsChange, saveError, saveState } = draft;
  const onSave = (override?: AppSettings) => {
    void draft.save(override);
  };
  const { t } = useTranslation();
  const uiLanguage = normalizeUiLanguage(settingsDraft.uiLanguage);
  const savedSoundVolumePercent = Math.round(
    normalizeSoundEffectsVolume(settingsDraft.soundEffectsVolume) * 100,
  );
  const [soundVolumePercent, setSoundVolumePercent] = useState(savedSoundVolumePercent);
  const [translationLanguageOpen, setTranslationLanguageOpen] = useState(false);
  const [translationStyleOpen, setTranslationStyleOpen] = useState(false);
  const [saveSection, setSaveSection] = useState<GeneralSaveSection | null>(null);
  const [localNetworkConfirmOpen, setLocalNetworkConfirmOpen] = useState(false);
  const committedSoundVolumePercentRef = useRef(savedSoundVolumePercent);
  const appLockWorkflow = useAppLockSettingsWorkflow({
    messages: {
      confirmPinMismatch: t('settings.general.appLockPinMismatch'),
      disablePinRequired: t('settings.general.appLockDisablePinRequired'),
      pinRequired: t('settings.general.appLockPinRequired'),
      retryAfter: (seconds) => t('settings.general.appLockRetryAfter', { seconds }),
      saveFailed: t('settings.general.appLockSaveError'),
    },
    onSettingsChange,
  });

  useEffect(() => {
    setSoundVolumePercent(savedSoundVolumePercent);
    committedSoundVolumePercentRef.current = savedSoundVolumePercent;
  }, [savedSoundVolumePercent]);

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

  function saveCollectionSettings(
    patch: Partial<Pick<AppSettings, 'saveArticleImages' | 'allowLocalNetworkArticleImport'>>,
  ) {
    const nextDraft = {
      ...settingsDraft,
      ...patch,
    };
    onSettingsChange(nextDraft);
    setSaveSection('collection');
    onSave(nextDraft);
  }

  function saveTelemetrySettings(patch: Pick<AppSettings, 'telemetryEnabled'>) {
    const nextDraft = {
      ...settingsDraft,
      ...patch,
    };
    onSettingsChange(nextDraft);
    setSaveSection('telemetry');
    onSave(nextDraft);
  }

  function toggleLocalNetworkArticleImport(checked: boolean) {
    if (checked) {
      setLocalNetworkConfirmOpen(true);
      return;
    }
    saveCollectionSettings({ allowLocalNetworkArticleImport: false });
  }

  function confirmLocalNetworkArticleImport() {
    setLocalNetworkConfirmOpen(false);
    saveCollectionSettings({ allowLocalNetworkArticleImport: true });
  }

  function toggleAppLockOnStartup(checked: boolean) {
    const nextDraft = {
      ...settingsDraft,
      appLockLockOnStartup: checked,
    };
    onSettingsChange(nextDraft);
    setSaveSection('appLock');
    onSave(nextDraft);
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
            onRetry={() => retrySave('language')}
          />
        }
      >
        <SettingsRow
          leading={<HugeiconsIcon icon={GlobeIcon} size={20} />}
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
            onRetry={() => retrySave('translation')}
          />
        }
      >
        <SettingsRow
          leading={<HugeiconsIcon icon={LanguageCircleIcon} size={20} />}
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
                <HugeiconsIcon icon={ArrowDown01Icon} size={15} />
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
                      {selected ? <HugeiconsIcon icon={Tick01Icon} size={14} /> : null}
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
          leading={<HugeiconsIcon icon={LanguageCircleIcon} size={20} />}
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
                    <HugeiconsIcon icon={ArrowDown01Icon} size={15} />
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
                          {selected ? <HugeiconsIcon icon={Tick01Icon} size={14} /> : null}
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
          leading={<HugeiconsIcon icon={LanguageCircleIcon} size={20} />}
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
            onRetry={() => retrySave('sound')}
          />
        }
      >
        <SettingsRow
          leading={<HugeiconsIcon icon={VolumeHighIcon} size={20} />}
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
          leading={<HugeiconsIcon icon={VolumeHighIcon} size={20} />}
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
        label={t('settings.general.appLockGroup')}
        aside={
          <AutoSaveStatus
            error={appLockWorkflow.error || saveError}
            state={
              appLockWorkflow.saveState === 'idle'
                ? saveSection === 'appLock'
                  ? saveState
                  : 'idle'
                : appLockWorkflow.saveState
            }
            onRetry={undefined}
          />
        }
      >
        <SettingsRow
          leading={<HugeiconsIcon icon={LockKeyIcon} size={20} />}
          title={t('settings.general.appLockEnabledTitle')}
          description={t('settings.general.appLockEnabledDescription')}
        >
          <SettingsToggle
            id="general-app-lock-enabled"
            checked={Boolean(settingsDraft.appLockEnabled)}
            disabled={appLockWorkflow.saveState === 'saving'}
            label={t('settings.general.appLockEnabledTitle')}
            onChange={appLockWorkflow.open}
          />
        </SettingsRow>
        <SettingsRow
          leading={<HugeiconsIcon icon={LockKeyIcon} size={20} />}
          title={t('settings.general.appLockShortcutTitle')}
          description={t('settings.general.appLockShortcutDescription')}
        >
          <span
            className="settings-keyset"
            aria-label={t('settings.general.appLockShortcutValue', {
              shortcut: appLockShortcutKeys.join('+'),
            })}
          >
            {appLockShortcutKeys.map((key, index) => (
              <React.Fragment key={key}>
                {index > 0 ? <span className="settings-key-plus">+</span> : null}
                <Kbd className="settings-keycap is-readonly">{key}</Kbd>
              </React.Fragment>
            ))}
          </span>
        </SettingsRow>
        <SettingsRow
          leading={<HugeiconsIcon icon={LockKeyIcon} size={20} />}
          title={t('settings.general.appLockStartupTitle')}
          description={t('settings.general.appLockStartupDescription')}
        >
          <SettingsToggle
            id="general-app-lock-startup"
            checked={Boolean(settingsDraft.appLockLockOnStartup)}
            disabled={!settingsDraft.appLockEnabled || appLockWorkflow.saveState === 'saving'}
            label={t('settings.general.appLockStartupTitle')}
            onChange={toggleAppLockOnStartup}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        label={t('settings.general.collectionGroup')}
        aside={
          <AutoSaveStatus
            error={saveError}
            state={saveSection === 'collection' ? saveState : 'idle'}
            onRetry={() => retrySave('collection')}
          />
        }
      >
        <SettingsRow
          leading={<HugeiconsIcon icon={Image01Icon} size={20} />}
          title={t('settings.general.saveImagesTitle')}
          description={t('settings.general.saveImagesDescription')}
        >
          <SettingsToggle
            id="general-save-images"
            checked={Boolean(settingsDraft.saveArticleImages)}
            label={t('settings.general.saveImagesTitle')}
            onChange={(checked) => saveCollectionSettings({ saveArticleImages: checked })}
          />
        </SettingsRow>
        <SettingsRow
          leading={<HugeiconsIcon icon={SecurityWarningIcon} size={20} />}
          title={t('settings.general.localNetworkImportTitle')}
          description={t('settings.general.localNetworkImportDescription')}
        >
          <SettingsToggle
            id="general-local-network-import"
            checked={Boolean(settingsDraft.allowLocalNetworkArticleImport)}
            label={t('settings.general.localNetworkImportTitle')}
            onChange={toggleLocalNetworkArticleImport}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        label={t('settings.general.privacyGroup')}
        aside={
          <AutoSaveStatus
            error={saveError}
            state={saveSection === 'telemetry' ? saveState : 'idle'}
            onRetry={() => retrySave('telemetry')}
          />
        }
      >
        <SettingsRow
          leading={<HugeiconsIcon icon={InternetAntenna01Icon} size={20} />}
          title={t('settings.general.telemetryTitle')}
          description={t('settings.general.telemetryDescription')}
        >
          <SettingsToggle
            id="general-telemetry-enabled"
            checked={settingsDraft.telemetryEnabled ?? true}
            label={t('settings.general.telemetryTitle')}
            onChange={(checked) => saveTelemetrySettings({ telemetryEnabled: checked })}
          />
        </SettingsRow>
      </SettingsGroup>

      <AppLockSettingsDialog workflow={appLockWorkflow} />
      <SettingsConfirmDialog
        cancelLabel={t('settings.confirm.cancel')}
        confirmLabel={t('settings.general.localNetworkImportConfirm')}
        description={t('settings.general.localNetworkImportConfirmDescription')}
        open={localNetworkConfirmOpen}
        title={t('settings.general.localNetworkImportConfirmTitle')}
        onCancel={() => setLocalNetworkConfirmOpen(false)}
        onConfirm={confirmLocalNetworkArticleImport}
      />
    </SettingsPage>
  );
}

function AppLockSettingsDialog({
  workflow,
}: {
  workflow: ReturnType<typeof useAppLockSettingsWorkflow>;
}) {
  const { t } = useTranslation();
  const { canSubmit, confirmPin, disablePin, error, mode, pin, saving, setupStep } =
    workflow.dialog;
  if (!mode) return null;

  const setupMode = mode === 'enable';
  const setupConfirmStep = setupStep === 'confirm';
  const titleKey = setupMode
    ? setupConfirmStep
      ? 'settings.general.appLockConfirmDialogTitle'
      : 'settings.general.appLockEnableDialogTitle'
    : 'settings.general.appLockDisableDialogTitle';
  const descriptionKey = setupMode
    ? setupConfirmStep
      ? 'settings.general.appLockConfirmDialogDescription'
      : 'settings.general.appLockEnableDialogDescription'
    : 'settings.general.appLockDisableDialogDescription';

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && workflow.close()}>
      <DialogPortal>
        <DialogOverlay className="app-lock-settings-dialog-overlay">
          <DialogContent className="app-lock-settings-dialog">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void workflow.submit();
              }}
            >
              <header>
                <span className="app-lock-settings-dialog-icon" aria-hidden="true">
                  <HugeiconsIcon icon={LockKeyIcon} size={20} />
                </span>
                <div>
                  <DialogTitle id="app-lock-settings-dialog-title">
                    <span className="app-lock-settings-dialog-title-copy">
                      <span>{t(titleKey)}</span>
                      <SettingsInfoIndicator description={t(descriptionKey)} interactive />
                    </span>
                  </DialogTitle>
                </div>
              </header>
              <div className="app-lock-settings-dialog-fields">
                {setupMode ? (
                  <PinOtpInput
                    key={setupStep}
                    ariaLabel={t(
                      setupConfirmStep
                        ? 'settings.general.appLockConfirmPinPlaceholder'
                        : 'settings.general.appLockPinPlaceholder',
                    )}
                    autoFocus
                    disabled={saving}
                    value={setupConfirmStep ? confirmPin : pin}
                    onChange={workflow.updatePin}
                    onComplete={(value) => void workflow.submit(value)}
                  />
                ) : (
                  <PinOtpInput
                    ariaLabel={t('settings.general.appLockDisablePinPlaceholder')}
                    autoFocus
                    disabled={saving}
                    value={disablePin}
                    onChange={workflow.updatePin}
                  />
                )}
              </div>
              {error ? (
                <p className="app-lock-settings-dialog-error" role="alert">
                  {error}
                </p>
              ) : null}
              <footer>
                <button
                  className="settings-action-button is-secondary"
                  disabled={saving}
                  type="button"
                  onClick={workflow.close}
                >
                  {t('settings.general.appLockDialogCancel')}
                </button>
                <button
                  className="settings-action-button"
                  disabled={!canSubmit || saving}
                  type="submit"
                >
                  {t(
                    setupMode
                      ? setupConfirmStep
                        ? 'settings.general.appLockEnableDialogConfirm'
                        : 'settings.general.appLockEnableDialogNext'
                      : 'settings.general.appLockDisableDialogConfirm',
                  )}
                </button>
              </footer>
            </form>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function PinOtpInput({
  ariaLabel,
  autoFocus = false,
  disabled = false,
  value,
  onChange,
  onComplete,
}: {
  ariaLabel: string;
  autoFocus?: boolean;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
}) {
  return (
    <InputOTP
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      disabled={disabled}
      maxLength={4}
      value={value}
      onChange={onChange}
      onComplete={(nextValue) => {
        const pin = String(nextValue);
        onChange(pin);
        window.setTimeout(() => onComplete?.(pin), 0);
      }}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
      </InputOTPGroup>
    </InputOTP>
  );
}
