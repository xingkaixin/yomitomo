import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createArticleTextStore } from './assistant-article-text';

it('keeps the last submitted snapshot in memory and on disk after overlapping saves', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'assistant-article-text-'));
  try {
    const store = createArticleTextStore(() => directory);
    const first = { text: 'first', sections: [] };
    const second = { text: 'second', sections: [] };
    await store.save('article', first);
    await Promise.all([store.save('article', second), store.save('article', first)]);

    expect(await store.load('article')).toEqual(first);
    expect(await createArticleTextStore(() => directory).load('article')).toEqual(first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
