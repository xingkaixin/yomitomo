import { describe, expect, it, vi } from 'vitest';
import { handleRequest, parseDownloadRequest } from './index';

describe('download worker', () => {
  it('serves the Sparkle feed from R2 with a short cache lifetime', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('feed'));
    try {
      const url = new URL('https://download.yomitomo.app/updates/appcast-mac-arm64.xml');
      const parsed = parseDownloadRequest(url);
      expect(parsed?.upstreamUrl.href).toBe(
        'https://r2.xingkaixin.me/yomitomo/latest/appcast-mac-arm64.xml',
      );
      expect(parsed?.fallbackUrl.href).toBe(
        'https://github.com/xingkaixin/yomitomo/releases/latest/download/appcast-mac-arm64.xml',
      );
      await handleRequest(new Request(url));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const upstream = fetchMock.mock.calls[0]?.[0] as Request;
      expect(upstream.url).toBe('https://r2.xingkaixin.me/yomitomo/latest/appcast-mac-arm64.xml');
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        cf: { cacheTtlByStatus: { '200-299': 60 } },
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('maps Sparkle deltas to R2 and preserves range requests', async () => {
    const url = new URL(
      'https://download.yomitomo.app/updates/releases/download/v0.16.0/Yomitomo0.16.0-0.15.2.delta',
    );
    const request = parseDownloadRequest(url);
    expect(request?.upstreamUrl.href).toBe(
      'https://r2.xingkaixin.me/yomitomo/releases/v0.16.0/Yomitomo0.16.0-0.15.2.delta',
    );
    expect(request?.fallbackUrl.href).toBe(
      'https://github.com/xingkaixin/yomitomo/releases/download/v0.16.0/Yomitomo0.16.0-0.15.2.delta',
    );
    expect(request?.event).toMatchObject({
      platform: 'mac',
      arch: 'arm64',
      assetKind: 'delta',
      source: 'updater',
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 206 }));
    try {
      await handleRequest(new Request(url, { headers: { Range: 'bytes=0-99' } }));
      const upstream = fetchMock.mock.calls[0]?.[0] as Request;
      expect(upstream.url).toBe(
        'https://r2.xingkaixin.me/yomitomo/releases/v0.16.0/Yomitomo0.16.0-0.15.2.delta',
      );
      expect(upstream.headers.get('range')).toBe('bytes=0-99');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('falls back to GitHub Releases when R2 misses an archived version or fails', async () => {
    const url = new URL(
      'https://download.yomitomo.app/releases/download/v0.4.0/Yomitomo-0.4.0-mac-arm64.dmg',
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('installer', { status: 200 }));
    try {
      const response = await handleRequest(new Request(url, { headers: { Range: 'bytes=0-99' } }));
      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const primary = fetchMock.mock.calls[0]?.[0] as Request;
      expect(primary.url).toBe(
        'https://r2.xingkaixin.me/yomitomo/releases/v0.4.0/Yomitomo-0.4.0-mac-arm64.dmg',
      );
      const fallback = fetchMock.mock.calls[1]?.[0] as Request;
      expect(fallback.url).toBe(
        'https://github.com/xingkaixin/yomitomo/releases/download/v0.4.0/Yomitomo-0.4.0-mac-arm64.dmg',
      );
      expect(fallback.headers.get('range')).toBe('bytes=0-99');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('maps latest manifests and update assets to R2 with GitHub fallbacks', () => {
    expect(
      parseDownloadRequest(new URL('https://download.yomitomo.app/latest-mac.yml'))?.upstreamUrl
        .href,
    ).toBe('https://r2.xingkaixin.me/yomitomo/latest/latest-mac.yml');

    expect(
      parseDownloadRequest(new URL('https://download.yomitomo.app/updates/latest-mac.yml'))
        ?.upstreamUrl.href,
    ).toBe('https://r2.xingkaixin.me/yomitomo/latest/latest-mac.yml');

    expect(
      parseDownloadRequest(
        new URL(
          'https://download.yomitomo.app/updates/releases/download/v0.7.0/Yomitomo-0.7.0-win-x64.exe',
        ),
      )?.upstreamUrl.href,
    ).toBe('https://r2.xingkaixin.me/yomitomo/releases/v0.7.0/Yomitomo-0.7.0-win-x64.exe');

    expect(
      parseDownloadRequest(
        new URL('https://download.yomitomo.app/updates/Yomitomo-0.7.0-mac-arm64.zip'),
      )?.upstreamUrl.href,
    ).toBe('https://r2.xingkaixin.me/yomitomo/releases/v0.7.0/Yomitomo-0.7.0-mac-arm64.zip');
  });

  it('rejects unsupported paths before proxying', async () => {
    const response = await handleRequest(new Request('https://download.yomitomo.app/package.json'));

    expect(response.status).toBe(404);
  });
});
