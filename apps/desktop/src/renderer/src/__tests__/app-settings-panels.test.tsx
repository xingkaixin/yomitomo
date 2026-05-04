// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AgentForm,
  GeneralSettings,
  ProviderForm,
  readingAgentAvatars,
  reviewAgentAvatars,
} from '../app-settings-panels';
import { customPersonalityId, defaultUser, emptyProvider, type AgentDraft } from '../app-settings';
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
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ modelName: 'gpt-5.2' }));
  });
});

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

  it('exposes option sets as keyboard-operable radio groups', () => {
    const onChange = vi.fn();
    render(<AgentForm draft={draft} error="" providers={providers} onChange={onChange} />);

    const kindGroup = screen.getByRole('radiogroup', { name: '助手类型' });
    const densityGroup = screen.getByRole('radiogroup', { name: '批注密度' });
    const personalityGroup = screen.getByRole('radiogroup', { name: '个性' });

    expect(screen.getByRole('radio', { name: /阅读助手/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('radio', { name: /标准/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /自定义个性/ }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.keyDown(kindGroup, { key: 'ArrowRight' });
    fireEvent.keyDown(densityGroup, { key: 'ArrowRight' });
    fireEvent.keyDown(personalityGroup, { key: 'Home' });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'review' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ annotationDensity: 'high' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ personalityId: 'reading-partner' }),
    );
  });

  it('uses type-specific avatar presets without assistant upload', () => {
    const onChange = vi.fn();
    render(
      <AgentForm
        draft={{ ...draft, avatar: readingAgentAvatars[0]?.src }}
        error=""
        providers={providers}
        onChange={onChange}
      />,
    );

    expect(screen.queryByText('上传')).toBeNull();
    expect(document.querySelectorAll('.avatar-choice')).toHaveLength(20);

    fireEvent.click(screen.getByRole('radio', { name: /审核助手/ }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'review', avatar: reviewAgentAvatars[0]?.src }),
    );
  });
});

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
});
