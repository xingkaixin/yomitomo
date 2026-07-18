import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';
import { cleanupE2ePath, createE2eUserDataDir, createTinyEpubData } from '../helpers/e2e-data';

let userDataDir = '';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir),
  },
}));

vi.mock('../../src/main/native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return {
    loadSQLiteDatabase: () => SQLiteDatabase,
  };
});

describe('desktop smoke', () => {
  beforeEach(async () => {
    userDataDir = await createE2eUserDataDir('desktop-smoke');
  });

  afterEach(async () => {
    const { closeDatabase } = await import('../../src/main/store/store-lifecycle');
    closeDatabase();
    await cleanupE2ePath(userDataDir);
  });

  it('imports an EPUB and persists it after reopening the database', async () => {
    const imported = await importSmokeEpub();
    expect(imported).toMatchObject({
      sourceType: 'ebook',
      title: 'E2E Smoke Book',
    });

    const { closeDatabase } = await import('../../src/main/store/store-lifecycle');
    const { readArticle } = await import('../../src/main/store/store-articles');
    closeDatabase();
    const persisted = await readArticle(imported.id);

    expect(persisted).toMatchObject({
      id: imported.id,
      sourceType: 'ebook',
      title: 'E2E Smoke Book',
    });
  });
});

async function importSmokeEpub(): Promise<ArticleRecord> {
  const { articleRecordFromEpubFile } = await import('../../src/main/ebooks/ebook-import');
  const { saveEbookSourceFile, deleteEbookSourceFile } =
    await import('../../src/main/ebooks/ebook-storage');
  const { importArticleSource } = await import('../../src/main/articles/article-source-import');
  const { findArticleByIdentity, readArticle, saveArticle } =
    await import('../../src/main/store/store-articles');
  const data = await createTinyEpubData();
  const record = await articleRecordFromEpubFile({
    data,
    fileName: 'smoke.epub',
    mimeType: 'application/epub+zip',
  });
  const result = await importArticleSource({
    record,
    repository: { findArticleByIdentity, readArticle, saveArticle },
    saveSourceFile: (articleId) => saveEbookSourceFile(articleId, data),
    cleanupSourceFile: deleteEbookSourceFile,
  });
  if (result.status !== 'imported') {
    throw new Error(`Expected imported article, received ${result.status}`);
  }
  return result.article;
}
