import React, { useState } from 'react';
import { BookOpen, Check, Languages, Save, ShieldCheck, Zap, X } from 'lucide-react';
import type { AppSettings, AssistantExecutionMode, LlmProvider } from '@yomitomo/shared';
import type { ProviderDraft, ProviderTestState } from './app-settings';
import { providerLogoMap } from './app-settings-provider-assets';
import { ProviderForm } from './app-settings-provider-form';
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
import { providerDisplayName } from '../i18n/app-i18n-labels';
import type { SaveableDraft } from './use-saveable-draft';

type ProviderDraftController = SaveableDraft<ProviderDraft, boolean> & {
  create: () => void;
  deleteProvider: (id: string) => Promise<void> | void;
  select: (provider: LlmProvider) => void;
  selectedProviderId: string | null;
  test: (draft: ProviderDraft) => Promise<void> | void;
  testState: ProviderTestState;
};

type ProviderSettingsLegacyProps = {
  draft: ProviderDraft;
  settingsDraft: AppSettings;
  providers: LlmProvider[];
  testState: ProviderTestState;
  canSave: boolean;
  canSaveRoutes: boolean;
  onChange: (draft: ProviderDraft) => void;
  onRouteChange: (draft: AppSettings) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSave: () => Promise<boolean | void> | boolean | void;
  saveState: SaveState;
  saveError?: string;
  routeSaveState: SaveState;
  routeSaveError?: string;
  onRouteSave: (draft?: AppSettings) => void;
  onSelect: (provider: LlmProvider) => void;
  onTest: (draft: ProviderDraft) => Promise<void> | void;
};

type ProviderSettingsProps =
  | {
      providerDraft: ProviderDraftController;
      routesDraft: SaveableDraft<AppSettings>;
      providers: LlmProvider[];
    }
  | ProviderSettingsLegacyProps;

export function ProviderSettings(props: ProviderSettingsProps) {
  const {
    draft,
    settingsDraft,
    providers,
    testState,
    canSave,
    canSaveRoutes,
    onChange,
    onRouteChange,
    onCreate,
    onDelete,
    onSave,
    saveState,
    saveError,
    routeSaveState,
    routeSaveError,
    onRouteSave,
    onSelect,
    onTest,
  } = resolveProviderSettingsProps(props);
  const { t } = useTranslation();
  const saveLabel =
    saveState === 'saving'
      ? t('settings.models.saving')
      : saveState === 'saved'
        ? t('settings.models.saved')
        : t('settings.models.save');
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const testStatus = testState.status;
  const usedProviderIds = new Set(
    [
      settingsDraft.readingAssistantProviderId,
      settingsDraft.reviewAssistantProviderId,
      settingsDraft.bilingualTranslationProviderId,
    ].filter((id): id is string => Boolean(id)),
  );

  function selectProvider(provider: LlmProvider) {
    onSelect(provider);
    setProviderEditorOpen(true);
  }

  function createProvider() {
    onCreate();
    setProviderEditorOpen(true);
  }

  function deleteProvider(id: string) {
    onDelete(id);
    setProviderEditorOpen(false);
  }

  function testProvider(providerDraft: ProviderDraft) {
    void Promise.resolve(onTest(providerDraft)).catch(() => undefined);
  }

  async function saveProviderAndClose() {
    try {
      const result = await onSave();
      if (result !== false) setProviderEditorOpen(false);
    } catch {
      setProviderEditorOpen(true);
    }
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
                onChange={onChange}
                onCancel={() => setProviderEditorOpen(false)}
                onSave={saveProviderAndClose}
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
          onChange={onRouteChange}
          onSave={onRouteSave}
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

function resolveProviderSettingsProps(props: ProviderSettingsProps): ProviderSettingsLegacyProps {
  if ('providerDraft' in props) {
    return {
      draft: props.providerDraft.value,
      settingsDraft: props.routesDraft.value,
      providers: props.providers,
      testState: props.providerDraft.testState,
      canSave: props.providerDraft.canSave,
      canSaveRoutes: props.routesDraft.canSave,
      onChange: props.providerDraft.update,
      onRouteChange: props.routesDraft.update,
      onCreate: props.providerDraft.create,
      onDelete: props.providerDraft.deleteProvider,
      onSave: async () => Boolean(await props.providerDraft.save()),
      saveState: props.providerDraft.saveState,
      saveError: props.providerDraft.saveError,
      routeSaveState: props.routesDraft.saveState,
      routeSaveError: props.routesDraft.saveError,
      onRouteSave: (draft) => {
        void props.routesDraft.save(draft);
      },
      onSelect: props.providerDraft.select,
      onTest: props.providerDraft.test,
    };
  }
  return props;
}

function ProviderEditorContent({
  draft,
  saveLabel,
  saveError,
  saveState,
  testStatus,
  titleId,
  canSave,
  onChange,
  onCancel,
  onSave,
  onTest,
}: {
  draft: ProviderDraft;
  saveLabel: string;
  saveError?: string;
  saveState: SaveState;
  testStatus: ProviderTestState['status'];
  titleId?: string;
  canSave: boolean;
  onChange: (draft: ProviderDraft) => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  onTest: (draft: ProviderDraft) => void;
}) {
  const { t } = useTranslation();
  const testResultIcon =
    testStatus === 'success' || testStatus === 'error' ? (
      <span
        aria-label={
          testStatus === 'success'
            ? t('settings.models.testSuccess')
            : t('settings.models.testFailed')
        }
        className={`provider-test-status is-${testStatus}`}
        key={testStatus}
        role="status"
      >
        {testStatus === 'success' ? <Check size={15} /> : <X size={15} />}
      </span>
    ) : null;

  return (
    <>
      <div className="detail-pane-header">
        <div>
          <h3 id={titleId}>
            {draft.id ? t('settings.models.editProvider') : t('settings.models.newProvider')}
          </h3>
          <p>{t('settings.models.editorDescription')}</p>
        </div>
        <div className="flex gap-2">
          <span className="provider-test-control">
            <Button
              className="action-button test-action"
              disabled={testStatus === 'testing'}
              variant="secondary"
              type="button"
              onClick={() => onTest(draft)}
            >
              {testStatus === 'testing' ? t('settings.models.testing') : t('settings.models.test')}
            </Button>
            {testResultIcon}
          </span>
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
      </div>
      {saveState === 'error' ? (
        <p className="settings-inline-error" role="alert">
          {saveError || t('settings.models.saveFailed')}
        </p>
      ) : null}
      <ProviderForm draft={draft} onChange={onChange} />
    </>
  );
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

  return (
    <SettingsGroup
      label={t('settings.models.routeGroup')}
      note={hasProviders ? undefined : t('settings.models.noProvidersNote')}
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
