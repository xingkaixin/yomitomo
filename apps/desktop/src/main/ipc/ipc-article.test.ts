import { describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, ArticleTranslation } from '@yomitomo/shared';
import { pdfSourceArrayBufferForIpc, registerArticleIpc } from './ipc-article';

const storageMocks = vi.hoisted(() => ({
  deleteEbookSourceFile: vi.fn<(articleId: string) => Promise<void>>(),
  deletePdfSourceFile: vi.fn<(articleId: string) => Promise<void>>(),
  deletePdfThumbnail: vi.fn<(articleId: string) => Promise<void>>(),
  completeArticleSourceCleanup: vi.fn<(articleId: string) => Promise<void>>(),
  ipcMainHandle: vi.fn(),
  readPdfSourceFile: vi.fn<(articleId: string) => Promise<Buffer>>(),
  taskProvider: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: storageMocks.ipcMainHandle,
  },
}));

vi.mock('../ebooks/ebook-storage', () => ({
  deleteEbookSourceFile: storageMocks.deleteEbookSourceFile,
}));

vi.mock('../pdf/pdf-storage', () => ({
  deletePdfSourceFile: storageMocks.deletePdfSourceFile,
  readPdfSourceFile: storageMocks.readPdfSourceFile,
}));

vi.mock('../pdf/pdf-thumbnail-storage', () => ({
  deletePdfThumbnail: storageMocks.deletePdfThumbnail,
}));

vi.mock('../articles/article-source-cleanup', () => ({
  completeArticleSourceCleanup: storageMocks.completeArticleSourceCleanup,
}));

vi.mock('../agents/agent-runtime-routing', () => ({
  taskProvider: storageMocks.taskProvider,
}));

describe('article IPC patch broadcasts', () => {
  it('broadcasts article patches after saving annotation distillation', async () => {
    storageMocks.ipcMainHandle.mockClear();
    const patch = articlePatch();
    const saveArticleAnnotationDistillation = vi.fn().mockResolvedValue(patch);
    const sendArticlePatched = vi.fn();

    registerArticleIpc(
      articleIpcContext({ saveArticleAnnotationDistillation }, { sendArticlePatched }),
    );

    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article:save-annotation-distillation',
    )?.[1];
    expect(handler).toBeTypeOf('function');
    const input = {
      articleId: 'article_1',
      annotationId: 'annotation_1',
      distillation: { status: 'published', content: '沉淀内容' } as const,
      expectedDistillationUpdatedAt: null,
    };

    const event = { sender: { id: 17 } };
    const result = await handler(event, input);

    expect(saveArticleAnnotationDistillation).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, value: patch });
    expect(sendArticlePatched).toHaveBeenCalledWith(event, patch);
  });

  it('broadcasts article patches after merging agent annotations', async () => {
    storageMocks.ipcMainHandle.mockClear();
    const annotation = annotationRecord();
    const patch = articlePatch(annotation);
    const mergeResult = { activeId: annotation.id, patch };
    const mergeArticleAgentAnnotation = vi.fn().mockResolvedValue(mergeResult);
    const sendArticlePatched = vi.fn();

    registerArticleIpc(articleIpcContext({ mergeArticleAgentAnnotation }, { sendArticlePatched }));

    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article:merge-agent-annotation',
    )?.[1];
    expect(handler).toBeTypeOf('function');
    const input = { articleId: 'article_1', annotation };

    const result = await handler({}, input);

    expect(mergeArticleAgentAnnotation).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, value: mergeResult });
    expect(sendArticlePatched).toHaveBeenCalledWith(expect.anything(), patch);
  });

  it('broadcasts article patches after saving annotations', async () => {
    storageMocks.ipcMainHandle.mockClear();
    const annotation = annotationRecord();
    const patch = {
      type: 'article-upsert' as const,
      article: {
        id: 'article_1',
        url: 'https://example.com',
        canonicalUrl: 'https://example.com',
        sourceType: 'web' as const,
        title: '文章',
        contentHash: 'hash',
        annotations: [],
        counts: {
          annotationCount: 1,
          thoughtCount: 1,
          discussionCommentCount: 0,
          aiCommentCount: 0,
          distillationCount: 0,
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:01:00.000Z',
      },
    };
    const saveArticleAnnotation = vi.fn().mockResolvedValue(patch);
    const sendArticlePatched = vi.fn();

    registerArticleIpc(articleIpcContext({ saveArticleAnnotation }, { sendArticlePatched }));

    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article:save-annotation',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, { articleId: 'article_1', annotation });

    expect(result).toEqual({ ok: true, value: patch });
    expect(sendArticlePatched).toHaveBeenCalledWith(expect.anything(), patch);
  });

  it('broadcasts article patches after deleting comments', async () => {
    storageMocks.ipcMainHandle.mockClear();
    const patch = {
      type: 'article-upsert' as const,
      article: {
        id: 'article_1',
        url: 'https://example.com',
        canonicalUrl: 'https://example.com',
        sourceType: 'web' as const,
        title: '文章',
        contentHash: 'hash',
        annotations: [],
        counts: {
          annotationCount: 1,
          thoughtCount: 0,
          discussionCommentCount: 0,
          aiCommentCount: 0,
          distillationCount: 0,
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:01:00.000Z',
      },
    };
    const deleteArticleComment = vi.fn().mockResolvedValue(patch);
    const sendArticlePatched = vi.fn();

    registerArticleIpc(articleIpcContext({ deleteArticleComment }, { sendArticlePatched }));

    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article:delete-comment',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const input = {
      articleId: 'article_1',
      annotationId: 'annotation_1',
      commentId: 'comment_1',
    };
    const result = await handler({}, input);

    expect(deleteArticleComment).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, value: patch });
    expect(sendArticlePatched).toHaveBeenCalledWith(expect.anything(), patch);
  });

  it('broadcasts reading progress in the article patch envelope', async () => {
    storageMocks.ipcMainHandle.mockClear();
    const readingProgress = {
      kind: 'page' as const,
      pageIndex: 2,
      pageCount: 10,
      updatedAt: '2026-07-18T00:01:00.000Z',
    };
    const patch = {
      articleId: 'article_1',
      readingProgress,
      updatedAt: readingProgress.updatedAt,
    };
    const saveArticleReadingProgress = vi.fn().mockResolvedValue(patch);
    const sendArticlePatched = vi.fn();
    registerArticleIpc(articleIpcContext({ saveArticleReadingProgress }, { sendArticlePatched }));
    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article:reading-progress',
    )?.[1];
    const event = { sender: { id: 17 } };

    const result = await handler(event, { articleId: 'article_1', progress: readingProgress });

    expect(result).toEqual({ ok: true, value: patch });
    expect(sendArticlePatched).toHaveBeenCalledWith(event, {
      type: 'article-reading-progress',
      ...patch,
    });
  });

  it('broadcasts article deletion after source cleanup completes', async () => {
    storageMocks.ipcMainHandle.mockClear();
    storageMocks.completeArticleSourceCleanup.mockResolvedValue();
    const readArticle = vi.fn().mockResolvedValue(articlePatch().article);
    const deleteArticle = vi.fn().mockResolvedValue({ articleId: 'article_1' });
    const sendArticlePatched = vi.fn();
    registerArticleIpc(articleIpcContext({ deleteArticle, readArticle }, { sendArticlePatched }));
    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article:delete',
    )?.[1];
    const event = { sender: { id: 17 } };

    const result = await handler(event, 'article_1');

    expect(result).toEqual({ ok: true, value: { articleId: 'article_1' } });
    expect(sendArticlePatched).toHaveBeenCalledWith(event, {
      type: 'article-delete',
      articleId: 'article_1',
    });
    expect(storageMocks.completeArticleSourceCleanup).toHaveBeenCalledWith('article_1');
  });

  it('returns the delete patch without waiting for source cleanup', async () => {
    storageMocks.ipcMainHandle.mockClear();
    storageMocks.completeArticleSourceCleanup.mockImplementation(() => new Promise(() => {}));
    const readArticle = vi.fn().mockResolvedValue({
      ...articlePatch().article,
      sourceType: 'pdf',
    });
    const deleteArticle = vi.fn().mockResolvedValue({ articleId: 'article_1' });
    const sendArticlePatched = vi.fn();
    registerArticleIpc(articleIpcContext({ deleteArticle, readArticle }, { sendArticlePatched }));
    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article:delete',
    )?.[1];

    const result = await handler({ sender: { id: 17 } }, 'article_1');

    expect(deleteArticle).toHaveBeenCalledWith('article_1');
    expect(result).toEqual({ ok: true, value: { articleId: 'article_1' } });
    expect(sendArticlePatched).toHaveBeenCalledWith(expect.anything(), {
      type: 'article-delete',
      articleId: 'article_1',
    });
  });
});

describe('article translation IPC', () => {
  it('translates an EPUB chapter through the shared article translation pipeline', async () => {
    storageMocks.ipcMainHandle.mockClear();
    storageMocks.taskProvider.mockResolvedValue({
      id: 'provider-1',
      name: 'Provider',
      modelName: 'model-1',
      baseUrl: 'https://example.com',
    });
    const article = ebookArticle();
    const store = fakeTranslationStore();
    const translateBilingualArticleBlocks = vi.fn(async (input) => ({
      translations: input.blocks.map((block: { id: string; text: string }) => ({
        id: block.id,
        translation: `译文：${block.text}`,
      })),
      inputTokens: 12,
      outputTokens: 8,
    }));

    registerArticleIpc(
      articleIpcContext(
        {
          readArticle: vi.fn().mockResolvedValue(article),
          readCurrentArticleTranslation: vi.fn().mockResolvedValue(null),
          initializeArticleTranslation: store.initializeArticleTranslation,
          updateArticleTranslationSegment: store.updateArticleTranslationSegment,
          finalizeArticleTranslation: store.finalizeArticleTranslation,
        },
        {
          getAiModule: async () => ({
            bilingualTranslationPromptVersion: 1,
            translateBilingualArticleBlocks,
          }),
        },
      ),
    );

    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article-translation:translate',
    )?.[1];
    expect(handler).toBeTypeOf('function');
    const result = await handler(
      { sender: { send: vi.fn() } },
      {
        articleId: article.id,
        sourceId: 'chapter-1',
        sourceBlocks: [{ id: 'block-1', text: '  First   source paragraph.  ' }],
      },
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        articleId: article.id,
        sourceId: 'chapter-1',
        status: 'ready',
        segments: [
          {
            sourceBlockId: 'block-1',
            sourceText: 'First source paragraph.',
            translatedText: '译文：First source paragraph.',
            status: 'ready',
          },
        ],
      },
    });
    expect(translateBilingualArticleBlocks).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test ebook — First chapter',
        blocks: [expect.objectContaining({ id: 'block-1', text: 'First source paragraph.' })],
      }),
    );
    expect(store.initializeArticleTranslation.mock.calls[0]?.[0]).toMatchObject({
      sourceId: 'chapter-1',
      sourceContentHash: 'ebook-hash',
    });
  });
});

describe('article IPC PDF source reads', () => {
  it('reuses exact PDF source ArrayBuffers for IPC', () => {
    const source = new Uint8Array([1, 2, 3]).buffer;
    const file = Buffer.from(source);

    const result = pdfSourceArrayBufferForIpc(file);

    expect(result).toEqual({ copied: false, data: source });
  });

  it('copies only sliced PDF source Buffer views for IPC', () => {
    const source = new Uint8Array([0, 1, 2, 3]).buffer;
    const file = Buffer.from(source, 1, 2);

    const result = pdfSourceArrayBufferForIpc(file);

    expect(result.copied).toBe(true);
    expect(result.data).not.toBe(source);
    expect(Array.from(new Uint8Array(result.data))).toEqual([1, 2]);
  });

  it('records PDF IPC payload timing when reading source files', async () => {
    storageMocks.ipcMainHandle.mockClear();
    const source = new Uint8Array([1, 2, 3]).buffer;
    storageMocks.readPdfSourceFile.mockResolvedValue(Buffer.from(source));
    const logInfo = vi.fn();

    registerArticleIpc(articleIpcContext({}, { elapsedMs: () => 1.25, logInfo }));

    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'pdf:read-file',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, 'pdf_article_1');

    expect(result).toEqual({ ok: true, value: source });
    expect(logInfo).toHaveBeenCalledWith('performance.pdf.file_read_main', {
      articleId: 'pdf_article_1',
      byteLength: 3,
      ipcBufferCopied: false,
      ipcBufferDurationMs: 0,
      ipcByteLength: 3,
      readByteLength: 3,
      readDurationMs: 1.25,
      durationMs: 1.25,
    });
  });
});

function annotationRecord(): Annotation {
  return {
    id: 'annotation_1',
    anchor: { exact: 'quote', prefix: '', suffix: '', start: 0, end: 5 },
    author: { kind: 'user', username: 'reader' },
    color: '#f4c95d',
    comments: [],
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
  };
}

function articlePatch(annotation?: Annotation) {
  return {
    type: 'article-upsert' as const,
    article: {
      id: 'article_1',
      url: 'https://example.com',
      canonicalUrl: 'https://example.com',
      sourceType: 'web' as const,
      title: '文章',
      contentHash: 'hash',
      annotations: annotation ? [annotation] : [],
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:01:00.000Z',
    },
  };
}

type ArticleIpcContext = Parameters<typeof registerArticleIpc>[0];
type ArticlePersistence = Awaited<
  ReturnType<ArticleIpcContext['getPersistenceModules']>
>['storeArticles'];

function fakeTranslationStore() {
  let translation: ArticleTranslation | null = null;

  return {
    initializeArticleTranslation: vi.fn(
      async (input: Parameters<ArticlePersistence['initializeArticleTranslation']>[0]) => {
        translation = {
          ...input,
          id: 'translation-1',
          status: 'translating',
          segments: input.segments.map((segment, index) => ({
            id: `segment-${index}`,
            translationId: 'translation-1',
            sourceBlockId: segment.sourceBlockId,
            sourceTextHash: segment.sourceTextHash,
            sourceText: segment.sourceText,
            status: 'translating',
            order: segment.order,
            createdAt: input.updatedAt,
            updatedAt: input.updatedAt,
          })),
          createdAt: input.updatedAt,
        };
        return translation;
      },
    ),
    updateArticleTranslationSegment: vi.fn(
      async (input: Parameters<ArticlePersistence['updateArticleTranslationSegment']>[0]) => {
        const segment = translation?.segments.find(
          (candidate) => candidate.sourceBlockId === input.sourceBlockId,
        );
        if (!segment) return null;
        Object.assign(segment, {
          status: input.status,
          translatedText: input.translatedText,
          error: input.error,
          updatedAt: input.updatedAt,
        });
        return segment;
      },
    ),
    finalizeArticleTranslation: vi.fn(async () => {
      if (!translation) return null;
      const statuses = new Set(translation.segments.map((segment) => segment.status));
      translation.status = statuses.has('translating')
        ? 'translating'
        : statuses.has('failed') && !statuses.has('ready')
          ? 'failed'
          : 'ready';
      return translation;
    }),
  };
}

function articleIpcContext(
  persistenceOverrides: Partial<ArticlePersistence>,
  contextOverrides: Partial<ArticleIpcContext>,
): ArticleIpcContext {
  return {
    elapsedMs: () => 1,
    getAiModule: async () => ({
      bilingualTranslationPromptVersion: 1,
      translateBilingualArticleBlocks: vi.fn(),
    }),
    getPersistenceModules: async () => ({
      storeAgents: {
        readAgentRuntimeContext: vi.fn().mockResolvedValue({ providers: [], settings: {} }),
      },
      storeArticles: {
        deleteArticle: vi.fn(),
        deleteArticleAnnotation: vi.fn(),
        deleteArticleComment: vi.fn(),
        deleteCurrentArticleTranslation: vi.fn(),
        ensureArticleSiteIcon: vi.fn(),
        finalizeArticleTranslation: vi.fn(),
        findArticleByIdentity: vi.fn(),
        initializeArticleTranslation: vi.fn(),
        listLibraryArticles: vi.fn(),
        mergeArticleAgentAnnotation: vi.fn(),
        readArticle: vi.fn(),
        readArticleCover: vi.fn(),
        readArticleStatsSummaries: vi.fn(),
        readCurrentArticleTranslation: vi.fn(),
        readImportSettings: vi.fn(),
        saveArticle: vi.fn(),
        saveArticleAnnotation: vi.fn(),
        saveArticleAnnotationDistillation: vi.fn(),
        saveArticleComment: vi.fn(),
        saveArticleReaderChatState: vi.fn(),
        saveArticleReadingProgress: vi.fn(),
        updateArticleTranslationSegment: vi.fn(),
        ...persistenceOverrides,
      },
      providerRepository: { hydrateProviderApiKey: vi.fn() },
    }),
    logError: vi.fn(),
    logInfo: vi.fn(),
    sendArticlePatched: vi.fn(),
    ...contextOverrides,
  };
}

function ebookArticle(): ArticleRecord {
  return {
    id: 'ebook-1',
    url: 'ebook:test',
    canonicalUrl: 'ebook:test',
    sourceType: 'ebook',
    title: 'Test ebook',
    contentHash: 'ebook-hash',
    annotations: [],
    ebook: {
      metadata: {
        format: 'epub',
        fileName: 'test.epub',
        fileSize: 1024,
        description: 'A test ebook.',
      },
      chapters: [
        {
          id: 'chapter-1',
          title: 'First chapter',
          html: '<p>First source paragraph.</p>',
          textLength: 23,
        },
      ],
      index: {
        version: 1,
        articleId: 'ebook-1',
        textLength: 23,
        chapters: [
          {
            id: 'chapter-1',
            title: 'First chapter',
            indexInBook: 0,
            textStart: 0,
            textEnd: 23,
            textLength: 23,
            previewStart: 'First source paragraph.',
            previewEnd: 'First source paragraph.',
            segmentIds: [],
            paragraphIds: [],
          },
        ],
        segments: [],
        paragraphs: [],
      },
    },
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}
