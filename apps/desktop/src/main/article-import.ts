import { BrowserWindow, type WebContents } from 'electron';
import { JSDOM } from 'jsdom';
import {
  articleRecordFromExtractedArticle,
  extractArticleFromDocument,
} from '@yomitomo/core/article-extraction';
import { inlineArticleImages } from '@yomitomo/core/article-images';
import type { ArticleRecord } from '@yomitomo/shared';

const IMPORT_TIMEOUT_MS = 15_000;
const ARTICLE_IMAGE_TIMEOUT_MS = 10_000;
const RENDERED_IMPORT_TIMEOUT_MS = 20_000;
const RENDERED_IMPORT_SETTLE_MS = 1_500;
const MAX_ARTICLE_IMAGE_BYTES = 2_000_000;
const WECHAT_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 MicroMessenger/8.0.49';

type ArticleImportOptions = {
  inlineImages?: boolean;
};

type ArticleHtml = {
  html: string;
  url: string;
};

export async function articleRecordFromUrl(
  input: string,
  options: ArticleImportOptions = {},
): Promise<ArticleRecord> {
  const url = normalizeImportUrl(input);
  const page = await fetchArticleHtml(url);
  const dom = new JSDOM(page.html, { url: page.url });

  try {
    let article = await extractArticleFromDocument(dom.window.document, page.url);
    if (options.inlineImages) {
      const userAgent = importUserAgent(article.url);
      article = await inlineArticleImages(article, {
        articleDocument: dom.window.document,
        fetcher: (imageUrl) => fetchArticleImageDataUrl(imageUrl, article.url, userAgent),
      });
    }
    return articleRecordFromExtractedArticle(article);
  } finally {
    dom.window.close();
  }
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

async function fetchArticleHtml(url: string): Promise<ArticleHtml> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);
  const userAgent = importUserAgent(url);

  try {
    const response = await fetch(url, {
      headers: importHeaders(userAgent),
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      if (shouldLoadWithBrowser(response)) return loadRenderedArticleHtml(url, userAgent);
      throw new Error(`网页请求失败：${response.status}`);
    }
    const html = await response.text();
    if (isChallengeHtml(html)) return loadRenderedArticleHtml(response.url || url, userAgent);
    return { html, url: response.url || url };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('网页请求超时', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function importHeaders(userAgent: string | undefined): HeadersInit {
  return {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(userAgent ? { 'user-agent': userAgent } : {}),
  };
}

async function fetchArticleImageDataUrl(
  url: string,
  articleUrl: string,
  userAgent: string | undefined,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: imageHeaders(articleUrl, userAgent),
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const contentType = imageContentType(response.headers.get('content-type'));
    if (!contentType) return null;

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_ARTICLE_IMAGE_BYTES) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_ARTICLE_IMAGE_BYTES) return null;

    return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function imageHeaders(articleUrl: string, userAgent: string | undefined): HeadersInit {
  return {
    accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    referer: articleUrl,
    ...(userAgent ? { 'user-agent': userAgent } : {}),
  };
}

function imageContentType(value: string | null) {
  const contentType = value?.split(';')[0]?.trim().toLowerCase();
  return contentType?.startsWith('image/') ? contentType : '';
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

  try {
    await browserWindow.loadURL(url, userAgent ? { userAgent } : undefined);
    const page = await waitForRenderedPage(browserWindow.webContents, deadline);
    if (typeof page.html !== 'string' || !page.html.trim()) {
      throw new Error('网页渲染结果为空');
    }
    return {
      html: page.html,
      url: typeof page.url === 'string' && page.url ? page.url : url,
    };
  } finally {
    clearTimeout(timeout);
    if (!browserWindow.isDestroyed()) browserWindow.destroy();
  }
}

async function waitForRenderedPage(webContents: WebContents, deadline: number) {
  let lastPage: { html?: unknown; text?: unknown; title?: unknown; url?: unknown } = {};

  while (Date.now() < deadline) {
    await wait(RENDERED_IMPORT_SETTLE_MS);
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
