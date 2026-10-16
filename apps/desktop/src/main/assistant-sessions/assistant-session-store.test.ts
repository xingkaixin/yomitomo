import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry } from '@earendil-works/pi-durable';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAssistantSessionStore } from './assistant-session-store';

let directory = '';

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function createStore() {
  directory = await mkdtemp(join(tmpdir(), 'assistant-sessions-'));
  const options = { models: createModels(), registry: createRegistry() };
  return createAssistantSessionStore({
    directory,
    harnessOptions: () => options,
    logError: vi.fn(),
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
});
