import { Buffer } from 'node:buffer';

const FAVICON_TIMEOUT_MS = 8_000;
const MAX_FAVICON_BYTES = 512 * 1024;

// 一次性抓取原 favicon 并编码为 data URI，供存量文章首次可见时回填本地化。
export async function fetchFaviconDataUrl(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!response.ok) return '';

    const contentType =
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
    if (!contentType.startsWith('image/')) return '';

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_FAVICON_BYTES) return '';

    return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}
