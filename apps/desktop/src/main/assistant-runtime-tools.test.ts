import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Annotation, ArticleRecord, ReadingMemoryEntry } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import {
  assistantReadingToolDefinitions,
  createAssistantReadingToolExecutor,
} from './assistant-runtime-tools';
import { migrations } from './db/migrations';
import {
  appendReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from './reading-memory-store';

describe('assistant runtime reading tools', () => {
  it('returns current thread evidence with provenance', async () => {
    const executor = createAssistantReadingToolExecutor({
      article: articleRecord(),
      articleText: articleText(),
      agentId: 'agent_1',
      currentAnnotationId: 'annotation_1',
      currentAnchor: anchor(),
    });

    const result = await executor({
      name: 'get_current_thread',
      input: {},
    });

    expect(result).toMatchObject({
      ok: true,
      evidence: [
        {
          summary: '当前 thread：目标观点',
          provenance: {
            articleId: 'article_1',
            sourceType: 'annotation',
            sourceAnnotationId: 'annotation_1',
            agentId: 'agent_1',
          },
        },
      ],
    });
    expect(result.ok && result.evidence?.[0]?.text).toContain('读者追问目标观点');
  });

  it('searches own and other agent memory with agent filters', async () => {
    const database = memoryDatabase();
    appendReadingMemoryEntries(
      [
        memoryEntry({
          id: 'own_memory',
          agentId: 'agent_1',
          payload: { summary: '选择压力来自当前助手', keyTerms: ['选择压力'] },
        }),
        memoryEntry({
          id: 'other_memory',
          agentId: 'agent_2',
          payload: { summary: '选择压力来自其他助手', keyTerms: ['选择压力'] },
        }),
        memoryEntry({
          id: 'reader_memory',
          scope: 'reader',
          agentId: undefined,
          payload: { summary: '选择压力来自读者', keyTerms: ['选择压力'] },
        }),
      ],
      database,
    );
    const executor = createAssistantReadingToolExecutor({
      article: articleRecord(),
      articleText: articleText(),
      agentId: 'agent_1',
      executor: database,
    });

    const own = await executor({
      name: 'search_own_memory',
      input: { query: '选择压力' },
    });
    const other = await executor({
      name: 'search_other_agents_memory',
      input: { query: '选择压力' },
    });

    expect(own.ok && own.evidence?.map((item) => item.provenance.agentId)).toEqual(['agent_1']);
    expect(other.ok && other.evidence?.map((item) => item.provenance.agentId)).toEqual(['agent_2']);
  });

  it('searches article passages without an ebook index', async () => {
    const executor = createAssistantReadingToolExecutor({
      article: articleRecord(),
      articleText: articleText(),
      agentId: 'agent_1',
    });

    const result = await executor({
      name: 'search_article_passages',
      input: { query: '选择压力' },
    });

    expect(result.ok && result.evidence?.[0]).toMatchObject({
      summary: '原文命中：选择压力',
      provenance: {
        articleId: 'article_1',
        sourceType: 'original_text',
      },
    });
    expect(result.ok && result.evidence?.[0]?.text).toContain('选择压力');
  });

  it('declares validation for query based tools', () => {
    const memoryTool = assistantReadingToolDefinitions.find(
      (definition) => definition.name === 'search_article_memory',
    );
    const duplicateTool = assistantReadingToolDefinitions.find(
      (definition) => definition.name === 'check_duplicate_thought',
    );

    expect(memoryTool?.validateInput?.({ query: '' })).toBe('missing_query');
    expect(memoryTool?.validateInput?.({ query: '目标' })).toBeNull();
    expect(duplicateTool?.validateInput?.({ candidateThought: '' })).toBe(
      'missing_candidate_thought',
    );
  });
});

function articleText() {
  return '开头内容。目标观点说明选择压力如何形成。后续内容。';
}

function anchor() {
  const text = articleText();
  const start = text.indexOf('目标观点');
  return createTextAnchor(text, start, start + '目标观点'.length);
}

function articleRecord(): Pick<ArticleRecord, 'id' | 'title' | 'annotations' | 'ebook'> {
  return {
    id: 'article_1',
    title: '文章',
    annotations: [annotation()],
  };
}

function annotation(): Annotation {
  return {
    id: 'annotation_1',
    author: 'ai',
    agentId: 'agent_1',
    agentNickname: '林知微',
    agentUsername: '林知微',
    color: '#6fa48f',
    anchor: anchor(),
    comments: [
      {
        id: 'comment_1',
        author: 'user',
        content: '读者追问目标观点。',
        createdAt: '2026-05-26T00:01:00.000Z',
      },
    ],
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
}

function memoryEntry(overrides: Partial<ReadingMemoryEntry> = {}): ReadingMemoryEntry {
  return {
    id: 'memory_1',
    articleId: 'article_1',
    kind: 'summary',
    scope: 'agent',
    visibility: 'default',
    payloadVersion: 1,
    agentId: 'agent_1',
    sourceType: 'ai_task',
    sourceTaskId: 'task_1',
    sourceEntryIds: [],
    payload: { summary: '选择压力记忆', keyTerms: ['选择压力'] },
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

function memoryDatabase(): ReadingMemorySqliteExecutor {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  database
    .prepare(
      `
INSERT INTO articles (
  id,
  url,
  canonical_url,
  title,
  content_hash,
  created_at,
  updated_at
)
VALUES (?, 'https://example.com/article', 'https://example.com/article', 'Article', 'hash', ?, ?)
`,
    )
    .run('article_1', '2026-05-26T00:00:00.000Z', '2026-05-26T00:00:00.000Z');
  return database as unknown as ReadingMemorySqliteExecutor;
}
