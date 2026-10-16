import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Harness, type HarnessOptions } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import type { ArticleTextSnapshot } from '@yomitomo/shared';
import {
  articleTextFilePath,
  removeArticleFiles,
  removeSessionFiles,
  sessionArticleId,
  sessionFilePath,
} from './assistant-session-files';

const IDLE_CLOSE_MS = 10 * 60_000;

type StoreEntry = {
  harness: Promise<Harness>;
  active: number;
  idleTimer?: ReturnType<typeof setTimeout>;
};

export type AssistantSessionStore = ReturnType<typeof createAssistantSessionStore>;

export function createAssistantSessionStore(input: {
  directory: string;
  harnessOptions: () => HarnessOptions;
  onOpen?: (articleId: string, harness: Harness) => Promise<void>;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
}) {
  const entries = new Map<string, StoreEntry>();
  const texts = new Map<string, { hash: string; snapshot: ArticleTextSnapshot }>();

  async function use<T>(articleId: string, run: (harness: Harness) => Promise<T>): Promise<T> {
    const entry = acquire(articleId);
    try {
      return await run(await entry.harness);
    } finally {
      release(articleId, entry);
    }
  }

  function acquire(articleId: string) {
    let entry = entries.get(articleId);
    if (!entry) {
      entry = { harness: openHarness(articleId), active: 0 };
      entries.set(articleId, entry);
      entry.harness.catch(() => entries.delete(articleId));
    }
    clearTimeout(entry.idleTimer);
    entry.active += 1;
    return entry;
  }

  function release(articleId: string, entry: StoreEntry) {
    entry.active -= 1;
    if (entry.active > 0 || entries.get(articleId) !== entry) return;
    entry.idleTimer = setTimeout(() => void close(articleId), IDLE_CLOSE_MS);
  }

  async function openHarness(articleId: string) {
    const path = sessionFilePath(input.directory, articleId);
    await mkdir(input.directory, { recursive: true });
    let harness: Harness;
    try {
      harness = await openAt(path);
    } catch (error) {
      // Session files are a rebuildable cache, so an unreadable or newer-schema file is replaced.
      input.logError('assistant_session.open_failed', error, { articleId });
      await removeSessionFiles(path);
      harness = await openAt(path);
    }
    void harness.closed.then((end) => {
      if (end.reason === 'failed') {
        input.logError('assistant_session.failed', end.error, { articleId });
        entries.delete(articleId);
      }
    });
    await input.onOpen?.(articleId, harness);
    harness.resume();
    return harness;
  }

  async function openAt(path: string) {
    const storage = await openNodeSqliteStorage(path);
    return Harness.open(storage, input.harnessOptions(), BACKGROUND_CONTEXT);
  }

  // The renderer owns text extraction (DOM, EPUB, PDF), so each request carries the snapshot
  // and runs that outlive the window read it back from here.
  async function saveArticleText(articleId: string, snapshot: ArticleTextSnapshot) {
    const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    if (texts.get(articleId)?.hash === hash) return;
    const path = articleTextFilePath(input.directory, articleId);
    await mkdir(input.directory, { recursive: true });
    await writeFile(`${path}.tmp`, JSON.stringify({ hash, snapshot }));
    await rename(`${path}.tmp`, path);
    texts.set(articleId, { hash, snapshot });
  }

  async function articleText(articleId: string) {
    const cached = texts.get(articleId);
    if (cached) return cached.snapshot;
    const raw = await readFile(articleTextFilePath(input.directory, articleId), 'utf8').catch(
      () => undefined,
    );
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as { hash: string; snapshot: ArticleTextSnapshot };
    texts.set(articleId, stored);
    return stored.snapshot;
  }

  async function close(articleId: string) {
    texts.delete(articleId);
    const entry = entries.get(articleId);
    if (!entry) return;
    entries.delete(articleId);
    clearTimeout(entry.idleTimer);
    const harness = await entry.harness.catch(() => undefined);
    await harness?.close(BACKGROUND_CONTEXT);
  }

  async function remove(articleId: string) {
    await close(articleId);
    await removeArticleFiles(input.directory, articleId);
  }

  async function storedArticleIds() {
    const names = await readdir(input.directory).catch(() => []);
    return names.flatMap((name) => sessionArticleId(name) ?? []);
  }

  async function removeAll() {
    texts.clear();
    await Promise.all([...entries.keys()].map(close));
    await rm(input.directory, { recursive: true, force: true });
  }

  async function dispose() {
    await Promise.all([...entries.keys()].map(close));
  }

  return { use, saveArticleText, articleText, remove, removeAll, storedArticleIds, dispose };
}
