import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  secrets: new Map<string, string>(),
  saveProviderApiKeyError: undefined as Error | undefined,
  saveProviderApiKeyPause: undefined as Promise<void> | undefined,
  saveProviderApiKeyCalls: 0,
  deleteStoredSecretError: undefined as Error | undefined,
  providerApiKeyRef: (providerId: string) => `provider:${providerId}:apiKey`,
  backfillAnnotationMemoryEntries: vi.fn(),
  fetchFaviconDataUrl: vi.fn(),
  logErrors: [] as Array<{ event: string; error: unknown; data?: Record<string, unknown> }>,
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/yomitomo-store-reading-data-test',
  },
}));

vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return {
    loadSQLiteDatabase: () => SQLiteDatabase,
  };
});

vi.mock('../providers/provider-secrets', () => {
  return {
    providerApiKeyRef: testState.providerApiKeyRef,
    saveProviderApiKey: async (providerId: string, apiKey: string) => {
      testState.saveProviderApiKeyCalls += 1;
      await testState.saveProviderApiKeyPause;
      if (testState.saveProviderApiKeyError) throw testState.saveProviderApiKeyError;
      const ref = testState.providerApiKeyRef(providerId);
      testState.secrets.set(ref, apiKey);
      return ref;
    },
    saveStoredSecret: async (ref: string, secret: string) => {
      if (testState.saveProviderApiKeyError) throw testState.saveProviderApiKeyError;
      testState.secrets.set(ref, secret);
    },
    readProviderApiKey: async (providerId: string, apiKeyRef?: string | null) =>
      testState.secrets.get(apiKeyRef || testState.providerApiKeyRef(providerId)) || '',
    deleteStoredSecret: async (secretRef: string) => {
      if (testState.deleteStoredSecretError) throw testState.deleteStoredSecretError;
      testState.secrets.delete(secretRef);
    },
  };
});

vi.mock('../articles/article-annotation-memory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../articles/article-annotation-memory')>();
  return {
    ...actual,
    backfillStoredArticleAnnotationMemoryEntries: testState.backfillAnnotationMemoryEntries,
  };
});

vi.mock('../articles/article-favicon', () => ({
  fetchFaviconDataUrl: testState.fetchFaviconDataUrl,
}));

vi.mock('../app/logger', () => ({
  logInfo: vi.fn(),
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => {
    testState.logErrors.push({ event, error, data });
  },
}));

import { buildArticleReadingProgressPatch } from '../articles/article-reading-state';
import { queueArticleSourceCleanup } from '../articles/article-source-cleanup';
import { readEbookSourceFile, stageEbookSourceFile } from '../ebooks/ebook-storage';
import { queueSecretDeletion } from '../providers/secret-deletion-repository';
import {
  backupDatabaseFile,
  getDatabase,
  getDatabasePath,
  getSqliteExecutor,
  replaceDatabaseFile,
} from './store-db';
import { closeDatabase } from './store-lifecycle';
import { readStore } from './store-snapshot';
import { saveSettings, saveSettingsShell } from './store-settings';
import { normalizeWeReadReadingStats } from '../weread/weread-repository';
import * as schema from '../db/schema';

beforeEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-reading-data-test', { recursive: true, force: true });
  testState.secrets.clear();
  testState.saveProviderApiKeyError = undefined;
  testState.saveProviderApiKeyPause = undefined;
  testState.saveProviderApiKeyCalls = 0;
  testState.deleteStoredSecretError = undefined;
  testState.backfillAnnotationMemoryEntries.mockReset();
  testState.backfillAnnotationMemoryEntries.mockReturnValue({
    articleCount: 0,
    annotationCount: 0,
    entryCount: 0,
  });
  testState.fetchFaviconDataUrl.mockReset();
  testState.logErrors = [];
});

afterEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-reading-data-test', { recursive: true, force: true });
});

describe('desktop store reading privacy settings', () => {
  it('preserves consent through partial updates, reopen, and database backup restore', async () => {
    expect((await readStore()).settings.readingMemoryRemoteConsent).toBe(false);
    const privacySettings = {
      telemetryEnabled: false,
      onboardingCompletedAt: '2026-08-30T00:00:00.000Z',
    };
    expect((await saveSettings(privacySettings)).settings.readingMemoryRemoteConsent).toBe(false);
    const unconfirmedBackup = join(dirname(getDatabasePath()), 'unconfirmed-backup.sqlite');
    await backupDatabaseFile(unconfirmedBackup);

    const confirmed = await saveSettingsShell({ readingMemoryRemoteConsent: true });
    expect(confirmed.settings).toMatchObject({
      ...privacySettings,
      readingMemoryRemoteConsent: true,
    });
    closeDatabase();
    expect((await readStore()).settings.readingMemoryRemoteConsent).toBe(true);
    expect((await saveSettings({ uiLanguage: 'ja' })).settings.readingMemoryRemoteConsent).toBe(
      true,
    );
    const confirmedBackup = join(dirname(getDatabasePath()), 'confirmed-backup.sqlite');
    await backupDatabaseFile(confirmedBackup);
    expect(
      (await saveSettingsShell({ readingMemoryRemoteConsent: false })).settings
        .readingMemoryRemoteConsent,
    ).toBe(false);

    await replaceDatabaseFile(confirmedBackup);
    expect((await readStore()).settings).toMatchObject({
      ...privacySettings,
      readingMemoryRemoteConsent: true,
    });
    await replaceDatabaseFile(unconfirmedBackup);
    expect((await readStore()).settings).toMatchObject({
      ...privacySettings,
      readingMemoryRemoteConsent: false,
    });
  });
});

describe('desktop store cleanup recovery', () => {
  it('recovers restored secret and source tasks after the previous scan completed', async () => {
    await readStore();
    const articleId = 'restored-orphan-source';
    const secretRef = 'restored-orphan-secret';
    const assets = await stageEbookSourceFile(articleId, new Uint8Array([1, 2, 3]).buffer);
    await assets.commit();
    await assets.finalize();
    await expect(readEbookSourceFile(articleId)).resolves.toEqual(Buffer.from([1, 2, 3]));
    testState.secrets.set(secretRef, 'fixture-secret');
    queueSecretDeletion(getDatabase(), secretRef);
    queueArticleSourceCleanup(getSqliteExecutor(), articleId, 'ebook');
    const source = join(dirname(getDatabasePath()), 'pending-cleanup-backup.sqlite');
    await backupDatabaseFile(source);

    await replaceDatabaseFile(source);
    await Promise.all([readStore(), readStore()]);

    expect(getDatabase().select().from(schema.secretDeletionTasks).all()).toEqual([]);
    expect(getDatabase().select().from(schema.articleSourceCleanupTasks).all()).toEqual([]);
    expect(testState.secrets.has(secretRef)).toBe(false);
    await expect(readEbookSourceFile(articleId)).rejects.toThrow('EBOOK_SOURCE_FILE_MISSING');
  });

  it('retries a failed secret deletion only after the database changes', async () => {
    const secretRef = 'failed-cleanup-secret';
    testState.secrets.set(secretRef, 'fixture-secret');
    queueSecretDeletion(getDatabase(), secretRef);
    testState.deleteStoredSecretError = new Error('keyring locked');
    await readStore();
    const source = join(dirname(getDatabasePath()), 'failed-cleanup-backup.sqlite');
    await backupDatabaseFile(source);

    testState.deleteStoredSecretError = undefined;
    await readStore();
    expect(testState.secrets.has(secretRef)).toBe(true);
    expect(testState.logErrors).toMatchObject([{ event: 'secret_deletion.recovery_failed' }]);

    await replaceDatabaseFile(source);
    await readStore();

    expect(testState.secrets.has(secretRef)).toBe(false);
    expect(getDatabase().select().from(schema.secretDeletionTasks).all()).toEqual([]);
  });
});

describe('desktop store annotation memory backfill', () => {
  it('backfills restored annotations after the previous database completed its backfill', async () => {
    const actual = await vi.importActual<typeof import('../articles/article-annotation-memory')>(
      '../articles/article-annotation-memory',
    );
    testState.backfillAnnotationMemoryEntries.mockImplementation(
      actual.backfillStoredArticleAnnotationMemoryEntries,
    );
    await readStore();
    const original = getSqliteExecutor();
    original
      .prepare(`
      INSERT INTO articles (id, url, canonical_url, title, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        'restored-article',
        'https://example.com/restored',
        'https://example.com/restored',
        'Restored article',
        'hash',
        '2026-07-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      );
    original
      .prepare(`
      INSERT INTO annotations (id, article_id, anchor, author, color, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        'restored-annotation',
        'restored-article',
        JSON.stringify({ exact: 'Restored annotation', prefix: '', suffix: '' }),
        'user',
        '#facc15',
        'user-1',
        '2026-07-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      );
    original.prepare('UPDATE app_settings SET annotation_memory_backfill_version = NULL').run();
    const source = join(dirname(getDatabasePath()), 'legacy-memory-backup.sqlite');
    await backupDatabaseFile(source);
    original
      .prepare('UPDATE app_settings SET annotation_memory_backfill_version = ?')
      .run('annotation-memory-v1');

    await replaceDatabaseFile(source);
    await readStore();
    await readStore();

    const entries = getSqliteExecutor()
      .prepare(
        'SELECT article_id, source_annotation_id FROM reading_memory_entries WHERE article_id = ?',
      )
      .all('restored-article');
    expect(entries).toEqual([
      { article_id: 'restored-article', source_annotation_id: 'restored-annotation' },
    ]);
    expect(readAnnotationMemoryBackfillVersion()).toBe('annotation-memory-v1');
    expect(testState.backfillAnnotationMemoryEntries).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a backfill already recorded in the restored database', async () => {
    await readStore();
    const source = join(dirname(getDatabasePath()), 'completed-memory-backup.sqlite');
    await backupDatabaseFile(source);

    await replaceDatabaseFile(source);
    await readStore();
    await readStore();

    expect(testState.backfillAnnotationMemoryEntries).toHaveBeenCalledOnce();
    expect(readAnnotationMemoryBackfillVersion()).toBe('annotation-memory-v1');
  });

  it('retries on a restored database after a previous connection failed', async () => {
    testState.backfillAnnotationMemoryEntries.mockImplementationOnce(() => {
      throw new Error('backfill failed');
    });
    await readStore();
    const source = join(dirname(getDatabasePath()), 'unfinished-memory-backup.sqlite');
    await backupDatabaseFile(source);

    await replaceDatabaseFile(source);
    await readStore();

    expect(testState.backfillAnnotationMemoryEntries).toHaveBeenCalledTimes(2);
    expect(readAnnotationMemoryBackfillVersion()).toBe('annotation-memory-v1');
  });

  it('does not retry a failed annotation memory backfill on the same connection', async () => {
    const error = new Error('backfill failed');
    testState.backfillAnnotationMemoryEntries.mockImplementation(() => {
      throw error;
    });

    await readStore();
    await readStore();

    expect(testState.backfillAnnotationMemoryEntries).toHaveBeenCalledTimes(1);
    expect(testState.logErrors).toEqual([
      {
        event: 'reading-memory.backfill_annotation_memory_failed',
        error,
        data: undefined,
      },
    ]);
    expect(readAnnotationMemoryBackfillVersion()).toBeNull();
  });
});

describe('desktop store weread reading stats', () => {
  it('preserves detailed reading stats when normalizing cached snapshots', () => {
    expect(
      normalizeWeReadReadingStats(
        {
          totalReadTime: 3660,
          readDays: 3,
          dayAverageReadTime: 1220,
          readStat: [
            { stat: '阅读书籍', counts: '4' },
            { stat: '阅读时长', counts: '61分钟' },
          ],
          readTimes: {
            '1779638400': 1200,
            '1779724800': 2460,
            invalid: 'ignored',
          },
          readLongest: [
            {
              bookId: 'book_1',
              title: '自卑与超越',
              author: '阿德勒',
              cover: 'https://example.com/book.jpg',
              readTime: 1800,
              finishReadingTime: 1779724800,
            },
          ],
          preferCategory: [{ stat: '心理学', counts: '2本' }],
          preferCategoryWord: '这个周期偏爱心理学',
          preferTimeWord: '晚上读得更多',
          preferTime: [20, 21, 'ignored'],
          authorCount: 2,
        },
        'weekly',
      ),
    ).toEqual({
      mode: 'weekly',
      totalReadTime: 3660,
      readDays: 3,
      dayAverageReadTime: 1220,
      compare: undefined,
      readRate: undefined,
      wrReadTime: undefined,
      wrListenTime: undefined,
      readStat: [
        { stat: '阅读书籍', counts: '4' },
        { stat: '阅读时长', counts: '61分钟' },
      ],
      readTimes: {
        '1779638400': 1200,
        '1779724800': 2460,
      },
      readLongest: [
        {
          bookId: 'book_1',
          title: '自卑与超越',
          author: '阿德勒',
          cover: 'https://example.com/book.jpg',
          readTime: 1800,
          finishReadingTime: 1779724800,
        },
      ],
      preferCategory: [{ stat: '心理学', counts: '2本' }],
      preferCategoryWord: '这个周期偏爱心理学',
      preferTimeWord: '晚上读得更多',
      preferTime: [20, 21],
      preferAuthor: undefined,
      preferPublisher: undefined,
      authorCount: 2,
      registTime: undefined,
    });
  });
});

describe('desktop store reading progress', () => {
  it('builds only the article progress patch', () => {
    const readingProgress = {
      kind: 'chapter' as const,
      chapterIndex: 1,
      chapterProgress: 0.25,
      bookProgress: 0.31,
      updatedAt: '2026-05-17T08:00:00.000Z',
    };

    expect(buildArticleReadingProgressPatch('article_progress', readingProgress)).toEqual({
      articleId: 'article_progress',
      readingProgress,
      updatedAt: readingProgress.updatedAt,
    });
  });
});

function readAnnotationMemoryBackfillVersion() {
  return (
    getDatabase()
      .select({ version: schema.appSettings.annotationMemoryBackfillVersion })
      .from(schema.appSettings)
      .limit(1)
      .get()?.version || null
  );
}
