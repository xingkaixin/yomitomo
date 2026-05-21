const GITHUB_RELEASES_ORIGIN = 'https://github.com/xingkaixin/yomitomo';

const releaseAssetPathPattern =
  /^\/releases\/download\/v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\/Yomitomo-\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?-(?:mac-arm64|win-x64)\.(?:dmg|zip|exe)(?:\.blockmap)?$/;
const latestManifestPathPattern = /^\/latest(?:-mac)?\.yml$/;

const notFound = () => new Response('Not found', { status: 404 });
const methodNotAllowed = () =>
  new Response('Method not allowed', {
    status: 405,
    headers: { Allow: 'GET, HEAD' },
  });

export default {
  fetch(request: Request) {
    return handleRequest(request);
  },
} satisfies ExportedHandler;

export function handleRequest(request: Request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed();

  const requestUrl = new URL(request.url);
  const upstreamUrl = githubReleaseUrl(requestUrl);
  if (!upstreamUrl) return notFound();

  return fetch(upstreamRequest(upstreamUrl, request), {
    redirect: 'follow',
    cf: cachePolicy(requestUrl.pathname),
  });
}

export function githubReleaseUrl(url: URL) {
  if (releaseAssetPathPattern.test(url.pathname)) {
    return new URL(`${GITHUB_RELEASES_ORIGIN}${url.pathname}`);
  }

  if (latestManifestPathPattern.test(url.pathname)) {
    return new URL(
      `/xingkaixin/yomitomo/releases/latest/download${url.pathname}`,
      'https://github.com',
    );
  }

  return null;
}

function upstreamRequest(url: URL, request: Request) {
  const headers = new Headers(request.headers);
  headers.delete('authorization');
  headers.delete('cookie');
  headers.delete('host');

  return new Request(url, {
    method: request.method,
    headers,
  });
}

function cachePolicy(pathname: string): RequestInitCfProperties {
  if (latestManifestPathPattern.test(pathname)) {
    return {
      cacheEverything: true,
      cacheTtlByStatus: {
        '200-299': 60,
        '300-399': 60,
        '400-499': 10,
        '500-599': 0,
      },
    };
  }

  return {
    cacheEverything: true,
    cacheTtlByStatus: {
      '200-299': 31536000,
      '300-399': 3600,
      '400-499': 10,
      '500-599': 0,
    },
  };
}
