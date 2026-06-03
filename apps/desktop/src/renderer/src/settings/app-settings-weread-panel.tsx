import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  RefreshCw,
  Save,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import type { WeReadOpenMethod, WeReadSettings } from '@yomitomo/shared';
import { Field, PanelHeader } from '../shell/app-ui';
import { AutoSaveStatus } from './app-settings-save-status';
import type { SaveState } from '../shell/app-types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const WEREAD_API_KEY_HELP_URL = 'https://yomitomo.app/docs/weread-api-key/';

export function WeReadSettingsPanel() {
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
      setApiKeyMessage(settingsSaveErrorMessage(error));
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
      setApiKeyMessage(settingsSaveErrorMessage(error));
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
      setTestMessage(result.message);
      const state = await window.yomitomoDesktop.getWeReadState();
      setSettings(state.settings);
    } catch (error) {
      setTestState('error');
      setTestMessage(wereadErrorMessage(error));
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
      if (!storedApiKey) setApiKeyMessage('没有读取到已保存的 API Key');
    } catch {
      if (requestId !== revealRequestRef.current) return;
      setApiKeyMessage('读取已保存的 API Key 失败');
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
      setOpenMethodSaveError(settingsSaveErrorMessage(error));
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
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';
  const testLabel =
    testState === 'testing'
      ? '测试中'
      : testState === 'success'
        ? '测试成功'
        : testState === 'error'
          ? '测试失败'
          : '测试连接';

  return (
    <div className="settings-panel weread-settings-panel">
      <PanelHeader
        icon={<Smartphone size={20} />}
        title="微信读书"
        description="同步微信读书中的划线、想法和阅读进度。"
      />
      <div className="settings-form-grid max-w-3xl">
        <Field
          id="weread-api-key"
          className="col-span-2"
          label="API Key"
          description={
            settings.configured
              ? '已保存到系统安全凭据库。输入新 API Key 并保存可替换当前配置。'
              : 'API Key 会保存到系统安全凭据库，不会明文写入本地数据库。'
          }
        >
          <div className="weread-api-key-field">
            <Input
              id="weread-api-key"
              className="pr-12"
              type={apiKeyVisible ? 'text' : 'password'}
              value={displayedApiKey}
              placeholder={settings.configured ? '已配置，输入新 Key 后保存' : 'wrk-...'}
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
              aria-label={apiKeyVisible ? '隐藏 API Key' : '显示 API Key'}
              className="secret-toggle"
              disabled={revealLoading}
              type="button"
              onClick={toggleApiKeyVisible}
            >
              {apiKeyVisible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <div className="weread-api-key-actions">
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
              移除
            </Button>
          </div>
          <button className="weread-help-link" type="button" onClick={openWeReadApiKeyHelp}>
            <Info size={15} />
            如何获取微信读书 API KEY
            <ExternalLink size={13} />
          </button>
          {saveState === 'error' || apiKeyMessage ? (
            <p className="shortcut-tips is-error">{apiKeyMessage || '保存失败，请重试。'}</p>
          ) : testState === 'error' && testMessage ? (
            <p className="shortcut-tips is-error">{testMessage}</p>
          ) : null}
        </Field>
        <Field
          id="weread-open-method"
          className="col-span-2"
          label="默认打开方式"
          description="网页版打开到章节；App 可打开到对应划线或想法，需本机已安装微信读书。"
        >
          <div className="weread-open-method-save-status">
            <AutoSaveStatus
              error={openMethodSaveError}
              state={openMethodSaveState}
              onRetry={() => void saveOpenMethod(settings.openMethod)}
            />
          </div>
          <div className="weread-open-methods" role="radiogroup" aria-label="微信读书默认打开方式">
            {wereadOpenMethods.map((option) => (
              <button
                aria-checked={settings.openMethod === option.value}
                className={settings.openMethod === option.value ? 'is-active' : undefined}
                key={option.value}
                type="button"
                role="radio"
                onClick={() => {
                  if (settings.openMethod === option.value) return;
                  void saveOpenMethod(option.value);
                }}
              >
                {settings.openMethod === option.value ? <em>当前使用</em> : null}
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}

export function DataSourcesPanel() {
  return (
    <div className="data-sources-panel">
      <WeReadSettingsPanel />
      <p className="data-sources-coming-soon" role="note">
        更多来源，敬请期待
      </p>
    </div>
  );
}

const wereadOpenMethods: Array<{
  value: WeReadOpenMethod;
  label: string;
  description: string;
}> = [
  {
    value: 'deeplink',
    label: '打开微信读书 App',
    description: '需要已安装 App，可定位到对应划线或想法。',
  },
  {
    value: 'web',
    label: '使用网页版',
    description: '无需安装 App，只能打开到对应章节。',
  },
];

function settingsSaveErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return `保存失败：${error.message}`;
  return '保存失败，请重试。';
}

function wereadErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '微信读书连接测试失败';
}
