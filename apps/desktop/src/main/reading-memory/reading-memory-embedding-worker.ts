import { isAbsolute } from 'node:path';
import process from 'node:process';
import type { FeatureExtractionPipeline, Tensor } from '@huggingface/transformers';
import {
  assertReadingMemoryEmbeddingVectors,
  parseReadingMemoryEmbeddingWorkerInitialization,
  parseReadingMemoryEmbeddingWorkerRequest,
  type ReadingMemoryEmbeddingWorkerConfig,
  type ReadingMemoryEmbeddingWorkerRequest,
  type ReadingMemoryEmbeddingWorkerResponse,
} from './reading-memory-embedding-worker-protocol';

// 2048-token inputs measured 1.25 GiB peak RSS at four rows versus 3.33 GiB at sixteen.
const maximumInferenceBatchSize = 4;

type EmbeddingBatch = Extract<ReadingMemoryEmbeddingWorkerRequest, { type: 'embed' }>;
if (!process.send) throw new Error('Embedding process requires a parent IPC channel');
const send = process.send.bind(process);
process.on('disconnect', () => process.exit(0));
process.once('message', (value: unknown) => {
  const config = parseReadingMemoryEmbeddingWorkerInitialization(value);
  if (!isAbsolute(config.modelDirectory)) {
    throw new Error('Embedding model directory must be absolute');
  }
  startReadingMemoryEmbeddingWorker(config);
});

function startReadingMemoryEmbeddingWorker(config: ReadingMemoryEmbeddingWorkerConfig) {
  let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
  let activeBatch: Promise<void> | null = null;
  let disposed = false;

  const post = (message: ReadingMemoryEmbeddingWorkerResponse) => {
    send(message, (error) => {
      if (error) process.exit(1);
    });
  };

  const dispose = async () => {
    disposed = true;
    await activeBatch;
    if (extractorPromise) {
      const extractor = await extractorPromise;
      await extractor.dispose();
    }
    post({ type: 'disposed' });
  };

  const runBatch = async (request: EmbeddingBatch) => {
    try {
      const extractor = await (extractorPromise ??= loadExtractor(config));
      const vectors = await embedBatch(extractor, request, config);
      post({
        type: 'result',
        requestId: request.requestId,
        count: request.texts.length,
        dimension: config.dimension,
        buffer: vectors.buffer,
      });
    } catch (error) {
      post({ type: 'error', requestId: request.requestId, message: errorMessage(error) });
    }
  };

  process.on('message', (message: unknown) => {
    if (isDisposeRequest(message)) {
      void dispose().catch(() => post({ type: 'disposed' }));
      return;
    }

    let request: EmbeddingBatch;
    try {
      request = parseReadingMemoryEmbeddingWorkerRequest(message);
    } catch (error) {
      post({
        type: 'error',
        requestId: requestIdFromMessage(message),
        message: errorMessage(error),
      });
      return;
    }
    if (disposed || activeBatch) {
      post({
        type: 'error',
        requestId: request.requestId,
        message: disposed ? 'Embedding worker is disposed' : 'Embedding worker is busy',
      });
      return;
    }

    const pending = runBatch(request);
    activeBatch = pending;
    void pending.finally(() => {
      if (activeBatch === pending) activeBatch = null;
    });
  });
}

async function loadExtractor(config: ReadingMemoryEmbeddingWorkerConfig) {
  const { env, pipeline } = await import('@huggingface/transformers');
  if (env.version !== config.runtimeVersion) {
    throw new Error(`Embedding runtime version must be ${config.runtimeVersion}`);
  }
  if (env.backends.onnx.versions?.node !== config.backendVersion) {
    throw new Error(`Embedding backend version must be ${config.backendVersion}`);
  }
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useFSCache = false;
  return pipeline('feature-extraction', config.modelDirectory, {
    local_files_only: true,
    subfolder: config.modelSubfolder,
    dtype: config.dtype,
    device: config.device,
    session_options: {
      intraOpNumThreads: config.intraOpThreads,
      interOpNumThreads: config.interOpThreads,
    },
  });
}

async function embedBatch(
  extractor: FeatureExtractionPipeline,
  request: EmbeddingBatch,
  config: ReadingMemoryEmbeddingWorkerConfig,
): Promise<Float32Array<ArrayBuffer>> {
  const prefix = request.purpose === 'query' ? config.queryPrefix : config.documentPrefix;
  const vectors = new Float32Array(request.texts.length * config.dimension);
  for (let offset = 0; offset < request.texts.length; offset += maximumInferenceBatchSize) {
    const texts = request.texts
      .slice(offset, offset + maximumInferenceBatchSize)
      .map((text) => `${prefix}${text}`);
    const batchVectors = await embedMicroBatch(extractor, texts, config);
    vectors.set(batchVectors, offset * config.dimension);
  }
  return vectors;
}

async function embedMicroBatch(
  extractor: FeatureExtractionPipeline,
  texts: string[],
  config: ReadingMemoryEmbeddingWorkerConfig,
): Promise<Float32Array<ArrayBuffer>> {
  const inputs = extractor.tokenizer(texts, {
    padding: true,
    truncation: true,
    max_length: config.maxTokens,
  });
  let outputs: Record<string, Tensor> = {};
  let normalized: Tensor | undefined;

  try {
    outputs = await extractor.model(inputs);
    const output = outputs[config.modelOutput];
    if (!output) throw new Error(`Embedding model did not return ${config.modelOutput}`);
    normalized = config.normalized ? output.normalize(2, -1) : output;
    if (
      normalized.type !== 'float32' ||
      !(normalized.data instanceof Float32Array) ||
      normalized.dims.length !== 2 ||
      normalized.dims[0] !== texts.length ||
      normalized.dims[1] !== config.dimension
    ) {
      throw new Error('Embedding model returned an invalid tensor shape');
    }
    const vectors = new Float32Array(normalized.data);
    assertReadingMemoryEmbeddingVectors(vectors, texts.length, config.dimension, config.normalized);
    return vectors;
  } finally {
    const tensors = new Set([...Object.values(inputs), ...Object.values(outputs), normalized]);
    for (const tensor of tensors) tensor?.dispose();
  }
}

function isDisposeRequest(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type === 'dispose'
  );
}

function requestIdFromMessage(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 0;
  const requestId = (value as Record<string, unknown>).requestId;
  return typeof requestId === 'number' ? requestId : 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
