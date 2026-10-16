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
import type { RuntimeExecutionRecord } from './agent-execution-recorder';
import type { AgentReadingMemoryPort } from './agent-reading-memory';

const runtimeMocks = vi.hoisted(() => ({
  runAgentMessageWithToolLoop: vi.fn(),
}));
vi.mock('./agent-message-runtime', () => runtimeMocks);

import {
  executeAgentAnnotationTask,
  executeAgentDistillationReviewTask,
  type AgentTaskExecutionContext,
} from './agent-task-execution';

beforeEach(() => {
  vi.clearAllMocks();
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
