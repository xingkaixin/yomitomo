import { S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { R2ObjectStore, r2ClientConfiguration } from './r2-object-store.ts';

const environment = {
  CLOUDFLARE_ACCOUNT_ID: 'account',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-key',
};

describe('R2 object store', () => {
  it('serializes an immutable PutObject without an automatic checksum trailer', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yomitomo-r2-test-'));
    const filePath = join(temporaryDirectory, 'asset');
    await writeFile(filePath, 'asset');
    const requests: unknown[] = [];
    const client = testClient(async (request) => {
      requests.push(request);
      return httpResponse(200);
    });
    const store = new R2ObjectStore(client, 'model-assets');

    try {
      await expect(
        store.create({
          key: 'release/asset',
          filePath,
          sizeBytes: 5,
          sha256: 'a'.repeat(64),
          md5Base64: createHash('md5').update('asset').digest('base64'),
          contentType: 'application/octet-stream',
          cacheControl: 'public, max-age=31536000, immutable',
        }),
      ).resolves.toBe('created');
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }

    const headers = requestHeaders(requests[0]);
    expect(headers['if-none-match']).toBe('*');
    expect(headers['content-length']).toBe('5');
    expect(headers['content-md5']).toBe(createHash('md5').update('asset').digest('base64'));
    expect(headers['content-type']).toBe('application/octet-stream');
    expect(headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(headers['x-amz-meta-sha256']).toBe('a'.repeat(64));
    expect(headers['content-encoding']).toBeUndefined();
    expect(headers['x-amz-sdk-checksum-algorithm']).toBeUndefined();
  });

  it('maps only precondition failures to an existing object', async () => {
    const store = new R2ObjectStore(
      testClient(async () => httpResponse(412, 'PreconditionFailed')),
      'model-assets',
    );

    await expect(
      store.create({
        key: 'release/asset',
        filePath: new URL(import.meta.url).pathname,
        sizeBytes: 0,
        sha256: 'a'.repeat(64),
        md5Base64: createHash('md5').digest('base64'),
        contentType: 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
      }),
    ).resolves.toBe('exists');
  });

  it('maps a missing HEAD to null and propagates other storage failures', async () => {
    const missing = new R2ObjectStore(
      testClient(async () => httpResponse(404, 'NoSuchKey')),
      'model-assets',
    );
    const failed = new R2ObjectStore(
      testClient(async () => httpResponse(500, 'InternalError')),
      'model-assets',
    );

    await expect(missing.inspect('release/missing')).resolves.toBeNull();
    await expect(failed.inspect('release/asset')).rejects.toThrow();
  });
});

function testClient(handle: (request: unknown) => Promise<{ response: HttpResponseShape }>) {
  return new S3Client({
    ...r2ClientConfiguration(environment),
    requestHandler: {
      async handle(request: unknown) {
        await consumeRequestBody(request);
        return handle(request);
      },
    },
  });
}

function httpResponse(statusCode: number, errorCode?: string) {
  const body = errorCode
    ? Readable.from([`<Error><Code>${errorCode}</Code><Message>${errorCode}</Message></Error>`])
    : Readable.from([]);
  return {
    response: {
      statusCode,
      headers: { 'content-type': 'application/xml' },
      body,
    },
  };
}

type HttpResponseShape = {
  statusCode: number;
  headers: Record<string, string>;
  body: Readable;
};

function requestHeaders(request: unknown) {
  if (!request || typeof request !== 'object' || !('headers' in request)) {
    throw new Error('Expected an HTTP request');
  }
  return request.headers as Record<string, string>;
}

async function consumeRequestBody(request: unknown) {
  if (!request || typeof request !== 'object' || !('body' in request)) return;
  const body = request.body;
  if (!body || typeof body !== 'object' || !(Symbol.asyncIterator in body)) return;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    void chunk;
  }
}
