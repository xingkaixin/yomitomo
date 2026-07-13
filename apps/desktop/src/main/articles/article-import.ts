import { basename, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Session,
  type WebContents,
} from 'electron';
import type { ArticleRecord } from '@yomitomo/shared';
import { Effect } from 'effect';
import {
  assertAllowedArticleImportUrl,
  fetchArticleImportUrl,
  isArticleImportRedirectStatus,
  type ArticleImportNetworkPolicyOptions,
} from './article-import-network-policy';
import { createArticleImportNetworkProxy } from './article-import-network-proxy';

const IMPORT_TIMEOUT_MS = 15_000;
export const MAX_ARTICLE_IMPORT_HTML_BYTES = 5_000_000;
const RENDERED_IMPORT_TIMEOUT_MS = 20_000;
const RENDERED_IMPORT_SETTLE_MS = 1_500;
const MAX_ARTICLE_IMPORT_REDIRECTS = 5;
const WECHAT_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 MicroMessenger/8.0.49';
const ARTICLE_IMPORT_CANCELED_MESSAGE = 'ARTICLE_IMPORT_CANCELED';

type ArticleImportOptions = ArticleImportNetworkPolicyOptions & {
  inlineImages?: boolean;
  requestId?: string;
};

type ArticleHtml = {
  html: string;
  url: string;
};

type ArticleFetchResponse = {
  response: Response;
  url: string;
};

type ArticleImportTask = {
  controller: AbortController;
};

type ArticleImportWorkerMessage =
  | { ok: true; article: ArticleRecord }
  | { ok: false; error?: { message?: string } };

const articleImportTasks = new Map<string, ArticleImportTask>();

export async function articleRecordFromUrl(
  input: string,
  options: ArticleImportOptions = {},
): Promise<ArticleRecord> {
  return Effect.runPromise(articleRecordFromUrlEffect(input, options));
}

function articleRecordFromUrlEffect(input: string, options: ArticleImportOptions) {
  const controller = new AbortController();
  registerArticleImportTask(options.requestId, controller);

  return Effect.gen(function* () {
    const url = yield* Effect.try({
      try: () => normalizeImportUrl(input),
      catch: (error) => error,
    });
    yield* throwIfArticleImportCanceledEffect(controller.signal);
    const page = yield* fetchArticleHtmlEffect(url, controller.signal, options);
    yield* throwIfArticleImportCanceledEffect(controller.signal);
    return yield* extractArticleRecordInWorkerEffect({
      allowLocalNetworkArticleImport: options.allowLocalNetworkArticleImport,
      html: page.html,
      inlineImages: options.inlineImages === true,
      signal: controller.signal,
      url: page.url,
      userAgent: importUserAgent(page.url),
    });
  }).pipe(
    Effect.ensuring(Effect.sync(() => unregisterArticleImportTask(options.requestId, controller))),
  );
}

export function cancelArticleImport(requestId: string) {
  const task = articleImportTasks.get(requestId);
  if (!task) return false;
  task.controller.abort();
  articleImportTasks.delete(requestId);
  return true;
}

export function isArticleImportCanceledError(error: unknown) {
  return error instanceof Error && error.message === ARTICLE_IMPORT_CANCELED_MESSAGE;
}

export function isArticleImportChallengeRecord(article: ArticleRecord) {
  return (
    article.annotations.length === 0 &&
    isChallengeHtml(`${article.title}\n${article.contentHtml || ''}`)
  );
}

function normalizeImportUrl(input: string) {
  const raw = input.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('ARTICLE_IMPORT_INVALID_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('ARTICLE_IMPORT_UNSUPPORTED_PROTOCOL');
  }
  return url.href;
}

function fetchArticleHtmlEffect(url: string, signal: AbortSignal, options: ArticleImportOptions) {
  return withTimeoutSignalEffect(IMPORT_TIMEOUT_MS, signal, (fetchSignal) =>
    Effect.gen(function* () {
      const page = yield* Effect.tryPromise({
        try: () => fetchArticleResponse(url, fetchSignal, options),
        catch: (error) => articleFetchError(error, signal),
      });
      const response = page.response;
      const userAgent = importUserAgent(page.url);

      if (!response.ok) {
        yield* Effect.promise(() => cancelResponseBody(response));
        if (shouldLoadWithBrowser(response)) {
          return yield* loadRenderedArticleHtmlEffect(page.url, userAgent, signal, options);
        }
        return yield* Effect.fail(new Error('ARTICLE_IMPORT_REQUEST_FAILED'));
      }

      const html = yield* Effect.tryPromise({
        try: async () => {
          try {
            return await readArticleImportResponseHtml(response, fetchSignal);
          } catch (error) {
            await cancelResponseBody(response);
            throw error;
          }
        },
        catch: (error) => articleFetchError(error, signal),
      });
      if (isChallengeHtml(html)) {
        return yield* loadRenderedArticleHtmlEffect(page.url, userAgent, signal, options);
      }
      return { html, url: page.url };
    }),
  );
}

async function fetchArticleResponse(
  initialUrl: string,
  signal: AbortSignal,
  options: ArticleImportOptions,
): Promise<ArticleFetchResponse> {
  let url = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_ARTICLE_IMPORT_REDIRECTS; redirectCount += 1) {
    const response = await fetchArticleImportUrl(
      url,
      {
        headers: importHeaders(importUserAgent(url)),
        redirect: 'manual',
        signal,
      },
      options,
    );

    if (!isArticleImportRedirect(response)) return { response, url };
    if (redirectCount === MAX_ARTICLE_IMPORT_REDIRECTS) {
      throw new Error('ARTICLE_IMPORT_REQUEST_FAILED');
    }

    const location = response.headers.get('location');
    if (!location) throw new Error('ARTICLE_IMPORT_REQUEST_FAILED');
    await response.body?.cancel().catch(() => undefined);
    try {
      url = new URL(location, url).href;
    } catch {
      throw new Error('ARTICLE_IMPORT_REQUEST_FAILED');
    }
  }

  throw new Error('ARTICLE_IMPORT_REQUEST_FAILED');
}

function isArticleImportRedirect(response: Response) {
  return isArticleImportRedirectStatus(response.status);
}

function articleFetchError(error: unknown, signal: AbortSignal) {
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error(signal.aborted ? ARTICLE_IMPORT_CANCELED_MESSAGE : 'ARTICLE_IMPORT_TIMEOUT', {
      cause: error,
    });
  }
  return error;
}

function importHeaders(userAgent: string | undefined): HeadersInit {
  return {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(userAgent ? { 'user-agent': userAgent } : {}),
  };
}

function importUserAgent(url: string) {
  try {
    return new URL(url).hostname === 'mp.weixin.qq.com' ? WECHAT_MOBILE_USER_AGENT : undefined;
  } catch {
    return undefined;
  }
}

function shouldLoadWithBrowser(response: Response) {
  const status = response.status;
  return (
    (status >= 400 && status < 500 && status !== 400 && status !== 404) ||
    response.headers.get('cf-mitigated') === 'challenge'
  );
}

async function cancelResponseBody(response: Response) {
  if (!response.body || response.bodyUsed) return;
  await response.body.cancel().catch(() => undefined);
}

function loadRenderedArticleHtmlEffect(
  url: string,
  userAgent: string | undefined,
  signal: AbortSignal,
  options: ArticleImportOptions,
) {
  return Effect.tryPromise({
    try: () => loadRenderedArticleHtml(url, userAgent, signal, options),
    catch: (error) => error,
  });
}

async function loadRenderedArticleHtml(
  url: string,
  userAgent: string | undefined,
  signal: AbortSignal,
  options: ArticleImportOptions,
): Promise<ArticleHtml> {
  await assertAllowedArticleImportUrl(url, options);
  const importId = createArticleImportId();
  const webPreferences = createArticleImportWebPreferences(importId);
  const browserWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences,
  });
  const importSession = browserWindow.webContents.session;
  const clearRequestPolicy = await installArticleImportRequestPolicy(importSession, options);
  logArticleImportSession(url, importId, webPreferences.partition);

  const deadline = Date.now() + RENDERED_IMPORT_TIMEOUT_MS;
  const timeout = setTimeout(() => {
    if (!browserWindow.isDestroyed()) browserWindow.destroy();
  }, RENDERED_IMPORT_TIMEOUT_MS);
  const abort = () => {
    if (!browserWindow.isDestroyed()) browserWindow.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });

  try {
    throwIfArticleImportCanceled(signal);
    await browserWindow.loadURL(url, userAgent ? { userAgent } : undefined);
    const page = await waitForRenderedPage(browserWindow.webContents, deadline, signal);
    if (typeof page.html !== 'string' || !page.html.trim()) {
      throw new Error('ARTICLE_IMPORT_RENDER_EMPTY');
    }
    assertArticleImportHtmlByteLimit(page.html);
    const renderedUrl = typeof page.url === 'string' && page.url ? page.url : url;
    await assertAllowedArticleImportUrl(renderedUrl, options);
    return {
      html: page.html,
      url: renderedUrl,
    };
  } finally {
    signal.removeEventListener('abort', abort);
    clearTimeout(timeout);
    await clearRequestPolicy();
    if (!browserWindow.isDestroyed()) browserWindow.destroy();
    await clearArticleImportSession(importSession, importId);
  }
}

async function installArticleImportRequestPolicy(
  importSession: Session,
  options: ArticleImportOptions,
) {
  if (options.allowLocalNetworkArticleImport) return async () => undefined;
  const proxy = await createArticleImportNetworkProxy(options);
  try {
    await importSession.setProxy({
      proxyBypassRules: '<-loopback>',
      proxyRules: proxy.url,
    });
  } catch (error) {
    await proxy.close();
    throw error;
  }
  return async () => {
    try {
      await importSession.closeAllConnections();
    } finally {
      await proxy.close();
    }
  };
}

function createArticleImportId() {
  return randomUUID();
}

function createArticleImportWebPreferences(
  importId: string,
): NonNullable<BrowserWindowConstructorOptions['webPreferences']> {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    partition: `yomitomo-import-${importId}`,
    sandbox: true,
  };
}

async function clearArticleImportSession(importSession: Session, importId: string) {
  try {
    await importSession.clearStorageData();
    await importSession.clearCache();
  } catch (error) {
    console.warn('[article-import] failed to clear temporary session', {
      error,
      importId,
    });
  }
}

function logArticleImportSession(url: string, importId: string, partition: string | undefined) {
  console.info('[article-import] rendered import session', {
    host: importUrlHost(url),
    importId,
    persistent: partition?.startsWith('persist:') === true,
  });
}

function importUrlHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function waitForRenderedPage(
  webContents: WebContents,
  deadline: number,
  signal: AbortSignal,
) {
  let lastPage: {
    html?: unknown;
    htmlByteLength?: unknown;
    text?: unknown;
    title?: unknown;
    url?: unknown;
  } = {};

  while (Date.now() < deadline) {
    await wait(RENDERED_IMPORT_SETTLE_MS, signal);
    throwIfArticleImportCanceled(signal);
    lastPage = renderedPageValue(
      await webContents.executeJavaScript(
        `(() => {
        const html = document.documentElement.outerHTML;
        const htmlByteLength = new Blob([html]).size;
        return {
        html: htmlByteLength <= ${MAX_ARTICLE_IMPORT_HTML_BYTES} ? html : "",
        htmlByteLength,
        text: document.body?.innerText || "",
        title: document.title || "",
        url: location.href
      };
      })()`,
        true,
      ),
    );
    throwIfArticleImportCanceled(signal);
    if (renderedPageTooLarge(lastPage)) throw new Error('ARTICLE_IMPORT_RESPONSE_TOO_LARGE');
    if (!isChallengePage(lastPage)) return lastPage;
  }

  if (isChallengePage(lastPage)) {
    throw new Error('ARTICLE_IMPORT_CHALLENGE_BLOCKED');
  }
  return lastPage;
}

function isChallengePage(page: { text?: unknown; title?: unknown }) {
  const text = typeof page.text === 'string' ? page.text : '';
  const title = typeof page.title === 'string' ? page.title : '';
  const html = stringField(recordField(page, 'html'));
  return (
    title.includes('Just a moment') ||
    title.includes('Protected By') ||
    text.includes('Enable JavaScript and cookies') ||
    text.includes('cf-browser-verification') ||
    text.includes('Checking your browser') ||
    text.includes('网页被保护') ||
    text.includes('安全检测能力由') ||
    text.includes('访问已被拦截') ||
    text.includes('雷池') ||
    html.includes('SafeLineChallenge')
  );
}

function renderedPageValue(value: unknown) {
  return isRecord(value)
    ? {
        html: value.html,
        htmlByteLength: value.htmlByteLength,
        text: value.text,
        title: value.title,
        url: value.url,
      }
    : {};
}

async function readArticleImportResponseHtml(response: Response, signal: AbortSignal) {
  const declaredLength = contentLengthBytes(response.headers);
  if (declaredLength !== null && declaredLength > MAX_ARTICLE_IMPORT_HTML_BYTES) {
    throw new Error('ARTICLE_IMPORT_RESPONSE_TOO_LARGE');
  }

  const html = await readLimitedResponseText(response, signal);
  if (isArticleImportHtmlResponse(response.headers, html)) return html;
  throw new Error('ARTICLE_IMPORT_UNSUPPORTED_CONTENT_TYPE');
}

async function readLimitedResponseText(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_ARTICLE_IMPORT_HTML_BYTES) {
      throw new Error('ARTICLE_IMPORT_RESPONSE_TOO_LARGE');
    }
    return new TextDecoder().decode(buffer);
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    for (;;) {
      throwIfSignalAborted(signal);
      const result = await reader.read();
      if (result.done) break;
      if (!result.value) continue;
      byteLength += result.value.byteLength;
      if (byteLength > MAX_ARTICLE_IMPORT_HTML_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('ARTICLE_IMPORT_RESPONSE_TOO_LARGE');
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  return new TextDecoder().decode(concatUint8Arrays(chunks, byteLength));
}

function contentLengthBytes(headers: Headers) {
  const value = headers.get('content-length')?.trim();
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function isArticleImportHtmlResponse(headers: Headers, html: string) {
  const contentType = responseContentType(headers);
  if (isHtmlContentType(contentType)) return true;
  return (!contentType || isHtmlLikeText(html)) && !isLikelyBinaryText(html);
}

function responseContentType(headers: Headers) {
  return headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
}

function isHtmlContentType(contentType: string) {
  return (
    contentType === 'text/html' ||
    contentType === 'application/xhtml+xml' ||
    contentType === 'application/xml' ||
    contentType === 'text/xml'
  );
}

function isHtmlLikeText(value: string) {
  const sample = value.trimStart().slice(0, 512).toLowerCase();
  return (
    sample.startsWith('<!doctype html') ||
    sample.startsWith('<html') ||
    sample.includes('<head') ||
    sample.includes('<body') ||
    sample.includes('<article')
  );
}

function isLikelyBinaryText(value: string) {
  return value.includes('\u0000') || value.trimStart().startsWith('%PDF-');
}

function assertArticleImportHtmlByteLimit(html: string) {
  if (new TextEncoder().encode(html).byteLength > MAX_ARTICLE_IMPORT_HTML_BYTES) {
    throw new Error('ARTICLE_IMPORT_RESPONSE_TOO_LARGE');
  }
}

function renderedPageTooLarge(page: { htmlByteLength?: unknown }) {
  return (
    typeof page.htmlByteLength === 'number' && page.htmlByteLength > MAX_ARTICLE_IMPORT_HTML_BYTES
  );
}

function throwIfSignalAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('aborted');
  error.name = 'AbortError';
  throw error;
}

function concatUint8Arrays(chunks: Uint8Array[], byteLength: number) {
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function extractArticleRecordInWorkerEffect({
  allowLocalNetworkArticleImport,
  html,
  inlineImages,
  signal,
  url,
  userAgent,
}: {
  html: string;
  allowLocalNetworkArticleImport?: boolean;
  inlineImages: boolean;
  signal: AbortSignal;
  url: string;
  userAgent?: string;
}) {
  return Effect.async<ArticleRecord, Error>((resume, effectSignal) => {
    if (signal.aborted) {
      resume(Effect.fail(new Error(ARTICLE_IMPORT_CANCELED_MESSAGE)));
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(articleImportWorkerUrl(), {
        workerData: {
          allowLocalNetworkArticleImport,
          html,
          inlineImages,
          url,
          userAgent,
        },
      });
    } catch (error) {
      resume(Effect.fail(errorFromUnknown(error, 'ARTICLE_IMPORT_PARSE_FAILED')));
      return;
    }

    let settled = false;

    const cleanup = () => {
      signal.removeEventListener('abort', abort);
      effectSignal.removeEventListener('abort', interrupt);
    };
    const settle = (effect: Effect.Effect<ArticleRecord, Error>) => {
      if (settled) return;
      settled = true;
      cleanup();
      resume(effect);
    };
    const abort = () => {
      void worker.terminate();
      settle(Effect.fail(new Error(ARTICLE_IMPORT_CANCELED_MESSAGE)));
    };
    const interrupt = () => {
      void worker.terminate();
      cleanup();
    };

    signal.addEventListener('abort', abort, { once: true });
    effectSignal.addEventListener('abort', interrupt, { once: true });
    worker.once('message', (message: ArticleImportWorkerMessage) => {
      void worker.terminate();
      settle(
        message.ok
          ? Effect.succeed(message.article)
          : Effect.fail(new Error(message.error?.message || 'ARTICLE_IMPORT_PARSE_FAILED')),
      );
    });
    worker.once('error', (error) => {
      void worker.terminate();
      settle(Effect.fail(errorFromUnknown(error, 'ARTICLE_IMPORT_PARSE_FAILED')));
    });
    worker.once('exit', (code) => {
      if (code === 0 || settled) return;
      settle(Effect.fail(new Error('ARTICLE_IMPORT_WORKER_EXITED')));
    });

    return Effect.sync(() => {
      if (settled) return;
      settled = true;
      cleanup();
      void worker.terminate();
    });
  });
}

function articleImportWorkerUrl() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const relativeWorkerPath =
    basename(currentDir) === 'chunks'
      ? '../article-import-worker.js'
      : './article-import-worker.js';
  return new URL(relativeWorkerPath, import.meta.url);
}

function registerArticleImportTask(requestId: string | undefined, controller: AbortController) {
  if (!requestId) return;
  articleImportTasks.get(requestId)?.controller.abort();
  articleImportTasks.set(requestId, { controller });
}

function unregisterArticleImportTask(requestId: string | undefined, controller: AbortController) {
  if (!requestId) return;
  if (articleImportTasks.get(requestId)?.controller === controller) {
    articleImportTasks.delete(requestId);
  }
}

function withTimeoutSignal<T>(
  timeoutMs: number,
  parentSignal: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  parentSignal.addEventListener('abort', abort, { once: true });

  return run(controller.signal).finally(() => {
    parentSignal.removeEventListener('abort', abort);
    clearTimeout(timeout);
  });
}

function withTimeoutSignalEffect<T>(
  timeoutMs: number,
  parentSignal: AbortSignal,
  run: (signal: AbortSignal) => Effect.Effect<T, unknown>,
) {
  return Effect.tryPromise({
    try: () =>
      withTimeoutSignal(timeoutMs, parentSignal, (signal) => Effect.runPromise(run(signal))),
    catch: (error) => error,
  });
}

function throwIfArticleImportCanceled(signal: AbortSignal) {
  if (signal.aborted) throw new Error(ARTICLE_IMPORT_CANCELED_MESSAGE);
}

function throwIfArticleImportCanceledEffect(signal: AbortSignal) {
  return Effect.try({
    try: () => throwIfArticleImportCanceled(signal),
    catch: (error) => error,
  });
}

function errorFromUnknown(error: unknown, fallback: string) {
  return error instanceof Error ? error : new Error(fallback);
}

function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function isChallengeHtml(html: string) {
  return (
    html.includes('mmbizwap:secitptpage/verify.html') ||
    html.includes('当前环境异常，完成验证后即可继续访问') ||
    html.includes('id="js_verify"') ||
    html.includes('SafeLineChallenge') ||
    html.includes('cf-browser-verification')
  );
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(ARTICLE_IMPORT_CANCELED_MESSAGE));
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      reject(new Error(ARTICLE_IMPORT_CANCELED_MESSAGE));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
