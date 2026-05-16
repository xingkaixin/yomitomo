// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentForm,
  AgentSettings,
  GeneralSettings,
  ProviderForm,
  ProviderSettings,
  ShortcutSettings,
  UserProfileSettingsDialog,
} from '../app-settings-panels';
import { defaultUser, emptyProvider, type AgentDraft } from '../app-settings';
import type { Agent, LlmProvider } from '@yomitomo/shared';

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

describe('ProviderForm', () => {
  it('links visible labels to provider inputs', () => {
    render(<ProviderForm draft={emptyProvider} onChange={vi.fn()} />);

    expect(screen.getByLabelText('名称')).toBeTruthy();
    expect(screen.getByLabelText('Base URL')).toBeTruthy();
    expect(screen.getByLabelText('模型')).toBeTruthy();
    expect(screen.getByLabelText('API Key')).toBeTruthy();
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
          type: 'openai-responses',
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
          readingNoteProviderId: 'provider_1',
        }}
        providers={providers}
        selectedId="provider_1"
        testState=""
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
    expect(screen.getByLabelText('读后笔记助手供应商')).toBeTruthy();
    expect(screen.getAllByText('已使用')).toHaveLength(2);
    expect(screen.queryByText('设为默认')).toBeNull();
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

describe('AgentSettings', () => {
  const agents: Agent[] = [
    makeAgent('agent_reading', 'annotation', '林知微', '林知微'),
    makeAgent('agent_review', 'review', '梁证言', '梁证言'),
  ];

  it('toggles configured preset agents', () => {
    const onToggle = vi.fn();
    render(<AgentSettings agents={agents} error="" saveState="idle" onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /让林知微先休息/ }));

    expect(onToggle).toHaveBeenCalledWith(agents[0]);
    expect(screen.getByText('先走了，你继续读。')).toBeTruthy();
  });

  it('filters configured agents by type tabs', () => {
    render(<AgentSettings agents={agents} error="" saveState="idle" onToggle={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: /深度审阅/ }));

    expect(screen.getByText('梁证言')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /深度审阅/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('keeps the subtitle stable without showing save status', () => {
    render(<AgentSettings agents={agents} error="" saveState="saving" onToggle={vi.fn()} />);

    expect(screen.getByText('不同模式，不同视角，组成你专属的思考团队。')).toBeTruthy();
    expect(screen.queryByText('正在保存助手状态。')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps disabled agents visible', () => {
    render(
      <AgentSettings
        agents={[agents[0]!, makeAgent('agent_disabled', 'annotation', '沈清源', '沈清源', false)]}
        error=""
        saveState="idle"
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText('林知微')).toBeTruthy();
    expect(screen.getByText('沈清源')).toBeTruthy();
    expect(screen.getByText('在场')).toBeTruthy();
    expect(screen.getByText('休息中')).toBeTruthy();
    expect(screen.queryByText('让TA在场')).toBeNull();
    expect(screen.queryByText('请TA加入')).toBeNull();
  });

  it('marks enabled agent work photos with a status badge', () => {
    render(<AgentSettings agents={agents} error="" saveState="idle" onToggle={vi.fn()} />);

    expect(screen.getAllByText('在场')).toHaveLength(1);
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
});

describe('ShortcutSettings', () => {
  it('updates the message send shortcut', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        savedSettings={{ messageSendShortcut: 'enter' }}
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getAllByRole('radio')[1]!);

    expect(onSettingsChange).toHaveBeenCalledWith({ messageSendShortcut: 'mod-enter' });
    expect(screen.getAllByText('⏎').some((element) => element.tagName === 'KBD')).toBe(true);
    expect(screen.getByText('消息发送')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '⏎ 发送' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /(?:⌘|Ctrl)\+⏎ 发送/ })).toBeTruthy();
    expect(
      within(screen.getByLabelText('批注和评论发送快捷键')).getAllByText('当前使用'),
    ).toHaveLength(1);
    expect(screen.getByText(/你可以随时切换快捷键，设置立即生效/)).toBeTruthy();
    expect(screen.queryByText(/Command|Enter|macOS|Windows/)).toBeNull();
  });

  it('keeps the current badge on the saved shortcut while editing', () => {
    render(
      <ShortcutSettings
        savedSettings={{ messageSendShortcut: 'enter' }}
        settingsDraft={{ messageSendShortcut: 'mod-enter' }}
        canSave
        onSettingsChange={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    const options = screen.getAllByRole('radio');

    expect(options[0]!.getAttribute('aria-checked')).toBe('false');
    expect(options[1]!.getAttribute('aria-checked')).toBe('true');
    expect(within(options[0]!).getByText('当前使用')).toBeTruthy();
    expect(within(options[1]!).queryByText('当前使用')).toBeNull();
  });

  it('records single-letter reader action shortcuts', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        savedSettings={{ messageSendShortcut: 'enter' }}
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
      selectionActionShortcuts: { copy: 'X', annotate: 'A' },
    });
  });

  it('keeps recording until a supported letter is pressed', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        savedSettings={{ messageSendShortcut: 'enter' }}
        settingsDraft={{ messageSendShortcut: 'enter' }}
        canSave={false}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '设置添加批注快捷键' }));
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'b' });

    expect(onSettingsChange).toHaveBeenCalledOnce();
    expect(onSettingsChange).toHaveBeenCalledWith({
      messageSendShortcut: 'enter',
      selectionActionShortcuts: { copy: 'C', annotate: 'B' },
    });
  });

  it('shows conflicts and resets reader action shortcuts', () => {
    const onSettingsChange = vi.fn();
    render(
      <ShortcutSettings
        savedSettings={{
          messageSendShortcut: 'enter',
          selectionActionShortcuts: { copy: 'C', annotate: 'A' },
        }}
        settingsDraft={{
          messageSendShortcut: 'enter',
          selectionActionShortcuts: { copy: 'B', annotate: 'B' },
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
      selectionActionShortcuts: { copy: 'C', annotate: 'B' },
    });
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
});
