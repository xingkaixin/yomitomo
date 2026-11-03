import { describe, expect, it, vi } from 'vitest';
import { githubReleaseUrl, handleRequest, parseDownloadRequest } from './index';

describe('download worker', () => {
  it('serves the Sparkle feed with a short cache lifetime', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('feed'));
    try {
      const url = new URL('https://download.yomitomo.app/updates/appcast-mac-arm64.xml');
      expect(githubReleaseUrl(url)?.href).toBe(
        'https://github.com/xingkaixin/yomitomo/releases/latest/download/appcast-mac-arm64.xml',
      );
      await handleRequest(new Request(url));
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        cf: { cacheTtlByStatus: { '200-299': 60 } },
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('maps Sparkle deltas to their immutable release and preserves range requests', async () => {
    const url = new URL(
      'https://download.yomitomo.app/updates/releases/download/v0.16.0/Yomitomo0.16.0-0.15.2.delta',
    );
    const request = parseDownloadRequest(url);
    expect(request?.upstreamUrl.href).toBe(
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
      expect(upstream.headers.get('range')).toBe('bytes=0-99');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('maps versioned release assets to GitHub Releases', () => {
    const url = githubReleaseUrl(
      new URL(
        'https://download.yomitomo.app/releases/download/v0.4.0/Yomitomo-0.4.0-mac-arm64.dmg',
      ),
    );

    expect(url?.href).toBe(
      'https://github.com/xingkaixin/yomitomo/releases/download/v0.4.0/Yomitomo-0.4.0-mac-arm64.dmg',
    );
  });

  it('maps latest manifests through the latest release alias', () => {
    const url = githubReleaseUrl(new URL('https://download.yomitomo.app/latest-mac.yml'));

    expect(url?.href).toBe(
      'https://github.com/xingkaixin/yomitomo/releases/latest/download/latest-mac.yml',
    );
  });

  it('maps update manifests through the updates prefix', () => {
    const url = githubReleaseUrl(new URL('https://download.yomitomo.app/updates/latest-mac.yml'));

    expect(url?.href).toBe(
      'https://github.com/xingkaixin/yomitomo/releases/latest/download/latest-mac.yml',
    );
  });

  it('maps update assets to GitHub Releases without the updates prefix', () => {
    const url = githubReleaseUrl(
      new URL(
        'https://download.yomitomo.app/updates/releases/download/v0.7.0/Yomitomo-0.7.0-win-x64.exe',
      ),
    );

    expect(url?.href).toBe(
      'https://github.com/xingkaixin/yomitomo/releases/download/v0.7.0/Yomitomo-0.7.0-win-x64.exe',
    );
  });

  it('maps generic provider asset paths to GitHub Releases', () => {
    const url = githubReleaseUrl(
      new URL('https://download.yomitomo.app/updates/Yomitomo-0.7.0-mac-arm64.zip'),
    );

    expect(url?.href).toBe(
      'https://github.com/xingkaixin/yomitomo/releases/download/v0.7.0/Yomitomo-0.7.0-mac-arm64.zip',
    );
  });

  it('rejects unsupported paths before proxying', async () => {
    const response = await handleRequest(new Request('https://download.yomitomo.app/package.json'));

    expect(response.status).toBe(404);
  });
});
