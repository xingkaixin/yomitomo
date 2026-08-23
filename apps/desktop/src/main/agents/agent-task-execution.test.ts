import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  Annotation,
  ResolvedAppSettings,
  LlmProvider,
} from '@yomitomo/shared';
import type { AssistantExecutionRunInput } from '../assistant/assistant-execution-repository';
import { desktopIpcErrorCodes } from '../../ipc-errors';
import type { RuntimeExecutionRecord } from './agent-execution-recorder';
import type { AgentReadingMemoryPort } from './agent-reading-memory';

const runtimeMocks = vi.hoisted(() => ({
  runAgentMessageWithToolLoop: vi.fn(),
}));
vi.mock('./agent-message-runtime', () => runtimeMocks);

import {
  executeAgentAnnotationTask,
  executeAgentCommentTask,
  executeAgentDistillationReviewTask,
  type AgentTaskExecutionContext,
} from './agent-task-execution';

beforeEach(() => {
  vi.clearAllMocks();
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
      author: agentAuthor(agent()),
    });
    expect(events).toEqual([
      {
        type: 'start',
        comment: expect.objectContaining({ pending: true, author: agentAuthor(agent()) }),
      },
      { type: 'delta', delta: 'fast ' },
      { type: 'delta', delta: 'reply' },
    ]);
    expect(runtimeMocks.runAgentMessageWithToolLoop).not.toHaveBeenCalled();
    expect(fixture.readingMemory.enrichMessagePayload).toHaveBeenCalledWith(
      expect.objectContaining({ article: expect.objectContaining({ id: 'article_1' }) }),
    );
    expect(fixture.readingMemory.createMessageReadingContextSnapshot).toHaveBeenCalledWith({
      payload: expect.objectContaining({ article: expect.objectContaining({ id: 'article_1' }) }),
      agentId: 'agent_1',
    });
    await expectExecutionRecorded(fixture, {
      taskType: 'thread_reply',
      requestedMode: 'fast_response',
      effectiveMode: 'fast_response',
    });
    expect(executionRows(fixture)).toHaveLength(1);
  });

  it('streams deep runtime text and progress through the task interface', async () => {
    const resolvedAgent = agent({
      id: 'resolved_agent',
      username: 'resolved_handle',
      nickname: 'Resolved agent',
      avatar: 'https://example.com/resolved.png',
      annotationColor: '#2468ac',
    });
    const fixture = taskFixture({
      agents: [resolvedAgent],
      settings: { assistantExecutionMode: 'deep_verification' },
    });
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
        comment: {
          content: 'deep reply',
          author: { kind: 'agent', agentId: 'runtime_agent', username: 'runtime' },
        },
        runtime: runtimeTrace(),
      };
    });
    const events: unknown[] = [];

    const result = await executeAgentCommentTask(
      fixture.context,
      { ...messagePayload(), agentId: undefined, agentUsername: resolvedAgent.username },
      (event) => events.push(event),
    );

    expect(result).toMatchObject({
      content: 'deep reply',
      assistantProgress: {
        steps: [{ id: 'get_anchor_context', status: 'done' }],
      },
      author: agentAuthor(resolvedAgent),
    });
    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'start',
          comment: expect.objectContaining({ author: agentAuthor(resolvedAgent) }),
        },
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
    expect(fixture.recorder.recordRuntimeExecution).toHaveBeenCalledOnce();
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
    expect(fixture.recorder.recordRuntimeExecution).toHaveBeenCalledOnce();
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
    expect(fixture.recorder.recordRuntimeExecution).toHaveBeenCalledOnce();
  });

  it('does not record or start fast fallback after a cancelled deep runtime', async () => {
    const fixture = taskFixture({ settings: { assistantExecutionMode: 'deep_verification' } });
    const controller = new AbortController();
    runtimeMocks.runAgentMessageWithToolLoop.mockImplementation(async () => {
      controller.abort();
      return {
        status: 'fallback',
        failureReason: 'tool_loop_failed',
        runtime: runtimeTrace(),
      };
    });

    await expect(
      executeAgentCommentTask(fixture.context, messagePayload(), vi.fn(), controller.signal),
    ).rejects.toThrow('AGENT_TASK_CANCELLED');

    expect(fixture.recorder.recordRuntimeExecution).not.toHaveBeenCalled();
    expect(fixture.ai.runAgentStream).not.toHaveBeenCalled();
    expect(fixture.readingMemory.enrichMessagePayload).not.toHaveBeenCalled();
    expect(executionRows(fixture)).toHaveLength(0);
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
      expect(fixture.readingMemory.enrichMessagePayload).not.toHaveBeenCalled();
      expect(fixture.readingMemory.createMessageReadingContextSnapshot).not.toHaveBeenCalled();
      expect(fixture.readingMemory.enrichAnnotatePayload).not.toHaveBeenCalled();
      expect(fixture.readingMemory.saveAnnotateEntries).not.toHaveBeenCalled();
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

    expect(result).toMatchObject({ content: 'review result', author: agentAuthor(reviewAgent) });
    expect(events).toEqual([
      {
        type: 'start',
        message: expect.objectContaining({
          author: expect.objectContaining({
            ...agentAuthor(reviewAgent),
          }),
        }),
      },
    ]);
    await expectExecutionRecorded(fixture, {
      taskType: 'distillation_review',
      effectiveMode: 'fast_response',
    });
  });

  it('forwards fast review cancellation and does not record a cancelled fallback', async () => {
    const reviewAgent = agent({ id: 'review_1', kind: 'review', username: 'reviewer' });
    const fixture = taskFixture({ agents: [reviewAgent] });
    const controller = new AbortController();
    fixture.ai.runAgentDistillationReviewStructuredStream.mockImplementation(
      async (_provider, _agent, _payload, _onItem, options) => {
        expect(options?.signal).toBe(controller.signal);
        controller.abort();
        return reviewMessage(reviewAgent);
      },
    );

    await expect(
      executeAgentDistillationReviewTask(
        fixture.context,
        reviewPayload(reviewAgent),
        vi.fn(),
        controller.signal,
      ),
    ).rejects.toThrow('AGENT_TASK_CANCELLED');

    expect(fixture.recorder.recordFastExecution).not.toHaveBeenCalled();
    expect(executionRows(fixture)).toHaveLength(0);
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

    expect(result).toMatchObject({
      content: 'runtime review',
      items: [],
      author: agentAuthor(reviewAgent),
    });
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
    expect(fixture.readingMemory.saveAnnotateEntries).toHaveBeenCalledOnce();
    await expectExecutionRecorded(fixture, {
      taskType: 'annotation',
      effectiveMode: 'fast_response',
      usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
    });
  });

  it('does not write memory or execution when cancelled before AI resolution', async () => {
    const fixture = taskFixture();
    const controller = new AbortController();
    let resolveAi: ((value: TaskAiModule) => void) | undefined;
    fixture.getAiModule.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAi = resolve;
        }),
    );

    const task = executeAgentAnnotationTask(
      fixture.context,
      annotatePayload(),
      vi.fn(),
      controller.signal,
    );
    controller.abort();
    resolveAi?.(fixture.ai as unknown as TaskAiModule);

    await expect(task).rejects.toThrow('AGENT_TASK_CANCELLED');

    expect(fixture.readingMemory.enrichAnnotatePayload).not.toHaveBeenCalled();
    expect(fixture.readingMemory.saveAnnotateEntries).not.toHaveBeenCalled();
    expect(executionRows(fixture)).toHaveLength(0);
  });

  it('does not write memory or execution when cancelled after annotation generation', async () => {
    const fixture = taskFixture();
    const controller = new AbortController();
    fixture.ai.runAgentAnnotateStream.mockImplementation(async () => {
      controller.abort();
      return { annotations: [] };
    });

    await expect(
      executeAgentAnnotationTask(fixture.context, annotatePayload(), vi.fn(), controller.signal),
    ).rejects.toThrow('AGENT_TASK_CANCELLED');

    expect(fixture.readingMemory.saveAnnotateEntries).not.toHaveBeenCalled();
    expect(fixture.recorder.recordFastExecution).not.toHaveBeenCalled();
    expect(executionRows(fixture)).toHaveLength(0);
  });
});

type TaskAiModule = Awaited<ReturnType<AgentTaskExecutionContext['getAiModule']>>;

function taskFixture(
  overrides: {
    agents?: Agent[];
    providers?: LlmProvider[];
    settings?: Partial<ResolvedAppSettings>;
  } = {},
) {
  const store = storeWith(overrides);
  const ai = {
    runAgentAnnotateStream: vi.fn(),
    runAgentDistillationReviewStructuredStream: vi.fn(),
    runAgentStream: vi.fn(),
    runAgentToolLoopTask: vi.fn(),
  } as unknown as { [Key in keyof TaskAiModule]: ReturnType<typeof vi.fn> };
  const executionEvents: ExecutionEvent[] = [];
  const recorder = {
    recordRuntimeExecution: vi.fn((input: RuntimeExecutionRecord) => {
      executionEvents.push({ kind: 'runtime', input });
    }),
    recordFastExecution: vi.fn((input: AssistantExecutionRunInput) => {
      executionEvents.push({ kind: 'fast', input });
    }),
  };
  const readingMemory = {
    executor: readingMemoryExecutor(),
    enrichAnnotatePayload: vi.fn((payload: AgentAnnotatePayload) => payload),
    enrichMessagePayload: vi.fn((payload: AgentMessagePayload) => payload),
    saveAnnotateEntries: vi.fn(),
    createMessageReadingContextSnapshot: vi.fn(),
  };
  const persistence = {
    storeAgents: {
      readAgentRuntimeContext: vi.fn(async () => store),
    },
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
    recorder,
    readingMemory: readingMemory as AgentReadingMemoryPort,
  };
  return {
    ai,
    context,
    executionEvents,
    getAiModule,
    getPersistenceModules,
    persistence,
    readingMemory,
    recorder,
  };
}

async function expectExecutionRecorded(
  fixture: ReturnType<typeof taskFixture>,
  expected: Record<string, unknown>,
) {
  await vi.waitFor(() => {
    expect(executionRows(fixture)).toContainEqual(expect.objectContaining(expected));
  });
}

function executionRows(fixture: ReturnType<typeof taskFixture>) {
  return fixture.executionEvents.flatMap((event) =>
    event.kind === 'fast' ? [event.input] : runtimeExecutionRow(event.input),
  );
}

type ExecutionEvent =
  | { kind: 'fast'; input: AssistantExecutionRunInput }
  | { kind: 'runtime'; input: RuntimeExecutionRecord };

function readingMemoryExecutor(): AgentReadingMemoryPort['executor'] {
  return {
    exec: vi.fn(),
    prepare: vi.fn(),
  } as unknown as AgentReadingMemoryPort['executor'];
}

function runtimeExecutionRow(input: RuntimeExecutionRecord): AssistantExecutionRunInput[] {
  const runtime = input.result.runtime;
  if (!runtime) return [];
  return [
    {
      agent: input.agent,
      provider: input.provider,
      taskType: input.taskType,
      requestedMode: input.requestedMode,
      effectiveMode: 'deep_verification',
      status: input.result.status === 'fallback' ? 'fallback' : 'success',
      fallbackReason: input.result.status === 'fallback' ? input.result.failureReason : undefined,
      usage: runtime.trace.usage,
      durationMs: input.durationMs,
      stepCount: runtime.trace.steps.length,
      traceJson: runtime.trace,
    },
  ];
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

function agentAuthor(value: Agent) {
  return {
    kind: 'agent',
    agentId: value.id,
    username: value.username,
    nickname: value.nickname,
    avatar: value.avatar,
    annotationColor: value.annotationColor,
  };
}

function storeWith(overrides: {
  agents?: Agent[];
  providers?: LlmProvider[];
  settings?: Partial<ResolvedAppSettings>;
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
    } as ResolvedAppSettings,
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
