import type { DesktopServerMessage } from '@yomitomo/shared';
import type { DesktopBridgeContentMessage } from './desktop-bridge';

export const ARTICLE_IMAGE_FETCH_MESSAGE_TYPE = 'yomitomo:article-image:fetch';
const MAX_ARTICLE_IMAGE_BYTES = 2_000_000;

export type ArticleImageFetchMessage = {
  type: typeof ARTICLE_IMAGE_FETCH_MESSAGE_TYPE;
  url: string;
};

export type ArticleImageFetchResponse =
  | { ok: true; dataUrl: string; contentType: string; bytes: number }
  | { ok: false; message: string };

export function desktopMessageFromData(data: unknown): DesktopBridgeContentMessage {
  try {
    return {
      type: 'desktop:message',
      message: JSON.parse(String(data)) as DesktopServerMessage,
    };
  } catch {
    return { type: 'desktop:error', message: '桌面端消息格式错误' };
  }
}

export async function articleImageFetchResponse(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<ArticleImageFetchResponse> {
  let normalizedUrl: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, message: '图片地址必须是 http 或 https' };
    }
    normalizedUrl = parsed.href;
  } catch {
    return { ok: false, message: '图片地址无效' };
  }

  try {
    const response = await fetcher(normalizedUrl, {
      cache: 'force-cache',
      credentials: 'include',
    });
    if (!response.ok) return { ok: false, message: `图片请求失败：${response.status}` };

    const contentType = imageContentType(response.headers.get('content-type'));
    if (!contentType) return { ok: false, message: '响应不是图片' };

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_ARTICLE_IMAGE_BYTES) {
      return { ok: false, message: '图片超过保存上限' };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_ARTICLE_IMAGE_BYTES) {
      return { ok: false, message: '图片超过保存上限' };
    }

    return {
      ok: true,
      contentType,
      bytes: buffer.byteLength,
      dataUrl: `data:${contentType};base64,${arrayBufferToBase64(buffer)}`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function imageContentType(value: string | null) {
  const contentType = value?.split(';')[0]?.trim().toLowerCase();
  return contentType?.startsWith('image/') ? contentType : '';
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
