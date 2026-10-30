import { createContext, useContext, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import i18next from 'i18next';
import type { Annotation, ArticleRecord, UserProfile } from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import type { SedimentationReadyStatus } from './use-annotation-sedimentation-controller';
import {
  bindAnnotationWindowArticle,
  bindAnnotationWindowTheme,
  type AnnotationWindowRoute,
} from './annotation-window-startup';

export type SedimentationWindowStatus =
  | { type: 'loading' }
  | SedimentationReadyStatus
  | { type: 'missing' }
  | { type: 'error'; message: string };

type SedimentationWindowState = {
  status: SedimentationWindowStatus;
  user: UserProfile | null;
  actions: {
    annotationChanged: (status: SedimentationReadyStatus) => void;
    articleMissing: () => void;
    articlePatched: (article: ArticleRecord, annotation: Annotation) => void;
    loaded: (status: SedimentationReadyStatus, user: UserProfile) => void;
    loadFailed: (message: string) => void;
  };
};

export type SedimentationWindowStoreApi = StoreApi<SedimentationWindowState>;

export function createSedimentationWindowStore(): SedimentationWindowStoreApi {
  return createStore<SedimentationWindowState>()((set) => ({
    status: { type: 'loading' },
    user: null,
    actions: {
      annotationChanged: (status) => set({ status }),
      articleMissing: () => set({ status: { type: 'missing' } }),
      articlePatched: (article, annotation) =>
        set((state) =>
          state.status.type === 'ready'
            ? { status: { ...state.status, annotation, article } }
            : state,
        ),
      loaded: (status, user) => set({ status, user }),
      loadFailed: (message) => set({ status: { type: 'error', message } }),
    },
  }));
}

/** Loads the sedimentation window and follows main-process pushes for it. */
export function bindSedimentationWindow(
  store: SedimentationWindowStoreApi,
  route: AnnotationWindowRoute,
) {
  const { actions } = store.getState();
  const syncTitle = () => {
    document.title = sedimentationDocumentTitle(store.getState().status);
  };
  syncTitle();
  const unsubscribeTitle = store.subscribe((state, previousState) => {
    if (state.status !== previousState.status) syncTitle();
  });
  const unbindTheme = bindAnnotationWindowTheme();
  const unbindArticle = bindAnnotationWindowArticle(route, {
    failed: (error) =>
      actions.loadFailed(
        error instanceof Error ? error.message : i18next.t('sedimentation.loadFailed'),
      ),
    loaded: ({ annotation, article, store: desktopStore }) =>
      actions.loaded(
        {
          type: 'ready',
          agents: desktopStore.agents,
          article,
          annotation,
          uiLanguage: normalizeUiLanguage(desktopStore.settings?.uiLanguage),
        },
        desktopStore.user,
      ),
    missing: actions.articleMissing,
    patched: actions.articlePatched,
  });
  return () => {
    unbindArticle();
    unbindTheme();
    unsubscribeTitle();
  };
}

function sedimentationDocumentTitle(status: SedimentationWindowStatus) {
  if (status.type !== 'ready') return i18next.t('sedimentation.title');
  const quote = compactTitleText(status.annotation.anchor.exact);
  return quote
    ? i18next.t('sedimentation.windowTitle', { title: quote })
    : i18next.t('sedimentation.title');
}

function compactTitleText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 34 ? `${normalized.slice(0, 34)}...` : normalized;
}

const SedimentationWindowStoreContext = createContext<SedimentationWindowStoreApi | null>(null);

export function SedimentationWindowStoreProvider({
  store,
  children,
}: {
  store: SedimentationWindowStoreApi;
  children: ReactNode;
}) {
  return (
    <SedimentationWindowStoreContext value={store}>{children}</SedimentationWindowStoreContext>
  );
}

export function useSedimentationWindow<T>(selector: (state: SedimentationWindowState) => T) {
  const store = useContext(SedimentationWindowStoreContext);
  if (!store) throw new Error('SedimentationWindowStoreProvider is missing');
  return useStore(store, selector);
}
