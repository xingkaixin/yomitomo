import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseReadingMemoryModelManifest,
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
