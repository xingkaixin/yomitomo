import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmProvider } from '@yomitomo/shared';
import { isStepCount } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { Effect, Fiber } from 'effect';

type StreamTextOptions = {
  abortSignal?: AbortSignal;
  tools: Record<
    string,
    {
      execute: (input: unknown, options: { toolCallId: string }) => Promise<unknown>;
    }
  >;
  prepareStep?: (input: { stepNumber: number }) =>
    | {
        toolChoice?: { type: 'tool'; toolName: string };
      }
    | undefined;
};

type ModelStreamPart =
  Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer Part>
    ? Part
    : never;

let streamTextImpl: ((options: StreamTextOptions) => unknown) | undefined;
let languageModel: MockLanguageModelV4 | undefined;

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    isStepCount: vi.fn(actual.isStepCount),
    streamText: vi.fn((options: Parameters<typeof actual.streamText>[0]) =>
      streamTextImpl
        ? streamTextImpl(options as unknown as StreamTextOptions)
        : actual.streamText(options),
    ),
  };
});

vi.mock('../provider/ai-sdk-provider-adapter', () => ({
  createYomitomoLanguageModel: vi.fn(() => ({
    model: languageModel,
    providerOptions: {},
  })),
  supportsProviderTools: vi.fn(() => true),
}));

describe('assistant AI SDK tool runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamTextImpl = undefined;
    languageModel = undefined;
  });

  it('executes AI SDK tools, records trace, and wraps final text as a thread reply', async () => {
    streamTextImpl = (options) => ({
      fullStream: (async function* () {
        await options.tools.get_current_thread.execute({}, { toolCallId: 'call_thread' });
        yield textDelta('基于当前 thread ');
        yield textDelta('给出回复。');
      })(),
      finishReason: Promise.resolve('stop'),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 6, totalTokens: 16 }),
    });
    const { runAssistantAiSdkToolRuntime } = await import('./assistant-runtime');
    const events: unknown[] = [];

    const result = await runAssistantAiSdkToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      provider: provider(),
      payload: { system: 'system', user: 'user', maxTokens: 1200, temperature: 0.4 },
      allowedAnnotationIds: ['annotation_1'],
      tools: [{ name: 'get_current_thread', description: '读取当前 thread' }],
      onEvent: (event) => events.push(event),
      toolExecutor: vi.fn(async () => ({
        ok: true as const,
        evidence: [
          {
            summary: '当前 thread evidence',
            provenance: { articleId: 'article_1', sourceType: 'annotation' as const },
          },
        ],
      })),
    });

    expect(result.status).toBe('final');
    expect(result.status === 'final' ? result.action : null).toMatchObject({
      type: 'reply_to_thread',
      annotationId: 'annotation_1',
      content: '基于当前 thread 给出回复。',
    });
    expect(result.evidence.map((item) => item.id)).toEqual(['evidence_0_0']);
    expect(result.trace.steps.map((step) => step.eventType)).toEqual(['tool_call', 'final_action']);
    expect(result.trace.usage).toEqual({ inputTokens: 10, outputTokens: 6, totalTokens: 16 });
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'tool_call', toolName: 'get_current_thread', stepIndex: 0 },
        { type: 'tool_result', toolName: 'get_current_thread', stepIndex: 0, ok: true },
        { type: 'text_delta', delta: '基于当前 thread ' },
        { type: 'text_delta', delta: '给出回复。' },
      ]),
    );
  });

  it('applies the runtime step budget across repeated tool calls', async () => {
    streamTextImpl = (options) => ({
      fullStream: (async function* () {
        await options.tools.get_current_thread.execute({}, { toolCallId: 'call_thread_1' });
        await options.tools.get_current_thread.execute({}, { toolCallId: 'call_thread_2' });
        yield textDelta('连续读取后回复。');
      })(),
      finishReason: Promise.resolve('stop'),
      usage: Promise.resolve({}),
    });
    const { runAssistantAiSdkToolRuntime } = await import('./assistant-runtime');
    const toolExecutor = vi.fn(async () => ({
      ok: true as const,
      evidence: [
        {
          summary: '当前 thread evidence',
          provenance: { articleId: 'article_1', sourceType: 'annotation' as const },
        },
      ],
    }));

    const result = await runAssistantAiSdkToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      provider: provider(),
      payload: { system: 'system', user: 'user', maxTokens: 1200 },
      allowedAnnotationIds: ['annotation_1'],
      budget: { maxSteps: 3 },
      tools: [{ name: 'get_current_thread' }],
      toolExecutor,
    });

    expect(isStepCount).toHaveBeenCalledWith(3);
    expect(toolExecutor).toHaveBeenCalledTimes(2);
    expect(result.evidence.map((item) => item.id)).toEqual(['evidence_0_0', 'evidence_1_0']);
    expect(result.trace.steps.map((step) => step.eventType)).toEqual([
      'tool_call',
      'tool_call',
      'final_action',
    ]);
  });

  it('forces the first runtime step to collect thread evidence', async () => {
    let firstStepSettings: ReturnType<NonNullable<StreamTextOptions['prepareStep']>>;
    streamTextImpl = (options) => {
      firstStepSettings = options.prepareStep?.({ stepNumber: 0 });
      return {
        fullStream: (async function* () {
          yield textDelta('直接回复。');
        })(),
        finishReason: Promise.resolve('stop'),
        usage: Promise.resolve({}),
      };
    };
    const { runAssistantAiSdkToolRuntime } = await import('./assistant-runtime');

    await runAssistantAiSdkToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      provider: provider(),
      payload: { system: 'system', user: 'user', maxTokens: 1200 },
      allowedAnnotationIds: ['annotation_1'],
      tools: [
        { name: 'get_anchor_context' },
        { name: 'get_current_thread' },
        { name: 'search_article_passages' },
      ],
      toolExecutor: vi.fn(),
    });

    expect(firstStepSettings).toEqual({
      toolChoice: { type: 'tool', toolName: 'get_current_thread' },
    });
  });

  it('falls back when tool evidence belongs to another article', async () => {
    streamTextImpl = (options) => ({
      fullStream: (async function* () {
        await options.tools.get_current_thread.execute({}, { toolCallId: 'call_thread' });
        yield textDelta('不会到达这里');
      })(),
      finishReason: Promise.resolve('stop'),
      usage: Promise.resolve({}),
    });
    const { runAssistantAiSdkToolRuntime } = await import('./assistant-runtime');

    const result = await runAssistantAiSdkToolRuntime({
      taskType: 'create_thought',
      articleId: 'article_1',
      agentId: 'agent_1',
      provider: provider(),
      payload: { system: 'system', user: 'user', maxTokens: 1200 },
      allowedAnnotationIds: ['annotation_1'],
      tools: [{ name: 'get_current_thread' }],
      toolExecutor: vi.fn(async () => ({
        ok: true as const,
        evidence: [
          {
            summary: 'wrong article',
            provenance: { articleId: 'article_2', sourceType: 'annotation' as const },
          },
        ],
      })),
    });

    expect(result).toMatchObject({
      status: 'fallback',
      failureReason: 'evidence_article_mismatch:article_2',
    });
  });

  it('falls back when the provider stream fails before yielding text', async () => {
    streamTextImpl = () => {
      throw new Error('provider offline');
    };
    const { runAssistantAiSdkToolRuntime } = await import('./assistant-runtime');

    const result = await runAssistantAiSdkToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      provider: provider(),
      payload: { system: 'system', user: 'user', maxTokens: 1200 },
      allowedAnnotationIds: ['annotation_1'],
      tools: [{ name: 'get_current_thread' }],
      toolExecutor: vi.fn(),
    });

    expect(result).toMatchObject({
      status: 'fallback',
      failureReason: 'provider offline',
    });
  });

  it('falls back when the provider stream reports an error after partial text', async () => {
    languageModel = new MockLanguageModelV4({
      doStream: modelStream([
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: 'partial ' },
        { type: 'error', error: { message: 'Overloaded', type: 'overloaded_error' } },
        { type: 'finish', finishReason: { unified: 'error', raw: undefined }, usage: modelUsage },
      ]),
    });
    const { runAssistantAiSdkToolRuntime } = await import('./assistant-runtime');

    const result = await runAssistantAiSdkToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      provider: provider(),
      payload: { system: 'system', user: 'user', maxTokens: 1200 },
      allowedAnnotationIds: ['annotation_1'],
      tools: [],
      toolExecutor: vi.fn(),
    });

    expect(result).toMatchObject({ status: 'fallback', failureReason: 'Overloaded' });
  });

  it('falls back when a tool executor throws during streaming', async () => {
    languageModel = new MockLanguageModelV4({
      doStream: [
        modelStream([
          {
            type: 'tool-call',
            toolCallId: 'call_thread',
            toolName: 'get_current_thread',
            input: '{}',
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage: modelUsage,
          },
        ]),
        modelStream([
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: '不会到达这里' },
          { type: 'text-end', id: 'text' },
          { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: modelUsage },
        ]),
      ],
    });
    const { runAssistantAiSdkToolRuntime } = await import('./assistant-runtime');

    const result = await runAssistantAiSdkToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      provider: provider(),
      payload: { system: 'system', user: 'user', maxTokens: 1200 },
      allowedAnnotationIds: ['annotation_1'],
      tools: [{ name: 'get_current_thread' }],
      toolExecutor: vi.fn(async () => {
        throw new Error('tool database unavailable');
      }),
    });

    expect(result).toMatchObject({
      status: 'fallback',
      failureReason: 'tool database unavailable',
    });
  });

  it('aborts the AI SDK stream when its Effect fiber is interrupted', async () => {
    const started = createDeferred<AbortSignal>();
    streamTextImpl = (options) => {
      if (!options.abortSignal) throw new Error('Expected AI SDK AbortSignal');
      started.resolve(options.abortSignal);
      return {
        fullStream: (async function* () {
          await new Promise<void>((_resolve, reject) => {
            options.abortSignal?.addEventListener(
              'abort',
              () => reject(options.abortSignal?.reason),
              { once: true },
            );
          });
          yield textDelta('不会到达这里');
        })(),
        finishReason: Promise.resolve('stop'),
        usage: Promise.resolve({}),
      };
    };
    const { runAssistantAiSdkToolRuntimeEffect } = await import('./assistant-ai-sdk-runtime');
    const fiber = Effect.runFork(
      runAssistantAiSdkToolRuntimeEffect({
        taskType: 'thread_reply',
        articleId: 'article_1',
        agentId: 'agent_1',
        provider: provider(),
        payload: { system: 'system', user: 'user', maxTokens: 1200 },
        allowedAnnotationIds: ['annotation_1'],
        tools: [],
        toolExecutor: vi.fn(),
      }),
    );

    const signal = await started.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(signal.aborted).toBe(true);
  });
});

const modelUsage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function modelStream(parts: ModelStreamPart[]) {
  return {
    stream: convertArrayToReadableStream<ModelStreamPart>([
      { type: 'stream-start', warnings: [] },
      ...parts,
    ]),
  };
}

function textDelta(text: string) {
  return { type: 'text-delta' as const, id: 'text', text };
}

function provider(): LlmProvider {
  return {
    id: 'provider_1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://example.com',
    apiKey: 'key',
    modelName: 'model',
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
}

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: (value: T) => resolvePromise?.(value) };
}
