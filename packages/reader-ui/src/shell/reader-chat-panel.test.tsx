// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderChatPanel } from './reader-chat-panel';
import type { PublicAgent } from '@yomitomo/shared';

const now = '2026-05-12T08:00:00.000Z';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  it('focuses the composer when the reader chat opens with quoted context', () => {
    render(
      <ReaderChatPanel
        agents={[agent('agent_1', '林知微')]}
        draftContext={{
          sourceType: 'web',
          quote: '这是划线引用',
          title: '文章',
        }}
        messageSendShortcut="enter"
        open
        selectedAssistantId="agent_1"
        shortcutModifier="⌘"
        onClose={vi.fn()}
        onOpen={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('阅读问答内容')).toBe(document.activeElement);
  });

  it('shows the Q shortcut on the minimized reader chat button', () => {
    const { container } = render(
      <ReaderChatPanel
        agents={[agent('agent_1', '林知微')]}
        messageSendShortcut="enter"
        open={false}
        selectedAssistantId="agent_1"
        shortcutModifier="⌘"
        onClose={vi.fn()}
        onOpen={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const openButton = screen.getByRole('button', { name: '打开阅读问答' });
    expect(openButton).toBeTruthy();
    expect(openButton.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.reader-chat-fab-shortcut')?.textContent).toBe('Q');
  });

  it('keeps a single minimize control and clamps manual reader chat resizing to the viewport', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });

    try {
      const { container } = render(
        <ReaderChatPanel
          agents={[agent('agent_1', '林知微')]}
          messageSendShortcut="enter"
          open
          selectedAssistantId="agent_1"
          shortcutModifier="⌘"
          onClose={vi.fn()}
          onOpen={vi.fn()}
          onSubmit={vi.fn()}
        />,
      );
      const panel = container.querySelector<HTMLElement>('.reader-chat-panel')!;

      expect(panel.style.getPropertyValue('--reader-chat-panel-width')).toBe('410px');
      expect(panel.style.getPropertyValue('--reader-chat-panel-height')).toBe('640px');
      expect(screen.getByRole('button', { name: '收起阅读问答' })).toBeTruthy();
      expect(container.querySelectorAll('.reader-chat-header-actions button')).toHaveLength(1);

      const resizeHandle = container.querySelector<HTMLElement>(
        '.reader-chat-resize-handle.is-top-left',
      )!;
      fireEvent.pointerDown(resizeHandle, {
        button: 0,
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      });
      fireEvent.pointerMove(window, {
        clientX: 60,
        clientY: 70,
        pointerId: 1,
      });

      expect(panel.classList.contains('is-custom')).toBe(true);
      expect(panel.classList.contains('is-resizing')).toBe(true);
      expect(panel.style.getPropertyValue('--reader-chat-panel-width')).toBe('450px');
      expect(panel.style.getPropertyValue('--reader-chat-panel-height')).toBe('670px');
      expect(panel.style.getPropertyValue('--reader-chat-resize-scale-x')).not.toBe('1.0000');

      fireEvent.pointerMove(window, {
        clientX: -1000,
        clientY: -1000,
        pointerId: 1,
      });

      expect(panel.style.getPropertyValue('--reader-chat-panel-width')).toBe('868px');
      expect(panel.style.getPropertyValue('--reader-chat-panel-height')).toBe('788px');

      fireEvent.pointerUp(window, { pointerId: 1 });

      expect(panel.classList.contains('is-resizing')).toBe(false);
      expect(panel.style.getPropertyValue('--reader-chat-resize-scale-x')).toBe('1.0000');
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });

  it('keeps the reader chat panel mounted while it collapses into the minimized button', () => {
    vi.useFakeTimers();
    const props: React.ComponentProps<typeof ReaderChatPanel> = {
      agents: [agent('agent_1', '林知微')],
      messageSendShortcut: 'enter',
      open: true,
      selectedAssistantId: 'agent_1',
      shortcutModifier: '⌘',
      onClose: vi.fn(),
      onOpen: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { container, rerender } = render(<ReaderChatPanel {...props} />);

    rerender(<ReaderChatPanel {...props} open={false} />);

    const returningButton = screen.getByRole('button', { name: '打开阅读问答' });
    expect(returningButton).toBeTruthy();
    expect(returningButton.classList.contains('is-returning')).toBe(true);
    const closingPanel = container.querySelector<HTMLElement>('.reader-chat-panel');
    expect(closingPanel?.classList.contains('is-closing')).toBe(true);
    expect(closingPanel?.getAttribute('data-open')).toBe('false');
    expect(closingPanel?.getAttribute('data-state')).toBe('closing');

    act(() => {
      vi.advanceTimersByTime(160);
    });

    expect(container.querySelector('.reader-chat-panel')).toBeNull();
  });

  it('opens reader chat with interruptible pointer motion', () => {
    vi.useFakeTimers();
    const props: React.ComponentProps<typeof ReaderChatPanel> = {
      activationSource: 'pointer',
      agents: [agent('agent_1', '林知微')],
      messageSendShortcut: 'enter',
      open: false,
      selectedAssistantId: 'agent_1',
      shortcutModifier: '⌘',
      onClose: vi.fn(),
      onOpen: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { container, rerender } = render(<ReaderChatPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: '打开阅读问答' }));
    expect(props.onOpen).toHaveBeenCalledWith('pointer');

    rerender(<ReaderChatPanel {...props} open />);
    expect(container.querySelector('.reader-chat-panel')?.getAttribute('data-state')).toBe(
      'opening',
    );

    void act(() => vi.advanceTimersByTime(20));
    expect(container.querySelector('.reader-chat-panel')?.getAttribute('data-state')).toBe('open');
  });

  it('opens and closes reader chat immediately for keyboard activation', () => {
    const props: React.ComponentProps<typeof ReaderChatPanel> = {
      activationSource: 'pointer',
      agents: [agent('agent_1', '林知微')],
      messageSendShortcut: 'enter',
      open: false,
      selectedAssistantId: 'agent_1',
      shortcutModifier: '⌘',
      onClose: vi.fn(),
      onOpen: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { container, rerender } = render(<ReaderChatPanel {...props} />);

    rerender(<ReaderChatPanel {...props} activationSource="keyboard" open />);

    const panel = container.querySelector<HTMLElement>('.reader-chat-panel');
    expect(panel?.getAttribute('data-state')).toBe('open');
    expect(panel?.getAttribute('data-activation-source')).toBe('keyboard');
    expect(screen.getByLabelText('阅读问答内容')).toBe(document.activeElement);

    rerender(<ReaderChatPanel {...props} activationSource="keyboard" />);

    expect(container.querySelector('.reader-chat-panel')).toBeNull();
    expect(screen.getByRole('button', { name: '打开阅读问答' }).classList).not.toContain(
      'is-returning',
    );
  });

  it('keeps the panel open when pointer close is quickly reversed', () => {
    vi.useFakeTimers();
    const props: React.ComponentProps<typeof ReaderChatPanel> = {
      activationSource: 'pointer',
      agents: [agent('agent_1', '林知微')],
      messageSendShortcut: 'enter',
      open: true,
      selectedAssistantId: 'agent_1',
      shortcutModifier: '⌘',
      onClose: vi.fn(),
      onOpen: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { container, rerender } = render(<ReaderChatPanel {...props} />);

    rerender(<ReaderChatPanel {...props} open={false} />);
    rerender(<ReaderChatPanel {...props} />);
    void act(() => vi.advanceTimersByTime(200));

    expect(container.querySelector('.reader-chat-panel')?.getAttribute('data-state')).toBe('open');
  });

  it('uses avatar assistant selection and keeps quoted context inside the composer', () => {
    const agents = [agent('agent_1', '林知微'), agent('agent_2', '周砚')];

    const { container } = render(
      <ReaderChatPanel
        agents={agents}
        draftContext={{
          sourceType: 'web',
          quote: '这是划线引用',
          title: '文章',
        }}
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
                  content: '回答内容',
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

    expect(container.querySelector('.reader-chat-composer .reader-chat-context')).toBeTruthy();
    expect(screen.getByText('这是划线引用')).toBeTruthy();
    expect(
      container.querySelectorAll('.reader-chat-agent-tray .reader-agent-avatar-stack-item'),
    ).toHaveLength(2);
    expect(
      container.querySelector('.reader-chat-agent-tray .reader-agent-avatar-stack-item.is-active'),
    ).toBeTruthy();
    expect(screen.getAllByText('周砚')).toHaveLength(1);
    expect(container.querySelector('.reader-chat-agent-tray')?.textContent).not.toContain('周砚');
    expect(screen.getByText('回答内容')).toBeTruthy();
    expect(container.querySelector('.reader-chat-message time')).toBeTruthy();
  });

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

  it('renders quoted context only on reader chat user messages', () => {
    const context = {
      sourceType: 'web' as const,
      quote: '这是划线引用',
      title: '文章',
    };
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
                  role: 'user',
                  content: '这是什么意思？',
                  context,
                  createdAt: now,
                },
                {
                  id: 'message_2',
                  role: 'assistant',
                  assistantId: 'agent_2',
                  content: '回答内容',
                  context,
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

    expect(container.querySelectorAll('.reader-chat-message-context')).toHaveLength(1);
    expect(
      container.querySelector('.reader-chat-message.is-user .reader-chat-message-context'),
    ).toBeTruthy();
    expect(
      container.querySelector('.reader-chat-message.is-assistant .reader-chat-message-context'),
    ).toBeFalsy();
  });

  it('renders streaming assistant reader chat text without markdown block structure', () => {
    const { container } = render(
      <ReaderChatPanel
        agents={[agent('agent_2', '周砚')]}
        messageSendShortcut="enter"
        open
        selectedAssistantId="agent_2"
        sending
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
                  role: 'user',
                  content: '这是什么意思？',
                  createdAt: now,
                },
                {
                  id: 'message_2',
                  role: 'assistant',
                  assistantId: 'agent_2',
                  content: '> 这是流式过程中的半截引用\n\n回答正文',
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

    expect(container.querySelector('.reader-chat-markdown blockquote')).toBeFalsy();
    expect(container.querySelector('.reader-chat-message.is-assistant p')?.textContent).toContain(
      '> 这是流式过程中的半截引用',
    );
  });
});
