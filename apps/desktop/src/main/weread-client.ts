import type {
  WeReadBook,
  WeReadBookDetail,
  WeReadChapter,
  WeReadHighlight,
  WeReadThought,
  WeReadUser,
} from '@yomitomo/shared';

const WEREAD_GATEWAY_URL = 'https://i.weread.qq.com/api/agent/gateway';
export const WEREAD_SKILL_VERSION = '1.0.3';

type WeReadGatewayResponse = Record<string, unknown>;

export async function testWeReadConnection(apiKey: string) {
  await requestWeRead(apiKey, '/user/notebooks', { count: 1 });
  return { ok: true, message: '微信读书 API 已连通' };
}

export async function fetchWeReadNotebooks(apiKey: string) {
  const books: WeReadBook[] = [];
  let lastSort: number | undefined;

  for (let page = 0; page < 50; page += 1) {
    const response = await requestWeRead(apiKey, '/user/notebooks', {
      count: 100,
      ...(lastSort ? { lastSort } : {}),
    });
    const pageBooks = arrayValue(response.books).map((item) => notebookBookFromResponse(item));
    books.push(...pageBooks.filter(hasWeReadNotebookContent));
    if (response.hasMore !== 1 || pageBooks.length === 0) break;
    lastSort = pageBooks.at(-1)?.sort;
    if (!lastSort) break;
  }

  return books.toSorted(
    (left, right) =>
      (right.lastReadAt || right.sort || 0) - (left.lastReadAt || left.sort || 0) ||
      right.updatedAt.localeCompare(left.updatedAt),
  );
}

export async function fetchWeReadBookDetail(
  apiKey: string,
  bookId: string,
): Promise<WeReadBookDetail> {
  const [info, chaptersResponse, progressResponse, bookmarksResponse, thoughtsResponse] =
    await Promise.all([
      requestWeRead(apiKey, '/book/info', { bookId }),
      requestWeRead(apiKey, '/book/chapterinfo', { bookId }),
      requestWeRead(apiKey, '/book/getprogress', { bookId }),
      requestWeRead(apiKey, '/book/bookmarklist', { bookId }),
      fetchWeReadThoughts(apiKey, bookId),
    ]);

  const chapters = arrayValue(chaptersResponse.chapters).map((item) =>
    chapterFromResponse(bookId, item),
  );
  const chapterIndexByUid = new Map(
    chapters.map((chapter) => [chapter.chapterUid, chapter.chapterIdx]),
  );
  const highlights = arrayValue(bookmarksResponse.updated)
    .map((item) => highlightFromResponse(bookId, item, chapterIndexByUid))
    .filter(isValidWeReadHighlight);
  const thoughts = thoughtsResponse
    .map((item) => thoughtFromResponse(bookId, item, chapterIndexByUid))
    .filter(isValidWeReadThought);
  const book = withValidContentCounts(
    mergeBookInfo(notebookBookFromResponse({ bookId, book: info }), progressResponse),
    highlights,
    thoughts,
  );

  return { book, chapters, highlights, thoughts };
}

export function mergeWeReadNotebookBook(
  detail: WeReadBookDetail,
  notebookBook: WeReadBook,
): WeReadBookDetail {
  return {
    ...detail,
    book: {
      ...detail.book,
      cover: detail.book.cover || notebookBook.cover,
      intro: detail.book.intro || notebookBook.intro,
      markedStatus: notebookBook.markedStatus,
      sort: notebookBook.sort,
      syncedAt: notebookBook.syncedAt,
      updatedAt: notebookBook.updatedAt,
    },
  };
}

export function hasValidWeReadBookDetailContent(detail: WeReadBookDetail) {
  return detail.highlights.length + detail.thoughts.length > 0;
}

async function fetchWeReadThoughts(apiKey: string, bookId: string) {
  const thoughts: Record<string, unknown>[] = [];
  let synckey = 0;

  for (let page = 0; page < 50; page += 1) {
    const response = await requestWeRead(apiKey, '/review/list/mine', {
      bookid: bookId,
      count: 100,
      ...(synckey ? { synckey } : {}),
    });
    thoughts.push(...arrayValue(response.reviews));
    if (response.hasMore !== 1) break;
    const nextSynckey = numberValue(response.synckey);
    if (!nextSynckey || nextSynckey === synckey) break;
    synckey = nextSynckey;
  }

  return thoughts;
}

async function requestWeRead(
  apiKey: string,
  apiName: string,
  params: Record<string, unknown> = {},
): Promise<WeReadGatewayResponse> {
  const response = await fetch(WEREAD_GATEWAY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_name: apiName,
      skill_version: WEREAD_SKILL_VERSION,
      ...params,
    }),
  });
  if (!response.ok) throw new Error(`微信读书请求失败：HTTP ${response.status}`);

  const data = (await response.json()) as WeReadGatewayResponse;
  if (data.upgrade_info && typeof data.upgrade_info === 'object') {
    const message = stringValue((data.upgrade_info as Record<string, unknown>).message);
    throw new Error(message || '微信读书接口版本需要升级');
  }
  const errcode = numberValue(data.errcode);
  if (errcode) throw new Error(stringValue(data.errmsg) || `微信读书接口返回错误：${errcode}`);
  return data;
}

function notebookBookFromResponse(item: Record<string, unknown>): WeReadBook {
  const book = objectValue(item.book) || item;
  const now = new Date().toISOString();
  return {
    bookId: stringValue(item.bookId) || stringValue(book.bookId),
    title: stringValue(book.title) || '未命名书籍',
    author: stringValue(book.author) || undefined,
    cover: stringValue(book.cover) || undefined,
    intro: stringValue(book.intro) || undefined,
    reviewCount: numberValue(item.reviewCount),
    noteCount: numberValue(item.noteCount),
    bookmarkCount: numberValue(item.bookmarkCount),
    readingProgress: numberValue(item.readingProgress),
    markedStatus: optionalNumber(item.markedStatus),
    sort: optionalNumber(item.sort),
    syncedAt: now,
    updatedAt: now,
  };
}

function hasWeReadNotebookContent(book: WeReadBook) {
  return book.reviewCount + book.noteCount + book.bookmarkCount > 0;
}

function mergeBookInfo(book: WeReadBook, progressResponse: Record<string, unknown>): WeReadBook {
  const progress = objectValue(progressResponse.book);
  if (!progress) return book;
  return {
    ...book,
    readingProgress: numberValue(progress.progress),
    currentChapterUid: optionalNumber(progress.chapterUid),
    currentChapterOffset: optionalNumber(progress.chapterOffset),
    recordReadingTime: optionalNumber(progress.recordReadingTime),
    lastReadAt: optionalNumber(progress.updateTime),
  };
}

function withValidContentCounts(
  book: WeReadBook,
  highlights: WeReadHighlight[],
  thoughts: WeReadThought[],
): WeReadBook {
  return {
    ...book,
    reviewCount: thoughts.length,
    noteCount: highlights.length,
    bookmarkCount: highlights.length,
  };
}

function chapterFromResponse(bookId: string, item: Record<string, unknown>): WeReadChapter {
  return {
    bookId,
    chapterUid: numberValue(item.chapterUid),
    chapterIdx: numberValue(item.chapterIdx),
    title: stringValue(item.title) || '未命名章节',
    level: numberValue(item.level) || 1,
    wordCount: optionalNumber(item.wordCount),
  };
}

function highlightFromResponse(
  bookId: string,
  item: Record<string, unknown>,
  chapterIndexByUid: Map<number, number>,
): WeReadHighlight {
  const chapterUid = numberValue(item.chapterUid);
  return {
    bookmarkId:
      stringValue(item.bookmarkId) || `${bookId}:${chapterUid}:${stringValue(item.range)}`,
    bookId: stringValue(item.bookId) || bookId,
    chapterUid,
    chapterIdx: chapterIndexByUid.get(chapterUid),
    range: stringValue(item.range) || undefined,
    markText: stringValue(item.markText),
    colorStyle: optionalNumber(item.colorStyle),
    createTime: numberValue(item.createTime),
  };
}

function thoughtFromResponse(
  bookId: string,
  item: Record<string, unknown>,
  chapterIndexByUid: Map<number, number>,
): WeReadThought {
  const review = objectValue(item.review) || item;
  const chapterUid = optionalNumber(review.chapterUid);
  return {
    reviewId: stringValue(review.reviewId) || stringValue(item.reviewId),
    bookId: stringValue(review.bookId) || bookId,
    userVid: optionalNumber(review.userVid),
    author: userFromResponse(review.author),
    chapterUid,
    chapterIdx: chapterUid === undefined ? undefined : chapterIndexByUid.get(chapterUid),
    chapterName: stringValue(review.chapterName) || undefined,
    range: stringValue(review.range) || undefined,
    abstract: stringValue(review.abstract) || undefined,
    content: stringValue(review.content) || stringValue(review.htmlContent),
    createTime: numberValue(review.createTime),
  };
}

function isValidWeReadHighlight(highlight: WeReadHighlight) {
  return Boolean(highlight.chapterUid && highlight.range && highlight.markText.trim());
}

function isValidWeReadThought(thought: WeReadThought) {
  return Boolean(
    thought.chapterUid !== undefined &&
    thought.range &&
    (thought.abstract?.trim() || thought.content.trim()),
  );
}

function userFromResponse(value: unknown): WeReadUser | undefined {
  const user = objectValue(value);
  if (!user) return undefined;
  return {
    userVid: optionalNumber(user.userVid),
    name: stringValue(user.name) || undefined,
    avatar: stringValue(user.avatar) || undefined,
  };
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<Record<string, unknown>[]>((items, item) => {
    const object = objectValue(item);
    if (object) items.push(object);
    return items;
  }, []);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function optionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function numberValue(value: unknown) {
  return optionalNumber(value) || 0;
}
