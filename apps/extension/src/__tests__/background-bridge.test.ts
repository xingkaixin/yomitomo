import { describe, expect, it } from 'vitest';
import { articleImageFetchResponse, desktopMessageFromData } from '../background-bridge';

const imageFetch = async () =>
  new Response(new Uint8Array([1, 2, 3]), {
    headers: { 'content-type': 'image/png', 'content-length': '3' },
  });

const htmlFetch = async () =>
  new Response('html', {
    headers: { 'content-type': 'text/html' },
  });

describe('desktopMessageFromData', () => {
  it('wraps valid desktop messages for content scripts', () => {
    expect(desktopMessageFromData(JSON.stringify({ type: 'auth:result', ok: true }))).toEqual({
      type: 'desktop:message',
      message: { type: 'auth:result', ok: true },
    });
  });

  it('returns a structured bridge error for malformed desktop messages', () => {
    expect(desktopMessageFromData('{')).toEqual({
      type: 'desktop:error',
      message: '桌面端消息格式错误',
    });
  });
});

describe('articleImageFetchResponse', () => {
  it('returns a data url for small image responses', async () => {
    await expect(
      articleImageFetchResponse('https://example.com/image.png', imageFetch),
    ).resolves.toEqual({
      ok: true,
      contentType: 'image/png',
      bytes: 3,
      dataUrl: 'data:image/png;base64,AQID',
    });
  });

  it('rejects non-image responses', async () => {
    await expect(
      articleImageFetchResponse('https://example.com/image.png', htmlFetch),
    ).resolves.toEqual({
      ok: false,
      message: '响应不是图片',
    });
  });
});
