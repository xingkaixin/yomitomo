import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Annotation, ArticleRecord, ReadingMemoryEntry } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import {
  agentMessageReadingContextSnapshot,
  createAssistantReadingContextProvider,
} from './assistant-reading-context-provider';
import { migrations } from '../db/migrations';
import {
  appendReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';

describe('assistant reading context provider', () => {
  it('returns current thread and fallback passage evidence', () => {
    const provider = createAssistantReadingContextProvider({
      article: articleRecord(),
      articleText: articleText(),
      agentId: 'agent_1',
      currentAnnotationId: 'annotation_1',
      currentAnchor: anchor(),
    });

    const thread = provider.currentThread({});
    const passages = provider.searchArticlePassages({ query: '选择压力' });

    expect(thread[0]).toMatchObject({
      summary: '当前 thread：目标观点',
      provenance: {
        articleId: 'article_1',
        sourceType: 'annotation',
        sourceAnnotationId: 'annotation_1',
      },
    });
    expect(thread[0]?.text).toContain('original_thought: 目标观点值得展开。');
    expect(passages[0]).toMatchObject({
      summary: '原文命中：选择压力',
      provenance: {
        articleId: 'article_1',
        sourceType: 'original_text',
      },
    });
  });

  it('builds fast prompt memory evidence snapshots', () => {
    const database = memoryDatabase();
    appendReadingMemoryEntries(
      [
        memoryEntry({
          id: 'memory_1',
          payload: { summary: '选择压力来自读者追问', keyTerms: ['选择压力'] },
        }),
      ],
      database,
    );
    const snapshot = agentMessageReadingContextSnapshot({
      payload: {
        agentUsername: 'lin',
        article: {
          id: 'article_1',
          title: '文章',
          url: 'https://example.com/article',
          text: articleText(),
        },
        annotation: annotation(),
        userComment: {
          id: 'comment_2',
          author: 'user',
          content: '读者追问选择压力。',
          replyTo: 'comment_1',
          createdAt: '2026-05-26T00:01:00.000Z',
        },
      },
      agentId: 'agent_1',
      executor: database,
    });

    expect(snapshot?.memoryEvidence?.[0]).toMatchObject({
      summary: '选择压力来自读者追问 选择压力',
      provenance: {
        articleId: 'article_1',
        sourceType: 'ai_task',
        agentId: 'agent_1',
      },
    });
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
