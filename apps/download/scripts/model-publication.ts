import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDigest, digestContent, digestFile } from './content-digest.ts';
import type { ReadingMemoryReleasePlan, ReleaseObjectSpec } from './model-release.ts';

const immutableCacheControl = 'public, max-age=31536000, immutable';

export type StoredObject = {
  sizeBytes: number;
  sha256?: string;
  contentType?: string;
  contentEncoding?: string;
};

export type ObjectCreation = {
  key: string;
  filePath: string;
  sizeBytes: number;
  sha256: string;
  md5Base64: string;
  contentType: string;
  cacheControl: string;
};

export interface ImmutableObjectStore {
  inspect(key: string): Promise<StoredObject | null>;
  create(input: ObjectCreation): Promise<'created' | 'exists'>;
  read(key: string): Promise<AsyncIterable<Uint8Array>>;
}

export type PublicationResult = {
  created: number;
  verified: number;
};

type PreparedObject = {
  spec: ReleaseObjectSpec;
  filePath: string;
  md5Base64: string;
};

type PublicationOptions = {
  fetch?: typeof globalThis.fetch;
  temporaryDirectory?: string;
};

export async function publishReadingMemoryModel(
  plan: ReadingMemoryReleasePlan,
  store: ImmutableObjectStore,
  options: PublicationOptions = {},
): Promise<PublicationResult> {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const temporaryDirectory = await mkdtemp(
    join(options.temporaryDirectory ?? tmpdir(), 'yomitomo-model-release-'),
  );

  try {
    const preparedObjects = await prepareObjects(
      [...plan.objects, plan.manifest],
      temporaryDirectory,
      fetchImplementation,
    );
    const preparedManifest = preparedObjects[preparedObjects.length - 1];
    if (!preparedManifest) throw new Error('The release plan does not contain a manifest');
    let created = 0;

    for (const object of preparedObjects.slice(0, -1)) {
      created += await ensureObject(store, object);
    }
    created += await ensureObject(store, preparedManifest);

    return { created, verified: preparedObjects.length };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function prepareObjects(
  specs: ReleaseObjectSpec[],
  temporaryDirectory: string,
  fetchImplementation: typeof globalThis.fetch,
) {
  const prepared: PreparedObject[] = [];
  for (const [index, spec] of specs.entries()) {
    const filePath = join(temporaryDirectory, `${String(index).padStart(2, '0')}.asset`);
    await stageSource(spec, filePath, fetchImplementation);
    const digest = await digestFile(filePath, spec.sizeBytes);
    assertDigest(spec.path, digest, spec);
    prepared.push({ spec, filePath, md5Base64: digest.md5Base64 });
  }
  return prepared;
}

async function stageSource(
  spec: ReleaseObjectSpec,
  filePath: string,
  fetchImplementation: typeof globalThis.fetch,
) {
  if (spec.source.type === 'local') {
    await writeChunks(filePath, createReadStream(spec.source.filePath), spec.sizeBytes);
    return;
  }
  if (spec.source.type === 'bytes') {
    await writeChunks(filePath, [spec.source.bytes], spec.sizeBytes);
    return;
  }

  const response = await fetchImplementation(spec.source.url, {
    headers: { 'Accept-Encoding': 'identity' },
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Unable to download ${spec.path}: HTTP ${response.status}`);
  }
  const contentLength = response.headers.get('content-length');
  const contentEncoding = response.headers.get('content-encoding');
  if (
    (!contentEncoding || contentEncoding === 'identity') &&
    contentLength !== null &&
    safeSize(contentLength) !== spec.sizeBytes
  ) {
    await response.body.cancel();
    throw new Error(`${spec.path} source Content-Length does not match the release contract`);
  }
  await writeChunks(filePath, response.body as AsyncIterable<Uint8Array>, spec.sizeBytes);
}

async function writeChunks(
  filePath: string,
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  maximumSizeBytes: number,
) {
  const file = await open(filePath, 'wx');
  let sizeBytes = 0;
  try {
    for await (const chunk of chunks) {
      const bytes = Buffer.from(chunk);
      sizeBytes += bytes.byteLength;
      if (sizeBytes > maximumSizeBytes) throw new Error('Content exceeds the expected size');
      let written = 0;
      while (written < bytes.byteLength) {
        const result = await file.write(bytes.subarray(written));
        if (result.bytesWritten === 0) throw new Error('Unable to stage release content');
        written += result.bytesWritten;
      }
    }
  } finally {
    await file.close();
  }
}

async function ensureObject(store: ImmutableObjectStore, object: PreparedObject) {
  const { spec } = object;
  const existing = await store.inspect(spec.key);
  if (existing) {
    await verifyObject(store, spec, existing);
    return 0;
  }

  const creation = await store.create({
    key: spec.key,
    filePath: object.filePath,
    sizeBytes: spec.sizeBytes,
    sha256: spec.sha256,
    md5Base64: object.md5Base64,
    contentType: spec.contentType,
    cacheControl: immutableCacheControl,
  });

  const stored = await store.inspect(spec.key);
  if (!stored) throw new Error(`${spec.path} was not visible after creation`);
  await verifyObject(store, spec, stored);
  return creation === 'created' ? 1 : 0;
}

async function verifyObject(
  store: ImmutableObjectStore,
  spec: ReleaseObjectSpec,
  stored: StoredObject,
) {
  if (stored.sizeBytes !== spec.sizeBytes) {
    throw new Error(`${spec.path} stored size does not match the release contract`);
  }
  if (stored.sha256 !== spec.sha256) {
    throw new Error(`${spec.path} stored SHA-256 metadata does not match the release contract`);
  }
  if (stored.contentType !== spec.contentType) {
    throw new Error(`${spec.path} stored content type does not match the release contract`);
  }
  if (stored.contentEncoding) {
    throw new Error(`${spec.path} stored content encoding does not match the release contract`);
  }
  const digest = await digestContent(await store.read(spec.key), spec.sizeBytes);
  assertDigest(`${spec.path} stored content`, digest, spec);
}

function safeSize(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const size = Number(value);
  return Number.isSafeInteger(size) ? size : null;
}
