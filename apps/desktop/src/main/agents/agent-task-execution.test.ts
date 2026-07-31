import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  Annotation,
  AppSettings,
  LlmProvider,
} from '@yomitomo/shared';
import { desktopIpcErrorCodes } from '../../ipc-errors';

const runtimeMocks = vi.hoisted(() => ({
  runAgentMessageWithToolLoop: vi.fn(),
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

vi.mock('./agent-message-runtime', () => runtimeMocks);
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
  it('loads persistence before AI for a comment task', async () => {
    const fixture = taskFixture();
    const order: string[] = [];
    fixture.getPersistenceModules.mockImplementation(async () => {
      order.push('persistence');
      return fixture.persistence;
    });
    fixture.getAiModule.mockImplementation(async () => {
      order.push('ai');
      return fixture.ai as unknown as TaskAiModule;
    });
    fixture.ai.runAgentStream.mockResolvedValue(undefined);

    await executeAgentCommentTask(fixture.context, messagePayload(), vi.fn());

    expect(order.slice(0, 2)).toEqual(['persistence', 'ai']);
  });

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
    expect(runtimeMocks.runAgentMessageWithToolLoop).not.toHaveBeenCalled();
    await expectExecutionRecorded(fixture, {
      taskType: 'thread_reply',
      requestedMode: 'fast_response',
      effectiveMode: 'fast_response',
    });
    expect(executionRows(fixture)).toHaveLength(1);
  });

  it('streams deep runtime text and progress through the task interface', async () => {
    const fixture = taskFixture({ settings: { assistantExecutionMode: 'deep_verification' } });
    runtimeMocks.runAgentMessageWithToolLoop.mockImplementation(async (input) => {
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
    expect(traceMocks.appendAgentRuntimeTrace).toHaveBeenCalledOnce();
    expect(executionRows(fixture)).toHaveLength(1);
  });

  it('records runtime fallback then fast success as two execution attempts', async () => {
    const fixture = taskFixture({ settings: { assistantExecutionMode: 'deep_verification' } });
    runtimeMocks.runAgentMessageWithToolLoop.mockResolvedValue({
      status: 'fallback',
      failureReason: 'tool_loop_failed',
      runtime: runtimeTrace(),
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
    await vi.waitFor(() => expect(executionRows(fixture)).toHaveLength(2));
    expect(executionRows(fixture)).toEqual([
      expect.objectContaining({
        taskType: 'thread_reply',
        effectiveMode: 'deep_verification',
        status: 'fallback',
        fallbackReason: 'tool_loop_failed',
      }),
      expect.objectContaining({
        taskType: 'thread_reply',
        effectiveMode: 'fast_response',
        status: 'success',
        fallbackReason: 'tool_loop_failed',
      }),
    ]);
    expect(traceMocks.appendAgentRuntimeTrace).toHaveBeenCalledOnce();
  });

  it('falls back after a skipped deep runtime without recording a runtime attempt', async () => {
    const fixture = taskFixture({ settings: { assistantExecutionMode: 'deep_verification' } });
    runtimeMocks.runAgentMessageWithToolLoop.mockResolvedValue({
      status: 'fallback',
      failureReason: 'missing_article_id',
    });
    fixture.ai.runAgentStream.mockImplementation(async (_provider, _agent, _payload, onDelta) => {
      onDelta('fast reply');
    });

    const result = await executeAgentCommentTask(fixture.context, messagePayload(), vi.fn());

    expect(result.content).toBe('fast reply');
    await vi.waitFor(() => expect(executionRows(fixture)).toHaveLength(1));
    expect(executionRows(fixture)).toEqual([
      expect.objectContaining({
        effectiveMode: 'fast_response',
        fallbackReason: 'missing_article_id',
      }),
    ]);
    expect(traceMocks.appendAgentRuntimeTrace).not.toHaveBeenCalled();
  });

  it('rejects missing agents before loading the AI module', async () => {
    const fixture = taskFixture({ agents: [] });

    await expect(
      executeAgentCommentTask(fixture.context, messagePayload(), vi.fn()),
    ).rejects.toMatchObject({ code: desktopIpcErrorCodes.agentNotFound });
    expect(fixture.context.getAiModule).not.toHaveBeenCalled();
  });

  it('does not load AI, read credentials, or record an E2E fake response', async () => {
    const fixture = taskFixture({
      providers: [{ ...providerRecord(), baseUrl: 'https://e2e.invalid/yomitomo-ai' }],
    });
    const previousE2e = process.env.YOMITOMO_E2E;
    process.env.YOMITOMO_E2E = '1';

    try {
      const events: unknown[] = [];
      const result = await executeAgentCommentTask(fixture.context, messagePayload(), (event) =>
        events.push(event),
      );

      expect(result).toMatchObject({ pending: false, content: expect.stringContaining('fake AI') });
      expect(events).toEqual([
        { type: 'start', comment: expect.objectContaining({ pending: true }) },
        { type: 'delta', delta: expect.stringContaining('fake AI') },
      ]);
      expect(fixture.context.getAiModule).not.toHaveBeenCalled();
      expect(fixture.persistence.providerRepository.hydrateProviderApiKey).not.toHaveBeenCalled();
      expect(executionRows(fixture)).toHaveLength(0);
    } finally {
      if (previousE2e === undefined) delete process.env.YOMITOMO_E2E;
      else process.env.YOMITOMO_E2E = previousE2e;
    }
  });

  it('does not create an execution row when provider resolution fails', async () => {
    const fixture = taskFixture();
    fixture.persistence.providerRepository.hydrateProviderApiKey.mockRejectedValue(
      new Error('provider unavailable'),
    );

    await expect(
      executeAgentCommentTask(fixture.context, messagePayload(), vi.fn()),
    ).rejects.toThrow('provider unavailable');

    expect(fixture.context.getAiModule).toHaveBeenCalledOnce();
    expect(executionRows(fixture)).toHaveLength(0);
  });
});

describe('executeAgentDistillationReviewTask', () => {
  it('loads AI before persistence for a review task', async () => {
    const reviewAgent = agent({ id: 'review_1', kind: 'review', username: 'reviewer' });
    const fixture = taskFixture({ agents: [reviewAgent] });
    const order: string[] = [];
    fixture.getPersistenceModules.mockImplementation(async () => {
      order.push('persistence');
      return fixture.persistence;
    });
    fixture.getAiModule.mockImplementation(async () => {
      order.push('ai');
      return fixture.ai as unknown as TaskAiModule;
    });
    fixture.ai.runAgentDistillationReviewStructuredStream.mockResolvedValue(
      reviewMessage(reviewAgent),
    );

    await executeAgentDistillationReviewTask(fixture.context, reviewPayload(reviewAgent), vi.fn());

    expect(order.slice(0, 2)).toEqual(['ai', 'persistence']);
  });

  it('runs structured fast review behind the task interface', async () => {
    const reviewAgent = agent({ id: 'review_1', kind: 'review', username: 'reviewer' });
    const fixture = taskFixture({ agents: [reviewAgent] });
    fixture.ai.runAgentDistillationReviewStructuredStream.mockResolvedValue(
      reviewMessage(reviewAgent),
    );
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
    expect(events).toEqual([
      {
        type: 'start',
        message: expect.objectContaining({
          author: expect.objectContaining({
            kind: 'agent',
            agentId: reviewAgent.id,
            username: reviewAgent.username,
          }),
        }),
      },
    ]);
    await expectExecutionRecorded(fixture, {
      taskType: 'distillation_review',
      effectiveMode: 'fast_response',
    });
  });

  it('preserves runtime review events before the final runtime message', async () => {
    const reviewAgent = agent({ id: 'review_1', kind: 'review', username: 'reviewer' });
    const fixture = taskFixture({
      agents: [reviewAgent],
      settings: { assistantExecutionMode: 'deep_verification' },
    });
    runtimeMocks.runAgentMessageWithToolLoop.mockImplementation(async (input) => {
      input.onRuntimeEvent({ type: 'text_delta', delta: 'runtime review' });
      input.onRuntimeEvent({
        type: 'distillation_review_item',
        item: { type: 'proposal', proposal: proposalItem() },
      });
      return { status: 'message', message: reviewMessage(reviewAgent), runtime: runtimeTrace() };
    });
    const events: unknown[] = [];

    const result = await executeAgentDistillationReviewTask(
      fixture.context,
      reviewPayload(reviewAgent),
      (event) => events.push(event),
    );

    expect(result).toMatchObject({ content: 'runtime review', items: [] });
    expect(events).toEqual([
      { type: 'start', message: expect.any(Object) },
      { type: 'delta', delta: 'runtime review' },
      { type: 'item', item: { type: 'proposal', proposal: proposalItem() } },
    ]);
    expect(fixture.ai.runAgentDistillationReviewStructuredStream).not.toHaveBeenCalled();
  });
});

describe('executeAgentAnnotationTask', () => {
  it('loads AI before persistence for an annotation task', async () => {
    const fixture = taskFixture();
    const order: string[] = [];
    fixture.getPersistenceModules.mockImplementation(async () => {
      order.push('persistence');
      return fixture.persistence;
    });
    fixture.getAiModule.mockImplementation(async () => {
      order.push('ai');
      return fixture.ai as unknown as TaskAiModule;
    });
    fixture.ai.runAgentAnnotateStream.mockResolvedValue({ annotations: [] });

    await executeAgentAnnotationTask(fixture.context, annotatePayload(), vi.fn());

    expect(order.slice(0, 2)).toEqual(['ai', 'persistence']);
  });

  it('owns memory preparation, item streaming, and usage recording', async () => {
    const fixture = taskFixture();
    const generatedAnnotation = annotation({
      id: 'annotation_generated',
      author: { kind: 'agent', agentId: 'agent_1', username: 'agent' },
    });
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
    runAgentAnnotateStream: vi.fn(),
    runAgentDistillationReviewStructuredStream: vi.fn(),
    runAgentStream: vi.fn(),
    runAgentToolLoopTask: vi.fn(),
  } as unknown as { [Key in keyof TaskAiModule]: ReturnType<typeof vi.fn> };
  const assistantExecutionPersistence = {
    recordAssistantExecutionRun: vi.fn().mockResolvedValue(undefined),
  };
  const persistence = {
    storeAgents: {
      readAgentRuntimeContext: vi.fn(async () => store),
    },
    storeAssistantExecutions: assistantExecutionPersistence,
    providerRepository: {
      hydrateProviderApiKey: vi.fn(async (provider: LlmProvider) => provider),
    },
  };
  const getAiModule = vi.fn(async () => ai as unknown as TaskAiModule);
  const getPersistenceModules = vi.fn(async () => persistence);
  const context: AgentTaskExecutionContext = {
    elapsedMs: () => 12,
    getAiModule,
    getPersistenceModules,
    logError: vi.fn(),
    logInfo: vi.fn(),
  };
  return {
    ai,
    assistantExecutionPersistence,
    context,
    getAiModule,
    getPersistenceModules,
    persistence,
  };
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

function executionRows(fixture: ReturnType<typeof taskFixture>) {
  return fixture.assistantExecutionPersistence.recordAssistantExecutionRun.mock.calls.map(
    ([input]) => input,
  );
}

function reviewPayload(reviewAgent: Agent): AgentDistillationReviewPayload {
  return {
    ...messagePayload(),
    agentId: reviewAgent.id,
    agentUsername: reviewAgent.username,
    responseMode: 'distillation_review',
  };
}

function reviewMessage(reviewAgent: Agent) {
  return {
    id: '',
    author: { kind: 'agent' as const, agentId: reviewAgent.id, username: reviewAgent.username },
    content: 'review result',
    createdAt: '2026-07-18T00:00:00.000Z',
    items: [],
    proposals: [],
  };
}

function proposalItem() {
  return {
    id: 'proposal_1',
    type: 'proposal' as const,
    proposal: {
      id: 'proposal_1',
      kind: 'insert' as const,
      status: 'pending' as const,
      title: 'Proposal',
      content: 'Proposal content',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
  };
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
      author: { kind: 'user', userId: 'user_1', username: 'reader' },
      content: 'question',
      createdAt: '2026-07-18T00:00:00.000Z',
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
    author: { kind: 'user', userId: 'user_1', username: 'reader' },
    color: '#f59e0b',
    comments: [],
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
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
