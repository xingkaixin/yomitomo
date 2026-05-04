// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentForm, ProviderForm } from '../app-settings-panels';
import { customPersonalityId, emptyProvider, type AgentDraft } from '../app-settings';
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
});

describe('AgentForm', () => {
  const providers: ProviderOption[] = [
    {
      id: 'provider_1',
      label: 'Anthropic',
      type: 'anthropic',
      modelName: 'claude-3-5-sonnet-latest',
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
});
