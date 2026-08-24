// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeReadBook, WeReadBookDetail } from '@yomitomo/shared';
import { useWeReadLibrarySession } from './use-weread-library-session';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useWeReadLibrarySession', () => {
  it('opens a cached book once without starting a redundant sync', async () => {
    const detail = weReadDetail();
    const syncBook = vi.fn();
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        getState: vi.fn().mockResolvedValue({
          settings: { configured: true, openMethod: 'deeplink' },
          books: [detail.book],
        }),
        getBook: vi.fn().mockResolvedValue(detail),
        syncBook,
      },
    });
    const onResetLibrary = vi.fn();
    const onShowBook = vi.fn();
    const { result } = renderHook(() => useWeReadLibrarySession({ onResetLibrary, onShowBook }));

    await act(() => result.current.openBook(detail.book));

    expect(onResetLibrary).toHaveBeenCalledOnce();
    expect(onShowBook).toHaveBeenCalledOnce();
    expect(onShowBook).toHaveBeenCalledWith(detail);
    expect(syncBook).not.toHaveBeenCalled();
  });
});

function weReadDetail(): WeReadBookDetail {
  const book: WeReadBook = {
    bookId: 'weread_1',
    title: '微信读书标题',
    reviewCount: 1,
    noteCount: 1,
    bookmarkCount: 1,
    readingProgress: 20,
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
  return {
    book,
    chapters: [{ bookId: book.bookId, chapterUid: 1, chapterIdx: 0, title: '第一章', level: 1 }],
    highlights: [],
    thoughts: [],
  };
}
