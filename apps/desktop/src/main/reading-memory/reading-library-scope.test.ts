import type { AnnotationDistillation, ContentRef } from '@yomitomo/shared';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import { readReadingLibraryScope } from './reading-library-scope';

const timestamp = '2026-08-30T00:00:00.000Z';
const databases: SQLiteDatabase.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe('reading library scope', () => {
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
