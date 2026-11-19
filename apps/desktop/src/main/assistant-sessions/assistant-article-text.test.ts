import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createArticleTextStore } from './assistant-article-text';
import { articleTextFilePath } from './assistant-session-files';

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

it('recovers from corrupt or structurally invalid text cache files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'assistant-article-text-'));
  try {
    const store = createArticleTextStore(() => directory);
    const path = articleTextFilePath(directory, 'article_1');

    await writeFile(path, '{truncated json');
    expect(await store.load('article_1')).toBeUndefined();
    expect(await store.has('article_1')).toBe(false);

    await writeFile(path, JSON.stringify({ hash: 'abc', snapshot: { text: 123, sections: null } }));
    expect(await store.load('article_1')).toBeUndefined();
    expect(await store.has('article_1')).toBe(false);

    const rebuilt = {
      text: 'clean text',
      sections: [{ id: 's1', title: 'Intro', start: 0, end: 10 }],
    };
    await store.save('article_1', rebuilt);
    expect(await createArticleTextStore(() => directory).load('article_1')).toEqual(rebuilt);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
