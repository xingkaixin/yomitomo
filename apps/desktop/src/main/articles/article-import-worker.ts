import { Buffer } from 'node:buffer';
import { parentPort, workerData } from 'node:worker_threads';
import { JSDOM } from 'jsdom';
import {
  articleRecordFromExtractedArticle,
  extractArticleFromDocument,
} from '@yomitomo/core/article-extraction';
import { inlineArticleFavicon, inlineArticleImages } from '@yomitomo/core/article-images';
import {
  fetchArticleImportUrl,
  isArticleImportRedirectStatus,
  type ArticleImportNetworkPolicyOptions,
} from './article-import-network-policy';

const ARTICLE_IMAGE_TIMEOUT_MS = 10_000;
const MAX_ARTICLE_IMAGE_BYTES = 2_000_000;
const MAX_ARTICLE_IMAGE_REDIRECTS = 5;

type ArticleImportWorkerData = {
  allowLocalNetworkArticleImport?: boolean;
  html: string;
  inlineImages: boolean;
  url: string;
  userAgent?: string;
};

type ArticleImageResponse = {
  response: Response;
  url: string;
};

type ArticleImportWorkerPort = {
  postMessage(message: unknown): void;
};

if (parentPort) {
  void postArticleImportWorkerResult(workerData, parentPort);
}

async function postArticleImportWorkerResult(input: unknown, port: ArticleImportWorkerPort) {
  try {
    const article = await extractArticleRecord(input);
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    port.postMessage({ ok: true, article });
  } catch (error) {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    port.postMessage({ ok: false, error: workerError(error) });
  }
}

async function extractArticleRecord(input: unknown) {
  const data = articleImportWorkerData(input);
  const dom = new JSDOM(data.html, { url: data.url });

  try {
    let article = await extractArticleFromDocument(dom.window.document, data.url);
    const fetcher = (imageUrl: string) =>
      fetchArticleImageDataUrl(imageUrl, article.url, data.userAgent, {
        allowLocalNetworkArticleImport: data.allowLocalNetworkArticleImport,
      });
    if (data.inlineImages) {
      article = await inlineArticleImages(article, {
        articleDocument: dom.window.document,
        fetcher,
      });
    } else {
      // 不内联正文图片时也单独把 favicon 落成 data URI，展示离线可用。
      article = await inlineArticleFavicon(article, fetcher);
    }
    return articleRecordFromExtractedArticle(article);
  } finally {
    dom.window.close();
  }
}

function articleImportWorkerData(input: unknown): ArticleImportWorkerData {
  if (!isRecord(input)) throw new Error('ARTICLE_IMPORT_INVALID_TASK');
  const html = stringField(input.html);
  const url = stringField(input.url);
  const userAgent = stringField(input.userAgent) || undefined;
  if (!html || !url) throw new Error('ARTICLE_IMPORT_INVALID_TASK');
  return {
    allowLocalNetworkArticleImport: input.allowLocalNetworkArticleImport === true,
    html,
    inlineImages: input.inlineImages === true,
    url,
    userAgent,
  };
}

async function fetchArticleImageDataUrl(
  url: string,
  articleUrl: string,
  userAgent: string | undefined,
  options: ArticleImportNetworkPolicyOptions = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_IMAGE_TIMEOUT_MS);

  try {
    const { response } = await fetchArticleImageResponse(
      url,
      articleUrl,
      userAgent,
      controller.signal,
      options,
    );
    try {
      if (!response.ok) return null;

      const contentType = imageContentType(response.headers.get('content-type'));
      if (!contentType) return null;

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_ARTICLE_IMAGE_BYTES) return null;

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_ARTICLE_IMAGE_BYTES) return null;

      return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
    } finally {
      if (!response.bodyUsed) await response.body?.cancel().catch(() => undefined);
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchArticleImageResponse(
  initialUrl: string,
  articleUrl: string,
  userAgent: string | undefined,
  signal: AbortSignal,
  options: ArticleImportNetworkPolicyOptions,
): Promise<ArticleImageResponse> {
  let url = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_ARTICLE_IMAGE_REDIRECTS; redirectCount += 1) {
    const response = await fetchArticleImportUrl(
      url,
      {
        headers: imageHeaders(articleUrl, userAgent),
        redirect: 'manual',
        signal,
      },
      options,
    );

    if (!isArticleImportRedirectStatus(response.status)) return { response, url };
    if (redirectCount === MAX_ARTICLE_IMAGE_REDIRECTS)
      throw new Error('ARTICLE_IMAGE_TOO_MANY_REDIRECTS');

    const location = response.headers.get('location');
    if (!location) throw new Error('ARTICLE_IMAGE_INVALID_REDIRECT');
    await response.body?.cancel().catch(() => undefined);
    url = new URL(location, url).href;
  }

  throw new Error('ARTICLE_IMAGE_TOO_MANY_REDIRECTS');
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

function workerError(error: unknown) {
  return {
    message: error instanceof Error ? error.message : 'ARTICLE_IMPORT_PARSE_FAILED',
  };
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const articleImportWorkerTestApi = {
  extractArticleRecord,
  fetchArticleImageDataUrl,
  postArticleImportWorkerResult,
  workerError,
};
