import type {
  ArticleSummaryRecord,
  Collection,
  ContentRef,
  LibraryPin,
  WeReadBook,
} from '@yomitomo/shared';
import type {
  LibraryCollectionEntity,
  LibraryEntity,
  LibraryItemEntity,
  LibraryItemType,
} from '../library-entity-types';

export function makeMockArticle(partial: Partial<ArticleSummaryRecord> = {}): ArticleSummaryRecord {
  const id = partial.id ?? 'article-mock';
  return {
    id,
    url: partial.url ?? `https://example.com/${id}`,
    canonicalUrl: partial.canonicalUrl ?? `https://example.com/${id}`,
    title: partial.title ?? 'Mock Article',
    contentHash: partial.contentHash ?? 'hash-mock',
    annotations: partial.annotations ?? [],
    createdAt: partial.createdAt ?? '2026-06-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-06-01T00:00:00.000Z',
    ...partial,
  };
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

function makeItem(
  type: LibraryItemType,
  ref: ContentRef,
  sortTime: string,
  pinned: boolean,
  source: { article?: ArticleSummaryRecord; weread?: WeReadBook },
): LibraryItemEntity {
  return { kind: 'item', ref, type, sortTime, pinned, ...source };
}

const webItem = makeItem(
  'web',
  { kind: 'article', id: 'article-web' },
  '2026-06-10T08:00:00.000Z',
  false,
  {
    article: makeMockArticle({
      id: 'article-web',
      sourceType: 'web',
      title: 'Web 文章示例',
      siteName: 'Example Blog',
      updatedAt: '2026-06-10T08:00:00.000Z',
    }),
  },
);

const ebookItem = makeItem(
  'ebook',
  { kind: 'article', id: 'article-ebook' },
  '2026-06-09T08:00:00.000Z',
  false,
  {
    article: makeMockArticle({
      id: 'article-ebook',
      sourceType: 'ebook',
      title: 'EPUB 书籍示例',
      updatedAt: '2026-06-09T08:00:00.000Z',
    }),
  },
);

const pdfItem = makeItem(
  'pdf',
  { kind: 'article', id: 'article-pdf' },
  '2026-06-08T08:00:00.000Z',
  true,
  {
    article: makeMockArticle({
      id: 'article-pdf',
      sourceType: 'pdf',
      title: 'PDF 文档示例',
      updatedAt: '2026-06-08T08:00:00.000Z',
    }),
  },
);

const wereadItem = makeItem(
  'weread',
  { kind: 'weread', id: 'weread-book-1' },
  '2026-06-07T08:00:00.000Z',
  false,
  {
    weread: makeMockWeReadBook({
      bookId: 'weread-book-1',
      title: '微信读书示例',
      author: '某作者',
      updatedAt: '2026-06-07T08:00:00.000Z',
    }),
  },
);

const collectionCoverItem = makeItem(
  'web',
  { kind: 'article', id: 'article-col-1' },
  '2026-06-06T08:00:00.000Z',
  false,
  {
    article: makeMockArticle({
      id: 'article-col-1',
      sourceType: 'web',
      title: '集合成员文章',
      updatedAt: '2026-06-06T08:00:00.000Z',
    }),
  },
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

const techCollection: LibraryCollectionEntity = {
  kind: 'col',
  collection: mockCollections[0],
  memberRefs: [{ kind: 'article', id: 'article-col-1' }],
  coverMembers: [collectionCoverItem],
  searchMembers: [collectionCoverItem],
  memberCount: 1,
  sortTime: '2026-06-06T08:00:00.000Z',
  pinned: true,
};

const emptyCollection: LibraryCollectionEntity = {
  kind: 'col',
  collection: mockCollections[1],
  memberRefs: [],
  coverMembers: [],
  searchMembers: [],
  memberCount: 0,
  sortTime: '2026-05-20T00:00:00.000Z',
  pinned: false,
};

export const mockLibraryEntities: LibraryEntity[] = [
  techCollection,
  pdfItem,
  webItem,
  ebookItem,
  wereadItem,
  emptyCollection,
];
