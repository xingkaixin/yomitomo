import type {
  ArticleDeletePatch,
  ArticleRecord,
  ArticleReaderChatStatePatch,
  ArticleReadingProgressPatch,
  ArticleStorePatch,
  ArticleSummaryRecord,
  ArticleUpsertPatch,
  DesktopStore,
} from '@yomitomo/shared';
import { isAppLockSettingsLocked } from '../../../app-store';

export type ArticleProjectionCommit = {
  patches: ArticleStorePatch[];
  current?: CurrentArticleUpdate;
};

export type CurrentArticleUpdate =
  | { type: 'delete'; articleId: string }
  | {
      type: 'update';
      articleId: string;
      update: (article: ArticleRecord) => ArticleRecord;
    };

export type CurrentArticleSink = {
  isCurrent(articleId: string): boolean;
  apply(update: CurrentArticleUpdate): void;
};

export type ArticleMutationSpec<T> = {
  optimistic?: ArticleProjectionCommit;
  invoke: () => Promise<T>;
  reconcile: (result: T) => ArticleProjectionCommit;
  serialize?: 'reading-progress';
};

export type ArticleStore = {
  commit(commit: ArticleProjectionCommit): boolean;
  registerCurrentArticleSink(sink: CurrentArticleSink): () => void;
  runMutation<T>(spec: ArticleMutationSpec<T>): Promise<T>;
};

export function createArticleStore(input: {
  getStore: () => DesktopStore | null;
  applyStore: (nextStore: DesktopStore) => DesktopStore;
}): ArticleStore {
  let currentArticleSink: CurrentArticleSink | null = null;
  let readingProgressMutationQueue: Promise<void> = Promise.resolve();

  function commit(projection: ArticleProjectionCommit) {
    const store = input.getStore();
    if (!store || isAppLockSettingsLocked(store.settings)) return false;
    if (projection.patches.length > 0) {
      input.applyStore(projection.patches.reduce(applyArticleStorePatch, store));
    }
    const current = projection.current;
    const sink = currentArticleSink;
    if (current && sink && (current.type === 'delete' || sink.isCurrent(current.articleId))) {
      sink.apply(current);
    }
    return true;
  }

  function registerCurrentArticleSink(sink: CurrentArticleSink) {
    currentArticleSink = sink;
    return () => {
      if (currentArticleSink === sink) currentArticleSink = null;
    };
  }

  async function runMutation<T>(spec: ArticleMutationSpec<T>) {
    const run = async () => {
      // Optimistic projection intentionally remains when invoke fails; a later
      // authoritative patch or full store refresh reconciles it.
      if (spec.optimistic) commit(spec.optimistic);
      const result = await spec.invoke();
      commit(spec.reconcile(result));
      return result;
    };
    if (spec.serialize !== 'reading-progress') return run();

    const nextMutation = readingProgressMutationQueue.then(run, run);
    readingProgressMutationQueue = nextMutation.then(
      () => undefined,
      () => undefined,
    );
    return nextMutation;
  }

  return { commit, registerCurrentArticleSink, runMutation };
}

export function applyArticleStorePatch(
  store: DesktopStore,
  patch: ArticleStorePatch,
): DesktopStore {
  switch (patch.type) {
    case 'article-upsert':
      return applyArticleUpsertPatch(store, patch);
    case 'article-reading-progress':
      return applyArticleReadingProgressPatch(store, patch);
    case 'article-reader-chat-state':
      return applyArticleReaderChatStatePatch(store, patch);
    case 'article-delete':
      return applyArticleDeletePatch(store, patch);
  }
}

export function articleStorePatchCommit(patch: ArticleStorePatch): ArticleProjectionCommit {
  switch (patch.type) {
    case 'article-delete':
      return {
        patches: [patch],
        current: { type: 'delete', articleId: patch.articleId },
      };
    case 'article-reader-chat-state':
      return {
        patches: [patch],
        current: {
          type: 'update',
          articleId: patch.articleId,
          update: (article) => ({
            ...article,
            readerChatState: patch.readerChatState,
            updatedAt: patch.updatedAt,
          }),
        },
      };
    default:
      return { patches: [patch] };
  }
}

export function applyArticleReaderChatStatePatch(
  store: DesktopStore,
  patch: ArticleReaderChatStatePatch,
): DesktopStore {
  return {
    ...store,
    articles: store.articles.map((article) =>
      article.id === patch.articleId ? { ...article, updatedAt: patch.updatedAt } : article,
    ),
  };
}

export function applyArticleReadingProgressPatch(
  store: DesktopStore,
  patch: ArticleReadingProgressPatch,
): DesktopStore {
  return {
    ...store,
    articles: store.articles.map((article) =>
      article.id === patch.articleId
        ? { ...article, readingProgress: patch.readingProgress, updatedAt: patch.updatedAt }
        : article,
    ),
  };
}

export function applyArticleUpsertPatch(
  store: DesktopStore,
  patch: ArticleUpsertPatch,
): DesktopStore {
  const existingIndex = store.articles.findIndex((article) => article.id === patch.article.id);
  if (existingIndex === -1) {
    return {
      ...store,
      articles: [patch.article, ...store.articles],
    };
  }

  return {
    ...store,
    articles: store.articles.map((article, index): ArticleSummaryRecord =>
      index === existingIndex ? patch.article : article,
    ),
  };
}

export function applyArticleDeletePatch(
  store: DesktopStore,
  patch: ArticleDeletePatch,
): DesktopStore {
  return {
    ...store,
    articles: store.articles.filter((article) => article.id !== patch.articleId),
    collectionMembers: store.collectionMembers.filter(
      (member) => member.member.kind !== 'article' || member.member.id !== patch.articleId,
    ),
    pins: store.pins.filter(
      (pin) => pin.targetKind !== 'article' || pin.targetId !== patch.articleId,
    ),
  };
}
