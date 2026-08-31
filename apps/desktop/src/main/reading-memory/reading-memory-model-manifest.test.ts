import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseReadingMemoryModelManifest,
  readingMemoryModelFiles,
  readingMemoryModelLegalContents,
  readingMemoryModelRelease,
  type ReadingMemoryModelFile,
} from './reading-memory-model-manifest';

const checkedManifestBytes = readFileSync(
  new URL('../../../model-releases/reading-memory-embedding-v1/manifest.json', import.meta.url),
);
const checkedManifest = parseReadingMemoryModelManifest(
  JSON.parse(checkedManifestBytes.toString('utf8')),
);

describe('reading memory model manifest', () => {
  it('pins the checked distribution manifest as the desktop trust anchor', () => {
    expect(checkedManifestBytes.byteLength).toBe(readingMemoryModelRelease.manifestSizeBytes);
    expect(createHash('sha256').update(checkedManifestBytes).digest('hex')).toBe(
      readingMemoryModelRelease.manifestSha256,
    );
    expect(checkedManifest.internalId).toBe(readingMemoryModelRelease.internalId);
    expect(checkedManifest.distributionDownloadSizeBytes).toBe(
      readingMemoryModelRelease.distributionDownloadSizeBytes,
    );
  });

  it('parses every fixed artifact and legal file', () => {
    expect(readingMemoryModelFiles(checkedManifest).map((file) => file.path)).toEqual([
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'onnx/model_q4.onnx',
      'onnx/model_q4.onnx_data',
      'NOTICE',
      'GEMMA_TERMS_OF_USE.txt',
      'MODIFICATIONS',
    ]);
    expect(checkedManifest.artifact.downloadSizeBytes).toBe(218_726_989);
    expect(checkedManifest.legal.downloadSizeBytes).toBe(9_470);
  });

  it('bundles the exact legal files and preserves the evaluated model artifacts', () => {
    for (const file of checkedManifest.legal.files) {
      const bytes = Buffer.from(readingMemoryModelLegalContents[file.path], 'utf8');
      expect(bytes.byteLength).toBe(file.sizeBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
    const selected = JSON.parse(
      readFileSync(
        new URL(
          '../../../../../packages/ai/evaluation/semantic-retrieval/selected-model-v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(checkedManifest.artifact.files).toEqual(
      selected.artifact.files.map(({ url: _url, ...file }: { url: string }) => file),
    );
    expect(checkedManifest.artifact.downloadSizeBytes).toBe(
      readingMemoryModelRelease.downloadSizeBytes,
    );
  });

  it('rejects unknown fields at every strict object level', () => {
    expect(() => parseReadingMemoryModelManifest({ ...checkedManifest, extra: true })).toThrow(
      'manifest must contain only',
    );
    expect(() =>
      parseReadingMemoryModelManifest({
        ...checkedManifest,
        runtime: { ...checkedManifest.runtime, extra: true },
      }),
    ).toThrow('runtime must contain only');
    expect(() => parseReadingMemoryModelManifest(withArtifactFile(0, { extra: true }))).toThrow(
      'artifact.files[0] must contain only',
    );
  });

  it.each([
    ['schema version', { ...checkedManifest, schemaVersion: 2 }],
    ['internal id', { ...checkedManifest, internalId: 'other-model' }],
    [
      'source revision',
      {
        ...checkedManifest,
        source: { ...checkedManifest.source, revision: '0'.repeat(40) },
      },
    ],
    [
      'artifact revision',
      {
        ...checkedManifest,
        artifact: { ...checkedManifest.artifact, revision: '0'.repeat(40) },
      },
    ],
    [
      'runtime backend',
      {
        ...checkedManifest,
        runtime: { ...checkedManifest.runtime, backend: 'onnxruntime-web' },
      },
    ],
    [
      'input token limit',
      {
        ...checkedManifest,
        input: { ...checkedManifest.input, maxTokens: 1_024 },
      },
    ],
    [
      'vector dimension',
      {
        ...checkedManifest,
        vector: { ...checkedManifest.vector, dimension: 384 },
      },
    ],
    [
      'supported platforms',
      {
        ...checkedManifest,
        supportedPlatforms: ['darwin-arm64'],
      },
    ],
    [
      'redistribution notices',
      {
        ...checkedManifest,
        redistributionNotices: checkedManifest.redistributionNotices.slice(1),
      },
    ],
    [
      'required notice',
      {
        ...checkedManifest,
        requiredNoticeFile: { ...checkedManifest.requiredNoticeFile, text: 'other' },
      },
    ],
  ])('rejects fixed %s drift', (_label, manifest) => {
    expect(() => parseReadingMemoryModelManifest(manifest)).toThrow(
      'Invalid reading memory model manifest',
    );
  });

  it.each([
    '../config.json',
    '/config.json',
    'onnx\\model_q4.onnx',
    'onnx/../model_q4.onnx',
    'CON',
    'config.json.',
  ])('rejects unsafe model path %s', (path) => {
    expect(() => parseReadingMemoryModelManifest(withArtifactFile(0, { path }))).toThrow(
      'artifact.files[0].path must be a safe relative path',
    );
  });

  it.each(['A'.repeat(64), 'a'.repeat(63), ` ${'a'.repeat(64)}`])(
    'rejects invalid SHA-256 %s',
    (sha256) => {
      expect(() => parseReadingMemoryModelManifest(withArtifactFile(0, { sha256 }))).toThrow(
        'artifact.files[0].sha256 must be a lowercase SHA-256 digest',
      );
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid file size %s',
    (sizeBytes) => {
      expect(() => parseReadingMemoryModelManifest(withArtifactFile(0, { sizeBytes }))).toThrow(
        'artifact.files[0].sizeBytes must be a positive safe integer',
      );
    },
  );

  it('rejects duplicate, missing, or mismatched fixed files', () => {
    const first = checkedManifest.artifact.files[0];
    expect(() =>
      parseReadingMemoryModelManifest(
        withArtifactFile(1, {
          path: first.path,
        }),
      ),
    ).toThrow('artifact.files does not contain the fixed artifact paths');

    expect(() =>
      parseReadingMemoryModelManifest({
        ...checkedManifest,
        legal: {
          ...checkedManifest.legal,
          files: checkedManifest.legal.files.slice(1),
        },
      }),
    ).toThrow('legal.files does not contain the fixed legal files');

    expect(() => parseReadingMemoryModelManifest(withLegalFile(0, { kind: 'terms' }))).toThrow(
      'legal.files does not contain the fixed legal files',
    );
  });

  it('rejects inconsistent or overflowing size aggregates', () => {
    expect(() =>
      parseReadingMemoryModelManifest({
        ...checkedManifest,
        artifact: {
          ...checkedManifest.artifact,
          downloadSizeBytes: checkedManifest.artifact.downloadSizeBytes - 1,
        },
      }),
    ).toThrow('artifact.downloadSizeBytes does not match artifact file sizes');

    expect(() =>
      parseReadingMemoryModelManifest({
        ...checkedManifest,
        legal: {
          ...checkedManifest.legal,
          downloadSizeBytes: checkedManifest.legal.downloadSizeBytes - 1,
        },
      }),
    ).toThrow('legal.downloadSizeBytes does not match legal file sizes');

    expect(() =>
      parseReadingMemoryModelManifest({
        ...checkedManifest,
        distributionDownloadSizeBytes: checkedManifest.distributionDownloadSizeBytes - 1,
      }),
    ).toThrow('distributionDownloadSizeBytes does not match the fixed release files');

    expect(() =>
      parseReadingMemoryModelManifest(
        withArtifactFiles([
          { ...checkedManifest.artifact.files[0], sizeBytes: Number.MAX_SAFE_INTEGER },
          ...checkedManifest.artifact.files.slice(1),
        ]),
      ),
    ).toThrow('artifact.files size total exceeds the safe integer range');
  });
});

function withArtifactFile(
  index: number,
  patch: Partial<ReadingMemoryModelFile> & Readonly<Record<string, unknown>>,
) {
  return withArtifactFiles(
    checkedManifest.artifact.files.map((file, fileIndex) =>
      fileIndex === index ? { ...file, ...patch } : file,
    ),
  );
}

function withArtifactFiles(files: readonly ReadingMemoryModelFile[]) {
  return {
    ...checkedManifest,
    artifact: { ...checkedManifest.artifact, files },
  };
}

function withLegalFile(index: number, patch: Readonly<Record<string, unknown>>) {
  return {
    ...checkedManifest,
    legal: {
      ...checkedManifest.legal,
      files: checkedManifest.legal.files.map((file, fileIndex) =>
        fileIndex === index ? Object.assign({}, file, patch) : file,
      ),
    },
  };
}
