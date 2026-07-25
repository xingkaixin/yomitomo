import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

vi.mock('../ebooks/ebook-storage', () => ({
  deleteEbookSourceFile: vi.fn(async (articleId: string) => {
    if (cleanupState.deleteError) throw cleanupState.deleteError;
    cleanupState.deletedArticleIds.push(articleId);
  }),
}));

vi.mock('../app/logger', () => ({
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => {
    cleanupState.logErrors.push({ event, error, data });
  },
}));

import * as schema from '../db/schema';
import { closeDatabase } from '../store/store-lifecycle';
import { getDatabase } from '../store/store-db';
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
