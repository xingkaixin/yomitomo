import { describe, expect, it } from 'vitest';
import { githubReleaseUrl, handleRequest } from './index';

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

  it('rejects unsupported paths before proxying', async () => {
    const response = await handleRequest(new Request('https://download.yomitomo.app/package.json'));

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
