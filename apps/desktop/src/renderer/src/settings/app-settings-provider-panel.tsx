import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  BookOpen01Icon,
  Cancel01Icon,
  FlashIcon,
  FloppyDiskIcon,
  LanguageCircleIcon,
  Search01Icon,
  SecurityCheckIcon,
  Tick01Icon,
} from '@hugeicons/core-free-icons';
import React, { useReducer } from 'react';
import {
  providerPresets,
  type ResolvedAppSettings,
  type LlmProvider,
  type ProviderPreset,
} from '@yomitomo/shared';
import type { ProviderDraft, ProviderTestState } from './app-settings';
import { providerLogoMap } from './app-settings-provider-assets';
import { providerDraftFromPreset, ProviderForm } from './app-settings-provider-form';
import { ProviderList } from './app-settings-provider-list';
import type { SaveState } from '../shell/app-types';
import { AutoSaveStatus } from './app-settings-save-status';
import { SettingsGroup, SettingsPage, SettingsRow } from './app-settings-kit';
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
import type { SaveableDraft } from './settings-draft-saver';
import { ReadingMemoryModelSettings } from './reading-memory-model-settings';
import { readingMemoryEnabled } from '../../../reading-memory-release';

type ProviderDraftController = SaveableDraft<ProviderDraft> & {
  create: () => void;
  deleteProvider: (id: string) => Promise<void> | void;
  select: (provider: LlmProvider) => void;
  selectedProviderId: string | null;
  test: (draft: ProviderDraft) => Promise<void> | void;
  testState: ProviderTestState;
};

type ProviderSettingsProps = {
  providerDraft: ProviderDraftController;
  routesDraft: SaveableDraft<ResolvedAppSettings>;
  providers: LlmProvider[];
};

export function ProviderSettings({ providerDraft, routesDraft, providers }: ProviderSettingsProps) {
  const draft = providerDraft.value;
  const settingsDraft = routesDraft.value;
  const testState = providerDraft.testState;
  const canSave = providerDraft.canSave;
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
  const [providerEditor, dispatchEditor] = useReducer(providerEditorReducer, {
    mode: 'create',
    open: false,
    presetPicked: false,
    step: 1,
  });
  const testStatus = testState.status;
  const usedProviderIds = new Set(
    [
      settingsDraft.defaultProviderId,
      settingsDraft.readingAssistantProviderId,
      settingsDraft.reviewAssistantProviderId,
      settingsDraft.bilingualTranslationProviderId,
    ].filter((id): id is string => Boolean(id)),
  );

  function selectProvider(provider: LlmProvider) {
    providerDraft.select(provider);
    dispatchEditor({ type: 'editStarted' });
  }

  function createProvider() {
    providerDraft.create();
    dispatchEditor({ type: 'createStarted' });
  }

  function deleteProvider(id: string) {
    void providerDraft.deleteProvider(id);
    dispatchEditor({ type: 'closed' });
  }

  function testProvider(nextDraft: ProviderDraft) {
    void Promise.resolve(providerDraft.test(nextDraft)).catch(() => undefined);
  }

  function closeProviderEditor() {
    dispatchEditor({ type: 'closed' });
  }

  async function saveProviderAndClose() {
    try {
      const saved = Boolean(await providerDraft.save());
      if (saved) dispatchEditor({ type: 'closed' });
    } catch {
      dispatchEditor({ type: 'saveFailed' });
    }
  }

  function saveRoutes(nextDraft?: ResolvedAppSettings) {
    void routesDraft.save(nextDraft);
  }

  const editorDialog =
    providerEditor.open && typeof document !== 'undefined' ? (
      <Dialog
        open={providerEditor.open}
        onOpenChange={(open) => {
          if (!open) closeProviderEditor();
        }}
      >
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
                editorMode={providerEditor.mode}
                editorStep={providerEditor.step}
                providerPresetPicked={providerEditor.presetPicked}
                onChange={providerDraft.update}
                onCancel={closeProviderEditor}
                onPickPreset={(preset) => {
                  providerDraft.update(providerDraftFromPreset(draft, preset));
                  dispatchEditor({ type: 'presetPicked' });
                }}
                onSave={saveProviderAndClose}
                onStepChange={(step) => dispatchEditor({ type: 'stepChanged', step })}
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
        <SettingsGroup label={t('settings.models.providerGroup')} flush>
          <ProviderList
            providers={providers}
            usedProviderIds={usedProviderIds}
            onCreate={createProvider}
            onDelete={deleteProvider}
            onEdit={selectProvider}
          />
        </SettingsGroup>
        <TaskProviderRoutes
          providers={providers}
          saveError={routeSaveError}
          saveState={routeSaveState}
          settingsDraft={settingsDraft}
          onChange={routesDraft.update}
          onSave={saveRoutes}
        />
        {readingMemoryEnabled ? <ReadingMemoryModelSettings /> : null}
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
          <HugeiconsIcon icon={Cancel01Icon} size={17} />
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
          {step === 1 ? '1' : <HugeiconsIcon icon={Tick01Icon} size={11} />}
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
  const [query, changeQuery] = useReducer(presetQueryReducer, '');
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
        <HugeiconsIcon icon={Search01Icon} size={15} />
        <input
          type="text"
          value={query}
          placeholder={t('settings.models.searchProvider')}
          onChange={(event) => changeQuery(event.target.value)}
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
                {active ? (
                  <HugeiconsIcon icon={Tick01Icon} size={16} />
                ) : (
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
                )}
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
          <HugeiconsIcon icon={FlashIcon} size={15} />
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
          {saveState === 'saved' ? (
            <HugeiconsIcon icon={Tick01Icon} size={16} />
          ) : (
            <HugeiconsIcon icon={FloppyDiskIcon} size={16} />
          )}
          {saveLabel}
        </Button>
      </div>
    </footer>
  );
}

function ProviderConnectionStatus({ status }: { status: ProviderTestState['status'] }) {
  const { t } = useTranslation();
  const icon =
    status === 'success' ? (
      <HugeiconsIcon icon={Tick01Icon} size={14} />
    ) : status === 'error' ? (
      <HugeiconsIcon icon={Cancel01Icon} size={14} />
    ) : null;

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
    ResolvedAppSettings,
    | 'defaultProviderId'
    | 'readingAssistantProviderId'
    | 'reviewAssistantProviderId'
    | 'bilingualTranslationProviderId'
  >;
  descriptionKey: string;
  icon: React.ReactNode;
  titleKey: string;
}> = [
  {
    key: 'readingAssistantProviderId',
    titleKey: 'settings.models.readingRouteTitle',
    descriptionKey: 'settings.models.readingRouteDescription',
    icon: <HugeiconsIcon icon={BookOpen01Icon} size={18} />,
  },
  {
    key: 'reviewAssistantProviderId',
    titleKey: 'settings.models.reviewRouteTitle',
    descriptionKey: 'settings.models.reviewRouteDescription',
    icon: <HugeiconsIcon icon={SecurityCheckIcon} size={18} />,
  },
  {
    key: 'bilingualTranslationProviderId',
    titleKey: 'settings.models.translationRouteTitle',
    descriptionKey: 'settings.models.translationRouteDescription',
    icon: <HugeiconsIcon icon={LanguageCircleIcon} size={18} />,
  },
];

const defaultRouteOption: (typeof taskRouteOptions)[number] = {
  key: 'defaultProviderId',
  titleKey: 'settings.models.defaultRouteTitle',
  descriptionKey: 'settings.models.defaultRouteDescription',
  icon: <HugeiconsIcon icon={BookOpen01Icon} size={18} />,
};

function TaskProviderRoutes({
  providers,
  settingsDraft,
  saveState,
  saveError,
  onChange,
  onSave,
}: {
  providers: LlmProvider[];
  settingsDraft: ResolvedAppSettings;
  saveState: SaveState;
  saveError?: string;
  onChange: (draft: ResolvedAppSettings) => void;
  onSave: (draft?: ResolvedAppSettings) => void;
}) {
  const { t } = useTranslation();
  const [showTaskRoutes, toggleTaskRoutes] = useReducer(
    (shown: boolean) => !shown,
    settingsDraft,
    (draft) => taskRouteOptions.some((option) => Boolean(draft[option.key])),
  );

  function updateRoute(key: (typeof taskRouteOptions)[number]['key'], providerId: string) {
    const nextDraft = { ...settingsDraft, [key]: providerId || undefined };
    onChange(nextDraft);
    onSave(nextDraft);
  }

  return (
    <SettingsGroup
      label={t('settings.models.routeGroup')}
      note={t('settings.models.routePrivacyNotice')}
      aside={<AutoSaveStatus error={saveError} state={saveState} onRetry={() => onSave()} />}
    >
      <ProviderRouteRow
        option={defaultRouteOption}
        providers={providers}
        settings={settingsDraft}
        onChange={updateRoute}
      />
      <div className="px-4 py-3">
        <Button
          variant="ghost"
          aria-expanded={showTaskRoutes}
          aria-controls="provider-task-overrides"
          onClick={toggleTaskRoutes}
        >
          {t('settings.models.taskOverrides')}
        </Button>
      </div>
      <div id="provider-task-overrides" hidden={!showTaskRoutes}>
        {taskRouteOptions.map((option) => (
          <ProviderRouteRow
            key={option.key}
            option={option}
            providers={providers}
            settings={settingsDraft}
            onChange={updateRoute}
          />
        ))}
      </div>
    </SettingsGroup>
  );
}

function ProviderRouteRow({
  option,
  providers,
  settings,
  onChange,
}: {
  option: (typeof taskRouteOptions)[number];
  providers: LlmProvider[];
  settings: ResolvedAppSettings;
  onChange: (key: (typeof taskRouteOptions)[number]['key'], providerId: string) => void;
}) {
  const { t } = useTranslation();
  const title = t(option.titleKey);
  const isTaskRoute = option.key !== 'defaultProviderId';
  const inherited = isTaskRoute && !settings[option.key];
  const selectedProvider = providers.find(
    (provider) => provider.id === (inherited ? settings.defaultProviderId : settings[option.key]),
  );
  return (
    <SettingsRow
      leading={option.icon}
      title={title}
      description={
        providers.length > 0 ? t(option.descriptionKey) : t('settings.models.addProviderFirst')
      }
    >
      <Select
        disabled={providers.length === 0}
        value={settings[option.key] || ''}
        onValueChange={(providerId) => onChange(option.key, providerId)}
      >
        <SelectTrigger
          aria-label={t('settings.models.providerSelectAria', { title })}
          className="task-route-select-trigger"
        >
          <SelectValue placeholder={t('settings.models.chooseProvider')}>
            {selectedProvider ? (
              <span className="provider-select-item-copy">
                <strong>
                  {inherited
                    ? t('settings.models.useDefaultModel')
                    : providerDisplayName(selectedProvider)}
                </strong>
                <span>{selectedProvider.modelName}</span>
              </span>
            ) : inherited ? (
              t('settings.models.useDefaultModel')
            ) : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="theme-select-content provider-select-content">
          <SelectGroup>
            {isTaskRoute ? (
              <SelectItem value="">{t('settings.models.useDefaultModel')}</SelectItem>
            ) : null}
            {providers.map((provider) => (
              <SelectItem className="provider-select-item" key={provider.id} value={provider.id}>
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
                    <strong>{providerDisplayName(provider)}</strong>
                    <span>{provider.modelName}</span>
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

type ProviderEditorState = {
  mode: 'create' | 'edit';
  open: boolean;
  presetPicked: boolean;
  step: 1 | 2;
};

type ProviderEditorEvent =
  | { type: 'closed' }
  | { type: 'createStarted' }
  | { type: 'editStarted' }
  | { type: 'presetPicked' }
  | { type: 'saveFailed' }
  | { type: 'stepChanged'; step: 1 | 2 };

function providerEditorReducer(
  state: ProviderEditorState,
  event: ProviderEditorEvent,
): ProviderEditorState {
  switch (event.type) {
    case 'closed':
      return { ...state, open: false };
    case 'createStarted':
      return { mode: 'create', open: true, presetPicked: false, step: 1 };
    case 'editStarted':
      return { mode: 'edit', open: true, presetPicked: true, step: 2 };
    case 'presetPicked':
      return { ...state, presetPicked: true, step: 2 };
    case 'saveFailed':
      return { ...state, open: true };
    case 'stepChanged':
      return { ...state, step: event.step };
  }
}

function presetQueryReducer(_query: string, query: string) {
  return query;
}
