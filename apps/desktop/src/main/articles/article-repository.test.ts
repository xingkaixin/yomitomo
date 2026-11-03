import { describe, expect, it } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';
import { readArticleLibraryListRows } from './article-library-queries';
import { readArticleActivityDates, readArticleSummaryCounts } from './article-summary-counts';

describe('article repository summaries', () => {
  it('filters library pages by source metadata search', () => {
    const result = readArticleLibraryListRows(sqliteRepositoryDatabase(), {
      source: 'web',
      query: 'alpha',
      page: 1,
      pageSize: 10,
    });

    expect(result.totalCount).toBe(1);
    expect(result.articles.map((article) => article.id)).toEqual(['sqlite_alpha']);
  });

  it('reads per-event activity dates that agree with summary counts', () => {
    const database = summaryCountsSqliteDatabase(1, 10);

    const counts = readArticleSummaryCounts(database).get('article_0');
    const dates = readArticleActivityDates(database).get('article_0');

    expect({
      annotationCount: dates?.annotations.length,
      thoughtCount: dates?.thoughts.length,
      discussionCommentCount: dates?.discussionComments.length,
      aiCommentCount: dates?.aiComments.length,
      distillationCount: dates?.distillations.length,
    }).toEqual(counts);
    expect(dates?.discussionComments.toSorted()).toEqual([
      ...Array.from({ length: 10 }, () => '2026-06-04T00:01:00.000Z'),
      '2026-06-04T00:02:00.000Z',
      '2026-06-04T00:02:00.000Z',
    ]);
  });
});

function sqliteRepositoryDatabase(): StoreDatabase {
  const sqlite = new SQLiteDatabase(':memory:');
  sqlite.exec(`
    CREATE TABLE articles (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'web',
      title TEXT NOT NULL,
      byline TEXT,
      excerpt TEXT,
      site_name TEXT,
      theme_color TEXT,
      content_hash TEXT NOT NULL,
      ebook_metadata TEXT,
      pdf_metadata TEXT,
      text_metadata TEXT,
      reading_progress TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE annotations (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at TEXT NOT NULL,
      distillation_status TEXT,
      distillation_review_sessions TEXT
    );
    CREATE TABLE comments (
      id TEXT PRIMARY KEY,
      annotation_id TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reply_to TEXT
    );
  `);
  sqlite
    .prepare(
      `INSERT INTO articles (
        id, url, canonical_url, source_type, title, byline, excerpt, site_name,
        theme_color, content_hash, ebook_metadata, pdf_metadata, reading_progress,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'sqlite_alpha',
      'https://example.com/alpha',
      'https://example.com/alpha',
      'web',
      'Alpha article',
      null,
      null,
      null,
      null,
      'hash-alpha',
      null,
      null,
      null,
      '2026-06-06T00:00:00.000Z',
      '2026-06-06T00:00:00.000Z',
    );
  sqlite
    .prepare(
      `INSERT INTO articles (
        id, url, canonical_url, source_type, title, byline, excerpt, site_name,
        theme_color, content_hash, ebook_metadata, pdf_metadata, reading_progress,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'sqlite_beta',
      'https://example.com/beta',
      'https://example.com/beta',
      'web',
      'Beta article',
      null,
      null,
      null,
      null,
      'hash-beta',
      null,
      null,
      null,
      '2026-06-05T00:00:00.000Z',
      '2026-06-05T00:00:00.000Z',
    );
  return drizzle(sqlite, { schema });
}

function summaryCountsSqliteDatabase(articleCount: number, annotationsPerArticle: number) {
  const sqlite = new SQLiteDatabase(':memory:');
  sqlite.exec(`
    CREATE TABLE annotations (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      distillation_status TEXT,
      distillation_published_at TEXT,
      distillation_updated_at TEXT,
      distillation_review_sessions TEXT
    );
    CREATE TABLE comments (
      id TEXT PRIMARY KEY,
      annotation_id TEXT NOT NULL,
      author TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reply_to TEXT
    );
  `);
  const insertAnnotation = sqlite.prepare(
    `INSERT INTO annotations (
      id, article_id, author, created_at, distillation_status, distillation_review_sessions
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertComment = sqlite.prepare(
    'INSERT INTO comments (id, annotation_id, author, created_at, reply_to) VALUES (?, ?, ?, ?, ?)',
  );
  sqlite.transaction(() => {
    for (let articleIndex = 0; articleIndex < articleCount; articleIndex += 1) {
      const articleId = `article_${articleIndex}`;
      for (let annotationIndex = 0; annotationIndex < annotationsPerArticle; annotationIndex += 1) {
        const annotationId = `${articleId}_annotation_${annotationIndex}`;
        const reviewSessions =
          annotationIndex % 7 === 0
            ? JSON.stringify([
                { messages: [{ author: 'ai' }, { author: 'user' }, { author: 'ai' }] },
              ])
            : null;
        insertAnnotation.run(
          annotationId,
          articleId,
          'user',
          '2026-06-04T00:00:00.000Z',
          annotationIndex % 5 === 0 ? 'published' : null,
          reviewSessions,
        );
        insertComment.run(
          `${annotationId}_comment_user`,
          annotationId,
          'user',
          '2026-06-04T00:00:00.000Z',
          null,
        );
        insertComment.run(
          `${annotationId}_comment_ai_reply`,
          annotationId,
          'ai',
          '2026-06-04T00:01:00.000Z',
          `${annotationId}_comment_user`,
        );
        if (annotationIndex % 9 === 0) {
          insertComment.run(
            `${annotationId}_comment_ai_top`,
            annotationId,
            'ai',
            '2026-06-04T00:02:00.000Z',
            null,
          );
        }
      }
    }
  })();
  return drizzle(sqlite, { schema });
}
