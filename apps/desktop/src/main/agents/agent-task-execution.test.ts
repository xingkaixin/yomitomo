import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  Annotation,
  ResolvedAppSettings,
  LlmProvider,
} from '@yomitomo/shared';
import type { AssistantExecutionRunInput } from '../assistant/assistant-execution-repository';

import {
  executeAgentDistillationReviewTask,
  type AgentTaskExecutionContext,
} from './agent-task-execution';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeAgentDistillationReviewTask', () => {
  it('streams review items from the assistant session and records the run', async () => {
    const reviewAgent = agent({ id: 'review_1', kind: 'review', username: 'reviewer' });
    const fixture = taskFixture({ agents: [reviewAgent] });
    const item = {
      id: 'item_1',
      type: 'overview' as const,
      stance: 'mixed' as const,
      content: 'ok',
    };
    fixture.runDistillationReview.mockImplementation(async (request) => {
      request.onItem(item);
      return { items: [item], content: 'review result', proposals: [] };
    });
    const events: unknown[] = [];

    const result = await executeAgentDistillationReviewTask(
      fixture.context,
      reviewPayload(reviewAgent),
      (event) => events.push(event),
    );

    expect(fixture.runDistillationReview).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 'article_1',
        resolved: expect.objectContaining({ agent: reviewAgent, uiLanguage: 'zh-CN' }),
      }),
    );
    expect(result).toMatchObject({
      content: 'review result',
      items: [item],
      author: agentAuthor(reviewAgent),
    });
    expect(events).toEqual([
      { type: 'start', message: expect.objectContaining({ author: agentAuthor(reviewAgent) }) },
      { type: 'item', item },
    ]);
    await expectExecutionRecorded(fixture, {
      taskType: 'distillation_review',
      effectiveMode: 'fast_response',
    });
  });

  it('forwards cancellation and does not record a cancelled review', async () => {
    const reviewAgent = agent({ id: 'review_1', kind: 'review', username: 'reviewer' });
    const fixture = taskFixture({ agents: [reviewAgent] });
    const controller = new AbortController();
    fixture.runDistillationReview.mockImplementation(async (request) => {
      expect(request.signal).toBe(controller.signal);
      controller.abort();
      return { items: [], content: '', proposals: [] };
    });

    await expect(
      executeAgentDistillationReviewTask(
        fixture.context,
        reviewPayload(reviewAgent),
        vi.fn(),
        controller.signal,
      ),
    ).rejects.toThrow('AGENT_TASK_CANCELLED');

    expect(fixture.recorder.recordFastExecution).not.toHaveBeenCalled();
  });
});

function taskFixture(
  overrides: {
    agents?: Agent[];
    providers?: LlmProvider[];
    settings?: Partial<ResolvedAppSettings>;
  } = {},
) {
  const store = storeWith(overrides);
  const executionRuns: AssistantExecutionRunInput[] = [];
  const recorder = {
    recordFastExecution: vi.fn((input: AssistantExecutionRunInput) => {
      executionRuns.push(input);
    }),
  };
  const persistence = {
    storeAgents: {
      readAgentRuntimeContext: vi.fn(async () => store),
    },
    providerRepository: {
      hydrateProviderApiKey: vi.fn(async (provider: LlmProvider) => provider),
    },
  };
  const runDistillationReview = vi.fn<AgentTaskExecutionContext['runDistillationReview']>();
  const context: AgentTaskExecutionContext = {
    elapsedMs: () => 12,
    getPersistenceModules: vi.fn(async () => persistence),
    logError: vi.fn(),
    logInfo: vi.fn(),
    recorder,
    runDistillationReview,
  };
  return { context, executionRuns, recorder, runDistillationReview };
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
  return fixture.executionRuns;
}

function reviewPayload(reviewAgent: Agent): AgentDistillationReviewPayload {
  return {
    ...messagePayload(),
    agentId: reviewAgent.id,
    agentUsername: reviewAgent.username,
    responseMode: 'distillation_review',
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
