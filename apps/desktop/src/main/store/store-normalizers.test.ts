import { describe, expect, it } from 'vitest';
import {
  mergeSettingsForUpsert,
  normalizeArticleReadingProgress,
  normalizeReaderChatState,
  rowToSettings,
  settingsToRow,
} from './store-normalizers';

describe('store normalizers settings', () => {
  it('clears dependent lock state when the app lock is disabled', () => {
    expect(
      mergeSettingsForUpsert(
        { appLockEnabled: false },
        { appLockEnabled: true, appLockLocked: true, appLockLockOnStartup: true },
      ),
    ).toMatchObject({
      appLockEnabled: false,
      appLockLocked: false,
      appLockLockOnStartup: false,
    });
  });

  it('round trips normalized settings through the persistence row mapping', () => {
    const settings = mergeSettingsForUpsert(
      { appLockEnabled: false, themeId: undefined },
      {
        appLockEnabled: true,
        appLockLocked: true,
        appLockLockOnStartup: true,
        selectionActionShortcuts: { copy: 'X', annotate: 'B', ask: 'Q' },
      },
    );
    const row = settingsToRow(settings, '2026-08-24T00:00:00.000Z');

    expect(row.themeId).toBeNull();
    expect(row.updatedAt).toBe('2026-08-24T00:00:00.000Z');
    expect(rowToSettings({ ...row, annotationMemoryBackfillVersion: null })).toEqual(settings);
  });
});

describe('store normalizers articles', () => {
  it('upgrades legacy source progress without synthetic or redundant fields', () => {
    const updatedAt = '2026-07-27T00:00:00.000Z';
    const legacyProgress = {
      pageIndex: 420,
      pageCount: 1000,
      progress: 0.42,
      updatedAt,
    };

    expect(normalizeArticleReadingProgress(legacyProgress, 'web')).toEqual({
      kind: 'scroll',
      progress: 0.42,
      updatedAt,
    });
    expect(normalizeArticleReadingProgress(legacyProgress)).toEqual({
      kind: 'scroll',
      progress: 0.42,
      updatedAt,
    });
    expect(normalizeArticleReadingProgress(legacyProgress, 'pdf')).toEqual({
      kind: 'page',
      pageIndex: 420,
      pageCount: 1000,
      updatedAt,
    });
    expect(
      normalizeArticleReadingProgress(
        {
          ...legacyProgress,
          chapterIndex: 2,
          chapterProgress: 0.6,
        },
        'ebook',
      ),
    ).toEqual({
      kind: 'chapter',
      chapterIndex: 2,
      chapterProgress: 0.6,
      bookProgress: 0.42,
      updatedAt,
    });
    expect(normalizeArticleReadingProgress(legacyProgress, 'ebook')).toEqual({
      kind: 'scroll',
      progress: 0.42,
      updatedAt,
    });
  });
});

describe('store normalizers annotation and chat records', () => {
  it('drops reader chat state when article or active session is inconsistent', () => {
    const validState = {
      articleId: 'article_1',
      activeSessionId: 'session_1',
      sessions: [
        {
          id: 'session_1',
          articleId: 'article_1',
          createdAt: '2026-06-11T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
          messages: [
            {
              id: 'message_1',
              role: 'assistant',
              content: 'Answer',
              context: { sourceType: 'bad', quote: 'Quote' },
              createdAt: '2026-06-11T00:00:00.000Z',
            },
          ],
        },
      ],
      createdAt: '2026-06-11T00:00:00.000Z',
      updatedAt: '2026-06-11T00:00:00.000Z',
    };

    expect(normalizeReaderChatState(validState, 'article_1')).toMatchObject({
      articleId: 'article_1',
      activeSessionId: 'session_1',
      sessions: [
        {
          messages: [
            {
              role: 'assistant',
              context: { sourceType: 'web', quote: 'Quote' },
            },
          ],
        },
      ],
    });
    expect(normalizeReaderChatState(validState, 'other_article')).toBeUndefined();
    expect(
      normalizeReaderChatState({ ...validState, activeSessionId: 'missing' }, 'article_1'),
    ).toBeUndefined();
  });
});
