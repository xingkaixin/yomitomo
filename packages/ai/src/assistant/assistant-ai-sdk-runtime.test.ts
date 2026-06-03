import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmProvider } from '@yomitomo/shared';

type StreamTextOptions = {
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

let streamTextImpl: (options: StreamTextOptions) => unknown;

vi.mock('ai', () => ({
  jsonSchema: vi.fn((schema: unknown) => ({ schema })),
  stepCountIs: vi.fn((count: number) => ({ count })),
  streamText: vi.fn((options: StreamTextOptions) => streamTextImpl(options)),
}));

vi.mock('./ai-sdk-provider-adapter', () => ({
  createYomitomoLanguageModel: vi.fn(() => ({
    model: 'model',
    providerOptions: {},
  })),
  supportsProviderTools: vi.fn(() => true),
}));

describe('assistant AI SDK tool runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes AI SDK tools, records trace, and wraps final text as a thread reply', async () => {
    streamTextImpl = (options) => ({
      textStream: (async function* () {
        await options.tools.get_current_thread.execute({}, { toolCallId: 'call_thread' });
        yield '基于当前 thread ';
        yield '给出回复。';
      })(),
      finishReason: Promise.resolve('stop'),
      totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 6, totalTokens: 16 }),
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
            provenance: { articleId: 'article_1', sourceType: 'annotation' },
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

  it('forces the first runtime step to collect thread evidence', async () => {
    let firstStepSettings: ReturnType<NonNullable<StreamTextOptions['prepareStep']>>;
    streamTextImpl = (options) => {
      firstStepSettings = options.prepareStep?.({ stepNumber: 0 });
      return {
        textStream: (async function* () {
          yield '直接回复。';
        })(),
        finishReason: Promise.resolve('stop'),
        totalUsage: Promise.resolve({}),
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
      textStream: (async function* () {
        await options.tools.get_current_thread.execute({}, { toolCallId: 'call_thread' });
        yield '不会到达这里';
      })(),
      finishReason: Promise.resolve('stop'),
      totalUsage: Promise.resolve({}),
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
            provenance: { articleId: 'article_2', sourceType: 'annotation' },
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

  it('falls back when a tool executor throws during streaming', async () => {
    streamTextImpl = (options) => ({
      textStream: (async function* () {
        await options.tools.get_current_thread.execute({}, { toolCallId: 'call_thread' });
        yield '不会到达这里';
      })(),
      finishReason: Promise.resolve('stop'),
      totalUsage: Promise.resolve({}),
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
});

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
