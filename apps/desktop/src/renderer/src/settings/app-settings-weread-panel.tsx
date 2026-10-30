import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  FloppyDiskIcon,
  InformationCircleIcon,
  LinkSquare01Icon,
  Refresh01Icon,
  Tick01Icon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';
import { useReducer, useRef } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import {
  normalizeUiLanguage,
  type WeReadOpenMethod,
  type WeReadSettings,
  type WeReadSyncMode,
} from '@yomitomo/shared';
import { AutoSaveStatus } from './app-settings-save-status';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  SettingsGroup,
  SettingsPage,
  SettingsRadioDot,
  SettingsRowCopy,
  SettingsRowDescriptionTooltip,
} from './app-settings-kit';
import { SettingsConfirmDialog } from './app-settings-confirm-dialog';
import { useSaveStatus } from './use-save-status';
import { useTranslation } from 'react-i18next';
import { appSettingsActions } from './app-settings-actions';
import { getDesktopApi } from '../shell/app-desktop-api';

const WEREAD_API_KEY_HELP_URLS = {
  'zh-CN': 'https://yomitomo.app/docs/weread-api-key/',
  en: 'https://yomitomo.app/en/docs/weread-api-key/',
  ja: 'https://yomitomo.app/ja/docs/weread-api-key/',
} as const;

type WeReadTestState = 'idle' | 'testing' | 'success' | 'error';

type WeReadPanelState = {
  apiKey: string;
  apiKeyMessage: string;
  apiKeyVisible: boolean;
  lastOpenMethod: WeReadOpenMethod;
  lastSyncMode: WeReadSyncMode;
  removeConfirmOpen: boolean;
  revealLoading: boolean;
  revealedStoredApiKey: string;
  testMessage: string;
  testState: WeReadTestState;
};

type WeReadPanelEvent =
  | { type: 'apiKeyEdited'; apiKey: string }
  | { type: 'apiKeyHidden' }
  | { type: 'apiKeyShown' }
  | { type: 'credentialSaveStarted' }
  | { type: 'credentialSaved' }
  | { type: 'openMethodChosen'; openMethod: WeReadOpenMethod }
  | { type: 'removeConfirmClosed' }
  | { type: 'removeConfirmOpened' }
  | { type: 'revealFailed'; message: string }
  | { type: 'revealStarted' }
  | { type: 'revealSucceeded'; apiKey: string; message: string }
  | { type: 'storedApiKeyRemoved' }
  | { type: 'syncModeChosen'; syncMode: WeReadSyncMode }
  | { type: 'testFinished'; message: string; ok: boolean }
  | { type: 'testReset' }
  | { type: 'testStarted' };

const initialWeReadPanelState: WeReadPanelState = {
  apiKey: '',
  apiKeyMessage: '',
  apiKeyVisible: false,
  lastOpenMethod: 'deeplink',
  lastSyncMode: 'manual',
  removeConfirmOpen: false,
  revealLoading: false,
  revealedStoredApiKey: '',
  testMessage: '',
  testState: 'idle',
};

function weReadPanelReducer(state: WeReadPanelState, event: WeReadPanelEvent): WeReadPanelState {
  switch (event.type) {
    case 'apiKeyEdited':
      return { ...state, apiKey: event.apiKey, apiKeyMessage: '', revealedStoredApiKey: '' };
    case 'apiKeyHidden':
      return {
        ...state,
        apiKeyMessage: '',
        apiKeyVisible: false,
        revealLoading: false,
        revealedStoredApiKey: '',
      };
    case 'apiKeyShown':
      return { ...state, apiKeyVisible: true };
    case 'credentialSaveStarted':
      return { ...state, apiKeyMessage: '', removeConfirmOpen: false };
    case 'credentialSaved':
      return { ...state, apiKey: '', apiKeyVisible: false, revealedStoredApiKey: '' };
    case 'openMethodChosen':
      return { ...state, lastOpenMethod: event.openMethod };
    case 'removeConfirmClosed':
      return { ...state, removeConfirmOpen: false };
    case 'removeConfirmOpened':
      return { ...state, removeConfirmOpen: true };
    case 'revealFailed':
      return { ...state, apiKeyMessage: event.message, revealLoading: false };
    case 'revealStarted':
      return { ...state, apiKeyMessage: '', revealLoading: true };
    case 'revealSucceeded':
      return {
        ...state,
        apiKeyMessage: event.message,
        apiKeyVisible: true,
        revealLoading: false,
        revealedStoredApiKey: event.apiKey,
      };
    case 'storedApiKeyRemoved':
      return {
        ...state,
        apiKey: '',
        apiKeyVisible: false,
        revealedStoredApiKey: '',
        testMessage: '',
        testState: 'idle',
      };
    case 'syncModeChosen':
      return { ...state, lastSyncMode: event.syncMode };
    case 'testFinished':
      return { ...state, testMessage: event.message, testState: event.ok ? 'success' : 'error' };
    case 'testReset':
      return { ...state, testState: 'idle' };
    case 'testStarted':
      return { ...state, testMessage: '', testState: 'testing' };
  }
}

const defaultWeReadSettings: WeReadSettings = {
  configured: false,
  openMethod: 'deeplink',
  syncMode: 'manual',
};

const weReadSettingsQuery = queryOptions({
  queryKey: ['weread', 'settings'],
  queryFn: async () => (await getDesktopApi().weRead.getState()).settings,
});

export function WeReadSettingsPanel() {
  const { i18n, t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings = defaultWeReadSettings } = useQuery(weReadSettingsQuery);
  const [panel, dispatch] = useReducer(weReadPanelReducer, initialWeReadPanelState);
  const {
    apiKey,
    apiKeyMessage,
    apiKeyVisible,
    lastOpenMethod,
    lastSyncMode,
    removeConfirmOpen,
    revealLoading,
    revealedStoredApiKey,
    testMessage,
    testState,
  } = panel;
  const revealRequestRef = useRef(0);
  const testResetTimerRef = useRef<number | undefined>(undefined);
  const credentialSave = useSaveStatus({
    errorMessage: (error) => settingsSaveErrorMessage(error, t),
  });
  const openMethodSave = useSaveStatus({
    errorMessage: (error) => settingsSaveErrorMessage(error, t),
  });
  const syncModeSave = useSaveStatus({
    errorMessage: (error) => settingsSaveErrorMessage(error, t),
  });
  const displayedApiKey = apiKey || (apiKeyVisible ? revealedStoredApiKey : '');

  useMountEffect(() => clearTestResetTimer);

  function setSettings(update: WeReadSettings | ((current: WeReadSettings) => WeReadSettings)) {
    queryClient.setQueryData(weReadSettingsQuery.queryKey, (current) =>
      typeof update === 'function' ? update(current ?? defaultWeReadSettings) : update,
    );
  }

  function clearTestResetTimer() {
    if (testResetTimerRef.current === undefined) return;
    window.clearTimeout(testResetTimerRef.current);
    testResetTimerRef.current = undefined;
  }

  function scheduleTestReset() {
    clearTestResetTimer();
    testResetTimerRef.current = window.setTimeout(() => {
      testResetTimerRef.current = undefined;
      dispatch({ type: 'testReset' });
    }, 1400);
  }

  async function saveSettings() {
    if (!apiKey.trim()) return;
    dispatch({ type: 'credentialSaveStarted' });
    await credentialSave.run(
      async () => {
        const state = await getDesktopApi().weRead.saveSettings({
          apiKey,
          openMethod: settings.openMethod,
        });
        setSettings(state.settings);
      },
      { onSaved: () => dispatch({ type: 'credentialSaved' }) },
    );
  }

  async function removeStoredApiKey() {
    if (!settings.configured) return;
    dispatch({ type: 'credentialSaveStarted' });
    await credentialSave.run(
      async () => {
        const state = await getDesktopApi().weRead.saveSettings({
          removeApiKey: true,
          openMethod: settings.openMethod,
        });
        setSettings(state.settings);
      },
      { onSaved: () => dispatch({ type: 'storedApiKeyRemoved' }) },
    );
  }

  async function testConnection() {
    clearTestResetTimer();
    dispatch({ type: 'testStarted' });
    try {
      const { result, state } = await appSettingsActions.testWeReadAndRefresh(apiKey);
      dispatch({
        type: 'testFinished',
        message: result.ok
          ? t('settings.weread.testSuccess')
          : wereadResultMessage(result.message, t),
        ok: result.ok,
      });
      setSettings(state.settings);
    } catch (error) {
      dispatch({ type: 'testFinished', message: wereadErrorMessage(error, t), ok: false });
    } finally {
      scheduleTestReset();
    }
  }

  async function toggleApiKeyVisible() {
    if (apiKeyVisible) {
      revealRequestRef.current += 1;
      dispatch({ type: 'apiKeyHidden' });
      return;
    }

    if (apiKey || !settings.configured) {
      dispatch({ type: 'apiKeyShown' });
      return;
    }

    dispatch({ type: 'revealStarted' });
    const requestId = ++revealRequestRef.current;
    try {
      const storedApiKey = (await getDesktopApi().weRead.readApiKey()) || '';
      if (requestId !== revealRequestRef.current) return;
      dispatch({
        type: 'revealSucceeded',
        apiKey: storedApiKey,
        message: storedApiKey ? '' : t('settings.weread.noStoredApiKey'),
      });
    } catch {
      if (requestId !== revealRequestRef.current) return;
      dispatch({ type: 'revealFailed', message: t('settings.weread.readStoredApiKeyFailed') });
    }
  }

  async function saveOpenMethod(openMethod: WeReadOpenMethod) {
    const previous = settings.openMethod;
    dispatch({ type: 'openMethodChosen', openMethod });
    setSettings((current) => ({ ...current, openMethod }));
    await openMethodSave.run(() => getDesktopApi().weRead.saveSettings({ openMethod }), {
      onError: () => setSettings((current) => ({ ...current, openMethod: previous })),
      onSaved: (state) => setSettings(state.settings),
    });
  }

  async function saveSyncMode(syncMode: WeReadSyncMode) {
    const previous = settings.syncMode ?? 'manual';
    dispatch({ type: 'syncModeChosen', syncMode });
    setSettings((current) => ({ ...current, syncMode }));
    await syncModeSave.run(() => getDesktopApi().weRead.saveSettings({ syncMode }), {
      onError: () => setSettings((current) => ({ ...current, syncMode: previous })),
      onSaved: (state) => setSettings(state.settings),
    });
  }

  async function openWeReadApiKeyHelp() {
    const helpUrl = WEREAD_API_KEY_HELP_URLS[normalizeUiLanguage(i18n.language)];
    try {
      await getDesktopApi().app.openUrl(helpUrl);
    } catch {
      window.open(helpUrl, '_blank', 'noopener,noreferrer');
    }
  }

  const canSave = credentialSave.saveState !== 'saving' && Boolean(apiKey.trim());
  const canTest = testState !== 'testing' && (Boolean(apiKey.trim()) || settings.configured);
  const canRemove = credentialSave.saveState !== 'saving' && settings.configured;
  const saveLabel =
    credentialSave.saveState === 'saving'
      ? t('settings.weread.saving')
      : credentialSave.saveState === 'saved'
        ? t('settings.weread.saved')
        : t('settings.weread.save');
  const testLabel =
    testState === 'testing'
      ? t('settings.weread.testing')
      : testState === 'success'
        ? t('settings.weread.testSuccess')
        : testState === 'error'
          ? t('settings.weread.testFailed')
          : t('settings.weread.test');

  return (
    <SettingsPage
      trail={[
        t('settings.weread.trailRoot'),
        t('settings.weread.trailDataSources'),
        t('settings.weread.trailPage'),
      ]}
      description={t('settings.weread.description')}
    >
      <SettingsGroup
        label={t('settings.weread.credentialGroup')}
        padded
        aside={
          settings.configured ? (
            <span className="settings-status-ok">
              <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} />
              {t('settings.weread.savedToKeychain')}
            </span>
          ) : null
        }
      >
        <div className="settings-field">
          <label className="settings-field-label" htmlFor="weread-api-key">
            {t('settings.weread.apiKeyLabel')}
          </label>
          <div className="weread-api-key-field">
            <Input
              id="weread-api-key"
              className="pr-12"
              type={apiKeyVisible ? 'text' : 'password'}
              value={displayedApiKey}
              placeholder={
                settings.configured
                  ? t('settings.weread.configuredPlaceholder')
                  : t('settings.weread.emptyPlaceholder')
              }
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                dispatch({ type: 'apiKeyEdited', apiKey: event.target.value });
                credentialSave.reset();
              }}
            />
            <button
              aria-label={
                apiKeyVisible ? t('settings.weread.hideApiKey') : t('settings.weread.showApiKey')
              }
              className="secret-toggle"
              disabled={revealLoading}
              type="button"
              onClick={toggleApiKeyVisible}
            >
              {apiKeyVisible ? (
                <HugeiconsIcon icon={ViewOffIcon} size={17} />
              ) : (
                <HugeiconsIcon icon={ViewIcon} size={17} />
              )}
            </button>
          </div>
        </div>
        <div className="settings-card-actions weread-api-key-actions">
          <Button
            className={
              credentialSave.saveState === 'saved'
                ? 'action-button save-action is-saved'
                : 'action-button save-action'
            }
            disabled={!canSave}
            type="button"
            onClick={saveSettings}
          >
            {credentialSave.saveState === 'saved' ? (
              <HugeiconsIcon icon={Tick01Icon} size={16} />
            ) : (
              <HugeiconsIcon icon={FloppyDiskIcon} size={16} />
            )}
            {saveLabel}
          </Button>
          <Button
            className={
              testState === 'testing'
                ? 'action-button test-action is-loading'
                : testState === 'success'
                  ? 'action-button test-action is-success'
                  : testState === 'error'
                    ? 'action-button test-action is-error'
                    : 'action-button test-action'
            }
            disabled={!canTest}
            type="button"
            variant="outline"
            onClick={testConnection}
          >
            {testState === 'success' ? (
              <HugeiconsIcon icon={Tick01Icon} size={15} />
            ) : testState === 'error' ? (
              <HugeiconsIcon icon={Cancel01Icon} size={15} />
            ) : (
              <HugeiconsIcon icon={Refresh01Icon} size={15} />
            )}
            {testLabel}
          </Button>
          <Button
            className="action-button weread-remove-action"
            disabled={!canRemove}
            type="button"
            variant="secondary"
            onClick={() => dispatch({ type: 'removeConfirmOpened' })}
          >
            <HugeiconsIcon icon={Delete02Icon} size={15} />
            {t('settings.weread.remove')}
          </Button>
          <button className="weread-help-link" type="button" onClick={openWeReadApiKeyHelp}>
            <HugeiconsIcon icon={InformationCircleIcon} size={15} />
            {t('settings.weread.help')}
            <HugeiconsIcon icon={LinkSquare01Icon} size={13} />
          </button>
        </div>
        {credentialSave.saveState === 'error' || apiKeyMessage ? (
          <p className="settings-error-text">
            {apiKeyMessage || credentialSave.saveError || t('settings.weread.saveFailed')}
          </p>
        ) : testState === 'error' && testMessage ? (
          <p className="settings-error-text">{testMessage}</p>
        ) : null}
      </SettingsGroup>
      <SettingsConfirmDialog
        cancelLabel={t('settings.confirm.cancel')}
        confirmLabel={t('settings.weread.removeConfirm')}
        description={t('settings.weread.removeConfirmDescription')}
        open={removeConfirmOpen}
        title={t('settings.weread.removeConfirmTitle')}
        onCancel={() => dispatch({ type: 'removeConfirmClosed' })}
        onConfirm={() => void removeStoredApiKey()}
      />

      <SettingsGroup
        label={t('settings.weread.openMethodGroup')}
        aside={
          <AutoSaveStatus
            error={openMethodSave.saveError}
            state={openMethodSave.saveState}
            onRetry={() => void saveOpenMethod(lastOpenMethod)}
          />
        }
        cardProps={{ role: 'radiogroup', 'aria-label': t('settings.weread.openMethodAria') }}
      >
        {wereadOpenMethods.map((option) => {
          const active = settings.openMethod === option.value;
          const label = t(option.labelKey);
          const description = t(option.descriptionKey);
          return (
            <SettingsRowDescriptionTooltip description={description} key={option.value}>
              <button
                aria-checked={active}
                aria-label={`${label}. ${description}`}
                className="settings-row settings-row-button"
                type="button"
                role="radio"
                onClick={() => {
                  if (active) return;
                  void saveOpenMethod(option.value);
                }}
              >
                <span className="settings-row-leading">
                  <SettingsRadioDot checked={active} />
                </span>
                <SettingsRowCopy title={label} description={description} infoMode="decorative" />
              </button>
            </SettingsRowDescriptionTooltip>
          );
        })}
      </SettingsGroup>

      <SettingsGroup
        label={t('settings.weread.syncModeGroup')}
        aside={
          <AutoSaveStatus
            error={syncModeSave.saveError}
            state={syncModeSave.saveState}
            onRetry={() => void saveSyncMode(lastSyncMode)}
          />
        }
        cardProps={{ role: 'radiogroup', 'aria-label': t('settings.weread.syncModeAria') }}
      >
        {wereadSyncModes.map((option) => {
          const active = (settings.syncMode ?? 'manual') === option.value;
          const label = t(option.labelKey);
          const description = t(option.descriptionKey);
          return (
            <SettingsRowDescriptionTooltip description={description} key={option.value}>
              <button
                aria-checked={active}
                aria-label={`${label}. ${description}`}
                className="settings-row settings-row-button"
                type="button"
                role="radio"
                onClick={() => {
                  if (active) return;
                  void saveSyncMode(option.value);
                }}
              >
                <span className="settings-row-leading">
                  <SettingsRadioDot checked={active} />
                </span>
                <SettingsRowCopy title={label} description={description} infoMode="decorative" />
              </button>
            </SettingsRowDescriptionTooltip>
          );
        })}
      </SettingsGroup>
    </SettingsPage>
  );
}

export function DataSourcesPanel() {
  const { t } = useTranslation();
  return (
    <div className="data-sources-panel">
      <WeReadSettingsPanel />
      <p className="data-sources-coming-soon" role="note">
        {t('settings.dataSourcesPanel.comingSoon')}
      </p>
    </div>
  );
}

const wereadOpenMethods: Array<{
  value: WeReadOpenMethod;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    value: 'deeplink',
    labelKey: 'settings.weread.deeplinkLabel',
    descriptionKey: 'settings.weread.deeplinkDescription',
  },
  {
    value: 'web',
    labelKey: 'settings.weread.webLabel',
    descriptionKey: 'settings.weread.webDescription',
  },
];

const wereadSyncModes: Array<{
  value: WeReadSyncMode;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    value: 'manual',
    labelKey: 'settings.weread.manualSyncLabel',
    descriptionKey: 'settings.weread.manualSyncDescription',
  },
  {
    value: 'auto',
    labelKey: 'settings.weread.autoSyncLabel',
    descriptionKey: 'settings.weread.autoSyncDescription',
  },
];

function settingsSaveErrorMessage(error: unknown, t: ReturnType<typeof useTranslation>['t']) {
  if (error instanceof Error && error.message) {
    return t('settings.weread.saveFailedWithMessage', { message: error.message });
  }
  return t('settings.weread.saveFailed');
}

function wereadErrorMessage(error: unknown, t: ReturnType<typeof useTranslation>['t']) {
  return error instanceof Error && error.message
    ? wereadResultMessage(error.message, t)
    : t('settings.weread.testFailedFallback');
}

function wereadResultMessage(message: string, t: ReturnType<typeof useTranslation>['t']) {
  if (message === 'WEREAD_API_KEY_REQUIRED') return t('settings.weread.apiKeyRequired');
  if (message === 'WEREAD_CONNECTION_FAILED') return t('settings.weread.testFailedFallback');
  return message || t('settings.weread.testFailedFallback');
}
