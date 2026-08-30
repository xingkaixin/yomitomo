import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerMocks = vi.hoisted(() => {
  const config = {
    modelVersion: 'reading-memory-embedding-v1',
    runtimeVersion: '4.2.0',
    backendVersion: '1.24.3',
    modelDirectory: '/tmp/yomitomo-model-test/models/reading-memory-embedding-v1',
    modelSubfolder: 'onnx',
    dtype: 'q4',
    device: 'cpu',
    modelOutput: 'sentence_embedding',
    maxTokens: 2048,
    queryPrefix: 'task: search result | query: ',
    documentPrefix: 'title: none | text: ',
    dimension: 768,
    normalized: true,
    intraOpThreads: 4,
    interOpThreads: 1,
  };
  const posts: Array<{ message: unknown }> = [];
  let initializationListener: ((message: unknown) => void) | undefined;
  let messageListener: ((message: unknown) => void) | undefined;
  let disconnectListener: (() => void) | undefined;
  let sendError: Error | null = null;
  const childProcess = {
    once(_event: string, listener: (message: unknown) => void) {
      initializationListener = listener;
      return childProcess;
    },
    on(event: string, listener: () => void) {
      if (event === 'message') messageListener = listener;
      else if (event === 'disconnect') disconnectListener = listener;
      return childProcess;
    },
    send(message: unknown, callback: (error: Error | null) => void) {
      posts.push({ message: structuredClone(message) });
      queueMicrotask(() => callback(sendError));
      return true;
    },
    exit: vi.fn(),
  };
  return {
    config,
    posts,
    childProcess,
    emit(message: unknown) {
      if (initializationListener) {
        const initialize = initializationListener;
        initializationListener = undefined;
        initialize(message);
        return;
      }
      if (!messageListener) throw new Error('Embedding worker listener was not registered');
      messageListener(message);
    },
    disconnect() {
      disconnectListener?.();
    },
    failSend() {
      sendError = new Error('IPC channel disconnected');
    },
    reset() {
      posts.length = 0;
      initializationListener = undefined;
      messageListener = undefined;
      disconnectListener = undefined;
      sendError = null;
      childProcess.exit.mockClear();
    },
  };
});

const transformerMocks = vi.hoisted(() => ({
  pipeline: vi.fn(),
  env: {
    version: '4.2.0',
    backends: { onnx: { versions: { node: '1.24.3', common: '1.24.3' } } },
    allowRemoteModels: true,
    allowLocalModels: false,
    useFSCache: true,
  },
}));

vi.mock('node:process', () => ({ default: workerMocks.childProcess }));

vi.mock('@huggingface/transformers', () => transformerMocks);

describe('reading memory embedding worker', () => {
  beforeEach(() => {
    vi.resetModules();
    workerMocks.reset();
    transformerMocks.pipeline.mockReset();
    transformerMocks.env.version = '4.2.0';
    transformerMocks.env.backends.onnx.versions.node = '1.24.3';
    transformerMocks.env.allowRemoteModels = true;
    transformerMocks.env.allowLocalModels = false;
    transformerMocks.env.useFSCache = true;
  });

  it('uses local-only inference, explicit prefixes, bounded tokens and exclusive buffers', async () => {
    const { extractor, batches } = createExtractor();
    transformerMocks.pipeline.mockResolvedValue(extractor);
    await startWorker();
    expect(transformerMocks.pipeline).not.toHaveBeenCalled();

    workerMocks.emit({
      type: 'embed',
      requestId: 1,
      purpose: 'query',
      texts: ['跨语言证据检索', 'Cross-language evidence retrieval'],
    });
    await vi.waitFor(() => expect(workerMocks.posts).toHaveLength(1));

    expect(transformerMocks.env).toMatchObject({
      allowRemoteModels: false,
      allowLocalModels: true,
      useFSCache: false,
    });
    expect(transformerMocks.pipeline).toHaveBeenCalledWith(
      'feature-extraction',
      workerMocks.config.modelDirectory,
      {
        local_files_only: true,
        subfolder: 'onnx',
        dtype: 'q4',
        device: 'cpu',
        session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 },
      },
    );
    expect(extractor.tokenizer).toHaveBeenNthCalledWith(
      1,
      [
        'task: search result | query: 跨语言证据检索',
        'task: search result | query: Cross-language evidence retrieval',
      ],
      { padding: true, truncation: true, max_length: 2048 },
    );
    expect(batches[0].output.normalize).toHaveBeenCalledWith(2, -1);
    expect(workerMocks.posts[0]).toMatchObject({
      message: { type: 'result', requestId: 1, count: 2, dimension: 768 },
    });
    const response = workerMocks.posts[0].message as { buffer: ArrayBuffer };
    expect(new Float32Array(response.buffer)).toEqual(unitVectors(2));
    expect(batches[0].normalized.data.byteLength).toBe(2 * 768 * 4);
    expect(batches[0].normalized.data.every((value) => value === 0)).toBe(true);
    for (const tensor of tensorsInBatch(batches[0])) {
      expect(tensor.dispose).toHaveBeenCalledOnce();
    }

    workerMocks.emit({ type: 'embed', requestId: 2, purpose: 'document', texts: ['本文の証拠'] });
    await vi.waitFor(() => expect(workerMocks.posts).toHaveLength(2));
    expect(transformerMocks.pipeline).toHaveBeenCalledOnce();
    expect(extractor.tokenizer).toHaveBeenNthCalledWith(2, ['title: none | text: 本文の証拠'], {
      padding: true,
      truncation: true,
      max_length: 2048,
    });
  });

  it('awaits asynchronous extractor disposal before acknowledging shutdown', async () => {
    const { extractor } = createExtractor();
    transformerMocks.pipeline.mockResolvedValue(extractor);
    await startWorker();
    workerMocks.emit({ type: 'embed', requestId: 1, purpose: 'query', texts: ['evidence'] });
    await vi.waitFor(() => expect(workerMocks.posts).toHaveLength(1));
    const disposal = deferred<void>();
    extractor.dispose.mockReturnValue(disposal.promise);

    workerMocks.emit({ type: 'dispose' });
    await vi.waitFor(() => expect(extractor.dispose).toHaveBeenCalledOnce());
    expect(workerMocks.posts).toHaveLength(1);
    disposal.resolve();
    await vi.waitFor(() => expect(workerMocks.posts).toHaveLength(2));
    expect(workerMocks.posts[1].message).toEqual({ type: 'disposed' });
  });

  it('runs at most four texts at once and preserves the full batch order', async () => {
    const { extractor, batches } = createExtractor();
    transformerMocks.pipeline.mockResolvedValue(extractor);
    await startWorker();
    const texts = Array.from({ length: 9 }, (_, index) => `evidence-${index}`);
    workerMocks.emit({ type: 'embed', requestId: 1, purpose: 'document', texts });
    await vi.waitFor(() => expect(workerMocks.posts).toHaveLength(1));

    expect(extractor.model).toHaveBeenCalledTimes(3);
    expect(extractor.tokenizer.mock.calls.map(([batch]) => batch)).toEqual([
      texts.slice(0, 4).map((text) => `${workerMocks.config.documentPrefix}${text}`),
      texts.slice(4, 8).map((text) => `${workerMocks.config.documentPrefix}${text}`),
      texts.slice(8).map((text) => `${workerMocks.config.documentPrefix}${text}`),
    ]);
    const response = workerMocks.posts[0].message as { buffer: ArrayBuffer; count: number };
    expect(response.count).toBe(9);
    expect(new Float32Array(response.buffer)).toEqual(unitVectors(9));
    for (const batch of batches) {
      for (const tensor of tensorsInBatch(batch)) expect(tensor.dispose).toHaveBeenCalledOnce();
    }
  });

  it('rejects invalid tensor output while releasing every temporary tensor', async () => {
    const { extractor, batches } = createExtractor({ invalidDimension: true });
    transformerMocks.pipeline.mockResolvedValue(extractor);
    await startWorker();
    workerMocks.emit({ type: 'embed', requestId: 1, purpose: 'query', texts: ['evidence'] });
    await vi.waitFor(() => expect(workerMocks.posts).toHaveLength(1));

    expect(workerMocks.posts[0].message).toEqual({
      type: 'error',
      requestId: 1,
      message: 'Embedding model returned an invalid tensor shape',
    });
    for (const tensor of tensorsInBatch(batches[0])) {
      expect(tensor.dispose).toHaveBeenCalledOnce();
    }
  });

  it.each(['runtime', 'backend'] as const)(
    'rejects a mismatched %s version before loading a model',
    async (kind) => {
      if (kind === 'runtime') transformerMocks.env.version = '4.1.0';
      else transformerMocks.env.backends.onnx.versions.node = '1.23.0';
      await startWorker();
      workerMocks.emit({ type: 'embed', requestId: 1, purpose: 'query', texts: ['evidence'] });
      await vi.waitFor(() => expect(workerMocks.posts).toHaveLength(1));
      expect(workerMocks.posts[0].message).toMatchObject({ type: 'error', requestId: 1 });
      expect(transformerMocks.pipeline).not.toHaveBeenCalled();
    },
  );

  it('requires a valid initialization message before accepting requests', async () => {
    await import('./reading-memory-embedding-worker');
    expect(() =>
      workerMocks.emit({ type: 'embed', requestId: 1, purpose: 'query', texts: ['evidence'] }),
    ).toThrow('First embedding message must initialize');
    expect(transformerMocks.pipeline).not.toHaveBeenCalled();
  });

  it('exits when the parent IPC channel disconnects', async () => {
    await startWorker();
    workerMocks.disconnect();
    expect(workerMocks.childProcess.exit).toHaveBeenCalledWith(0);
  });

  it('exits if sending a result over IPC fails', async () => {
    const { extractor } = createExtractor();
    transformerMocks.pipeline.mockResolvedValue(extractor);
    await startWorker();
    workerMocks.failSend();
    workerMocks.emit({ type: 'embed', requestId: 1, purpose: 'query', texts: ['evidence'] });
    await vi.waitFor(() => expect(workerMocks.childProcess.exit).toHaveBeenCalledWith(1));
  });
});

async function startWorker() {
  await import('./reading-memory-embedding-worker');
  expect(transformerMocks.pipeline).not.toHaveBeenCalled();
  workerMocks.emit({ type: 'initialize', config: workerMocks.config });
}

function createExtractor({ invalidDimension = false } = {}) {
  const batches: ReturnType<typeof tensorBatch>[] = [];
  let rowOffset = 0;
  const extractor = {
    tokenizer: vi.fn((texts: string[]) => {
      const batch = tensorBatch(texts.length, invalidDimension, rowOffset);
      rowOffset += texts.length;
      batches.push(batch);
      return batch.inputs;
    }),
    model: vi.fn(async () => {
      const batch = batches.at(-1)!;
      return { sentence_embedding: batch.output, extra_output: batch.extraOutput };
    }),
    dispose: vi.fn(() => Promise.resolve()),
  };
  return { extractor, batches };
}

function tensorBatch(count: number, invalidDimension: boolean, rowOffset: number) {
  const normalized = {
    type: 'float32',
    dims: [count, invalidDimension ? 384 : 768],
    data: unitVectors(count, rowOffset),
    dispose: vi.fn(() => normalized.data.fill(0)),
  };
  const output = {
    normalize: vi.fn(() => normalized),
    dispose: vi.fn(),
  };
  return {
    inputs: { input_ids: { dispose: vi.fn() }, attention_mask: { dispose: vi.fn() } },
    output,
    normalized,
    extraOutput: { dispose: vi.fn() },
  };
}

function tensorsInBatch(batch: ReturnType<typeof tensorBatch>) {
  return [...Object.values(batch.inputs), batch.output, batch.normalized, batch.extraOutput];
}

function unitVectors(count: number, rowOffset = 0) {
  const vectors = new Float32Array(count * 768);
  for (let index = 0; index < count; index += 1) vectors[index * 768 + rowOffset + index] = 1;
  return vectors;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
