import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry } from '@earendil-works/pi-durable';
import { piModelRef } from '@yomitomo/ai';
import type {
  Agent,
  AssistantChannel,
  AssistantRunEvent,
  Comment,
  LlmProvider,
} from '@yomitomo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelRunsDoc } from './assistant-channel-docs';
import { createAssistantChannelRuntime } from './assistant-channel-runtime';
import { pendingMarkerPath } from './assistant-session-files';
import { createAssistantSessionStore } from './assistant-session-store';

const testState = vi.hoisted(() => ({
  provider: undefined as ReturnType<typeof fauxProvider>['provider'] | undefined,
}));

vi.mock('@yomitomo/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yomitomo/ai')>();
  return {
    ...actual,
    piProviderFor: () => {
      if (!testState.provider) throw new Error('test faux provider not set');
      return testState.provider;
    },
  };
});

let directory = '';

afterEach(async () => {
  if (directory) {
    await rm(directory, { recursive: true, force: true });
    directory = '';
  }
});

const agent = {
  id: 'agent_1',
  username: 'helper',
  nickname: 'Helper',
  temperature: 0.3,
  soul: '',
} as Agent;

const provider: LlmProvider = {
  id: 'provider_1',
  name: 'Provider',
  type: 'openai-chat',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'key',
  modelName: 'model',
  createdAt: '',
  updatedAt: '',
};

const channel: AssistantChannel = { kind: 'chat', sessionId: 'session_1' };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function userMessage(id: string, content: string, createdAt: string): Comment {
  return {
    id,
    author: { kind: 'user', username: 'reader' },
    content,
    createdAt,
  };
}

async function fileExists(path: string) {
  return access(path).then(
    () => true,
    () => false,
  );
}

describe('createAssistantChannelRuntime', () => {
  it('serializes deliver with finalizeAnswer so a second turn never loses its run or progress', async () => {
    directory = await mkdtemp(join(tmpdir(), 'assistant-channel-runtime-'));
    const models = createModels();
    const registry = createRegistry();
    const ref = piModelRef(provider, agent);
    const faux = fauxProvider({ provider: ref.provider, models: [{ id: ref.modelId }] });
    faux.setResponses([fauxAssistantMessage('First reply'), fauxAssistantMessage('Second reply')]);
    testState.provider = faux.provider;

    const messages: Comment[] = [
      userMessage('msg_1', 'First question', '2026-11-19T00:00:01.000Z'),
    ];
    const publishedReplies: string[] = [];
    const runEvents: AssistantRunEvent[] = [];
    const firstFinalizePaused = deferred<void>();
    const releaseFirstFinalize = deferred<void>();
    const secondDone = deferred<AssistantRunEvent>();
    let firstFinalizeSeen = false;
    let firstRunKey = '';

    const store = createAssistantSessionStore({
      directory,
      harnessOptions: () => ({ models, registry, settings: { extensions: [] } }),
      logError: vi.fn(),
    });
    const runtime = createAssistantChannelRuntime({
      store,
      models,
      articleText: async () => ({ text: '正文内容。', sections: [] }),
      resolveAgent: async () => ({ agent, provider, uiLanguage: 'zh-CN', fake: false }),
      resolveAgentIdentity: async () => {
        if (!firstFinalizeSeen) {
          firstFinalizeSeen = true;
          firstFinalizePaused.resolve();
          await releaseFirstFinalize.promise;
        }
        return { agent, provider, uiLanguage: 'zh-CN' };
      },
      readChannel: () => ({ messages: [...messages] }),
      publishReply: (_articleId, _channel, reply) => {
        publishedReplies.push(reply.content);
        messages.push({
          id: reply.id,
          author: reply.author,
          content: reply.content,
          createdAt: reply.createdAt,
        });
        return true;
      },
      existingMessageIds: (_articleId, ids) =>
        new Set(ids.filter((id) => messages.some((item) => item.id === id))),
      findDiscussion: () => undefined,
      articleMeta: () => ({ title: 'Article' }),
      publishRun: (event) => {
        runEvents.push(event);
        if (event.status === 'done' && firstRunKey && event.runKey !== firstRunKey) {
          secondDone.resolve(event);
        }
      },
      markPending: async (articleId, pending) => {
        const path = pendingMarkerPath(directory, articleId);
        await (pending ? writeFile(path, '') : rm(path, { force: true }));
      },
      logError: vi.fn(),
    });
    models.setProvider(faux.provider);

    try {
      const first = await runtime.deliver({
        articleId: 'article_1',
        agentId: agent.id,
        channel,
        triggerId: 'msg_1',
      });
      firstRunKey = first.runKey!;
      expect(firstRunKey).toBeTruthy();

      await firstFinalizePaused.promise;

      messages.push(userMessage('msg_2', 'Second question', '2026-11-19T00:00:02.000Z'));
      let secondResolved = false;
      const secondDelivery = runtime
        .deliver({
          articleId: 'article_1',
          agentId: agent.id,
          channel,
          triggerId: 'msg_2',
        })
        .then((result) => {
          secondResolved = true;
          return result;
        });

      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(secondResolved).toBe(false);

      releaseFirstFinalize.resolve();
      const second = await secondDelivery;
      expect(second.runKey).toBeTruthy();
      expect(second.runKey).not.toBe(firstRunKey);

      const finalSecondEvent = await secondDone.promise;
      expect(finalSecondEvent.text).toBe('Second reply');
      expect(publishedReplies).toEqual(['First reply', 'Second reply']);
      expect(
        runEvents.some((event) => event.runKey === second.runKey && event.status === 'running'),
      ).toBe(true);
      expect(await fileExists(pendingMarkerPath(directory, 'article_1'))).toBe(false);
    } finally {
      runtime.dispose();
      await store.dispose();
    }
  });

  it('cleans up ChannelRunsDoc and .pending when track fails on a live harness', async () => {
    directory = await mkdtemp(join(tmpdir(), 'assistant-channel-runtime-'));
    const models = createModels();
    const registry = createRegistry();
    const ref = piModelRef(provider, agent);
    const faux = fauxProvider({ provider: ref.provider, models: [{ id: ref.modelId }] });
    faux.setResponses([fauxAssistantMessage('Answer that fails to persist')]);
    testState.provider = faux.provider;

    const messages: Comment[] = [userMessage('msg_1', 'Question', '2026-11-19T00:00:01.000Z')];
    const failedEvent = deferred<AssistantRunEvent>();

    const store = createAssistantSessionStore({
      directory,
      harnessOptions: () => ({ models, registry, settings: { extensions: [] } }),
      logError: vi.fn(),
    });
    const runtime = createAssistantChannelRuntime({
      store,
      models,
      articleText: async () => ({ text: '正文内容。', sections: [] }),
      resolveAgent: async () => ({ agent, provider, uiLanguage: 'zh-CN', fake: false }),
      resolveAgentIdentity: async () => ({ agent, provider, uiLanguage: 'zh-CN' }),
      readChannel: () => ({ messages: [...messages] }),
      publishReply: () => {
        throw new Error('sqlite write failed');
      },
      existingMessageIds: (_articleId, ids) =>
        new Set(ids.filter((id) => messages.some((item) => item.id === id))),
      findDiscussion: () => undefined,
      articleMeta: () => ({ title: 'Article' }),
      publishRun: (event) => {
        if (event.status === 'failed') failedEvent.resolve(event);
      },
      markPending: async (articleId, pending) => {
        const path = pendingMarkerPath(directory, articleId);
        await (pending ? writeFile(path, '') : rm(path, { force: true }));
      },
      logError: vi.fn(),
    });
    models.setProvider(faux.provider);

    try {
      await runtime.deliver({
        articleId: 'article_1',
        agentId: agent.id,
        channel,
        triggerId: 'msg_1',
      });

      const failed = await failedEvent.promise;
      expect(failed.error).toBe('run_failed');
      expect(await fileExists(pendingMarkerPath(directory, 'article_1'))).toBe(false);

      const remainingRuns = await store.use('article_1', async (harness) =>
        Object.keys((await harness.snapshot(ChannelRunsDoc, BACKGROUND_CONTEXT))?.runs ?? {}),
      );
      expect(remainingRuns).toEqual([]);
    } finally {
      runtime.dispose();
      await store.dispose();
    }
  });

  it('removes a stale .pending marker when resume finds no active runs', async () => {
    directory = await mkdtemp(join(tmpdir(), 'assistant-channel-runtime-'));
    const models = createModels();
    const registry = createRegistry();
    const markerPath = pendingMarkerPath(directory, 'article_1');
    await writeFile(markerPath, '');

    let runtime!: ReturnType<typeof createAssistantChannelRuntime>;
    const store = createAssistantSessionStore({
      directory,
      harnessOptions: () => ({ models, registry, settings: { extensions: [] } }),
      onOpen: (articleId, harness) => runtime.resume(articleId, harness),
      logError: vi.fn(),
    });
    runtime = createAssistantChannelRuntime({
      store,
      models,
      articleText: async () => undefined,
      resolveAgent: async () => ({ agent, provider, uiLanguage: 'zh-CN', fake: false }),
      resolveAgentIdentity: async () => ({ agent, provider, uiLanguage: 'zh-CN' }),
      readChannel: () => undefined,
      publishReply: () => false,
      existingMessageIds: () => new Set(),
      findDiscussion: () => undefined,
      articleMeta: () => undefined,
      publishRun: vi.fn(),
      markPending: async (articleId, pending) => {
        const path = pendingMarkerPath(directory, articleId);
        await (pending ? writeFile(path, '') : rm(path, { force: true }));
      },
      logError: vi.fn(),
    });

    try {
      await store.use('article_1', async () => undefined);
      expect(await fileExists(markerPath)).toBe(false);
    } finally {
      runtime.dispose();
      await store.dispose();
    }
  });
});
