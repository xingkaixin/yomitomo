import { describe, expect, it } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import {
  defaultUser,
  mergeSettingsForUpsert,
  normalizeAgentKind,
  normalizeAnnotationDensity,
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeModelNames,
  normalizeProviderModelInputMode,
  normalizeProviderType,
  normalizeReaderChatState,
  normalizeStore,
  normalizeTemperature,
  normalizeUser,
  normalizeUsername,
  rowToAgent,
  rowToAnnotation,
  rowToArticle,
  rowToComment,
  rowToProvider,
  rowToSettings,
} from './store-normalizers';

describe('store normalizers user fields', () => {
  it('fills user defaults while preserving explicit profile fields', () => {
    expect(normalizeUser({ nickname: 'Reader', username: 'reader' })).toEqual({
      ...defaultUser,
      nickname: 'Reader',
      username: 'reader',
    });
  });

  it('normalizes usernames and falls back when nothing valid remains', () => {
    expect(normalizeUsername('@读者 name!*')).toBe('读者name');
    expect(normalizeUsername('!*', 'fallback')).toBe('fallback');
    expect(normalizeUsername('a'.repeat(40))).toBe('a'.repeat(32));
  });
});

describe('store normalizers provider and agent fields', () => {
  it('normalizes provider enums and legacy provider type aliases', () => {
    expect(normalizeProviderType('openai')).toBe('openai-chat');
    expect(normalizeProviderType('unknown')).toBeNull();
    expect(normalizeProviderModelInputMode('custom')).toBe('custom');
    expect(normalizeProviderModelInputMode('invalid')).toBeNull();
  });

  it('deduplicates model names after trimming invalid entries', () => {
    expect(normalizeModelNames([' gpt-5 ', 'gpt-5', '', 42, 'claude'])).toEqual([
      'gpt-5',
      'claude',
    ]);
    expect(normalizeModelNames(['', 42])).toEqual([]);
  });

  it('maps provider rows to safe store records', () => {
    expect(
      rowToProvider({
        id: 'provider_1',
        name: 'Provider',
        type: 'openai',
        presetId: 'missing',
        logo: '',
        baseUrl: 'https://api.example.com',
        apiKey: 'legacy',
        apiKeyRef: null,
        modelName: 'gpt-5',
        modelNames: [' gpt-5 ', 'gpt-5', 'gpt-4'],
        modelInputMode: 'invalid',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      } as Parameters<typeof rowToProvider>[0]),
    ).toMatchObject({
      type: 'openai-chat',
      presetId: undefined,
      logo: undefined,
      apiKey: '',
      hasApiKey: false,
      modelNames: ['gpt-5', 'gpt-4'],
      modelInputMode: 'list',
      reasoningEffort: 'none',
    });
  });

  it('normalizes agent enums and numeric ranges', () => {
    expect(normalizeAgentKind('invalid')).toBeNull();
    expect(normalizeAnnotationDensity('high')).toBe('high');
    expect(normalizeAnnotationDensity('invalid')).toBeNull();
    expect(normalizeTemperature(-1)).toBe(0);
    expect(normalizeTemperature(2)).toBe(1);
    expect(normalizeTemperature('bad')).toBe(0.5);
  });

  it('maps agent rows with fallback kind, color, density, and temperature', () => {
    expect(
      rowToAgent({
        id: 'agent_1',
        kind: 'invalid',
        presetId: '',
        enabled: true,
        providerId: 'provider_1',
        nickname: 'Agent',
        username: 'agent',
        avatar: '',
        annotationColor: '',
        annotationDensity: 'invalid',
        temperature: 2,
        soul: 'Read carefully',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      } as Parameters<typeof rowToAgent>[0]),
    ).toMatchObject({
      kind: 'annotation',
      presetId: undefined,
      annotationColor: '#8ab6d6',
      annotationDensity: 'medium',
      temperature: 1,
    });
  });
});

describe('store normalizers settings', () => {
  it('fills settings defaults from missing rows', () => {
    expect(rowToSettings(undefined)).toMatchObject({
      uiLanguage: 'zh-CN',
      libraryPageSize: undefined,
      libraryContentSources: [
        { id: 'web', enabled: true },
        { id: 'ebook', enabled: true },
        { id: 'pdf', enabled: true },
        { id: 'weread', enabled: true },
      ],
      assistantExecutionMode: 'fast_response',
      messageSendShortcut: 'enter',
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.7,
      appLockEnabled: false,
      appLockLocked: false,
      appLockLockOnStartup: false,
      appLockShortcut: undefined,
      saveArticleImages: false,
      allowLocalNetworkArticleImport: false,
      developerModeEnabled: false,
    });
  });

  it('normalizes invalid persisted settings values to fallbacks', () => {
    expect(
      rowToSettings({
        uiLanguage: 'invalid',
        themeId: '',
        libraryPageSize: 10,
        libraryContentSources: [
          { id: 'web', enabled: false },
          { id: 'bad', enabled: true },
        ],
        defaultProviderId: '',
        readingAssistantProviderId: '',
        reviewAssistantProviderId: '',
        assistantExecutionMode: 'invalid',
        messageSendShortcut: 'invalid',
        soundEffectsEnabled: 0,
        soundEffectsVolume: 2,
        appLockEnabled: 1,
        appLockLocked: 1,
        appLockLockOnStartup: 1,
        appLockShortcut: '',
        selectionActionShortcuts: { copy: '', annotate: 'B', ask: 'Q' },
        saveArticleImages: 1,
        allowLocalNetworkArticleImport: 1,
        developerModeEnabled: 0,
        logRetentionDays: 7,
        onboardingCompletedAt: '',
        lastSeenVersion: '',
      } as unknown as Parameters<typeof rowToSettings>[0]),
    ).toMatchObject({
      uiLanguage: 'zh-CN',
      themeId: undefined,
      libraryPageSize: undefined,
      libraryContentSources: [
        { id: 'web', enabled: false },
        { id: 'ebook', enabled: true },
        { id: 'pdf', enabled: true },
        { id: 'weread', enabled: true },
      ],
      assistantExecutionMode: 'fast_response',
      messageSendShortcut: 'enter',
      soundEffectsEnabled: false,
      soundEffectsVolume: 1,
      appLockEnabled: true,
      appLockLocked: true,
      appLockLockOnStartup: true,
      appLockShortcut: undefined,
      saveArticleImages: true,
      allowLocalNetworkArticleImport: true,
      developerModeEnabled: false,
      logRetentionDays: undefined,
    });
  });

  it('merges partial settings without losing existing values', () => {
    expect(
      mergeSettingsForUpsert(
        { logRetentionDays: 90 },
        {
          themeId: 'ink-paper',
          soundEffectsVolume: 0.25,
          appLockEnabled: true,
          appLockLocked: true,
          appLockLockOnStartup: true,
          appLockShortcut: 'CommandOrControl+L',
          saveArticleImages: true,
          allowLocalNetworkArticleImport: true,
        },
      ),
    ).toMatchObject({
      themeId: 'ink-paper',
      soundEffectsVolume: 0.25,
      appLockEnabled: true,
      appLockLocked: true,
      appLockLockOnStartup: true,
      appLockShortcut: 'CommandOrControl+L',
      saveArticleImages: true,
      allowLocalNetworkArticleImport: true,
      logRetentionDays: 90,
    });
  });
});

describe('store normalizers articles', () => {
  it('normalizes article source types and reading progress bounds', () => {
    expect(normalizeArticleSourceType('pdf')).toBe('pdf');
    expect(normalizeArticleSourceType('unknown')).toBe('web');
    expect(normalizeArticleReadingProgress(undefined)).toBeUndefined();
    expect(
      normalizeArticleReadingProgress({
        pageIndex: -1,
        pageCount: 0,
        chapterIndex: -1,
        chapterProgress: 2,
        progress: -2,
        updatedAt: 42,
      }),
    ).toMatchObject({
      pageIndex: 0,
      pageCount: 1,
      chapterIndex: undefined,
      chapterProgress: 1,
      progress: 0,
    });
  });

  it('maps article rows with normalized ebook metadata, chapters, and index', () => {
    const article = rowToArticle(
      {
        ...articleRowBase(),
        sourceType: 'ebook',
        ebookMetadata: {
          fileName: 42,
          fileSize: -1,
          originalTitle: 'Original',
          displayTitle: 'Display',
          titleCleanupVersion: 2,
        },
        ebookChapters: [
          { title: '', html: '<p>skip</p>' },
          { title: 'Chapter 1', html: '<p>Hello</p>', textLength: -1 },
        ],
        ebookIndex: {
          articleId: 'article_1',
          textLength: -1,
          chapters: [
            {
              id: 'chapter_1',
              title: 'Chapter 1',
              indexInBook: -1,
              textStart: 0,
              textEnd: 5,
              textLength: 5,
              segmentIds: ['segment_1', 1],
              paragraphIds: ['paragraph_1'],
            },
          ],
          segments: [
            {
              id: 'segment_1',
              chapterId: 'chapter_1',
              indexInChapter: 0,
              textStart: 0,
              textEnd: 5,
              textLength: 5,
              paragraphIds: ['paragraph_1'],
            },
          ],
          paragraphs: [
            {
              id: 'paragraph_1',
              chapterId: 'chapter_1',
              segmentId: 'segment_1',
              indexInChapter: 0,
              indexInSegment: 0,
              textStart: 0,
              textEnd: 5,
              textLength: 5,
            },
          ],
        },
      } as Parameters<typeof rowToArticle>[0],
      [],
    );

    expect(article.ebook).toMatchObject({
      metadata: {
        fileName: '',
        fileSize: 0,
        originalTitle: 'Original',
        displayTitle: 'Display',
        titleCleanupVersion: undefined,
      },
      chapters: [{ id: 'chapter-2', title: 'Chapter 1', textLength: 0 }],
      index: {
        articleId: 'article_1',
        textLength: 0,
        chapters: [{ id: 'chapter_1', indexInBook: 0, segmentIds: ['segment_1'] }],
      },
    });
  });

  it('maps article rows with normalized pdf metadata', () => {
    expect(
      rowToArticle(
        {
          ...articleRowBase(),
          sourceType: 'pdf',
          pdfMetadata: {
            fileName: 42,
            fileSize: -1,
            pageCount: 0,
            title: 'PDF',
          },
        } as Parameters<typeof rowToArticle>[0],
        [],
      ).pdf,
    ).toEqual({
      metadata: {
        format: 'pdf',
        fileName: '',
        fileSize: 0,
        pageCount: 1,
        title: 'PDF',
      },
    });
  });

  it('normalizes store collections with provider, agent, and article fallbacks', () => {
    const store = {
      user: { ...defaultUser, id: '', annotationColor: '' },
      settings: {},
      providers: [
        {
          id: 'provider_1',
          name: 'Provider',
          type: 'bad',
          baseUrl: 'https://api.example.com',
          apiKey: '',
          hasApiKey: false,
          modelName: 'gpt-5',
          modelInputMode: 'bad',
          createdAt: '2026-06-11T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
        },
      ],
      agents: [
        {
          id: 'agent_1',
          kind: 'bad',
          enabled: undefined,
          providerId: 'provider_1',
          nickname: 'Agent',
          username: 'agent',
          avatar: '',
          annotationColor: '',
          annotationDensity: 'bad',
          temperature: Number.NaN,
          soul: '',
          createdAt: '2026-06-11T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
        },
      ],
      articles: [
        {
          id: 'article_1',
          url: 'https://example.com',
          canonicalUrl: 'https://example.com',
          sourceType: 'bad',
          title: 'Article',
          contentHash: 'hash',
          annotations: [],
          createdAt: '2026-06-11T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
        },
      ],
    } as unknown as DesktopStore;

    expect(normalizeStore(store)).toMatchObject({
      user: { id: 'user_local', annotationColor: '#f4c95d' },
      providers: [{ type: 'openai-chat', modelInputMode: 'list', reasoningEffort: 'none' }],
      agents: [
        {
          kind: 'annotation',
          enabled: true,
          annotationColor: '#8ab6d6',
          annotationDensity: 'medium',
          temperature: 0.5,
        },
      ],
      articles: [{ sourceType: 'web' }],
    });
  });
});

describe('store normalizers annotation and chat records', () => {
  it('normalizes comments and annotations from persisted rows', () => {
    const comment = rowToComment({
      id: 'comment_1',
      annotationId: 'annotation_1',
      author: 'bad',
      content: 'Comment',
      replyTo: '',
      agentId: '',
      agentUsername: '',
      agentNickname: '',
      agentAvatar: '',
      agentAnnotationColor: '',
      readingIntent: 'bad',
      reviewLabel: 'bad',
      assistantProgress: { steps: [{ id: 's1', label: 'Step', status: 'bad' }] },
      userId: '',
      userUsername: '',
      userNickname: '',
      userAvatar: '',
      userAnnotationColor: '',
      pending: false,
      createdAt: '2026-06-11T00:00:00.000Z',
      updatedAt: '2026-06-11T00:00:00.000Z',
    } as Parameters<typeof rowToComment>[0]);
    expect(comment).toMatchObject({
      author: 'user',
      readingIntent: undefined,
      reviewLabel: undefined,
      assistantProgress: undefined,
      pending: undefined,
    });

    const annotation = rowToAnnotation(
      {
        id: 'annotation_1',
        articleId: 'article_1',
        anchor: {
          kind: 'pdf-text',
          exact: 'Quote',
          start: -1,
          end: 4,
          pageIndex: -1,
          pageWidth: 0,
          pageHeight: 800,
          rects: [{ x: Number.NaN, y: 1, width: 2, height: 3 }],
        },
        author: 'ai',
        annotationType: 'bad',
        readingIntent: 'connect',
        moveType: 'bad',
        whyHere: '',
        evidenceUsed: ['localText', 'localText', 'bad'],
        confidence: 'bad',
        shouldShow: null,
        color: '#f4c95d',
        agentId: '',
        agentUsername: '',
        agentNickname: '',
        agentAvatar: '',
        agentAnnotationColor: '',
        userId: '',
        userUsername: '',
        userNickname: '',
        userAvatar: '',
        userAnnotationColor: '',
        distillationStatus: 'bad',
        distillationContent: 'Published content',
        distillationPublishedAt: '',
        distillationUpdatedAt: '',
        distillationReviewSessions: [
          {
            id: 'session_1',
            agentId: 'agent_1',
            messages: [
              {
                id: 'message_1',
                author: 'bad',
                content: 'Review',
                createdAt: '2026-06-11T00:00:00.000Z',
                proposals: [
                  { id: 'proposal_1', kind: 'insert', content: 'New text', status: 'bad' },
                  {
                    id: 'proposal_with_source',
                    kind: 'insert',
                    content: 'New sourced text',
                    sourceDraftHash: 'draft_hash_1',
                    sourceReviewSessionId: 'session_1',
                    sourceReviewMessageId: 'message_1',
                    sourceAgentId: 'agent_1',
                  },
                  { id: 'proposal_2', kind: 'replace', targetText: '', replacementText: 'skip' },
                ],
              },
            ],
            createdAt: '2026-06-11T00:00:00.000Z',
            updatedAt: '2026-06-11T00:00:00.000Z',
          },
        ],
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      } as Parameters<typeof rowToAnnotation>[0],
      [comment],
    );

    expect(annotation).toMatchObject({
      author: 'ai',
      annotationType: undefined,
      readingIntent: 'connect',
      moveType: undefined,
      evidenceUsed: ['localText'],
      confidence: undefined,
      anchor: {
        kind: 'pdf-text',
        start: 0,
        pageIndex: 0,
        pageWidth: 0,
        rects: [{ x: 0, y: 1, width: 2, height: 3 }],
      },
      distillation: {
        status: 'unpublished',
        content: 'Published content',
        reviewSessions: [
          {
            messages: [
              {
                author: 'user',
                proposals: [
                  {
                    kind: 'insert',
                    status: 'pending',
                    title: '新增：New text',
                    content: 'New text',
                  },
                  {
                    kind: 'insert',
                    status: 'pending',
                    title: '新增：New sourced text',
                    content: 'New sourced text',
                    sourceDraftHash: 'draft_hash_1',
                    sourceReviewSessionId: 'session_1',
                    sourceReviewMessageId: 'message_1',
                    sourceAgentId: 'agent_1',
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it('keeps failed distillation review messages without content', () => {
    const annotation = rowToAnnotation(
      {
        id: 'annotation_failed_review',
        articleId: 'article_1',
        anchor: {
          exact: 'Quote',
          start: 0,
          end: 4,
        },
        author: 'user',
        annotationType: null,
        readingIntent: null,
        moveType: null,
        whyHere: null,
        evidenceUsed: null,
        confidence: null,
        shouldShow: null,
        color: '#f4c95d',
        agentId: null,
        agentUsername: null,
        agentNickname: null,
        agentAvatar: null,
        agentAnnotationColor: null,
        userId: null,
        userUsername: null,
        userNickname: null,
        userAvatar: null,
        userAnnotationColor: null,
        distillationStatus: 'unpublished',
        distillationContent: '草稿',
        distillationPublishedAt: null,
        distillationUpdatedAt: null,
        distillationReviewSessions: [
          {
            id: 'review_session_failed',
            agentId: 'agent_1',
            messages: [
              {
                id: 'review_message_failed',
                author: 'ai',
                content: '',
                createdAt: '2026-06-20T00:00:00.000Z',
                errorMessage: 'provider failed',
                status: 'failed',
              },
            ],
            createdAt: '2026-06-20T00:00:00.000Z',
            updatedAt: '2026-06-20T00:00:00.000Z',
          },
        ],
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      } as Parameters<typeof rowToAnnotation>[0],
      [],
    );

    expect(annotation.distillation?.reviewSessions?.[0]?.messages[0]).toMatchObject({
      id: 'review_message_failed',
      content: '',
      errorMessage: 'provider failed',
      status: 'failed',
    });
  });

  it('drops reader chat state when article or active session is inconsistent', () => {
    const validState = {
      articleId: 'article_1',
      activeSessionId: 'session_1',
      sessions: [
        {
          id: 'session_1',
          articleId: 'article_1',
          createdAt: '2026-06-11T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
          messages: [
            {
              id: 'message_1',
              role: 'assistant',
              content: 'Answer',
              context: { sourceType: 'bad', quote: 'Quote' },
              createdAt: '2026-06-11T00:00:00.000Z',
            },
          ],
        },
      ],
      createdAt: '2026-06-11T00:00:00.000Z',
      updatedAt: '2026-06-11T00:00:00.000Z',
    };

    expect(normalizeReaderChatState(validState, 'article_1')).toMatchObject({
      articleId: 'article_1',
      activeSessionId: 'session_1',
      sessions: [
        {
          messages: [
            {
              role: 'assistant',
              context: { sourceType: 'web', quote: 'Quote' },
            },
          ],
        },
      ],
    });
    expect(normalizeReaderChatState(validState, 'other_article')).toBeUndefined();
    expect(
      normalizeReaderChatState({ ...validState, activeSessionId: 'missing' }, 'article_1'),
    ).toBeUndefined();
  });

  it('keeps empty assistant reader chat messages while dropping empty user messages', () => {
    const state = {
      articleId: 'article_1',
      activeSessionId: 'session_1',
      sessions: [
        {
          id: 'session_1',
          articleId: 'article_1',
          createdAt: '2026-06-11T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
          messages: [
            {
              id: 'message_user_empty',
              role: 'user',
              content: '',
              createdAt: '2026-06-11T00:00:00.000Z',
            },
            {
              id: 'message_assistant_pending',
              role: 'assistant',
              content: '',
              assistantId: 'agent_1',
              createdAt: '2026-06-11T00:00:00.000Z',
            },
          ],
        },
      ],
      createdAt: '2026-06-11T00:00:00.000Z',
      updatedAt: '2026-06-11T00:00:00.000Z',
    };

    expect(normalizeReaderChatState(state, 'article_1')?.sessions[0]?.messages).toEqual([
      {
        id: 'message_assistant_pending',
        role: 'assistant',
        content: '',
        assistantId: 'agent_1',
        context: undefined,
        createdAt: '2026-06-11T00:00:00.000Z',
      },
    ]);
  });
});

function articleRowBase() {
  return {
    id: 'article_1',
    url: 'https://example.com',
    canonicalUrl: 'https://example.com',
    sourceType: 'web',
    title: 'Article',
    byline: '',
    excerpt: '',
    siteName: '',
    siteIconUrl: '',
    leadImageUrl: '',
    themeColor: '',
    contentHash: 'hash',
    contentHtml: '',
    ebookMetadata: null,
    ebookChapters: null,
    ebookIndex: null,
    pdfMetadata: null,
    readingProgress: null,
    readerChatState: null,
    focusCoReadingPlan: null,
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
  };
}
