// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReadingEvidence, ReadingJudgmentOutput } from '@yomitomo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadingLibraryAnswer } from './reading-library-answer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key} ${values.count}`,
  }),
}));

type LibraryAnswer = Extract<ReadingJudgmentOutput, { kind: 'library-answer' }>;
const sectionNames = ['judgments', 'supporting', 'opposingOrLimiting', 'gaps'] as const;
const first = evidence('first');
const second = evidence('second');
const saveLabel = 'readingMemory.library.answer.saveThought';

afterEach(() => cleanup());

describe('ReadingLibraryAnswer', () => {
  it('renders the four sections in order while treating generated text as plain text', () => {
    const output: LibraryAnswer = {
      kind: 'library-answer',
      judgments: [{ text: '我曾支持多次复习。', evidenceIds: [first.id] }],
      supporting: [
        { text: '<img src="private" onerror="alert(1)"> 原始结论', evidenceIds: [first.id] },
      ],
      opposingOrLimiting: [{ text: '短期間には異なる条件がある。', evidenceIds: [first.id] }],
      gaps: [
        { text: 'The excerpt does not establish long-term effects.', evidenceIds: [first.id] },
      ],
    };
    const onSaveThought = vi.fn();
    const onOpenEvidenceSource = vi.fn();
    const { container } = render(
      <ReadingLibraryAnswer
        output={output}
        evidence={[first]}
        onOpenEvidenceSource={onOpenEvidenceSource}
        onSaveThought={onSaveThought}
      />,
    );

    expect(screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual(
      sectionNames.map((name) => `readingMemory.library.answer.${name}`),
    );
    for (const section of sectionNames) {
      const region = within(
        screen.getByRole('region', { name: `readingMemory.library.answer.${section}` }),
      );
      expect(region.getByText(output[section][0].text)).toBeTruthy();
      expect(region.getByRole('button', { name: saveLabel })).toBeTruthy();
    }
    expect(container.querySelector('img')).toBeNull();
    expect(onSaveThought).not.toHaveBeenCalled();
    expect(onOpenEvidenceSource).not.toHaveBeenCalled();
  });

  it('expands every citation through unified cards and passes the complete claim to save', () => {
    const claim = { text: '这个判断需要两份材料共同支撑。', evidenceIds: [second.id, first.id] };
    const onSaveThought = vi.fn();
    const onOpenEvidenceSource = vi.fn();
    render(
      <ReadingLibraryAnswer
        output={answer({ supporting: [claim] })}
        evidence={[first, second]}
        onOpenEvidenceSource={onOpenEvidenceSource}
        onSaveThought={onSaveThought}
      />,
    );
    const summary = screen.getByText('readingMemory.library.answer.citations 2');
    const disclosure = summary.closest('details')!;
    expect(disclosure.open).toBe(false);

    fireEvent.click(summary);

    expect(disclosure.open).toBe(true);
    const cards = within(disclosure).getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText(second.content)).toBeTruthy();
    expect(within(cards[1]).getByText(first.content)).toBeTruthy();
    expect(within(cards[0]).getByText(second.source.title)).toBeTruthy();
    expect(within(cards[0]).getByText('readingEvidence.authors.user')).toBeTruthy();
    expect(within(cards[0]).getByLabelText('readingEvidence.excerpt').textContent).toContain(
      second.location.anchor.exact,
    );
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'readingEvidence.openSource' }));
    fireEvent.click(
      within(cards[1]).getByRole('button', { name: 'readingEvidence.openDiscussion' }),
    );
    expect(onOpenEvidenceSource.mock.calls).toEqual([
      [
        {
          articleId: second.source.ref.id,
          annotationId: second.location.annotationId,
          view: 'source',
        },
      ],
      [
        {
          articleId: first.source.ref.id,
          annotationId: first.location.annotationId,
          view: 'discussion',
        },
      ],
    ]);
    expect(onSaveThought).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: saveLabel }));

    expect(onSaveThought).toHaveBeenCalledExactlyOnceWith(claim);
    expect(claim.evidenceIds).toEqual([second.id, first.id]);
  });

  it('drops uncited, partly unknown, and repeated-citation claims without repairing them', () => {
    const valid = { text: '独立的有效判断。', evidenceIds: [first.id] };
    const rejected = [
      { text: '没有引用的结论。', evidenceIds: [] },
      { text: '同时需要有效和范围外材料。', evidenceIds: [first.id, 'outside-scope'] },
      { text: '重复引用的结论。', evidenceIds: [first.id, first.id] },
    ];
    const onSaveThought = vi.fn();
    render(
      <ReadingLibraryAnswer
        output={answer({ judgments: rejected, supporting: [valid] })}
        evidence={[first]}
        onOpenEvidenceSource={vi.fn()}
        onSaveThought={onSaveThought}
      />,
    );

    for (const claim of rejected) expect(screen.queryByText(claim.text)).toBeNull();
    expect(screen.getAllByRole('button', { name: saveLabel })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: saveLabel }));
    expect(onSaveThought).toHaveBeenCalledExactlyOnceWith(valid);
  });

  it('removes an expanded conclusion and save action as soon as any citation leaves the evidence set', () => {
    const claim = { text: '两份引用均有效才显示的结论。', evidenceIds: [first.id, second.id] };
    const props = {
      output: answer({ supporting: [claim] }),
      evidence: [first, second],
      onOpenEvidenceSource: vi.fn(),
      onSaveThought: vi.fn(),
    };
    const { rerender } = render(<ReadingLibraryAnswer {...props} />);
    fireEvent.click(screen.getByText('readingMemory.library.answer.citations 2'));
    expect(screen.getAllByRole('article')).toHaveLength(2);

    rerender(<ReadingLibraryAnswer {...props} evidence={[first]} />);

    expect(screen.queryByText(claim.text)).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('button', { name: saveLabel })).toBeNull();
    expect(screen.getAllByText('readingMemory.library.answer.emptySection')).toHaveLength(4);
    expect(props.onSaveThought).not.toHaveBeenCalled();
    expect(props.onOpenEvidenceSource).not.toHaveBeenCalled();
  });
});

function answer(sections: Partial<Omit<LibraryAnswer, 'kind'>> = {}): LibraryAnswer {
  return {
    kind: 'library-answer',
    judgments: [],
    supporting: [],
    opposingOrLimiting: [],
    gaps: [],
    ...sections,
  };
}

function evidence(id: string): ReadingEvidence {
  return {
    id,
    assetType: 'comment',
    role: 'judgment',
    authorKind: 'user',
    content: `先前的阅读判断 ${id}`,
    sourceVersion: `version-${id}`,
    source: {
      ref: { kind: 'article', id: `article-${id}` },
      sourceType: 'web',
      title: `来源 ${id}`,
      byline: '研究札记',
    },
    location: {
      annotationId: `annotation-${id}`,
      commentId: `comment-${id}`,
      anchor: { exact: `原文摘录 ${id}`, prefix: '', suffix: '', start: 0, end: 10 },
    },
    createdAt: '2026-08-30T00:00:00Z',
    updatedAt: '2026-08-30T00:00:00Z',
  };
}
