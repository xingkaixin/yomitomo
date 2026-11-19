// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderChatPanel } from './reader-chat-panel';
import type { PublicAgent } from '@yomitomo/shared';

const now = '2026-05-12T08:00:00.000Z';

afterEach(() => {
  cleanup();
});

function agent(id: string, nickname: string): PublicAgent {
  return {
    id,
    kind: 'annotation',
    enabled: true,
    nickname,
    username: id,
    avatar: '',
    annotationColor: '#54cda0',
    annotationDensity: 'medium',
    personalityName: nickname,
    temperature: 0.3,
  };
}

describe('ReaderChatPanel', () => {
  it('sanitizes assistant markdown before injecting chat html', () => {
    const { container } = render(
      <ReaderChatPanel
        agents={[agent('agent_2', '周砚')]}
        messageSendShortcut="enter"
        open
        selectedAssistantId="agent_2"
        shortcutModifier="⌘"
        state={{
          articleId: 'article_1',
          activeSessionId: 'session_1',
          selectedAssistantId: 'agent_2',
          sessions: [
            {
              id: 'session_1',
              articleId: 'article_1',
              createdAt: now,
              updatedAt: now,
              messages: [
                {
                  id: 'message_1',
                  role: 'assistant',
                  assistantId: 'agent_2',
                  content:
                    '[safe](https://example.com) [mail](mailto:test@example.com) <script>alert(1)</script> <img src=x onerror=alert(1)>',
                  createdAt: now,
                },
              ],
            },
          ],
          createdAt: now,
          updatedAt: now,
        }}
        onClose={vi.fn()}
        onOpen={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const html = container.querySelector('.reader-chat-markdown')?.innerHTML || '';
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('mail');
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
  });

  it('exposes stop, retry, settings, copy, and confirmed clear controls', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const onStop = vi.fn();
    const onRetry = vi.fn();
    const onOpenSettings = vi.fn();
    const onClearSession = vi.fn();
    const state = {
      articleId: 'article_1',
      activeSessionId: 'session_1',
      selectedAssistantId: 'agent_2',
      sessions: [
        {
          id: 'session_1',
          articleId: 'article_1',
          title: '第一段',
          createdAt: now,
          updatedAt: now,
          messages: [
            { id: 'm1', role: 'user' as const, content: '第一段什么意思', createdAt: now },
            {
              id: 'm2',
              role: 'assistant' as const,
              assistantId: 'agent_2',
              content: '这是核心结论。',
              createdAt: now,
            },
          ],
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const { getByRole, rerender } = render(
      <ReaderChatPanel
        agents={[agent('agent_2', '周砚')]}
        error="API Key 无效"
        errorCanRetry
        errorOpenSettings
        messageSendShortcut="enter"
        open
        selectedAssistantId="agent_2"
        sending
        shortcutModifier="⌘"
        state={state}
        onClearSession={onClearSession}
        onClose={vi.fn()}
        onNewSession={vi.fn()}
        onOpen={vi.fn()}
        onOpenSettings={onOpenSettings}
        onRetry={onRetry}
        onStop={onStop}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(getByRole('button', { name: '停止生成' }));
    expect(onStop).toHaveBeenCalledOnce();

    rerender(
      <ReaderChatPanel
        agents={[agent('agent_2', '周砚')]}
        error="API Key 无效"
        errorCanRetry
        errorOpenSettings
        messageSendShortcut="enter"
        open
        selectedAssistantId="agent_2"
        sending={false}
        shortcutModifier="⌘"
        state={state}
        onClearSession={onClearSession}
        onClose={vi.fn()}
        onNewSession={vi.fn()}
        onOpen={vi.fn()}
        onOpenSettings={onOpenSettings}
        onRetry={onRetry}
        onStop={onStop}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(getByRole('button', { name: '复制回答' }));
    expect(writeText).toHaveBeenCalledWith('这是核心结论。');

    fireEvent.click(getByRole('button', { name: '前往模型设置' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();

    fireEvent.click(getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledOnce();

    fireEvent.click(getByRole('button', { name: '清空当前会话' }));
    expect(onClearSession).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: '清空会话' }));
    expect(onClearSession).toHaveBeenCalledOnce();
  });
});
