import { createHash } from 'node:crypto';
import type { WeReadOpenMethod, WeReadReadingStatsMode } from '@yomitomo/shared';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';

export function registerWeReadIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('weread:get-state', async () => {
    const { readWeReadState } = await context.getStoreModule();
    return readWeReadState();
  });
  handleDesktopIpc('weread:read-api-key', async () => {
    const { readStoredWeReadApiKey } = await context.getStoreModule();
    return readStoredWeReadApiKey();
  });
  handleDesktopIpc('weread:save-settings', async (_event, input) => {
    const { saveWeReadSettings } = await context.getStoreModule();
    return saveWeReadSettings(input);
  });
  handleDesktopIpc('weread:test', async (_event, apiKey) => {
    const store = await context.getStoreModule();
    const key = apiKey?.trim() || (await store.readStoredWeReadApiKey());
    if (!key) return { ok: false, message: '请先配置微信读书 API Key' };
    try {
      const { testWeReadConnection } = await import('../weread-client');
      const result = await testWeReadConnection(key);
      await store.saveWeReadTestResult(true, result.message);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '微信读书连通失败';
      await store.saveWeReadTestResult(false, message);
      return { ok: false, message };
    }
  });
  handleDesktopIpc('weread:sync', async () => {
    const store = await context.getStoreModule();
    const apiKey = await store.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('请先在设置里配置微信读书 API Key');
    const {
      fetchWeReadBookDetail,
      fetchWeReadNotebooks,
      hasValidWeReadBookDetailContent,
      mergeWeReadNotebookBook,
    } = await import('../weread-client');
    const books = await fetchWeReadNotebooks(apiKey);
    const details = [];
    for (const book of books) {
      const detail = mergeWeReadNotebookBook(
        await fetchWeReadBookDetail(apiKey, book.bookId),
        book,
      );
      if (hasValidWeReadBookDetailContent(detail)) details.push(detail);
    }
    return store.saveWeReadBookDetails(details);
  });
  handleDesktopIpc('weread:sync-book', async (_event, bookId) => {
    const store = await context.getStoreModule();
    const apiKey = await store.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('请先在设置里配置微信读书 API Key');
    const { fetchWeReadBookDetail } = await import('../weread-client');
    const detail = await fetchWeReadBookDetail(apiKey, bookId);
    return store.saveWeReadBookDetail(detail);
  });
  handleDesktopIpc('weread:get-book', async (_event, bookId) => {
    const { readWeReadBookDetail } = await context.getStoreModule();
    return readWeReadBookDetail(bookId);
  });
  handleDesktopIpc('weread:open', async (_event, target) => {
    const { readWeReadSettings } = await context.getStoreModule();
    const settings = await readWeReadSettings();
    return context.openExternalUrl(buildWeReadOpenUrl(target, settings.openMethod));
  });
  handleDesktopIpc('weread:get-reading-stats', async () => {
    const { readWeReadReadingStatsState } = await context.getStoreModule();
    return readWeReadReadingStatsState();
  });
  handleDesktopIpc('weread:query-reading-stats', async (_event, input) => {
    const store = await context.getStoreModule();
    const apiKey = await store.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('请先在设置里配置微信读书 API Key');
    const { fetchWeReadReadingStats } = await import('../weread-client');
    const sourceBaseTime =
      input.mode === 'overall' ? undefined : Math.floor((input.baseTime ?? Date.now()) / 1000);
    const periodStart = getWeReadStatsPeriodStart(input.mode, sourceBaseTime);
    const data = await fetchWeReadReadingStats(apiKey, input.mode, sourceBaseTime);
    return store.saveWeReadReadingStatsSnapshot({
      id: `${input.mode}:${periodStart}`,
      mode: input.mode,
      periodStart,
      sourceBaseTime,
      data,
      fetchedAt: new Date().toISOString(),
    });
  });
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
