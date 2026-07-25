import { describe, expect, it } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { migrations } from '../db/migrations';
import { readLibraryCatalogRows } from './library-catalog-repository';

describe('library catalog repository', () => {
  it('uses the catalog index without a temporary article sort', () => {
    const { sqlite } = createCatalogDatabase();
    const plan = sqlite
      .prepare(`
        explain query plan
        select id, created_at, title
        from articles
        where source_type = 'web'
          and not exists (
            select 1 from library_pins
            where target_kind = 'article' and target_id = articles.id
          )
        order by created_at desc, title asc, id asc
        limit 12
      `)
      .all() as Array<{ detail: string }>;

    expect(plan.some((row) => row.detail.includes('articles_library_catalog_idx'))).toBe(true);
    expect(plan.some((row) => row.detail.includes('USE TEMP B-TREE'))).toBe(false);
  });

  it('paginates the mixed catalog without exposing collected items twice', () => {
    const database = catalogDatabase();

    const result = readLibraryCatalogRows(database, {
      scope: { kind: 'library' },
      page: 1,
      pageSize: 2,
    });

    expect(result).toMatchObject({
      page: 1,
      pageSize: 2,
      totalCount: 4,
      unfilteredCount: 4,
      itemCounts: { web: 3, ebook: 0, pdf: 0, text: 0, weread: 1 },
    });
    expect(result.entities.map(entityKey)).toEqual(['article:article_pinned', 'collection_1']);
    expect(result.entities[1]).toMatchObject({
      kind: 'col',
      memberCount: 1,
      coverMembers: [{ kind: 'item', ref: { kind: 'article', id: 'article_member' } }],
    });
  });

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
});

function entityKey(entity: ReturnType<typeof readLibraryCatalogRows>['entities'][number]) {
  return entity.kind === 'col' ? entity.collection.id : `${entity.ref.kind}:${entity.ref.id}`;
}

function catalogDatabase() {
  return createCatalogDatabase().database;
}

function createCatalogDatabase() {
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
  return { database, sqlite };
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
  const articleSources = ['web', 'ebook', 'pdf', 'text'] as const;
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
