import { Buffer } from 'node:buffer';
import {
  fetchArticleImportUrl,
  isArticleImportRedirectStatus,
  type ArticleImportNetworkPolicyOptions,
} from './article-import-network-policy';

const FAVICON_TIMEOUT_MS = 8_000;
const MAX_FAVICON_BYTES = 512 * 1024;
const MAX_FAVICON_REDIRECTS = 5;

export async function fetchFaviconDataUrl(
  initialUrl: string,
  options: ArticleImportNetworkPolicyOptions = {},
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
  try {
    const response = await fetchFaviconResponse(initialUrl, controller.signal, options);
    try {
      if (!response.ok) return '';

      const contentType = imageContentType(response.headers.get('content-type'));
      if (!contentType) return '';

      const bytes = await readFaviconBytes(response);
      if (!bytes) return '';

      return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
    } finally {
      await cancelResponseBody(response);
    }
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFaviconResponse(
  initialUrl: string,
  signal: AbortSignal,
  options: ArticleImportNetworkPolicyOptions,
) {
  let url = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_FAVICON_REDIRECTS; redirectCount += 1) {
    const response = await fetchArticleImportUrl(
      url,
      {
        headers: { accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
        redirect: 'manual',
        signal,
      },
      options,
    );
    if (!isArticleImportRedirectStatus(response.status)) return response;

    const location = response.headers.get('location');
    await cancelResponseBody(response);
    if (!location || redirectCount === MAX_FAVICON_REDIRECTS) {
      throw new Error('ARTICLE_FAVICON_INVALID_REDIRECT');
    }
    url = new URL(location, url).href;
  }

  throw new Error('ARTICLE_FAVICON_TOO_MANY_REDIRECTS');
}

async function readFaviconBytes(response: Response) {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > MAX_FAVICON_BYTES) return null;

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    byteLength += chunk.value.byteLength;
    if (byteLength > MAX_FAVICON_BYTES) {
      await reader.cancel('ARTICLE_FAVICON_RESPONSE_TOO_LARGE');
      return null;
    }
    chunks.push(chunk.value);
  }
  if (byteLength === 0) return null;

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function imageContentType(value: string | null) {
  const contentType = value?.split(';')[0]?.trim().toLowerCase();
  return contentType?.startsWith('image/') ? contentType : '';
}

async function cancelResponseBody(response: Response) {
  if (!response.body || response.bodyUsed) return;
  await response.body.cancel().catch(() => undefined);
}
