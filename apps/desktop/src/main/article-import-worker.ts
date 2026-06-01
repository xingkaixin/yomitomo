import { Buffer } from 'node:buffer';
import { parentPort, workerData } from 'node:worker_threads';
import { JSDOM } from 'jsdom';
import {
  articleRecordFromExtractedArticle,
  extractArticleFromDocument,
} from '@yomitomo/core/article-extraction';
import { inlineArticleImages } from '@yomitomo/core/article-images';

const ARTICLE_IMAGE_TIMEOUT_MS = 10_000;
const MAX_ARTICLE_IMAGE_BYTES = 2_000_000;

type ArticleImportWorkerData = {
  html: string;
  inlineImages: boolean;
  url: string;
  userAgent?: string;
};

void extractArticleRecord(workerData).then(
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  (article) => parentPort?.postMessage({ ok: true, article }),
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  (error) => parentPort?.postMessage({ ok: false, error: workerError(error) }),
);

async function extractArticleRecord(input: unknown) {
  const data = articleImportWorkerData(input);
  const dom = new JSDOM(data.html, { url: data.url });

  try {
    let article = await extractArticleFromDocument(dom.window.document, data.url);
    if (data.inlineImages) {
      article = await inlineArticleImages(article, {
        articleDocument: dom.window.document,
        fetcher: (imageUrl) => fetchArticleImageDataUrl(imageUrl, article.url, data.userAgent),
      });
    }
    return articleRecordFromExtractedArticle(article);
  } finally {
    dom.window.close();
  }
}

function articleImportWorkerData(input: unknown): ArticleImportWorkerData {
  if (!isRecord(input)) throw new Error('网页导入任务无效');
  const html = stringField(input.html);
  const url = stringField(input.url);
  const userAgent = stringField(input.userAgent) || undefined;
  if (!html || !url) throw new Error('网页导入任务无效');
  return {
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

function workerError(error: unknown) {
  return {
    message: error instanceof Error ? error.message : '网页解析失败',
  };
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
