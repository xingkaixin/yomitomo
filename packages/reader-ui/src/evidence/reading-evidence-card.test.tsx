// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadingEvidenceCard } from './reading-evidence-card';

const labels = {
  excerpt: '原文摘录',
  openSource: '打开来源',
  openDiscussion: '查看讨论',
  locationUnavailable: '原位置已失效，仍可打开来源。',
};
const evidence = {
  content: '间隔复习支持长期保持，但不保证短期成绩。',
  assetLabel: '我的判断',
  sourceTitle: '学习的条件',
};

afterEach(() => cleanup());

describe('ReadingEvidenceCard', () => {
  it('displays evidence, attribution, source, date and relation using caller labels', () => {
    render(
      <ReadingEvidenceCard
        className="library-evidence"
        evidence={{
          ...evidence,
          excerpt: 'Distributed practice improves delayed retention.',
          authorLabel: 'Kevin',
          sourceDetail: '第三章 · 练习与记忆',
          date: { dateTime: '2026-08-30T08:00:00Z', label: '2026年8月30日' },
          relation: { label: '补充', explanation: '这条旧判断限定了适用的时间尺度。' },
        }}
        labels={labels}
        onOpenSource={() => {}}
      />,
    );

    expect(screen.getByRole('article').classList.contains('library-evidence')).toBe(true);
    expect(screen.getByText(evidence.content)).toBeTruthy();
    expect(screen.getByText(evidence.assetLabel)).toBeTruthy();
    expect(screen.getByText('Kevin')).toBeTruthy();
    expect(screen.getByLabelText(labels.excerpt).tagName).toBe('BLOCKQUOTE');
    expect(screen.getByText('Distributed practice improves delayed retention.')).toBeTruthy();
    expect(screen.getByText(evidence.sourceTitle)).toBeTruthy();
    expect(screen.getByText('第三章 · 练习与记忆')).toBeTruthy();
    expect(screen.getByText('2026年8月30日').getAttribute('datetime')).toBe('2026-08-30T08:00:00Z');
    expect(screen.getByText('补充')).toBeTruthy();
    expect(screen.getByText('这条旧判断限定了适用的时间尺度。')).toBeTruthy();
  });

  it('keeps source and discussion actions available when location is explicitly unavailable', () => {
    const onOpenSource = vi.fn();
    const onOpenDiscussion = vi.fn();
    render(
      <ReadingEvidenceCard
        evidence={{ ...evidence, locationUnavailable: true }}
        labels={labels}
        onOpenSource={onOpenSource}
        onOpenDiscussion={onOpenDiscussion}
      />,
    );

    expect(screen.getByRole('status').textContent).toBe(labels.locationUnavailable);
    const sourceButton = screen.getByRole('button', { name: labels.openSource });
    const discussionButton = screen.getByRole('button', { name: labels.openDiscussion });
    expect(sourceButton.getAttribute('type')).toBe('button');
    expect(discussionButton.getAttribute('type')).toBe('button');
    fireEvent.click(sourceButton);
    fireEvent.click(discussionButton);
    expect(onOpenSource).toHaveBeenCalledOnce();
    expect(onOpenDiscussion).toHaveBeenCalledOnce();
  });

  it('renders untrusted text literally and does not infer failure from absent optional content', () => {
    const content = '<img src="remote" onerror="alert(1)"> **原始判断**';
    const { container } = render(
      <ReadingEvidenceCard
        evidence={{ ...evidence, content }}
        labels={labels}
        onOpenSource={() => {}}
      />,
    );

    expect(screen.getByText(content)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('time')).toBeNull();
    expect(screen.queryByLabelText(labels.excerpt)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: labels.openDiscussion })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: labels.openSource })).toBeTruthy();
  });
});
