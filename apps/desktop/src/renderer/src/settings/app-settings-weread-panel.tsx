import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CircleCheck,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { WeReadOpenMethod, WeReadSettings } from '@yomitomo/shared';
import { AutoSaveStatus } from './app-settings-save-status';
import type { SaveState } from '../shell/app-types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { SettingsGroup, SettingsPage, SettingsRadioDot } from './app-settings-kit';
import { useTranslation } from 'react-i18next';

const WEREAD_API_KEY_HELP_URL = 'https://yomitomo.app/docs/weread-api-key/';

export function WeReadSettingsPanel() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<WeReadSettings>({
    configured: false,
    openMethod: 'deeplink',
  });
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [revealedStoredApiKey, setRevealedStoredApiKey] = useState('');
  const [revealLoading, setRevealLoading] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState('');
  const [openMethodSaveError, setOpenMethodSaveError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [openMethodSaveState, setOpenMethodSaveState] = useState<SaveState>('idle');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const revealRequestRef = useRef(0);
  const displayedApiKey = apiKey || (apiKeyVisible ? revealedStoredApiKey : '');

  useEffect(() => {
    let cancelled = false;
    void window.yomitomoDesktop
      ?.getWeReadState?.()
      .then((state) => {
        if (cancelled) return;
        setSettings(state.settings);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings() {
    if (!window.yomitomoDesktop) return;
    if (!apiKey.trim()) return;
    setSaveState('saving');
    setApiKeyMessage('');
    try {
      const state = await window.yomitomoDesktop.saveWeReadSettings({
        apiKey,
        openMethod: settings.openMethod,
      });
      setSettings(state.settings);
      setApiKey('');
      setApiKeyVisible(false);
      setRevealedStoredApiKey('');
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    } catch (error) {
      setApiKeyMessage(settingsSaveErrorMessage(error, t));
      setSaveState('error');
    }
  }

  async function removeStoredApiKey() {
    if (!window.yomitomoDesktop || !settings.configured) return;
    setSaveState('saving');
    setApiKeyMessage('');
    try {
      const state = await window.yomitomoDesktop.saveWeReadSettings({
        removeApiKey: true,
        openMethod: settings.openMethod,
      });
      setSettings(state.settings);
      setApiKey('');
      setApiKeyVisible(false);
      setRevealedStoredApiKey('');
      setTestState('idle');
      setTestMessage('');
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    } catch (error) {
      setApiKeyMessage(settingsSaveErrorMessage(error, t));
      setSaveState('error');
    }
  }

  async function testConnection() {
    if (!window.yomitomoDesktop) return;
    setTestState('testing');
    setTestMessage('');
    try {
      const result = await window.yomitomoDesktop.testWeRead(apiKey);
      setTestState(result.ok ? 'success' : 'error');
      setTestMessage(
        result.ok ? t('settings.weread.testSuccess') : wereadResultMessage(result.message, t),
      );
      const state = await window.yomitomoDesktop.getWeReadState();
      setSettings(state.settings);
    } catch (error) {
      setTestState('error');
      setTestMessage(wereadErrorMessage(error, t));
    } finally {
      window.setTimeout(() => setTestState('idle'), 1400);
    }
  }

  async function toggleApiKeyVisible() {
    if (apiKeyVisible) {
      revealRequestRef.current += 1;
      setApiKeyVisible(false);
      setRevealedStoredApiKey('');
      setRevealLoading(false);
      setApiKeyMessage('');
      return;
    }

    if (apiKey || !settings.configured) {
      setApiKeyVisible(true);
      return;
    }

    setRevealLoading(true);
    setApiKeyMessage('');
    const requestId = ++revealRequestRef.current;
    try {
      const storedApiKey = (await window.yomitomoDesktop?.readWeReadApiKey?.()) || '';
      if (requestId !== revealRequestRef.current) return;
      setRevealedStoredApiKey(storedApiKey);
      setApiKeyVisible(true);
      if (!storedApiKey) setApiKeyMessage(t('settings.weread.noStoredApiKey'));
    } catch {
      if (requestId !== revealRequestRef.current) return;
      setApiKeyMessage(t('settings.weread.readStoredApiKeyFailed'));
    } finally {
      if (requestId === revealRequestRef.current) setRevealLoading(false);
    }
  }

  async function saveOpenMethod(openMethod: WeReadOpenMethod) {
    if (!window.yomitomoDesktop) return;
    const previous = settings.openMethod;
    setSettings((current) => ({ ...current, openMethod }));
    setOpenMethodSaveState('saving');
    setOpenMethodSaveError('');
    try {
      const state = await window.yomitomoDesktop.saveWeReadSettings({ openMethod });
      setSettings(state.settings);
      setOpenMethodSaveState('saved');
      window.setTimeout(() => setOpenMethodSaveState('idle'), 1200);
    } catch (error) {
      setSettings((current) => ({ ...current, openMethod: previous }));
      setOpenMethodSaveError(settingsSaveErrorMessage(error, t));
      setOpenMethodSaveState('error');
    }
  }

  async function openWeReadApiKeyHelp() {
    const openUrl = window.yomitomoDesktop?.openUrl;
    if (!openUrl) {
      window.open(WEREAD_API_KEY_HELP_URL, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      await openUrl(WEREAD_API_KEY_HELP_URL);
    } catch {
      window.open(WEREAD_API_KEY_HELP_URL, '_blank', 'noopener,noreferrer');
    }
  }

  const canSave = saveState !== 'saving' && Boolean(apiKey.trim());
  const canTest = testState !== 'testing' && (Boolean(apiKey.trim()) || settings.configured);
  const canRemove = saveState !== 'saving' && settings.configured;
  const saveLabel =
    saveState === 'saving'
      ? t('settings.weread.saving')
      : saveState === 'saved'
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
              <CircleCheck size={14} />
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
                setApiKey(event.target.value);
                setRevealedStoredApiKey('');
                setSaveState('idle');
                setApiKeyMessage('');
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
              {apiKeyVisible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>
        <div className="settings-card-actions weread-api-key-actions">
          <Button
            className={
              saveState === 'saved'
                ? 'action-button save-action is-saved'
                : 'action-button save-action'
            }
            disabled={!canSave}
            type="button"
            onClick={saveSettings}
          >
            {saveState === 'saved' ? <Check size={16} /> : <Save size={16} />}
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
              <Check size={15} />
            ) : testState === 'error' ? (
              <X size={15} />
            ) : (
              <RefreshCw size={15} />
            )}
            {testLabel}
          </Button>
          <Button
            className="action-button weread-remove-action"
            disabled={!canRemove}
            type="button"
            variant="secondary"
            onClick={removeStoredApiKey}
          >
            <Trash2 size={15} />
            {t('settings.weread.remove')}
          </Button>
          <button className="weread-help-link" type="button" onClick={openWeReadApiKeyHelp}>
            <Info size={15} />
            {t('settings.weread.help')}
            <ExternalLink size={13} />
          </button>
        </div>
        {saveState === 'error' || apiKeyMessage ? (
          <p className="settings-error-text">{apiKeyMessage || t('settings.weread.saveFailed')}</p>
        ) : testState === 'error' && testMessage ? (
          <p className="settings-error-text">{testMessage}</p>
        ) : null}
      </SettingsGroup>

      <SettingsGroup
        label={t('settings.weread.openMethodGroup')}
        aside={
          <AutoSaveStatus
            error={openMethodSaveError}
            state={openMethodSaveState}
            onRetry={() => void saveOpenMethod(settings.openMethod)}
          />
        }
        cardProps={{ role: 'radiogroup', 'aria-label': t('settings.weread.openMethodAria') }}
      >
        {wereadOpenMethods.map((option) => {
          const active = settings.openMethod === option.value;
          const label = t(option.labelKey);
          const description = t(option.descriptionKey);
          return (
            <button
              aria-checked={active}
              className="settings-row settings-row-button"
              key={option.value}
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
              <div className="settings-row-copy">
                <strong>{label}</strong>
                <p>{description}</p>
              </div>
            </button>
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
