import { mkdir, readdir, rm } from 'node:fs/promises';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Harness, type HarnessOptions } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import {
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
  const closing = new Map<string, Promise<void>>();
  let removingAll: Promise<void> | undefined;
  let disposed = false;

  async function use<T>(articleId: string, run: (harness: Harness) => Promise<T>): Promise<T> {
    const entry = await acquire(articleId);
    try {
      return await run(await entry.harness);
    } finally {
      release(articleId, entry);
    }
  }

  async function acquire(articleId: string): Promise<StoreEntry> {
    while (true) {
      if (disposed) throw new Error('ASSISTANT_SESSION_STORE_DISPOSED');
      if (removingAll) {
        await removingAll.catch(() => undefined);
        continue;
      }
      const pendingClose = closing.get(articleId);
      if (pendingClose) {
        await pendingClose.catch(() => undefined);
        continue;
      }
      if (disposed) throw new Error('ASSISTANT_SESSION_STORE_DISPOSED');
      let entry = entries.get(articleId);
      if (!entry) {
        const current: StoreEntry = {
          harness: openHarness(articleId, () => entries.get(articleId) === current),
          active: 0,
        };
        entry = current;
        entries.set(articleId, entry);
        void entry.harness.catch(() => {
          if (entries.get(articleId) === entry) entries.delete(articleId);
        });
      }
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
      entry.active += 1;
      return entry;
    }
  }

  function release(articleId: string, entry: StoreEntry) {
    entry.active -= 1;
    if (entry.active > 0 || entries.get(articleId) !== entry) return;
    entry.idleTimer = setTimeout(() => {
      if (entries.get(articleId) === entry && entry.active === 0) void close(articleId);
    }, IDLE_CLOSE_MS);
  }

  async function openHarness(articleId: string, isCurrent: () => boolean) {
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
      if (end.kind === 'failed') {
        input.logError('assistant_session.failed', end.error, { articleId });
        if (isCurrent()) entries.delete(articleId);
      }
    });
    try {
      await input.onOpen?.(articleId, harness);
      harness.resume();
    } catch (error) {
      await harness.close(BACKGROUND_CONTEXT).catch(() => undefined);
      throw error;
    }
    return harness;
  }

  async function openAt(path: string) {
    const storage = await openNodeSqliteStorage(path);
    try {
      return await Harness.open(storage, input.harnessOptions(), BACKGROUND_CONTEXT);
    } catch (error) {
      await storage.close(BACKGROUND_CONTEXT).catch(() => undefined);
      throw error;
    }
  }

  async function closeWith(articleId: string, afterClose?: () => Promise<void>) {
    const previous = closing.get(articleId);
    const task = (async () => {
      await previous?.catch(() => undefined);
      const entry = entries.get(articleId);
      if (entry) {
        entries.delete(articleId);
        clearTimeout(entry.idleTimer);
        const harness = await entry.harness.catch(() => undefined);
        await harness?.close(BACKGROUND_CONTEXT).catch((error) => {
          input.logError('assistant_session.close_failed', error, { articleId });
        });
      }
      await afterClose?.();
    })();
    closing.set(articleId, task);
    try {
      await task;
    } finally {
      if (closing.get(articleId) === task) closing.delete(articleId);
    }
  }

  function close(articleId: string) {
    return closeWith(articleId);
  }

  function remove(articleId: string) {
    return closeWith(articleId, () => removeArticleFiles(input.directory, articleId));
  }

  async function storedArticleIds() {
    const names = await readdir(input.directory).catch(() => []);
    return names.flatMap((name) => sessionArticleId(name) ?? []);
  }

  async function drainAll() {
    while (entries.size > 0 || closing.size > 0) {
      const entryIds = [...entries.keys()];
      const pendingCloses = [...closing.values()];
      await Promise.all([
        ...entryIds.map((articleId) => close(articleId)),
        ...pendingCloses.map((task) => task.catch(() => undefined)),
      ]);
    }
  }

  async function removeAll() {
    const previous = removingAll;
    const task = (async () => {
      await previous?.catch(() => undefined);
      await drainAll();
      await rm(input.directory, { recursive: true, force: true });
    })();
    removingAll = task;
    try {
      await task;
    } finally {
      if (removingAll === task) removingAll = undefined;
    }
  }

  async function dispose() {
    disposed = true;
    await drainAll();
  }

  return { use, remove, removeAll, storedArticleIds, dispose };
}
