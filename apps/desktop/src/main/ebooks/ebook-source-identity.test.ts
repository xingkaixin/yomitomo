import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { ArticleRecord } from '@yomitomo/shared';

const testState = vi.hoisted(() => ({ directory: '' }));
vi.mock('electron', () => ({ app: { getPath: () => testState.directory } }));
vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return { loadSQLiteDatabase: () => SQLiteDatabase };
});
vi.mock('../app/logger', () => ({ logError: vi.fn() }));

import { closeDatabase } from '../store/store-lifecycle';
import { getDatabase } from '../store/store-db';
import * as schema from '../db/schema';
import { findArticleByIdentityRows, readArticleRows } from '../articles/article-row-queries';
import { saveArticleRows } from '../articles/article-row-writes';
import {
  importArticleSource,
  type ArticleSourceImportRepository,
} from '../articles/article-source-import';
import { readEbookSourceFile, stageEbookSourceFile } from './ebook-storage';
import { resolveEbookImportRecord } from './ebook-source-identity';
import { articleRecordFromEpubFile } from './ebook-import';
import type { ImportedEbookArticle } from './ebook-import-types';

const repository: ArticleSourceImportRepository = {
  findArticleByIdentity: (identity) => findArticleByIdentityRows(getDatabase(), identity),
  readArticle: async (id: string) => readArticleRows(getDatabase(), id),
  saveArticle: saveArticleRows,
};

beforeEach(async () => {
  closeDatabase();
  testState.directory = await mkdtemp(join(tmpdir(), 'yomitomo-ebook-identity-'));
});

afterEach(async () => {
  closeDatabase();
  await rm(testState.directory, { recursive: true, force: true });
});

describe('ebook source identity', () => {
  it('keeps different sources and their indexes separate while deduplicating identical files', async () => {
    const original = await book('Original ending');
    const revised = await book('Revised ending');
    expect((await importBook(original)).status).toBe('imported');
    expect((await importBook(revised)).status).toBe('imported');
    expect((await importBook(original)).status).toBe('duplicate');

    expect(getDatabase().select().from(schema.articles).all()).toHaveLength(2);
    for (const input of [original, revised]) {
      await expect(readEbookSourceFile(input.record.id)).resolves.toEqual(Buffer.from(input.data));
      expect(readArticleRows(getDatabase(), input.record.id)?.ebook?.index).toEqual(
        input.record.ebook.index,
      );
    }
  });

  it('restores an identical legacy book without changing its identity or reading state', async () => {
    const original = await book('Original ending');
    const legacy = legacyRecord(original.record);
    await saveArticleRows(legacy);

    const result = await importBook(original);

    expect(result.status).toBe('duplicate');
    if (result.status === 'canceled') throw new Error('Unexpected canceled import');
    expect(result.article.id).toBe(legacy.id);
    expect(result.article).not.toHaveProperty('legacyId');
    expect(result.article.readingProgress).toEqual(legacy.readingProgress);
    expect(result.article.ebook?.index?.articleId).toBe(legacy.id);
    expect(getDatabase().select().from(schema.articles).all()).toHaveLength(1);
    await expect(readEbookSourceFile(legacy.id)).resolves.toEqual(Buffer.from(original.data));
  });

  it('does not reuse a legacy prefix collision or overwrite its source', async () => {
    const original = await book('Original ending');
    const revised = await book('Revised ending');
    const legacy = legacyRecord(original.record);
    await saveArticleRows(legacy);
    await importBook(original);

    const result = await importBook(revised);

    expect(result.status).toBe('imported');
    expect(readArticleRows(getDatabase(), legacy.id)?.ebook?.chapters).toEqual(
      legacy.ebook.chapters,
    );
    await expect(readEbookSourceFile(legacy.id)).resolves.toEqual(Buffer.from(original.data));
    await expect(readEbookSourceFile(revised.record.id)).resolves.toEqual(
      Buffer.from(revised.data),
    );
    expect(getDatabase().select().from(schema.articles).all()).toHaveLength(2);
  });
});

async function importBook(input: Awaited<ReturnType<typeof book>>) {
  const record = await resolveEbookImportRecord(input.record, repository);
  return importArticleSource({
    record,
    repository,
    stageSourceAssets: (id) => stageEbookSourceFile(id, input.data),
  });
}

async function book(ending: string) {
  const text = `${'Shared opening. '.repeat(900)}${ending}`;
  const zip = new JSZip();
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
    <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>
      <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
    </rootfiles></container>`,
  );
  zip.file(
    'OPS/package.opf',
    `<?xml version="1.0"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Same book</dc:title></metadata>
      <manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="c1"/></spine>
    </package>`,
  );
  zip.file('OPS/chapter.xhtml', `<html><body><p>${text}</p></body></html>`);
  const data = await zip.generateAsync({ type: 'arraybuffer' });
  const record = await articleRecordFromEpubFile({ fileName: 'book.epub', data });
  return { record, data };
}

function legacyRecord(
  imported: ImportedEbookArticle,
): Extract<ArticleRecord, { sourceType: 'ebook' }> {
  const { legacyId, ...record } = imported;
  return {
    ...record,
    id: legacyId,
    url: `ebook:${legacyId}`,
    canonicalUrl: `ebook:${legacyId}`,
    contentHash: 'old_prefix_hash',
    readingProgress: {
      kind: 'chapter',
      chapterIndex: 0,
      chapterProgress: 0.5,
      bookProgress: 0.5,
      updatedAt: record.updatedAt,
    },
    ebook: { ...record.ebook, index: { ...record.ebook.index!, articleId: legacyId } },
  };
}
