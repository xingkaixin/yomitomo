// @vitest-environment jsdom

import React from 'react';
import { cleanup, render } from '@testing-library/react';
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
});
