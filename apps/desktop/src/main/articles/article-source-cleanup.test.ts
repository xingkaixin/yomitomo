import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ArticleRecord } from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cleanupState = vi.hoisted(() => ({
  deleteError: undefined as Error | undefined,
  deletedArticleIds: [] as string[],
  logErrors: [] as Array<{ event: string; error: unknown; data?: Record<string, unknown> }>,
  userData: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => cleanupState.userData,
  },
}));

vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return {
    loadSQLiteDatabase: () => SQLiteDatabase,
  };
});

vi.mock('../ebooks/ebook-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ebooks/ebook-storage')>();
  return {
    ...actual,
    deleteEbookSourceFile: vi.fn(async (articleId: string) => {
      if (cleanupState.deleteError) throw cleanupState.deleteError;
      await actual.deleteEbookSourceFile(articleId);
      cleanupState.deletedArticleIds.push(articleId);
    }),
  };
});

vi.mock('../app/logger', () => ({
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => {
    cleanupState.logErrors.push({ event, error, data });
  },
}));

import * as schema from '../db/schema';
import { closeDatabase } from '../store/store-lifecycle';
import { getDatabase, getSqliteExecutor, readDatabaseLifecycle } from '../store/store-db';
import {
  deleteEbookSourceFile,
  readEbookSourceFile,
  stageEbookSourceFile,
} from '../ebooks/ebook-storage';
import { findArticleByIdentityRows, readArticleRows } from './article-row-queries';
import { saveArticleRows } from './article-row-writes';
import { deleteArticleRowsWithMemoryLifecycle } from './article-repository-lifecycle';
import { importArticleSource } from './article-source-import';
import {
  completeArticleSourceCleanup,
  recoverPendingArticleSourceCleanup,
} from './article-source-cleanup';

beforeEach(async () => {
  closeDatabase();
  cleanupState.userData = await import('node:fs/promises').then((fs) =>
    fs.mkdtemp(join(tmpdir(), 'yomitomo-source-cleanup-')),
  );
  cleanupState.deleteError = undefined;
  cleanupState.deletedArticleIds = [];
  cleanupState.logErrors = [];
});

afterEach(async () => {
  closeDatabase();
  await rm(cleanupState.userData, { force: true, recursive: true });
});

describe('article source cleanup recovery', () => {
  it('preserves a reimported source when failed cleanup is retried after restart', async () => {
    const id = 'reimported';
    await importEbook(id);
    deleteArticleRowsWithMemoryLifecycle(getSqliteExecutor(), id);
    cleanupState.deleteError = new Error('injected source delete failure');
    await completeArticleSourceCleanup(id);
    expect(readCleanupTasks()).toHaveLength(1);
    cleanupState.deleteError = undefined;

    expect((await importEbook(id)).status).toBe('imported');
    closeDatabase();
    await recoverPendingArticleSourceCleanup();

    await expect(readEbookSourceFile(id)).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(readArticleRows(getDatabase(), id)).not.toBeNull();
    expect(readCleanupTasks()).toEqual([]);
  });

  it('waits for active cleanup before reimporting without blocking other articles', async () => {
    const id = 'reimport_during_cleanup';
    await importEbook(id);
    deleteArticleRowsWithMemoryLifecycle(getSqliteExecutor(), id);
    const started = deferred();
    const resume = deferred();
    const actual =
      await vi.importActual<typeof import('../ebooks/ebook-storage')>('../ebooks/ebook-storage');
    vi.mocked(deleteEbookSourceFile).mockImplementationOnce(async (articleId) => {
      started.resolve();
      await resume.promise;
      await actual.deleteEbookSourceFile(articleId);
    });

    const cleanup = completeArticleSourceCleanup(id);
    await started.promise;
    const importing = importEbook(id);
    try {
      expect((await importEbook('unrelated')).status).toBe('imported');
      expect(readArticleRows(getDatabase(), id)).toBeNull();
    } finally {
      resume.resolve();
      await Promise.all([cleanup, importing]);
    }
    await expect(readEbookSourceFile(id)).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(readArticleRows(getDatabase(), id)).not.toBeNull();
    expect(readCleanupTasks()).toEqual([]);
  });

  it('holds its database lease until detached source cleanup finishes', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(deleteEbookSourceFile).mockImplementationOnce(() => pending);
    insertCleanupTask('article_pending', 'ebook');
    const cleanup = completeArticleSourceCleanup('article_pending');
    try {
      await vi.waitFor(() => expect(deleteEbookSourceFile).toHaveBeenCalledWith('article_pending'));
      expect(readDatabaseLifecycle().leases).toBe(1);
      expect(readCleanupTasks()).toHaveLength(1);
    } finally {
      release();
      await cleanup;
    }
    expect(readCleanupTasks()).toEqual([]);
    expect(readDatabaseLifecycle().leases).toBe(0);
  });

  it('keeps failed cleanup tasks and retries them after recovery reset', async () => {
    const deleteError = new Error('injected source delete failure');
    cleanupState.deleteError = deleteError;
    insertCleanupTask('article_1', 'ebook');

    await completeArticleSourceCleanup('article_1');

    expect(readCleanupTasks()).toHaveLength(1);
    expect(cleanupState.logErrors).toContainEqual({
      event: 'article_source.cleanup_deferred',
      error: deleteError,
      data: {
        articleId: 'article_1',
        operationId: expect.any(String),
        phase: 'delete_assets',
        sourceType: 'ebook',
      },
    });

    cleanupState.deleteError = undefined;
    closeDatabase();
    await recoverPendingArticleSourceCleanup();

    expect(cleanupState.deletedArticleIds).toEqual(['article_1']);
    expect(readCleanupTasks()).toEqual([]);
  });
});

function insertCleanupTask(articleId: string, sourceType: string) {
  getDatabase()
    .insert(schema.articleSourceCleanupTasks)
    .values({ articleId, sourceType, createdAt: new Date().toISOString() })
    .run();
}

function readCleanupTasks() {
  return getDatabase().select().from(schema.articleSourceCleanupTasks).all();
}

function importEbook(id: string) {
  const record: ArticleRecord = {
    id,
    sourceType: 'ebook',
    title: id,
    url: `ebook:${id}`,
    canonicalUrl: `ebook:${id}`,
    contentHash: id,
    annotations: [],
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ebook: {
      metadata: { format: 'epub', fileName: 'book.epub', fileSize: 3 },
      chapters: [{ id: 'chapter-1', title: 'Chapter', html: '<p>Text</p>', textLength: 4 }],
    },
  };
  return importArticleSource({
    record,
    repository: {
      findArticleByIdentity: (identity) => findArticleByIdentityRows(getDatabase(), identity),
      readArticle: async (articleId) => readArticleRows(getDatabase(), articleId),
      saveArticle: saveArticleRows,
    },
    stageSourceAssets: (articleId) =>
      stageEbookSourceFile(articleId, new Uint8Array([1, 2, 3]).buffer),
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
