import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  Languages,
  Save,
  Search,
  ShieldCheck,
  Zap,
  X,
} from 'lucide-react';
import {
  providerPresets,
  type AppSettings,
  type AssistantExecutionMode,
  type LlmProvider,
  type ProviderPreset,
} from '@yomitomo/shared';
import type { ProviderDraft, ProviderTestState } from './app-settings';
import { providerLogoMap } from './app-settings-provider-assets';
import { providerDraftFromPreset, ProviderForm } from './app-settings-provider-form';
import { ProviderList } from './app-settings-provider-list';
import type { SaveState } from '../shell/app-types';
import { AutoSaveStatus } from './app-settings-save-status';
import { SettingsGroup, SettingsPage, SettingsRow, SettingsSegmented } from './app-settings-kit';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useTranslation } from 'react-i18next';
import { providerDisplayName, providerPresetDisplayName } from '../i18n/app-i18n-labels';
import type { SaveableDraft } from './use-saveable-draft';

type ProviderDraftController = SaveableDraft<ProviderDraft, boolean> & {
  create: () => void;
  deleteProvider: (id: string) => Promise<void> | void;
  select: (provider: LlmProvider) => void;
  selectedProviderId: string | null;
  test: (draft: ProviderDraft) => Promise<void> | void;
  testState: ProviderTestState;
};

type ProviderSettingsProps = {
  providerDraft: ProviderDraftController;
  routesDraft: SaveableDraft<AppSettings>;
  providers: LlmProvider[];
};

export function ProviderSettings({ providerDraft, routesDraft, providers }: ProviderSettingsProps) {
  const draft = providerDraft.value;
  const settingsDraft = routesDraft.value;
  const testState = providerDraft.testState;
  const canSave = providerDraft.canSave;
  const canSaveRoutes = routesDraft.canSave;
  const saveState = providerDraft.saveState;
  const saveError = providerDraft.saveError;
  const routeSaveState = routesDraft.saveState;
  const routeSaveError = routesDraft.saveError;
  const { t } = useTranslation();
  const saveLabel =
    saveState === 'saving'
      ? t('settings.models.saving')
      : saveState === 'saved'
        ? t('settings.models.saved')
        : t('settings.models.save');
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [providerEditorMode, setProviderEditorMode] = useState<'create' | 'edit'>('create');
  const [providerEditorStep, setProviderEditorStep] = useState<1 | 2>(1);
  const [providerPresetPicked, setProviderPresetPicked] = useState(false);
  const testStatus = testState.status;
  const usedProviderIds = new Set(
    [
      settingsDraft.readingAssistantProviderId,
      settingsDraft.reviewAssistantProviderId,
      settingsDraft.bilingualTranslationProviderId,
    ].filter((id): id is string => Boolean(id)),
  );

  function selectProvider(provider: LlmProvider) {
    providerDraft.select(provider);
    setProviderEditorMode('edit');
    setProviderEditorStep(2);
    setProviderPresetPicked(true);
    setProviderEditorOpen(true);
  }

  function createProvider() {
    providerDraft.create();
    setProviderEditorMode('create');
    setProviderEditorStep(1);
    setProviderPresetPicked(false);
    setProviderEditorOpen(true);
  }

  function deleteProvider(id: string) {
    void providerDraft.deleteProvider(id);
    setProviderEditorOpen(false);
  }

  function testProvider(nextDraft: ProviderDraft) {
    void Promise.resolve(providerDraft.test(nextDraft)).catch(() => undefined);
  }

  function closeProviderEditor() {
    setProviderEditorOpen(false);
  }

  async function saveProviderAndClose() {
    try {
      const saved = Boolean(await providerDraft.save());
      if (saved) setProviderEditorOpen(false);
    } catch {
      setProviderEditorOpen(true);
    }
  }

  function saveRoutes(nextDraft?: AppSettings) {
    void routesDraft.save(nextDraft);
  }

  const editorDialog =
    providerEditorOpen && typeof document !== 'undefined' ? (
      <Dialog open={providerEditorOpen} onOpenChange={setProviderEditorOpen}>
        <DialogPortal>
          <DialogOverlay className="provider-editor-dialog-overlay">
            <DialogContent
              aria-labelledby="provider-editor-dialog-title"
              className="provider-editor-dialog"
            >
              <ProviderEditorContent
                draft={draft}
                saveLabel={saveLabel}
                saveError={saveError}
                saveState={saveState}
                testStatus={testStatus}
                titleId="provider-editor-dialog-title"
                canSave={canSave}
                editorMode={providerEditorMode}
                editorStep={providerEditorStep}
                providerPresetPicked={providerPresetPicked}
                onChange={providerDraft.update}
                onCancel={closeProviderEditor}
                onPickPreset={(preset) => {
                  providerDraft.update(providerDraftFromPreset(draft, preset));
                  setProviderPresetPicked(true);
                  setProviderEditorStep(2);
                }}
                onSave={saveProviderAndClose}
                onStepChange={setProviderEditorStep}
                onTest={testProvider}
              />
            </DialogContent>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    ) : null;

  return (
    <>
      <SettingsPage
        trail={[t('settings.models.trailRoot'), t('settings.models.trailPage')]}
        description={t('settings.models.description')}
      >
        <TaskProviderRoutes
          canSave={canSaveRoutes}
          providers={providers}
          saveError={routeSaveError}
          saveState={routeSaveState}
          settingsDraft={settingsDraft}
          onChange={routesDraft.update}
          onSave={saveRoutes}
        />
        <SettingsGroup label={t('settings.models.providerGroup')} flush>
          <ProviderList
            providers={providers}
            usedProviderIds={usedProviderIds}
            onCreate={createProvider}
            onDelete={deleteProvider}
            onEdit={selectProvider}
          />
        </SettingsGroup>
      </SettingsPage>
      {editorDialog}
    </>
  );
}

function ProviderEditorContent({
  draft,
  saveLabel,
  saveError,
  saveState,
  testStatus,
  titleId,
  canSave,
  editorMode,
  editorStep,
  providerPresetPicked,
  onChange,
  onCancel,
  onPickPreset,
  onSave,
  onStepChange,
  onTest,
}: {
  draft: ProviderDraft;
  saveLabel: string;
  saveError?: string;
  saveState: SaveState;
  testStatus: ProviderTestState['status'];
  titleId?: string;
  canSave: boolean;
  editorMode: 'create' | 'edit';
  editorStep: 1 | 2;
  providerPresetPicked: boolean;
  onChange: (draft: ProviderDraft) => void;
  onCancel: () => void;
  onPickPreset: (preset: ProviderPreset) => void;
  onSave: () => Promise<void> | void;
  onStepChange: (step: 1 | 2) => void;
  onTest: (draft: ProviderDraft) => void;
}) {
  const { t } = useTranslation();
  const isCreate = editorMode === 'create';
  const activeStep = isCreate ? editorStep : 2;
  const canOpenConnection = editorMode === 'edit' || providerPresetPicked;
  const title = isCreate ? t('settings.models.newProvider') : t('settings.models.editProvider');
  const description =
    isCreate && activeStep === 1
      ? t('settings.models.chooseProviderDescription')
      : t('settings.models.connectionDescription');

  return (
    <>
      <header className="provider-editor-header">
        <div>
          <span className="provider-editor-kicker">{t('settings.models.editorKicker')}</span>
          <h3 id={titleId}>{title}</h3>
          <p>{description}</p>
        </div>
        <button
          className="provider-editor-close"
          type="button"
          aria-label={t('settings.models.closeProviderEditor')}
          onClick={onCancel}
        >
          <X size={17} />
        </button>
      </header>
      {isCreate ? (
        <ProviderEditorSteps
          canOpenConnection={canOpenConnection}
          draft={draft}
          step={activeStep}
          onStepChange={onStepChange}
        />
      ) : null}
      {activeStep === 1 ? (
        <ProviderPresetPicker
          selectedPresetId={providerPresetPicked ? draft.presetId : undefined}
          onPickPreset={onPickPreset}
        />
      ) : (
        <>
          <div className="provider-editor-connection">
            <ProviderConnectionSummary draft={draft} />
            {saveState === 'error' ? (
              <p className="settings-inline-error" role="alert">
                {saveError || t('settings.models.saveFailed')}
              </p>
            ) : null}
            <ProviderForm draft={draft} showProviderIdentityFields={false} onChange={onChange} />
          </div>
          <ProviderEditorFooter
            canSave={canSave}
            draft={draft}
            saveLabel={saveLabel}
            saveState={saveState}
            testStatus={testStatus}
            onCancel={onCancel}
            onSave={onSave}
            onTest={onTest}
          />
        </>
      )}
    </>
  );
}

function ProviderEditorSteps({
  canOpenConnection,
  draft,
  step,
  onStepChange,
}: {
  canOpenConnection: boolean;
  draft: ProviderDraft;
  step: 1 | 2;
  onStepChange: (step: 1 | 2) => void;
}) {
  const { t } = useTranslation();
  const providerName = providerDraftName(draft);
  const providerLogo = providerDraftLogo(draft);

  return (
    <nav className="provider-editor-steps" aria-label={t('settings.models.providerStepsAria')}>
      <button
        className={step === 1 ? 'provider-editor-step is-active' : 'provider-editor-step is-done'}
        type="button"
        onClick={() => onStepChange(1)}
      >
        <span className="provider-editor-step-number">
          {step === 1 ? '1' : <Check size={11} />}
        </span>
        {t('settings.models.chooseProviderStep')}
        {step === 2 && canOpenConnection ? (
          <span className="provider-editor-step-picked">
            {providerLogo ? <img src={providerLogo} alt="" /> : null}
            {providerName}
          </span>
        ) : null}
      </button>
      <span className="provider-editor-step-rule" />
      <button
        className={
          step === 2
            ? 'provider-editor-step is-active'
            : canOpenConnection
              ? 'provider-editor-step'
              : 'provider-editor-step is-locked'
        }
        disabled={!canOpenConnection}
        type="button"
        onClick={() => onStepChange(2)}
      >
        <span className="provider-editor-step-number">2</span>
        {t('settings.models.connectionStep')}
      </button>
    </nav>
  );
}

function ProviderPresetPicker({
  selectedPresetId,
  onPickPreset,
}: {
  selectedPresetId?: string;
  onPickPreset: (preset: ProviderPreset) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const presets = providerPickerPresets.filter((preset) => {
    if (!normalizedQuery) return true;
    return (
      providerPresetDisplayName(preset.id, preset.name).toLowerCase().includes(normalizedQuery) ||
      preset.id.toLowerCase().includes(normalizedQuery) ||
      preset.type.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <div className="provider-editor-pick-body">
      <label className="provider-editor-search">
        <Search size={15} />
        <input
          type="text"
          value={query}
          placeholder={t('settings.models.searchProvider')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="provider-editor-pick-grid">
        {presets.map((preset) => {
          const active = selectedPresetId === preset.id;
          const logo = providerLogoMap[preset.logo];
          return (
            <button
              className={active ? 'provider-editor-pick is-active' : 'provider-editor-pick'}
              key={preset.id}
              type="button"
              onClick={() => onPickPreset(preset)}
            >
              <img className="provider-editor-pick-logo" src={logo} alt="" />
              <span className="provider-editor-pick-copy">
                <strong>{providerPresetDisplayName(preset.id, preset.name)}</strong>
                <span>
                  {providerProtocolLabel(preset.type)} ·{' '}
                  {t('settings.models.presetModelCount', {
                    count: preset.modelNames.length,
                  })}
                </span>
              </span>
              <span className="provider-editor-pick-arrow">
                {active ? <Check size={16} /> : <ChevronRight size={16} />}
              </span>
            </button>
          );
        })}
      </div>
      {presets.length === 0 ? (
        <p className="provider-editor-empty">{t('settings.models.noMatchedProvider')}</p>
      ) : null}
    </div>
  );
}

function ProviderConnectionSummary({ draft }: { draft: ProviderDraft }) {
  const providerLogo = providerDraftLogo(draft);
  const providerName = providerDraftName(draft);
  const host = providerHost(draft.baseUrl);

  return (
    <div className="provider-editor-current">
      {providerLogo ? <img src={providerLogo} alt="" /> : null}
      <div>
        <strong>{providerName}</strong>
        <span>{host || 'Base URL'}</span>
      </div>
    </div>
  );
}

function ProviderEditorFooter({
  canSave,
  draft,
  saveLabel,
  saveState,
  testStatus,
  onCancel,
  onSave,
  onTest,
}: {
  canSave: boolean;
  draft: ProviderDraft;
  saveLabel: string;
  saveState: SaveState;
  testStatus: ProviderTestState['status'];
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  onTest: (draft: ProviderDraft) => void;
}) {
  const { t } = useTranslation();

  return (
    <footer className="provider-editor-footer">
      <ProviderConnectionStatus status={testStatus} />
      <div className="provider-editor-footer-actions">
        <Button
          className="action-button test-action"
          disabled={testStatus === 'testing'}
          variant="secondary"
          type="button"
          onClick={() => onTest(draft)}
        >
          <Zap size={15} />
          {testStatus === 'testing' ? t('settings.models.testing') : t('settings.models.test')}
        </Button>
        <Button className="action-button" type="button" variant="secondary" onClick={onCancel}>
          {t('settings.models.cancel')}
        </Button>
        <Button
          className={
            saveState === 'saved'
              ? 'action-button save-action is-saved'
              : 'action-button save-action'
          }
          disabled={!canSave}
          type="button"
          onClick={onSave}
        >
          {saveState === 'saved' ? <Check size={16} /> : <Save size={16} />}
          {saveLabel}
        </Button>
      </div>
    </footer>
  );
}

function ProviderConnectionStatus({ status }: { status: ProviderTestState['status'] }) {
  const { t } = useTranslation();
  const icon =
    status === 'success' ? <Check size={14} /> : status === 'error' ? <X size={14} /> : null;

  return (
    <span className={`provider-editor-status is-${status}`} role="status">
      {icon}
      {status === 'testing'
        ? t('settings.models.testingConnection')
        : status === 'success'
          ? t('settings.models.testSuccess')
          : status === 'error'
            ? t('settings.models.testFailed')
            : t('settings.models.connectionIdle')}
    </span>
  );
}

const providerPickerPresets = providerPresets;

function providerDraftName(draft: ProviderDraft) {
  const preset = providerPresets.find((item) => item.id === draft.presetId);
  return draft.name || (preset ? providerPresetDisplayName(preset.id, preset.name) : 'Provider');
}

function providerDraftLogo(draft: ProviderDraft) {
  const preset = providerPresets.find((item) => item.id === draft.presetId);
  const logo = draft.logo || preset?.logo;
  return logo ? providerLogoMap[logo] : undefined;
}

function providerHost(baseUrl: string | undefined) {
  if (!baseUrl) return '';
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function providerProtocolLabel(type: ProviderPreset['type']) {
  if (type === 'anthropic') return 'Anthropic';
  if (type === 'gemini') return 'Gemini';
  return 'OpenAI compatible';
}

const taskRouteOptions: Array<{
  key: keyof Pick<
    AppSettings,
    'readingAssistantProviderId' | 'reviewAssistantProviderId' | 'bilingualTranslationProviderId'
  >;
  descriptionKey: string;
  icon: React.ReactNode;
  titleKey: string;
}> = [
  {
    key: 'readingAssistantProviderId',
    titleKey: 'settings.models.readingRouteTitle',
    descriptionKey: 'settings.models.readingRouteDescription',
    icon: <BookOpen size={18} />,
  },
  {
    key: 'reviewAssistantProviderId',
    titleKey: 'settings.models.reviewRouteTitle',
    descriptionKey: 'settings.models.reviewRouteDescription',
    icon: <ShieldCheck size={18} />,
  },
  {
    key: 'bilingualTranslationProviderId',
    titleKey: 'settings.models.translationRouteTitle',
    descriptionKey: 'settings.models.translationRouteDescription',
    icon: <Languages size={18} />,
  },
];

const assistantExecutionModeOptions: Array<{
  value: AssistantExecutionMode;
  titleKey: string;
}> = [
  { value: 'fast_response', titleKey: 'settings.models.fastResponse' },
  { value: 'deep_verification', titleKey: 'settings.models.deepVerification' },
];

function TaskProviderRoutes({
  providers,
  settingsDraft,
  canSave,
  saveState,
  saveError,
  onChange,
  onSave,
}: {
  providers: LlmProvider[];
  settingsDraft: AppSettings;
  canSave: boolean;
  saveState: SaveState;
  saveError?: string;
  onChange: (draft: AppSettings) => void;
  onSave: (draft?: AppSettings) => void;
}) {
  const { t } = useTranslation();
  const hasProviders = providers.length > 0;
  const executionMode = settingsDraft.assistantExecutionMode || 'fast_response';
  const routePrivacyNotice = t('settings.models.routePrivacyNotice');
  const routeGroupNote = hasProviders ? (
    routePrivacyNotice
  ) : (
    <>
      {routePrivacyNotice}
      <br />
      {t('settings.models.noProvidersNote')}
    </>
  );

  return (
    <SettingsGroup
      label={t('settings.models.routeGroup')}
      note={routeGroupNote}
      aside={
        <AutoSaveStatus
          error={saveError}
          state={saveState}
          onRetry={canSave ? () => onSave() : undefined}
        />
      }
    >
      <SettingsRow
        leading={<Zap size={18} />}
        title={t('settings.models.executionModeTitle')}
        description={t('settings.models.executionModeDescription')}
      >
        <SettingsSegmented
          ariaLabel={t('settings.models.executionModeAria')}
          value={executionMode}
          options={assistantExecutionModeOptions.map((option) => ({
            label: t(option.titleKey),
            value: option.value,
          }))}
          onChange={(value) => {
            const nextDraft = { ...settingsDraft, assistantExecutionMode: value };
            onChange(nextDraft);
            onSave(nextDraft);
          }}
        />
      </SettingsRow>
      {taskRouteOptions.map((option) => {
        const title = t(option.titleKey);
        const selectedProvider = providers.find(
          (provider) => provider.id === settingsDraft[option.key],
        );
        return (
          <SettingsRow
            key={option.key}
            leading={option.icon}
            title={title}
            description={
              hasProviders
                ? t(option.descriptionKey)
                : t('settings.models.routeNoProviderDescription', { title })
            }
          >
            <Select
              disabled={!hasProviders}
              value={settingsDraft[option.key] || ''}
              onValueChange={(providerId) => {
                const nextDraft = { ...settingsDraft, [option.key]: providerId };
                onChange(nextDraft);
                onSave(nextDraft);
              }}
            >
              <SelectTrigger
                aria-label={t('settings.models.providerSelectAria', { title })}
                className="task-route-select-trigger"
              >
                <SelectValue
                  placeholder={
                    hasProviders
                      ? t('settings.models.chooseProvider')
                      : t('settings.models.addProviderFirst')
                  }
                >
                  {selectedProvider ? (
                    <span className="provider-option-content">
                      <img
                        className="provider-select-logo"
                        src={
                          providerLogoMap[selectedProvider.logo || 'anthropic.png'] ||
                          providerLogoMap['anthropic.png']
                        }
                        alt=""
                      />
                      <span className="provider-select-item-copy">
                        <strong>{providerDisplayName(selectedProvider)}</strong>
                        <span>{selectedProvider.modelName}</span>
                      </span>
                    </span>
                  ) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="theme-select-content provider-select-content">
                <SelectGroup>
                  {providers.map((provider) => {
                    const displayName = providerDisplayName(provider);
                    return (
                      <SelectItem
                        className="provider-select-item"
                        key={provider.id}
                        value={provider.id}
                      >
                        <span className="provider-option-content">
                          <img
                            className="provider-select-logo"
                            src={
                              providerLogoMap[provider.logo || 'anthropic.png'] ||
                              providerLogoMap['anthropic.png']
                            }
                            alt=""
                          />
                          <span className="provider-select-item-copy">
                            <strong>{displayName}</strong>
                            <span>{provider.modelName}</span>
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsRow>
        );
      })}
    </SettingsGroup>
  );
}
