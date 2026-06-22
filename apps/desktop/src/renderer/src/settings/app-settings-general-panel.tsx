import React, { useEffect, useRef, useState } from 'react';
import {
  Globe,
  Image as ImageIcon,
  Check,
  ChevronDown,
  Languages,
  LockKeyhole,
  RadioTower,
  ShieldAlert,
  Volume2,
} from 'lucide-react';
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
import type { SaveState } from '../shell/app-types';
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
type AppLockDialogMode = 'enable' | 'disable';
type AppLockSetupStep = 'pin' | 'confirm';

type GeneralSettingsLegacyProps = {
  settingsDraft: AppSettings;
  canSave: boolean;
  onSettingsChange: (draft: AppSettings) => void;
  onSave: (draft?: AppSettings) => void;
  saveError?: string;
  saveState: SaveState;
};

type GeneralSettingsProps = { draft: SaveableDraft<AppSettings> } | GeneralSettingsLegacyProps;

export function GeneralSettings(props: GeneralSettingsProps) {
  const { settingsDraft, canSave, onSettingsChange, onSave, saveError, saveState } =
    resolveGeneralSettingsProps(props);
  const { t } = useTranslation();
  const uiLanguage = normalizeUiLanguage(settingsDraft.uiLanguage);
  const savedSoundVolumePercent = Math.round(
    normalizeSoundEffectsVolume(settingsDraft.soundEffectsVolume) * 100,
  );
  const [soundVolumePercent, setSoundVolumePercent] = useState(savedSoundVolumePercent);
  const [translationLanguageOpen, setTranslationLanguageOpen] = useState(false);
  const [translationStyleOpen, setTranslationStyleOpen] = useState(false);
  const [saveSection, setSaveSection] = useState<GeneralSaveSection | null>(null);
  const [appLockDialogMode, setAppLockDialogMode] = useState<AppLockDialogMode | null>(null);
  const [appLockSetupStep, setAppLockSetupStep] = useState<AppLockSetupStep>('pin');
  const [appLockPin, setAppLockPin] = useState('');
  const [appLockConfirmPin, setAppLockConfirmPin] = useState('');
  const [appLockDisablePin, setAppLockDisablePin] = useState('');
  const [appLockSaveState, setAppLockSaveState] = useState<SaveState>('idle');
  const [appLockError, setAppLockError] = useState('');
  const [localNetworkConfirmOpen, setLocalNetworkConfirmOpen] = useState(false);
  const committedSoundVolumePercentRef = useRef(savedSoundVolumePercent);

  useEffect(() => {
    setSoundVolumePercent(savedSoundVolumePercent);
    committedSoundVolumePercentRef.current = savedSoundVolumePercent;
  }, [savedSoundVolumePercent]);

  function closeAppLockDialog() {
    setAppLockDialogMode(null);
    setAppLockSetupStep('pin');
    setAppLockPin('');
    setAppLockConfirmPin('');
    setAppLockDisablePin('');
    setAppLockError('');
    if (appLockSaveState !== 'saving') setAppLockSaveState('idle');
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

  async function submitAppLockSetup(completedValue?: string) {
    const pin =
      appLockSetupStep === 'pin' ? (completedValue ?? appLockPin).trim() : appLockPin.trim();
    const confirmPin =
      appLockSetupStep === 'confirm'
        ? (completedValue ?? appLockConfirmPin).trim()
        : appLockConfirmPin.trim();
    if (appLockSetupStep === 'pin') {
      if (!validPin(pin)) {
        setAppLockError(t('settings.general.appLockPinRequired'));
        setAppLockSaveState('error');
        return;
      }
      setAppLockPin(pin);
      setAppLockConfirmPin('');
      setAppLockError('');
      setAppLockSaveState('idle');
      setAppLockSetupStep('confirm');
      return;
    }
    if (!validPin(pin) || pin !== confirmPin) {
      setAppLockError(t('settings.general.appLockPinMismatch'));
      setAppLockConfirmPin('');
      setAppLockSaveState('error');
      return;
    }
    setSaveSection('appLock');
    setAppLockSaveState('saving');
    setAppLockError('');
    try {
      await window.yomitomoDesktop.setAppLockPin({ pin, confirmPin });
      const nextStore = await window.yomitomoDesktop.setAppLockEnabled({ enabled: true });
      setAppLockPin('');
      setAppLockConfirmPin('');
      setAppLockSetupStep('pin');
      setAppLockDialogMode(null);
      onSettingsChange(nextStore.settings);
      setAppLockSaveState('saved');
      window.setTimeout(() => setAppLockSaveState('idle'), 1200);
    } catch (error) {
      setAppLockError(appLockErrorMessage(error, t('settings.general.appLockSaveError')));
      setAppLockSaveState('error');
    }
  }

  function saveAppLockPin(event: React.FormEvent) {
    event.preventDefault();
    void submitAppLockSetup();
  }

  async function toggleAppLock(checked: boolean) {
    setAppLockError('');
    if (checked) {
      setAppLockSetupStep('pin');
      setAppLockDialogMode('enable');
      return;
    }
    setAppLockDialogMode('disable');
  }

  async function disableAppLock(event: React.FormEvent) {
    event.preventDefault();
    const pin = appLockDisablePin.trim();
    if (!validPin(pin)) {
      setAppLockError(t('settings.general.appLockDisablePinRequired'));
      setAppLockSaveState('error');
      return;
    }
    setSaveSection('appLock');
    setAppLockSaveState('saving');
    setAppLockError('');
    try {
      const nextStore = await window.yomitomoDesktop.setAppLockEnabled({
        enabled: false,
        pin,
      });
      setAppLockDisablePin('');
      setAppLockDialogMode(null);
      onSettingsChange(nextStore.settings);
      setAppLockSaveState('saved');
      window.setTimeout(() => setAppLockSaveState('idle'), 1200);
    } catch (error) {
      setAppLockError(appLockErrorMessage(error, t('settings.general.appLockSaveError')));
      setAppLockSaveState('error');
    }
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
        label={t('settings.general.appLockGroup')}
        aside={
          <AutoSaveStatus
            error={appLockError || saveError}
            state={saveSection === 'appLock' ? appLockSaveState : 'idle'}
            onRetry={undefined}
          />
        }
      >
        <SettingsRow
          align="start"
          leading={<LockKeyhole size={20} />}
          title={t('settings.general.appLockEnabledTitle')}
          description={t('settings.general.appLockEnabledDescription')}
        >
          <SettingsToggle
            id="general-app-lock-enabled"
            checked={Boolean(settingsDraft.appLockEnabled)}
            disabled={appLockSaveState === 'saving'}
            label={t('settings.general.appLockEnabledTitle')}
            onChange={toggleAppLock}
          />
        </SettingsRow>
        <SettingsRow
          align="start"
          leading={<LockKeyhole size={20} />}
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
          align="start"
          leading={<LockKeyhole size={20} />}
          title={t('settings.general.appLockStartupTitle')}
          description={t('settings.general.appLockStartupDescription')}
        >
          <SettingsToggle
            id="general-app-lock-startup"
            checked={Boolean(settingsDraft.appLockLockOnStartup)}
            disabled={!settingsDraft.appLockEnabled || appLockSaveState === 'saving'}
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
            onChange={(checked) => saveCollectionSettings({ saveArticleImages: checked })}
          />
        </SettingsRow>
        <SettingsRow
          align="start"
          leading={<ShieldAlert size={20} />}
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
            onRetry={canSave ? () => retrySave('telemetry') : undefined}
          />
        }
      >
        <SettingsRow
          align="start"
          leading={<RadioTower size={20} />}
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

      <AppLockSettingsDialog
        confirmPin={appLockConfirmPin}
        disablePin={appLockDisablePin}
        error={appLockError}
        mode={appLockDialogMode}
        pin={appLockPin}
        saving={appLockSaveState === 'saving'}
        setupStep={appLockSetupStep}
        onClose={closeAppLockDialog}
        onConfirmPinChange={(value) => setAppLockConfirmPin(digitsOnly(value))}
        onDisablePinChange={(value) => setAppLockDisablePin(digitsOnly(value))}
        onDisableSubmit={disableAppLock}
        onPinChange={(value) => setAppLockPin(digitsOnly(value))}
        onSetupComplete={(value) => void submitAppLockSetup(value)}
        onSetupSubmit={saveAppLockPin}
      />
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

function resolveGeneralSettingsProps(props: GeneralSettingsProps): GeneralSettingsLegacyProps {
  if ('draft' in props) {
    return {
      settingsDraft: props.draft.value,
      canSave: props.draft.canSave,
      onSettingsChange: props.draft.update,
      onSave: (draft) => {
        void props.draft.save(draft);
      },
      saveError: props.draft.saveError,
      saveState: props.draft.saveState,
    };
  }
  return props;
}

function AppLockSettingsDialog({
  confirmPin,
  disablePin,
  error,
  mode,
  pin,
  saving,
  setupStep,
  onClose,
  onConfirmPinChange,
  onDisablePinChange,
  onDisableSubmit,
  onPinChange,
  onSetupComplete,
  onSetupSubmit,
}: {
  confirmPin: string;
  disablePin: string;
  error: string;
  mode: AppLockDialogMode | null;
  pin: string;
  saving: boolean;
  setupStep: AppLockSetupStep;
  onClose: () => void;
  onConfirmPinChange: (value: string) => void;
  onDisablePinChange: (value: string) => void;
  onDisableSubmit: (event: React.FormEvent) => void;
  onPinChange: (value: string) => void;
  onSetupComplete: (value: string) => void;
  onSetupSubmit: (event: React.FormEvent) => void;
}) {
  const { t } = useTranslation();
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
  const formValid = setupMode
    ? validPin(setupConfirmStep ? confirmPin : pin)
    : validPin(disablePin);

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogPortal>
        <DialogOverlay className="app-lock-settings-dialog-overlay">
          <DialogContent className="app-lock-settings-dialog">
            <form onSubmit={setupMode ? onSetupSubmit : onDisableSubmit}>
              <header>
                <span className="app-lock-settings-dialog-icon" aria-hidden="true">
                  <LockKeyhole size={20} />
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
                    onChange={setupConfirmStep ? onConfirmPinChange : onPinChange}
                    onComplete={onSetupComplete}
                  />
                ) : (
                  <PinOtpInput
                    ariaLabel={t('settings.general.appLockDisablePinPlaceholder')}
                    autoFocus
                    disabled={saving}
                    value={disablePin}
                    onChange={onDisablePinChange}
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
                  onClick={onClose}
                >
                  {t('settings.general.appLockDialogCancel')}
                </button>
                <button
                  className="settings-action-button"
                  disabled={!formValid || saving}
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
      onChange={(nextValue) => onChange(digitsOnly(nextValue))}
      onComplete={(nextValue) => {
        const pin = digitsOnly(String(nextValue));
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

function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function validPin(value: string) {
  return /^\d{4}$/.test(value);
}

function appLockErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    const rawMessage = (error as { message?: unknown }).message;
    const message = typeof rawMessage === 'string' ? rawMessage : '';
    if (message === 'APP_LOCK_PIN_INVALID') return fallback;
    if (message === 'APP_LOCK_PIN_REQUIRED') return fallback;
    if (message === 'APP_LOCK_PIN_MISMATCH') return fallback;
    if (message) return message;
  }
  return fallback;
}
