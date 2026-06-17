const GITHUB_RELEASES_ORIGIN = 'https://github.com/xingkaixin/yomitomo';

const versionSegment = String.raw`\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?`;
const releaseAssetPathPattern = new RegExp(
  String.raw`^/(?<prefix>updates/)?releases/download/v(?<releaseVersion>${versionSegment})/Yomitomo-(?<assetVersion>${versionSegment})-(?<platform>mac|win)-(?<arch>arm64|x64)\.(?<extension>dmg|zip|exe)(?<blockmap>\.blockmap)?$`,
);
const updateAssetPathPattern = new RegExp(
  String.raw`^/updates/(?<filename>Yomitomo-(?<assetVersion>${versionSegment})-(?<platform>mac|win)-(?<arch>arm64|x64)\.(?<extension>dmg|zip|exe)(?<blockmap>\.blockmap)?)$`,
);
const latestManifestPathPattern = /^\/latest(?:-mac)?\.yml$/;
const updateManifestPathPattern = /^\/updates\/latest(?:-mac)?\.yml$/;

type Env = {
  DOWNLOAD_ANALYTICS?: AnalyticsEngineDataset;
};

type AssetSource = 'website' | 'updater';
type AssetKind = 'manifest' | 'installer' | 'zip' | 'blockmap';
type DownloadEventType =
  | 'manual_download_asset'
  | 'update_manifest_check'
  | 'update_asset_download'
  | 'update_blockmap_download';

type DownloadRequest = {
  upstreamUrl: URL;
  event: {
    eventType: DownloadEventType;
    releaseVersion: string;
    assetVersion: string;
    platform: 'mac' | 'windows' | 'unknown';
    arch: 'arm64' | 'x64' | 'unknown';
    assetKind: AssetKind;
    source: AssetSource;
  };
};

const notFound = () => new Response('Not found', { status: 404 });
const methodNotAllowed = () =>
  new Response('Method not allowed', {
    status: 405,
    headers: { Allow: 'GET, HEAD' },
  });

export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;

export async function handleRequest(request: Request, env: Env = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed();

  const requestUrl = new URL(request.url);
  const downloadRequest = parseDownloadRequest(requestUrl);
  if (!downloadRequest) return notFound();

  const response = await fetch(upstreamRequest(downloadRequest.upstreamUrl, request), {
    redirect: 'follow',
    cf: cachePolicy(requestUrl.pathname),
  });
  recordDownloadEvent(env, request, requestUrl, response, downloadRequest.event);
  return response;
}

export function githubReleaseUrl(url: URL) {
  return parseDownloadRequest(url)?.upstreamUrl || null;
}

export function parseDownloadRequest(url: URL): DownloadRequest | null {
  const releaseAsset = releaseAssetPathPattern.exec(url.pathname);
  if (releaseAsset?.groups) return releaseAssetRequest(url.pathname, releaseAsset.groups);

  const updateAsset = updateAssetPathPattern.exec(url.pathname);
  if (updateAsset?.groups) return flatUpdateAssetRequest(updateAsset.groups);

  if (latestManifestPathPattern.test(url.pathname)) {
    return manifestRequest(url.pathname);
  }

  if (updateManifestPathPattern.test(url.pathname)) {
    return manifestRequest(url.pathname.replace('/updates', ''));
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
  if (latestManifestPathPattern.test(pathname) || updateManifestPathPattern.test(pathname)) {
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

function releaseAssetRequest(pathname: string, groups: Record<string, string | undefined>) {
  const source: AssetSource = groups.prefix ? 'updater' : 'website';
  const upstreamPath = source === 'updater' ? pathname.replace('/updates', '') : pathname;
  const extension = groups.extension || '';
  const isBlockmap = groups.blockmap === '.blockmap';
  const assetKind = isBlockmap ? 'blockmap' : extension === 'zip' ? 'zip' : 'installer';

  return {
    upstreamUrl: new URL(`${GITHUB_RELEASES_ORIGIN}${upstreamPath}`),
    event: {
      eventType: releaseAssetEventType(source, assetKind),
      releaseVersion: groups.releaseVersion || 'unknown',
      assetVersion: groups.assetVersion || 'unknown',
      platform: platformName(groups.platform),
      arch: archName(groups.arch),
      assetKind,
      source,
    },
  } satisfies DownloadRequest;
}

function flatUpdateAssetRequest(groups: Record<string, string | undefined>) {
  const assetVersion = groups.assetVersion || 'unknown';
  const filename = groups.filename || '';
  const extension = groups.extension || '';
  const isBlockmap = groups.blockmap === '.blockmap';
  const assetKind = isBlockmap ? 'blockmap' : extension === 'zip' ? 'zip' : 'installer';

  return {
    upstreamUrl: new URL(
      `${GITHUB_RELEASES_ORIGIN}/releases/download/v${assetVersion}/${filename}`,
    ),
    event: {
      eventType: releaseAssetEventType('updater', assetKind),
      releaseVersion: assetVersion,
      assetVersion,
      platform: platformName(groups.platform),
      arch: archName(groups.arch),
      assetKind,
      source: 'updater',
    },
  } satisfies DownloadRequest;
}

function manifestRequest(pathname: string) {
  return {
    upstreamUrl: new URL(
      `/xingkaixin/yomitomo/releases/latest/download${pathname}`,
      'https://github.com',
    ),
    event: {
      eventType: 'update_manifest_check',
      releaseVersion: 'latest',
      assetVersion: 'latest',
      platform: pathname === '/latest-mac.yml' ? 'mac' : 'windows',
      arch: 'unknown',
      assetKind: 'manifest',
      source: 'updater',
    },
  } satisfies DownloadRequest;
}

function releaseAssetEventType(source: AssetSource, assetKind: AssetKind): DownloadEventType {
  if (source === 'website') return 'manual_download_asset';
  return assetKind === 'blockmap' ? 'update_blockmap_download' : 'update_asset_download';
}

function platformName(platform: string | undefined) {
  if (platform === 'mac') return 'mac';
  if (platform === 'win') return 'windows';
  return 'unknown';
}

function archName(arch: string | undefined) {
  if (arch === 'arm64' || arch === 'x64') return arch;
  return 'unknown';
}

function recordDownloadEvent(
  env: Env,
  request: Request,
  url: URL,
  response: Response,
  event: DownloadRequest['event'],
) {
  env.DOWNLOAD_ANALYTICS?.writeDataPoint({
    blobs: [
      event.eventType,
      request.method,
      url.pathname,
      event.releaseVersion,
      event.assetVersion,
      event.platform,
      event.arch,
      event.assetKind,
      event.source,
      cfString(request.cf?.country),
      cfString(request.cf?.colo),
    ],
    doubles: [response.status],
    indexes: [`${event.source}:${event.platform}:${event.assetKind}`],
  });
}

function cfString(value: unknown) {
  return typeof value === 'string' && value ? value : 'unknown';
}
