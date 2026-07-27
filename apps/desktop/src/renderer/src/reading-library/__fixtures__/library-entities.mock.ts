import type { ArticleSummaryRecord, Collection, LibraryPin, WeReadBook } from '@yomitomo/shared';
import type {
  LibraryCatalogCollection,
  LibraryCatalogEntity,
  LibraryCatalogItem,
} from '../../../../ipc-contract';

type WebArticleSummary = Extract<ArticleSummaryRecord, { sourceType: 'web' }>;
type EbookArticleSummary = Extract<ArticleSummaryRecord, { sourceType: 'ebook' }>;
type PdfArticleSummary = Extract<ArticleSummaryRecord, { sourceType: 'pdf' }>;
type MockArticleInput =
  | (Partial<WebArticleSummary> & { sourceType?: 'web' })
  | (Partial<EbookArticleSummary> & Pick<EbookArticleSummary, 'sourceType' | 'ebook'>)
  | (Partial<PdfArticleSummary> & Pick<PdfArticleSummary, 'sourceType' | 'pdf'>);

export function makeMockArticle(partial: MockArticleInput = {}): ArticleSummaryRecord {
  const id = partial.id ?? 'article-mock';
  const base = {
    id,
    url: partial.url ?? `https://example.com/${id}`,
    canonicalUrl: partial.canonicalUrl ?? `https://example.com/${id}`,
    title: partial.title ?? 'Mock Article',
    contentHash: partial.contentHash ?? 'hash-mock',
    annotations: [] as [],
    counts: partial.counts ?? {
      annotationCount: 0,
      thoughtCount: 0,
      discussionCommentCount: 0,
      aiCommentCount: 0,
      distillationCount: 0,
    },
    createdAt: partial.createdAt ?? '2026-06-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-06-01T00:00:00.000Z',
  };

  switch (partial.sourceType) {
    case 'ebook':
      return { ...base, ...partial, sourceType: 'ebook', ebook: partial.ebook };
    case 'pdf':
      return { ...base, ...partial, sourceType: 'pdf', pdf: partial.pdf };
    default:
      return { ...base, ...partial, sourceType: 'web' };
  }
}

function makeMockWeReadBook(partial: Partial<WeReadBook> = {}): WeReadBook {
  const bookId = partial.bookId ?? 'weread-mock';
  return {
    bookId,
    title: partial.title ?? 'Mock WeRead Book',
    reviewCount: partial.reviewCount ?? 0,
    noteCount: partial.noteCount ?? 0,
    bookmarkCount: partial.bookmarkCount ?? 0,
    readingProgress: partial.readingProgress ?? 0,
    updatedAt: partial.updatedAt ?? '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

function makeArticleItem(
  sortTime: string,
  pinned: boolean,
  article: ArticleSummaryRecord,
): LibraryCatalogItem {
  return { kind: 'item', source: 'article', sortTime, pinned, article };
}

function makeWeReadItem(sortTime: string, pinned: boolean, weread: WeReadBook): LibraryCatalogItem {
  return { kind: 'item', source: 'weread', sortTime, pinned, weread };
}

const webItem = makeArticleItem(
  '2026-06-10T08:00:00.000Z',
  false,
  makeMockArticle({
    id: 'article-web',
    sourceType: 'web',
    title: 'Web 文章示例',
    siteName: 'Example Blog',
    updatedAt: '2026-06-10T08:00:00.000Z',
  }),
);

const ebookItem = makeArticleItem(
  '2026-06-09T08:00:00.000Z',
  false,
  makeMockArticle({
    id: 'article-ebook',
    sourceType: 'ebook',
    ebook: {
      metadata: { format: 'epub', fileName: 'book.epub', fileSize: 1024 },
    },
    title: 'EPUB 书籍示例',
    updatedAt: '2026-06-09T08:00:00.000Z',
  }),
);

const pdfItem = makeArticleItem(
  '2026-06-08T08:00:00.000Z',
  true,
  makeMockArticle({
    id: 'article-pdf',
    sourceType: 'pdf',
    pdf: {
      metadata: {
        format: 'pdf',
        fileName: 'document.pdf',
        fileSize: 1024,
        pageCount: 1,
      },
    },
    title: 'PDF 文档示例',
    updatedAt: '2026-06-08T08:00:00.000Z',
  }),
);

const wereadItem = makeWeReadItem(
  '2026-06-07T08:00:00.000Z',
  false,
  makeMockWeReadBook({
    bookId: 'weread-book-1',
    title: '微信读书示例',
    author: '某作者',
    updatedAt: '2026-06-07T08:00:00.000Z',
  }),
);

const collectionCoverItem = makeArticleItem(
  '2026-06-06T08:00:00.000Z',
  false,
  makeMockArticle({
    id: 'article-col-1',
    sourceType: 'web',
    title: '合集成员文章',
    updatedAt: '2026-06-06T08:00:00.000Z',
  }),
);

export const mockCollections: Collection[] = [
  {
    id: 'collection-tech',
    name: '技术笔记',
    desc: '日常技术阅读',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-06-06T08:00:00.000Z',
  },
  {
    id: 'collection-empty',
    name: '待读清单',
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  },
];

export const mockPins: LibraryPin[] = [
  { targetKind: 'article', targetId: 'article-pdf', pinnedAt: '2026-06-08T09:00:00.000Z' },
  { targetKind: 'collection', targetId: 'collection-tech', pinnedAt: '2026-06-06T09:00:00.000Z' },
];

const techCollection: LibraryCatalogCollection = {
  kind: 'col',
  collection: mockCollections[0],
  coverMembers: [collectionCoverItem],
  memberCount: 1,
  sortTime: '2026-06-06T08:00:00.000Z',
  pinned: true,
};

const emptyCollection: LibraryCatalogCollection = {
  kind: 'col',
  collection: mockCollections[1],
  coverMembers: [],
  memberCount: 0,
  sortTime: '2026-05-20T00:00:00.000Z',
  pinned: false,
};

export const mockLibraryEntities: LibraryCatalogEntity[] = [
  techCollection,
  pdfItem,
  webItem,
  ebookItem,
  wereadItem,
  emptyCollection,
];
