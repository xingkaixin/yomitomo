import type { AnnotationDistillation, ContentRef } from '@yomitomo/shared';
import { recordField, stringField } from '@yomitomo/shared';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import { readReadingLibraryScope } from './reading-library-scope';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

const timestamp = '2026-08-30T00:00:00.000Z';
const databases: SQLiteDatabase.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe('reading library scope', () => {
  it('bounds body batches across many annotations and one long discussion', () => {
    const fixture = createFixture();
    fixture.article('source');
    const content = 'reading judgment '.repeat(512);
    const annotationCount = 257;
    const assistantCommentCount = 1025;
    fixture.database.transaction(() => {
      for (let index = 0; index < annotationCount; index += 1) {
        const id = `annotation_${index}`;
        fixture.annotation(id, 'source', { status: 'published', content });
        fixture.comment(`comment_${index}`, id, { content });
      }
      fixture.annotation('long_discussion', 'source');
      for (let index = 0; index < assistantCommentCount; index += 1) {
        fixture.comment(`assistant_${index}`, 'long_discussion', { author: 'ai', content });
      }
      fixture.comment('z_reader', 'long_discussion', { content });
    })();
    let maximumRows = 0;
    let maximumBodyBytes = 0;
    const executor: ReadingMemorySqliteExecutor = {
      exec: (sql) => fixture.database.exec(sql),
      prepare: (sql) => {
        const statement = fixture.database.prepare(sql);
        return {
          get: (...values) => statement.get(...values),
          run: (...values) => statement.run(...values),
          all: (...values) => {
            const rows = statement.all(...values);
            maximumRows = Math.max(maximumRows, rows.length);
            maximumBodyBytes = Math.max(
              maximumBodyBytes,
              rows.reduce<number>(
                (bytes, row) =>
                  bytes +
                  Buffer.byteLength(stringField(recordField(row, 'content'))) +
                  Buffer.byteLength(stringField(recordField(row, 'distillation_content'))),
                0,
              ),
            );
            return rows;
          },
        };
      },
    };

    const result = readReadingLibraryScope(executor, { kind: 'library' });
    expect(result.judgmentCount).toBe(annotationCount * 2 + assistantCommentCount + 1);
    expect(maximumRows).toBeLessThanOrEqual(128);
    expect(maximumBodyBytes).toBeLessThanOrEqual(128 * Buffer.byteLength(content));
  });

  it('counts unannotated sources and all unindexed judgments beyond the candidate limit', () => {
    const fixture = createFixture();
    fixture.article('unannotated');
    fixture.article('unindexed');
    fixture.annotation('thread', 'unindexed', { status: 'published', content: '已发布提炼' });
    fixture.comment('reader', 'thread', { content: '我的判断' });
    for (let index = 0; index < 14; index += 1) {
      fixture.comment(`assistant_${index}`, 'thread', { author: 'ai', content: '补充判断' });
    }

    expect(readReadingLibraryScope(fixture.database, { kind: 'library' })).toEqual({
      scope: { kind: 'library' },
      sourceCount: 2,
      judgmentCount: 16,
    });
  });

  it('matches raw author, pending, publication, and whole-thread participation rules', () => {
    const fixture = createFixture();
    const cases: {
      id: string;
      comments: CommentInput[];
      distillation?: Pick<AnnotationDistillation, 'status' | 'content'>;
      expected: number;
    }[] = [
      { id: 'pure_ai', comments: [{ author: 'ai' }], expected: 0 },
      {
        id: 'pure_ai_with_distillation',
        comments: [{ author: 'ai' }],
        distillation: { status: 'published', content: '提炼' },
        expected: 1,
      },
      {
        id: 'pending_user',
        comments: [{ pending: 1 }, { author: 'ai' }],
        expected: 0,
      },
      {
        id: 'active_legacy_user',
        comments: [
          { author: 'legacy-user', pending: 2 },
          { author: 'ai', pending: 0 },
          { author: 'ai', pending: 1 },
          { author: 'ai', content: '   ' },
        ],
        expected: 2,
      },
      {
        id: 'draft',
        comments: [],
        distillation: { status: 'unpublished', content: '尚未发布' },
        expected: 0,
      },
    ];
    for (const input of cases) {
      fixture.article(input.id);
      fixture.annotation(input.id, input.id, input.distillation);
      input.comments.forEach((comment, index) =>
        fixture.comment(`${input.id}_${index}`, input.id, comment),
      );

      expect(
        readReadingLibraryScope(fixture.database, {
          kind: 'sources',
          sources: [{ kind: 'article', id: input.id }],
        }).judgmentCount,
        input.id,
      ).toBe(input.expected);
    }
  });

  it('uses JavaScript Unicode whitespace rules for both comments and distillations', () => {
    const fixture = createFixture();
    for (const [id, content, expected] of [
      ['nbsp', '\u00a0', 0],
      ['ideographic_space', '\u3000', 0],
      ['bom', '\ufeff', 0],
      ['zero_width_space', '\u200b', 3],
    ] as const) {
      fixture.article(id);
      fixture.annotation(id, id, { status: 'published', content });
      fixture.comment(`${id}_user`, id, { content });
      fixture.comment(`${id}_assistant`, id, { author: 'ai', content: '助手讨论' });

      expect(
        readReadingLibraryScope(fixture.database, {
          kind: 'sources',
          sources: [{ kind: 'article', id }],
        }).judgmentCount,
        id,
      ).toBe(expected);
    }
  });

  it('keeps source selections closed, canonical, and independent of deleted sources', () => {
    const fixture = createFixture();
    for (const id of ['a', 'b', 'outside']) fixture.article(id);
    fixture.annotation('a', 'a');
    fixture.comment('a', 'a');
    const sources: ContentRef[] = [
      { kind: 'article', id: 'b' },
      { kind: 'article', id: 'deleted' },
      { kind: 'article', id: 'a' },
      { kind: 'article', id: 'b' },
      { kind: 'weread', id: 'outside' },
    ];

    expect(readReadingLibraryScope(fixture.database, { kind: 'sources', sources })).toEqual({
      scope: {
        kind: 'sources',
        sources: [
          { kind: 'article', id: 'a' },
          { kind: 'article', id: 'b' },
          { kind: 'article', id: 'deleted' },
        ],
      },
      sourceCount: 2,
      judgmentCount: 1,
    });
    for (const emptySources of [[], [{ kind: 'weread' as const, id: 'a' }]]) {
      expect(
        readReadingLibraryScope(fixture.database, { kind: 'sources', sources: emptySources }),
      ).toEqual({ scope: { kind: 'sources', sources: [] }, sourceCount: 0, judgmentCount: 0 });
    }
  });

  it('requires an existing collection and counts only its live article members', () => {
    const fixture = createFixture();
    for (const id of ['a', 'b', 'outside']) fixture.article(id);
    fixture.annotation('a', 'a');
    fixture.comment('a', 'a');
    fixture.annotation('outside', 'outside');
    fixture.comment('outside', 'outside');
    fixture.collection('selected', '收藏夹名称', [
      { kind: 'article', id: 'a' },
      { kind: 'article', id: 'b' },
      { kind: 'article', id: 'deleted' },
      { kind: 'weread', id: 'outside' },
    ]);
    fixture.collection('empty', '空收藏夹', []);

    expect(
      readReadingLibraryScope(fixture.database, { kind: 'collection', collectionId: 'selected' }),
    ).toEqual({
      scope: { kind: 'collection', collectionId: 'selected' },
      collectionName: '收藏夹名称',
      sourceCount: 2,
      judgmentCount: 1,
    });
    expect(
      readReadingLibraryScope(fixture.database, { kind: 'collection', collectionId: 'empty' }),
    ).toMatchObject({ collectionName: '空收藏夹', sourceCount: 0, judgmentCount: 0 });
    expect(() =>
      readReadingLibraryScope(fixture.database, { kind: 'collection', collectionId: 'missing' }),
    ).toThrow('READING_MEMORY_SCOPE_NOT_FOUND');

    fixture.database.prepare('DELETE FROM articles WHERE id = ?').run('a');
    fixture.database
      .prepare('UPDATE collections SET name = ? WHERE id = ?')
      .run('新名称', 'selected');
    expect(
      readReadingLibraryScope(fixture.database, { kind: 'collection', collectionId: 'selected' }),
    ).toMatchObject({ collectionName: '新名称', sourceCount: 1, judgmentCount: 0 });
  });
});

type CommentInput = { author?: string; content?: string; pending?: number };

function createFixture() {
  const database = new SQLiteDatabase(':memory:');
  databases.push(database);
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  return {
    database,
    article: (id: string) =>
      database
        .prepare(`
INSERT INTO articles (id, url, canonical_url, title, content_hash, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`)
        .run(
          id,
          `https://example.com/${id}`,
          `https://example.com/${id}`,
          id,
          id,
          timestamp,
          timestamp,
        ),
    annotation: (
      id: string,
      articleId: string,
      distillation?: Pick<AnnotationDistillation, 'status' | 'content'>,
    ) =>
      database
        .prepare(`
INSERT INTO annotations (
  id, article_id, anchor, author, color, distillation_status, distillation_content, created_at, updated_at
) VALUES (?, ?, ?, 'user', 'color', ?, ?, ?, ?)
`)
        .run(
          id,
          articleId,
          JSON.stringify({ exact: '', prefix: '', suffix: '', start: 0, end: 0 }),
          distillation?.status || null,
          distillation?.content ?? null,
          timestamp,
          timestamp,
        ),
    comment: (id: string, annotationId: string, input: CommentInput = {}) =>
      database
        .prepare(`
INSERT INTO comments (id, annotation_id, author, content, pending, created_at)
VALUES (?, ?, ?, ?, ?, ?)
`)
        .run(
          id,
          annotationId,
          input.author || 'user',
          input.content ?? '判断',
          input.pending ?? null,
          timestamp,
        ),
    collection: (id: string, name: string, members: ContentRef[]) => {
      database
        .prepare('INSERT INTO collections (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(id, name, timestamp, timestamp);
      const insert = database.prepare(`
INSERT INTO collection_members (collection_id, member_kind, member_id, added_at)
VALUES (?, ?, ?, ?)
`);
      for (const member of members) insert.run(id, member.kind, member.id, timestamp);
    },
  };
}
