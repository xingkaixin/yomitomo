// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentForm, AgentSettings } from '../settings/app-settings-panels';
import { type AgentDraft } from '../settings/app-settings';
import { type Agent, type AppSettingsPatch, type LlmProvider } from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';
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
  settings = normalizeAppSettings({
    readingAssistantProviderId: 'provider_1',
    reviewAssistantProviderId: 'provider_1',
  }),
  saveState = 'idle',
  onConfigureRoutes = vi.fn(),
  onToggle = vi.fn(),
}: {
  agents?: Agent[];
  error?: string;
  providers?: LlmProvider[];
  settings?: AppSettingsPatch;
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
