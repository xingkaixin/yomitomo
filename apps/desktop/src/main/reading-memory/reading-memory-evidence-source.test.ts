import SQLiteDatabase from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import {
  readStoredAnnotationThreadSources,
  readStoredArticleAnnotationThreadSources,
} from './reading-memory-evidence-source';
import { queueStoredAnnotationThreadProjection } from './reading-memory-projection-job-queue';
import { readReadingMemoryProjectionJobs } from './reading-memory-projection-job-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

describe('reading memory evidence source', () => {
  it('hydrates a batch from fixed source rows without per-thread reads', () => {
    const fixture = createFixture();
    fixture.insertThread('annotation_2', 'article_2');
    fixture.insertThread('annotation_1', 'article_1');
    fixture.insertComment('comment_2', 'annotation_1', {
      author: 'ai',
      content: 'Assistant response',
      createdAt: '2026-08-29T00:03:00.000Z',
    });
    fixture.insertComment('comment_1', 'annotation_1', {
      author: 'user',
      content: 'Reader judgment',
      createdAt: '2026-08-29T00:02:00.000Z',
    });

    const sources = readStoredAnnotationThreadSources(fixture.executor, [
      'annotation_2',
      'annotation_1',
      'annotation_1',
    ]);

    expect(sources.map((source) => source.targetId)).toEqual(['annotation_1', 'annotation_2']);
    expect(sources[0]).toMatchObject({
      articleId: 'article_1',
      annotation: {
        id: 'annotation_1',
        author: { kind: 'user', userId: 'reader_1', username: 'reader' },
        anchor: { exact: 'Evidence annotation_1' },
        distillation: {
          status: 'published',
          content: 'Published annotation_1',
        },
        comments: [
          {
            id: 'comment_1',
            author: { kind: 'user' },
            content: 'Reader judgment',
          },
          {
            id: 'comment_2',
            author: { kind: 'agent', agentId: 'agent_1' },
            content: 'Assistant response',
          },
        ],
      },
    });
    expect(sources.every((source) => /^[a-f0-9]{64}$/.test(source.sourceVersion))).toBe(true);
    expect(fixture.selects()).toHaveLength(3);
  });

  it('uses the same source version when a stored thread is queued', () => {
    const fixture = createFixture();
    fixture.insertThread('annotation_1', 'article_1');
    fixture.insertComment('comment_1', 'annotation_1', {
      author: 'user',
      content: 'Reader judgment',
      createdAt: '2026-08-29T00:02:00.000Z',
    });
    const [source] = readStoredAnnotationThreadSources(fixture.executor, ['annotation_1']);
    if (!source) throw new Error('missing source');

    queueStoredAnnotationThreadProjection(fixture.executor, {
      articleId: 'article_1',
      annotationId: 'annotation_1',
      queuedAt: '2026-08-29T00:04:00.000Z',
    });

    expect(readReadingMemoryProjectionJobs(fixture.executor, 1)[0]).toMatchObject({
      targetId: 'annotation_1',
      articleId: 'article_1',
      sourceVersion: source.sourceVersion,
    });
  });

  it('reads every article thread and review presence in three bulk queries', () => {
    const fixture = createFixture();
    for (let index = 0; index < 12; index += 1) {
      const annotationId = `annotation_${index}`;
      fixture.insertThread(annotationId, 'article_1');
      fixture.insertComment(`comment_${index}`, annotationId, {
        author: 'user',
        content: `Thought ${index}`,
        createdAt: `2026-08-29T00:00:${String(index).padStart(2, '0')}.000Z`,
      });
    }

    expect(readStoredArticleAnnotationThreadSources(fixture.executor, 'article_1')).toHaveLength(
      12,
    );
    expect(fixture.selects()).toHaveLength(3);
  });
});

function createFixture() {
  const database = new SQLiteDatabase(':memory:');
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  database.exec(`
INSERT INTO articles (
  id, url, canonical_url, title, content_hash, created_at, updated_at
) VALUES
  (
    'article_1', 'https://example.com/1', 'https://example.com/1', 'Article 1', 'hash_1',
    '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z'
  ),
  (
    'article_2', 'https://example.com/2', 'https://example.com/2', 'Article 2', 'hash_2',
    '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z'
  );
`);
  const preparedSql: string[] = [];
  const executor: ReadingMemorySqliteExecutor = {
    exec: (sql) => database.exec(sql),
    prepare: (sql) => {
      preparedSql.push(sql);
      const statement = database.prepare(sql);
      return {
        all: (...values) => statement.all(...values),
        get: (...values) => statement.get(...values),
        run: (...values) => statement.run(...values),
      };
    },
  };
  return {
    executor,
    insertThread: (annotationId: string, articleId: string) =>
      database
        .prepare(
          `
INSERT INTO annotations (
  id,
  article_id,
  anchor,
  author,
  color,
  user_id,
  user_username,
  distillation_status,
  distillation_content,
  distillation_published_at,
  distillation_updated_at,
  created_at,
  updated_at
) VALUES (?, ?, ?, 'user', '#f59e0b', 'reader_1', 'reader', 'published', ?, ?, ?, ?, ?)
`,
        )
        .run(
          annotationId,
          articleId,
          JSON.stringify({
            exact: `Evidence ${annotationId}`,
            prefix: 'Before',
            suffix: 'After',
            start: 1,
            end: 10,
          }),
          `Published ${annotationId}`,
          '2026-08-29T00:01:00.000Z',
          '2026-08-29T00:01:00.000Z',
          '2026-08-29T00:01:00.000Z',
          '2026-08-29T00:01:00.000Z',
        ),
    insertComment: (
      commentId: string,
      annotationId: string,
      input: { author: 'user' | 'ai'; content: string; createdAt: string },
    ) =>
      database
        .prepare(
          `
INSERT INTO comments (
  id,
  annotation_id,
  author,
  content,
  created_at,
  agent_id,
  agent_username,
  user_id,
  user_username
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
        )
        .run(
          commentId,
          annotationId,
          input.author,
          input.content,
          input.createdAt,
          input.author === 'ai' ? 'agent_1' : null,
          input.author === 'ai' ? 'assistant' : null,
          input.author === 'user' ? 'reader_1' : null,
          input.author === 'user' ? 'reader' : null,
        ),
    selects: () => preparedSql.filter((sql) => sql.trimStart().startsWith('SELECT')),
  };
}
