import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';

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
    userDataDir = await mkdtemp(join(tmpdir(), 'yomitomo-e2e-'));
  });

  afterEach(async () => {
    const { closeDatabase } = await import('../../src/main/store/store');
    closeDatabase();
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('imports an EPUB and persists it after reopening the database', async () => {
    const imported = await importSmokeEpub();
    expect(imported).toMatchObject({
      sourceType: 'ebook',
      title: 'E2E Smoke Book',
    });

    const { closeDatabase, readArticle } = await import('../../src/main/store/store');
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
    await import('../../src/main/store/store');
  const data = await createSmokeEpub();
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

async function createSmokeEpub() {
  const zip = new JSZip();
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`,
  );
  zip.file(
    'OPS/package.opf',
    `<?xml version="1.0"?>
    <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>E2E Smoke Book</dc:title>
        <dc:creator>Yomitomo Test</dc:creator>
        <dc:language>en</dc:language>
      </metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="c1"/>
      </spine>
    </package>`,
  );
  zip.file(
    'OPS/nav.xhtml',
    `<html><body><nav epub:type="toc"><ol>
      <li><a href="chapter1.xhtml">Chapter One</a></li>
    </ol></nav></body></html>`,
  );
  zip.file(
    'OPS/chapter1.xhtml',
    '<html><body><h1>Chapter One</h1><p>This is the first E2E smoke paragraph.</p></body></html>',
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}
