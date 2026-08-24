// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderForm, ProviderSettings } from '../settings/app-settings-panels';
import {
  emptyProvider,
  type ProviderDraft,
  type ProviderTestState,
} from '../settings/app-settings';
import {
  type AppSettingsPatch,
  type LlmProvider,
  type ResolvedAppSettings,
} from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';
import { appToast } from '../shell/app-toast';
import type { SaveState } from '../shell/app-types';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
}));

vi.mock('../shell/app-toast', () => ({
  appToast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
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
        provider: { listModels: listProviderModels },
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
          modelNames: undefined,
        }}
        onChange={onChange}
      />,
    );

    openModelMenu();
    fireEvent.click(screen.getByRole('button', { name: /获取/ }));

    expect(await screen.findByText('已获取 2 个模型')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '模型' })).toBeTruthy();
    expect(listProviderModels).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        modelInputMode: 'list',
        modelName: 'gpt-5.1',
        modelNames: expect.arrayContaining(['gpt-5.2', 'gpt-5.2-mini']),
      }),
    );
  });

  it('adds custom models into the mixed model list', async () => {
    const listProviderModels = vi.fn().mockResolvedValue([{ id: 'kimi-k2' }]);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        provider: { listModels: listProviderModels },
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

    openModelMenu();
    fireEvent.change(screen.getByLabelText('自定义模型名称'), {
      target: { value: 'custom/model' },
    });
    fireEvent.click(screen.getByRole('button', { name: '使用' }));

    const trigger = screen.getByRole('combobox', { name: '模型' });
    expect(trigger.textContent).toContain('custom/model');

    openModelMenu();
    fireEvent.click(screen.getByRole('button', { name: /获取/ }));

    expect(await screen.findByText('已获取 1 个模型')).toBeTruthy();
    expect(trigger.textContent).toContain('custom/model');
  });

  it('edits and deletes custom models without exposing preset models to editing', () => {
    render(
      <StatefulProviderForm
        initialDraft={{
          ...emptyProvider,
          modelName: 'custom/model',
          modelNames: ['deepseek-chat', 'custom/model'],
          modelInputMode: 'list',
        }}
      />,
    );

    openModelMenu();
    expect(screen.queryByLabelText('编辑自定义模型 deepseek-chat')).toBeNull();

    fireEvent.click(screen.getByLabelText('编辑自定义模型 custom/model'));
    fireEvent.change(screen.getByLabelText('自定义模型名称'), {
      target: { value: 'custom/model-v2' },
    });
    fireEvent.click(screen.getByRole('button', { name: '更新' }));

    expect(screen.getByRole('combobox', { name: '模型' }).textContent).toContain('custom/model-v2');

    openModelMenu();
    fireEvent.click(screen.getByLabelText('删除自定义模型 custom/model-v2'));

    expect(screen.getByRole('combobox', { name: '模型' }).textContent).toContain('deepseek-chat');
    openModelMenu();
    expect(screen.queryByText('custom/model-v2')).toBeNull();
  });

  it('hides and restores preset models from the provider visible model list', () => {
    render(
      <StatefulProviderForm
        initialDraft={{
          ...emptyProvider,
          modelName: 'deepseek-chat',
          modelNames: ['deepseek-chat', 'deepseek-reasoner'],
          modelInputMode: 'list',
        }}
      />,
    );

    openModelMenu();
    fireEvent.click(screen.getByLabelText('隐藏预设模型 deepseek-reasoner'));

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).queryByRole('option', { name: /deepseek-reasoner/ })).toBeNull();
    expect(screen.getByText('隐藏的预设模型')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'deepseek-reasoner' }));
    expect(within(listbox).getByRole('option', { name: /deepseek-reasoner/ })).toBeTruthy();
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

    const combobox = screen.getByRole('combobox', { name: '模型' });
    fireEvent.click(combobox);
    fireEvent.change(screen.getByPlaceholderText('搜索模型'), { target: { value: 'qwen' } });

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByRole('option', { name: /qwen-max-latest/ })).toBeTruthy();
    expect(within(listbox).queryByRole('button', { name: 'qwen-max-latest' })).toBeNull();
    expect(within(listbox).queryByText('model-01')).toBeNull();
  });

  it('can fetch models with a stored api key without revealing it', async () => {
    const listProviderModels = vi.fn().mockResolvedValue([{ id: 'claude-sonnet-4-5' }]);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        provider: { listModels: listProviderModels },
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

    openModelMenu();
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
        provider: { readApiKey: readProviderApiKey },
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
        provider: { readApiKey: readProviderApiKey },
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
        provider: { listModels: listProviderModels },
      },
    });

    render(
      <ProviderForm
        draft={{ ...emptyProvider, apiKey: '', hasApiKey: false }}
        onChange={onChange}
      />,
    );

    openModelMenu();
    fireEvent.click(screen.getByRole('button', { name: /获取/ }));

    await waitFor(() =>
      expect(appToast.warning).toHaveBeenCalledWith('填写 API Key 后可获取模型列表', {
        description: '已显示预设模型；填写 API Key 后可获取实时列表',
      }),
    );
    expect(screen.queryByText('已显示预设模型；填写 API Key 后可获取实时列表')).toBeNull();
    expect(listProviderModels).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows provider model fetch failures while keeping preset candidates', async () => {
    const listProviderModels = vi.fn().mockRejectedValue(new Error('Bad credentials'));
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        provider: { listModels: listProviderModels },
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

    openModelMenu();
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
        {...makeProviderSettingsProps({
          providerValue: providers[0],
          routesValue: {
            readingAssistantProviderId: 'provider_1',
            reviewAssistantProviderId: 'provider_2',
          },
          providers,
          canSaveRoutes: true,
        })}
      />,
    );

    expect(screen.getByText('为伴读任务分配默认模型，并管理模型服务商配置。')).toBeTruthy();
    expect(screen.getByText(/双语翻译为整篇文章全文.*所配置的端点/)).toBeTruthy();
    expect(screen.getByLabelText('阅读理解助手供应商')).toBeTruthy();
    expect(screen.getByLabelText('深度审阅助手供应商')).toBeTruthy();
    expect(screen.getByText('优先快速完成')).toBeTruthy();
    expect(
      screen.getByRole('slider', { name: '助手执行模式' }).getAttribute('aria-valuetext'),
    ).toBe('快速回应');
    expect(screen.getAllByText('已使用')).toHaveLength(2);
    expect(screen.getAllByText('claude-sonnet-4-5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Anthropic').length).toBeGreaterThan(0);
    expect(screen.queryByText('设为默认')).toBeNull();
  });

  it('saves the selected assistant execution mode', () => {
    const onRoutesChange = vi.fn();
    const onRoutesSave = vi.fn();

    render(
      <ProviderSettings
        {...makeProviderSettingsProps({
          providerValue: emptyProvider,
          providers: [],
          routesValue: { assistantExecutionMode: 'fast_response' },
          onRoutesChange,
          onRouteSave: onRoutesSave,
        })}
      />,
    );

    fireEvent.change(screen.getByRole('slider', { name: '助手执行模式' }), {
      target: { value: '1' },
    });
    expect(screen.getByText('使用工具核验')).toBeTruthy();
    fireEvent.pointerUp(screen.getByRole('slider', { name: '助手执行模式' }));

    const nextDraft = expect.objectContaining({ assistantExecutionMode: 'deep_verification' });
    expect(onRoutesChange).toHaveBeenCalledWith(nextDraft);
    expect(onRoutesSave).toHaveBeenCalledWith(nextDraft);
  });

  it('opens provider editing from the provider card menu', () => {
    const provider = makeProvider('provider_1', 'Anthropic');
    const onSelect = vi.fn();

    render(
      <ProviderSettings
        {...makeProviderSettingsProps({
          providerValue: provider,
          providers: [provider],
          onSelect,
        })}
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
        {...makeProviderSettingsProps({
          providerValue: provider,
          providers: [provider],
          canSave: true,
          onSave,
        })}
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

  it('keeps the provider editor open when controller saving fails', async () => {
    const provider = makeProvider('provider_1', 'Anthropic');
    const save = vi.fn().mockResolvedValue(undefined);

    render(
      <ProviderSettings
        {...makeProviderSettingsProps({
          providerValue: provider,
          providers: [provider],
          canSave: true,
          onSave: save,
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('打开Anthropic设置菜单'));
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(screen.getByText('编辑供应商')).toBeTruthy();
  });

  it('deletes a provider only after confirming in the dialog', () => {
    const provider = makeProvider('provider_1', 'Anthropic');
    const onDelete = vi.fn();

    render(
      <ProviderSettings
        {...makeProviderSettingsProps({
          providerValue: provider,
          providers: [provider],
          onDelete,
        })}
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

    render(<StatefulEmptyProviderSettings onCreate={onCreate} onTest={onTest} />);

    expect(screen.getByText(/当前还没有可选供应商.*这里会开放选择/)).toBeTruthy();
    expect(screen.getByText(/双语翻译为整篇文章全文.*所配置的端点/)).toBeTruthy();
    expect(screen.getAllByText('先新增供应商')).toHaveLength(3);
    expect(screen.getByText('添加供应商')).toBeTruthy();
    expect(screen.getByText('配置模型服务商和 API Key')).toBeTruthy();
    expect(screen.queryByText('管理模型服务商、API Key、Base URL 和可用模型。')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /新增模型供应商/ }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByText('新增供应商')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^OpenAIOpenAI compatible/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /深度求索/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /阿里云百炼/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Anthropic/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Gemini/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^OpenAIOpenAI compatible/ }));
    expect(screen.getByLabelText('Base URL')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '测试' }));
    expect(onTest).toHaveBeenCalledWith(expect.objectContaining({ presetId: 'openai' }));
  });
});

type ProviderSettingsFixtureOptions = {
  providerValue: ProviderDraft;
  providers: LlmProvider[];
  routesValue?: AppSettingsPatch;
  testState?: ProviderTestState;
  canSave?: boolean;
  canSaveRoutes?: boolean;
  saveState?: SaveState;
  saveError?: string;
  routeSaveState?: SaveState;
  routeSaveError?: string;
  onProviderChange?: (draft: ProviderDraft) => void;
  onRoutesChange?: (draft: ResolvedAppSettings) => void;
  onCreate?: () => void;
  onDelete?: (id: string) => Promise<void> | void;
  onSave?: (draft?: ProviderDraft) => Promise<boolean | undefined> | boolean | undefined;
  onRouteSave?: (draft?: ResolvedAppSettings) => Promise<void> | void;
  onSelect?: (provider: LlmProvider) => void;
  onTest?: (draft: ProviderDraft) => Promise<void> | void;
};

function makeProviderSettingsProps({
  providerValue,
  providers,
  routesValue = {},
  testState = { status: 'idle' },
  canSave = false,
  canSaveRoutes = false,
  saveState = 'idle',
  saveError = '',
  routeSaveState = 'idle',
  routeSaveError = '',
  onProviderChange = vi.fn(),
  onRoutesChange = vi.fn(),
  onCreate = vi.fn(),
  onDelete = vi.fn(),
  onSave = vi.fn(async () => true),
  onRouteSave = vi.fn(),
  onSelect = vi.fn(),
  onTest = vi.fn(),
}: ProviderSettingsFixtureOptions): React.ComponentProps<typeof ProviderSettings> {
  return {
    providerDraft: {
      value: providerValue,
      canSave,
      create: onCreate,
      deleteProvider: onDelete,
      reset: vi.fn(),
      save: async (override) => (override === undefined ? onSave() : onSave(override)),
      saveError,
      saveState,
      select: onSelect,
      selectedProviderId: providerValue.id || null,
      test: onTest,
      testState,
      update: onProviderChange,
    },
    routesDraft: {
      value: normalizeAppSettings(routesValue),
      canSave: canSaveRoutes,
      reset: vi.fn(),
      save: async (override) => (override === undefined ? onRouteSave() : onRouteSave(override)),
      saveError: routeSaveError,
      saveState: routeSaveState,
      update: onRoutesChange,
    },
    providers,
  };
}

function StatefulProviderForm({ initialDraft }: { initialDraft: typeof emptyProvider }) {
  const [draft, setDraft] = React.useState(initialDraft);
  return <ProviderForm draft={draft} onChange={setDraft} />;
}

function StatefulEmptyProviderSettings({
  onCreate,
  onTest,
}: {
  onCreate: () => void;
  onTest: (draft: typeof emptyProvider) => void;
}) {
  const [draft, setDraft] = React.useState<ProviderDraft>(emptyProvider);

  return (
    <ProviderSettings
      {...makeProviderSettingsProps({
        providerValue: draft,
        providers: [],
        onProviderChange: setDraft,
        onCreate,
        onTest,
      })}
    />
  );
}

function openModelMenu() {
  fireEvent.click(screen.getByRole('combobox', { name: '模型' }));
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
