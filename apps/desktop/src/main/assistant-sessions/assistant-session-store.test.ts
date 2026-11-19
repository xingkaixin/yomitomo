import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, type Harness } from '@earendil-works/pi-durable';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAssistantSessionStore } from './assistant-session-store';

let directory = '';

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function createStore(overrides?: Partial<Parameters<typeof createAssistantSessionStore>[0]>) {
  directory = await mkdtemp(join(tmpdir(), 'assistant-sessions-'));
  const options = { models: createModels(), registry: createRegistry() };
  return createAssistantSessionStore({
    directory,
    harnessOptions: () => options,
    logError: vi.fn(),
    ...overrides,
  });
}

describe('createAssistantSessionStore', () => {
  it('replaces an unreadable session file instead of failing', async () => {
    const store = await createStore();
    await writeFile(join(directory, 'article_1.sqlite'), 'not a database');

    const created = await store.use('article_1', (harness) =>
      harness.createConversation({ ownership: { kind: 'ownerless' } }, BACKGROUND_CONTEXT),
    );

    expect(created.id).toBeTruthy();
    await store.dispose();
  });

  it('removes the session files of a deleted article', async () => {
    const store = await createStore();
    await store.use('article_1', async () => undefined);
    await store.use('article_2', async () => undefined);

    await store.remove('article_1');

    expect(await store.storedArticleIds()).toEqual(['article_2']);
    expect((await readdir(directory)).some((name) => name.startsWith('article_1'))).toBe(false);
    await store.dispose();
  });

  it('closes the opened harness when onOpen throws and allows a clean retry', async () => {
    let openedHarness: Harness | undefined;
    let shouldFail = true;
    const store = await createStore({
      onOpen: async (_articleId, harness) => {
        openedHarness = harness;
        if (shouldFail) {
          shouldFail = false;
          throw new Error('onOpen failed');
        }
      },
    });

    await expect(store.use('article_1', async () => 'ok')).rejects.toThrow('onOpen failed');
    const end = await openedHarness!.closed;
    expect(end.kind).toBe('closed');

    const retry = await store.use('article_1', (harness) =>
      harness.createConversation({ ownership: { kind: 'ownerless' } }, BACKGROUND_CONTEXT),
    );
    expect(retry.id).toBeTruthy();
    await store.dispose();
  });

  it('serializes concurrent remove and use so reopen waits for close and file deletion', async () => {
    const events: string[] = [];
    let openCount = 0;
    const store = await createStore({
      onOpen: async () => {
        openCount += 1;
        events.push(`open:${openCount}`);
      },
    });

    const firstHarness = await store.use('article_1', async (harness) => harness);
    let closeDone = false;
    void firstHarness.closed.then(() => {
      closeDone = true;
      events.push('closed:1');
    });

    const removing = store.remove('article_1').then(() => {
      events.push('removed:1');
    });
    const reopening = store.use('article_1', async () => {
      expect(closeDone).toBe(true);
      events.push('used:2');
    });

    await Promise.all([removing, reopening]);
    expect(events).toEqual(['open:1', 'closed:1', 'removed:1', 'open:2', 'used:2']);
    await store.dispose();
  });

  it('rejects new use calls after dispose', async () => {
    const store = await createStore();
    await store.use('article_1', async () => undefined);
    await store.dispose();

    await expect(store.use('article_1', async () => undefined)).rejects.toThrow(
      'ASSISTANT_SESSION_STORE_DISPOSED',
    );
  });
});
