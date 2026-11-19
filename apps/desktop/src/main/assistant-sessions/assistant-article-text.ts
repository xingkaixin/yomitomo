import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ArticleTextSection, ArticleTextSnapshot } from '@yomitomo/shared';
import { isRecord } from '@yomitomo/shared';
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
        const serializedSnapshot = JSON.stringify(snapshot);
        const hash = createHash('sha256').update(serializedSnapshot).digest('hex');
        if (cache.get(articleId)?.hash === hash) return;
        const path = articleTextFilePath(directory(), articleId);
        const temporaryPath = `${path}.tmp`;
        await mkdir(dirname(path), { recursive: true });
        try {
          await writeFile(
            temporaryPath,
            `{"hash":${JSON.stringify(hash)},"snapshot":${serializedSnapshot}}`,
          );
          await rename(temporaryPath, path);
        } catch (error) {
          await rm(temporaryPath, { force: true }).catch(() => undefined);
          throw error;
        }
        remember(articleId, { hash, snapshot });
      });
    },
    load(articleId: string) {
      return withArticleSourceOperation(articleId, async () => {
        const cached = cache.get(articleId);
        if (cached) return cached.snapshot;
        const path = articleTextFilePath(directory(), articleId);
        const raw = await readFile(path, 'utf8').catch(() => undefined);
        if (!raw) return undefined;
        const stored = parseStoredArticleText(raw);
        if (!stored) {
          await rm(path, { force: true }).catch(() => undefined);
          return undefined;
        }
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

function parseStoredArticleText(raw: string): StoredArticleText | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.hash !== 'string' ||
    !isArticleTextSnapshot(parsed.snapshot)
  ) {
    return undefined;
  }
  return { hash: parsed.hash, snapshot: parsed.snapshot };
}

function isArticleTextSnapshot(value: unknown): value is ArticleTextSnapshot {
  if (!isRecord(value) || typeof value.text !== 'string' || !Array.isArray(value.sections)) {
    return false;
  }
  return value.sections.every(isArticleTextSection);
}

function isArticleTextSection(value: unknown): value is ArticleTextSection {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.start === 'number' &&
    Number.isFinite(value.start) &&
    typeof value.end === 'number' &&
    Number.isFinite(value.end) &&
    (value.depth === undefined || (typeof value.depth === 'number' && Number.isFinite(value.depth)))
  );
}
