import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  type Annotation,
  type ArticleSummaryRecord,
  type Comment,
} from '@yomitomo/shared';

const testState = vi.hoisted(() => ({
  secrets: new Map<string, string>(),
  providerApiKeyRef: (providerId: string) => `provider:${providerId}:apiKey`,
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/yomitomo-store-test',
  },
}));

vi.mock('./provider-secrets', () => {
  return {
    providerApiKeyRef: testState.providerApiKeyRef,
    saveProviderApiKey: async (providerId: string, apiKey: string) => {
      const ref = testState.providerApiKeyRef(providerId);
      testState.secrets.set(ref, apiKey);
      return ref;
    },
    readProviderApiKey: async (providerId: string, apiKeyRef?: string | null) =>
      testState.secrets.get(apiKeyRef || testState.providerApiKeyRef(providerId)) || '',
    deleteProviderApiKey: async (providerId: string, apiKeyRef?: string | null) => {
      testState.secrets.delete(apiKeyRef || testState.providerApiKeyRef(providerId));
    },
  };
});

import {
  buildArticleReadingProgressPatch,
  buildAgentRecord,
  buildArticleChildRows,
  buildArticleUpsertPatch,
  buildProviderRecord,
  findArticleInListByIdentity,
  mergeSettingsForUpsert,
  readStoredProviderApiKey,
  resolveProviderApiKeyStorage,
} from './store';
import { rowToAnnotation, rowToArticleSummary, type ArticleSummaryRow } from './store-normalizers';

describe('desktop store settings', () => {
  it('preserves missing settings fields during partial upserts', () => {
    expect(
      mergeSettingsForUpsert(
        {
          defaultProviderId: undefined,
          readingAssistantProviderId: undefined,
          reviewAssistantProviderId: undefined,
          saveArticleImages: true,
        },
        {
          defaultProviderId: 'provider_1',
          readingAssistantProviderId: 'provider_1',
          reviewAssistantProviderId: 'provider_1',
          messageSendShortcut: 'mod-enter',
          selectionActionShortcuts: { copy: 'X', annotate: 'B' },
          saveArticleImages: true,
          developerModeEnabled: false,
          logRetentionDays: 30,
          onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
        },
      ),
    ).toEqual({
      defaultProviderId: undefined,
      readingAssistantProviderId: undefined,
      reviewAssistantProviderId: undefined,
      messageSendShortcut: 'mod-enter',
      selectionActionShortcuts: { copy: 'X', annotate: 'B' },
      saveArticleImages: true,
      developerModeEnabled: false,
      logRetentionDays: 30,
      onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
    });
  });

  it('preserves onboarding completion when merging a log retention patch', () => {
    expect(
      mergeSettingsForUpsert(
        { logRetentionDays: 15 },
        {
          onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
          saveArticleImages: true,
        },
      ),
    ).toMatchObject({
      onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
      logRetentionDays: 15,
      saveArticleImages: true,
    });
  });
});

beforeEach(() => {
  testState.secrets.clear();
});

describe('desktop store providers', () => {
  it('resolves new provider api keys into keyring refs', async () => {
    testState.secrets.clear();

    await expect(
      resolveProviderApiKeyStorage('provider_1', { apiKey: ' sk-test ' }, undefined),
    ).resolves.toEqual({
      apiKeyRef: 'provider:provider_1:apiKey',
      storedApiKey: '',
    });
    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('sk-test');
  });

  it('preserves existing legacy api keys until migration can move them', async () => {
    await expect(
      resolveProviderApiKeyStorage('provider_1', {}, { apiKey: 'legacy-key', apiKeyRef: null }),
    ).resolves.toEqual({ storedApiKey: 'legacy-key' });
  });

  it('builds provider records without leaking api keys into the public store', () => {
    const provider = buildProviderRecord(
      {
        name: 'OpenAI',
        type: 'openai-chat',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-5.2',
        modelInputMode: 'custom',
      },
      {
        id: 'provider_1',
        now: '2026-05-16T00:00:00.000Z',
        apiKeyRef: 'provider:provider_1:apiKey',
        storedApiKey: '',
      },
    );

    expect(provider).toMatchObject({
      id: 'provider_1',
      name: 'OpenAI',
      apiKey: '',
      hasApiKey: true,
      modelInputMode: 'custom',
      modelNames: undefined,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });
  });

  it('builds provider records after api key removal without deleting settings', () => {
    const existing = {
      id: 'provider_1',
      name: 'DeepSeek',
      type: 'openai-chat' as const,
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      hasApiKey: true,
      modelName: 'deepseek-chat',
      modelInputMode: 'custom' as const,
      reasoningEffort: 'none' as const,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    const provider = buildProviderRecord(
      { id: 'provider_1', removeApiKey: true },
      {
        id: 'provider_1',
        now: '2026-05-16T00:00:00.000Z',
        existing,
        storedApiKey: '',
      },
    );

    expect(provider).toMatchObject({
      name: 'DeepSeek',
      apiKey: '',
      hasApiKey: false,
      modelName: 'deepseek-chat',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });
  });

  it('reads stored provider api keys from the keyring', async () => {
    testState.secrets.set('provider:provider_1:apiKey', 'sk-stored');

    await expect(readStoredProviderApiKey('provider_1')).resolves.toBe('sk-stored');
  });
});

describe('desktop store agents', () => {
  it('normalizes new agent records against the selected provider', () => {
    const agent = buildAgentRecord(
      {
        kind: 'review',
        providerId: 'provider_1',
        nickname: ' Reviewer ',
        username: ' @Reviewer Bot ',
        enabled: false,
        annotationDensity: 'high',
        temperature: 2,
      },
      {
        agents: [],
        providers: [
          {
            id: 'provider_1',
            name: 'Provider',
            type: 'openai-chat',
            baseUrl: 'https://api.example.com',
            apiKey: '',
            hasApiKey: false,
            modelName: 'model-a',
            modelInputMode: 'custom',
            reasoningEffort: 'none',
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
        ],
      },
      '2026-05-16T00:00:00.000Z',
    );

    expect(agent).toMatchObject({
      kind: 'review',
      providerId: 'provider_1',
      nickname: 'Reviewer',
      username: 'ReviewerBot',
      enabled: false,
      annotationDensity: 'high',
      temperature: 1,
    });
  });

  it('preserves existing agent fields on partial updates', () => {
    const created = buildAgentRecord(
      {
        kind: 'review',
        providerId: 'provider_1',
        nickname: 'Reviewer',
        username: 'reviewer',
        enabled: false,
        annotationDensity: 'low',
        temperature: 0.25,
      },
      {
        agents: [],
        providers: [],
      },
      '2026-05-16T00:00:00.000Z',
    );
    const updated = buildAgentRecord(
      { id: created.id, nickname: 'Updated Reviewer' },
      {
        agents: [created],
        providers: [],
      },
      '2026-05-16T01:00:00.000Z',
    );

    expect(updated).toMatchObject({
      id: created.id,
      kind: 'review',
      providerId: 'provider_1',
      nickname: 'Updated Reviewer',
      username: 'reviewer',
      enabled: false,
      annotationDensity: 'low',
      temperature: 0.25,
    });
  });
});

describe('desktop store reading progress', () => {
  it('builds only the article progress patch', () => {
    const readingProgress = {
      pageIndex: 3,
      pageCount: 12,
      chapterIndex: 1,
      chapterProgress: 0.25,
      progress: 0.31,
      updatedAt: '2026-05-17T08:00:00.000Z',
    };

    expect(buildArticleReadingProgressPatch('article_progress', readingProgress)).toEqual({
      articleId: 'article_progress',
      readingProgress,
      updatedAt: readingProgress.updatedAt,
    });
  });
});

describe('desktop store articles', () => {
  it('builds only the article upsert patch', () => {
    const article: ArticleSummaryRecord = {
      id: 'article-upsert',
      url: 'https://example.com/article-upsert',
      canonicalUrl: 'https://example.com/article-upsert',
      title: 'Upsert article',
      contentHash: 'hash-upsert',
      annotations: [],
      createdAt: '2026-05-17T07:00:00.000Z',
      updatedAt: '2026-05-17T08:00:00.000Z',
    };

    expect(buildArticleUpsertPatch(article)).toEqual({
      type: 'article-upsert',
      article,
    });
  });

  it('keeps aggregate counts on lightweight article summaries', () => {
    const article = rowToArticleSummary(storeSummaryRow(), [], {
      annotationCount: 2,
      commentCount: 1,
    });

    expect(article.annotations).toEqual([]);
    expect(article.annotationCount).toBe(2);
    expect(article.commentCount).toBe(1);
  });

  it('keeps ebook summaries free of full chapter data', () => {
    const article = rowToArticleSummary(
      {
        ...storeSummaryRow(),
        sourceType: 'ebook',
        ebookMetadata: {
          format: 'epub',
          fileName: 'book.epub',
          fileSize: 1200,
        },
      },
      [],
    );

    expect(article.ebook).toEqual({
      metadata: {
        format: 'epub',
        fileName: 'book.epub',
        fileSize: 1200,
      },
    });
  });

  it('builds child rows for multiple annotations and comments', () => {
    const rows = buildArticleChildRows({
      id: 'store-batch-article',
      annotations: [
        annotationRecord('store-batch-annotation-1', [
          commentRecord('store-batch-comment-1', '第一条评论。'),
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

  it('finds existing import articles by id before url identity', () => {
    const idMatch = articleSummaryRecord({
      id: 'id-match',
      url: 'https://example.com/id-match',
      canonicalUrl: 'https://example.com/id-match',
    });
    const urlMatch = articleSummaryRecord({
      id: 'url-match',
      url: 'https://example.com/import',
      canonicalUrl: 'https://example.com/import',
    });

    expect(
      findArticleInListByIdentity([urlMatch, idMatch], {
        id: 'id-match',
        url: 'https://example.com/import',
        canonicalUrl: 'https://example.com/import',
      })?.id,
    ).toBe('id-match');
  });

  it('finds existing import articles by cross-url identity in list order', () => {
    const newer = articleSummaryRecord({
      id: 'newer',
      url: 'https://example.com/newer',
      canonicalUrl: 'https://example.com/import',
    });
    const older = articleSummaryRecord({
      id: 'older',
      url: 'https://example.com/import',
      canonicalUrl: 'https://example.com/older',
    });

    expect(
      findArticleInListByIdentity([newer, older], {
        id: 'missing',
        url: 'https://example.com/import',
        canonicalUrl: 'https://example.com/canonical',
      })?.id,
    ).toBe('newer');
  });
});

function articleSummaryRecord(input: Partial<ArticleSummaryRecord>): ArticleSummaryRecord {
  const id = input.id || 'article';
  return {
    id,
    url: input.url || `https://example.com/${id}`,
    canonicalUrl: input.canonicalUrl || input.url || `https://example.com/${id}`,
    sourceType: input.sourceType || 'web',
    title: input.title || id,
    contentHash: input.contentHash || `hash-${id}`,
    annotations: input.annotations || [],
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
    author: 'user',
    color: '#f59e0b',
    userId: 'user-test',
    comments,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
}

function commentRecord(id: string, content: string): Comment {
  return {
    id,
    author: 'user',
    content,
    createdAt: '2026-05-17T00:00:00.000Z',
    userId: 'user-test',
  };
}

function storeSummaryRow(): ArticleSummaryRow {
  return {
    id: 'store-summary-article',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    sourceType: 'web',
    title: '摘要计数文章',
    byline: null,
    excerpt: null,
    siteName: null,
    themeColor: null,
    contentHash: 'hash-summary',
    ebookMetadata: null,
    pdfMetadata: null,
    readingProgress: null,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
}
