// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReadingReviewEvent } from '@yomitomo/shared';
import type { ReadingReviewHistoryPage } from '../../../ipc-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadingReviewHistory } from './reading-review-history';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}));

const baseJudgment = '最初认为重复阅读就足以形成长期记忆。';
const loadMoreLabel = 'readingMemory.review.history.loadMore';

afterEach(() => cleanup());

describe('ReadingReviewHistory', () => {
  it('preserves the original judgment and every version of the review history as plain text', () => {
    const events = [
      review('latest', {
        assetVersion: 'version-2',
        judgmentSnapshot: '<img src="private"> 后来的判断。',
        decision: 'need_evidence',
        answer: '',
        createdAt: '2026-08-30T02:00:00.000Z',
      }),
      review('changed', {
        assetVersion: 'version-1',
        judgmentSnapshot: '只需要重复阅读。',
        decision: 'changed',
        answer: '主动提取也很重要。',
        createdAt: '2026-08-29T02:00:00.000Z',
      }),
      review('first', {
        assetVersion: 'version-1',
        judgmentSnapshot: '重复阅读能够帮助记忆。',
        decision: 'still_agree',
        answer: '这仍符合我当时的经验。',
        createdAt: '2026-08-28T02:00:00.000Z',
      }),
    ];
    const onLoadMore = vi.fn();
    const { container } = render(
      <ReadingReviewHistory
        baseJudgment={baseJudgment}
        history={{ events, nextCursor: null }}
        status="idle"
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByText(baseJudgment)).toBeTruthy();
    const entries = screen.getAllByRole('article');
    expect(entries).toHaveLength(events.length);
    events.forEach((event, index) => {
      const entry = within(entries[index]);
      expect(entry.getByText(event.judgmentSnapshot)).toBeTruthy();
      expect(entry.getByText(event.answer || 'readingMemory.review.history.noAnswer')).toBeTruthy();
      expect(entry.getByText(`readingMemory.review.decisions.${event.decision}`)).toBeTruthy();
      const time = entries[index].querySelector('time');
      expect(time?.dateTime).toBe(event.createdAt);
      expect(time?.textContent).toContain('2026');
    });
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('loads more only on demand and keeps all records when the parent appends a page', () => {
    const first = review('first');
    const older = review('older', { judgmentSnapshot: '更早的判断。' });
    const history: ReadingReviewHistoryPage = {
      events: [first],
      nextCursor: { createdAt: first.createdAt, id: first.id },
    };
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <ReadingReviewHistory
        baseJudgment={baseJudgment}
        history={history}
        status="idle"
        onLoadMore={onLoadMore}
      />,
    );

    expect(onLoadMore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: loadMoreLabel }));
    expect(onLoadMore).toHaveBeenCalledOnce();

    rerender(
      <ReadingReviewHistory
        baseJudgment={baseJudgment}
        history={{ events: [first, older], nextCursor: null }}
        status="idle"
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByText(baseJudgment)).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText(first.judgmentSnapshot)).toBeTruthy();
    expect(screen.getByText(older.judgmentSnapshot)).toBeTruthy();
    expect(screen.queryByRole('button', { name: loadMoreLabel })).toBeNull();
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('retains loaded records while loading and allows explicit retry after failure', () => {
    const event = review('first');
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <ReadingReviewHistory
        baseJudgment={baseJudgment}
        history={{
          events: [event],
          nextCursor: { createdAt: event.createdAt, id: event.id },
        }}
        status="loading"
        onLoadMore={onLoadMore}
      />,
    );

    const button = screen.getByRole('button', { name: loadMoreLabel }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onLoadMore).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('readingMemory.review.history.loading');
    expect(screen.getByText(event.judgmentSnapshot)).toBeTruthy();

    rerender(
      <ReadingReviewHistory
        baseJudgment={baseJudgment}
        history={{ events: [event], nextCursor: null }}
        status="failed"
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe('readingMemory.review.history.failed');
    expect(screen.getByText(event.judgmentSnapshot)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.history.retry' }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('shows the original judgment and an honest empty state without fetching', () => {
    const onLoadMore = vi.fn();
    render(
      <ReadingReviewHistory
        baseJudgment={baseJudgment}
        history={{ events: [], nextCursor: null }}
        status="idle"
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByText(baseJudgment)).toBeTruthy();
    expect(screen.getByText('readingMemory.review.history.empty')).toBeTruthy();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});

function review(id: string, overrides: Partial<ReadingReviewEvent> = {}): ReadingReviewEvent {
  return {
    articleId: 'article',
    annotationId: 'annotation',
    assetType: 'comment',
    assetId: 'comment',
    id,
    assetVersion: 'version-1',
    judgmentSnapshot: '先前保存的判断。',
    judgmentDigest: 'digest',
    previousReviewId: null,
    decision: 'still_agree',
    answer: '仍然认可这个判断。',
    createdAt: '2026-08-30T02:00:00.000Z',
    ...overrides,
  };
}
