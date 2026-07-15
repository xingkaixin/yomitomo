import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeReadBookDetail } from '@yomitomo/shared';

const testPaths = vi.hoisted(() => ({
  userData: '',
}));

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
  deleteStoredSecret: vi.fn(),
  readWeReadApiKey: vi.fn(async () => ''),
  saveWeReadApiKey: vi.fn(async () => 'weread:default:apiKey'),
  wereadApiKeyRef: () => 'weread:default:apiKey',
}));

import * as schema from '../db/schema';
import { closeDatabase, getDatabase } from '../store/store-db';
import { readWeReadBookDetail, saveWeReadLibrarySnapshot } from './weread-repository';
import { syncWeReadLibrary } from './weread-sync';

beforeEach(async () => {
  closeDatabase();
  testPaths.userData = await import('node:fs/promises').then((fs) =>
    fs.mkdtemp(join(tmpdir(), 'yomitomo-weread-sync-test-')),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabase();
  await rm(testPaths.userData, { recursive: true, force: true });
  testPaths.userData = '';
});

describe('WeRead full sync persistence', () => {
  it.each([
    ['missing books', { hasMore: 0 }],
    ['wrong books type', { books: {}, hasMore: 0 }],
    ['non-object response', 'upstream unavailable'],
  ])('preserves local data for an invalid notebook response: %s', async (_name, body) => {
    await seedStoredBook('book_existing');
    mockGateway(() => body);

    await expect(runSync()).rejects.toThrow('Failed to parse WeRead response');

    expectStoredBookAndReferences('book_existing');
  });

  it('preserves local data when a detail response is incomplete', async () => {
    await seedStoredBook('book_existing');
    mockGateway((apiName) =>
      apiName === '/user/notebooks'
        ? notebookPage('book_existing', 1)
        : apiName === '/book/bookmarklist'
          ? { updated: 'invalid' }
          : validDetailResponse(apiName, 'book_existing'),
    );

    await expect(runSync()).rejects.toThrow('Failed to parse WeRead response');

    expectStoredBookAndReferences('book_existing');
  });

  it('clears local data for a valid authoritative empty library', async () => {
    await seedStoredBook('book_removed');
    mockGateway((apiName) => {
      if (apiName !== '/user/notebooks') throw new Error(`Unexpected WeRead API: ${apiName}`);
      return { books: [], hasMore: 0 };
    });

    await expect(runSync()).resolves.toBeDefined();

    expect(readWeReadBookDetail('book_removed')).toBeNull();
    expect(tableRows(schema.collectionMembers)).toEqual([]);
    expect(tableRows(schema.libraryPins)).toEqual([]);
  });

  it('preserves a no-note book that remains in the authoritative notebook list', async () => {
    await seedStoredBook('book_without_current_notes');
    mockGateway((apiName) =>
      apiName === '/user/notebooks'
        ? notebookPage('book_without_current_notes', 0)
        : validDetailResponse(apiName, 'book_without_current_notes'),
    );

    await expect(runSync()).resolves.toBeDefined();

    expectStoredBookAndReferences('book_without_current_notes');
  });
});

function runSync() {
  return syncWeReadLibrary({
    persistence: {
      readStoredWeReadApiKey: async () => 'secret',
      saveWeReadLibrarySnapshot,
    },
    reason: 'test',
    logInfo: vi.fn(),
    logError: vi.fn(),
    elapsedMs: () => 1,
  });
}

function mockGateway(responseForApi: (apiName: string) => unknown) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '') as {
      api_name?: string;
    };
    return new Response(JSON.stringify(responseForApi(body.api_name || '')), { status: 200 });
  });
}

function notebookPage(bookId: string, noteCount: number) {
  return {
    books: [{ bookId, title: `Notebook ${bookId}`, noteCount, sort: 1 }],
    hasMore: 0,
  };
}

function validDetailResponse(apiName: string, bookId: string) {
  if (apiName === '/book/info') return { bookId, title: `Detail ${bookId}` };
  if (apiName === '/book/chapterinfo') return { chapters: [] };
  if (apiName === '/book/getprogress') return { book: {} };
  if (apiName === '/book/bookmarklist') return { updated: [] };
  if (apiName === '/review/list/mine') return { reviews: [], hasMore: 0 };
  throw new Error(`Unexpected WeRead API: ${apiName}`);
}

async function seedStoredBook(bookId: string) {
  await saveWeReadLibrarySnapshot({
    details: [storedDetail(bookId)],
    authoritativeBookIds: [bookId],
  });
  insertLibraryReferences(bookId);
}

function expectStoredBookAndReferences(bookId: string) {
  expect(readWeReadBookDetail(bookId)?.highlights.map((item) => item.bookmarkId)).toEqual([
    `highlight_${bookId}`,
  ]);
  expect(tableRows(schema.collectionMembers)).toHaveLength(1);
  expect(tableRows(schema.libraryPins)).toHaveLength(1);
}

function insertLibraryReferences(bookId: string) {
  const database = getDatabase();
  database
    .insert(schema.collections)
    .values({
      id: 'collection_1',
      name: 'Collection',
      desc: null,
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
    })
    .run();
  database
    .insert(schema.collectionMembers)
    .values({
      collectionId: 'collection_1',
      memberKind: 'weread',
      memberId: bookId,
      addedAt: '2026-07-15T00:00:00.000Z',
    })
    .run();
  database
    .insert(schema.libraryPins)
    .values({
      targetKind: 'weread',
      targetId: bookId,
      pinnedAt: '2026-07-15T00:00:00.000Z',
    })
    .run();
}

function tableRows<T extends typeof schema.collectionMembers | typeof schema.libraryPins>(
  table: T,
) {
  return getDatabase().select().from(table).all();
}

function storedDetail(bookId: string): WeReadBookDetail {
  return {
    book: {
      bookId,
      title: `Stored ${bookId}`,
      reviewCount: 0,
      noteCount: 1,
      bookmarkCount: 1,
      readingProgress: 0,
      syncedAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
    },
    chapters: [],
    highlights: [
      {
        bookmarkId: `highlight_${bookId}`,
        bookId,
        chapterUid: 1,
        range: '0-1',
        markText: 'stored highlight',
        createTime: 1,
      },
    ],
    thoughts: [],
  };
}
