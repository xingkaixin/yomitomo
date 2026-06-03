// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@yomitomo/shared';
import { WeReadBookcase, weReadReadonlyNoteCardModel } from '../shell/app-weread-bookcase';

const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#8a8f4f',
  updatedAt: '2026-05-20T00:00:00.000Z',
};

const fallbackAuthor = {
  color: userProfile.annotationColor,
  fallback: 'K',
  name: 'Kevin',
};

afterEach(() => cleanup());

describe('weReadReadonlyNoteCardModel', () => {
  it('maps a highlight-only group to a read-only quote card', () => {
    const model = weReadReadonlyNoteCardModel(
      {
        key: 'book:1:0-4',
        chapterUid: 1,
        range: '0-4',
        createTime: 1_779_235_200,
        highlight: {
          bookmarkId: 'bookmark_1',
          bookId: 'book',
          chapterUid: 1,
          createTime: 1_779_235_200,
          markText: '划线内容',
          range: '0-4',
        },
        thoughts: [],
      },
      fallbackAuthor,
      userProfile,
    );

    expect(model).toMatchObject({
      id: 'bookmark_1',
      quote: '划线内容',
      thoughts: [],
    });
  });

  it('maps a highlight with thoughts to quote plus read-only comments', () => {
    const model = weReadReadonlyNoteCardModel(
      {
        key: 'book:1:0-4',
        chapterUid: 1,
        range: '0-4',
        createTime: 1_779_235_200,
        highlight: {
          bookmarkId: 'bookmark_1',
          bookId: 'book',
          chapterUid: 1,
          createTime: 1_779_235_200,
          markText: '划线内容',
          range: '0-4',
        },
        thoughts: [
          {
            reviewId: 'review_1',
            bookId: 'book',
            chapterUid: 1,
            range: '0-4',
            abstract: '划线内容',
            content: '我的想法',
            createTime: 1_779_235_201,
          },
        ],
      },
      fallbackAuthor,
      userProfile,
    );

    expect(model.id).toBe('bookmark_1');
    expect(model.quote).toBe('划线内容');
    expect(model.thoughts).toHaveLength(1);
    expect(model.thoughts[0]).toMatchObject({
      id: 'review_1',
      content: '我的想法',
      author: { name: 'Kevin' },
    });
  });

  it('maps a thought-only group to its abstract without creating article annotations', () => {
    const model = weReadReadonlyNoteCardModel(
      {
        key: 'review_1',
        chapterUid: 1,
        range: '0-4',
        createTime: 1_779_235_200,
        thoughts: [
          {
            reviewId: 'review_1',
            bookId: 'book',
            chapterUid: 1,
            range: '0-4',
            abstract: '摘录摘要',
            content: '只有想法',
            createTime: 1_779_235_200,
          },
        ],
      },
      fallbackAuthor,
      userProfile,
    );

    expect(model).toMatchObject({
      id: 'review_1',
      quote: '摘录摘要',
      thoughts: [{ id: 'review_1', content: '只有想法' }],
    });
  });
});

describe('WeReadBookcase', () => {
  it('uses a non-waterfall layout for empty chapters', () => {
    render(
      <WeReadBookcase
        detail={{
          book: {
            bookId: 'book',
            title: '书名',
            author: '作者',
            reviewCount: 0,
            noteCount: 0,
            bookmarkCount: 0,
            readingProgress: 12,
            readingTime: 420,
            updatedAt: '2026-05-20T00:00:00.000Z',
          },
          chapters: [
            {
              bookId: 'book',
              chapterUid: 1,
              chapterIdx: 1,
              level: 1,
              title: '第一章',
            },
          ],
          highlights: [],
          thoughts: [],
        }}
        syncing={false}
        userProfile={userProfile}
        onClose={vi.fn()}
        onOpenExternal={vi.fn()}
        onSync={vi.fn()}
      />,
    );

    const wall = screen.getByLabelText('微信读书划线和想法');
    expect(wall.classList.contains('is-empty')).toBe(true);
    expect(screen.getByText('这一章暂无同步到的划线或想法。')).toBeTruthy();
    expect(screen.getByText('作者 · 累计阅读 7 分钟')).toBeTruthy();
    expect(screen.queryByText(/% 已读/)).toBeNull();
  });
});
