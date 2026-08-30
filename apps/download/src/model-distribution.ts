import releaseManifest from '../model-releases/reading-memory-embedding-v1/manifest.json';
import releaseIntegrity from '../model-releases/reading-memory-embedding-v1/release-integrity.json';

const modelPathPrefix = '/models/';
const immutableCacheControl = 'public, max-age=31536000, immutable';
const errorHeaders = { 'Cache-Control': 'no-store' };

export type ModelAssetBucket = Pick<R2Bucket, 'get' | 'head'>;

type ModelObjectTarget = {
  key: string;
  sizeBytes: number;
  sha256: string;
};

const modelObjectTargets = new Map<string, ModelObjectTarget>([
  [
    `${modelPathPrefix}${releaseManifest.internalId}/manifest.json`,
    {
      key: `${releaseManifest.internalId}/manifest.json`,
      sizeBytes: releaseIntegrity.manifest.sizeBytes,
      sha256: releaseIntegrity.manifest.sha256,
    },
  ],
  ...[...releaseManifest.artifact.files, ...releaseManifest.legal.files].map(
    (file) =>
      [
        new URL(file.url).pathname,
        { key: objectKey(file.url), sizeBytes: file.sizeBytes, sha256: file.sha256 },
      ] as const,
  ),
]);

export function isModelDistributionPath(pathname: string) {
  return pathname.startsWith(modelPathPrefix);
}

export async function modelDistributionResponse(
  request: Request,
  bucket: ModelAssetBucket | undefined,
) {
  const target = modelObjectTargets.get(new URL(request.url).pathname);
  if (!target) return modelError('Not found', 404);
  if (!bucket) return modelError('Model storage unavailable', 503);

  try {
    if (request.method === 'HEAD') return await headResponse(bucket, target);

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) return await rangeResponse(bucket, target, rangeHeader);

    const object = await bucket.get(target.key);
    if (!object) return modelError('Not found', 404);
    if (!hasExpectedMetadata(object, target)) return integrityError();
    return objectResponse(object, 200, object.size, object.body);
  } catch {
    return modelError('Model storage unavailable', 503);
  }
}

async function headResponse(bucket: ModelAssetBucket, target: ModelObjectTarget) {
  const object = await bucket.head(target.key);
  if (!object) return modelError('Not found', 404);
  if (!hasExpectedMetadata(object, target)) return integrityError();
  return objectResponse(object, 200, object.size, null);
}

async function rangeResponse(bucket: ModelAssetBucket, target: ModelObjectTarget, header: string) {
  const metadata = await bucket.head(target.key);
  if (!metadata) return modelError('Not found', 404);
  if (!hasExpectedMetadata(metadata, target)) return integrityError();

  const range = parseByteRange(header, metadata.size);
  if (!range) {
    return modelError('Range not satisfiable', 416, {
      'Content-Range': `bytes */${metadata.size}`,
    });
  }

  const object = await bucket.get(target.key, {
    range: { offset: range.offset, length: range.length },
  });
  if (!object) return modelError('Not found', 404);
  if (!hasExpectedMetadata(object, target)) return integrityError();

  return objectResponse(object, 206, range.length, object.body, {
    'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`,
  });
}

function objectResponse(
  object: R2Object,
  status: number,
  contentLength: number,
  body: BodyInit | null,
  extraHeaders: HeadersInit = {},
) {
  const headers = new Headers(extraHeaders);
  object.writeHttpMetadata(headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', immutableCacheControl);
  headers.set('Content-Length', String(contentLength));
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(body, { status, headers });
}

function modelError(message: string, status: number, headers: HeadersInit = {}) {
  return new Response(message, {
    status,
    headers: { ...errorHeaders, ...Object.fromEntries(new Headers(headers)) },
  });
}

function integrityError() {
  return modelError('Model object failed integrity check', 502);
}

function hasExpectedMetadata(object: R2Object, target: ModelObjectTarget) {
  return object.size === target.sizeBytes && object.customMetadata?.sha256 === target.sha256;
}

function parseByteRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || size <= 0) return null;

  const startText = match[1] || '';
  const endText = match[2] || '';
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = safeInteger(endText);
    if (!suffixLength || suffixLength <= 0) return null;
    const length = Math.min(suffixLength, size);
    return { offset: size - length, length };
  }

  const offset = safeInteger(startText);
  if (offset === null || offset >= size) return null;
  if (!endText) return { offset, length: size - offset };

  const requestedEnd = safeInteger(endText);
  if (requestedEnd === null || requestedEnd < offset) return null;
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1 };
}

function safeInteger(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function objectKey(url: string) {
  const objectUrl = new URL(url);
  const expectedPathPrefix = `${modelPathPrefix}${releaseManifest.internalId}/objects/sha256/`;
  if (
    objectUrl.origin !== 'https://download.yomitomo.app' ||
    !objectUrl.pathname.startsWith(expectedPathPrefix)
  ) {
    throw new Error(`Invalid model distribution URL: ${url}`);
  }
  const { pathname } = objectUrl;
  return pathname.slice(modelPathPrefix.length);
}
