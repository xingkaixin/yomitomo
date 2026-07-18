import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentMessagePayload,
  Annotation,
  AppSettings,
  LlmProvider,
} from '@yomitomo/shared';
import { desktopIpcErrorCodes } from '../../ipc-errors';

const runtimeMocks = vi.hoisted(() => ({
  runAgentCreateThoughtWithToolLoop: vi.fn(),
  runAgentDistillationReviewWithToolLoop: vi.fn(),
  runAgentThreadReplyWithToolLoop: vi.fn(),
}));
const memoryMocks = vi.hoisted(() => ({
  agentAnnotatePayloadWithReadingMemoryEntries: vi.fn(
    (input: { payload: unknown }) => input.payload,
  ),
  agentMessagePayloadWithReadingMemoryView: vi.fn((input: { payload: unknown }) => input.payload),
  saveAgentAnnotateReadingMemoryEntries: vi.fn(),
}));
const traceMocks = vi.hoisted(() => ({
  appendAgentRuntimeTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./agent-thread-runtime', () => runtimeMocks);
vi.mock('./agent-reading-memory', () => memoryMocks);
vi.mock('./agent-runtime-trace-log', () => traceMocks);

import {
  executeAgentAnnotationTask,
  executeAgentCommentTask,
  executeAgentDistillationReviewTask,
  type AgentTaskExecutionContext,
} from './agent-task-execution';

beforeEach(() => {
  vi.clearAllMocks();
  traceMocks.appendAgentRuntimeTrace.mockResolvedValue(undefined);
  memoryMocks.agentAnnotatePayloadWithReadingMemoryEntries.mockImplementation(
    (input: { payload: unknown }) => input.payload,
  );
  memoryMocks.agentMessagePayloadWithReadingMemoryView.mockImplementation(
    (input: { payload: unknown }) => input.payload,
  );
});

describe('executeAgentCommentTask', () => {
  it('owns fast response routing, streaming, and execution recording', async () => {
    const fixture = taskFixture();
    fixture.ai.runAgentStream.mockImplementation(async (_provider, _agent, _payload, onDelta) => {
      onDelta('fast ');
      onDelta('reply');
    });
    const events: unknown[] = [];

    const result = await executeAgentCommentTask(fixture.context, messagePayload(), (event) =>
      events.push(event),
    );

    expect(result).toMatchObject({
      content: 'fast reply',
      pending: false,
      replyTo: 'comment_user',
    });
    expect(events).toEqual([
      { type: 'start', comment: expect.objectContaining({ pending: true }) },
      { type: 'delta', delta: 'fast ' },
      { type: 'delta', delta: 'reply' },
    ]);
    expect(runtimeMocks.runAgentThreadReplyWithToolLoop).not.toHaveBeenCalled();
    await expectExecutionRecorded(fixture, {
      taskType: 'thread_reply',
      requestedMode: 'fast_response',
      effectiveMode: 'fast_response',
    });
  });

  it('streams deep runtime text and progress through the task interface', async () => {
    const fixture = taskFixture({ settings: { assistantExecutionMode: 'deep_verification' } });
    runtimeMocks.runAgentThreadReplyWithToolLoop.mockImplementation(async (input) => {
      input.onRuntimeEvent({
        type: 'tool_call',
        toolName: 'get_anchor_context',
        stepIndex: 0,
      });
      input.onRuntimeEvent({ type: 'text_delta', delta: 'deep reply' });
      input.onRuntimeEvent({
        type: 'tool_result',
        toolName: 'get_anchor_context',
        stepIndex: 0,
        ok: true,
      });
      return {
        status: 'comment',
        comment: { content: 'deep reply' },
        runtime: runtimeTrace(),
      };
    });
    const events: unknown[] = [];

    const result = await executeAgentCommentTask(fixture.context, messagePayload(), (event) =>
      events.push(event),
    );

    expect(result).toMatchObject({
      content: 'deep reply',
      assistantProgress: {
        steps: [{ id: 'get_anchor_context', status: 'done' }],
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'delta', delta: 'deep reply' },
        {
          type: 'progress',
          progress: {
            type: 'step',
            step: {
              id: 'get_anchor_context',
              label: 'get_anchor_context',
              status: 'done',
            },
          },
        },
      ]),
    );
    expect(fixture.ai.runAgentStream).not.toHaveBeenCalled();
    await expectExecutionRecorded(fixture, {
      taskType: 'thread_reply',
      requestedMode: 'deep_verification',
      effectiveMode: 'deep_verification',
    });
  });

  it('records the reason when deep execution falls back to fast response', async () => {
    const fixture = taskFixture({ settings: { assistantExecutionMode: 'deep_verification' } });
    runtimeMocks.runAgentThreadReplyWithToolLoop.mockResolvedValue({
      status: 'fallback',
      failureReason: 'tool_loop_failed',
    });
    fixture.ai.runAgentStream.mockImplementation(async (_provider, _agent, _payload, onDelta) => {
      onDelta('fallback reply');
    });

    const result = await executeAgentCommentTask(fixture.context, messagePayload(), vi.fn());

    expect(result.content).toBe('fallback reply');
    await expectExecutionRecorded(fixture, {
      taskType: 'thread_reply',
      effectiveMode: 'fast_response',
      fallbackReason: 'tool_loop_failed',
    });
  });

  it('rejects missing agents before loading the AI module', async () => {
    const fixture = taskFixture({ agents: [] });

    await expect(
      executeAgentCommentTask(fixture.context, messagePayload(), vi.fn()),
    ).rejects.toMatchObject({ code: desktopIpcErrorCodes.agentNotFound });
    expect(fixture.context.getAiModule).not.toHaveBeenCalled();
  });
});

describe('executeAgentDistillationReviewTask', () => {
  it('runs structured fast review behind the task interface', async () => {
    const reviewAgent = agent({ id: 'review_1', kind: 'review', username: 'reviewer' });
    const fixture = taskFixture({ agents: [reviewAgent] });
    fixture.ai.runAgentDistillationReviewStructuredStream.mockResolvedValue({
      id: '',
      author: 'ai',
      content: 'review result',
      createdAt: '2026-07-18T00:00:00.000Z',
      items: [],
      proposals: [],
    });
    const events: unknown[] = [];

    const result = await executeAgentDistillationReviewTask(
      fixture.context,
      {
        ...messagePayload(),
        agentId: reviewAgent.id,
        agentUsername: reviewAgent.username,
        responseMode: 'distillation_review',
      },
      (event) => events.push(event),
    );

    expect(result.content).toBe('review result');
    expect(events).toEqual([{ type: 'start', message: expect.objectContaining({ author: 'ai' }) }]);
    await expectExecutionRecorded(fixture, {
      taskType: 'distillation_review',
      effectiveMode: 'fast_response',
    });
  });
});

describe('executeAgentAnnotationTask', () => {
  it('owns memory preparation, item streaming, and usage recording', async () => {
    const fixture = taskFixture();
    const generatedAnnotation = annotation({ id: 'annotation_generated', author: 'ai' });
    fixture.ai.runAgentAnnotateStream.mockImplementation(
      async (_provider, _agent, _payload, onAnnotation) => {
        onAnnotation(generatedAnnotation);
        return {
          annotations: [generatedAnnotation],
          usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
        };
      },
    );
    const events: unknown[] = [];

    const result = await executeAgentAnnotationTask(fixture.context, annotatePayload(), (event) =>
      events.push(event),
    );

    expect(result.annotations).toEqual([generatedAnnotation]);
    expect(events).toEqual([{ type: 'start' }, { type: 'item', annotation: generatedAnnotation }]);
    expect(memoryMocks.saveAgentAnnotateReadingMemoryEntries).toHaveBeenCalledOnce();
    await expectExecutionRecorded(fixture, {
      taskType: 'annotation',
      effectiveMode: 'fast_response',
      usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
    });
  });
});

type TaskAiModule = Awaited<ReturnType<AgentTaskExecutionContext['getAiModule']>>;

function taskFixture(
  overrides: {
    agents?: Agent[];
    providers?: LlmProvider[];
    settings?: Partial<AppSettings>;
  } = {},
) {
  const store = storeWith(overrides);
  const ai = {
    buildAgentCreateThoughtRuntimePayload: vi.fn(),
    buildAgentDistillationReviewRuntimePayload: vi.fn(),
    buildAgentThreadReplyRuntimePayload: vi.fn(),
    runAgentAnnotateStream: vi.fn(),
    runAgentDistillationReviewStructuredStream: vi.fn(),
    runAgentStream: vi.fn(),
    runAssistantAiSdkToolRuntime: vi.fn(),
  } as unknown as { [Key in keyof TaskAiModule]: ReturnType<typeof vi.fn> };
  const assistantExecutionPersistence = {
    recordAssistantExecutionRun: vi.fn().mockResolvedValue(undefined),
  };
  const context: AgentTaskExecutionContext = {
    elapsedMs: () => 12,
    getAiModule: vi.fn(async () => ai as unknown as TaskAiModule),
    getPersistenceModule: vi.fn(async () => ({
      agentRuntimePersistence: {
        readAgentRuntimeContext: vi.fn(async () => store),
      },
      assistantExecutionPersistence,
      providerPersistence: {
        hydrateProviderApiKey: vi.fn(async (provider: LlmProvider) => provider),
      },
    })),
    logError: vi.fn(),
    logInfo: vi.fn(),
  };
  return { ai, assistantExecutionPersistence, context };
}

async function expectExecutionRecorded(
  fixture: ReturnType<typeof taskFixture>,
  expected: Record<string, unknown>,
) {
  await vi.waitFor(() => {
    expect(fixture.assistantExecutionPersistence.recordAssistantExecutionRun).toHaveBeenCalledWith(
      expect.objectContaining(expected),
    );
  });
}

function storeWith(overrides: {
  agents?: Agent[];
  providers?: LlmProvider[];
  settings?: Partial<AppSettings>;
}) {
  return {
    agents: overrides.agents ?? [agent()],
    providers: overrides.providers ?? [providerRecord()],
    settings: {
      assistantExecutionMode: 'fast_response',
      defaultProviderId: 'provider_1',
      readingAssistantProviderId: 'provider_1',
      reviewAssistantProviderId: 'provider_1',
      uiLanguage: 'zh-CN',
      ...overrides.settings,
    } as AppSettings,
  };
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    enabled: true,
    providerId: 'provider_1',
    nickname: 'Agent',
    username: 'agent',
    avatar: '',
    annotationColor: '#54cda0',
    annotationDensity: 'medium',
    temperature: 0.3,
    soul: 'soul',
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  };
}

function providerRecord(): LlmProvider {
  return {
    id: 'provider_1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://api.example.com',
    apiKey: '',
    hasApiKey: false,
    modelName: 'model',
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
  };
}

function messagePayload(): AgentMessagePayload {
  return {
    agentId: 'agent_1',
    agentUsername: 'agent',
    article: {
      id: 'article_1',
      title: 'Article',
      url: 'https://example.com/article',
      text: 'Article text',
    },
    annotation: annotation(),
    userComment: {
      id: 'comment_user',
      author: 'user',
      content: 'question',
      createdAt: '2026-07-18T00:00:00.000Z',
      userId: 'user_1',
    },
  };
}

function annotatePayload(): AgentAnnotatePayload {
  return {
    agentId: 'agent_1',
    agentUsername: 'agent',
    article: {
      id: 'article_1',
      title: 'Article',
      url: 'https://example.com/article',
      text: 'Article text',
    },
  };
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: { exact: 'quote', prefix: '', suffix: '', start: 0, end: 5 },
    author: 'user',
    color: '#f59e0b',
    comments: [],
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    userId: 'user_1',
    ...overrides,
  };
}

function runtimeTrace() {
  return {
    repairUsed: false,
    trace: {
      agentId: 'agent_1',
      articleId: 'article_1',
      finalActionType: 'reply',
      steps: [],
      usage: {},
    },
  };
}
