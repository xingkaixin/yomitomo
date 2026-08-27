import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { WeReadBook, WeReadBookDetail, WeReadReadingStatsSnapshot } from '@yomitomo/shared';

const testPaths = vi.hoisted(() => ({
  userData: '',
  secrets: new Map<string, string>(),
  sqlStatements: [] as string[],
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
    loadSQLiteDatabase: () =>
      class extends SQLiteDatabase {
        constructor(path: string) {
          super(path, { verbose: (sql) => testPaths.sqlStatements.push(String(sql)) });
        }
      },
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
import { saveStoredSecret } from '../providers/provider-secrets';
import { closeDatabase, getDatabase } from '../store/store-db';
import {
  readWeReadBookDetail,
  readWeReadBooks,
  readWeReadReadingStatsState,
  readWeReadState,
  saveWeReadBookDetail,
  saveWeReadLibrarySnapshot,
  saveWeReadReadingStatsSnapshot,
  saveWeReadSettings,
  saveWeReadTestResult,
} from './weread-repository';

beforeEach(async () => {
  closeDatabase();
  testPaths.userData = await import('node:fs/promises').then((fs) =>
    fs.mkdtemp(join(tmpdir(), 'yomitomo-weread-repository-test-')),
  );
  testPaths.secrets.clear();
  testPaths.sqlStatements = [];
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

  it('batches every per-book write across a large snapshot', async () => {
    await saveDetailsSnapshot(Array.from({ length: 100 }, (_, index) => detail(`book_${index}`)));

    expect(childInsertStatements()).toHaveLength(4);
    expect(bookUpsertStatements()).toHaveLength(2);
    expect(childDeleteStatements()).toHaveLength(3);
    expect(repositoryLogger.logInfo).toHaveBeenCalledWith('weread.repository.detail_rows_saved', {
      scope: 'library_snapshot',
      bookCount: 100,
      chapterRowCount: 100,
      highlightRowCount: 100,
      thoughtRowCount: 100,
      writeStatementCount: 9,
      transactionDurationMs: expect.any(Number),
    });
  });

  it('keeps the per-book statement count flat as the snapshot grows', async () => {
    const counts: number[] = [];
    for (const bookCount of [1, 10, 100]) {
      testPaths.sqlStatements.length = 0;
      await saveDetailsSnapshot(
        Array.from({ length: bookCount }, (_, index) => detail(`book_${index}`)),
      );
      counts.push(bookUpsertStatements().length + childDeleteStatements().length);
    }

    expect(counts).toEqual([4, 4, 5]);
  });

  it('chunks dense child rows below the conservative SQLite parameter limit', async () => {
    await saveDetailsSnapshot([denseDetail('book_dense', 1_000)]);

    expect(childInsertStatements()).toHaveLength(28);
    expect(repositoryLogger.logInfo).toHaveBeenCalledWith(
      'weread.repository.detail_rows_saved',
      expect.objectContaining({
        chapterRowCount: 1_000,
        highlightRowCount: 1_000,
        thoughtRowCount: 1_000,
        writeStatementCount: 32,
      }),
    );
  });

  it('skips child inserts for an empty detail snapshot', async () => {
    await saveDetailsSnapshot([], []);

    expect(childInsertStatements()).toEqual([]);
    expect(repositoryLogger.logInfo).toHaveBeenCalledWith('weread.repository.detail_rows_saved', {
      scope: 'library_snapshot',
      bookCount: 0,
      chapterRowCount: 0,
      highlightRowCount: 0,
      thoughtRowCount: 0,
      writeStatementCount: 0,
      transactionDurationMs: expect.any(Number),
    });
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

  it('preserves a stored book while it remains in the authoritative notebook list', async () => {
    await saveDetailsSnapshot([detail('book_without_current_notes')]);
    insertLibraryReferences('book_without_current_notes');

    await saveDetailsSnapshot([], ['book_without_current_notes']);

    expect(readWeReadBookDetail('book_without_current_notes')).not.toBeNull();
    expect(tableRows(schema.collectionMembers)).toHaveLength(1);
    expect(tableRows(schema.libraryPins)).toHaveLength(1);
  });

  it('clears stored books and library references for an authoritative empty library', async () => {
    await saveDetailsSnapshot([detail('book_removed')]);
    insertLibraryReferences('book_removed');

    await saveDetailsSnapshot([], []);

    expect(readWeReadBookDetail('book_removed')).toBeNull();
    expect(tableRows(schema.collectionMembers)).toEqual([]);
    expect(tableRows(schema.libraryPins)).toEqual([]);
  });

  it('rejects inconsistent snapshots before writing any rows', async () => {
    await saveDetailsSnapshot([detail('book_existing')]);

    await expect(
      saveWeReadLibrarySnapshot({
        details: [detail('book_outside_authority')],
        authoritativeBookIds: ['book_existing'],
      }),
    ).rejects.toThrow('WEREAD_SYNC_SNAPSHOT_INCONSISTENT_DETAILS');

    expect(readWeReadBookDetail('book_existing')).not.toBeNull();
    expect(readWeReadBookDetail('book_outside_authority')).toBeNull();
  });

  it('removes a single book when its detail no longer has notes', async () => {
    await saveDetailsSnapshot([detail('book_empty_after_sync')]);

    const saved = await saveWeReadBookDetail({
      ...detail('book_empty_after_sync'),
      highlights: [],
      thoughts: [],
    });

    expect(saved).toBeNull();
    expect(readWeReadBookDetail('book_empty_after_sync')).toBeNull();
  });
});

describe('WeRead repository credentials', () => {
  it('preserves preferences saved after a pending credential replacement', async () => {
    await saveWeReadSettings({ apiKey: 'weread-old' });
    const preparation = pauseNextCredentialSave();
    const saving = saveWeReadSettings({ apiKey: 'weread-new' });
    await preparation.started;

    const preferences = saveWeReadSettings({ openMethod: 'web', syncMode: 'auto' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    preparation.resolve();
    await Promise.all([saving, preferences]);

    const state = await readWeReadState();
    expect(state.settings).toMatchObject({
      configured: true,
      openMethod: 'web',
      syncMode: 'auto',
    });
    expect([...testPaths.secrets.values()]).toEqual(['weread-new']);
    expect(getDatabase().select().from(schema.secretDeletionTasks).all()).toEqual([]);
  });

  it('keeps the credential removed after an earlier replacement finishes', async () => {
    await saveWeReadSettings({ apiKey: 'weread-old' });
    const preparation = pauseNextCredentialSave();
    const saving = saveWeReadSettings({ apiKey: 'weread-new' });
    await preparation.started;

    const removing = saveWeReadSettings({ removeApiKey: true });
    await new Promise<void>((resolve) => setImmediate(resolve));
    preparation.resolve();
    await Promise.all([saving, removing]);

    const state = await readWeReadState();
    expect(state.settings.configured).toBe(false);
    expect(readWeReadAccount()?.apiKeyRef).toBeNull();
    expect(testPaths.secrets.size).toBe(0);
    expect(getDatabase().select().from(schema.secretDeletionTasks).all()).toEqual([]);
  });

  it('preserves sync and test results completed during credential preparation', async () => {
    await saveWeReadSettings({ apiKey: 'weread-old' });
    const preparation = pauseNextCredentialSave();
    const saving = saveWeReadSettings({ apiKey: 'weread-new' });
    await preparation.started;

    await saveDetailsSnapshot([detail('book_1')]);
    const tested = await saveWeReadTestResult(false, 'Connection test failed');
    preparation.resolve();
    const saved = await saving;

    expect(tested.settings.lastSyncAt).toBeTruthy();
    expect(tested.settings.lastTestAt).toBeTruthy();
    expect(saved.settings).toMatchObject({
      configured: true,
      status: 'error',
      message: 'Connection test failed',
      lastSyncAt: tested.settings.lastSyncAt,
      lastTestAt: tested.settings.lastTestAt,
    });
    expect(saved.books.map((item) => item.bookId)).toEqual(['book_1']);
  });

  it('continues a queued removal after credential preparation fails', async () => {
    await saveWeReadSettings({ apiKey: 'weread-old' });
    const preparation = pauseNextCredentialSave();
    const error = new Error('keyring unavailable');
    const saving = saveWeReadSettings({ apiKey: 'weread-new' }).catch((failure) => failure);
    await preparation.started;

    const removing = saveWeReadSettings({ removeApiKey: true });
    preparation.reject(error);
    expect(await saving).toBe(error);
    await expect(removing).resolves.toMatchObject({ settings: { configured: false } });

    expect(readWeReadAccount()?.apiKeyRef).toBeNull();
    expect(testPaths.secrets.size).toBe(0);
    expect(getDatabase().select().from(schema.secretDeletionTasks).all()).toEqual([]);
  });

  it('records the credential state when api key replacement cannot commit', async () => {
    insertWeReadAccount('weread:default:apiKey');
    testPaths.secrets.set('weread:default:apiKey', 'weread-old');
    getDatabase().run(`
      CREATE TRIGGER fail_weread_key_replacement
      BEFORE UPDATE ON weread_accounts
      BEGIN
        SELECT RAISE(ABORT, 'injected WeRead replacement failure');
      END
    `);

    await expect(saveWeReadSettings({ apiKey: 'weread-new' })).rejects.toThrow(
      'injected WeRead replacement failure',
    );

    expect(testPaths.secrets.get('weread:default:apiKey')).toBe('weread-old');
    expect([...testPaths.secrets.keys()]).toEqual(['weread:default:apiKey']);
    expect(credentialLogger.logError).toHaveBeenCalledWith(
      'credential_swap.transaction_failed',
      expect.objectContaining({ message: 'injected WeRead replacement failure' }),
      {
        owner: 'weread',
        ownerId: 'default',
        apiKeyRef: expect.stringMatching(/^weread:default:apiKey:version:/),
      },
    );
  });

  it('preserves the credential when api key removal cannot commit', async () => {
    insertWeReadAccount('weread:default:apiKey');
    testPaths.secrets.set('weread:default:apiKey', 'weread-secret');
    getDatabase().run(`
      CREATE TRIGGER fail_weread_account_update
      BEFORE UPDATE ON weread_accounts
      BEGIN
        SELECT RAISE(ABORT, 'injected WeRead update failure');
      END
    `);

    await expect(saveWeReadSettings({ removeApiKey: true })).rejects.toThrow(
      'injected WeRead update failure',
    );

    expect(readWeReadAccount()?.apiKeyRef).toBe('weread:default:apiKey');
    expect(testPaths.secrets.get('weread:default:apiKey')).toBe('weread-secret');
    expect(getDatabase().select().from(schema.secretDeletionTasks).all()).toEqual([]);
  });

  it('switches the account ref before retiring a replaced credential', async () => {
    insertWeReadAccount('weread:default:apiKey');
    testPaths.secrets.set('weread:default:apiKey', 'weread-old');

    await saveWeReadSettings({ apiKey: 'weread-new' });

    const replacementRef = readWeReadAccount()?.apiKeyRef;
    expect(replacementRef).toMatch(/^weread:default:apiKey:version:/);
    expect(testPaths.secrets.has('weread:default:apiKey')).toBe(false);
    expect(testPaths.secrets.get(replacementRef || '')).toBe('weread-new');
    expect(getDatabase().select().from(schema.secretDeletionTasks).all()).toEqual([]);
  });

  it('removes the credential only after the account update commits', async () => {
    insertWeReadAccount('weread:default:apiKey');
    testPaths.secrets.set('weread:default:apiKey', 'weread-secret');

    await saveWeReadSettings({ removeApiKey: true });

    expect(readWeReadAccount()?.apiKeyRef).toBeNull();
    expect(testPaths.secrets.has('weread:default:apiKey')).toBe(false);
    expect(getDatabase().select().from(schema.secretDeletionTasks).all()).toEqual([]);
  });

  it('reports committed settings when credential cleanup is deferred', async () => {
    const deleteError = new Error('keyring locked');
    insertWeReadAccount('weread:default:apiKey');
    testPaths.secrets.set('weread:default:apiKey', 'weread-secret');
    testPaths.deleteStoredSecretError = deleteError;

    await expect(saveWeReadSettings({ removeApiKey: true })).resolves.toMatchObject({
      settings: { configured: false },
    });

    expect(readWeReadAccount()?.apiKeyRef).toBeNull();
    expect(testPaths.secrets.get('weread:default:apiKey')).toBe('weread-secret');
    expect(getDatabase().select().from(schema.secretDeletionTasks).all()).toEqual([
      expect.objectContaining({ secretRef: 'weread:default:apiKey' }),
    ]);
    expect(credentialLogger.logError).toHaveBeenCalledWith(
      'credential_swap.committed_cleanup_deferred',
      deleteError,
      {
        owner: 'weread',
        ownerId: 'default',
        secretRef: 'weread:default:apiKey',
      },
    );
  });
});

describe('WeRead repository reading stats', () => {
  it('upserts reading stats snapshots and reads normalized data back', () => {
    saveWeReadReadingStatsSnapshot(statsSnapshot({ totalReadTime: 10 }));
    const state = saveWeReadReadingStatsSnapshot(statsSnapshot({ totalReadTime: 20 }));

    expect(state.snapshots).toHaveLength(1);
    expect(readWeReadReadingStatsState().snapshots).toEqual([
      expect.objectContaining({
        id: 'overall:0',
        mode: 'overall',
        periodStart: 0,
        sourceBaseTime: 123,
        fetchedAt: '2026-06-28T00:00:00.000Z',
        data: expect.objectContaining({
          mode: 'overall',
          totalReadTime: 20,
          readDays: 3,
          readTimes: { morning: 2 },
          readLongest: [
            expect.objectContaining({
              bookId: 'book_1',
              title: 'Longest Book',
              readTime: 60,
            }),
          ],
        }),
      }),
    ]);
  });
});

function pauseNextCredentialSave() {
  const started = deferred<void>();
  const preparation = deferred<void>();
  vi.mocked(saveStoredSecret).mockImplementationOnce(async (ref, secret) => {
    started.resolve();
    await preparation.promise;
    testPaths.secrets.set(ref, secret);
  });
  return { started: started.promise, resolve: preparation.resolve, reject: preparation.reject };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

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
  return saveWeReadLibrarySnapshot({ details, authoritativeBookIds }, repositoryLogger.logInfo);
}

function childInsertStatements() {
  return testPaths.sqlStatements.filter((sql) =>
    /insert into "weread_(chapters|highlights|thoughts)"/i.test(sql),
  );
}

function bookUpsertStatements() {
  return testPaths.sqlStatements.filter((sql) => /insert into "weread_books"/i.test(sql));
}

function childDeleteStatements() {
  return testPaths.sqlStatements.filter((sql) =>
    /delete from "weread_(chapters|highlights|thoughts)"/i.test(sql),
  );
}

function denseDetail(bookId: string, rowCount: number) {
  const value = detail(bookId);
  value.chapters = Array.from({ length: rowCount }, (_, index) => ({
    bookId,
    chapterUid: index,
    chapterIdx: index,
    title: `Chapter ${index}`,
    level: 1,
  }));
  value.highlights = Array.from({ length: rowCount }, (_, index) => ({
    bookmarkId: `highlight_${index}`,
    bookId,
    chapterUid: index,
    markText: `Highlight ${index}`,
    createTime: index,
  }));
  value.thoughts = Array.from({ length: rowCount }, (_, index) => ({
    reviewId: `thought_${index}`,
    bookId,
    content: `Thought ${index}`,
    createTime: index,
  }));
  return value;
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

function statsSnapshot(data: { totalReadTime: number }): WeReadReadingStatsSnapshot {
  return {
    id: 'overall:0',
    mode: 'overall',
    periodStart: 0,
    sourceBaseTime: 123,
    fetchedAt: '2026-06-28T00:00:00.000Z',
    data: {
      mode: 'overall',
      totalReadTime: data.totalReadTime,
      readDays: 3,
      dayAverageReadTime: 7,
      readStat: [],
      readTimes: { morning: 2 },
      readLongest: [
        {
          bookId: 'book_1',
          title: 'Longest Book',
          author: 'Author',
          readTime: 60,
        },
      ],
      preferCategory: [],
      preferTime: [1, 2],
    },
  };
}
