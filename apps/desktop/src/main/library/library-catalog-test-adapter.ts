import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { articleCounts } from '@yomitomo/core';
import type {
  ArticleSummaryRecord,
  Collection,
  CollectionMember,
  LibraryPin,
  WeReadBook,
} from '@yomitomo/shared';
import type { LibraryCatalogListInput } from '../../ipc-contract';
import * as schema from '../db/schema';
import { migrations } from '../db/migrations';
import { readLibraryCatalogRows } from './library-catalog-repository';

export type LibraryCatalogTestFixtures = {
  articles: ArticleSummaryRecord[];
  collectionMembers: CollectionMember[];
  collections: Collection[];
  pins: LibraryPin[];
  wereadBooks?: WeReadBook[];
};

export function createLibraryCatalogTestAdapter(fixtures: LibraryCatalogTestFixtures) {
  const sqlite = new SQLiteDatabase(':memory:');
  for (const migration of migrations) sqlite.exec(migration.sql);
  const database = drizzle(sqlite, { schema });

  sqlite.transaction(() => {
    seedArticles(sqlite, fixtures.articles);
    seedCollections(sqlite, fixtures.collections);
    seedCollectionMembers(sqlite, fixtures.collectionMembers);
    seedPins(sqlite, fixtures.pins);
    replaceWeReadBooks(sqlite, fixtures.wereadBooks || []);
  })();

  return {
    list(input: LibraryCatalogListInput) {
      return readLibraryCatalogRows(database, input);
    },
    replaceWeReadBooks(books: WeReadBook[]) {
      sqlite.transaction(() => replaceWeReadBooks(sqlite, books))();
    },
    close() {
      sqlite.close();
    },
  };
}

function seedArticles(sqlite: SQLiteDatabase.Database, articles: ArticleSummaryRecord[]) {
  const insertArticle = sqlite.prepare(`
    insert into articles (
      id,
      url,
      canonical_url,
      source_type,
      title,
      byline,
      excerpt,
      site_name,
      theme_color,
      content_hash,
      ebook_metadata,
      pdf_metadata,
      text_metadata,
      reading_progress,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAnnotation = sqlite.prepare(`
    insert into annotations (
      id,
      article_id,
      anchor,
      author,
      color,
      distillation_status,
      created_at,
      updated_at
    ) values (?, ?, ?, 'user', '#000000', ?, ?, ?)
  `);

  for (const article of articles) {
    insertArticle.run(
      article.id,
      article.url,
      article.canonicalUrl,
      article.sourceType,
      article.title,
      article.byline ?? null,
      article.excerpt ?? null,
      article.siteName ?? null,
      article.themeColor ?? null,
      article.contentHash,
      jsonValue(article.ebook?.metadata),
      jsonValue(article.pdf?.metadata),
      jsonValue(article.text),
      jsonValue(article.readingProgress),
      article.createdAt,
      article.updatedAt,
    );

    const { annotationCount, distillationCount } = articleCounts(article);
    for (let index = 0; index < Math.max(annotationCount, distillationCount); index += 1) {
      insertAnnotation.run(
        `catalog_fixture_${article.id}_${index}`,
        article.id,
        '{}',
        index < distillationCount ? 'published' : null,
        article.createdAt,
        article.updatedAt,
      );
    }
  }
}

function seedCollections(sqlite: SQLiteDatabase.Database, collections: Collection[]) {
  const insert = sqlite.prepare(`
    insert into collections (id, name, desc, created_at, updated_at)
    values (?, ?, ?, ?, ?)
  `);
  for (const collection of collections) {
    insert.run(
      collection.id,
      collection.name,
      collection.desc ?? null,
      collection.createdAt,
      collection.updatedAt,
    );
  }
}

function seedCollectionMembers(
  sqlite: SQLiteDatabase.Database,
  collectionMembers: CollectionMember[],
) {
  const insert = sqlite.prepare(`
    insert into collection_members (collection_id, member_kind, member_id, added_at)
    values (?, ?, ?, ?)
  `);
  for (const member of collectionMembers) {
    insert.run(member.collectionId, member.member.kind, member.member.id, member.addedAt);
  }
}

function seedPins(sqlite: SQLiteDatabase.Database, pins: LibraryPin[]) {
  const insert = sqlite.prepare(`
    insert into library_pins (target_kind, target_id, pinned_at)
    values (?, ?, ?)
  `);
  for (const pin of pins) insert.run(pin.targetKind, pin.targetId, pin.pinnedAt);
}

function replaceWeReadBooks(sqlite: SQLiteDatabase.Database, books: WeReadBook[]) {
  sqlite.prepare('delete from weread_books').run();
  const insert = sqlite.prepare(`
    insert into weread_books (
      book_id,
      title,
      author,
      cover,
      intro,
      review_count,
      note_count,
      bookmark_count,
      reading_progress,
      marked_status,
      sort,
      current_chapter_uid,
      current_chapter_offset,
      reading_time,
      record_reading_time,
      last_read_at,
      synced_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const book of books) {
    insert.run(
      book.bookId,
      book.title,
      book.author ?? null,
      book.cover ?? null,
      book.intro ?? null,
      book.reviewCount,
      book.noteCount,
      book.bookmarkCount,
      book.readingProgress,
      book.markedStatus ?? null,
      book.sort ?? null,
      book.currentChapterUid ?? null,
      book.currentChapterOffset ?? null,
      book.readingTime ?? null,
      book.recordReadingTime ?? null,
      book.lastReadAt ?? null,
      book.syncedAt ?? null,
      book.updatedAt,
    );
  }
}

function jsonValue(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}
