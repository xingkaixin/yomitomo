const maximumBatchSize = 16;
export const maximumReadingMemoryEmbeddingTextBytes = 64 * 1024;
const normalizedVectorTolerance = 0.001;

export type ReadingMemoryEmbeddingPurpose = 'query' | 'document';

export type ReadingMemoryEmbeddingRequest = {
  purpose: ReadingMemoryEmbeddingPurpose;
  texts: readonly string[];
};

export type ReadingMemoryEmbeddingWorkerConfig = {
  modelVersion: string;
  runtimeVersion: string;
  backendVersion: string;
  modelDirectory: string;
  modelSubfolder: string;
  dtype: 'q4';
  device: 'cpu';
  modelOutput: 'sentence_embedding';
  maxTokens: number;
  queryPrefix: string;
  documentPrefix: string;
  dimension: number;
  normalized: boolean;
  intraOpThreads: number;
  interOpThreads: number;
};

export type ReadingMemoryEmbeddingWorkerRequest =
  | { type: 'initialize'; config: ReadingMemoryEmbeddingWorkerConfig }
  | (ReadingMemoryEmbeddingRequest & {
      type: 'embed';
      requestId: number;
    })
  | { type: 'dispose' };

export type ReadingMemoryEmbeddingWorkerResponse =
  | {
      type: 'result';
      requestId: number;
      count: number;
      dimension: number;
      buffer: ArrayBuffer;
    }
  | {
      type: 'error';
      requestId: number;
      message: string;
    }
  | { type: 'disposed' };

export function parseReadingMemoryEmbeddingWorkerConfig(
  value: unknown,
): ReadingMemoryEmbeddingWorkerConfig {
  const config = recordValue(value, 'worker config');
  return {
    modelVersion: nonEmptyString(config.modelVersion, 'modelVersion'),
    runtimeVersion: nonEmptyString(config.runtimeVersion, 'runtimeVersion'),
    backendVersion: nonEmptyString(config.backendVersion, 'backendVersion'),
    modelDirectory: nonEmptyString(config.modelDirectory, 'modelDirectory'),
    modelSubfolder: fixedString(config.modelSubfolder, 'onnx', 'modelSubfolder'),
    dtype: fixedString(config.dtype, 'q4', 'dtype'),
    device: fixedString(config.device, 'cpu', 'device'),
    modelOutput: fixedString(config.modelOutput, 'sentence_embedding', 'modelOutput'),
    maxTokens: positiveSafeInteger(config.maxTokens, 'maxTokens'),
    queryPrefix: nonEmptyString(config.queryPrefix, 'queryPrefix'),
    documentPrefix: nonEmptyString(config.documentPrefix, 'documentPrefix'),
    dimension: positiveSafeInteger(config.dimension, 'dimension'),
    normalized: booleanValue(config.normalized, 'normalized'),
    intraOpThreads: positiveSafeInteger(config.intraOpThreads, 'intraOpThreads'),
    interOpThreads: positiveSafeInteger(config.interOpThreads, 'interOpThreads'),
  };
}

export function parseReadingMemoryEmbeddingWorkerInitialization(
  value: unknown,
): ReadingMemoryEmbeddingWorkerConfig {
  const request = recordValue(value, 'embedding initialization');
  if (request.type !== 'initialize') throw new Error('First embedding message must initialize');
  return parseReadingMemoryEmbeddingWorkerConfig(request.config);
}

export function parseReadingMemoryEmbeddingWorkerRequest(
  value: unknown,
): Extract<ReadingMemoryEmbeddingWorkerRequest, { type: 'embed' }> {
  const request = recordValue(value, 'embedding request');
  if (request.type !== 'embed') throw new Error('Embedding request type must be embed');
  const requestId = positiveSafeInteger(request.requestId, 'requestId');
  const input = validateReadingMemoryEmbeddingRequest({
    purpose: request.purpose,
    texts: request.texts,
  });
  return { type: 'embed', requestId, ...input };
}

export function validateReadingMemoryEmbeddingRequest(
  value: unknown,
): ReadingMemoryEmbeddingRequest {
  const request = recordValue(value, 'embedding request');
  const purpose = embeddingPurpose(request.purpose);
  if (!Array.isArray(request.texts)) throw new Error('Embedding texts must be an array');
  if (request.texts.length === 0 || request.texts.length > maximumBatchSize) {
    throw new Error(`Embedding batch must contain 1 to ${maximumBatchSize} texts`);
  }

  const texts = request.texts.map((text, index) => {
    if (typeof text !== 'string') throw new Error(`Embedding text ${index} must be a string`);
    if (
      text.length > maximumReadingMemoryEmbeddingTextBytes ||
      Buffer.byteLength(text, 'utf8') > maximumReadingMemoryEmbeddingTextBytes
    ) {
      throw new Error(
        `Embedding text ${index} exceeds ${maximumReadingMemoryEmbeddingTextBytes} UTF-8 bytes`,
      );
    }
    if (text.trim().length === 0) throw new Error(`Embedding text ${index} must not be blank`);
    return text;
  });

  return { purpose, texts };
}

export function assertReadingMemoryEmbeddingVectors(
  vectors: Float32Array,
  count: number,
  dimension: number,
  normalized: boolean,
): void {
  const safeCount = positiveSafeInteger(count, 'vector count');
  const safeDimension = positiveSafeInteger(dimension, 'vector dimension');
  if (safeDimension > Math.floor(Number.MAX_SAFE_INTEGER / safeCount)) {
    throw new Error('Embedding matrix dimensions overflow');
  }
  if (vectors.length !== safeCount * safeDimension) {
    throw new Error('Embedding matrix shape does not match the request');
  }

  for (let row = 0; row < safeCount; row += 1) {
    let squaredNorm = 0;
    const offset = row * safeDimension;
    for (let column = 0; column < safeDimension; column += 1) {
      const value = vectors[offset + column];
      if (!Number.isFinite(value)) throw new Error('Embedding matrix contains a non-finite value');
      squaredNorm += value * value;
    }
    if (
      normalized &&
      (!Number.isFinite(squaredNorm) ||
        Math.abs(Math.sqrt(squaredNorm) - 1) > normalizedVectorTolerance)
    ) {
      throw new Error('Embedding vector is not L2-normalized');
    }
  }
}

function embeddingPurpose(value: unknown): ReadingMemoryEmbeddingPurpose {
  if (value === 'query' || value === 'document') return value;
  throw new Error('Embedding purpose must be query or document');
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function fixedString<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must be ${expected}`);
  return expected;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
}
