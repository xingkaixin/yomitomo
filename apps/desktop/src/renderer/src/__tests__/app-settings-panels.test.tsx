// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgentForm,
  AgentSettings,
  DataManagementSettings,
  GeneralSettings,
  ProviderForm,
  ProviderSettings,
  ShortcutSettings,
  SettingsSectionShell,
  UserProfileSettingsDialog,
  WeReadSettingsPanel,
} from '../settings/app-settings-panels';
import { defaultUser, emptyProvider, emptyStore, type AgentDraft } from '../settings/app-settings';
import type { Agent, AppSettings, LlmProvider } from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';
import { playAppSoundEffect } from '../sound/app-sound-effects';

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
}));

const localStorageStore: Record<string, string> = {};

Object.defineProperty(window, 'localStorage', {
  value: {
    clear: () => {
      for (const key of Object.keys(localStorageStore)) delete localStorageStore[key];
    },
    getItem: (key: string) => localStorageStore[key] ?? null,
    removeItem: (key: string) => {
      delete localStorageStore[key];
    },
    setItem: (key: string, value: string) => {
      localStorageStore[key] = value;
    },
  },
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  window.localStorage.clear();
  vi.clearAllMocks();
});

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

describe('SettingsSectionShell', () => {
  it('keeps section navigation labels concise', () => {
    render(
      <SettingsSectionShell activeSection="collection" onSectionChange={vi.fn()}>
        <div>content</div>
      </SettingsSectionShell>,
    );

    const nav = screen.getByRole('navigation', { name: '设置分类' });
    expect(within(nav).getByRole('button', { name: '通用' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(nav).queryByText('保存原文图片与阅读库入口显示偏好。')).toBeNull();
    expect(within(nav).queryByText('分配任务模型，并维护模型供应商。')).toBeNull();
  });

  it('shows diagnostics sections only in developer mode', () => {
    const { rerender } = render(
      <SettingsSectionShell activeSection="about" onSectionChange={vi.fn()}>
        <div>content</div>
      </SettingsSectionShell>,
    );

    expect(screen.queryByText('助手调用链路')).toBeNull();

    rerender(
      <SettingsSectionShell activeSection="about" developerModeEnabled onSectionChange={vi.fn()}>
        <div>content</div>
      </SettingsSectionShell>,
    );

    expect(screen.getByText('助手调用链路')).toBeTruthy();
  });
});

function installDesktopDataApi() {
  const retainedStore = { ...emptyStore, settings: { logRetentionDays: 15 } };
  const restoredStore = { ...emptyStore, settings: { logRetentionDays: 90 } };
  const desktop = {
    getDataManagementPaths: vi.fn().mockResolvedValue({
      dataDir: '/tmp/yomitomo',
      logFile: '/tmp/yomitomo/yomitomo-agent.log',
      databaseFile: '/tmp/yomitomo/yomitomo.sqlite',
    }),
    openDataManagementPath: vi.fn().mockResolvedValue(undefined),
    saveSettings: vi.fn().mockResolvedValue(retainedStore),
    clearLog: vi.fn().mockResolvedValue(undefined),
    backupDatabase: vi.fn().mockResolvedValue({
      canceled: false,
      filePath: '/tmp/yomitomo-backup.sqlite',
    }),
    restoreDatabase: vi.fn().mockResolvedValue({
      canceled: false,
      backupPath: '/tmp/yomitomo/backups/yomitomo-before-restore.sqlite',
      store: restoredStore,
    }),
  };

  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktop,
  });

  return desktop;
}

describe('ProviderForm', () => {
  it('links visible labels to provider inputs', () => {
    render(<ProviderForm draft={emptyProvider} onChange={vi.fn()} />);

    expect(screen.getByLabelText('名称')).toBeTruthy();
    expect(screen.getByLabelText('Base URL')).toBeTruthy();
    expect(screen.getByLabelText('模型')).toBeTruthy();
    expect(screen.getByLabelText('API Key')).toBeTruthy();
    expect(screen.queryByLabelText('API 类型')).toBeNull();
    expect(screen.queryByText('思考强度')).toBeNull();
  });

  it('shows fetched models after clicking get', async () => {
    const onChange = vi.fn();
    const listProviderModels = vi
      .fn()
      .mockResolvedValue([{ id: 'gpt-5.2' }, { id: 'gpt-5.2-mini' }]);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        listProviderModels,
      },
    });

    render(
      <ProviderForm
        draft={{
          ...emptyProvider,
          presetId: 'openai',
          type: 'openai-chat',
          apiKey: 'sk-test',
          modelName: 'gpt-5.1',
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /获取/ }));

    expect(await screen.findByText('已获取 2 个模型')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '模型' })).toBeTruthy();
    expect(listProviderModels).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ modelInputMode: 'list', modelName: 'gpt-5.2' }),
    );
  });

  it('switches model input between custom text and fetched list', async () => {
    const listProviderModels = vi.fn().mockResolvedValue([{ id: 'kimi-k2' }]);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        listProviderModels,
      },
    });

    render(
      <StatefulProviderForm
        initialDraft={{
          ...emptyProvider,
          apiKey: 'sk-test',
          modelName: 'vendor/model',
          modelNames: ['preset-model'],
          modelInputMode: 'list',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /自定义/ }));
    const input = screen.getByRole('textbox', { name: '模型' }) as HTMLInputElement;
    expect(input.value).toBe('vendor/model');

    fireEvent.change(input, { target: { value: 'custom/model' } });
    expect(input.value).toBe('custom/model');

    fireEvent.click(screen.getByRole('button', { name: /获取/ }));

    expect(await screen.findByText('已获取 1 个模型')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '模型' })).toBeTruthy();
  });

  it('filters long fetched model lists in the model menu', () => {
    render(
      <ProviderForm
        draft={{
          ...emptyProvider,
          modelName: 'model-01',
          modelNames: Array.from({ length: 12 }, (_, index) =>
            index === 10 ? 'qwen-max-latest' : `model-${String(index + 1).padStart(2, '0')}`,
          ),
        }}
        onChange={vi.fn()}
      />,
    );

    const combobox = screen.getByRole('combobox', { name: '模型' }) as HTMLInputElement;
    fireEvent.click(combobox);
    fireEvent.change(combobox, { target: { value: 'qwen' } });

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'qwen-max-latest' })).toBeTruthy();
    expect(within(listbox).queryByRole('button', { name: 'qwen-max-latest' })).toBeNull();
    expect(within(listbox).queryByText('model-01')).toBeNull();
  });

  it('can fetch models with a stored api key without revealing it', async () => {
    const listProviderModels = vi.fn().mockResolvedValue([{ id: 'claude-sonnet-4-5' }]);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        listProviderModels,
      },
    });

    render(
      <ProviderForm
        draft={{
          ...emptyProvider,
          id: 'provider_1',
          apiKey: '',
          hasApiKey: true,
        }}
        onChange={vi.fn()}
      />,
    );

    const apiKeyInput = screen.getByLabelText('API Key') as HTMLInputElement;
    expect(apiKeyInput.value).toBe('');
    expect(apiKeyInput.placeholder).toBe('已安全保存，输入新 Key 会覆盖');

    fireEvent.click(screen.getByRole('button', { name: /获取/ }));

    expect(await screen.findByText('已获取 1 个模型')).toBeTruthy();
    expect(listProviderModels).toHaveBeenCalledWith(expect.objectContaining({ hasApiKey: true }));
  });

  it('reveals a stored api key only after explicit user action', async () => {
    const onChange = vi.fn();
    const readProviderApiKey = vi.fn().mockResolvedValue('sk-stored');
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        readProviderApiKey,
      },
    });

    render(
      <ProviderForm
        draft={{
          ...emptyProvider,
          id: 'provider_1',
          apiKey: '',
          hasApiKey: true,
        }}
        onChange={onChange}
      />,
    );

    const apiKeyInput = screen.getByLabelText('API Key') as HTMLInputElement;
    expect(apiKeyInput.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '显示 API Key' }));

    await waitFor(() => expect(apiKeyInput.value).toBe('sk-stored'));
    expect(readProviderApiKey).toHaveBeenCalledWith('provider_1');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edits from a revealed stored api key as a new draft key', async () => {
    const readProviderApiKey = vi.fn().mockResolvedValue('sk-stored');
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        readProviderApiKey,
      },
    });

    render(
      <StatefulProviderForm
        initialDraft={{
          ...emptyProvider,
          id: 'provider_1',
          apiKey: '',
          hasApiKey: true,
        }}
      />,
    );

    const apiKeyInput = screen.getByLabelText('API Key') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: '显示 API Key' }));
    await waitFor(() => expect(apiKeyInput.value).toBe('sk-stored'));

    fireEvent.change(apiKeyInput, { target: { value: 'sk-updated' } });

    expect(apiKeyInput.value).toBe('sk-updated');
  });

  it('falls back to preset models before an api key is available', async () => {
    const onChange = vi.fn();
    const listProviderModels = vi.fn();
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        listProviderModels,
      },
    });

    render(
      <ProviderForm
        draft={{ ...emptyProvider, apiKey: '', hasApiKey: false }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /获取/ }));

    expect(await screen.findByText('已显示预设模型；填写 API Key 后可获取实时列表')).toBeTruthy();
    expect(listProviderModels).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ modelInputMode: 'list' }));
  });

  it('shows provider model fetch failures while keeping preset candidates', async () => {
    const listProviderModels = vi.fn().mockRejectedValue(new Error('Bad credentials'));
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        listProviderModels,
      },
    });

    render(
      <ProviderForm
        draft={{
          ...emptyProvider,
          apiKey: 'sk-test',
        }}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /获取/ }));

    expect(await screen.findByText('Bad credentials')).toBeTruthy();
    expect(screen.getByText('已显示预设模型作为候选')).toBeTruthy();
    expect(listProviderModels).toHaveBeenCalledOnce();
  });

  it('marks a stored api key for removal', () => {
    const onChange = vi.fn();

    render(
      <ProviderForm
        draft={{
          ...emptyProvider,
          id: 'provider_1',
          apiKey: '',
          hasApiKey: true,
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '移除已保存的 Key' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: '', hasApiKey: false, removeApiKey: true }),
    );
  });
});

describe('ProviderSettings', () => {
  it('shows task routes and marks routed providers as used', () => {
    const providers = [
      makeProvider('provider_1', 'Anthropic'),
      makeProvider('provider_2', 'OpenAI'),
    ];

    render(
      <ProviderSettings
        draft={providers[0]}
        settingsDraft={{
          readingAssistantProviderId: 'provider_1',
          reviewAssistantProviderId: 'provider_2',
        }}
        providers={providers}
        testState={{ status: 'idle' }}
        canSave={false}
        canSaveRoutes={true}
        onChange={vi.fn()}
        onRouteChange={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
        routeSaveState="idle"
        onRouteSave={vi.fn()}
        onSelect={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    expect(screen.getByText('为伴读任务分配默认模型，并管理模型服务商配置。')).toBeTruthy();
    expect(screen.getByLabelText('阅读理解助手供应商')).toBeTruthy();
    expect(screen.getByLabelText('深度审阅助手供应商')).toBeTruthy();
    expect(screen.getAllByText('已使用')).toHaveLength(2);
    expect(screen.getAllByText('claude-sonnet-4-5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Anthropic').length).toBeGreaterThan(0);
    expect(screen.queryByText('设为默认')).toBeNull();
  });

  it('opens provider editing from the provider card menu', () => {
    const provider = makeProvider('provider_1', 'Anthropic');
    const onSelect = vi.fn();

    render(
      <ProviderSettings
        draft={provider}
        settingsDraft={{}}
        providers={[provider]}
        testState={{ status: 'idle' }}
        canSave={false}
        canSaveRoutes={false}
        onChange={vi.fn()}
        onRouteChange={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
        routeSaveState="idle"
        onRouteSave={vi.fn()}
        onSelect={onSelect}
        onTest={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('打开Anthropic设置菜单'));
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑' }));

    expect(onSelect).toHaveBeenCalledWith(provider);
    expect(screen.getByText('编辑供应商')).toBeTruthy();
  });

  it('keeps the provider editor open on backdrop clicks and closes after saving', async () => {
    const provider = makeProvider('provider_1', 'Anthropic');
    const onSave = vi.fn(async () => true);

    render(
      <ProviderSettings
        draft={provider}
        settingsDraft={{}}
        providers={[provider]}
        testState={{ status: 'idle' }}
        canSave
        canSaveRoutes={false}
        onChange={vi.fn()}
        onRouteChange={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onSave={onSave}
        saveState="idle"
        routeSaveState="idle"
        onRouteSave={vi.fn()}
        onSelect={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('打开Anthropic设置菜单'));
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑' }));

    const overlay = document.querySelector('.provider-editor-dialog-overlay');
    expect(overlay).toBeTruthy();
    fireEvent.mouseDown(overlay!);
    expect(screen.getByText('编辑供应商')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(screen.queryByText('编辑供应商')).toBeNull());
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('deletes a provider only after confirming in the dialog', () => {
    const provider = makeProvider('provider_1', 'Anthropic');
    const onDelete = vi.fn();

    render(
      <ProviderSettings
        draft={provider}
        settingsDraft={{}}
        providers={[provider]}
        testState={{ status: 'idle' }}
        canSave={false}
        canSaveRoutes={false}
        onChange={vi.fn()}
        onRouteChange={vi.fn()}
        onCreate={vi.fn()}
        onDelete={onDelete}
        onSave={vi.fn()}
        saveState="idle"
        routeSaveState="idle"
        onRouteSave={vi.fn()}
        onSelect={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('打开Anthropic设置菜单'));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除模型供应商：Anthropic' }));
    // 弹窗出现但未确认前不删除
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').textContent).toContain('删除供应商「Anthropic」？');

    // 取消不删除并关闭弹窗
    fireEvent.click(screen.getByRole('button', { name: '取消，保留现状' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    // 重新触发并确认后才删除
    fireEvent.click(screen.getByLabelText('打开Anthropic设置菜单'));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除模型供应商：Anthropic' }));
    fireEvent.click(screen.getByRole('button', { name: '删除供应商' }));
    expect(onDelete).toHaveBeenCalledWith('provider_1');
  });

  it('guides users to add a provider before editing routes', () => {
    const onCreate = vi.fn();
    const onTest = vi.fn();

    render(
      <ProviderSettings
        draft={emptyProvider}
        settingsDraft={{}}
        providers={[]}
        testState={{ status: 'idle' }}
        canSave={false}
        canSaveRoutes={false}
        onChange={vi.fn()}
        onRouteChange={vi.fn()}
        onCreate={onCreate}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
        routeSaveState="idle"
        onRouteSave={vi.fn()}
        onSelect={vi.fn()}
        onTest={onTest}
      />,
    );

    expect(
      screen.getByText('当前还没有可选供应商。新增并保存供应商后，这里会开放选择。'),
    ).toBeTruthy();
    expect(screen.getAllByText('先新增供应商')).toHaveLength(3);
    expect(screen.getByText('添加供应商')).toBeTruthy();
    expect(screen.getByText('配置模型服务商和 API Key')).toBeTruthy();
    expect(screen.queryByText('管理模型服务商、API Key、Base URL 和可用模型。')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /新增模型供应商/ }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByText('新增供应商')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '测试' }));
    expect(onTest).toHaveBeenCalledWith(emptyProvider);
  });
});

function StatefulProviderForm({ initialDraft }: { initialDraft: typeof emptyProvider }) {
  const [draft, setDraft] = React.useState(initialDraft);
  return <ProviderForm draft={draft} onChange={setDraft} />;
}

function makeProvider(id: string, name: string): LlmProvider {
  return {
    id,
    name,
    type: 'anthropic',
    presetId: 'anthropic',
    logo: 'anthropic.png',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    hasApiKey: true,
    modelName: 'claude-sonnet-4-5',
    modelInputMode: 'list',
    reasoningEffort: 'none',
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
  };
}

describe('AgentForm', () => {
  const draft: AgentDraft = {
    kind: 'annotation',
    presetId: 'reading-partner',
    enabled: true,
    nickname: '阅读伙伴',
    username: 'yomitomo',
    providerId: 'provider_1',
    soul: '自定义提示词',
    annotationDensity: 'medium',
    annotationColor: '#efa927',
    temperature: 0.7,
  };

  it('links visible labels to agent inputs', () => {
    render(<AgentForm draft={draft} error="" onChange={vi.fn()} />);

    expect(screen.getByText('工作照提示词')).toBeTruthy();
    expect(screen.getByRole('button', { name: /已启用/ })).toBeTruthy();
  });

  it('exposes density and enabled controls', () => {
    const onChange = vi.fn();
    render(<AgentForm draft={draft} error="" onChange={onChange} />);

    const densityGroup = screen.getByRole('radiogroup', { name: '批注密度' });

    expect(screen.getByRole('radio', { name: /标准/ }).getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(densityGroup, { key: 'ArrowRight' });
    fireEvent.click(screen.getAllByRole('button', { name: /已启用/ }).at(-1)!);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ annotationDensity: 'high' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('uses review-specific labels without avatar editing', () => {
    render(
      <AgentForm
        draft={{ ...draft, kind: 'review', avatar: 'review-avatar' }}
        error=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('上传')).toBeNull();
    expect(screen.getByText('标识颜色')).toBeTruthy();
    expect(document.querySelectorAll('.avatar-choice')).toHaveLength(0);
  });
});

const agentSettingsAgents: Agent[] = [
  makeAgent('agent_reading', 'annotation', '林知微', '林知微'),
  makeAgent('agent_review', 'review', '梁证言', '梁证言'),
];

function renderAgentSettings({
  agents: nextAgents = agentSettingsAgents,
  error = '',
  providers = [makeProvider('provider_1', 'Anthropic')],
  settings = {
    readingAssistantProviderId: 'provider_1',
    reviewAssistantProviderId: 'provider_1',
  },
  saveState = 'idle',
  onConfigureRoutes = vi.fn(),
  onToggle = vi.fn(),
}: {
  agents?: Agent[];
  error?: string;
  providers?: LlmProvider[];
  settings?: AppSettings;
  saveState?: 'idle' | 'saving' | 'saved';
  onConfigureRoutes?: () => void;
  onToggle?: (agent: Agent) => void;
} = {}) {
  return render(
    <AgentSettings
      agents={nextAgents}
      error={error}
      providers={providers}
      settings={settings}
      saveState={saveState}
      onConfigureRoutes={onConfigureRoutes}
      onToggle={onToggle}
    />,
  );
}

describe('AgentSettings', () => {
  it('toggles configured preset agents', () => {
    const onToggle = vi.fn();
    renderAgentSettings({ onToggle });

    fireEvent.click(screen.getByRole('checkbox', { name: /让林知微先休息/ }));

    expect(onToggle).toHaveBeenCalledWith(agentSettingsAgents[0]);
    expect(screen.getByText('先走了，你继续读。')).toBeTruthy();
  });

  it('filters configured agents by type tabs', () => {
    renderAgentSettings();

    fireEvent.click(screen.getByRole('tab', { name: /深度审阅/ }));

    expect(screen.getByText('梁证言')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /深度审阅/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('keeps the subtitle stable without showing save status', () => {
    renderAgentSettings({ saveState: 'saving' });

    expect(screen.getByText('不同模式，不同视角，组成你专属的思考团队。')).toBeTruthy();
    expect(screen.queryByText('正在保存助手状态。')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps disabled agents visible', () => {
    renderAgentSettings({
      agents: [
        agentSettingsAgents[0],
        {
          ...makeAgent('agent_disabled', 'annotation', '沈清源', '沈清源', false),
          presetId: 'concept-translator',
        },
      ],
    });

    expect(screen.getByText('林知微')).toBeTruthy();
    expect(screen.getByText('沈清源')).toBeTruthy();
    expect(screen.queryByText('让TA在场')).toBeNull();
    expect(screen.queryByText('请TA加入')).toBeNull();
  });

  it('shows the role badge on the work photo', () => {
    renderAgentSettings();

    expect(screen.getByText('页边同读者')).toBeTruthy();
  });

  it('shows preset assistant cards before provider configuration', () => {
    const onConfigureRoutes = vi.fn();
    renderAgentSettings({
      agents: [],
      providers: [],
      settings: {},
      onConfigureRoutes,
    });

    expect(screen.getByText('林知微')).toBeTruthy();
    expect(screen.getByText('先连接模型供应商')).toBeTruthy();

    const toggle = screen.getByRole('checkbox', {
      name: /林知微需要先配置模型路由/,
    }) as HTMLInputElement;
    expect(toggle.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /去配置模型与路由/ }));
    expect(onConfigureRoutes).toHaveBeenCalledOnce();
  });

  it('prompts for the active assistant route when providers exist', () => {
    const onConfigureRoutes = vi.fn();
    renderAgentSettings({
      settings: { reviewAssistantProviderId: 'provider_1' },
      onConfigureRoutes,
    });

    expect(screen.getByText('还没有配置阅读理解模型路由')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /去配置模型与路由/ }));
    expect(onConfigureRoutes).toHaveBeenCalledOnce();
  });
});

function makeAgent(
  id: string,
  kind: Agent['kind'],
  nickname: string,
  username: string,
  enabled = true,
): Agent {
  return {
    id,
    kind,
    presetId: kind === 'review' ? 'evidence-archivist' : 'reading-partner',
    enabled,
    providerId: 'provider_1',
    nickname,
    username,
    avatar: kind === 'review' ? 'review-avatar' : 'reading-avatar',
    annotationColor: '#efa927',
    annotationDensity: 'medium',
    temperature: 0.35,
    soul: '自定义提示词',
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
  };
}

describe('GeneralSettings', () => {
  it('frames library entry controls as a local card', () => {
    const { container } = render(
      <GeneralSettings
        settingsDraft={{}}
        canSave={false}
        onSettingsChange={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    const list = container.querySelector('.settings-source-list');

    expect(list).toBeTruthy();
    expect(screen.getByText('阅读库入口')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: '切换电子书入口，使用上下方向键调整顺序',
      }),
    ).toBeTruthy();
  });

  it('updates the save images setting', () => {
    const onSettingsChange = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{ saveArticleImages: false }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /采集文章时保存正文图片/ }));

    expect(onSettingsChange).toHaveBeenCalledWith({ saveArticleImages: true });
  });

  it('requires confirmation before enabling local network article imports', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{ allowLocalNetworkArticleImport: false }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /允许导入本机和私有网络地址/ }));

    expect(onSettingsChange).not.toHaveBeenCalled();
    expect(screen.getByText('允许访问本机和私有网络？')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '确认开启' }));

    expect(onSettingsChange).toHaveBeenCalledWith({ allowLocalNetworkArticleImport: true });
    expect(onSave).toHaveBeenCalledWith({ allowLocalNetworkArticleImport: true });
  });

  it('disables local network article imports without confirmation', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{ allowLocalNetworkArticleImport: true }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /允许导入本机和私有网络地址/ }));

    expect(screen.queryByText('允许访问本机和私有网络？')).toBeNull();
    expect(onSettingsChange).toHaveBeenCalledWith({ allowLocalNetworkArticleImport: false });
    expect(onSave).toHaveBeenCalledWith({ allowLocalNetworkArticleImport: false });
  });

  it('saves the selected interface language', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{ uiLanguage: 'zh-CN' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(onSettingsChange).toHaveBeenCalledWith({ uiLanguage: 'en' });
    expect(onSave).toHaveBeenCalledWith({ uiLanguage: 'en' });
  });

  it('saves sound effect controls', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    const view = render(
      <GeneralSettings
        settingsDraft={{ soundEffectsEnabled: false, soundEffectsVolume: 0.7 }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '启用应用音效' }));
    expect(onSave).toHaveBeenLastCalledWith({
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.7,
    });
    expect(playAppSoundEffect).toHaveBeenLastCalledWith('settings.sound_preview', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.7,
    });

    view.rerender(
      <GeneralSettings
        settingsDraft={{ soundEffectsEnabled: true, soundEffectsVolume: 0.7 }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );
    const slider = screen.getByRole('slider', { name: '音效响度' });
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      bottom: 36,
      height: 36,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    fireEvent.pointerDown(slider, { button: 0, clientX: 70, pointerId: 1 });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(slider, { button: 0, clientX: 70, pointerId: 1 });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.35,
    });
    expect(onSave).toHaveBeenLastCalledWith({
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.35,
    });
    expect(playAppSoundEffect).toHaveBeenLastCalledWith('settings.sound_preview', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.35,
    });

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onSave).toHaveBeenCalledTimes(2);

    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.4,
    });
    expect(onSave).toHaveBeenLastCalledWith({
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.4,
    });
  });

  it('shows the saved status only on the general section that changed', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    const view = render(
      <GeneralSettings
        settingsDraft={{ uiLanguage: 'zh-CN', saveArticleImages: false }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    view.rerender(
      <GeneralSettings
        settingsDraft={{ uiLanguage: 'en', saveArticleImages: false }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="saved"
      />,
    );

    const languageSection = screen.getByText('界面').closest('section');
    const collectionSection = screen.getByText('采集').closest('section');
    const soundSection = screen.getByText('音效').closest('section');
    const librarySection = screen.getByText('阅读库入口').closest('section');

    expect(languageSection).toBeTruthy();
    expect(collectionSection).toBeTruthy();
    expect(soundSection).toBeTruthy();
    expect(librarySection).toBeTruthy();
    expect(within(languageSection!).getByText('已保存')).toBeTruthy();
    expect(within(soundSection!).queryByText('已保存')).toBeNull();
    expect(within(collectionSection!).queryByText('已保存')).toBeNull();
    expect(within(librarySection!).queryByText('已保存')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: /采集文章时保存正文图片/ }));
    view.rerender(
      <GeneralSettings
        settingsDraft={{ uiLanguage: 'en', saveArticleImages: true }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="saved"
      />,
    );

    expect(within(languageSection!).queryByText('已保存')).toBeNull();
    expect(within(collectionSection!).getByText('已保存')).toBeTruthy();
    expect(within(librarySection!).queryByText('已保存')).toBeNull();
  });

  it('saves content source preferences and prevents disabling the final source', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{
          libraryContentSources: [
            { id: 'web', enabled: true },
            { id: 'ebook', enabled: true },
            { id: 'pdf', enabled: false },
            { id: 'weread', enabled: false },
          ],
        }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    const ebookItem = screen.getByRole('button', {
      name: '切换电子书入口，使用上下方向键调整顺序',
    });
    fireEvent.pointerDown(ebookItem, {
      button: 0,
      clientX: 130,
      clientY: 50,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerUp(window, {
      clientX: 130,
      clientY: 50,
      isPrimary: true,
      pointerId: 1,
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryContentSources: [
          { id: 'web', enabled: true },
          { id: 'ebook', enabled: false },
          { id: 'pdf', enabled: false },
          { id: 'weread', enabled: false },
        ],
      }),
    );

    cleanup();
    render(
      <GeneralSettings
        settingsDraft={{
          libraryContentSources: [
            { id: 'web', enabled: true },
            { id: 'ebook', enabled: false },
            { id: 'pdf', enabled: false },
            { id: 'weread', enabled: false },
          ],
        }}
        canSave={false}
        onSettingsChange={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    expect(
      screen
        .getByRole('button', {
          name: '切换网页文章入口，使用上下方向键调整顺序',
        })
        .getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('keeps a re-enabled content source in the current board position', () => {
    const onSave = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{
          libraryContentSources: [
            { id: 'web', enabled: true },
            { id: 'ebook', enabled: false },
            { id: 'pdf', enabled: true },
            { id: 'weread', enabled: false },
          ],
        }}
        canSave={false}
        onSettingsChange={vi.fn()}
        onSave={onSave}
        saveState="idle"
      />,
    );

    const ebookItem = screen.getByRole('button', {
      name: '切换电子书入口，使用上下方向键调整顺序',
    });
    fireEvent.pointerDown(ebookItem, {
      button: 0,
      clientX: 130,
      clientY: 50,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerUp(window, {
      clientX: 130,
      clientY: 50,
      isPrimary: true,
      pointerId: 1,
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryContentSources: [
          { id: 'web', enabled: true },
          { id: 'ebook', enabled: true },
          { id: 'pdf', enabled: true },
          { id: 'weread', enabled: false },
        ],
      }),
    );
  });

  it('reorders library entries with keyboard arrows', () => {
    const onSave = vi.fn();
    render(
      <GeneralSettings
        settingsDraft={{
          libraryContentSources: [
            { id: 'web', enabled: true },
            { id: 'ebook', enabled: true },
            { id: 'pdf', enabled: true },
            { id: 'weread', enabled: false },
          ],
        }}
        canSave={false}
        onSettingsChange={vi.fn()}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.keyDown(
      screen.getByRole('button', {
        name: '切换电子书入口，使用上下方向键调整顺序',
      }),
      { key: 'ArrowDown' },
    );

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryContentSources: [
          { id: 'web', enabled: true },
          { id: 'pdf', enabled: true },
          { id: 'ebook', enabled: true },
          { id: 'weread', enabled: false },
        ],
      }),
    );
  });

  it('reorders disabled content sources by dragging cards', () => {
    const onSave = vi.fn();
    const { container } = render(
      <GeneralSettings
        settingsDraft={{
          libraryContentSources: [
            { id: 'web', enabled: true },
            { id: 'ebook', enabled: false },
            { id: 'pdf', enabled: true },
            { id: 'weread', enabled: false },
          ],
        }}
        canSave={false}
        onSettingsChange={vi.fn()}
        onSave={onSave}
        saveState="idle"
      />,
    );

    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-library-source-card]'));
    const cardRects = [
      { top: 0, bottom: 50 },
      { top: 60, bottom: 110 },
      { top: 120, bottom: 170 },
      { top: 180, bottom: 230 },
    ];
    cards.forEach((card, index) => {
      const rect = cardRects[index];
      card.getBoundingClientRect = () =>
        ({
          bottom: rect.bottom,
          height: rect.bottom - rect.top,
          left: 0,
          right: 300,
          top: rect.top,
          width: 300,
          x: 0,
          y: rect.top,
          toJSON: () => ({}),
        }) as DOMRect;
    });

    const ebookItem = screen.getByRole('button', {
      name: '切换电子书入口，使用上下方向键调整顺序',
    });
    fireEvent.pointerDown(ebookItem, {
      button: 0,
      clientX: 50,
      clientY: 85,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, {
      clientX: 50,
      clientY: 150,
      isPrimary: true,
      pointerId: 1,
    });

    expect(
      Array.from(container.querySelectorAll<HTMLElement>('[data-library-source-card]')).map(
        (item) => item.dataset.librarySourceCard,
      ),
    ).toEqual(['web', 'pdf', 'ebook', 'weread']);
    expect(container.querySelector('.settings-source-row.is-floating-drag')).toBeTruthy();

    fireEvent.pointerUp(window, {
      clientX: 50,
      clientY: 150,
      isPrimary: true,
      pointerId: 1,
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryContentSources: [
          { id: 'web', enabled: true },
          { id: 'pdf', enabled: true },
          { id: 'ebook', enabled: false },
          { id: 'weread', enabled: false },
        ],
      }),
    );
  });
});

describe('WeReadSettingsPanel', () => {
  it('reveals a stored api key after explicit user action', async () => {
    const readWeReadApiKey = vi.fn().mockResolvedValue('wrk-stored');
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        getWeReadState: vi.fn().mockResolvedValue({
          settings: { configured: true, openMethod: 'deeplink' },
          books: [],
        }),
        readWeReadApiKey,
      },
    });

    render(<WeReadSettingsPanel />);

    const apiKeyInput = (await screen.findByLabelText('API Key')) as HTMLInputElement;
    expect(apiKeyInput.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '显示 API Key' }));

    await waitFor(() => expect(apiKeyInput.value).toBe('wrk-stored'));
    expect(apiKeyInput.type).toBe('text');
    expect(readWeReadApiKey).toHaveBeenCalledOnce();
  });

  it('confirms before deleting the stored api key', async () => {
    const saveWeReadSettings = vi.fn().mockResolvedValue({
      settings: { configured: false, openMethod: 'deeplink' },
      books: [],
    });
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        getWeReadState: vi.fn().mockResolvedValue({
          settings: { configured: true, openMethod: 'deeplink' },
          books: [],
        }),
        saveWeReadSettings,
      },
    });

    render(<WeReadSettingsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: '删除已保存 Key' }));
    expect(screen.getByRole('dialog', { name: '删除微信读书 API Key？' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog', { name: '删除微信读书 API Key？' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('dialog', { name: '删除微信读书 API Key？' })).toBeNull();
    expect(saveWeReadSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '删除已保存 Key' }));
    fireEvent.click(screen.getByRole('button', { name: '取消，保留现状' }));
    expect(saveWeReadSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '删除已保存 Key' }));
    const dialog = screen.getByRole('dialog', { name: '删除微信读书 API Key？' });
    fireEvent.click(within(dialog).getByRole('button', { name: '删除已保存 Key' }));

    await waitFor(() =>
      expect(saveWeReadSettings).toHaveBeenCalledWith({
        removeApiKey: true,
        openMethod: 'deeplink',
      }),
    );
  });
});

describe('ShortcutSettings', () => {
  it('updates the message send shortcut', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getAllByRole('radio')[1]);

    expect(onSettingsChange).toHaveBeenCalledWith({ messageSendShortcut: 'mod-enter' });
    expect(screen.getAllByText('⏎').some((element) => element.tagName === 'KBD')).toBe(true);
    expect(screen.getByText('消息发送')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '回车发送' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '组合键发送' })).toBeTruthy();
    expect(screen.getByText(/用于想法发布和回复发送，切换即时生效/)).toBeTruthy();
    expect(screen.queryByText(/Command|Enter|macOS|Windows/)).toBeNull();
  });

  it('keeps the current badge on the saved shortcut while editing', () => {
    render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'mod-enter' }}
        canSave
        onSettingsChange={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    const options = screen.getAllByRole('radio');

    expect(options[0].getAttribute('aria-checked')).toBe('false');
    expect(options[1].getAttribute('aria-checked')).toBe('true');
  });

  it('records single-letter reader action shortcuts', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '设置复制快捷键' }));
    fireEvent.keyDown(window, { key: 'x' });

    expect(onSettingsChange).toHaveBeenCalledWith({
      messageSendShortcut: 'enter',
      selectionActionShortcuts: { copy: 'X', annotate: 'A', ask: 'Q' },
    });
  });

  it('shows shortcut saved status on the section that changed', () => {
    const onSettingsChange = vi.fn();
    const onSave = vi.fn();
    const view = render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getAllByRole('radio')[1]);
    view.rerender(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'mod-enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="saved"
      />,
    );

    const messageSection = screen.getByText('消息发送').closest('section');
    const selectionSection = screen.getByText('阅读区选区操作').closest('section');

    expect(messageSection).toBeTruthy();
    expect(selectionSection).toBeTruthy();
    expect(within(messageSection!).getByText('已保存')).toBeTruthy();
    expect(within(selectionSection!).queryByText('已保存')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '设置复制快捷键' }));
    fireEvent.keyDown(window, { key: 'x' });
    view.rerender(
      <ShortcutSettings
        settingsDraft={{
          messageSendShortcut: 'mod-enter',
          selectionActionShortcuts: { copy: 'X', annotate: 'A', ask: 'Q' },
        }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={onSave}
        saveState="saved"
      />,
    );

    expect(within(messageSection!).queryByText('已保存')).toBeNull();
    expect(within(selectionSection!).getByText('已保存')).toBeTruthy();
  });

  it('keeps recording until a supported letter is pressed', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '设置记录想法快捷键' }));
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'b' });

    expect(onSettingsChange).toHaveBeenCalledOnce();
    expect(onSettingsChange).toHaveBeenCalledWith({
      messageSendShortcut: 'enter',
      selectionActionShortcuts: { copy: 'C', annotate: 'B', ask: 'Q' },
    });
  });

  it('records the ask selection shortcut', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '设置问一下快捷键' }));
    fireEvent.keyDown(window, { key: 'y' });

    expect(onSettingsChange).toHaveBeenCalledWith({
      messageSendShortcut: 'enter',
      selectionActionShortcuts: { copy: 'C', annotate: 'A', ask: 'Y' },
    });
  });

  it('shows conflicts and resets reader action shortcuts', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        settingsDraft={{
          messageSendShortcut: 'enter',
          selectionActionShortcuts: { copy: 'B', annotate: 'B', ask: 'Q' },
        }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByText(/重复键位会阻止保存/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '重置复制为默认 C' }));

    expect(onSettingsChange).toHaveBeenCalledWith({
      messageSendShortcut: 'enter',
      selectionActionShortcuts: { copy: 'C', annotate: 'B', ask: 'Q' },
    });
  });
});

describe('DataManagementSettings', () => {
  it('shows data paths and opens the selected location', async () => {
    const desktop = installDesktopDataApi();

    render(<DataManagementSettings settings={{}} onStoreUpdated={vi.fn()} />);

    expect(await screen.findByText('/tmp/yomitomo/yomitomo.sqlite')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '打开数据库文件' }));

    await waitFor(() =>
      expect(desktop.openDataManagementPath).toHaveBeenCalledWith('databaseFile'),
    );
  });

  it('saves log retention without opening a log viewer', async () => {
    const desktop = installDesktopDataApi();
    const onStoreUpdated = vi.fn();

    render(
      <DataManagementSettings
        settings={{ onboardingCompletedAt: '2026-05-12T00:00:00.000Z' }}
        onStoreUpdated={onStoreUpdated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '15 天' }));

    await waitFor(() =>
      expect(desktop.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          logRetentionDays: 15,
          onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
        }),
      ),
    );
    expect(onStoreUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ logRetentionDays: 15 }) }),
    );
    expect(screen.queryByRole('textbox', { name: /日志/ })).toBeNull();
  });

  it('backs up and restores the database through desktop actions', async () => {
    const desktop = installDesktopDataApi();
    const onStoreUpdated = vi.fn();

    render(
      <DataManagementSettings
        settings={{ logRetentionDays: 30 }}
        onStoreUpdated={onStoreUpdated}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '备份数据库' }));
    await waitFor(() => expect(desktop.backupDatabase).toHaveBeenCalledOnce());
    expect(await screen.findByText(/数据库已备份到/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '从备份还原数据库' }));
    expect(screen.getByRole('dialog', { name: '从备份还原数据库？' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消，保留现状' }));
    expect(desktop.restoreDatabase).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '从备份还原数据库' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '从备份还原数据库？' })).getByRole('button', {
        name: '选择备份并还原',
      }),
    );
    await waitFor(() => expect(desktop.restoreDatabase).toHaveBeenCalledOnce());
    expect(onStoreUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ logRetentionDays: 90 }) }),
    );
  });

  it('confirms before clearing the log file', async () => {
    const desktop = installDesktopDataApi();

    render(<DataManagementSettings settings={{}} onStoreUpdated={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: '清空日志文件' }));
    expect(screen.getByRole('dialog', { name: '清空日志文件？' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消，保留现状' }));
    expect(desktop.clearLog).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '清空日志文件' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '清空日志文件？' })).getByRole('button', {
        name: '清空日志文件',
      }),
    );

    await waitFor(() => expect(desktop.clearLog).toHaveBeenCalledOnce());
    expect(await screen.findByText('日志文件已清空。')).toBeTruthy();
  });
});

describe('UserProfileSettingsDialog', () => {
  it('edits identity fields and keeps usernames sanitized', () => {
    const onChange = vi.fn();

    render(
      <UserProfileSettingsDialog
        draft={defaultUser}
        canSave
        onChange={onChange}
        onClose={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '行开心' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'xing kaixin!' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ nickname: '行开心' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ username: 'xingkaixin' }));
  });

  it('saves profile changes from the dialog footer', () => {
    const onSave = vi.fn();

    render(
      <UserProfileSettingsDialog
        draft={defaultUser}
        canSave
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /保存/ }));

    expect(onSave).toHaveBeenCalledOnce();
  });

  it('opens from the profile trigger source', () => {
    render(
      <UserProfileSettingsDialog
        draft={defaultUser}
        canSave
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
        sourceRect={{ x: 680, y: 52, width: 40, height: 40 }}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '个人设置' });

    expect(dialog.classList.contains('source-aware-dialog')).toBe(true);
    expect(dialog.getAttribute('style')).toContain('--dialog-source-origin-x');
  });

  it('exposes the selected annotation color state', () => {
    render(
      <UserProfileSettingsDialog
        draft={defaultUser}
        canSave
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    expect(
      screen.getByRole('button', { name: '选择颜色 #f4c95d' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: '选择颜色 #efa927' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('keeps the English username help copy compact', () => {
    initializeAppI18n('en');

    render(
      <UserProfileSettingsDialog
        draft={defaultUser}
        canSave
        onChange={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    expect(screen.getByText('For @mentions: letters, numbers, _ and -.')).toBeTruthy();
    expect(screen.queryByText(/Supports letters, numbers/)).toBeNull();
  });
});
