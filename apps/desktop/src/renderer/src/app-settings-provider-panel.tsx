import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Bot,
  Check,
  Eye,
  EyeOff,
  Keyboard,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { AppSettings, LlmProvider, ProviderType } from '@yomitomo/shared';
import { providerPresets, reasoningEffortOptions } from '@yomitomo/shared';
import { type ProviderDraft } from './app-settings';
import anthropicLogo from './assets/providers/anthropic.png';
import bailianLogo from './assets/providers/bailian.png';
import deepseekLogo from './assets/providers/deepseek.png';
import googleLogo from './assets/providers/google.png';
import minimaxLogo from './assets/providers/minimax.png';
import mimoLogo from './assets/providers/mimo.svg';
import moonshotLogo from './assets/providers/moonshot.webp';
import openaiLogo from './assets/providers/openai.png';
import volcengineLogo from './assets/providers/volcengine.png';
import zhipuLogo from './assets/providers/zhipu.png';
import { Field, PanelHeader } from './app-ui';
import type { SaveState } from './app-types';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';

const PROVIDER_EDITOR_COMPACT_WIDTH = 900;
type ProviderTestStatus = 'idle' | 'testing' | 'success' | 'error';

const providerLogoMap: Record<string, string> = {
  'anthropic.png': anthropicLogo,
  'bailian.png': bailianLogo,
  'deepseek.png': deepseekLogo,
  'google.png': googleLogo,
  'minimax.png': minimaxLogo,
  'mimo.svg': mimoLogo,
  'moonshot.webp': moonshotLogo,
  'openai.png': openaiLogo,
  'volcengine.png': volcengineLogo,
  'zhipu.png': zhipuLogo,
};

export function ProviderSettings({
  draft,
  settingsDraft,
  providers,
  selectedId,
  testState,
  canSave,
  canSaveRoutes,
  onChange,
  onRouteChange,
  onCreate,
  onDelete,
  onSave,
  saveState,
  routeSaveState,
  onRouteSave,
  onSelect,
  onTest,
}: {
  draft: ProviderDraft;
  settingsDraft: AppSettings;
  providers: LlmProvider[];
  selectedId: string | null;
  testState: string;
  canSave: boolean;
  canSaveRoutes: boolean;
  onChange: (draft: ProviderDraft) => void;
  onRouteChange: (draft: AppSettings) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  saveState: SaveState;
  routeSaveState: SaveState;
  onRouteSave: () => void;
  onSelect: (provider: LlmProvider) => void;
  onTest: (id: string) => Promise<void> | void;
}) {
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [compactProviderEditor, setCompactProviderEditor] = useState(false);
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<ProviderTestStatus>('idle');
  const usedProviderIds = new Set(
    [
      settingsDraft.readingAssistantProviderId,
      settingsDraft.reviewAssistantProviderId,
      settingsDraft.readingNoteProviderId,
    ].filter(Boolean),
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width || panel.getBoundingClientRect().width;
      setCompactProviderEditor(width <= PROVIDER_EDITOR_COMPACT_WIDTH);
    });

    setCompactProviderEditor(panel.getBoundingClientRect().width <= PROVIDER_EDITOR_COMPACT_WIDTH);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (providerEditorOpen && !compactProviderEditor) setProviderEditorOpen(false);
  }, [compactProviderEditor, providerEditorOpen]);

  useEffect(() => {
    setTestStatus('idle');
  }, [selectedId]);

  useEffect(() => {
    if (!testState) return;
    if (testState === '测试中...') {
      setTestStatus('testing');
      return;
    }
    if (testStatus !== 'testing') return;
    if (testState.startsWith('连通成功')) {
      setTestStatus('success');
      return;
    }
    if (testState.startsWith('连通失败')) {
      setTestStatus('error');
    }
  }, [testState, testStatus]);

  useEffect(() => {
    if (!providerEditorOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setProviderEditorOpen(false);
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [providerEditorOpen]);

  function selectProvider(provider: LlmProvider) {
    onSelect(provider);
    if (compactProviderEditor) setProviderEditorOpen(true);
  }

  function createProvider() {
    onCreate();
    if (compactProviderEditor) setProviderEditorOpen(true);
  }

  function deleteProvider(id: string) {
    onDelete(id);
    setProviderEditorOpen(false);
  }

  function testProvider(id: string) {
    setTestStatus('testing');
    void Promise.resolve(onTest(id)).catch(() => setTestStatus('error'));
  }

  const editorDialog =
    providerEditorOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="provider-editor-dialog-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setProviderEditorOpen(false);
            }}
          >
            <section
              aria-labelledby="provider-editor-dialog-title"
              aria-modal="true"
              className="provider-editor-dialog"
              role="dialog"
            >
              <button
                aria-label="关闭供应商编辑"
                className="provider-editor-close"
                type="button"
                onClick={() => setProviderEditorOpen(false)}
              >
                <X size={18} />
              </button>
              <ProviderEditorContent
                draft={draft}
                saveLabel={saveLabel}
                saveState={saveState}
                testStatus={testStatus}
                titleId="provider-editor-dialog-title"
                canSave={canSave}
                onChange={onChange}
                onDelete={deleteProvider}
                onSave={onSave}
                onTest={testProvider}
              />
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="settings-panel settings-model-panel" ref={panelRef}>
        <PanelHeader
          icon={<KeyRound size={20} />}
          title="模型与路由"
          description="为伴读任务分配默认模型，并管理模型服务商配置。"
        />
        <TaskProviderRoutes
          canSave={canSaveRoutes}
          providers={providers}
          saveState={routeSaveState}
          settingsDraft={settingsDraft}
          onChange={onRouteChange}
          onSave={onRouteSave}
        />
        <div className="settings-detail-grid">
          <ConfigList title="模型供应商" onCreate={createProvider}>
            {providers.map((provider) => (
              <button
                className={
                  provider.id === selectedId
                    ? 'config-list-item is-plain is-active'
                    : 'config-list-item is-plain'
                }
                key={provider.id}
                type="button"
                onClick={() => selectProvider(provider)}
              >
                {usedProviderIds.has(provider.id) ? (
                  <span className="provider-used-label">已使用</span>
                ) : null}
                <img
                  className="provider-logo"
                  src={
                    providerLogoMap[provider.logo || 'anthropic.png'] ||
                    providerLogoMap['anthropic.png']
                  }
                  alt=""
                />
                <span className="min-w-0">
                  <strong>{provider.name}</strong>
                  <span>
                    {provider.type} · {provider.modelName}
                  </span>
                </span>
              </button>
            ))}
          </ConfigList>
          <section className="detail-pane">
            <ProviderEditorContent
              draft={draft}
              saveLabel={saveLabel}
              saveState={saveState}
              testStatus={testStatus}
              canSave={canSave}
              onChange={onChange}
              onDelete={onDelete}
              onSave={onSave}
              onTest={testProvider}
            />
          </section>
        </div>
      </div>
      {editorDialog}
    </>
  );
}

function ProviderEditorContent({
  draft,
  saveLabel,
  saveState,
  testStatus,
  titleId,
  canSave,
  onChange,
  onDelete,
  onSave,
  onTest,
}: {
  draft: ProviderDraft;
  saveLabel: string;
  saveState: SaveState;
  testStatus: ProviderTestStatus;
  titleId?: string;
  canSave: boolean;
  onChange: (draft: ProviderDraft) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  onTest: (id: string) => void;
}) {
  const testResultIcon =
    testStatus === 'success' || testStatus === 'error' ? (
      <span
        aria-label={testStatus === 'success' ? '测试成功' : '测试失败'}
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
          <h3 id={titleId}>{draft.id ? '编辑供应商' : '新增供应商'}</h3>
          <p>管理模型服务商、API Key、Base URL 和可用模型。</p>
        </div>
        <div className="flex gap-2">
          {draft.id ? (
            <span className="provider-test-control">
              <Button
                className="action-button test-action"
                variant="secondary"
                type="button"
                onClick={() => onTest(draft.id!)}
              >
                {testStatus === 'testing' ? '测试中' : '测试'}
              </Button>
              {testResultIcon}
            </span>
          ) : null}
          {draft.id ? (
            <Button
              className="action-button danger-action"
              variant="destructive"
              size="icon"
              type="button"
              onClick={() => onDelete(draft.id!)}
            >
              <Trash2 size={15} />
            </Button>
          ) : null}
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
      <ProviderForm draft={draft} onChange={onChange} />
    </>
  );
}

const taskRouteOptions: Array<{
  key: keyof Pick<
    AppSettings,
    'readingAssistantProviderId' | 'reviewAssistantProviderId' | 'readingNoteProviderId'
  >;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'readingAssistantProviderId',
    title: '阅读理解助手',
    description: '用于阅读器批注、追问和理解型对话。',
    icon: <BookOpen size={18} />,
  },
  {
    key: 'reviewAssistantProviderId',
    title: '深度审阅助手',
    description: '用于审核读后笔记的证据、逻辑和表达质量。',
    icon: <ShieldCheck size={18} />,
  },
  {
    key: 'readingNoteProviderId',
    title: '读后笔记助手',
    description: '用于生成审议报告和读后笔记正文。',
    icon: <Bot size={18} />,
  },
];

function TaskProviderRoutes({
  providers,
  settingsDraft,
  canSave,
  saveState,
  onChange,
  onSave,
}: {
  providers: LlmProvider[];
  settingsDraft: AppSettings;
  canSave: boolean;
  saveState: SaveState;
  onChange: (draft: AppSettings) => void;
  onSave: () => void;
}) {
  const saveLabel =
    saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存任务路由';

  return (
    <section className="task-route-panel" aria-labelledby="task-route-title">
      <div className="task-route-header">
        <div>
          <h3 id="task-route-title">任务路由</h3>
          <p>为不同伴读任务分配默认模型。</p>
        </div>
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
      <div className="task-route-list">
        {taskRouteOptions.map((option) => (
          <div className="task-route-row" key={option.key}>
            <div className="task-route-copy">
              <span className="task-route-icon">{option.icon}</span>
              <div>
                <strong>{option.title}</strong>
                <p>{option.description}</p>
              </div>
            </div>
            <Select
              disabled={providers.length === 0}
              value={settingsDraft[option.key] || ''}
              onValueChange={(providerId) =>
                onChange({ ...settingsDraft, [option.key]: providerId })
              }
            >
              <SelectTrigger
                aria-label={`${option.title}供应商`}
                className="task-route-select-trigger"
              >
                <SelectValue placeholder="选择供应商" />
              </SelectTrigger>
              <SelectContent className="theme-select-content provider-select-content">
                <SelectGroup>
                  {providers.map((provider) => (
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
                          <strong>{provider.name}</strong>
                          <span>{provider.modelName}</span>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfigList({
  title,
  children,
  controls,
  empty,
  onCreate,
}: {
  title: string;
  children: React.ReactNode;
  controls?: React.ReactNode;
  empty?: React.ReactNode;
  onCreate?: () => void;
}) {
  const hasItems = React.Children.count(children) > 0;

  return (
    <aside className="config-list">
      <div className="config-list-header">
        <div className="config-list-title">{title}</div>
        {onCreate ? (
          <Button
            className="action-button create-action"
            size="sm"
            type="button"
            onClick={onCreate}
          >
            <Plus size={16} />
            新增
          </Button>
        ) : null}
      </div>
      {controls}
      <div className="config-list-scroll">{hasItems ? children : empty}</div>
    </aside>
  );
}

function useProviderModelOptions(draft: ProviderDraft, onChange: (draft: ProviderDraft) => void) {
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [modelNotice, setModelNotice] = useState('');
  const selectedPreset = providerPresets.find((preset) => preset.id === draft.presetId);
  const visibleModels =
    modelOptions.length > 0 ? modelOptions : draft.modelNames || selectedPreset?.modelNames || [];

  function clearModelStatus() {
    setModelOptions([]);
    setModelError('');
    setModelNotice('');
  }

  async function fetchModels() {
    const fallbackModels = selectedPreset?.modelNames || [];
    if (!window.yomitomoDesktop) return;
    if (!draft.apiKey?.trim() && !draft.hasApiKey) {
      setModelError('');
      setModelNotice(
        fallbackModels.length > 0
          ? '已显示预设模型；填写 API Key 后可获取实时列表'
          : '填写 API Key 后可获取模型列表',
      );
      if (fallbackModels.length > 0) {
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelName: fallbackModels.includes(draft.modelName || '')
            ? draft.modelName
            : fallbackModels[0],
          modelNames: fallbackModels,
        });
      }
      return;
    }
    setModelLoading(true);
    setModelError('');
    setModelNotice('');
    try {
      const models = await window.yomitomoDesktop.listProviderModels(draft);
      const names = models.map((model) => model.id).filter(Boolean);
      setModelOptions(names);
      setModelNotice(names.length > 0 ? `已获取 ${names.length} 个模型` : '未获取到模型列表');
      if (names.length > 0) {
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelName: names.includes(draft.modelName || '') ? draft.modelName : names[0],
          modelNames: names,
        });
      } else {
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelNames: [],
        });
      }
    } catch (error) {
      setModelError(error instanceof Error ? error.message : '获取模型列表失败');
      setModelNotice(fallbackModels.length > 0 ? '已显示预设模型作为候选' : '');
    } finally {
      setModelLoading(false);
    }
  }

  return {
    fetchModels,
    clearModelStatus,
    modelError,
    modelLoading,
    modelNotice,
    visibleModels,
  };
}

export function ProviderForm({
  draft,
  onChange,
  selectContentClassName = 'theme-select-content',
  showReasoning = true,
}: {
  draft: ProviderDraft;
  onChange: (draft: ProviderDraft) => void;
  selectContentClassName?: string;
  showReasoning?: boolean;
}) {
  const modelInputMode = draft.modelInputMode || 'list';
  const isCustomModel = modelInputMode === 'custom';
  const { fetchModels, clearModelStatus, modelError, modelLoading, modelNotice, visibleModels } =
    useProviderModelOptions(draft, onChange);

  function applyPreset(presetId: string) {
    const preset = providerPresets.find((item) => item.id === presetId);
    if (!preset) return;
    clearModelStatus();
    onChange({
      ...draft,
      presetId: preset.id,
      name: preset.name,
      type: preset.type,
      logo: preset.logo,
      baseUrl: preset.baseUrl,
      modelName: preset.modelName,
      modelNames: preset.modelNames,
      modelInputMode: 'list',
      reasoningEffort: draft.reasoningEffort || 'none',
    });
  }

  function useCustomModel() {
    clearModelStatus();
    onChange({
      ...draft,
      modelInputMode: 'custom',
      modelNames: undefined,
    });
  }

  return (
    <div className="settings-form-grid">
      <Field id="provider-preset" className="col-span-2" label="预设服务商">
        <Select value={draft.presetId || ''} onValueChange={applyPreset}>
          <SelectTrigger
            id="provider-preset"
            aria-labelledby="provider-preset-label"
            className="provider-select-trigger"
          >
            <SelectValue placeholder="选择服务商" />
          </SelectTrigger>
          <SelectContent className={selectContentClassName}>
            <SelectGroup>
              {providerPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <span className="provider-preset-item">
                    <img
                      className="provider-preset-logo"
                      src={providerLogoMap[preset.logo]}
                      alt=""
                    />
                    {preset.name}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field id="provider-name" label="名称">
        <Input
          id="provider-name"
          name="provider-name"
          autoComplete="off"
          value={draft.name || ''}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </Field>
      <Field id="provider-type" label="API 类型">
        <Select
          value={draft.type || 'anthropic'}
          onValueChange={(value) =>
            onChange({ ...draft, type: value as ProviderType, presetId: undefined })
          }
        >
          <SelectTrigger id="provider-type" aria-labelledby="provider-type-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContentClassName}>
            <SelectGroup>
              <SelectItem value="openai-chat">OpenAI Chat</SelectItem>
              <SelectItem value="openai-responses">OpenAI Responses</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field id="provider-base-url" label="Base URL">
        <Input
          id="provider-base-url"
          name="provider-base-url"
          type="url"
          autoComplete="off"
          value={draft.baseUrl || ''}
          onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })}
        />
      </Field>
      <Field id="provider-model" label="模型">
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
            <Select
              disabled={visibleModels.length === 0}
              value={visibleModels.includes(draft.modelName || '') ? draft.modelName : ''}
              onValueChange={(modelName) => onChange({ ...draft, modelName })}
            >
              <SelectTrigger id="provider-model" aria-labelledby="provider-model-label">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent className={selectContentClassName}>
                <SelectGroup>
                  {visibleModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <Button
            className={
              isCustomModel
                ? 'action-button provider-model-mode-button is-active'
                : 'action-button provider-model-mode-button'
            }
            type="button"
            variant="secondary"
            onClick={useCustomModel}
          >
            <Keyboard size={15} />
            自定义
          </Button>
          <Button
            className="action-button"
            type="button"
            variant="secondary"
            disabled={modelLoading}
            onClick={fetchModels}
          >
            <RefreshCw size={15} />
            {modelLoading ? '获取中' : '获取'}
          </Button>
        </div>
        {modelNotice ? <p className="field-inline-note">{modelNotice}</p> : null}
        {modelError ? <p className="field-inline-error">{modelError}</p> : null}
      </Field>
      <Field id="provider-api-key" className="col-span-2" label="API Key">
        <SecretInput
          id="provider-api-key"
          hasStoredValue={Boolean(draft.hasApiKey)}
          value={draft.apiKey || ''}
          onChange={(apiKey) => onChange({ ...draft, apiKey, removeApiKey: false })}
          onRemove={() => onChange({ ...draft, apiKey: '', hasApiKey: false, removeApiKey: true })}
        />
      </Field>
      {showReasoning ? (
        <Field id="provider-reasoning" className="col-span-2" label="思考强度">
          <Select
            value={draft.reasoningEffort || 'none'}
            onValueChange={(reasoningEffort) =>
              onChange({
                ...draft,
                reasoningEffort: reasoningEffort as LlmProvider['reasoningEffort'],
              })
            }
          >
            <SelectTrigger id="provider-reasoning" aria-labelledby="provider-reasoning-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentClassName}>
              <SelectGroup>
                {reasoningEffortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
    </div>
  );
}

function SecretInput({
  hasStoredValue,
  id,
  value,
  onChange,
  onRemove,
}: {
  hasStoredValue?: boolean;
  id: string;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="secret-input">
      <div className="relative">
        <Input
          id={id}
          className="pr-12"
          name={id}
          autoComplete="off"
          placeholder={hasStoredValue ? '已安全保存，输入新 Key 会覆盖' : undefined}
          spellCheck={false}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="secret-toggle"
          type="button"
          aria-label={visible ? '隐藏 API Key' : '显示 API Key'}
          onClick={() => setVisible((next) => !next)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {hasStoredValue && !value ? (
        <Button className="secret-remove" type="button" variant="secondary" onClick={onRemove}>
          <Trash2 size={14} />
          移除已保存的 Key
        </Button>
      ) : null}
    </div>
  );
}
