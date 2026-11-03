import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { WeReadBook, WeReadBookDetail } from '@yomitomo/shared';

const testPaths = vi.hoisted(() => ({
  userData: '',
  secrets: new Map<string, string>(),
  deleteStoredSecretError: undefined as Error | undefined,
}));
const credentialLogger = vi.hoisted(() => ({ logError: vi.fn() }));
const repositoryLogger = { logInfo: vi.fn() };

vi.mock('electron', () => ({
  app: {
    getPath: () => testPaths.userData,
  },
}));

vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return {
    loadSQLiteDatabase: () => SQLiteDatabase,
  };
});

vi.mock('../providers/provider-secrets', () => ({
  deleteStoredSecret: vi.fn(async (secretRef: string) => {
    if (testPaths.deleteStoredSecretError) throw testPaths.deleteStoredSecretError;
    testPaths.secrets.delete(secretRef);
  }),
  readWeReadApiKey: vi.fn(
    async (secretRef?: string | null) =>
      testPaths.secrets.get(secretRef || 'weread:default:apiKey') || '',
  ),
  saveWeReadApiKey: vi.fn(async (apiKey: string) => {
    testPaths.secrets.set('weread:default:apiKey', apiKey);
    return 'weread:default:apiKey';
  }),
  saveStoredSecret: vi.fn(async (ref: string, secret: string) => {
    testPaths.secrets.set(ref, secret);
  }),
  wereadApiKeyRef: () => 'weread:default:apiKey',
}));

vi.mock('../app/logger', () => ({
  logError: credentialLogger.logError,
}));

import * as schema from '../db/schema';
import { closeDatabase, getDatabase } from '../store/store-db';
import {
  readWeReadBookDetail,
  readWeReadBooks,
  saveWeReadBookDetail,
  saveWeReadLibrarySnapshot,
  saveWeReadSettings,
} from './weread-repository';

beforeEach(async () => {
  closeDatabase();
  testPaths.userData = await import('node:fs/promises').then((fs) =>
    fs.mkdtemp(join(tmpdir(), 'yomitomo-weread-repository-test-')),
  );
  testPaths.secrets.clear();
  testPaths.deleteStoredSecretError = undefined;
  repositoryLogger.logInfo.mockClear();
  credentialLogger.logError.mockClear();
});

afterEach(async () => {
  closeDatabase();
  await rm(testPaths.userData, { recursive: true, force: true });
  testPaths.userData = '';
});

describe('WeRead repository book details', () => {
  beforeEach(() => insertWeReadAccount('weread:default:apiKey'));

  it('persists book detail rows and reads them back', async () => {
    const saved = await saveDetailsSnapshot([detail('book_1')]);

    expect(saved.settings.status).toBe('connected');
    expect(saved.books.map((item) => item.bookId)).toEqual(['book_1']);
    expect(readWeReadBookDetail('book_1')).toEqual({
      book: expect.objectContaining({
        bookId: 'book_1',
        title: 'Title book_1',
        author: 'Author book_1',
      }),
      chapters: [
        {
          bookId: 'book_1',
          chapterUid: 1,
          chapterIdx: 1,
          title: 'Chapter 1',
          level: 1,
          wordCount: 1200,
        },
      ],
      highlights: [
        {
          bookmarkId: 'highlight_book_1',
          bookId: 'book_1',
          chapterUid: 1,
          chapterIdx: 1,
          range: '1-4',
          markText: 'highlight text',
          colorStyle: 2,
          createTime: 101,
        },
      ],
      thoughts: [
        {
          reviewId: 'thought_book_1',
          bookId: 'book_1',
          userVid: 123,
          author: {
            userVid: 123,
            name: 'Reader',
            avatar: 'https://example.test/avatar.png',
          },
          chapterUid: 1,
          chapterIdx: 1,
          chapterName: 'Chapter 1',
          range: '1-4',
          abstract: 'highlight text',
          content: 'thought content',
          createTime: 102,
        },
      ],
    });
  });

  it('replaces child rows when the same book detail is saved again', async () => {
    await saveDetailsSnapshot([detail('book_1')]);
    await saveDetailsSnapshot([
      {
        ...detail('book_1', { updatedAt: '2026-06-28T01:00:00.000Z' }),
        chapters: [
          { bookId: 'book_1', chapterUid: 2, chapterIdx: 2, title: 'Chapter 2', level: 1 },
        ],
        highlights: [],
        thoughts: [
          {
            reviewId: 'thought_book_1_replacement',
            bookId: 'book_1',
            content: 'replacement thought',
            chapterUid: 2,
            chapterIdx: 2,
            createTime: 201,
          },
        ],
      },
    ]);

    const saved = readWeReadBookDetail('book_1');
    expect(saved?.chapters.map((chapter) => chapter.chapterUid)).toEqual([2]);
    expect(saved?.highlights).toEqual([]);
    expect(saved?.thoughts.map((thought) => thought.reviewId)).toEqual([
      'thought_book_1_replacement',
    ]);
  });

  it('rolls back replaced child rows when a batch insert fails', async () => {
    await saveDetailsSnapshot([detail('book_rollback')]);
    getDatabase().run(`
      CREATE TRIGGER fail_weread_highlight_insert
      BEFORE INSERT ON weread_highlights
      WHEN NEW.bookmark_id = 'highlight_fail'
      BEGIN
        SELECT RAISE(ABORT, 'injected WeRead child insert failure');
      END
    `);
    const replacement = detail('book_rollback');
    replacement.chapters = [
      {
        bookId: 'book_rollback',
        chapterUid: 2,
        chapterIdx: 2,
        title: 'Replacement chapter',
        level: 1,
      },
    ];
    replacement.highlights = [
      {
        bookmarkId: 'highlight_fail',
        bookId: 'book_rollback',
        chapterUid: 2,
        markText: 'failure',
        createTime: 200,
      },
    ];

    await expect(saveDetailsSnapshot([replacement])).rejects.toThrow(
      'injected WeRead child insert failure',
    );

    expect(repositoryLogger.logInfo).toHaveBeenCalledTimes(1);
    expect(readWeReadBookDetail('book_rollback')).toEqual(
      expect.objectContaining({
        chapters: [expect.objectContaining({ chapterUid: 1 })],
        highlights: [expect.objectContaining({ bookmarkId: 'highlight_book_rollback' })],
        thoughts: [expect.objectContaining({ reviewId: 'thought_book_rollback' })],
      }),
    );
  });

  it('removes stale books and their library references during full detail sync', async () => {
    await saveDetailsSnapshot([detail('book_keep'), detail('book_stale')]);
    insertLibraryReferences('book_stale');

    await saveDetailsSnapshot([detail('book_keep', { updatedAt: '2026-06-28T02:00:00.000Z' })]);

    expect(readWeReadBooks().map((savedBook) => savedBook.bookId)).toEqual(['book_keep']);
    expect(readWeReadBookDetail('book_stale')).toBeNull();
    expect(tableRows(schema.collectionMembers)).toEqual([]);
    expect(tableRows(schema.libraryPins)).toEqual([]);
  });

  it('rejects inconsistent snapshots before writing any rows', async () => {
    await saveDetailsSnapshot([detail('book_existing')]);

    await expect(
      saveWeReadLibrarySnapshot({
        details: [detail('book_outside_authority')],
        authoritativeBookIds: ['book_existing'],
        apiKeyRef: 'weread:default:apiKey',
      }),
    ).rejects.toThrow('WEREAD_SYNC_SNAPSHOT_INCONSISTENT_DETAILS');

    expect(readWeReadBookDetail('book_existing')).not.toBeNull();
    expect(readWeReadBookDetail('book_outside_authority')).toBeNull();
  });

  it('removes a single book when its detail no longer has notes', async () => {
    await saveDetailsSnapshot([detail('book_empty_after_sync')]);

    const saved = await saveWeReadBookDetail(
      { ...detail('book_empty_after_sync'), highlights: [], thoughts: [] },
      'weread:default:apiKey',
    );

    expect(saved).toBeNull();
    expect(readWeReadBookDetail('book_empty_after_sync')).toBeNull();
  });

  it('discards library writes fetched with a replaced credential', async () => {
    await saveDetailsSnapshot([detail('book_current')]);
    insertLibraryReferences('book_current');
    const staleRef = readWeReadAccount()?.apiKeyRef ?? undefined;
    await saveWeReadSettings({ apiKey: 'weread-replacement' });

    await expect(
      saveWeReadLibrarySnapshot({
        details: [detail('book_stale')],
        authoritativeBookIds: ['book_stale'],
        apiKeyRef: staleRef,
      }),
    ).rejects.toThrow('WEREAD_CREDENTIAL_CHANGED');
    await expect(saveWeReadBookDetail(detail('book_stale'), staleRef)).rejects.toThrow(
      'WEREAD_CREDENTIAL_CHANGED',
    );

    expect(readWeReadBooks().map((savedBook) => savedBook.bookId)).toEqual(['book_current']);
    expect(tableRows(schema.collectionMembers)).toHaveLength(1);
    expect(tableRows(schema.libraryPins)).toHaveLength(1);
  });
});

describe('WeRead repository credentials', () => {
  it('removes the credential only after the account update commits', async () => {
    insertWeReadAccount('weread:default:apiKey');
    testPaths.secrets.set('weread:default:apiKey', 'weread-secret');

    await saveWeReadSettings({ removeApiKey: true });

    expect(readWeReadAccount()?.apiKeyRef).toBeNull();
    expect(testPaths.secrets.has('weread:default:apiKey')).toBe(false);
    expect(getDatabase().select().from(schema.secretDeletionTasks).all()).toEqual([]);
  });
});

function insertLibraryReferences(bookId: string) {
  const database = getDatabase();
  database
    .insert(schema.collections)
    .values({
      id: 'collection_1',
      name: 'Collection',
      desc: null,
      createdAt: '2026-06-28T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
    })
    .run();
  database
    .insert(schema.collectionMembers)
    .values({
      collectionId: 'collection_1',
      memberKind: 'weread',
      memberId: bookId,
      addedAt: '2026-06-28T00:00:00.000Z',
    })
    .run();
  database
    .insert(schema.libraryPins)
    .values({
      targetKind: 'weread',
      targetId: bookId,
      pinnedAt: '2026-06-28T00:00:00.000Z',
    })
    .run();
}

function insertWeReadAccount(apiKeyRef: string) {
  getDatabase()
    .insert(schema.wereadAccounts)
    .values({
      id: 'default',
      apiKeyRef,
      openMethod: 'deeplink',
      syncMode: 'manual',
      skillVersion: '1.0.3',
      status: 'connected',
      message: null,
      lastSyncAt: null,
      lastTestAt: null,
      updatedAt: '2026-07-15T00:00:00.000Z',
    })
    .run();
}

function readWeReadAccount() {
  return getDatabase()
    .select()
    .from(schema.wereadAccounts)
    .all()
    .find((account) => account.id === 'default');
}

function tableRows<T extends typeof schema.collectionMembers | typeof schema.libraryPins>(
  table: T,
) {
  return getDatabase().select().from(table).all();
}

function saveDetailsSnapshot(
  details: WeReadBookDetail[],
  authoritativeBookIds = details.map((item) => item.book.bookId),
) {
  return saveWeReadLibrarySnapshot(
    { details, authoritativeBookIds, apiKeyRef: readWeReadAccount()?.apiKeyRef ?? undefined },
    repositoryLogger.logInfo,
  );
}

function detail(
  bookId: string,
  options: {
    updatedAt?: string;
  } = {},
): WeReadBookDetail {
  return {
    book: book(bookId, options.updatedAt),
    chapters: [
      {
        bookId,
        chapterUid: 1,
        chapterIdx: 1,
        title: 'Chapter 1',
        level: 1,
        wordCount: 1200,
      },
    ],
    highlights: [
      {
        bookmarkId: `highlight_${bookId}`,
        bookId,
        chapterUid: 1,
        chapterIdx: 1,
        range: '1-4',
        markText: 'highlight text',
        colorStyle: 2,
        createTime: 101,
      },
    ],
    thoughts: [
      {
        reviewId: `thought_${bookId}`,
        bookId,
        userVid: 123,
        author: {
          userVid: 123,
          name: 'Reader',
          avatar: 'https://example.test/avatar.png',
        },
        chapterUid: 1,
        chapterIdx: 1,
        chapterName: 'Chapter 1',
        range: '1-4',
        abstract: 'highlight text',
        content: 'thought content',
        createTime: 102,
      },
    ],
  };
}

function book(bookId: string, updatedAt = '2026-06-28T00:00:00.000Z'): WeReadBook {
  return {
    bookId,
    title: `Title ${bookId}`,
    author: `Author ${bookId}`,
    cover: `https://example.test/${bookId}.jpg`,
    intro: 'intro',
    reviewCount: 1,
    noteCount: 1,
    bookmarkCount: 1,
    readingProgress: 42,
    markedStatus: 1,
    sort: 100,
    currentChapterUid: 1,
    currentChapterOffset: 12,
    readingTime: 300,
    recordReadingTime: 600,
    lastReadAt: 200,
    syncedAt: '2026-06-28T00:00:00.000Z',
    updatedAt,
  };
}
