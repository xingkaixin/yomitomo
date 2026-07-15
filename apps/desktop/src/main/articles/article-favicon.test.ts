import { afterEach, describe, expect, it, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]),
}));

vi.mock('node:dns/promises', () => ({
  lookup: dnsMocks.lookup,
}));

import { fetchFaviconDataUrl } from './article-favicon';

afterEach(() => {
  vi.restoreAllMocks();
  dnsMocks.lookup.mockReset();
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('fetchFaviconDataUrl', () => {
  it.each([
    'http://127.0.0.1/favicon.png',
    'http://169.254.169.254/latest/meta-data',
    'http://[fe80::1]/favicon.png',
  ])('blocks local network target %s before fetching', async (url) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(fetchFaviconDataUrl(url)).resolves.toBe('');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks hostnames that resolve to a private address', async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: '192.168.1.10', family: 4 }]);
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(fetchFaviconDataUrl('https://internal.example/favicon.png')).resolves.toBe('');

    expect(dnsMocks.lookup).toHaveBeenCalledWith('internal.example', {
      all: true,
      verbatim: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks a redirect to a local network target', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', {
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
        status: 302,
      }),
    );

    await expect(fetchFaviconDataUrl('https://example.com/favicon.png')).resolves.toBe('');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/favicon.png',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('allows local network targets when article import settings allow them', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        headers: { 'content-type': 'image/png' },
      }),
    );

    await expect(
      fetchFaviconDataUrl('http://127.0.0.1/favicon.png', {
        allowLocalNetworkArticleImport: true,
      }),
    ).resolves.toBe('data:image/png;base64,AQI=');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1/favicon.png',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('follows public redirects and caches a small image', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('', {
          headers: { location: '/favicon-final.png' },
          status: 302,
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/png; charset=binary' },
        }),
      );

    await expect(fetchFaviconDataUrl('https://example.com/favicon.png')).resolves.toBe(
      'data:image/png;base64,AQID',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/favicon-final.png',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('cancels an unknown-length response when it exceeds the byte limit', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(300 * 1024));
      },
      cancel,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { headers: { 'content-type': 'image/png' } }),
    );

    await expect(fetchFaviconDataUrl('https://example.com/stream.png')).resolves.toBe('');

    expect(cancel).toHaveBeenCalledWith('ARTICLE_FAVICON_RESPONSE_TOO_LARGE');
  });

  it('rejects a declared response over the byte limit without reading it', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, {
        headers: {
          'content-length': String(512 * 1024 + 1),
          'content-type': 'image/png',
        },
      }),
    );

    await expect(fetchFaviconDataUrl('https://example.com/declared-large.png')).resolves.toBe('');

    expect(cancel).toHaveBeenCalled();
  });
});
