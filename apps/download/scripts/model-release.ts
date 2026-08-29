import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import selectedModel from '../../../packages/ai/evaluation/semantic-retrieval/selected-model-v1.json' with { type: 'json' };
import checkedReleaseIntegrity from '../model-releases/reading-memory-embedding-v1/release-integrity.json' with { type: 'json' };
import { digestBytes, digestFile } from './content-digest.ts';

const distributionOrigin = 'https://download.yomitomo.app';
const modelPathPrefix = `/models/${selectedModel.internalId}/`;
const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const releaseDirectory = join(packageDirectory, 'model-releases', selectedModel.internalId);
const checkedManifestPath = join(releaseDirectory, 'manifest.json');

const legalFileDefinitions = [
  { kind: 'notice', path: 'NOTICE' },
  { kind: 'terms', path: 'GEMMA_TERMS_OF_USE.txt' },
  { kind: 'modifications', path: 'MODIFICATIONS' },
] as const;

type LegalFileDefinition = (typeof legalFileDefinitions)[number];

export type ReleaseObjectSpec = {
  path: string;
  key: string;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  source:
    | { type: 'remote'; url: string }
    | { type: 'local'; filePath: string }
    | { type: 'bytes'; bytes: Uint8Array };
};

export type ReadingMemoryReleasePlan = {
  internalId: string;
  objects: ReleaseObjectSpec[];
  manifest: ReleaseObjectSpec;
};

type LegalFile = {
  kind: LegalFileDefinition['kind'];
  path: LegalFileDefinition['path'];
  url: string;
  sizeBytes: number;
  sha256: string;
};

export async function loadReadingMemoryReleasePlan() {
  validateSelectedModel();
  const legalFiles = await loadLegalFiles();
  const manifestValue = createDistributionManifest(legalFiles);
  const checkedManifestText = await readFile(checkedManifestPath, 'utf8');
  const checkedManifest = JSON.parse(checkedManifestText) as unknown;
  if (!isDeepStrictEqual(checkedManifest, manifestValue)) {
    throw new Error('Checked model distribution manifest is not derived from the selected model');
  }

  const manifestBytes = Buffer.from(checkedManifestText);
  const manifestDigest = digestBytes(manifestBytes);
  if (
    manifestDigest.sizeBytes !== checkedReleaseIntegrity.manifest.sizeBytes ||
    manifestDigest.sha256 !== checkedReleaseIntegrity.manifest.sha256
  ) {
    throw new Error('Checked model distribution manifest integrity is stale');
  }
  const distributionFiles = [...manifestValue.artifact.files, ...manifestValue.legal.files];
  const upstreamFiles = new Map(selectedModel.artifact.files.map((file) => [file.path, file]));
  const localLegalFiles = new Map(
    legalFiles.map((file) => [file.path, join(releaseDirectory, file.path)]),
  );

  const objects = distributionFiles.map((file) => {
    const source = sourceFor(file.path, upstreamFiles, localLegalFiles);

    return {
      path: file.path,
      key: objectKey(file.url),
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      contentType: contentType(file.path),
      source,
    } satisfies ReleaseObjectSpec;
  });

  return {
    internalId: selectedModel.internalId,
    objects,
    manifest: {
      path: 'manifest.json',
      key: `${selectedModel.internalId}/manifest.json`,
      sizeBytes: manifestDigest.sizeBytes,
      sha256: manifestDigest.sha256,
      contentType: 'application/json; charset=utf-8',
      source: { type: 'bytes', bytes: manifestBytes },
    },
  } satisfies ReadingMemoryReleasePlan;
}

function sourceFor(
  path: string,
  upstreamFiles: Map<string, { url: string }>,
  localFiles: Map<string, string>,
): ReleaseObjectSpec['source'] {
  const upstream = upstreamFiles.get(path);
  if (upstream) return { type: 'remote', url: upstream.url };

  const localFilePath = localFiles.get(path);
  if (localFilePath) return { type: 'local', filePath: localFilePath };

  throw new Error(`Missing source for ${path}`);
}

export function createDistributionManifest(legalFiles: LegalFile[]) {
  const artifactFiles = selectedModel.artifact.files.map((file) => ({
    path: file.path,
    url: publicObjectUrl(file.path, file.sha256),
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
  }));
  const legalDownloadSizeBytes = legalFiles.reduce((total, file) => {
    const nextTotal = total + file.sizeBytes;
    if (!Number.isSafeInteger(nextTotal)) {
      throw new Error('Legal file download size exceeds the safe integer range');
    }
    return nextTotal;
  }, 0);
  const distributionDownloadSizeBytes =
    selectedModel.artifact.downloadSizeBytes + legalDownloadSizeBytes;
  if (!Number.isSafeInteger(distributionDownloadSizeBytes)) {
    throw new Error('Distribution download size exceeds the safe integer range');
  }

  return {
    schemaVersion: selectedModel.schemaVersion,
    internalId: selectedModel.internalId,
    source: selectedModel.source,
    artifact: {
      modelId: selectedModel.artifact.modelId,
      revision: selectedModel.artifact.revision,
      downloadSizeBytes: selectedModel.artifact.downloadSizeBytes,
      files: artifactFiles,
    },
    runtime: selectedModel.runtime,
    input: selectedModel.input,
    vector: selectedModel.vector,
    supportedPlatforms: selectedModel.supportedPlatforms,
    redistributionNotices: selectedModel.redistributionNotices,
    requiredNoticeFile: selectedModel.requiredNoticeFile,
    legal: {
      downloadSizeBytes: legalDownloadSizeBytes,
      files: legalFiles,
    },
    distributionDownloadSizeBytes,
  };
}

async function loadLegalFiles() {
  const files = await Promise.all(
    legalFileDefinitions.map(async (definition) => {
      const filePath = join(releaseDirectory, definition.path);
      const digest = await digestFile(filePath);
      const expectedDigest = checkedReleaseIntegrity.legal[definition.path];
      if (
        digest.sizeBytes !== expectedDigest.sizeBytes ||
        digest.sha256 !== expectedDigest.sha256
      ) {
        throw new Error(`${definition.path} does not match the checked legal snapshot`);
      }
      return {
        kind: definition.kind,
        path: definition.path,
        url: publicObjectUrl(definition.path, digest.sha256),
        sizeBytes: digest.sizeBytes,
        sha256: digest.sha256,
      } satisfies LegalFile;
    }),
  );

  const notice = await readFile(join(releaseDirectory, 'NOTICE'), 'utf8');
  if (notice !== `${selectedModel.requiredNoticeFile.text}\n`) {
    throw new Error('NOTICE does not match the selected model contract');
  }

  const terms = await readFile(join(releaseDirectory, 'GEMMA_TERMS_OF_USE.txt'), 'utf8');
  if (
    !terms.includes(`Last modified: April 1, 2026`) ||
    !terms.includes(selectedModel.source.licenseUrl)
  ) {
    throw new Error('Gemma terms copy does not match the selected terms version');
  }

  const modifications = await readFile(join(releaseDirectory, 'MODIFICATIONS'), 'utf8');
  if (
    !modifications.includes(selectedModel.source.revision) ||
    !modifications.includes(selectedModel.artifact.revision)
  ) {
    throw new Error('MODIFICATIONS does not identify both fixed revisions');
  }

  return files;
}

function validateSelectedModel() {
  if (
    selectedModel.schemaVersion !== 1 ||
    selectedModel.internalId !== 'reading-memory-embedding-v1'
  ) {
    throw new Error('Unsupported selected model contract');
  }
  if (
    selectedModel.source.license !== 'Gemma' ||
    selectedModel.source.licenseTermsVersion !== '2026-04-01'
  ) {
    throw new Error('Unsupported model license');
  }
  if (!/^[0-9a-f]{40}$/.test(selectedModel.source.revision)) {
    throw new Error('Invalid source revision');
  }
  if (!/^[0-9a-f]{40}$/.test(selectedModel.artifact.revision)) {
    throw new Error('Invalid artifact revision');
  }
  if (selectedModel.artifact.files.length !== 5) throw new Error('Unexpected model file count');

  const paths = new Set<string>();
  let downloadSizeBytes = 0;
  for (const file of selectedModel.artifact.files) {
    if (!isSafeRelativePath(file.path) || paths.has(file.path)) {
      throw new Error(`Invalid model path: ${file.path}`);
    }
    if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0) {
      throw new Error(`Invalid model size: ${file.path}`);
    }
    if (!/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw new Error(`Invalid model SHA-256: ${file.path}`);
    }
    const expectedUrl = `https://huggingface.co/${selectedModel.artifact.modelId}/resolve/${selectedModel.artifact.revision}/${file.path}`;
    if (file.url !== expectedUrl) throw new Error(`Unexpected model source URL: ${file.path}`);
    paths.add(file.path);
    downloadSizeBytes += file.sizeBytes;
    if (!Number.isSafeInteger(downloadSizeBytes)) {
      throw new Error('Selected model download size exceeds the safe integer range');
    }
  }

  if (downloadSizeBytes !== selectedModel.artifact.downloadSizeBytes) {
    throw new Error('Selected model download size does not match its files');
  }
}

function publicObjectUrl(path: string, sha256: string) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${distributionOrigin}${modelPathPrefix}objects/sha256/${sha256}/${encodedPath}`;
}

function objectKey(publicUrl: string) {
  const url = new URL(publicUrl);
  if (url.origin !== distributionOrigin || !url.pathname.startsWith(modelPathPrefix)) {
    throw new Error(`Invalid distribution URL: ${publicUrl}`);
  }
  return `${selectedModel.internalId}/${url.pathname.slice(modelPathPrefix.length)}`;
}

function contentType(path: string) {
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path === 'NOTICE' || path === 'MODIFICATIONS' || path.endsWith('.txt')) {
    return 'text/plain; charset=utf-8';
  }
  return 'application/octet-stream';
}

function isSafeRelativePath(path: string) {
  const segments = path.split('/');
  return (
    segments.length > 0 &&
    segments.every(
      (segment) =>
        segment !== '' && segment !== '.' && segment !== '..' && /^[\w.-]+$/.test(segment),
    )
  );
}
