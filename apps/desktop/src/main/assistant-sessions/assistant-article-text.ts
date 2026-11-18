import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ArticleTextSnapshot } from '@yomitomo/shared';
import { withArticleSourceOperation } from '../articles/article-source-operations';
import { articleTextFilePath } from './assistant-session-files';

const CACHE_SIZE = 8;

type StoredArticleText = { hash: string; snapshot: ArticleTextSnapshot };

// The reader window owns text extraction (DOM, EPUB, PDF), so it hands the snapshot over when an
// article opens; runs started from other windows, or resumed after a restart, read it back here.
export function createArticleTextStore(directory: () => string) {
  const cache = new Map<string, StoredArticleText>();

  function remember(articleId: string, stored: StoredArticleText) {
    cache.delete(articleId);
    cache.set(articleId, stored);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }

  return {
    save(articleId: string, snapshot: ArticleTextSnapshot) {
      return withArticleSourceOperation(articleId, async () => {
        const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
        if (cache.get(articleId)?.hash === hash) return;
        const path = articleTextFilePath(directory(), articleId);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(`${path}.tmp`, JSON.stringify({ hash, snapshot }));
        await rename(`${path}.tmp`, path);
        remember(articleId, { hash, snapshot });
      });
    },
    load(articleId: string) {
      return withArticleSourceOperation(articleId, async () => {
        const cached = cache.get(articleId);
        if (cached) return cached.snapshot;
        const raw = await readFile(articleTextFilePath(directory(), articleId), 'utf8').catch(
          () => undefined,
        );
        if (!raw) return undefined;
        const stored = JSON.parse(raw) as StoredArticleText;
        remember(articleId, stored);
        return stored.snapshot;
      });
    },
    async has(articleId: string) {
      if (cache.has(articleId)) return true;
      return access(articleTextFilePath(directory(), articleId)).then(
        () => true,
        () => false,
      );
    },
    forget(articleId: string) {
      cache.delete(articleId);
    },
    clear() {
      cache.clear();
    },
  };
}
