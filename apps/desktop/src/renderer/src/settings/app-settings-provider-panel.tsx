import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Check, KeyRound, Save, SearchCheck, ShieldCheck, Zap, X } from 'lucide-react';
import type { AppSettings, AssistantExecutionMode, LlmProvider } from '@yomitomo/shared';
import type { ProviderDraft } from './app-settings';
import { PanelHeader } from '../shell/app-ui';
import { providerLogoMap } from './app-settings-provider-assets';
import { ProviderForm } from './app-settings-provider-form';
import { ProviderList } from './app-settings-provider-list';
import type { SaveState } from '../shell/app-types';
import { AutoSaveStatus } from './app-settings-save-status';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

type ProviderTestStatus = 'idle' | 'testing' | 'success' | 'error';

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
  saveError,
  routeSaveState,
  routeSaveError,
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
  onSave: () => Promise<boolean | void> | boolean | void;
  saveState: SaveState;
  saveError?: string;
  routeSaveState: SaveState;
  routeSaveError?: string;
  onRouteSave: (draft?: AppSettings) => void;
  onSelect: (provider: LlmProvider) => void;
  onTest: (draft: ProviderDraft) => Promise<void> | void;
}) {
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<ProviderTestStatus>('idle');
  const usedProviderIds = new Set(
    [settingsDraft.readingAssistantProviderId, settingsDraft.reviewAssistantProviderId].filter(
      (id): id is string => Boolean(id),
    ),
  );

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
    setTestStatus('testing');
    void Promise.resolve(onTest(providerDraft)).catch(() => setTestStatus('error'));
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
    providerEditorOpen && typeof document !== 'undefined'
      ? createPortal(
          <div className="provider-editor-dialog-overlay" role="presentation">
            <section
              aria-labelledby="provider-editor-dialog-title"
              aria-modal="true"
              className="provider-editor-dialog"
              role="dialog"
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
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="settings-panel settings-model-panel">
        <PanelHeader
          icon={<KeyRound size={20} />}
          title="模型与路由"
          description="为伴读任务分配默认模型，并管理模型服务商配置。"
        />
        <TaskProviderRoutes
          canSave={canSaveRoutes}
          providers={providers}
          saveError={routeSaveError}
          saveState={routeSaveState}
          settingsDraft={settingsDraft}
          onChange={onRouteChange}
          onSave={onRouteSave}
        />
        <ProviderList
          providers={providers}
          usedProviderIds={usedProviderIds}
          onCreate={createProvider}
          onDelete={deleteProvider}
          onEdit={selectProvider}
        />
      </div>
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
  onChange,
  onCancel,
  onSave,
  onTest,
}: {
  draft: ProviderDraft;
  saveLabel: string;
  saveError?: string;
  saveState: SaveState;
  testStatus: ProviderTestStatus;
  titleId?: string;
  canSave: boolean;
  onChange: (draft: ProviderDraft) => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
  onTest: (draft: ProviderDraft) => void;
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
          <span className="provider-test-control">
            <Button
              className="action-button test-action"
              disabled={testStatus === 'testing'}
              variant="secondary"
              type="button"
              onClick={() => onTest(draft)}
            >
              {testStatus === 'testing' ? '测试中' : '测试'}
            </Button>
            {testResultIcon}
          </span>
          <Button className="action-button" type="button" variant="secondary" onClick={onCancel}>
            取消
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
          {saveError || '保存失败，请重试。'}
        </p>
      ) : null}
      <ProviderForm draft={draft} onChange={onChange} />
    </>
  );
}

const taskRouteOptions: Array<{
  key: keyof Pick<AppSettings, 'readingAssistantProviderId' | 'reviewAssistantProviderId'>;
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
    description: '用于阅读材料的证据、逻辑和表达复核。',
    icon: <ShieldCheck size={18} />,
  },
];

const assistantExecutionModeOptions: Array<{
  value: AssistantExecutionMode;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'fast_response',
    title: '快速回应',
    description: '优先低延迟和低成本，一次请求完成回应。',
    icon: <Zap size={18} />,
  },
  {
    value: 'deep_verification',
    title: '深入查证',
    description: '允许助手调用阅读工具，多步收集证据后再行动。',
    icon: <SearchCheck size={18} />,
  },
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
  const hasProviders = providers.length > 0;

  return (
    <section className="task-route-panel" aria-labelledby="task-route-title">
      <div className="task-route-header">
        <div>
          <h3 id="task-route-title">任务路由</h3>
          <p>
            {hasProviders
              ? '为不同伴读任务分配默认模型。'
              : '先新增模型供应商，再为伴读任务分配默认模型。'}
          </p>
        </div>
        <AutoSaveStatus
          error={saveError}
          state={saveState}
          onRetry={canSave ? () => onSave() : undefined}
        />
      </div>
      {!hasProviders ? (
        <p className="task-route-empty-note">
          当前还没有可选供应商。新增并保存供应商后，这里会开放选择。
        </p>
      ) : null}
      <div className="task-route-list">
        <div className="task-route-row">
          <div className="task-route-copy">
            <span className="task-route-icon">
              <SearchCheck size={18} />
            </span>
            <div>
              <strong>助手执行模式</strong>
              <p>全局影响阅读批注、追问和共读任务。</p>
            </div>
          </div>
          <div className="task-route-mode-group" role="radiogroup" aria-label="助手执行模式">
            {assistantExecutionModeOptions.map((option) => {
              const active =
                (settingsDraft.assistantExecutionMode || 'fast_response') === option.value;
              return (
                <button
                  aria-checked={active}
                  className={active ? 'task-route-mode is-active' : 'task-route-mode'}
                  key={option.value}
                  role="radio"
                  type="button"
                  onClick={() => {
                    const nextDraft = {
                      ...settingsDraft,
                      assistantExecutionMode: option.value,
                    };
                    onChange(nextDraft);
                    onSave(nextDraft);
                  }}
                >
                  <span>{option.icon}</span>
                  <strong>{option.title}</strong>
                  <em>{option.description}</em>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="task-route-list">
        {taskRouteOptions.map((option) => (
          <div className="task-route-row" key={option.key}>
            <div className="task-route-copy">
              <span className="task-route-icon">{option.icon}</span>
              <div>
                <strong>{option.title}</strong>
                <p>
                  {hasProviders
                    ? option.description
                    : `新增供应商后，可把它分配给${option.title}。`}
                </p>
              </div>
            </div>
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
                aria-label={`${option.title}供应商`}
                className="task-route-select-trigger"
              >
                <SelectValue placeholder={hasProviders ? '选择供应商' : '先新增供应商'} />
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
