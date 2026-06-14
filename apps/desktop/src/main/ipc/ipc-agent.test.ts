import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentMessagePayload, AppSettings, LlmProvider } from '@yomitomo/shared';
import {
  desktopIpcErrorCodes,
  desktopIpcErrorFromSerialized,
  type DesktopIpcInvokeEnvelope,
} from '../../ipc-errors';
import type { DesktopMainIpcContext } from './ipc';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const runtimeMocks = vi.hoisted(() => ({
  runAgentCreateThoughtWithToolLoop: vi.fn(),
  runAgentDistillationReviewWithToolLoop: vi.fn(),
  runAgentThreadReplyWithToolLoop: vi.fn(),
}));
const memoryMocks = vi.hoisted(() => ({
  agentAnnotatePayloadWithReadingMemoryEntries: vi.fn((input) => input.payload),
  agentMessagePayloadWithReadingMemoryView: vi.fn((input) => input.payload),
  saveAgentAnnotateReadingMemoryEntries: vi.fn(),
}));
const traceMocks = vi.hoisted(() => ({
  appendAgentRuntimeTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
    on: vi.fn(),
  },
}));

vi.mock('../agents/agent-thread-runtime', () => runtimeMocks);

vi.mock('../agents/agent-reading-memory', () => memoryMocks);

vi.mock('../agents/agent-runtime-trace-log', () => traceMocks);

import { selectAgentRuntime } from '../agents/agent-runtime-routing';
import { registerAgentIpc } from './ipc-agent';

beforeEach(() => {
  ipcHandlers.clear();
  vi.clearAllMocks();
  traceMocks.appendAgentRuntimeTrace.mockResolvedValue(undefined);
  memoryMocks.agentAnnotatePayloadWithReadingMemoryEntries.mockImplementation(
    (input) => input.payload,
  );
  memoryMocks.agentMessagePayloadWithReadingMemoryView.mockImplementation((input) => input.payload);
});

describe('selectAgentRuntime', () => {
  it('selects a supported runtime only in deep verification mode', () => {
    expect(
      selectAgentRuntime({
        requestedMode: 'deep_verification',
        taskType: 'thread_reply',
        supportedTaskTypes: ['thread_reply', 'create_thought'],
      }),
    ).toBe('thread_reply');
    expect(
      selectAgentRuntime({
        requestedMode: 'deep_verification',
        taskType: 'distillation_review',
        supportedTaskTypes: ['thread_reply', 'create_thought'],
      }),
    ).toBeNull();
    expect(
      selectAgentRuntime({
        requestedMode: 'fast_response',
        taskType: 'thread_reply',
        supportedTaskTypes: ['thread_reply'],
      }),
    ).toBeNull();
  });
});

describe('agent IPC comment handler', () => {
  it('throws when the target comment agent does not exist', async () => {
    const handler = registerCommentHandler(storeWith({ agents: [] }));

    await expect(handler({} as never, messagePayload())).rejects.toMatchObject({
      code: desktopIpcErrorCodes.agentNotFound,
      detail: { username: 'agent' },
    });
  });

  it('throws when the provider route is missing', async () => {
    const handler = registerCommentHandler(storeWith({ providers: [] }));

    await expect(handler({} as never, messagePayload())).rejects.toMatchObject({
      code: desktopIpcErrorCodes.providerRouteRequired,
      detail: { task: 'readingAssistant' },
    });
  });

  it('uses the tool-loop runtime for deep verification thread replies', async () => {
    const runtimeComment = {
      author: 'ai' as const,
      content: 'runtime reply',
      createdAt: '2026-06-11T00:00:00.000Z',
    };
    runtimeMocks.runAgentThreadReplyWithToolLoop.mockResolvedValue({
      status: 'comment',
      comment: runtimeComment,
      runtime: runtimeTrace(),
    });
    const ai = {
      runAgent: vi.fn(),
    };
    const handler = registerCommentHandler(
      storeWith({ settings: { assistantExecutionMode: 'deep_verification' } }),
      ai,
    );

    const result = await handler({} as never, messagePayload());

    expect(runtimeMocks.runAgentThreadReplyWithToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ai,
        provider: expect.objectContaining({ id: 'provider_1' }),
        agent: expect.objectContaining({ id: 'agent_1' }),
        payload: expect.objectContaining({ agentUsername: 'agent' }),
      }),
    );
    expect(ai.runAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      author: 'ai',
      content: 'runtime reply',
      replyTo: 'comment_user',
    });
  });

  it('falls back to fast response when deep runtime is not selected', async () => {
    const ai = {
      runAgent: vi.fn().mockResolvedValue({
        author: 'ai',
        content: 'fast reply',
        createdAt: '2026-06-11T00:00:00.000Z',
      }),
    };
    const handler = registerCommentHandler(
      storeWith({ settings: { assistantExecutionMode: 'fast_response' } }),
      ai,
    );

    const result = await handler({} as never, messagePayload());

    expect(runtimeMocks.runAgentThreadReplyWithToolLoop).not.toHaveBeenCalled();
    expect(ai.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'provider_1' }),
      expect.objectContaining({ id: 'agent_1' }),
      expect.objectContaining({ agentUsername: 'agent' }),
    );
    expect(result).toMatchObject({
      author: 'ai',
      content: 'fast reply',
      replyTo: 'comment_user',
    });
  });
});

function registerCommentHandler(
  store: ReturnType<typeof storeWith>,
  ai: Record<string, unknown> = {},
) {
  registerAgentIpc(ipcContext(store, ai));
  const handler = ipcHandlers.get('agent:comment');
  if (!handler) throw new Error('agent:comment handler was not registered');
  return async (event: never, payload: AgentMessagePayload) => {
    const envelope = (await handler(event, payload)) as DesktopIpcInvokeEnvelope<unknown>;
    if (envelope.ok) return envelope.value;
    throw desktopIpcErrorFromSerialized(envelope.error);
  };
}

function ipcContext(store: ReturnType<typeof storeWith>, ai: Record<string, unknown>) {
  const storeModule = {
    hydrateProviderApiKey: vi.fn(async (llmProvider: LlmProvider) => llmProvider),
    readAgentRuntimeContext: vi.fn(async () => store),
    readStore: vi.fn(async () => {
      throw new Error('READ_STORE_SHOULD_NOT_BE_USED');
    }),
    recordAssistantExecutionRun: vi.fn(),
  };
  return {
    elapsedMs: () => 12,
    getAiModule: async () => ai,
    getAppUpdaterModule: async () => ({}),
    getAppVersion: () => '0.0.0-test',
    getMainWindow: () => null,
    getStoreModule: async () => storeModule,
    logError: vi.fn(),
    logInfo: vi.fn(),
    openExternalUrl: vi.fn(),
    recordPerformanceTiming: vi.fn(),
    recordStartupTiming: vi.fn(),
    scheduleLogPrune: vi.fn(),
    sendFullStoreUpdated: vi.fn(),
    storeLoadErrorInfo: vi.fn(),
  } as unknown as DesktopMainIpcContext;
}

function storeWith(
  overrides: {
    agents?: Agent[];
    providers?: LlmProvider[];
    settings?: Partial<AppSettings>;
  } = {},
) {
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
    },
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
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
    ...overrides,
  };
}

function providerRecord(overrides: Partial<LlmProvider> = {}): LlmProvider {
  return {
    id: 'provider_1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://api.example.com',
    apiKey: '',
    hasApiKey: false,
    modelName: 'model',
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
    ...overrides,
  };
}

function messagePayload(overrides: Partial<AgentMessagePayload> = {}): AgentMessagePayload {
  return {
    agentId: 'agent_1',
    agentUsername: 'agent',
    article: {
      id: 'article_1',
      title: 'Article',
      url: 'https://example.com/article',
      text: 'Article text',
    },
    annotation: {
      id: 'annotation_1',
      anchor: {
        exact: 'quote',
        prefix: '',
        suffix: '',
        start: 0,
        end: 5,
      },
      author: 'user',
      color: '#f59e0b',
      comments: [],
      createdAt: '2026-06-11T00:00:00.000Z',
      updatedAt: '2026-06-11T00:00:00.000Z',
      userId: 'user_1',
    },
    userComment: {
      id: 'comment_user',
      author: 'user',
      content: 'question',
      createdAt: '2026-06-11T00:00:00.000Z',
      userId: 'user_1',
    },
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
