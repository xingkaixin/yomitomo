import { describe, expect, it, vi } from 'vitest';
import { githubReleaseUrl, handleRequest, parseDownloadRequest } from './index';

describe('download worker', () => {
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

  it('classifies update blockmap requests separately', () => {
    const downloadRequest = parseDownloadRequest(
      new URL(
        'https://download.yomitomo.app/updates/releases/download/v0.7.0/Yomitomo-0.7.0-mac-arm64.zip.blockmap',
      ),
    );

    expect(downloadRequest?.event).toMatchObject({
      eventType: 'update_blockmap_download',
      releaseVersion: '0.7.0',
      assetVersion: '0.7.0',
      platform: 'mac',
      arch: 'arm64',
      assetKind: 'blockmap',
      source: 'updater',
    });
  });

  it('classifies generic provider blockmap requests separately', () => {
    const downloadRequest = parseDownloadRequest(
      new URL('https://download.yomitomo.app/updates/Yomitomo-0.7.0-mac-arm64.zip.blockmap'),
    );

    expect(downloadRequest?.event).toMatchObject({
      eventType: 'update_blockmap_download',
      releaseVersion: '0.7.0',
      assetVersion: '0.7.0',
      platform: 'mac',
      arch: 'arm64',
      assetKind: 'blockmap',
      source: 'updater',
    });
  });

  it('records analytics for proxied requests when a binding is available', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    const writeDataPoint = vi.fn();

    const response = await handleRequest(
      new Request(
        'https://download.yomitomo.app/releases/download/v0.7.0/Yomitomo-0.7.0-mac-arm64.dmg',
      ),
      {
        DOWNLOAD_ANALYTICS: { writeDataPoint },
      },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: [
        'manual_download_asset',
        'GET',
        '/releases/download/v0.7.0/Yomitomo-0.7.0-mac-arm64.dmg',
        '0.7.0',
        '0.7.0',
        'mac',
        'arm64',
        'installer',
        'website',
        'unknown',
        'unknown',
      ],
      doubles: [200],
      indexes: ['website:mac:installer'],
    });

    fetchMock.mockRestore();
  });

  it('preserves HEAD requests when proxying', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));

    await handleRequest(
      new Request(
        'https://download.yomitomo.app/updates/releases/download/v0.7.0/Yomitomo-0.7.0-win-x64.exe',
        { method: 'HEAD' },
      ),
    );

    const upstreamRequest = fetchMock.mock.calls[0]?.[0];
    expect(upstreamRequest).toBeInstanceOf(Request);
    expect((upstreamRequest as Request).method).toBe('HEAD');

    fetchMock.mockRestore();
  });

  it('rejects unsupported paths before proxying', async () => {
    const response = await handleRequest(new Request('https://download.yomitomo.app/package.json'));

    expect(response.status).toBe(404);
  });

  it('does not expose analytics query endpoints', async () => {
    const response = await handleRequest(
      new Request('https://download.yomitomo.app/analytics/downloads.json'),
    );

    expect(response.status).toBe(404);
  });

  it('rejects non-download methods', async () => {
    const response = await handleRequest(
      new Request(
        'https://download.yomitomo.app/releases/download/v0.4.0/Yomitomo-0.4.0-win-x64.exe',
        { method: 'POST' },
      ),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});
