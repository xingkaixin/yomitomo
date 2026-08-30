const distributionOrigin = 'https://download.yomitomo.app';

export const readingMemoryModelRelease = {
  internalId: 'reading-memory-embedding-v1',
  manifestUrl: 'https://download.yomitomo.app/models/reading-memory-embedding-v1/manifest.json',
  manifestSizeBytes: 4_884,
  manifestSha256: 'fd5469b94ddb387c68e9e2527ad600a8ccd91a998dd59abcd5fc747b400334f3',
  distributionDownloadSizeBytes: 218_736_459,
} as const;

const expectedSource = {
  modelId: 'google/embeddinggemma-300m',
  revision: '57c266a740f537b4dc058e1b0cda161fd15afa75',
  license: 'Gemma',
  licenseUrl: 'https://ai.google.dev/gemma/terms',
  licenseTermsVersion: '2026-04-01',
  noticeUrl: 'https://ai.google.dev/gemma/terms#3.1-distribution',
} as const;

const expectedArtifact = {
  modelId: 'onnx-community/embeddinggemma-300m-ONNX',
  revision: '5090578d9565bb06545b4552f76e6bc2c93e4a66',
} as const;

const expectedArtifactPaths = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_q4.onnx',
  'onnx/model_q4.onnx_data',
] as const;

const expectedRuntime = {
  package: '@huggingface/transformers',
  version: '4.2.0',
  backend: 'onnxruntime-node',
  backendVersion: '1.24.3',
  device: 'cpu',
  dtype: 'q4',
  intraOpThreads: 4,
  interOpThreads: 1,
  modelOutput: 'sentence_embedding',
} as const;

const expectedInput = {
  maxTokens: 2_048,
  queryPrefix: 'task: search result | query: ',
  documentPrefix: 'title: none | text: ',
  truncation: 'end',
} as const;

const expectedVector = {
  dimension: 768,
  normalization: 'l2',
  scalar: 'float32',
  byteOrder: 'little-endian',
  layout: 'row-major',
} as const;

const expectedSupportedPlatforms = ['darwin-arm64', 'win32-x64'] as const;

const expectedRedistributionNotices = [
  'Include the Section 3.2 use restrictions as an enforceable provision in the agreement governing use or distribution.',
  'Notify every downstream user that the model is subject to the Section 3.2 use restrictions.',
  'Provide every recipient a copy of the complete Gemma Terms of Use.',
  'Make every modified file carry a prominent notice stating that it was modified.',
  'Preserve the conversion artifact revision separately from the source model revision.',
] as const;

const expectedRequiredNoticeFile = {
  fileName: 'NOTICE',
  text: 'Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms',
} as const;

const expectedLegalFiles = [
  { kind: 'notice', path: 'NOTICE' },
  { kind: 'terms', path: 'GEMMA_TERMS_OF_USE.txt' },
  { kind: 'modifications', path: 'MODIFICATIONS' },
] as const;

const sha256Pattern = /^[0-9a-f]{64}$/;
const windowsReservedNamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

type ReadingMemoryModelLegalFileKind = (typeof expectedLegalFiles)[number]['kind'];

export type ReadingMemoryModelFile = {
  readonly path: string;
  readonly url: string;
  readonly sizeBytes: number;
  readonly sha256: string;
};

type ReadingMemoryModelLegalFile = ReadingMemoryModelFile & {
  readonly kind: ReadingMemoryModelLegalFileKind;
};

export type ReadingMemoryModelManifest = {
  readonly schemaVersion: 1;
  readonly internalId: typeof readingMemoryModelRelease.internalId;
  readonly source: typeof expectedSource;
  readonly artifact: {
    readonly modelId: typeof expectedArtifact.modelId;
    readonly revision: typeof expectedArtifact.revision;
    readonly downloadSizeBytes: number;
    readonly files: readonly ReadingMemoryModelFile[];
  };
  readonly runtime: typeof expectedRuntime;
  readonly input: typeof expectedInput;
  readonly vector: typeof expectedVector;
  readonly supportedPlatforms: readonly string[];
  readonly redistributionNotices: typeof expectedRedistributionNotices;
  readonly requiredNoticeFile: typeof expectedRequiredNoticeFile;
  readonly legal: {
    readonly downloadSizeBytes: number;
    readonly files: readonly ReadingMemoryModelLegalFile[];
  };
  readonly distributionDownloadSizeBytes: typeof readingMemoryModelRelease.distributionDownloadSizeBytes;
};

export function parseReadingMemoryModelManifest(value: unknown): ReadingMemoryModelManifest {
  const manifest = strictRecord(
    value,
    [
      'schemaVersion',
      'internalId',
      'source',
      'artifact',
      'runtime',
      'input',
      'vector',
      'supportedPlatforms',
      'redistributionNotices',
      'requiredNoticeFile',
      'legal',
      'distributionDownloadSizeBytes',
    ],
    'manifest',
  );

  fixedValue(manifest.schemaVersion, 1, 'schemaVersion');
  fixedValue(manifest.internalId, readingMemoryModelRelease.internalId, 'internalId');

  const source = fixedRecord(manifest.source, expectedSource, 'source');
  const artifact = parseArtifact(manifest.artifact);
  const runtime = fixedRecord(manifest.runtime, expectedRuntime, 'runtime');
  const input = fixedRecord(manifest.input, expectedInput, 'input');
  const vector = fixedRecord(manifest.vector, expectedVector, 'vector');
  const supportedPlatforms = fixedStringArray(
    manifest.supportedPlatforms,
    expectedSupportedPlatforms,
    'supportedPlatforms',
  );
  const redistributionNotices = fixedStringArray(
    manifest.redistributionNotices,
    expectedRedistributionNotices,
    'redistributionNotices',
  );
  const requiredNoticeFile = fixedRecord(
    manifest.requiredNoticeFile,
    expectedRequiredNoticeFile,
    'requiredNoticeFile',
  );
  const legal = parseLegal(manifest.legal);
  const distributionDownloadSizeBytes = positiveSafeInteger(
    manifest.distributionDownloadSizeBytes,
    'distributionDownloadSizeBytes',
  );

  const files = [...artifact.files, ...legal.files];
  assertUniqueFiles(files);
  const computedDistributionSize = checkedFileSizeTotal(files, 'distribution files');
  if (
    distributionDownloadSizeBytes !== computedDistributionSize ||
    distributionDownloadSizeBytes !== readingMemoryModelRelease.distributionDownloadSizeBytes
  ) {
    invalid('distributionDownloadSizeBytes', 'does not match the fixed release files');
  }

  return {
    schemaVersion: 1,
    internalId: readingMemoryModelRelease.internalId,
    source,
    artifact,
    runtime,
    input,
    vector,
    supportedPlatforms,
    redistributionNotices,
    requiredNoticeFile,
    legal,
    distributionDownloadSizeBytes: readingMemoryModelRelease.distributionDownloadSizeBytes,
  };
}

export function readingMemoryModelFiles(
  manifest: ReadingMemoryModelManifest,
): readonly ReadingMemoryModelFile[] {
  return [...manifest.artifact.files, ...manifest.legal.files];
}

function parseArtifact(value: unknown): ReadingMemoryModelManifest['artifact'] {
  const artifact = strictRecord(
    value,
    ['modelId', 'revision', 'downloadSizeBytes', 'files'],
    'artifact',
  );
  fixedValue(artifact.modelId, expectedArtifact.modelId, 'artifact.modelId');
  fixedValue(artifact.revision, expectedArtifact.revision, 'artifact.revision');

  if (!Array.isArray(artifact.files)) invalid('artifact.files', 'must be an array');
  const files = artifact.files.map((file, index) =>
    parseModelFile(file, `artifact.files[${index}]`),
  );
  assertExpectedPaths(files, expectedArtifactPaths, 'artifact.files');

  const downloadSizeBytes = positiveSafeInteger(
    artifact.downloadSizeBytes,
    'artifact.downloadSizeBytes',
  );
  if (downloadSizeBytes !== checkedFileSizeTotal(files, 'artifact.files')) {
    invalid('artifact.downloadSizeBytes', 'does not match artifact file sizes');
  }

  return {
    modelId: expectedArtifact.modelId,
    revision: expectedArtifact.revision,
    downloadSizeBytes,
    files,
  };
}

function parseLegal(value: unknown): ReadingMemoryModelManifest['legal'] {
  const legal = strictRecord(value, ['downloadSizeBytes', 'files'], 'legal');
  if (!Array.isArray(legal.files)) invalid('legal.files', 'must be an array');

  const files = legal.files.map((file, index) => parseLegalFile(file, index));
  assertExpectedLegalFiles(files);

  const downloadSizeBytes = positiveSafeInteger(legal.downloadSizeBytes, 'legal.downloadSizeBytes');
  if (downloadSizeBytes !== checkedFileSizeTotal(files, 'legal.files')) {
    invalid('legal.downloadSizeBytes', 'does not match legal file sizes');
  }

  return { downloadSizeBytes, files };
}

function parseModelFile(value: unknown, label: string): ReadingMemoryModelFile {
  const file = strictRecord(value, ['path', 'url', 'sizeBytes', 'sha256'], label);
  return parseModelFileFields(file, label);
}

function parseLegalFile(value: unknown, index: number): ReadingMemoryModelLegalFile {
  const label = `legal.files[${index}]`;
  const file = strictRecord(value, ['kind', 'path', 'url', 'sizeBytes', 'sha256'], label);
  const kind = stringValue(file.kind, `${label}.kind`);
  if (!expectedLegalFiles.some((expected) => expected.kind === kind)) {
    invalid(`${label}.kind`, 'is not supported');
  }

  return {
    kind: kind as ReadingMemoryModelLegalFileKind,
    ...parseModelFileFields(file, label),
  };
}

function parseModelFileFields(
  file: Readonly<Record<string, unknown>>,
  label: string,
): ReadingMemoryModelFile {
  const path = stringValue(file.path, `${label}.path`);
  assertSafeRelativePath(path, `${label}.path`);

  const sha256 = stringValue(file.sha256, `${label}.sha256`);
  if (!sha256Pattern.test(sha256)) {
    invalid(`${label}.sha256`, 'must be a lowercase SHA-256 digest');
  }

  const url = stringValue(file.url, `${label}.url`);
  assertDistributionUrl(url, path, sha256, `${label}.url`);

  return {
    path,
    url,
    sizeBytes: positiveSafeInteger(file.sizeBytes, `${label}.sizeBytes`),
    sha256,
  };
}

function strictRecord(
  value: unknown,
  expectedFields: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(label, 'must be an object');
  }

  const record = value as Record<string, unknown>;
  const actualFields = Object.keys(record);
  const expected = new Set(expectedFields);
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field) => !expected.has(field)) ||
    expectedFields.some((field) => !Object.hasOwn(record, field))
  ) {
    invalid(label, `must contain only: ${expectedFields.join(', ')}`);
  }
  return record;
}

function fixedRecord<const T extends Readonly<Record<string, string | number>>>(
  value: unknown,
  expected: T,
  label: string,
): T {
  const record = strictRecord(value, Object.keys(expected), label);
  for (const [field, expectedValue] of Object.entries(expected)) {
    fixedValue(record[field], expectedValue, `${label}.${field}`);
  }
  return { ...expected };
}

function fixedStringArray<const T extends readonly string[]>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((item, index) => item !== expected[index])
  ) {
    invalid(label, 'does not match the fixed model release');
  }
  return [...expected] as unknown as T;
}

function fixedValue(value: unknown, expected: string | number, label: string) {
  if (value !== expected) invalid(label, `must equal ${JSON.stringify(expected)}`);
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== 'string' || value === '') invalid(label, 'must be a non-empty string');
  return value;
}

function positiveSafeInteger(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    invalid(label, 'must be a positive safe integer');
  }
  return value;
}

function checkedFileSizeTotal(files: readonly ReadingMemoryModelFile[], label: string) {
  let total = 0;
  for (const file of files) {
    if (file.sizeBytes > Number.MAX_SAFE_INTEGER - total) {
      invalid(label, 'size total exceeds the safe integer range');
    }
    total += file.sizeBytes;
  }
  return total;
}

function assertExpectedPaths(
  files: readonly ReadingMemoryModelFile[],
  expectedPaths: readonly string[],
  label: string,
) {
  const actualPaths = new Set(files.map((file) => file.path));
  if (
    actualPaths.size !== expectedPaths.length ||
    expectedPaths.some((path) => !actualPaths.has(path))
  ) {
    invalid(label, 'does not contain the fixed artifact paths');
  }
}

function assertExpectedLegalFiles(files: readonly ReadingMemoryModelLegalFile[]) {
  if (files.length !== expectedLegalFiles.length) {
    invalid('legal.files', 'does not contain the fixed legal files');
  }

  for (const expected of expectedLegalFiles) {
    const file = files.find((candidate) => candidate.path === expected.path);
    if (!file || file.kind !== expected.kind) {
      invalid('legal.files', 'does not contain the fixed legal files');
    }
  }
}

function assertUniqueFiles(files: readonly ReadingMemoryModelFile[]) {
  const paths = new Set<string>();
  const urls = new Set<string>();
  for (const file of files) {
    const caseFoldedPath = file.path.toLowerCase();
    if (paths.has(caseFoldedPath)) invalid('files', `contains duplicate path: ${file.path}`);
    if (urls.has(file.url)) invalid('files', `contains duplicate URL: ${file.url}`);
    paths.add(caseFoldedPath);
    urls.add(file.url);
  }
}

function assertSafeRelativePath(path: string, label: string) {
  if (path.length > 512 || path.startsWith('/') || path.includes('\\')) {
    invalid(label, 'must be a safe relative path');
  }

  const segments = path.split('/');
  if (
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        segment.length > 255 ||
        segment.endsWith('.') ||
        segment.endsWith(' ') ||
        !/^[A-Za-z0-9._-]+$/.test(segment) ||
        windowsReservedNamePattern.test(segment),
    )
  ) {
    invalid(label, 'must be a safe relative path');
  }
}

function assertDistributionUrl(url: string, path: string, sha256: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    invalid(label, 'must be a valid URL');
  }

  if (
    parsed.origin !== distributionOrigin ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    url !== parsed.href ||
    parsed.href !== distributionUrl(path, sha256)
  ) {
    invalid(label, 'must be the canonical first-party content-addressed URL');
  }
}

function distributionUrl(path: string, sha256: string) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${distributionOrigin}/models/${readingMemoryModelRelease.internalId}/objects/sha256/${sha256}/${encodedPath}`;
}

function invalid(field: string, reason: string): never {
  throw new Error(`Invalid reading memory model manifest: ${field} ${reason}`);
}
