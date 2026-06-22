// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { PublicAgent } from '@yomitomo/shared';
import { renderDiscussionMessageMarkdown } from '../annotation-discussion/app-annotation-discussion-mention-chips';

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

function renderHtml(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('discussion mention chips', () => {
  it('renders user message mentions as agent chips', () => {
    const container = renderHtml(
      renderDiscussionMessageMarkdown('问 @linzhiwei 和 @unknown', [agent()], 'user'),
    );

    const chips = container.querySelectorAll<HTMLElement>('.annotation-discussion-mention-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toBe('@linzhiwei');
    expect(chips[0]?.dataset.agentId).toBe('agent_1');
    expect(chips[0]?.dataset.mentionSource).toBe('mention');
    expect(chips[0]?.style.getPropertyValue('--mention-accent')).toBe('#54cda0');
    expect(container.textContent).toContain('@unknown');
  });

  it('uses confirmed assistant names for assistant message fallback', () => {
    const zhou = agent({
      id: 'agent_2',
      nickname: '周砚',
      username: 'zhouyan',
      annotationColor: '#8ab4f8',
    });
    const container = renderHtml(
      renderDiscussionMessageMarkdown('林知微提到了周砚', [agent(), zhou], 'ai'),
    );

    const chips = Array.from(
      container.querySelectorAll<HTMLElement>('.annotation-discussion-mention-chip'),
    );
    expect(chips.map((chip) => chip.textContent)).toEqual(['林知微', '周砚']);
    expect(chips.map((chip) => chip.dataset.mentionSource)).toEqual(['name', 'name']);
  });

  it('does not use assistant name fallback when a message has matched mentions', () => {
    const zhou = agent({
      id: 'agent_2',
      nickname: '周砚',
      username: 'zhouyan',
    });
    const container = renderHtml(
      renderDiscussionMessageMarkdown('林知微提到了 @zhouyan', [agent(), zhou], 'ai'),
    );

    const chips = Array.from(
      container.querySelectorAll<HTMLElement>('.annotation-discussion-mention-chip'),
    );
    expect(chips.map((chip) => chip.textContent)).toEqual(['@zhouyan']);
  });

  it('skips markdown code and links', () => {
    const container = renderHtml(
      renderDiscussionMessageMarkdown(
        '`@linzhiwei` [@linzhiwei](https://example.com) @linzhiwei',
        [agent()],
        'user',
      ),
    );

    const chips = container.querySelectorAll<HTMLElement>('.annotation-discussion-mention-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toBe('@linzhiwei');
    expect(container.querySelector('code')?.textContent).toBe('@linzhiwei');
    expect(container.querySelector('a')?.textContent).toBe('@linzhiwei');
  });
});
