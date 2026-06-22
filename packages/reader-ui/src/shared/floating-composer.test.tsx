// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicAgent } from '@yomitomo/shared';
import { FloatingComposer } from './floating-composer';

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

function renderComposer(value: string, onScroll = vi.fn()) {
  const view = render(
    <FloatingComposer
      mentionAgents={[agent()]}
      submitLabel="发送"
      textarea={{
        'aria-label': '正文',
        value,
        onChange: vi.fn(),
        onScroll,
      }}
      onSubmit={vi.fn()}
    />,
  );

  return {
    ...view,
    onScroll,
    textarea: screen.getByLabelText('正文') as HTMLTextAreaElement,
  };
}

describe('FloatingComposer mention overlay', () => {
  it('renders matched mentions as overlay chips while keeping textarea text plain', () => {
    const { container, textarea } = renderComposer('请 @linzhiwei 看看');

    expect(textarea.value).toBe('请 @linzhiwei 看看');
    expect(container.querySelector('.floating-composer')?.className).toContain(
      'has-mention-overlay',
    );
    const chip = container.querySelector<HTMLElement>('.floating-composer-mention-chip');
    expect(chip?.textContent).toBe('@linzhiwei');
    expect(chip?.style.getPropertyValue('--mention-accent')).toBe('#54cda0');
  });

  it('keeps the plain textarea when no mention matches', () => {
    const { container, textarea } = renderComposer('请 @unknown 看看');

    expect(textarea.value).toBe('请 @unknown 看看');
    expect(container.querySelector('.floating-composer')?.className).not.toContain(
      'has-mention-overlay',
    );
    expect(container.querySelector('.floating-composer-mention-chip')).toBeNull();
  });

  it('preserves caller scroll handlers when the overlay is active', () => {
    const { onScroll, textarea } = renderComposer('请 @linzhiwei 看看');

    fireEvent.scroll(textarea, { target: { scrollTop: 12, scrollLeft: 3 } });

    expect(onScroll).toHaveBeenCalledTimes(1);
  });
});
