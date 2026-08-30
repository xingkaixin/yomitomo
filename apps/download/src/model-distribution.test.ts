import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import releaseManifest from '../model-releases/reading-memory-embedding-v1/manifest.json';
import releaseIntegrity from '../model-releases/reading-memory-embedding-v1/release-integrity.json';
import { isModelDistributionPath, modelDistributionResponse } from './model-distribution';

const asset = releaseManifest.artifact.files[0];
const assetUrl = asset.url;
const assetKey = new URL(assetUrl).pathname.slice('/models/'.length);
const content = new TextEncoder().encode('0123456789'.repeat(177).slice(0, asset.sizeBytes));

describe('model distribution', () => {
  it('streams an allowlisted object with immutable metadata', async () => {
    const { bucket, get } = modelBucket(content);

    const response = await modelDistributionResponse(new Request(assetUrl), bucket);

    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(asset.sizeBytes);
    expect(response.headers.get('content-length')).toBe(String(asset.sizeBytes));
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('etag')).toBe('"model-etag"');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(get).toHaveBeenCalledOnce();
  });

  it('returns object metadata without a body for HEAD', async () => {
    const { bucket, get, head } = modelBucket(content);

    const response = await modelDistributionResponse(
      new Request(assetUrl, { method: 'HEAD' }),
      bucket,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('content-length')).toBe(String(asset.sizeBytes));
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(head).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();
  });

  it('serves only the checked version manifest', async () => {
    const manifestBytes = await readFile(
      new URL('../model-releases/reading-memory-embedding-v1/manifest.json', import.meta.url),
    );
    const { bucket } = modelBucket(
      manifestBytes,
      releaseIntegrity.manifest.sha256,
      'application/json; charset=utf-8',
      `${releaseManifest.internalId}/manifest.json`,
    );

    const response = await modelDistributionResponse(
      new Request(
        `https://download.yomitomo.app/models/${releaseManifest.internalId}/manifest.json`,
      ),
      bucket,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await response.json()).toEqual(releaseManifest);
  });

  it('rejects a version manifest whose published digest metadata does not match', async () => {
    const manifestBytes = await readFile(
      new URL('../model-releases/reading-memory-embedding-v1/manifest.json', import.meta.url),
    );
    const { bucket } = modelBucket(
      manifestBytes,
      '0'.repeat(64),
      'application/json; charset=utf-8',
      `${releaseManifest.internalId}/manifest.json`,
    );

    const response = await modelDistributionResponse(
      new Request(
        `https://download.yomitomo.app/models/${releaseManifest.internalId}/manifest.json`,
      ),
      bucket,
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('maps an allowlisted legal file to its exact object key', async () => {
    const legalFile = releaseManifest.legal.files[0];
    const expectedKey = new URL(legalFile.url).pathname.slice('/models/'.length);
    const { bucket } = modelBucket(
      new Uint8Array(legalFile.sizeBytes),
      legalFile.sha256,
      'text/plain; charset=utf-8',
      expectedKey,
    );

    const response = await modelDistributionResponse(new Request(legalFile.url), bucket);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  it.each([
    ['closed', 'bytes=2-5', '2345', `bytes 2-5/${asset.sizeBytes}`],
    ['open', 'bytes=1761-', '1234', `bytes 1761-1764/${asset.sizeBytes}`],
    ['suffix', 'bytes=-3', '234', `bytes 1762-1764/${asset.sizeBytes}`],
  ])('serves a %s single byte range', async (_name, range, expected, contentRange) => {
    const { bucket, get } = modelBucket(content);

    const response = await modelDistributionResponse(
      new Request(assetUrl, { headers: { Range: range } }),
      bucket,
    );

    expect(response.status).toBe(206);
    expect(await response.text()).toBe(expected);
    expect(response.headers.get('content-range')).toBe(contentRange);
    expect(response.headers.get('content-length')).toBe(String(expected.length));
    expect(get).toHaveBeenCalledOnce();
  });

  it.each(['bytes=1765-', 'bytes=5-4', 'bytes=0-1,3-4', 'bytes=-0', 'bytes=9007199254740992-'])(
    'rejects an invalid range without reading an object: %s',
    async (range) => {
      const { bucket, get } = modelBucket(content);

      const response = await modelDistributionResponse(
        new Request(assetUrl, { headers: { Range: range } }),
        bucket,
      );

      expect(response.status).toBe(416);
      expect(response.headers.get('content-range')).toBe(`bytes */${asset.sizeBytes}`);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(get).not.toHaveBeenCalled();
    },
  );

  it('does not expose unlisted model keys', async () => {
    const { bucket, get, head } = modelBucket(content);
    const response = await modelDistributionResponse(
      new Request(
        'https://download.yomitomo.app/models/reading-memory-embedding-v1/objects/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/secret',
      ),
      bucket,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(get).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
  });

  it('does not cache missing objects or storage failures', async () => {
    const missingBucket = {
      get: vi.fn().mockResolvedValue(null),
      head: vi.fn().mockResolvedValue(null),
    };

    const missing = await modelDistributionResponse(new Request(assetUrl), missingBucket);
    const unavailable = await modelDistributionResponse(new Request(assetUrl), undefined);

    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('cache-control')).toBe('no-store');
  });

  it('does not cache an R2 failure as a model response', async () => {
    const failedBucket = {
      get: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
      head: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
    };

    const response = await modelDistributionResponse(new Request(assetUrl), failedBucket);

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects an object whose published digest metadata does not match', async () => {
    const { bucket } = modelBucket(content, '0'.repeat(64));

    const response = await modelDistributionResponse(new Request(assetUrl), bucket);

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('recognizes only the model distribution namespace', () => {
    expect(isModelDistributionPath('/models/reading-memory-embedding-v1/manifest.json')).toBe(true);
    expect(isModelDistributionPath('/updates/latest.yml')).toBe(false);
  });
});

function modelBucket(
  bytes: Uint8Array,
  sha256 = asset.sha256,
  contentType = 'application/octet-stream',
  expectedKey = assetKey,
) {
  const head = vi.fn(async (key: string) => {
    expect(key).toBe(expectedKey);
    return modelObject(bytes, bytes.length, sha256, contentType);
  });
  const get = vi.fn(async (key: string, options?: R2GetOptions) => {
    expect(key).toBe(expectedKey);
    if (!options?.range || !('offset' in options.range)) {
      return modelObject(bytes, bytes.length, sha256, contentType);
    }
    const offset = options.range.offset || 0;
    const length = options.range.length || bytes.length - offset;
    return modelObject(bytes.slice(offset, offset + length), bytes.length, sha256, contentType, {
      offset,
      length,
    });
  });

  return {
    bucket: { get, head },
    get,
    head,
  };
}

function modelObject(
  bytes: Uint8Array,
  size: number,
  sha256: string,
  contentType: string,
  range?: R2Range,
) {
  const body = new Blob([bytes]).stream();
  return {
    key: 'reading-memory-embedding-v1/object',
    version: '1',
    size,
    etag: 'model-etag',
    httpEtag: '"model-etag"',
    checksums: { toJSON: () => ({}) },
    uploaded: new Date('2026-08-30T00:00:00.000Z'),
    httpMetadata: { contentType },
    customMetadata: { sha256 },
    range,
    storageClass: 'Standard',
    body,
    bodyUsed: false,
    writeHttpMetadata(headers: Headers) {
      headers.set('Content-Type', contentType);
    },
  } as unknown as R2ObjectBody;
}
