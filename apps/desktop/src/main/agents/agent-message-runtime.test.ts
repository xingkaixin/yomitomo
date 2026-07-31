import { describe, expect, it, vi } from 'vitest';
import type { AssistantRuntimeResult, AssistantRuntimeStreamEvent } from '@yomitomo/ai';
import type { Agent, AgentMessagePayload, LlmProvider } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import type { ReadingMemorySqliteExecutor } from '../reading-memory/reading-memory-store';
import { runAgentMessageWithToolLoop } from './agent-message-runtime';

describe('agent message tool loop', () => {
  it('returns a thread reply comment from the runtime final action', async () => {
    const task = vi.fn(async () => taskSuccess(threadReplyRuntime()));

    const result = await runAgentMessageWithToolLoop({
      ai: aiModule(task),
      taskType: 'thread_reply',
      provider: provider(),
      agent: agent(),
      payload: payload(),
      readingMemoryExecutor: readingMemoryExecutor(),
    });

    expect(result.status).toBe('comment');
    expect(result.status === 'comment' && result.comment).toMatchObject({
      author: {
        kind: 'agent',
        agentId: 'agent_1',
        username: 'lin',
      },
      content: '我先按当前 thread 的问题回应。',
    });
    expect(task).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'thread_reply',
        provider: expect.objectContaining({ id: 'provider_1' }),
        agent: expect.objectContaining({ id: 'agent_1' }),
      }),
    );
  });

  it('passes runtime stream events through for thread replies', async () => {
    const onRuntimeEvent = vi.fn();
    const task = vi.fn(
      async (options: { onEvent?: (event: AssistantRuntimeStreamEvent) => void }) => {
        options.onEvent?.({ type: 'text_delta', delta: '流式片段' });
        return taskSuccess(threadReplyRuntime());
      },
    );

    await runAgentMessageWithToolLoop({
      ai: aiModule(task),
      taskType: 'thread_reply',
      provider: provider(),
      agent: agent(),
      payload: payload(),
      readingMemoryExecutor: readingMemoryExecutor(),
      onRuntimeEvent,
    });

    expect(onRuntimeEvent).toHaveBeenCalledWith({ type: 'text_delta', delta: '流式片段' });
  });

  it('passes the injected executor to deep reading tools', async () => {
    const executor = {
      exec: vi.fn(),
      prepare: vi.fn(() => ({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => []),
      })),
    } as unknown as ReadingMemorySqliteExecutor;
    const task = vi.fn(async (input) => {
      await input.toolExecutor({
        name: 'search_article_memory',
        input: { query: '目标观点' },
      });
      return taskSuccess(threadReplyRuntime());
    });

    await runAgentMessageWithToolLoop({
      ai: aiModule(task),
      taskType: 'thread_reply',
      provider: provider(),
      agent: agent(),
      payload: payload(),
      readingMemoryExecutor: executor,
    });

    expect(executor.prepare).toHaveBeenCalled();
  });

  it('falls back when the article id is missing', async () => {
    const task = vi.fn();
    const result = await runAgentMessageWithToolLoop({
      ai: aiModule(task),
      taskType: 'thread_reply',
      provider: provider(),
      agent: agent(),
      payload: {
        ...payload(),
        article: { ...payload().article, id: undefined },
      },
      readingMemoryExecutor: readingMemoryExecutor(),
    });

    expect(result).toEqual({
      status: 'fallback',
      failureReason: 'missing_article_id',
    });
    expect(task).not.toHaveBeenCalled();
  });

  it('returns a top-level thought from the create_thought runtime final action', async () => {
    const task = vi.fn(async () => taskSuccess(createThoughtRuntime()));

    const result = await runAgentMessageWithToolLoop({
      ai: aiModule(task),
      taskType: 'create_thought',
      provider: provider(),
      agent: agent(),
      payload: { ...payload(), responseMode: 'create_thought' },
      readingMemoryExecutor: readingMemoryExecutor(),
    });

    expect(result.status).toBe('comment');
    expect(result.status === 'comment' && result.comment).toMatchObject({
      author: {
        kind: 'agent',
        agentId: 'agent_1',
        username: 'lin',
      },
      content: '这条想法会作为顶层助手想法保存。',
    });
  });

  it('returns a review message from the distillation runtime final action', async () => {
    const task = vi.fn(async () => taskSuccess(reviewRuntime()));

    const result = await runAgentMessageWithToolLoop({
      ai: aiModule(task),
      taskType: 'distillation_review',
      provider: provider(),
      agent: { ...agent(), kind: 'review' },
      payload: { ...payload(), responseMode: 'distillation_review' },
      readingMemoryExecutor: readingMemoryExecutor(),
    });

    expect(result.status).toBe('message');
    expect(result.status === 'message' && result.message).toMatchObject({
      author: { kind: 'agent', agentId: 'agent_1' },
      content: '这段沉淀还需要补足原文证据。',
      proposals: [
        expect.objectContaining({
          id: 'proposal_1',
          kind: 'insert',
          content: '补一条证据边界。',
        }),
      ],
    });
  });
});

type AiModule = Pick<typeof import('@yomitomo/ai'), 'runAgentToolLoopTask'>;

function aiModule(runAgentToolLoopTask: ReturnType<typeof vi.fn>): AiModule {
  return { runAgentToolLoopTask } as unknown as AiModule;
}

function taskSuccess(runtime: Extract<AssistantRuntimeResult, { status: 'final' }>) {
  return {
    status: 'final' as const,
    action: runtime.action,
    runtime,
  };
}

function threadReplyRuntime(): Extract<AssistantRuntimeResult, { status: 'final' }> {
  return {
    status: 'final',
    action: {
      type: 'reply_to_thread',
      annotationId: 'annotation_1',
      content: '我先按当前 thread 的问题回应。',
      evidenceIds: [],
      confidence: 0.82,
      reason: '当前 thread 已提供足够上下文。',
    },
    evidence: [],
    repairUsed: false,
    trace: trace('thread_reply', 'reply_to_thread'),
  };
}

function createThoughtRuntime(): Extract<AssistantRuntimeResult, { status: 'final' }> {
  return {
    status: 'final',
    action: {
      type: 'create_thread_thought',
      annotationId: 'annotation_1',
      thought: '这条想法会作为顶层助手想法保存。',
      evidenceIds: [],
      confidence: 0.82,
      reason: '当前批注需要新增想法。',
    },
    evidence: [],
    repairUsed: false,
    trace: trace('create_thought', 'create_thread_thought'),
  };
}

function reviewRuntime(): Extract<AssistantRuntimeResult, { status: 'final' }> {
  return {
    status: 'final',
    action: {
      type: 'review_distillation',
      annotationId: 'annotation_1',
      content: '这段沉淀还需要补足原文证据。',
      proposals: [
        {
          id: 'proposal_1',
          kind: 'insert',
          status: 'pending',
          title: '补证据边界',
          content: '补一条证据边界。',
          updatedAt: '2026-05-26T00:00:01.000Z',
        },
      ],
      evidenceIds: [],
      confidence: 0.82,
      reason: '当前沉淀稿需要审阅。',
    },
    evidence: [],
    repairUsed: false,
    trace: trace('distillation_review', 'review_distillation'),
  };
}

function trace(
  taskType: AssistantRuntimeResult['trace']['taskType'],
  finalActionType: NonNullable<AssistantRuntimeResult['trace']['finalActionType']>,
): AssistantRuntimeResult['trace'] {
  return {
    taskType,
    agentId: 'agent_1',
    articleId: 'article_1',
    startedAt: '2026-05-26T00:00:00.000Z',
    completedAt: '2026-05-26T00:00:01.000Z',
    steps: [],
    finalActionType,
  };
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

function agent(): Agent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    enabled: true,
    providerId: 'provider_1',
    username: 'lin',
    nickname: '林知微',
    avatar: '',
    annotationColor: '#6fa48f',
    annotationDensity: 'medium',
    temperature: 0.4,
    soul: '克制地阅读。',
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
}

function readingMemoryExecutor(): ReadingMemorySqliteExecutor {
  return {
    exec: () => undefined,
    prepare: () => ({
      run: () => undefined,
      get: () => undefined,
      all: () => [],
    }),
  };
}

function payload(): AgentMessagePayload {
  const text = '开头。目标观点说明选择压力如何形成。结尾。';
  const start = text.indexOf('目标观点');
  const anchor = createTextAnchor(text, start, start + '目标观点'.length);
  return {
    agentId: 'agent_1',
    agentUsername: 'lin',
    article: {
      id: 'article_1',
      title: '文章',
      url: 'https://example.com',
      text,
    },
    annotation: {
      id: 'annotation_1',
      author: { kind: 'user', username: 'reader' },
      color: '#f5c542',
      anchor,
      comments: [
        {
          id: 'comment_1',
          author: { kind: 'user', username: 'reader' },
          content: '这里是什么意思？',
          createdAt: '2026-05-26T00:01:00.000Z',
        },
      ],
      createdAt: '2026-05-26T00:00:00.000Z',
      updatedAt: '2026-05-26T00:00:00.000Z',
    },
    userComment: {
      id: 'comment_1',
      author: { kind: 'user', username: 'reader' },
      content: '这里是什么意思？',
      createdAt: '2026-05-26T00:01:00.000Z',
    },
  };
}
