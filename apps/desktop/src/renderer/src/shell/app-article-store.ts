import { useCallback, useMemo, useRef } from 'react';
import type {
  ArticleDeletePatch,
  ArticleRecord,
  ArticleReadingProgressPatch,
  ArticleStorePatch,
  ArticleSummaryRecord,
  ArticleUpsertPatch,
  DesktopStore,
} from '@yomitomo/shared';
import { isAppLockSettingsLocked } from '../../../app-store';

type DesktopStoreRef = { current: DesktopStore };
type ApplyStore = (nextStore: DesktopStore) => DesktopStore;

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

export function useArticleStore(input: {
  storeRef: DesktopStoreRef;
  applyStore: ApplyStore;
}): ArticleStore {
  const inputRef = useRef(input);
  inputRef.current = input;
  const currentArticleSinkRef = useRef<CurrentArticleSink | null>(null);
  const readingProgressMutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const commit = useCallback((projection: ArticleProjectionCommit) => {
    const { applyStore, storeRef } = inputRef.current;
    if (isAppLockSettingsLocked(storeRef.current.settings)) return false;
    if (projection.patches.length > 0) {
      const nextStore = projection.patches.reduce(applyArticleStorePatch, storeRef.current);
      applyStore(nextStore);
    }
    const current = projection.current;
    const sink = currentArticleSinkRef.current;
    if (current && sink && (current.type === 'delete' || sink.isCurrent(current.articleId))) {
      sink.apply(current);
    }
    return true;
  }, []);

  const registerCurrentArticleSink = useCallback((sink: CurrentArticleSink) => {
    currentArticleSinkRef.current = sink;
    return () => {
      if (currentArticleSinkRef.current === sink) currentArticleSinkRef.current = null;
    };
  }, []);

  const runMutation = useCallback(
    async <T>(spec: ArticleMutationSpec<T>) => {
      const run = async () => {
        // Optimistic projection intentionally remains when invoke fails; a later
        // authoritative patch or full store refresh reconciles it.
        if (spec.optimistic) commit(spec.optimistic);
        const result = await spec.invoke();
        commit(spec.reconcile(result));
        return result;
      };
      if (spec.serialize !== 'reading-progress') return run();

      const nextMutation = readingProgressMutationQueueRef.current.then(run, run);
      readingProgressMutationQueueRef.current = nextMutation.then(
        () => undefined,
        () => undefined,
      );
      return nextMutation;
    },
    [commit],
  );

  return useMemo(
    () => ({ commit, registerCurrentArticleSink, runMutation }),
    [commit, registerCurrentArticleSink, runMutation],
  );
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
    case 'article-delete':
      return applyArticleDeletePatch(store, patch);
  }
}

export function articleStorePatchCommit(patch: ArticleStorePatch): ArticleProjectionCommit {
  if (patch.type !== 'article-delete') return { patches: [patch] };
  return {
    patches: [patch],
    current: { type: 'delete', articleId: patch.articleId },
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
    articles: store.articles.map(
      (article, index): ArticleSummaryRecord => (index === existingIndex ? patch.article : article),
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
