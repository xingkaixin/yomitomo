import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BrowserWindow, type WebContents } from 'electron';
import type { ArticleRecord } from '@yomitomo/shared';

const IMPORT_TIMEOUT_MS = 15_000;
const RENDERED_IMPORT_TIMEOUT_MS = 20_000;
const RENDERED_IMPORT_SETTLE_MS = 1_500;
const WECHAT_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 MicroMessenger/8.0.49';
const ARTICLE_IMPORT_CANCELED_MESSAGE = '网页解析已取消';

type ArticleImportOptions = {
  inlineImages?: boolean;
  requestId?: string;
};

type ArticleHtml = {
  html: string;
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
  const controller = new AbortController();
  registerArticleImportTask(options.requestId, controller);

  try {
    const url = normalizeImportUrl(input);
    throwIfArticleImportCanceled(controller.signal);
    const page = await fetchArticleHtml(url, controller.signal);
    throwIfArticleImportCanceled(controller.signal);
    return await extractArticleRecordInWorker({
      html: page.html,
      inlineImages: options.inlineImages === true,
      signal: controller.signal,
      url: page.url,
      userAgent: importUserAgent(page.url),
    });
  } finally {
    unregisterArticleImportTask(options.requestId, controller);
  }
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
    throw new Error('网页地址格式无效');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('网页地址需要使用 http 或 https');
  }
  return url.href;
}

async function fetchArticleHtml(url: string, signal: AbortSignal): Promise<ArticleHtml> {
  const userAgent = importUserAgent(url);

  try {
    return await withTimeoutSignal(IMPORT_TIMEOUT_MS, signal, async (fetchSignal) => {
      const response = await fetch(url, {
        headers: importHeaders(userAgent),
        redirect: 'follow',
        signal: fetchSignal,
      });

      if (!response.ok) {
        if (shouldLoadWithBrowser(response)) return loadRenderedArticleHtml(url, userAgent, signal);
        throw new Error(`网页请求失败：${response.status}`);
      }

      const html = await response.text();
      if (isChallengeHtml(html)) {
        return loadRenderedArticleHtml(response.url || url, userAgent, signal);
      }
      return { html, url: response.url || url };
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(signal.aborted ? ARTICLE_IMPORT_CANCELED_MESSAGE : '网页请求超时', {
        cause: error,
      });
    }
    throw error;
  }
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

async function loadRenderedArticleHtml(
  url: string,
  userAgent: string | undefined,
  signal: AbortSignal,
): Promise<ArticleHtml> {
  const browserWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:yomitomo-import',
      sandbox: true,
    },
  });

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
      throw new Error('网页渲染结果为空');
    }
    return {
      html: page.html,
      url: typeof page.url === 'string' && page.url ? page.url : url,
    };
  } finally {
    signal.removeEventListener('abort', abort);
    clearTimeout(timeout);
    if (!browserWindow.isDestroyed()) browserWindow.destroy();
  }
}

async function waitForRenderedPage(
  webContents: WebContents,
  deadline: number,
  signal: AbortSignal,
) {
  let lastPage: { html?: unknown; text?: unknown; title?: unknown; url?: unknown } = {};

  while (Date.now() < deadline) {
    await wait(RENDERED_IMPORT_SETTLE_MS, signal);
    throwIfArticleImportCanceled(signal);
    lastPage = renderedPageValue(
      await webContents.executeJavaScript(
        `({
        html: document.documentElement.outerHTML,
        text: document.body?.innerText || "",
        title: document.title || "",
        url: location.href
      })`,
        true,
      ),
    );
    throwIfArticleImportCanceled(signal);
    if (!isChallengePage(lastPage)) return lastPage;
  }

  if (isChallengePage(lastPage)) {
    throw new Error('网页被站点防护拦截，需要在内置浏览器中打开后采集');
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
        text: value.text,
        title: value.title,
        url: value.url,
      }
    : {};
}

function extractArticleRecordInWorker({
  html,
  inlineImages,
  signal,
  url,
  userAgent,
}: {
  html: string;
  inlineImages: boolean;
  signal: AbortSignal;
  url: string;
  userAgent?: string;
}) {
  return new Promise<ArticleRecord>((resolve, reject) => {
    throwIfArticleImportCanceled(signal);
    const worker = new Worker(articleImportWorkerUrl(), {
      workerData: {
        html,
        inlineImages,
        url,
        userAgent,
      },
    });
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => {
      void worker.terminate();
      settle(() => reject(new Error(ARTICLE_IMPORT_CANCELED_MESSAGE)));
    };

    signal.addEventListener('abort', abort, { once: true });
    worker.once('message', (message: ArticleImportWorkerMessage) => {
      void worker.terminate();
      settle(() => {
        if (message.ok) resolve(message.article);
        else reject(new Error(message.error?.message || '网页解析失败'));
      });
    });
    worker.once('error', (error) => {
      settle(() => reject(error));
    });
    worker.once('exit', (code) => {
      if (code === 0 || settled) return;
      settle(() => reject(new Error(`网页解析进程退出：${code}`)));
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

function throwIfArticleImportCanceled(signal: AbortSignal) {
  if (signal.aborted) throw new Error(ARTICLE_IMPORT_CANCELED_MESSAGE);
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
