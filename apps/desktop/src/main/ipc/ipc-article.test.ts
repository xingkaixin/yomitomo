import { describe, expect, it, vi } from 'vitest';
import { pdfSourceArrayBufferForIpc, registerArticleIpc } from './ipc-article';

const storageMocks = vi.hoisted(() => ({
  articleRecordFromUrl: vi.fn(),
  deleteEbookSourceFile: vi.fn<(articleId: string) => Promise<void>>(),
  deletePdfSourceFile: vi.fn<(articleId: string) => Promise<void>>(),
  deletePdfThumbnail: vi.fn<(articleId: string) => Promise<void>>(),
  completeArticleSourceCleanup: vi.fn<(articleId: string) => Promise<void>>(),
  ipcMainHandle: vi.fn(),
  readPdfSourceFile: vi.fn<(articleId: string) => Promise<Buffer>>(),
  importArticleSource: vi.fn(),
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

vi.mock('../articles/article-import', () => ({
  articleRecordFromUrl: storageMocks.articleRecordFromUrl,
  isArticleImportCanceledError: () => false,
  isArticleImportChallengeRecord: () => false,
}));

vi.mock('../articles/article-source-import', () => ({
  canceledArticleSourceImport: async (operation: Promise<unknown>) => operation,
  importArticleSource: storageMocks.importArticleSource,
}));

vi.mock('../agents/agent-runtime-routing', () => ({
  taskProvider: storageMocks.taskProvider,
}));

describe('article IPC challenge reimport', () => {
  it('replaces a challenge article under its stored id', async () => {
    storageMocks.ipcMainHandle.mockClear();
    storageMocks.importArticleSource.mockClear();
    const next = { id: 'web_next', createdAt: '2026-06-04T00:00:00.000Z' };
    storageMocks.articleRecordFromUrl.mockResolvedValueOnce(next);
    storageMocks.importArticleSource.mockResolvedValueOnce({ status: 'duplicate', article: next });
    registerArticleIpc(
      articleIpcContext(
        { readImportSettings: vi.fn().mockReturnValue({ saveArticleImages: false }) },
        {},
      ),
    );
    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article:import-url',
    )?.[1];

    await handler({}, { url: 'https://example.com/post' });
    const { mergeExistingArticle } = storageMocks.importArticleSource.mock.calls[0][0];

    expect(
      mergeExistingArticle(next, { id: 'legacy', createdAt: '2026-06-01T00:00:00.000Z' }),
    ).toEqual({ id: 'legacy', createdAt: '2026-06-01T00:00:00.000Z' });
  });
});

describe('article IPC PDF source reads', () => {
  it('copies only sliced PDF source Buffer views for IPC', () => {
    const source = new Uint8Array([0, 1, 2, 3]).buffer;
    const file = Buffer.from(source, 1, 2);

    const result = pdfSourceArrayBufferForIpc(file);

    expect(result.copied).toBe(true);
    expect(result.data).not.toBe(source);
    expect(Array.from(new Uint8Array(result.data))).toEqual([1, 2]);
  });
});

type ArticleIpcContext = Parameters<typeof registerArticleIpc>[0];
type ArticlePersistence = Awaited<
  ReturnType<ArticleIpcContext['getPersistenceModules']>
>['storeArticles'];

function articleIpcContext(
  persistenceOverrides: Partial<ArticlePersistence>,
  contextOverrides: Partial<ArticleIpcContext>,
): ArticleIpcContext {
  return {
    elapsedMs: () => 1,
    getAiModule: async () => ({
      bilingualTranslationPromptVersion: 1,
      translateBilingualArticleBlocksEffect: vi.fn(),
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
        readArticle: vi.fn(),
        readArticleCover: vi.fn(),
        readArticleStatsSummaries: vi.fn(),
        readCurrentArticleTranslation: vi.fn(),
        recoverInterruptedArticleTranslation: vi.fn(),
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
