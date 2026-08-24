import { rm } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  type Annotation,
  type ArticleRecord,
  type Comment,
  type ReaderChatState,
} from '@yomitomo/shared';

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
    getPath: () => '/tmp/yomitomo-store-article-relations-test',
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
    readProviderApiKey: async (providerId: string, apiKeyRef?: string | null) =>
      testState.secrets.get(apiKeyRef || testState.providerApiKeyRef(providerId)) || '',
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
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => {
    testState.logErrors.push({ event, error, data });
  },
}));

import { buildArticleChildRows } from '../articles/article-repository-child-rows';
import { buildArticleReaderChatStatePatch } from '../articles/article-reading-state';
import { writeArticleRows } from '../articles/article-row-writes';
import { readArticleRows } from '../articles/article-row-queries';
import { addCollectionMembers, createCollection, setLibraryPin } from './store-collections';
import { getDatabase } from './store-db';
import { closeDatabase } from './store-lifecycle';
import { readStore } from './store-snapshot';
import { rowToAnnotation, rowToComment } from './store-normalizers';
import * as schema from '../db/schema';

beforeEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-article-relations-test', { recursive: true, force: true });
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
  await rm('/tmp/yomitomo-store-article-relations-test', { recursive: true, force: true });
});

describe('desktop store article relations', () => {
  it('hydrates annotation avatars from current actor rows without persisting copies', () => {
    const database = getDatabase();
    insertProviderRow({ id: 'provider_avatar' });
    database.insert(schema.agents).values(agentRow()).run();
    database.insert(schema.userProfiles).values(userProfileRow()).run();

    const article = articleRecord({
      id: 'avatar_article',
      annotations: [
        {
          ...annotationRecord('annotation_user_avatar', [
            {
              ...commentRecord('comment_user_avatar', '用户评论'),
              author: {
                kind: 'user',
                userId: 'user-test',
                username: 'reader',
                avatar: 'stale-user-avatar',
              },
            },
          ]),
          author: {
            kind: 'user',
            userId: 'user-test',
            username: 'reader',
            avatar: 'stale-user-avatar',
          },
        },
        {
          ...annotationRecord('annotation_agent_avatar', [
            {
              ...commentRecord('comment_agent_avatar', '助手评论'),
              author: {
                kind: 'agent',
                agentId: 'agent_avatar',
                username: 'assistant',
                avatar: 'stale-agent-avatar',
              },
            },
          ]),
          author: {
            kind: 'agent',
            agentId: 'agent_avatar',
            username: 'assistant',
            avatar: 'stale-agent-avatar',
          },
        },
      ],
    });

    writeArticleRows(database, article);

    const annotationRows = database.select().from(schema.annotations).all();
    const commentRows = database.select().from(schema.comments).all();
    expect(annotationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'annotation_user_avatar', userAvatar: null }),
        expect.objectContaining({ id: 'annotation_agent_avatar', agentAvatar: null }),
      ]),
    );
    expect(commentRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'comment_user_avatar', userAvatar: null }),
        expect.objectContaining({ id: 'comment_agent_avatar', agentAvatar: null }),
      ]),
    );

    const hydratedArticle = readArticleRows(database, 'avatar_article');
    expect(hydratedArticle?.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'annotation_user_avatar',
          author: expect.objectContaining({ avatar: 'current-user-avatar' }),
          comments: [
            expect.objectContaining({
              id: 'comment_user_avatar',
              author: expect.objectContaining({ avatar: 'current-user-avatar' }),
            }),
          ],
        }),
        expect.objectContaining({
          id: 'annotation_agent_avatar',
          author: expect.objectContaining({ avatar: 'current-agent-avatar' }),
          comments: [
            expect.objectContaining({
              id: 'comment_agent_avatar',
              author: expect.objectContaining({ avatar: 'current-agent-avatar' }),
            }),
          ],
        }),
      ]),
    );
  });

  it('includes collections members and pins in store snapshots', async () => {
    const { collection } = await createCollection({ name: '主题研究' });
    await addCollectionMembers({
      collectionId: collection.id,
      members: [
        { kind: 'article', id: 'article_1' },
        { kind: 'weread', id: 'book_1' },
      ],
    });
    await setLibraryPin({
      target: { kind: 'collection', id: collection.id },
      pinned: true,
    });

    const store = await readStore();

    expect(store.collections).toMatchObject([{ id: collection.id, name: '主题研究' }]);
    expect(store.collectionMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionId: collection.id,
          member: { kind: 'article', id: 'article_1' },
        }),
        expect.objectContaining({
          collectionId: collection.id,
          member: { kind: 'weread', id: 'book_1' },
        }),
      ]),
    );
    expect(store.pins).toEqual([
      expect.objectContaining({
        targetKind: 'collection',
        targetId: collection.id,
      }),
    ]);
  });

  it('normalizes reader chat state patches', () => {
    const readerChatState: ReaderChatState = {
      articleId: 'store-summary-article',
      activeSessionId: 'session_1',
      selectedAssistantId: 'agent_reader',
      createdAt: '2026-06-06T08:00:00.000Z',
      updatedAt: '2026-06-06T08:05:00.000Z',
      sessions: [
        {
          id: 'session_1',
          articleId: 'store-summary-article',
          createdAt: '2026-06-06T08:00:00.000Z',
          updatedAt: '2026-06-06T08:05:00.000Z',
          messages: [
            {
              id: 'message_1',
              role: 'user',
              content: '这里的概念是什么意思？',
              context: {
                sourceType: 'pdf',
                quote: '关键概念',
                anchor: createPdfTextAnchor({
                  pageText: '这里有一个关键概念需要解释。',
                  start: 5,
                  end: 9,
                  pageIndex: 2,
                  pageWidth: 612,
                  pageHeight: 792,
                  rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
                }),
              },
              createdAt: '2026-06-06T08:01:00.000Z',
            },
          ],
        },
      ],
    };
    const patch = buildArticleReaderChatStatePatch('store-summary-article', readerChatState);

    expect(patch).toEqual({
      type: 'article-reader-chat-state',
      articleId: 'store-summary-article',
      readerChatState,
      updatedAt: readerChatState.updatedAt,
    });
  });

  it('drops reader chat state that belongs to another article', () => {
    const readerChatState: ReaderChatState = {
      articleId: 'other-article',
      activeSessionId: 'session_1',
      createdAt: '2026-06-06T08:00:00.000Z',
      updatedAt: '2026-06-06T08:05:00.000Z',
      sessions: [
        {
          id: 'session_1',
          articleId: 'other-article',
          createdAt: '2026-06-06T08:00:00.000Z',
          updatedAt: '2026-06-06T08:05:00.000Z',
          messages: [],
        },
      ],
    };

    expect(
      buildArticleReaderChatStatePatch('store-summary-article', readerChatState).readerChatState,
    ).toBeUndefined();
  });

  it('builds child rows for multiple annotations and comments', () => {
    const rows = buildArticleChildRows({
      id: 'store-batch-article',
      annotations: [
        annotationRecord('store-batch-annotation-1', [
          {
            ...commentRecord('store-batch-comment-1', '第一条评论。'),
            assistantProgress: {
              steps: [{ id: 'get_current_thread', label: '读取当前讨论', status: 'done' }],
            },
          },
          commentRecord('store-batch-comment-2', '第二条评论。'),
        ]),
        annotationRecord('store-batch-annotation-2', [
          commentRecord('store-batch-comment-3', '第三条评论。'),
        ]),
      ],
    });

    expect(rows.annotationRows.map((annotation) => annotation.id)).toEqual([
      'store-batch-annotation-1',
      'store-batch-annotation-2',
    ]);
    expect(rows.annotationRows.map((annotation) => annotation.articleId)).toEqual([
      'store-batch-article',
      'store-batch-article',
    ]);
    expect(rows.commentRows.map((comment) => comment.id)).toEqual([
      'store-batch-comment-1',
      'store-batch-comment-2',
      'store-batch-comment-3',
    ]);
    expect(rows.commentRows.map((comment) => comment.annotationId)).toEqual([
      'store-batch-annotation-1',
      'store-batch-annotation-1',
      'store-batch-annotation-2',
    ]);
    const firstCommentRow = rows.commentRows[0];
    if (!firstCommentRow) throw new Error('expected comment row');
    expect(firstCommentRow.assistantProgress).toEqual({
      steps: [{ id: 'get_current_thread', label: '读取当前讨论', status: 'done' }],
    });
    expect(
      rowToComment({
        ...firstCommentRow,
        replyTo: firstCommentRow.replyTo ?? null,
        agentId: firstCommentRow.agentId ?? null,
        agentUsername: firstCommentRow.agentUsername ?? null,
        agentNickname: firstCommentRow.agentNickname ?? null,
        agentAvatar: firstCommentRow.agentAvatar ?? null,
        agentAnnotationColor: firstCommentRow.agentAnnotationColor ?? null,
        readingIntent: firstCommentRow.readingIntent ?? null,
        reviewLabel: firstCommentRow.reviewLabel ?? null,
        assistantProgress: firstCommentRow.assistantProgress ?? null,
        userId: firstCommentRow.userId ?? null,
        userUsername: firstCommentRow.userUsername ?? null,
        userNickname: firstCommentRow.userNickname ?? null,
        userAvatar: firstCommentRow.userAvatar ?? null,
        userAnnotationColor: firstCommentRow.userAnnotationColor ?? null,
        pending: firstCommentRow.pending ?? null,
      }),
    ).toMatchObject({
      assistantProgress: {
        steps: [{ id: 'get_current_thread', label: '读取当前讨论', status: 'done' }],
      },
    });
  });

  it('builds annotation distillation rows for published reading assets', () => {
    const rows = buildArticleChildRows({
      id: 'store-distillation-article',
      annotations: [
        {
          ...annotationRecord('store-distillation-annotation', []),
          distillation: {
            status: 'published',
            content: '最终沉淀',
            publishedAt: '2026-05-17T01:00:00.000Z',
            updatedAt: '2026-05-17T02:00:00.000Z',
            reviewSessions: [
              {
                id: 'review-session-1',
                agentId: 'review-agent-1',
                agentNickname: '梁证言',
                messages: [
                  {
                    id: 'review-message-1',
                    author: {
                      kind: 'agent',
                      agentId: 'review-agent-1',
                      username: 'assistant',
                    },
                    content: '这里还可以追问前提。',
                    createdAt: '2026-05-17T01:30:00.000Z',
                  },
                  {
                    id: 'review-message-user-1',
                    author: { kind: 'user', username: 'reader' },
                    content: '请确认这里的前提。',
                    createdAt: '2026-05-17T01:31:00.000Z',
                  },
                ],
                createdAt: '2026-05-17T01:20:00.000Z',
                updatedAt: '2026-05-17T01:30:00.000Z',
              },
            ],
          },
        },
      ],
    });

    expect(rows.annotationRows[0]).toMatchObject({
      distillationStatus: 'published',
      distillationContent: '最终沉淀',
      distillationPublishedAt: '2026-05-17T01:00:00.000Z',
      distillationUpdatedAt: '2026-05-17T02:00:00.000Z',
      distillationReviewSessions: [
        expect.objectContaining({
          id: 'review-session-1',
          agentId: 'review-agent-1',
          messages: [
            expect.objectContaining({
              author: 'ai',
              agentId: 'review-agent-1',
              agentUsername: 'assistant',
            }),
            expect.objectContaining({ author: 'user' }),
          ],
        }),
      ],
    });
    expect(rows.annotationRows[0]?.distillationReviewSessions?.[0]?.messages[0]).not.toHaveProperty(
      'kind',
    );
  });

  it('preserves PDF annotation anchors when reading rows', () => {
    const pdfAnchor = createPdfTextAnchor({
      pageText: '第一页 PDF 正文',
      pageIndex: 2,
      start: 4,
      end: 7,
      pageWidth: 612,
      pageHeight: 792,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    });
    const rows = buildArticleChildRows({
      id: 'pdf-article',
      annotations: [{ ...annotationRecord('pdf-annotation', []), anchor: pdfAnchor }],
    });

    const annotationRow = rows.annotationRows[0];
    if (!annotationRow) throw new Error('expected annotation row');
    const annotation = rowToAnnotation(
      {
        ...annotationRow,
        annotationType: annotationRow.annotationType ?? null,
        readingIntent: annotationRow.readingIntent ?? null,
        whyHere: annotationRow.whyHere ?? null,
        confidence: annotationRow.confidence ?? null,
        moveType: annotationRow.moveType ?? null,
        shouldShow: annotationRow.shouldShow ?? null,
        agentId: annotationRow.agentId ?? null,
        agentUsername: annotationRow.agentUsername ?? null,
        agentNickname: annotationRow.agentNickname ?? null,
        agentAvatar: annotationRow.agentAvatar ?? null,
        agentAnnotationColor: annotationRow.agentAnnotationColor ?? null,
        userId: annotationRow.userId ?? null,
        userUsername: annotationRow.userUsername ?? null,
        userNickname: annotationRow.userNickname ?? null,
        userAvatar: annotationRow.userAvatar ?? null,
        userAnnotationColor: annotationRow.userAnnotationColor ?? null,
        distillationStatus: annotationRow.distillationStatus ?? null,
        distillationContent: annotationRow.distillationContent ?? null,
        distillationPublishedAt: annotationRow.distillationPublishedAt ?? null,
        distillationUpdatedAt: annotationRow.distillationUpdatedAt ?? null,
        distillationReviewSessions: annotationRow.distillationReviewSessions ?? null,
      },
      [],
    );

    expect(isPdfTextAnchor(annotation.anchor)).toBe(true);
    expect(annotation.anchor).toMatchObject({
      kind: 'pdf-text',
      pageIndex: 2,
      pageWidth: 612,
      pageHeight: 792,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    });
  });

  it('normalizes distillation review proposals from persisted rows', () => {
    const rows = buildArticleChildRows({
      id: 'store-distillation-proposals-article',
      annotations: [
        {
          ...annotationRecord('store-distillation-proposals-annotation', []),
          distillation: {
            status: 'unpublished',
            content: '草稿',
            reviewSessions: [
              {
                id: 'review-session-proposals',
                agentId: 'review-agent-1',
                messages: [
                  {
                    id: 'review-message-proposals',
                    author: {
                      kind: 'agent',
                      agentId: 'review-agent-1',
                      username: 'assistant',
                    },
                    content: '可以把讨论沉淀成可执行判断。',
                    createdAt: '2026-05-17T01:30:00.000Z',
                    proposals: [
                      {
                        id: 'proposal-insert',
                        kind: 'insert',
                        status: 'pending',
                        title: '',
                        content: '新增判断',
                        sourceDraftHash: 'draft_hash_1',
                        sourceReviewSessionId: 'review-session-proposals',
                        sourceReviewMessageId: 'review-message-proposals',
                        sourceAgentId: 'review-agent-1',
                        updatedAt: '2026-05-17T01:31:00.000Z',
                      },
                      {
                        id: 'proposal-invalid-replace',
                        kind: 'replace',
                        status: 'pending',
                        title: '无效修改',
                        targetText: '旧判断',
                        updatedAt: '2026-05-17T01:32:00.000Z',
                      },
                    ],
                  },
                ],
                createdAt: '2026-05-17T01:20:00.000Z',
                updatedAt: '2026-05-17T01:30:00.000Z',
              },
            ],
          },
        },
      ],
    });

    const annotationRow = rows.annotationRows[0];
    if (!annotationRow) throw new Error('expected annotation row');
    const annotation = rowToAnnotation(
      {
        ...annotationRow,
        annotationType: annotationRow.annotationType ?? null,
        readingIntent: annotationRow.readingIntent ?? null,
        whyHere: annotationRow.whyHere ?? null,
        confidence: annotationRow.confidence ?? null,
        moveType: annotationRow.moveType ?? null,
        shouldShow: annotationRow.shouldShow ?? null,
        agentId: annotationRow.agentId ?? null,
        agentUsername: annotationRow.agentUsername ?? null,
        agentNickname: annotationRow.agentNickname ?? null,
        agentAvatar: annotationRow.agentAvatar ?? null,
        agentAnnotationColor: annotationRow.agentAnnotationColor ?? null,
        userId: annotationRow.userId ?? null,
        userUsername: annotationRow.userUsername ?? null,
        userNickname: annotationRow.userNickname ?? null,
        userAvatar: annotationRow.userAvatar ?? null,
        userAnnotationColor: annotationRow.userAnnotationColor ?? null,
        distillationStatus: annotationRow.distillationStatus ?? null,
        distillationContent: annotationRow.distillationContent ?? null,
        distillationPublishedAt: annotationRow.distillationPublishedAt ?? null,
        distillationUpdatedAt: annotationRow.distillationUpdatedAt ?? null,
        distillationReviewSessions: annotationRow.distillationReviewSessions ?? null,
      },
      [],
    );

    const message = annotation.distillation?.reviewSessions?.[0]?.messages[0];
    expect(message?.author).toEqual({
      kind: 'agent',
      agentId: 'review-agent-1',
      username: 'assistant',
    });
    expect(message?.proposals).toEqual([
      expect.objectContaining({
        id: 'proposal-insert',
        kind: 'insert',
        status: 'pending',
        title: '新增：新增判断',
        content: '新增判断',
        sourceDraftHash: 'draft_hash_1',
        sourceReviewSessionId: 'review-session-proposals',
        sourceReviewMessageId: 'review-message-proposals',
        sourceAgentId: 'review-agent-1',
      }),
    ]);
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

function annotationRecord(id: string, comments: Comment[]): Annotation {
  return {
    id,
    anchor: {
      exact: '正文',
      prefix: '',
      suffix: '。',
      start: 0,
      end: 2,
    },
    author: { kind: 'user', userId: 'user-test', username: 'reader' },
    color: '#f59e0b',
    comments,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
}

function commentRecord(id: string, content: string): Comment {
  return {
    id,
    author: { kind: 'user', userId: 'user-test', username: 'reader' },
    content,
    createdAt: '2026-05-17T00:00:00.000Z',
  };
}

function insertProviderRow(input: Partial<typeof schema.providers.$inferInsert>) {
  getDatabase()
    .insert(schema.providers)
    .values({
      id: input.id || 'provider_1',
      name: input.name || 'Provider',
      type: input.type || 'openai-chat',
      presetId: input.presetId ?? null,
      logo: input.logo ?? null,
      baseUrl: input.baseUrl || 'https://api.example.com',
      apiKey: input.apiKey || '',
      apiKeyRef: input.apiKeyRef ?? null,
      modelName: input.modelName || 'model-a',
      modelNames: input.modelNames,
      modelInputMode: input.modelInputMode || 'custom',
      reasoningEffort: input.reasoningEffort ?? null,
      createdAt: input.createdAt || '2026-05-16T00:00:00.000Z',
      updatedAt: input.updatedAt || '2026-05-16T00:00:00.000Z',
    })
    .run();
}

function agentRow(): typeof schema.agents.$inferInsert {
  return {
    id: 'agent_avatar',
    kind: 'annotation',
    presetId: null,
    enabled: true,
    providerId: 'provider_avatar',
    nickname: 'Agent',
    username: 'agent',
    avatar: 'current-agent-avatar',
    annotationColor: '#8ab6d6',
    annotationDensity: 'medium',
    temperature: 0.7,
    soul: 'test',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  };
}

function userProfileRow(): typeof schema.userProfiles.$inferInsert {
  return {
    id: 'user-test',
    nickname: 'Kevin',
    username: 'kevin',
    avatar: 'current-user-avatar',
    annotationColor: '#f59e0b',
    updatedAt: '2026-05-16T00:00:00.000Z',
  };
}
