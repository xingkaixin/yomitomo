import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export type ContentDigest = {
  sizeBytes: number;
  sha256: string;
  md5Base64: string;
};

export async function digestContent(
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  maximumSizeBytes = Number.MAX_SAFE_INTEGER,
) {
  const sha256 = createHash('sha256');
  const md5 = createHash('md5');
  let sizeBytes = 0;

  for await (const chunk of chunks) {
    const bytes = Buffer.from(chunk);
    sizeBytes += bytes.byteLength;
    if (sizeBytes > maximumSizeBytes) throw new Error('Content exceeds the expected size');
    sha256.update(bytes);
    md5.update(bytes);
  }

  return {
    sizeBytes,
    sha256: sha256.digest('hex'),
    md5Base64: md5.digest('base64'),
  } satisfies ContentDigest;
}

export function digestBytes(bytes: Uint8Array) {
  return {
    sizeBytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    md5Base64: createHash('md5').update(bytes).digest('base64'),
  } satisfies ContentDigest;
}

export function digestFile(filePath: string, maximumSizeBytes = Number.MAX_SAFE_INTEGER) {
  return digestContent(createReadStream(filePath), maximumSizeBytes);
}

export function assertDigest(
  label: string,
  actual: Pick<ContentDigest, 'sizeBytes' | 'sha256'>,
  expected: Pick<ContentDigest, 'sizeBytes' | 'sha256'>,
) {
  if (actual.sizeBytes !== expected.sizeBytes) {
    throw new Error(
      `${label} size mismatch: expected ${expected.sizeBytes}, received ${actual.sizeBytes}`,
    );
  }
  if (actual.sha256 !== expected.sha256) {
    throw new Error(
      `${label} SHA-256 mismatch: expected ${expected.sha256}, received ${actual.sha256}`,
    );
  }
}
