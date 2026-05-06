// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentForm,
  AgentSettings,
  GeneralSettings,
  ProviderForm,
  readingAgentAvatars,
  reviewAgentAvatars,
} from '../app-settings-panels';
import { customPersonalityId, defaultUser, emptyProvider, type AgentDraft } from '../app-settings';
import type { Agent } from '@yomitomo/shared';
import type { ProviderOption } from '../app-types';

afterEach(() => {
  cleanup();
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
});

function StatefulProviderForm({ initialDraft }: { initialDraft: typeof emptyProvider }) {
  const [draft, setDraft] = React.useState(initialDraft);
  return <ProviderForm draft={draft} onChange={setDraft} />;
}

describe('AgentForm', () => {
  const providers: ProviderOption[] = [
    {
      id: 'provider_1',
      label: 'Anthropic',
      type: 'anthropic',
      modelName: 'claude-3-5-sonnet-latest',
      logo: 'anthropic.png',
    },
  ];
  const draft: AgentDraft = {
    kind: 'annotation',
    nickname: '阅读伙伴',
    username: 'yomitomo',
    providerId: 'provider_1',
    personalityId: customPersonalityId,
    soul: '自定义提示词',
    annotationDensity: 'medium',
    annotationColor: '#efa927',
    temperature: 0.7,
  };

  it('links visible labels to agent inputs', () => {
    render(<AgentForm draft={draft} error="" providers={providers} onChange={vi.fn()} />);

    expect(screen.getByLabelText('用户名')).toBeTruthy();
    expect(screen.getByLabelText('自定义系统提示词')).toBeTruthy();
    expect(document.querySelector('.provider-select-logo')).toBeTruthy();
  });

  it('exposes type-specific option sets as keyboard-operable radio groups', () => {
    const onChange = vi.fn();
    render(<AgentForm draft={draft} error="" providers={providers} onChange={onChange} />);

    const densityGroup = screen.getByRole('radiogroup', { name: '批注密度' });
    const personalityGroup = screen.getByRole('radiogroup', { name: '个性' });

    expect(screen.queryByLabelText('助手类型')).toBeNull();
    expect(screen.getByRole('radio', { name: /标准/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /自定义个性/ }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.keyDown(densityGroup, { key: 'ArrowRight' });
    fireEvent.keyDown(personalityGroup, { key: 'Home' });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ annotationDensity: 'high' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ personalityId: 'reading-partner' }),
    );
  });

  it('uses type-specific avatar presets without assistant upload', () => {
    render(
      <AgentForm
        draft={{ ...draft, kind: 'review', avatar: reviewAgentAvatars[0]?.src }}
        error=""
        providers={providers}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('上传')).toBeNull();
    expect(document.querySelectorAll('.avatar-choice')).toHaveLength(20);
    expect(document.querySelector('.avatar-choice.is-active img')?.getAttribute('src')).toBe(
      reviewAgentAvatars[0]?.src,
    );
  });
});

describe('AgentSettings', () => {
  const providers: ProviderOption[] = [
    {
      id: 'provider_1',
      label: 'Anthropic',
      type: 'anthropic',
      modelName: 'claude-3-5-sonnet-latest',
      logo: 'anthropic.png',
    },
  ];
  const agents: Agent[] = [
    makeAgent('agent_reading', 'annotation', '阅读伙伴', 'yomitomo'),
    makeAgent('agent_review', 'review', '审核助手', 'reviewer'),
  ];

  it('creates agents after choosing a type in the dialog', () => {
    const onCreate = vi.fn();
    render(
      <AgentSettings
        agents={agents}
        draft={agents[0]!}
        error=""
        providers={providers}
        selectedId={agents[0]!.id}
        canSave
        onChange={vi.fn()}
        onCreate={onCreate}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /新增助手/ }));
    const dialog = screen.getByRole('dialog', { name: '选择助手类型' });
    fireEvent.click(within(dialog).getByRole('button', { name: /审核助手/ }));

    expect(onCreate).toHaveBeenCalledWith('review');
    expect(screen.getByRole('tab', { name: /审核助手/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('filters configured agents by type tabs', () => {
    const onSelect = vi.fn();
    render(
      <AgentSettings
        agents={agents}
        draft={agents[0]!}
        error=""
        providers={providers}
        selectedId={agents[0]!.id}
        canSave
        onChange={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        saveState="idle"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /审核助手/ }));

    expect(onSelect).toHaveBeenCalledWith(agents[1]);
    expect(screen.getByRole('tab', { name: /审核助手/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});

function makeAgent(id: string, kind: Agent['kind'], nickname: string, username: string): Agent {
  return {
    id,
    kind,
    providerId: 'provider_1',
    nickname,
    username,
    avatar:
      kind === 'review' ? reviewAgentAvatars[0]?.src || 'AI' : readingAgentAvatars[0]?.src || 'AI',
    annotationColor: '#efa927',
    annotationDensity: 'medium',
    temperature: 0.35,
    soul: '自定义提示词',
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
  };
}

describe('GeneralSettings', () => {
  it('keeps the pairing identity visible when no reader session is active', () => {
    render(
      <GeneralSettings
        draft={defaultUser}
        pairingConnectionStatus={{ authenticatedSocketCount: 0 }}
        pairingInfo={{
          token: 'desktop-token',
          pairingId: 'YMT-123456',
          updatedAt: '2026-05-04T00:00:00.000Z',
        }}
        providers={[]}
        settingsDraft={{}}
        canSave={false}
        onChange={vi.fn()}
        onSettingsChange={vi.fn()}
        onSave={vi.fn()}
        onRotatePairing={vi.fn()}
        saveState="idle"
      />,
    );

    expect(screen.getByText('插件未工作')).toBeTruthy();
    expect(screen.getByText('YMT-123456')).toBeTruthy();
    expect(screen.queryByDisplayValue('desktop-token')).toBeNull();
  });

  it('describes active connections as reader sessions', () => {
    render(
      <GeneralSettings
        draft={defaultUser}
        pairingConnectionStatus={{ authenticatedSocketCount: 2 }}
        pairingInfo={{
          token: 'desktop-token',
          pairingId: 'YMT-123456',
          updatedAt: '2026-05-04T00:00:00.000Z',
        }}
        providers={[]}
        settingsDraft={{}}
        canSave={false}
        onChange={vi.fn()}
        onSettingsChange={vi.fn()}
        onSave={vi.fn()}
        onRotatePairing={vi.fn()}
        saveState="idle"
      />,
    );

    expect(screen.getByText('2 个阅读器会话正在连接本机')).toBeTruthy();
  });

  it('updates the save images setting', () => {
    const onSettingsChange = vi.fn();
    render(
      <GeneralSettings
        draft={defaultUser}
        pairingConnectionStatus={{ authenticatedSocketCount: 0 }}
        pairingInfo={null}
        providers={[]}
        settingsDraft={{ saveArticleImages: false }}
        canSave={false}
        onChange={vi.fn()}
        onSettingsChange={onSettingsChange}
        onSave={vi.fn()}
        onRotatePairing={vi.fn()}
        saveState="idle"
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /保存文章图片/ }));

    expect(onSettingsChange).toHaveBeenCalledWith({ saveArticleImages: true });
  });
});
