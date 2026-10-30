import { createContext, useContext, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import i18next from 'i18next';
import type {
  Agent,
  ArticleRecord,
  AssistantRunEvent,
  ResolvedAppSettings,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { readCachedThemeId, themeRegistry, type AppThemeTone } from '../theme/app-theme';
import { assistantRunScope, type AssistantRunView } from '../shell/app-assistant-runs';
import { getOptionalDesktopApi } from '../shell/app-desktop-api';
import { discussionWindowTitle } from './app-annotation-discussion-utils';
import {
  bindAnnotationWindowArticle,
  bindAnnotationWindowTheme,
  type AnnotationWindowRoute,
} from './annotation-window-startup';

export type DiscussionWindowStatus =
  | { type: 'loading' }
  | {
      type: 'ready';
      agents: Agent[];
      article: ArticleRecord;
      settings: ResolvedAppSettings;
      uiLanguage: UiLanguage;
      user: UserProfile;
    }
  | { type: 'missing' }
  | { type: 'removed' }
  | { type: 'error'; message: string };

type DiscussionReadyStatus = Extract<DiscussionWindowStatus, { type: 'ready' }>;

type DiscussionWindowState = {
  assistantRuns: AssistantRunView[];
  status: DiscussionWindowStatus;
  themeTone: AppThemeTone;
  actions: {
    annotationRemoved: () => void;
    articleChanged: (article: ArticleRecord) => void;
    articleMissing: () => void;
    assistantRunsReceived: (events: AssistantRunEvent[], initial: boolean) => void;
    loaded: (status: Omit<DiscussionReadyStatus, 'type'>) => void;
    loadFailed: (message: string) => void;
    themeApplied: (tone: AppThemeTone) => void;
  };
};

export type DiscussionWindowStoreApi = StoreApi<DiscussionWindowState>;

export function createDiscussionWindowStore({
  annotationId,
  articleId,
}: Pick<AnnotationWindowRoute, 'annotationId' | 'articleId'>): DiscussionWindowStoreApi {
  const runScope = assistantRunScope({ kind: 'annotation', annotationId });

  // A finished run keeps its placeholder until its saved comment reaches this window.
  function withoutLandedRuns(runs: AssistantRunView[], status: DiscussionWindowStatus) {
    if (status.type !== 'ready') return runs;
    const annotation = status.article.annotations.find((item) => item.id === annotationId);
    if (!annotation) return runs;
    const commentIds = new Set(annotation.comments.map((comment) => comment.id));
    const pendingRuns = runs.filter((run) => !run.commentId || !commentIds.has(run.commentId));
    return pendingRuns.length === runs.length ? runs : pendingRuns;
  }

  function receiveRuns(runs: AssistantRunView[], events: AssistantRunEvent[], initial: boolean) {
    const current = new Map(runs.map((run) => [run.runKey, run]));
    const next = new Map(current);
    for (const event of events) {
      if (event.articleId !== articleId || assistantRunScope(event.channel) !== runScope) continue;
      if (initial && next.has(event.runKey)) continue;
      if (event.status === 'failed' || (event.status === 'done' && !event.commentId)) {
        next.delete(event.runKey);
        continue;
      }
      const startedAt = current.get(event.runKey)?.startedAt ?? new Date().toISOString();
      next.set(event.runKey, { ...event, startedAt });
    }
    return [...next.values()];
  }

  return createStore<DiscussionWindowState>()((set) => {
    function showStatus(status: DiscussionWindowStatus) {
      set((state) => ({ status, assistantRuns: withoutLandedRuns(state.assistantRuns, status) }));
    }

    return {
      assistantRuns: [],
      status: { type: 'loading' },
      themeTone: themeRegistry[readCachedThemeId()].meta.tone,
      actions: {
        annotationRemoved: () => showStatus({ type: 'removed' }),
        articleChanged: (article) =>
          set((state) => {
            if (state.status.type !== 'ready') return state;
            const status = { ...state.status, article };
            return { status, assistantRuns: withoutLandedRuns(state.assistantRuns, status) };
          }),
        articleMissing: () => showStatus({ type: 'missing' }),
        assistantRunsReceived: (events, initial) =>
          set((state) => ({
            assistantRuns: withoutLandedRuns(
              receiveRuns(state.assistantRuns, events, initial),
              state.status,
            ),
          })),
        loaded: (status) => showStatus({ type: 'ready', ...status }),
        loadFailed: (message) => showStatus({ type: 'error', message }),
        themeApplied: (themeTone) => set({ themeTone }),
      },
    };
  });
}

/** Loads the discussion and follows main-process pushes for it. Returns the unsubscribe. */
export function bindDiscussionWindow(
  store: DiscussionWindowStoreApi,
  route: AnnotationWindowRoute,
) {
  const { actions } = store.getState();
  const syncTitle = () => {
    document.title = discussionDocumentTitle(store.getState().status, route.annotationId);
  };
  syncTitle();
  const unsubscribeTitle = store.subscribe((state, previousState) => {
    if (state.status !== previousState.status) syncTitle();
  });
  const unbindTheme = bindAnnotationWindowTheme((theme) => actions.themeApplied(theme.meta.tone));
  const unbindArticle = bindAnnotationWindowArticle(route, {
    failed: (error) =>
      actions.loadFailed(
        error instanceof Error ? error.message : i18next.t('discussion.loadFailed'),
      ),
    loaded: ({ article, store: desktopStore }) =>
      actions.loaded({
        agents: desktopStore.agents,
        article,
        settings: desktopStore.settings,
        uiLanguage: normalizeUiLanguage(desktopStore.settings.uiLanguage),
        user: desktopStore.user,
      }),
    missing: actions.articleMissing,
    patched: (article) => actions.articleChanged(article),
  });
  const unbindRuns =
    route.articleId && route.annotationId
      ? bindAssistantRuns(route.articleId, actions.assistantRunsReceived)
      : () => undefined;
  return () => {
    unbindRuns();
    unbindArticle();
    unbindTheme();
    unsubscribeTitle();
  };
}

function bindAssistantRuns(
  articleId: string,
  receive: (events: AssistantRunEvent[], initial: boolean) => void,
) {
  const assistant = getOptionalDesktopApi()?.assistant;
  let active = true;
  const stop = assistant?.onRun?.((event) => receive([event], false));
  void assistant
    ?.runs?.(articleId)
    .then((events) => {
      if (active) receive(events, true);
    })
    .catch(() => undefined);
  return () => {
    active = false;
    stop?.();
  };
}

function discussionDocumentTitle(status: DiscussionWindowStatus, annotationId: string) {
  const annotation =
    status.type === 'ready'
      ? status.article.annotations.find((item) => item.id === annotationId)
      : undefined;
  return status.type === 'ready' && annotation
    ? discussionWindowTitle({ annotation, article: status.article })
    : i18next.t('discussion.title');
}

const DiscussionWindowStoreContext = createContext<DiscussionWindowStoreApi | null>(null);

export function DiscussionWindowStoreProvider({
  store,
  children,
}: {
  store: DiscussionWindowStoreApi;
  children: ReactNode;
}) {
  return <DiscussionWindowStoreContext value={store}>{children}</DiscussionWindowStoreContext>;
}

export function useDiscussionWindowStoreApi() {
  const store = useContext(DiscussionWindowStoreContext);
  if (!store) throw new Error('DiscussionWindowStoreProvider is missing');
  return store;
}

export function useDiscussionWindow<T>(selector: (state: DiscussionWindowState) => T) {
  return useStore(useDiscussionWindowStoreApi(), selector);
}
