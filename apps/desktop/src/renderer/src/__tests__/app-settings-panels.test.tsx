// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentForm,
  AgentSettings,
  GeneralSettings,
  ProviderForm,
  readingAgentAvatars,
  reviewAgentAvatars,
} from '../app-settings-panels';
import { defaultUser, emptyProvider, type AgentDraft } from '../app-settings';
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
    render(<AgentForm draft={draft} error="" providers={providers} onChange={vi.fn()} />);

    expect(screen.getByLabelText('供应商')).toBeTruthy();
    expect(screen.getByText('工作照提示词')).toBeTruthy();
    expect(screen.getByRole('button', { name: /已启用/ })).toBeTruthy();
    expect(document.querySelector('.provider-select-logo')).toBeTruthy();
  });

  it('exposes density and enabled controls', () => {
    const onChange = vi.fn();
    render(<AgentForm draft={draft} error="" providers={providers} onChange={onChange} />);

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
        draft={{ ...draft, kind: 'review', avatar: reviewAgentAvatars[0]?.src }}
        error=""
        providers={providers}
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

    fireEvent.click(screen.getByRole('checkbox', { name: /关闭林知微/ }));

    expect(onToggle).toHaveBeenCalledWith(agents[0]);
  });

  it('filters configured agents by type tabs', () => {
    render(<AgentSettings agents={agents} error="" saveState="idle" onToggle={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: /深度审阅/ }));

    expect(screen.getByText('梁证言')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /深度审阅/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('can show only enabled agents', () => {
    render(
      <AgentSettings
        agents={[agents[0]!, makeAgent('agent_disabled', 'annotation', '沈清源', '沈清源', false)]}
        error=""
        saveState="idle"
        onToggle={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '仅显示已启用' }));

    expect(screen.getByText('林知微')).toBeTruthy();
    expect(screen.queryByText('沈清源')).toBeNull();
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
