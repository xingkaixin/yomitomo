import { rm } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { type ArticleRecord } from '@yomitomo/shared';

const testState = vi.hoisted(() => ({
  secrets: new Map<string, string>(),
  saveProviderApiKeyError: undefined as Error | undefined,
  saveProviderApiKeyPause: undefined as Promise<void> | undefined,
  saveProviderApiKeyCalls: 0,
  deleteStoredSecretError: undefined as Error | undefined,
  providerApiKeyRef: (providerId: string) => `provider:${providerId}:apiKey`,
  backfillAnnotationMemoryEntries: vi.fn(),
  fetchFaviconDataUrl: vi.fn(),
  logErrors: [] as Array<{ event: string; error: unknown; data?: Record<string, unknown> }>,
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/yomitomo-store-article-summaries-test',
  },
}));

vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return {
    loadSQLiteDatabase: () => SQLiteDatabase,
  };
});

vi.mock('../providers/provider-secrets', () => {
  return {
    providerApiKeyRef: testState.providerApiKeyRef,
    saveProviderApiKey: async (providerId: string, apiKey: string) => {
      testState.saveProviderApiKeyCalls += 1;
      await testState.saveProviderApiKeyPause;
      if (testState.saveProviderApiKeyError) throw testState.saveProviderApiKeyError;
      const ref = testState.providerApiKeyRef(providerId);
      testState.secrets.set(ref, apiKey);
      return ref;
    },
    saveStoredSecret: async (ref: string, secret: string) => {
      if (testState.saveProviderApiKeyError) throw testState.saveProviderApiKeyError;
      testState.secrets.set(ref, secret);
    },
    readProviderApiKey: async (apiKeyRef?: string | null) =>
      (apiKeyRef && testState.secrets.get(apiKeyRef)) || '',
    deleteStoredSecret: async (secretRef: string) => {
      if (testState.deleteStoredSecretError) throw testState.deleteStoredSecretError;
      testState.secrets.delete(secretRef);
    },
  };
});

vi.mock('../articles/article-annotation-memory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../articles/article-annotation-memory')>();
  return {
    ...actual,
    backfillStoredArticleAnnotationMemoryEntries: testState.backfillAnnotationMemoryEntries,
  };
});

vi.mock('../articles/article-favicon', () => ({
  fetchFaviconDataUrl: testState.fetchFaviconDataUrl,
}));

vi.mock('../app/logger', () => ({
  logInfo: vi.fn(),
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => {
    testState.logErrors.push({ event, error, data });
  },
}));

import { writeArticleRows } from '../articles/article-row-writes';
import { readArticleRows } from '../articles/article-row-queries';
import { getDatabase, withDatabaseMaintenance } from './store-db';
import { closeDatabase } from './store-lifecycle';
import { readArticle, saveArticleReaderChatState } from './store-articles';
import { createAssistantChannelSources } from '../assistant-sessions/assistant-channel-sources';
import { readStore } from './store-snapshot';
import * as schema from '../db/schema';

beforeEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-article-summaries-test', { recursive: true, force: true });
  testState.secrets.clear();
  testState.saveProviderApiKeyError = undefined;
  testState.saveProviderApiKeyPause = undefined;
  testState.saveProviderApiKeyCalls = 0;
  testState.deleteStoredSecretError = undefined;
  testState.backfillAnnotationMemoryEntries.mockReset();
  testState.backfillAnnotationMemoryEntries.mockReturnValue({
    articleCount: 0,
    annotationCount: 0,
    entryCount: 0,
  });
  testState.fetchFaviconDataUrl.mockReset();
  testState.logErrors = [];
});

afterEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-article-summaries-test', { recursive: true, force: true });
});

describe('desktop store articles', () => {
  it('preserves a reply published before a pending assistant selection is saved', async () => {
    const article = articleRecord({ id: 'chat_article' });
    writeArticleRows(getDatabase(), article);
    const selection = {
      articleId: article.id,
      initialSessionId: 'session',
      selectedAssistantId: 'a',
    };
    await saveArticleReaderChatState(selection);
    const sources = createAssistantChannelSources(() => {});
    const channel = { kind: 'chat' as const, sessionId: 'session' };
    expect(
      await sources.publishReply(article.id, channel, {
        id: 'reply',
        author: { kind: 'agent', agentId: 'a', username: 'a' },
        content: 'Saved answer',
        createdAt: article.updatedAt,
      }),
    ).toBe(true);
    const patch = await saveArticleReaderChatState({ ...selection, selectedAssistantId: 'b' });
    const saved = (await readArticle(article.id))?.readerChatState;
    expect(saved).toMatchObject({
      selectedAssistantId: 'b',
      sessions: [{ messages: [{ id: 'reply', content: 'Saved answer' }] }],
    });
    expect(patch.readerChatState).toEqual(saved);
  });

  it('merges stale reader chat snapshots without overwriting published replies or newer sessions', async () => {
    const article = articleRecord({ id: 'chat_merge_article' });
    writeArticleRows(getDatabase(), article);
    const initialState = {
      articleId: article.id,
      activeSessionId: 'session_1',
      selectedAssistantId: 'a',
      sessions: [
        {
          id: 'session_1',
          articleId: article.id,
          createdAt: '2026-05-17T08:00:00.000Z',
          updatedAt: '2026-05-17T08:00:00.000Z',
          messages: [
            {
              id: 'user_1',
              role: 'user' as const,
              content: 'First question',
              createdAt: '2026-05-17T08:00:00.000Z',
            },
          ],
        },
      ],
      createdAt: '2026-05-17T08:00:00.000Z',
      updatedAt: '2026-05-17T08:00:00.000Z',
    };
    await saveArticleReaderChatState({ articleId: article.id, readerChatState: initialState });

    const sources = createAssistantChannelSources(() => {});
    expect(
      await sources.publishReply(
        article.id,
        { kind: 'chat', sessionId: 'session_1' },
        {
          id: 'reply_1',
          author: { kind: 'agent', agentId: 'a', username: 'a' },
          content: 'First answer',
          createdAt: '2026-05-17T08:01:00.000Z',
        },
      ),
    ).toBe(true);

    // Renderer saves a new user question built from the pre-reply snapshot.
    const [initialSession] = initialState.sessions;
    const staleNextState = {
      ...initialState,
      updatedAt: '2026-05-17T08:02:00.000Z',
      sessions: [
        {
          ...initialSession,
          updatedAt: '2026-05-17T08:02:00.000Z',
          messages: [
            ...initialSession.messages,
            {
              id: 'user_2',
              role: 'user' as const,
              content: 'Follow-up question',
              createdAt: '2026-05-17T08:02:00.000Z',
            },
          ],
        },
      ],
    };
    const mergedPatch = await saveArticleReaderChatState({
      articleId: article.id,
      readerChatState: staleNextState,
    });
    const saved = (await readArticle(article.id))?.readerChatState;
    expect(saved?.sessions[0]?.messages.map((message) => message.id)).toEqual([
      'user_1',
      'reply_1',
      'user_2',
    ]);
    expect(mergedPatch.readerChatState).toEqual(saved);

    // An even older out-of-order snapshot from another window preserves both sessions and newer assistant choice.
    await saveArticleReaderChatState({
      articleId: article.id,
      initialSessionId: 'session_1',
      selectedAssistantId: 'b',
    });
    const olderWindowState = {
      articleId: article.id,
      activeSessionId: 'session_2',
      selectedAssistantId: 'a',
      sessions: [
        {
          id: 'session_2',
          articleId: article.id,
          createdAt: '2026-05-17T08:00:30.000Z',
          updatedAt: '2026-05-17T08:00:30.000Z',
          messages: [
            {
              id: 'user_window_b',
              role: 'user' as const,
              content: 'From window B',
              createdAt: '2026-05-17T08:00:30.000Z',
            },
          ],
        },
      ],
      createdAt: '2026-05-17T08:00:30.000Z',
      updatedAt: '2026-05-17T08:00:30.000Z',
    };
    const olderPatch = await saveArticleReaderChatState({
      articleId: article.id,
      readerChatState: olderWindowState,
    });
    const afterOlder = (await readArticle(article.id))?.readerChatState;
    expect(afterOlder?.selectedAssistantId).toBe('b');
    expect(afterOlder?.activeSessionId).toBe('session_1');
    expect(afterOlder?.sessions.map((session) => session.id)).toEqual(['session_1', 'session_2']);
    expect(olderPatch.readerChatState).toEqual(afterOlder);

    // Explicit clear resets readerChatState to undefined.
    const cleared = await saveArticleReaderChatState({
      articleId: article.id,
      readerChatState: undefined,
    });
    expect(cleared.readerChatState).toBeUndefined();
    expect((await readArticle(article.id))?.readerChatState).toBeUndefined();
  });

  it('rejects assistant channel writes during database maintenance and after database replacement', async () => {
    const article = articleRecord({ id: 'lease_article' });
    writeArticleRows(getDatabase(), article);
    await saveArticleReaderChatState({
      articleId: article.id,
      initialSessionId: 'session',
      selectedAssistantId: 'a',
    });
    const sources = createAssistantChannelSources(() => {});
    const channel = { kind: 'chat' as const, sessionId: 'session' };

    expect(await sources.readChannel(article.id, channel)).toBeDefined();

    await withDatabaseMaintenance(async () => {
      await expect(
        sources.publishReply(article.id, channel, {
          id: 'during_maintenance',
          author: { kind: 'agent', agentId: 'a', username: 'a' },
          content: 'Should not land during maintenance',
          createdAt: article.updatedAt,
        }),
      ).rejects.toThrow('DATA_MANAGEMENT_DATABASE_REPLACING');
    });

    closeDatabase();
    getDatabase();
    await expect(
      sources.publishReply(article.id, channel, {
        id: 'after_replace',
        author: { kind: 'agent', agentId: 'a', username: 'a' },
        content: 'Should not land on replaced DB',
        createdAt: article.updatedAt,
      }),
    ).rejects.toThrow('DATA_MANAGEMENT_DATABASE_REPLACING');

    const saved = (await readArticle(article.id))?.readerChatState;
    expect(saved?.sessions[0]?.messages).toEqual([]);
  });

  it('resolves discussions by annotation id or comment id scoped to the article', async () => {
    const database = getDatabase();
    writeArticleRows(
      database,
      articleRecord({
        id: 'article_a',
        annotations: [
          {
            id: 'annotation_a',
            anchor: { exact: 'Quote A', prefix: '', suffix: '', start: 0, end: 7 },
            author: { kind: 'user', username: 'reader' },
            color: '#f4c95d',
            comments: [
              {
                id: 'comment_a',
                author: { kind: 'user', username: 'reader' },
                content: 'Thought A',
                createdAt: '2026-05-17T08:00:00.000Z',
              },
            ],
            createdAt: '2026-05-17T08:00:00.000Z',
            updatedAt: '2026-05-17T08:00:00.000Z',
          },
        ],
      }),
    );
    writeArticleRows(
      database,
      articleRecord({
        id: 'article_b',
        annotations: [
          {
            id: 'annotation_b',
            anchor: { exact: 'Quote B', prefix: '', suffix: '', start: 0, end: 7 },
            author: { kind: 'user', username: 'reader' },
            color: '#f4c95d',
            comments: [
              {
                id: 'comment_b',
                author: { kind: 'user', username: 'reader' },
                content: 'Thought B',
                createdAt: '2026-05-17T08:00:00.000Z',
              },
            ],
            createdAt: '2026-05-17T08:00:00.000Z',
            updatedAt: '2026-05-17T08:00:00.000Z',
          },
        ],
      }),
    );

    const sources = createAssistantChannelSources(() => {});
    expect(await sources.findDiscussion('article_a', 'annotation_a')).toMatchObject({
      annotationId: 'annotation_a',
      quote: 'Quote A',
    });
    expect(await sources.findDiscussion('article_a', 'comment_a')).toMatchObject({
      annotationId: 'annotation_a',
      quote: 'Quote A',
    });
    expect(await sources.findDiscussion('article_a', 'comment_b')).toBeUndefined();
    expect(await sources.findDiscussion('article_a', 'annotation_b')).toBeUndefined();
  });

  it('preserves corrupt source summaries and reports full content as unavailable', async () => {
    const database = getDatabase();
    const base = articleRecord({ id: 'corrupt_ebook' });
    writeArticleRows(database, {
      ...base,
      sourceType: 'ebook',
      ebook: {
        metadata: { format: 'epub', fileName: 'book.epub', fileSize: 1024 },
        chapters: [{ id: 'chapter_1', title: 'Chapter', html: '<p>Text</p>', textLength: 4 }],
      },
    });
    database
      .update(schema.articles)
      .set({ ebookMetadata: null })
      .where(eq(schema.articles.id, 'corrupt_ebook'))
      .run();
    database
      .update(schema.articleBodies)
      .set({ ebookChapters: null })
      .where(eq(schema.articleBodies.articleId, 'corrupt_ebook'))
      .run();

    await expect(readStore()).resolves.toMatchObject({
      articles: [
        {
          id: 'corrupt_ebook',
          sourceType: 'ebook',
          ebook: { metadata: { format: 'epub', fileName: '', fileSize: 0 } },
        },
      ],
    });
    await expect(readArticle('corrupt_ebook')).rejects.toMatchObject({
      articleId: 'corrupt_ebook',
      code: 'ARTICLE_SOURCE_PAYLOAD_INVALID',
      sourceType: 'ebook',
    });
    expect(testState.logErrors).toContainEqual({
      event: 'article.source_payload_invalid',
      error: expect.objectContaining({
        articleId: 'corrupt_ebook',
        code: 'ARTICLE_SOURCE_PAYLOAD_INVALID',
        sourceType: 'ebook',
      }),
      data: { articleId: 'corrupt_ebook', sourceType: 'ebook' },
    });
  });
});

describe('desktop store article bodies', () => {
  it('saves and re-saves a PDF article without body fields', () => {
    const database = getDatabase();
    const { contentHtml: _contentHtml, ...base } = articleRecord({ id: 'pdf_article' });
    const pdfArticle: ArticleRecord = {
      ...base,
      sourceType: 'pdf',
      pdf: { metadata: { format: 'pdf', fileName: 'paper.pdf', fileSize: 1024, pageCount: 1 } },
    };

    writeArticleRows(database, pdfArticle);
    writeArticleRows(database, { ...pdfArticle, title: 'Renamed' });

    expect(readArticleRows(database, 'pdf_article')).toMatchObject({
      sourceType: 'pdf',
      title: 'Renamed',
    });
  });
});

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;

function articleRecord(input: Partial<WebArticleRecord>): WebArticleRecord {
  const id = input.id || 'article';
  return {
    id,
    url: input.url || `https://example.com/${id}`,
    canonicalUrl: input.canonicalUrl || input.url || `https://example.com/${id}`,
    sourceType: 'web',
    title: input.title || id,
    contentHash: input.contentHash || `hash-${id}`,
    annotations: input.annotations || [],
    contentHtml: input.contentHtml || '<p>正文</p>',
    createdAt: input.createdAt || '2026-05-17T07:00:00.000Z',
    updatedAt: input.updatedAt || '2026-05-17T08:00:00.000Z',
  };
}
