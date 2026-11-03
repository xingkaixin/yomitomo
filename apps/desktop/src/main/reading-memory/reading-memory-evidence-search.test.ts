import type { ArticleSourceType, ContentRef, ReadingEvidenceScope } from '@yomitomo/shared';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import SQLiteDatabase from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import { searchReadingEvidence } from './reading-memory-evidence-search';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import { replaceReadingEvidenceThreadInTransaction } from './reading-memory-evidence-store';
import { withReadingMemoryTransaction } from './reading-memory-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

const timestamp = '2026-08-29T00:00:00.000Z';

describe('reading memory evidence search', () => {
  it('retrieves English, Chinese, and Japanese substrings from the trigram index', () => {
    const fixture = createFixture();
    const examples = [
      ['article_en', 'annotation_en', 'Memory retrieval across books', 'retrieval'],
      ['article_zh', 'annotation_zh', '选择压力与认知偏差', '择压力'],
      ['article_ja', 'annotation_ja', '読書の記憶を検索する', '記憶を検'],
    ] as const;
    for (const [articleId, annotationId, exact] of examples) {
      fixture.insertArticle({ id: articleId, title: exact });
      fixture.insertAnnotation({ id: annotationId, articleId, exact });
      fixture.project(annotationId);
    }

    for (const [, annotationId, exact, query] of examples) {
      expect(search(fixture, query).evidence).toEqual([
        expect.objectContaining({
          id: `reading_evidence_annotation:${annotationId}`,
          content: exact,
        }),
      ]);
    }
  });

  it('treats short queries and LIKE metacharacters as literal text', () => {
    const fixture = createFixture();
    const examples = [
      ['percent', '百分比 % 符号', '%'],
      ['underscore', '下划线 _ 符号', '_'],
      ['backslash', '反斜线 \\ 符号', '\\'],
      ['quote', '引号 " 符号', '"'],
      ['one_han', '一字检索记忆', '记'],
      ['two_han', '双字检索结果', '检索'],
      ['quoted_fts', '完整短语 abc"def 仍可召回', 'abc"def'],
    ] as const;
    for (const [id, exact] of examples) {
      const articleId = `article_${id}`;
      const annotationId = `annotation_${id}`;
      fixture.insertArticle({ id: articleId, title: id });
      fixture.insertAnnotation({ id: annotationId, articleId, exact });
      fixture.project(annotationId);
    }

    for (const [id, exact, query] of examples) {
      const evidence = search(fixture, query).evidence;
      expect(evidence).toContainEqual(
        expect.objectContaining({
          id: `reading_evidence_annotation:annotation_${id}`,
          content: exact,
        }),
      );
      expect(evidence.every((item) => item.content.includes(query))).toBe(true);
    }
    expect(search(fixture, '  ').evidence).toEqual([]);
  });

  it('applies library, collection, and article source scopes exactly', () => {
    const fixture = createFixture();
    for (const suffix of ['a', 'b', 'c']) {
      const articleId = `article_${suffix}`;
      fixture.insertArticle({ id: articleId, title: `Article ${suffix}` });
      fixture.insertAnnotation({
        id: `annotation_${suffix}`,
        articleId,
        exact: `共同检索标记 ${suffix}`,
      });
      fixture.project(`annotation_${suffix}`);
    }
    fixture.insertCollection('collection_a', ['article_a']);

    expect(evidenceArticleIds(search(fixture, '共同检索', { kind: 'library' }).evidence)).toEqual([
      'article_a',
      'article_b',
      'article_c',
    ]);
    expect(
      evidenceArticleIds(
        search(fixture, '共同检索', {
          kind: 'collection',
          collectionId: 'collection_a',
        }).evidence,
      ),
    ).toEqual(['article_a']);
    expect(
      search(fixture, '共同检索', {
        kind: 'collection',
        collectionId: 'collection_missing',
      }),
    ).toEqual({
      evidence: [],
      projection: {
        state: 'available',
        coverage: { projectedAssetCount: 0, eligibleAssetCount: 0 },
      },
    });

    const selected: ContentRef[] = [
      { kind: 'weread', id: 'article_a' },
      { kind: 'article', id: 'article_b' },
    ];
    expect(
      evidenceArticleIds(
        search(fixture, '共同检索', { kind: 'sources', sources: selected }).evidence,
      ),
    ).toEqual(['article_b']);
    expect(search(fixture, '共同检索', { kind: 'sources', sources: [] }).evidence).toEqual([]);
    expect(
      search(fixture, '共同检索', {
        kind: 'sources',
        sources: [{ kind: 'weread', id: 'article_a' }],
      }).evidence,
    ).toEqual([]);
  });

  it('prioritizes judgments while preserving source diversity', () => {
    const fixture = createFixture();
    for (let index = 0; index < 5; index += 1) {
      const annotationId = `annotation_a_${index}`;
      fixture.insertArticleIfMissing({ id: 'article_a', title: 'Article A' });
      fixture.insertAnnotation({
        id: annotationId,
        articleId: 'article_a',
        exact: `原文 A ${index}`,
      });
      fixture.insertComment({
        id: `comment_a_${index}`,
        annotationId,
        author: 'user',
        content: '多源判断测试',
        createdAt: `2026-08-29T01:00:0${index}.000Z`,
      });
      fixture.project(annotationId);
    }
    for (const suffix of ['b', 'c']) {
      const articleId = `article_${suffix}`;
      const annotationId = `annotation_${suffix}`;
      fixture.insertArticle({ id: articleId, title: `Article ${suffix}` });
      fixture.insertAnnotation({ id: annotationId, articleId, exact: `原文 ${suffix}` });
      fixture.insertComment({
        id: `comment_${suffix}`,
        annotationId,
        author: 'user',
        content: '多源判断测试',
        createdAt: timestamp,
      });
      fixture.project(annotationId);
    }

    const result = search(fixture, '多源判断测试', { kind: 'library' }, 4).evidence;
    expect(result).toHaveLength(4);
    expect(result.every((item) => item.role === 'judgment')).toBe(true);
    expect(new Set(evidenceArticleIds(result))).toEqual(
      new Set(['article_a', 'article_b', 'article_c']),
    );
    expect(result.filter((item) => item.source.ref.id === 'article_a')).toHaveLength(2);
  });

  it('rejects stale facts and materializes matches only from current source data', () => {
    const fixture = createFixture();
    fixture.insertArticle({ id: 'article_stale', title: 'Stale' });
    fixture.insertAnnotation({
      id: 'annotation_stale',
      articleId: 'article_stale',
      exact: '旧版来源标记',
    });
    fixture.project('annotation_stale');
    fixture.updateAnnotationAnchor('annotation_stale', '新版来源标记');
    expect(search(fixture, '旧版来源标记').evidence).toEqual([]);

    fixture.insertArticle({ id: 'article_deleted', title: 'Deleted' });
    fixture.insertAnnotation({
      id: 'annotation_deleted',
      articleId: 'article_deleted',
      exact: '删除来源标记',
    });
    fixture.project('annotation_deleted');
    fixture.deleteAnnotation('annotation_deleted');
    expect(search(fixture, '删除来源标记').evidence).toEqual([]);

    fixture.insertArticle({ id: 'article_unpublished', title: 'Unpublished' });
    fixture.insertAnnotation({
      id: 'annotation_unpublished',
      articleId: 'article_unpublished',
      exact: '蒸馏原文',
      distillation: { status: 'published', content: '取消发布判断' },
    });
    fixture.project('annotation_unpublished');
    fixture.unpublishDistillation('annotation_unpublished');
    expect(search(fixture, '取消发布判断').evidence).toEqual([]);

    fixture.insertArticle({ id: 'article_collection', title: 'Collection' });
    fixture.insertAnnotation({
      id: 'annotation_collection',
      articleId: 'article_collection',
      exact: '移出合集标记',
    });
    fixture.project('annotation_collection');
    fixture.insertCollection('collection_live', ['article_collection']);
    fixture.removeCollectionMember('collection_live', 'article_collection');
    expect(
      search(fixture, '移出合集标记', {
        kind: 'collection',
        collectionId: 'collection_live',
      }).evidence,
    ).toEqual([]);

    fixture.insertArticle({ id: 'article_poison', title: 'Poison' });
    fixture.insertAnnotation({
      id: 'annotation_poison',
      articleId: 'article_poison',
      exact: '可信当前原文',
    });
    fixture.project('annotation_poison');
    fixture.updateSearchText('reading_evidence_annotation:annotation_poison', '注入召回毒文');
    expect(search(fixture, '注入召回').evidence).toEqual([]);
  });

  it('keeps matching old projector entries searchable while reporting stale status', () => {
    const fixture = createFixture();
    fixture.insertArticle({ id: 'article_old_match', title: 'Current title' });
    fixture.insertAnnotation({
      id: 'annotation_old_match',
      articleId: 'article_old_match',
      exact: '重建期间仍然可以检索',
    });
    fixture.project('annotation_old_match', 'reading-memory-evidence:v0');

    expect(search(fixture, '仍然可以检索')).toEqual({
      evidence: [
        expect.objectContaining({
          id: 'reading_evidence_annotation:annotation_old_match',
          content: '重建期间仍然可以检索',
        }),
      ],
      projection: {
        state: 'stale',
        coverage: { projectedAssetCount: 0, eligibleAssetCount: 1 },
      },
    });
  });
});

type InsertArticle = {
  id: string;
  title: string;
  byline?: string;
  sourceType?: ArticleSourceType;
};

type InsertAnnotation = {
  id: string;
  articleId: string;
  exact: string;
  prefix?: string;
  suffix?: string;
  author?: 'user' | 'ai';
  createdAt?: string;
  updatedAt?: string;
  distillation?: { status: 'published' | 'unpublished'; content: string };
};

type InsertComment = {
  id: string;
  annotationId: string;
  author: 'user' | 'ai';
  content: string;
  createdAt: string;
  pending?: boolean;
};

function createFixture() {
  const database = new SQLiteDatabase(':memory:');
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  const executor: ReadingMemorySqliteExecutor = {
    exec: (sql) => database.exec(sql),
    prepare: (sql) => {
      const statement = database.prepare(sql);
      return {
        all: (...values) => statement.all(...values),
        get: (...values) => statement.get(...values),
        run: (...values) => statement.run(...values),
      };
    },
  };

  const insertArticle = (input: InsertArticle) =>
    database
      .prepare(
        `
INSERT INTO articles (
  id, url, canonical_url, title, byline, source_type, content_hash, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
      )
      .run(
        input.id,
        `https://example.com/${input.id}`,
        `https://example.com/${input.id}`,
        input.title,
        input.byline || null,
        input.sourceType || 'web',
        `hash_${input.id}`,
        timestamp,
        timestamp,
      );

  const source = (annotationId: string) => {
    const [result] = readStoredAnnotationThreadSources(executor, [annotationId]);
    if (!result) throw new Error(`Missing source ${annotationId}`);
    return result;
  };

  return {
    executor,
    insertArticle,
    insertArticleIfMissing: (input: InsertArticle) => {
      const existing = database.prepare('SELECT 1 FROM articles WHERE id = ?').get(input.id);
      if (!existing) insertArticle(input);
    },
    insertAnnotation: (input: InsertAnnotation) =>
      database
        .prepare(
          `
INSERT INTO annotations (
  id,
  article_id,
  anchor,
  author,
  color,
  agent_id,
  agent_username,
  user_id,
  user_username,
  distillation_status,
  distillation_content,
  distillation_published_at,
  distillation_updated_at,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, '#f59e0b', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
        )
        .run(
          input.id,
          input.articleId,
          JSON.stringify({
            exact: input.exact,
            prefix: input.prefix || '',
            suffix: input.suffix || '',
            start: 0,
            end: input.exact.length,
          }),
          input.author || 'user',
          input.author === 'ai' ? 'agent_1' : null,
          input.author === 'ai' ? 'assistant' : null,
          input.author === 'ai' ? null : 'reader_1',
          input.author === 'ai' ? null : 'reader',
          input.distillation?.status || null,
          input.distillation?.content || null,
          input.distillation ? input.createdAt || timestamp : null,
          input.distillation ? input.updatedAt || timestamp : null,
          input.createdAt || timestamp,
          input.updatedAt || input.createdAt || timestamp,
        ),
    insertComment: (input: InsertComment) =>
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
  user_username,
  pending
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
        )
        .run(
          input.id,
          input.annotationId,
          input.author,
          input.content,
          input.createdAt,
          input.author === 'ai' ? 'agent_1' : null,
          input.author === 'ai' ? 'assistant' : null,
          input.author === 'user' ? 'reader_1' : null,
          input.author === 'user' ? 'reader' : null,
          input.pending ? 1 : null,
        ),
    insertCollection: (collectionId: string, memberArticleIds: string[]) => {
      database
        .prepare(
          `
INSERT INTO collections (id, name, created_at, updated_at)
VALUES (?, ?, ?, ?)
`,
        )
        .run(collectionId, collectionId, timestamp, timestamp);
      const insert = database.prepare(
        `
INSERT INTO collection_members (collection_id, member_kind, member_id, added_at)
VALUES (?, 'article', ?, ?)
`,
      );
      for (const articleId of memberArticleIds) insert.run(collectionId, articleId, timestamp);
    },
    removeCollectionMember: (collectionId: string, articleId: string) =>
      database
        .prepare(
          `
DELETE FROM collection_members
WHERE collection_id = ? AND member_kind = 'article' AND member_id = ?
`,
        )
        .run(collectionId, articleId),
    project: (annotationId: string, projectorVersion = readingMemoryEvidenceProjectorVersion) => {
      const current = source(annotationId);
      withReadingMemoryTransaction(executor, () => {
        replaceReadingEvidenceThreadInTransaction(
          executor,
          {
            targetId: current.targetId,
            articleId: current.articleId,
            sourceVersion: current.sourceVersion,
            projectorVersion,
            projectedAt: timestamp,
          },
          projectReadingEvidenceThread({
            articleId: current.articleId,
            annotation: current.annotation,
            sourceVersion: current.sourceVersion,
            projectorVersion,
          }),
        );
      });
      return current;
    },
    updateAnnotationAnchor: (annotationId: string, exact: string) =>
      database
        .prepare('UPDATE annotations SET anchor = ?, updated_at = ? WHERE id = ?')
        .run(
          JSON.stringify({ exact, prefix: '', suffix: '', start: 0, end: exact.length }),
          '2026-08-29T00:05:00.000Z',
          annotationId,
        ),
    deleteAnnotation: (annotationId: string) =>
      database.prepare('DELETE FROM annotations WHERE id = ?').run(annotationId),
    unpublishDistillation: (annotationId: string) =>
      database
        .prepare(
          `
UPDATE annotations
SET distillation_status = 'unpublished', updated_at = ?
WHERE id = ?
`,
        )
        .run('2026-08-29T00:05:00.000Z', annotationId),
    updateSearchText: (evidenceId: string, searchText: string) =>
      database
        .prepare('UPDATE reading_memory_evidence_entries SET search_text = ? WHERE id = ?')
        .run(searchText, evidenceId),
  };
}

function search(
  fixture: ReturnType<typeof createFixture>,
  query: string,
  scope: ReadingEvidenceScope = { kind: 'library' },
  limit?: number,
) {
  return searchReadingEvidence({ query, scope, limit, executor: fixture.executor });
}

function evidenceArticleIds(evidence: ReturnType<typeof search>['evidence']) {
  return evidence.map((item) => item.source.ref.id).toSorted();
}
