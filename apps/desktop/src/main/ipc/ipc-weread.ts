import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import type {
  WeReadBook,
  WeReadBookDetail,
  WeReadOpenMethod,
  WeReadReadingStatsMode,
} from '@yomitomo/shared';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';

const WEREAD_SYNC_DETAIL_CONCURRENCY = 3;

export function registerWeReadIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('weread:get-state', async () => {
    const { weReadPersistence } = await context.getPersistenceModule();
    return weReadPersistence.readWeReadState();
  });
  handleDesktopIpc('weread:read-api-key', async () => {
    const { weReadPersistence } = await context.getPersistenceModule();
    return weReadPersistence.readStoredWeReadApiKey();
  });
  handleDesktopIpc('weread:save-settings', async (_event, input) => {
    const { weReadPersistence } = await context.getPersistenceModule();
    return weReadPersistence.saveWeReadSettings(input);
  });
  handleDesktopIpc('weread:test', async (_event, apiKey) => {
    const { weReadPersistence } = await context.getPersistenceModule();
    const key = apiKey?.trim() || (await weReadPersistence.readStoredWeReadApiKey());
    if (!key) return { ok: false, message: 'WEREAD_API_KEY_REQUIRED' };
    try {
      const { testWeReadConnection } = await import('../weread/weread-client');
      const result = await testWeReadConnection(key);
      await weReadPersistence.saveWeReadTestResult(true, result.message);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WEREAD_CONNECTION_FAILED';
      await weReadPersistence.saveWeReadTestResult(false, message);
      return { ok: false, message };
    }
  });
  handleDesktopIpc('weread:sync', async () => {
    const startedAt = performance.now();
    const { weReadPersistence } = await context.getPersistenceModule();
    const apiKey = await weReadPersistence.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('WEREAD_API_KEY_REQUIRED');
    const {
      fetchWeReadBookDetail,
      fetchWeReadNotebooks,
      hasValidWeReadBookDetailContent,
      mergeWeReadNotebookBook,
    } = await import('../weread/weread-client');
    context.logInfo('weread.sync.start');
    try {
      const notebooksStartedAt = performance.now();
      const books = await fetchWeReadNotebooks(apiKey);
      context.logInfo('weread.sync.notebooks_loaded', {
        bookCount: books.length,
        durationMs: context.elapsedMs(notebooksStartedAt),
      });
      const details = await fetchWeReadSyncDetails({
        books,
        fetchBookDetail: (bookId) => fetchWeReadBookDetail(apiKey, bookId),
        hasValidContent: hasValidWeReadBookDetailContent,
        logError: context.logError,
        logInfo: context.logInfo,
        mergeNotebookBook: mergeWeReadNotebookBook,
        elapsedMs: context.elapsedMs,
      });
      const result = await weReadPersistence.saveWeReadBookDetails(details);
      context.logInfo('weread.sync.complete', {
        bookCount: books.length,
        detailCount: details.length,
        durationMs: context.elapsedMs(startedAt),
      });
      return result;
    } catch (error) {
      context.logError('weread.sync.failed', error, {
        durationMs: context.elapsedMs(startedAt),
      });
      throw error;
    }
  });
  handleDesktopIpc('weread:sync-book', async (_event, bookId) => {
    const { weReadPersistence } = await context.getPersistenceModule();
    const apiKey = await weReadPersistence.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('WEREAD_API_KEY_REQUIRED');
    const { fetchWeReadBookDetail } = await import('../weread/weread-client');
    const detail = await fetchWeReadBookDetail(apiKey, bookId);
    return weReadPersistence.saveWeReadBookDetail(detail);
  });
  handleDesktopIpc('weread:get-book', async (_event, bookId) => {
    const { weReadPersistence } = await context.getPersistenceModule();
    return weReadPersistence.readWeReadBookDetail(bookId);
  });
  handleDesktopIpc('weread:open', async (_event, target) => {
    const { weReadPersistence } = await context.getPersistenceModule();
    const settings = await weReadPersistence.readWeReadSettings();
    return context.openExternalUrl(buildWeReadOpenUrl(target, settings.openMethod));
  });
  handleDesktopIpc('weread:get-reading-stats', async () => {
    const { weReadPersistence } = await context.getPersistenceModule();
    return weReadPersistence.readWeReadReadingStatsState();
  });
  handleDesktopIpc('weread:query-reading-stats', async (_event, input) => {
    const { weReadPersistence } = await context.getPersistenceModule();
    const apiKey = await weReadPersistence.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('WEREAD_API_KEY_REQUIRED');
    const { fetchWeReadReadingStats } = await import('../weread/weread-client');
    const sourceBaseTime =
      input.mode === 'overall' ? undefined : Math.floor((input.baseTime ?? Date.now()) / 1000);
    const periodStart = getWeReadStatsPeriodStart(input.mode, sourceBaseTime);
    const data = await fetchWeReadReadingStats(apiKey, input.mode, sourceBaseTime);
    return weReadPersistence.saveWeReadReadingStatsSnapshot({
      id: `${input.mode}:${periodStart}`,
      mode: input.mode,
      periodStart,
      sourceBaseTime,
      data,
      fetchedAt: new Date().toISOString(),
    });
  });
}

export async function fetchWeReadSyncDetails(input: {
  books: WeReadBook[];
  fetchBookDetail: (bookId: string) => Promise<WeReadBookDetail>;
  hasValidContent: (detail: WeReadBookDetail) => boolean;
  mergeNotebookBook: (detail: WeReadBookDetail, book: WeReadBook) => WeReadBookDetail;
  logInfo: DesktopMainIpcContext['logInfo'];
  logError: DesktopMainIpcContext['logError'];
  elapsedMs?: (startedAt: number) => number;
  concurrency?: number;
}) {
  const concurrency = Math.max(1, input.concurrency ?? WEREAD_SYNC_DETAIL_CONCURRENCY);
  const details: Array<WeReadBookDetail | undefined> = [];
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const book = input.books[index];
      if (!book) return;

      const startedAt = performance.now();
      try {
        const detail = input.mergeNotebookBook(await input.fetchBookDetail(book.bookId), book);
        if (input.hasValidContent(detail)) details[index] = detail;
        input.logInfo('weread.sync.book_detail_loaded', {
          bookId: book.bookId,
          title: book.title,
          stage: 'book_detail',
          durationMs: elapsedMs(input, startedAt),
        });
      } catch (error) {
        input.logError('weread.sync.book_detail_failed', error, {
          bookId: book.bookId,
          title: book.title,
          stage: 'book_detail',
          durationMs: elapsedMs(input, startedAt),
        });
        throw error;
      }
    }
  }

  const workerCount = Math.min(concurrency, input.books.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return details.filter((detail): detail is WeReadBookDetail => Boolean(detail));
}

function elapsedMs(input: { elapsedMs?: (startedAt: number) => number }, startedAt: number) {
  return input.elapsedMs?.(startedAt) ?? Number((performance.now() - startedAt).toFixed(2));
}

function buildWeReadOpenUrl(
  target: { bookId: string; chapterUid?: number; range?: string; userVid?: number },
  method: WeReadOpenMethod,
) {
  if (method === 'web') {
    const webBookId = buildWeReadWebBookId(target.bookId);
    const webReaderId =
      target.chapterUid !== undefined
        ? `${webBookId}k${buildWeReadWebBookId(String(target.chapterUid))}`
        : webBookId;
    const url = new URL(`https://weread.qq.com/web/reader/${encodeURIComponent(webReaderId)}`);
    return url.href;
  }

  if (target.chapterUid !== undefined && target.range) {
    const [rangeStart, rangeEnd] = target.range.split('-');
    const url = new URL('weread://bestbookmark');
    url.searchParams.set('bookId', target.bookId);
    url.searchParams.set('chapterUid', String(target.chapterUid));
    if (rangeStart) url.searchParams.set('rangeStart', rangeStart);
    if (rangeEnd) url.searchParams.set('rangeEnd', rangeEnd);
    if (target.userVid !== undefined) url.searchParams.set('userVid', String(target.userVid));
    return url.href;
  }

  const url = new URL('weread://reading');
  url.searchParams.set('bId', target.bookId);
  if (target.chapterUid !== undefined)
    url.searchParams.set('chapterUid', String(target.chapterUid));
  return url.href;
}

function getWeReadStatsPeriodStart(mode: WeReadReadingStatsMode, baseTime?: number) {
  if (mode === 'overall') return 0;
  const date = new Date((baseTime ?? Math.floor(Date.now() / 1000)) * 1000);
  date.setHours(0, 0, 0, 0);
  if (mode === 'weekly') {
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
  } else if (mode === 'monthly') {
    date.setDate(1);
  } else {
    date.setMonth(0, 1);
  }
  return Math.floor(date.getTime() / 1000);
}

function buildWeReadWebBookId(bookId: string) {
  const digest = md5(bookId);
  const [type, segments] = transformWeReadBookId(bookId);
  let result = `${digest.slice(0, 3)}${type}2${digest.slice(-2)}`;

  for (const [index, segment] of segments.entries()) {
    result += `${segment.length.toString(16).padStart(2, '0')}${segment}`;
    if (index < segments.length - 1) result += 'g';
  }

  if (result.length < 20) result += digest.slice(0, 20 - result.length);
  return `${result}${md5(result).slice(0, 3)}`;
}

function transformWeReadBookId(bookId: string): [string, string[]] {
  if (/^\d+$/.test(bookId)) {
    const segments: string[] = [];
    for (let index = 0; index < bookId.length; index += 9) {
      segments.push(Number(bookId.slice(index, index + 9)).toString(16));
    }
    return ['3', segments];
  }

  let hexId = '';
  for (const char of bookId) hexId += char.charCodeAt(0).toString(16);
  return ['4', [hexId]];
}

function md5(value: string) {
  return createHash('md5').update(value).digest('hex');
}
