// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicAgent } from '@yomitomo/shared';
import { AnnotationCommentComposer } from './reader-annotation-comment-composer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function agent(overrides: Partial<PublicAgent> = {}): PublicAgent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    enabled: true,
    nickname: '林知微',
    username: 'linzhiwei',
    pinyin: 'lin zhi wei',
    avatar: '',
    annotationColor: '#54cda0',
    annotationDensity: 'medium',
    personalityName: '林知微',
    temperature: 0.3,
    ...overrides,
  };
}

function testAgents() {
  return [
    agent(),
    agent({
      id: 'agent_2',
      nickname: '周砚',
      username: 'zhouyan',
      pinyin: 'zhou yan',
    }),
  ];
}

function renderComposer(onSubmit = vi.fn(), agents = testAgents()) {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;

  const view = render(
    <AnnotationCommentComposer
      agents={agents}
      messageSendShortcut="enter"
      shortcutModifier="⌘"
      suggestedAgents={agents}
      onSubmit={onSubmit}
    />,
  );

  return {
    container: view.container,
    onSubmit,
    scrollIntoView,
    textarea: screen.getByLabelText('留言内容') as HTMLTextAreaElement,
  };
}

describe('AnnotationCommentComposer', () => {
  it('filters mention candidates and inserts the matched agent with Tab', () => {
    const { textarea } = renderComposer();

    fireEvent.change(textarea, {
      target: { value: '问 @lin', selectionStart: 6, selectionEnd: 6 },
    });

    expect(screen.getByRole('button', { name: /林知微/ })).toBeTruthy();

    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(textarea.value).toBe('问 @linzhiwei ');
  });

  it('moves the active mention candidate with arrow keys before Tab insertion', () => {
    const { textarea } = renderComposer();

    fireEvent.change(textarea, {
      target: { value: '@', selectionStart: 1, selectionEnd: 1 },
    });
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(textarea.value).toBe('@zhouyan ');
  });

  it('keeps every matched mention candidate keyboard-selectable', () => {
    const agents = Array.from({ length: 6 }, (_, index) =>
      agent({
        id: `agent_${index + 1}`,
        nickname: `助手${index + 1}`,
        username: `agent${index + 1}`,
      }),
    );
    const { scrollIntoView, textarea } = renderComposer(vi.fn(), agents);

    fireEvent.change(textarea, {
      target: { value: '@', selectionStart: 1, selectionEnd: 1 },
    });
    for (let index = 0; index < 5; index += 1) {
      fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(textarea.value).toBe('@agent6 ');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('submits with the configured Enter shortcut and clears the draft', () => {
    const onSubmit = vi.fn();
    const { textarea } = renderComposer(onSubmit);

    fireEvent.change(textarea, {
      target: { value: '这是一条留言', selectionStart: 6, selectionEnd: 6 },
    });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('这是一条留言');
    expect(textarea.value).toBe('');
  });

  it('keeps submit shortcuts out of the visible button label', () => {
    const { container } = renderComposer();

    const submitButton = screen.getByRole('button', { name: '发送' });
    expect(submitButton.textContent).toBe('发送');
    expect(submitButton.querySelector('.reader-kbd')).toBeNull();
    expect(container.querySelector('.reader-tooltip-content')).toBeNull();
  });
});
