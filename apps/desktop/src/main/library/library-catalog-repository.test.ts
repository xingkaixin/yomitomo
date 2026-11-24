import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { ARTICLE_SOURCE_TYPES } from '@yomitomo/shared';
import { libraryCatalogItemRef } from '../../ipc-contract';
import * as schema from '../db/schema';
import { migrations } from '../db/migrations';
import { updateArticleMetadataRows } from '../articles/article-row-writes';
import { readLibraryCatalogRows } from './library-catalog-repository';

describe('library catalog repository', () => {
  it('keeps source, collection, picker, and member-search scopes consistent', () => {
    const database = catalogDatabase();

    const webOnly = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      types: ['web'],
      pageSize: 10,
    });
    expect(webOnly.entities.map(entityKey)).toEqual([
      'article:article_pinned',
      'article:article_member',
      'article:article_loose',
    ]);

    const collection = readLibraryCatalogRows(database, {
      scope: { kind: 'collection', collectionId: 'collection_1' },
      pageSize: 10,
    });
    expect(collection.entities.map(entityKey)).toEqual(['article:article_member']);

    const picker = readLibraryCatalogRows(database, {
      scope: { kind: 'picker', collectionId: 'collection_1' },
      pageSize: 10,
    });
    expect(picker.entities.map(entityKey)).not.toContain('article:article_member');

    const search = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      query: 'member topic',
      pageSize: 10,
    });
    expect(search.entities.map(entityKey)).toEqual(['collection_1']);
    expect(search.unfilteredCount).toBe(4);
  });

  it('matches the mixed-source oracle on a deep page while returning one page', () => {
    const { database, oracle } = largeCatalogDatabase();
    const page = 8;
    const pageSize = 17;

    const result = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      page,
      pageSize,
    });

    expect(result.totalCount).toBe(oracle.length);
    expect(result.entities).toHaveLength(pageSize);
    expect(result.entities.map(entityKey)).toEqual(
      oracle.slice((page - 1) * pageSize, page * pageSize).map((candidate) => candidate.key),
    );
    expect(result.itemCounts).toEqual({
      web: 40,
      ebook: 40,
      pdf: 40,
      text: 40,
      weread: 20,
    });
  });

  it('sorts by recent update, title, reading progress, and annotation count while keeping pins first', () => {
    const database = sortAndStatusDatabase();

    const byRecent = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      sort: 'recent',
      pageSize: 10,
    });
    expect(byRecent.entities.map(entityKey)).toEqual([
      'article:a_pinned',
      'article:a_done',
      'weread:w_annotated',
      'article:a_reading',
      'collection_1',
    ]);

    const byTitle = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      sort: 'title',
      pageSize: 10,
    });
    expect(byTitle.entities.map(entityKey)).toEqual([
      'article:a_pinned',
      'article:a_reading',
      'article:a_done',
      'collection_1',
      'weread:w_annotated',
    ]);

    const byProgress = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      sort: 'progress',
      pageSize: 10,
    });
    expect(byProgress.entities.map(entityKey)).toEqual([
      'article:a_pinned',
      'article:a_done',
      'article:a_reading',
      'weread:w_annotated',
      'collection_1',
    ]);

    const byAnnotations = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      sort: 'annotations',
      pageSize: 10,
    });
    expect(byAnnotations.entities.map(entityKey)).toEqual([
      'article:a_pinned',
      'weread:w_annotated',
      'article:a_reading',
      'article:a_done',
      'collection_1',
    ]);
  });

  it('filters by reading status across library items including collection members', () => {
    const database = sortAndStatusDatabase();

    const unread = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      status: 'unread',
      pageSize: 10,
    });
    expect(unread.entities.map(entityKey)).toEqual(['article:a_pinned', 'article:a_in_collection']);
    expect(unread.totalCount).toBe(2);
    expect(unread.unfilteredCount).toBe(5);

    const reading = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      status: 'reading',
      pageSize: 10,
    });
    expect(reading.entities.map(entityKey)).toEqual(['weread:w_annotated', 'article:a_reading']);

    const completed = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      status: 'completed',
      pageSize: 10,
    });
    expect(completed.entities.map(entityKey)).toEqual(['article:a_done']);

    const annotated = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      status: 'annotated',
      pageSize: 10,
    });
    expect(annotated.entities.map(entityKey)).toEqual(['weread:w_annotated', 'article:a_reading']);
  });

  it('updates article metadata and refreshes library_catalog_fts search results', () => {
    const database = metadataEditDatabase();

    const pdfPatch = updateArticleMetadataRows(database, {
      articleId: 'pdf_1',
      title: 'Distributed Consensus Notes',
      byline: 'Leslie Lamport',
      updatedAt: '2026-08-10T00:00:00.000Z',
    });
    expect(pdfPatch?.article.title).toBe('Distributed Consensus Notes');
    expect(pdfPatch?.article.byline).toBe('Leslie Lamport');
    expect(
      pdfPatch?.article.sourceType === 'pdf' ? pdfPatch.article.pdf.metadata.author : undefined,
    ).toBe('Leslie Lamport');

    const byNewTitle = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      query: 'Consensus',
      pageSize: 10,
    });
    expect(byNewTitle.entities.map(entityKey)).toEqual(['article:pdf_1']);

    const byNewAuthor = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      query: 'Lamport',
      pageSize: 10,
    });
    expect(byNewAuthor.entities.map(entityKey)).toEqual(['article:pdf_1']);

    const byOldTitle = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      query: 'GarbledScan',
      pageSize: 10,
    });
    expect(byOldTitle.entities).toEqual([]);

    const ebookPatch = updateArticleMetadataRows(database, {
      articleId: 'ebook_1',
      title: 'Clean Architecture',
      byline: 'Robert Martin',
      updatedAt: '2026-08-11T00:00:00.000Z',
    });
    expect(ebookPatch?.article.sourceType === 'ebook' && ebookPatch.article.ebook.metadata).toEqual(
      expect.objectContaining({
        originalTitle: 'Old Ebook',
        displayTitle: 'Clean Architecture',
      }),
    );
  });

  it('marks a PDF completed only after the reader reaches its final page', () => {
    const database = metadataEditDatabase();
    const progress = (
      pageIndex: number,
      pageCount: number,
      updatedAt: string,
      kind: string | null = 'page',
    ) => {
      database.run(
        sql`update articles set reading_progress = ${JSON.stringify({ kind: kind ?? undefined, pageIndex, pageCount, updatedAt })} where id = 'pdf_1'`,
      );
      return readLibraryCatalogRows(database, {
        scope: { kind: 'library' },
        status: 'completed',
        types: ['pdf'],
      }).totalCount;
    };
    expect(progress(0, 1, '2026-07-01T00:00:00.000Z')).toBe(0);
    expect(progress(0, 1, '2026-07-02T00:00:00.000Z')).toBe(1);
    expect(progress(9, 10, '2026-07-02T00:00:00.000Z', null)).toBe(1);
    expect(progress(198, 200, '2026-07-02T00:00:00.000Z')).toBe(0);
    expect(progress(199, 200, '2026-07-02T00:00:00.000Z')).toBe(1);
  });

  it('matches SQLite UTF-8 NOCASE tie-breaking on the recent fast path', () => {
    const sqlite = new SQLiteDatabase(':memory:');
    for (const migration of migrations) sqlite.exec(migration.sql);
    const database = drizzle(sqlite, { schema });
    const sameTime = '2026-08-01T00:00:00.000Z';
    sqlite
      .prepare(
        `insert into articles (id, url, canonical_url, source_type, title, excerpt, content_hash, created_at, updated_at)
         values (?, ?, ?, 'web', ?, '', ?, ?, ?)`,
      )
      .run(
        'a_emoji',
        'https://example.com/1',
        'https://example.com/1',
        '📘 Reading',
        'h1',
        sameTime,
        sameTime,
      );
    sqlite
      .prepare(
        `insert into articles (id, url, canonical_url, source_type, title, excerpt, content_hash, created_at, updated_at)
         values (?, ?, ?, 'web', ?, '', ?, ?, ?)`,
      )
      .run(
        'a_fullwidth',
        'https://example.com/2',
        'https://example.com/2',
        'ＡＢＣ',
        'h2',
        sameTime,
        sameTime,
      );
    sqlite
      .prepare(
        `insert into collections (id, name, created_at, updated_at) values ('col_1', '📘 Shelf', ?, ?)`,
      )
      .run(sameTime, sameTime);

    const fastFirst = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      sort: 'recent',
      page: 1,
      pageSize: 1,
    });
    const slowFirst = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      sort: 'recent',
      status: 'unread',
      page: 1,
      pageSize: 1,
    });

    expect(fastFirst.entities.map(entityKey)).toEqual(['article:a_fullwidth']);
    expect(fastFirst.entities.map(entityKey)).toEqual(slowFirst.entities.map(entityKey));

    // SQLite COLLATE NOCASE stops comparison at NUL and breaks equal-length ties by id.
    sqlite
      .prepare(
        `insert into articles (id, url, canonical_url, source_type, title, excerpt, content_hash, created_at, updated_at)
         values (?, ?, ?, 'web', ?, '', ?, ?, ?)`,
      )
      .run(
        'a_nul_2',
        'https://example.com/3',
        'https://example.com/3',
        'A\0a',
        'h3',
        '2026-08-02T00:00:00.000Z',
        '2026-08-02T00:00:00.000Z',
      );
    sqlite
      .prepare(
        `insert into articles (id, url, canonical_url, source_type, title, excerpt, content_hash, created_at, updated_at)
         values (?, ?, ?, 'web', ?, '', ?, ?, ?)`,
      )
      .run(
        'a_nul_1',
        'https://example.com/4',
        'https://example.com/4',
        'a\0z',
        'h4',
        '2026-08-02T00:00:00.000Z',
        '2026-08-02T00:00:00.000Z',
      );
    const fastNul = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      sort: 'recent',
      page: 1,
      pageSize: 2,
    });
    const slowNul = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      sort: 'recent',
      status: 'unread',
      page: 1,
      pageSize: 2,
    });
    expect(fastNul.entities.map(entityKey)).toEqual(['article:a_nul_1', 'article:a_nul_2']);
    expect(fastNul.entities.map(entityKey)).toEqual(slowNul.entities.map(entityKey));
  });
});

function entityKey(entity: ReturnType<typeof readLibraryCatalogRows>['entities'][number]) {
  if (entity.kind === 'col') return entity.collection.id;
  const ref = libraryCatalogItemRef(entity);
  return `${ref.kind}:${ref.id}`;
}

function catalogDatabase() {
  const sqlite = new SQLiteDatabase(':memory:');
  for (const migration of migrations) sqlite.exec(migration.sql);
  const database = drizzle(sqlite, { schema });
  const insertArticle = sqlite.prepare(`
    insert into articles (
      id, url, canonical_url, source_type, title, excerpt, content_hash, created_at, updated_at
    ) values (?, ?, ?, 'web', ?, ?, ?, ?, ?)
  `);
  insertArticle.run(
    'article_pinned',
    'https://example.com/pinned',
    'https://example.com/pinned',
    'Pinned',
    'pinned topic',
    'hash_pinned',
    '2026-07-01T00:00:00.000Z',
    '2026-07-01T00:00:00.000Z',
  );
  insertArticle.run(
    'article_member',
    'https://example.com/member',
    'https://example.com/member',
    'Member',
    'member topic',
    'hash_member',
    '2026-07-05T00:00:00.000Z',
    '2026-07-05T00:00:00.000Z',
  );
  insertArticle.run(
    'article_loose',
    'https://example.com/loose',
    'https://example.com/loose',
    'Loose',
    'loose topic',
    'hash_loose',
    '2026-07-03T00:00:00.000Z',
    '2026-07-03T00:00:00.000Z',
  );
  sqlite.exec(`
    insert into collections (id, name, created_at, updated_at)
    values ('collection_1', 'Research', '2026-07-04T00:00:00.000Z', '2026-07-04T00:00:00.000Z');

    insert into collection_members (collection_id, member_kind, member_id, added_at)
    values ('collection_1', 'article', 'article_member', '2026-07-06T00:00:00.000Z');

    insert into library_pins (target_kind, target_id, pinned_at)
    values ('article', 'article_pinned', '2026-07-07T00:00:00.000Z');

    insert into weread_books (book_id, title, updated_at)
    values ('weread_1', 'WeRead', '2026-07-02T00:00:00.000Z');
  `);
  return database;
}

function largeCatalogDatabase() {
  const sqlite = new SQLiteDatabase(':memory:');
  for (const migration of migrations) sqlite.exec(migration.sql);
  const database = drizzle(sqlite, { schema });
  const candidates: Array<{
    key: string;
    id: string;
    title: string;
    sortTime: string;
    pinned: boolean;
  }> = [];
  const collectedArticleIds = new Set<string>();
  const collectedWeReadIds = new Set<string>();
  const articleSources = ARTICLE_SOURCE_TYPES;
  const insertArticle = sqlite.prepare(`
    insert into articles (
      id, url, canonical_url, source_type, title, excerpt, content_hash, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertWeRead = sqlite.prepare(`
    insert into weread_books (book_id, title, updated_at)
    values (?, ?, ?)
  `);
  const insertCollection = sqlite.prepare(`
    insert into collections (id, name, created_at, updated_at)
    values (?, ?, ?, ?)
  `);
  const insertMember = sqlite.prepare(`
    insert into collection_members (collection_id, member_kind, member_id, added_at)
    values (?, ?, ?, ?)
  `);
  const insertPin = sqlite.prepare(`
    insert into library_pins (target_kind, target_id, pinned_at)
    values (?, ?, ?)
  `);

  sqlite.transaction(() => {
    for (let index = 0; index < 10; index += 1) {
      const id = `collection_${String(index).padStart(3, '0')}`;
      const title = `Collection ${String(index).padStart(3, '0')}`;
      const sortTime = catalogTimestamp(500 + index);
      insertCollection.run(id, title, sortTime, sortTime);
      candidates.push({
        key: id,
        id,
        title,
        sortTime,
        pinned: id === 'collection_003',
      });
    }
    for (let index = 0; index < 160; index += 1) {
      const id = `article_${String(index).padStart(3, '0')}`;
      const title = `Article ${String(index).padStart(3, '0')}`;
      const sortTime = catalogTimestamp(index);
      const source = articleSources[index % articleSources.length];
      insertArticle.run(
        id,
        `https://example.com/${id}`,
        `https://example.com/${id}`,
        source,
        title,
        `${title} excerpt`,
        `hash_${id}`,
        sortTime,
        sortTime,
      );
      if (index % 10 === 0) {
        collectedArticleIds.add(id);
        insertMember.run('collection_000', 'article', id, catalogTimestamp(1_000 + index));
      } else {
        candidates.push({
          key: `article:${id}`,
          id,
          title,
          sortTime,
          pinned: id === 'article_003',
        });
      }
    }
    for (let index = 0; index < 20; index += 1) {
      const id = `weread_${String(index).padStart(3, '0')}`;
      const title = `WeRead ${String(index).padStart(3, '0')}`;
      const sortTime = catalogTimestamp(300 + index);
      insertWeRead.run(id, title, sortTime);
      if (index % 5 === 0) {
        collectedWeReadIds.add(id);
        insertMember.run('collection_000', 'weread', id, catalogTimestamp(1_200 + index));
      } else {
        candidates.push({
          key: `weread:${id}`,
          id,
          title,
          sortTime,
          pinned: id === 'weread_003',
        });
      }
    }
    insertPin.run('article', 'article_003', catalogTimestamp(2_001));
    insertPin.run('weread', 'weread_003', catalogTimestamp(2_002));
    insertPin.run('collection', 'collection_003', catalogTimestamp(2_003));
  })();

  expect(collectedArticleIds.size).toBe(16);
  expect(collectedWeReadIds.size).toBe(4);
  const oracle = candidates.toSorted(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      right.sortTime.localeCompare(left.sortTime) ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id),
  );
  return { database, oracle };
}

function catalogTimestamp(index: number) {
  return new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
}

function sortAndStatusDatabase() {
  const sqlite = new SQLiteDatabase(':memory:');
  for (const migration of migrations) sqlite.exec(migration.sql);
  const database = drizzle(sqlite, { schema });
  const insertArticle = sqlite.prepare(`
    insert into articles (
      id, url, canonical_url, source_type, title, content_hash, reading_progress, created_at, updated_at
    ) values (?, ?, ?, 'web', ?, ?, ?, ?, ?)
  `);
  insertArticle.run(
    'a_pinned',
    'https://example.com/pinned',
    'https://example.com/pinned',
    'Zulu Pinned',
    'h1',
    null,
    '2026-07-01T00:00:00.000Z',
    '2026-07-01T00:00:00.000Z',
  );
  insertArticle.run(
    'a_reading',
    'https://example.com/reading',
    'https://example.com/reading',
    'Alpha Reading',
    'h2',
    JSON.stringify({ kind: 'scroll', progress: 0.6, updatedAt: '2026-07-03T00:00:00.000Z' }),
    '2026-07-03T00:00:00.000Z',
    '2026-07-03T00:00:00.000Z',
  );
  insertArticle.run(
    'a_done',
    'https://example.com/done',
    'https://example.com/done',
    'Bravo Done',
    'h3',
    JSON.stringify({
      kind: 'page',
      pageIndex: 9,
      pageCount: 10,
      updatedAt: '2026-07-06T00:00:00.000Z',
    }),
    '2026-07-02T00:00:00.000Z',
    '2026-07-06T00:00:00.000Z',
  );
  insertArticle.run(
    'a_in_collection',
    'https://example.com/col',
    'https://example.com/col',
    'Delta Collected',
    'h4',
    null,
    '2026-07-04T00:00:00.000Z',
    '2026-07-04T00:00:00.000Z',
  );
  sqlite.exec(`
    insert into annotations (id, article_id, anchor, author, color, created_at, updated_at)
    values
      ('ann_1', 'a_reading', '{}', 'user', '#ff0', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z'),
      ('ann_2', 'a_reading', '{}', 'user', '#ff0', '2026-07-03T00:01:00.000Z', '2026-07-03T00:01:00.000Z');

    insert into collections (id, name, created_at, updated_at)
    values ('collection_1', 'Charlie Shelf', '2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z');

    insert into collection_members (collection_id, member_kind, member_id, added_at)
    values ('collection_1', 'article', 'a_in_collection', '2026-07-04T00:00:00.000Z');

    insert into library_pins (target_kind, target_id, pinned_at)
    values ('article', 'a_pinned', '2026-07-07T00:00:00.000Z');

    insert into weread_books (book_id, title, note_count, reading_progress, updated_at)
    values ('w_annotated', 'Echo WeRead', 5, 40, '2026-07-05T00:00:00.000Z');
  `);
  return database;
}

function metadataEditDatabase() {
  const sqlite = new SQLiteDatabase(':memory:');
  for (const migration of migrations) sqlite.exec(migration.sql);
  const database = drizzle(sqlite, { schema });
  sqlite.exec(`
    insert into articles (
      id, url, canonical_url, source_type, title, byline, content_hash, pdf_metadata, created_at, updated_at
    ) values (
      'pdf_1',
      'pdf://pdf_1',
      'pdf://pdf_1',
      'pdf',
      'GarbledScan001',
      'Old Author',
      'pdf_hash',
      '{"fileName":"scan.pdf","fileSize":1024,"pageCount":12,"author":"Old Author"}',
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z'
    );
    insert into articles (
      id, url, canonical_url, source_type, title, byline, content_hash, ebook_metadata, created_at, updated_at
    ) values (
      'ebook_1',
      'ebook://ebook_1',
      'ebook://ebook_1',
      'ebook',
      'Old Ebook',
      'Unknown',
      'ebook_hash',
      '{"fileName":"book.epub","fileSize":2048,"format":"epub","originalTitle":"Old Ebook","displayTitle":"Old Ebook"}',
      '2026-07-02T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z'
    );
  `);
  return database;
}
