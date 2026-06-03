import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Annotation, ArticleRecord, ReadingMemoryEntry } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import {
  assistantReadingToolDefinitions,
  createAssistantReadingToolExecutor,
} from './assistant-runtime-tools';
import { migrations } from '../db/migrations';
import {
  appendReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';

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
    const text = result.ok ? result.evidence?.[0]?.text || '' : '';
    expect(text).toContain('original_thought_author: 林知微 (@lin)');
    expect(text).toContain('original_thought: 目标观点值得展开。');
    expect(text).toContain('latest_user_comment: user: 读者追问目标观点。');
  });

  it('focuses current thread evidence on the replied root thought', async () => {
    const executor = createAssistantReadingToolExecutor({
      article: {
        id: 'article_1',
        title: '文章',
        annotations: [annotationWithSiblingThoughts()],
      },
      articleText: articleText(),
      agentId: 'agent_3',
      currentAnnotationId: 'annotation_1',
      currentThreadRootCommentId: 'gu_thought',
      currentAnchor: anchor(),
    });

    const result = await executor({
      name: 'get_current_thread',
      input: {},
    });

    const text = result.ok ? result.evidence?.[0]?.text || '' : '';
    expect(text).toContain('original_thought_author: 顾行简 (@guxingjian)');
    expect(text).toContain('original_thought: 顾行简的想法。');
    expect(text).toContain('latest_user_comment: user: @林知微 你怎么看？');
    expect(text).not.toContain('划线助手的另一条想法。');
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
    agentUsername: 'lin',
    color: '#6fa48f',
    anchor: anchor(),
    comments: [
      {
        id: 'comment_1',
        author: 'ai',
        agentId: 'agent_1',
        agentNickname: '林知微',
        agentUsername: 'lin',
        content: '目标观点值得展开。',
        createdAt: '2026-05-26T00:00:30.000Z',
      },
      {
        id: 'comment_2',
        author: 'user',
        content: '读者追问目标观点。',
        replyTo: 'comment_1',
        createdAt: '2026-05-26T00:01:00.000Z',
      },
    ],
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
}

function annotationWithSiblingThoughts(): Annotation {
  return {
    ...annotation(),
    comments: [
      {
        id: 'other_thought',
        author: 'ai',
        agentId: 'agent_2',
        agentNickname: '划线助手',
        agentUsername: 'highlighter',
        content: '划线助手的另一条想法。',
        createdAt: '2026-05-26T00:00:10.000Z',
      },
      {
        id: 'gu_thought',
        author: 'ai',
        agentId: 'agent_gu',
        agentNickname: '顾行简',
        agentUsername: 'guxingjian',
        content: '顾行简的想法。',
        createdAt: '2026-05-26T00:00:20.000Z',
      },
      {
        id: 'reader_reply',
        author: 'user',
        content: '@林知微 你怎么看？',
        replyTo: 'gu_thought',
        createdAt: '2026-05-26T00:01:00.000Z',
      },
    ],
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
  return memoryExecutor(database);
}

function memoryExecutor(database: DatabaseSync): ReadingMemorySqliteExecutor {
  return {
    exec: (sql) => database.exec(sql),
    prepare: (sql) => {
      const statement = database.prepare(sql);
      return {
        run: (...values) => statement.run(...values),
        get: (...values) => statement.get(...values),
        all: (...values) => statement.all(...values),
      };
    },
  };
}
