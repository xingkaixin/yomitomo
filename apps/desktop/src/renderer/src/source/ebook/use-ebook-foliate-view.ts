import type React from 'react';
import { createElement, useCallback, useEffectEvent, useMemo, useReducer, useRef } from 'react';
import i18next from 'i18next';
import type { ArticleReadingProgress, ArticleRecord } from '@yomitomo/shared';
import { readingProgressRatio } from '@yomitomo/core';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import type { ReaderSettings } from '@yomitomo/reader-ui/reader-types';
import { clampNumber } from '@yomitomo/reader-ui/reader-settings';
import {
  closeFoliateView,
  configureFoliateView,
  flattenFoliateToc,
  recordEbookPageTurnTrace,
  type EbookPageTurnTrace,
  type FoliatePageInfo,
  type FoliateRelocateDetail,
  type FoliateViewElement,
} from './ebook-foliate-view';
import type { EbookBoxUpdateReason } from './ebook-annotation-layout';
import { useEbookPaginationMeasurement } from './use-ebook-pagination-measurement';
import { getDesktopApi } from '../../shell/app-desktop-api';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';
import type { EbookBookcaseProps } from '../bookcase/source-bookcase-types';
import { useSourceReadingProgressSaver } from '../bookcase/use-source-reading-progress-saver';

type EbookReaderState = {
  status: 'loading' | 'ready' | 'error';
  message: string;
};

type UseEbookFoliateViewInput = {
  article: EbookBookcaseProps['content']['article'];
  maxColumnCount: number;
  readerTheme: ReaderTheme;
  readerSettings: ReaderSettings;
  onSaveArticleReadingProgress: EbookBookcaseProps['articleActions']['saveArticleReadingProgress'];
  onAttachFoliateDocumentListeners: (view: FoliateViewElement | null) => void;
  onBeforePageTurn: (trace: EbookPageTurnTrace) => void;
  onCleanupFoliateDocumentListeners: () => void;
  onScheduleEbookBoxUpdate: (reason: EbookBoxUpdateReason) => void;
  pageTurnTraceRef: React.RefObject<EbookPageTurnTrace | null>;
};

type PageTurnDirection = 'left' | 'right';

type EbookFoliateViewState = {
  tocItems: ReturnType<typeof flattenFoliateToc>;
  sectionFractions: number[];
  pageInfo: FoliatePageInfo | null;
  progress: number;
  readerState: EbookReaderState;
  openSettled: boolean;
};

type EbookFoliateViewEvent =
  | {
      type: 'bookOpened';
      tocItems: ReturnType<typeof flattenFoliateToc>;
      sectionFractions: number[];
    }
  | { type: 'openFailed'; message: string }
  | { type: 'openSettled' }
  | { type: 'relocated'; pageInfo: FoliatePageInfo | null; progress: number }
  | { type: 'pageInfoMeasured'; pageInfo: FoliatePageInfo | null }
  | { type: 'progressJumped'; progress: number };

function initialEbookFoliateViewState(
  readingProgress: ArticleReadingProgress | undefined,
): EbookFoliateViewState {
  return {
    tocItems: [],
    sectionFractions: [],
    pageInfo: null,
    progress: readingProgressRatio(readingProgress),
    readerState: { status: 'loading', message: i18next.t('ebookReader.opening') },
    openSettled: false,
  };
}

function ebookFoliateViewReducer(
  state: EbookFoliateViewState,
  event: EbookFoliateViewEvent,
): EbookFoliateViewState {
  switch (event.type) {
    case 'bookOpened':
      return {
        ...state,
        tocItems: event.tocItems,
        sectionFractions: event.sectionFractions,
        readerState: { status: 'ready', message: '' },
      };
    case 'openFailed':
      return {
        ...state,
        readerState: { status: 'error', message: event.message },
        openSettled: true,
      };
    case 'openSettled':
      return { ...state, openSettled: true };
    case 'relocated':
      return { ...state, pageInfo: event.pageInfo, progress: event.progress };
    case 'pageInfoMeasured':
      return { ...state, pageInfo: event.pageInfo };
    case 'progressJumped':
      return { ...state, progress: event.progress };
  }
}

type EbookProgressRestoreTarget =
  | {
      kind: 'section-anchor';
      sectionIndex: number;
      anchor: number;
    }
  | {
      kind: 'fraction';
      fraction: number;
    };

export function ebookReadingProgressPageAnchor(pageInfo: FoliatePageInfo | null) {
  if (!pageInfo) return undefined;
  if (pageInfo.pageCount <= 1) return 0;
  return clampNumber(pageInfo.pageIndex / (pageInfo.pageCount - 1), 0, 1, 0);
}

export function ebookReadingProgressSnapshot(
  pageInfo: FoliatePageInfo | null,
  progress: number,
):
  | Omit<Extract<ArticleReadingProgress, { kind: 'chapter' }>, 'updatedAt'>
  | Omit<Extract<ArticleReadingProgress, { kind: 'scroll' }>, 'updatedAt'> {
  if (!pageInfo) return { kind: 'scroll', progress };

  return {
    kind: 'chapter',
    chapterIndex: Math.max(0, pageInfo.sectionIndex),
    chapterProgress: ebookReadingProgressPageAnchor(pageInfo) ?? 0,
    bookProgress: progress,
  };
}

export function ebookReadingProgressRestoreTarget(
  progress: ArticleReadingProgress | undefined,
): EbookProgressRestoreTarget | null {
  if (!progress) return null;
  if (progress.kind === 'chapter') {
    return {
      kind: 'section-anchor',
      sectionIndex: Math.max(0, progress.chapterIndex),
      anchor: clampNumber(progress.chapterProgress, 0, 1, 0),
    };
  }

  const fraction = readingProgressRatio(progress);
  return fraction > 0 ? { kind: 'fraction', fraction } : null;
}

export function useEbookFoliateView({
  article,
  maxColumnCount,
  readerTheme,
  readerSettings,
  onSaveArticleReadingProgress,
  onAttachFoliateDocumentListeners,
  onBeforePageTurn,
  onCleanupFoliateDocumentListeners,
  onScheduleEbookBoxUpdate,
  pageTurnTraceRef,
}: UseEbookFoliateViewInput) {
  const viewHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<FoliateViewElement | null>(null);
  const ebookFileRef = useRef<File | null>(null);
  const pageInfoSectionIndexRef = useRef<number | undefined>(undefined);
  const lastStablePageInfoRef = useRef<FoliatePageInfo | null>(null);
  const readerSettingsRef = useRef<ReaderSettings>(readerSettings);
  const readerThemeRef = useRef<ReaderTheme>(readerTheme);
  const maxColumnCountRef = useRef(1);
  const progressRef = useRef(readingProgressRatio(article.readingProgress));
  const pageTurnQueueRef = useRef<PageTurnDirection[]>([]);
  const pageTurnRunningRef = useRef(false);
  const pageTurnSequenceRef = useRef(0);
  const [{ tocItems, sectionFractions, pageInfo, progress, readerState, openSettled }, dispatch] =
    useReducer(ebookFoliateViewReducer, article.readingProgress, initialEbookFoliateViewState);
  const readerStateStatusRef = useRef<EbookReaderState['status']>(readerState.status);
  const { scheduleSave: scheduleEbookProgressSave } = useSourceReadingProgressSaver({
    articleId: article.id,
    initialProgress: article.readingProgress,
    onSaveArticleReadingProgress,
  });
  const attachDocumentListeners = useEffectEvent(onAttachFoliateDocumentListeners);
  const beforePageTurn = useEffectEvent(onBeforePageTurn);
  const cleanupDocumentListeners = useEffectEvent(onCleanupFoliateDocumentListeners);
  const scheduleEbookBoxUpdate = useEffectEvent(onScheduleEbookBoxUpdate);
  const readLayoutInput = useEffectEvent(() => ({
    articleId: article.id,
    maxColumnCount,
    readerSettings,
    readerTheme,
  }));
  const readArticle = useEffectEvent(() => article);
  const rememberPageInfo = useCallback((nextPageInfo: FoliatePageInfo | null) => {
    pageInfoSectionIndexRef.current = nextPageInfo?.sectionIndex;
    if (nextPageInfo) lastStablePageInfoRef.current = nextPageInfo;
  }, []);
  const synchronizePageInfo = useCallback(
    (nextPageInfo: FoliatePageInfo | null) => {
      rememberPageInfo(nextPageInfo);
      dispatch({ type: 'pageInfoMeasured', pageInfo: nextPageInfo });
    },
    [rememberPageInfo],
  );
  const pagination = useEbookPaginationMeasurement({
    articleId: article.id,
    ebookFileRef,
    maxColumnCount,
    maxColumnCountRef,
    onPageInfoChange: synchronizePageInfo,
    onScheduleEbookBoxUpdate,
    readerSettings,
    readerSettingsRef,
    readerStateStatus: readerState.status,
    readerThemeRef,
    viewHostRef,
    viewRef,
  });
  const { measureHostRef, paginationLayoutKeyRef, recordKnownPageInfo, sectionPageCounts } =
    pagination;

  const beginPageTurnTrace = useCallback(
    (source: EbookPageTurnTrace['source'], direction: EbookPageTurnTrace['direction']) => {
      const articleId = readArticle().id;
      const trace: EbookPageTurnTrace = {
        articleId,
        direction,
        source,
        startedAt: performance.now(),
        turnId: `${articleId}:${Date.now().toString(36)}:${++pageTurnSequenceRef.current}`,
      };
      pageTurnTraceRef.current = trace;
      recordEbookPageTurnTrace(trace, 'start', {
        pageInfo: viewRef.current?.getPageInfo?.() ?? null,
        queueLength: pageTurnQueueRef.current.length,
      });
      return trace;
    },
    [pageTurnTraceRef],
  );

  const layoutKey = useMemo(
    () => JSON.stringify([maxColumnCount, readerSettings, readerTheme]),
    [maxColumnCount, readerSettings, readerTheme],
  );

  const applyLayout = useCallback((marker: HTMLElement | null) => {
    if (!marker) return;
    const {
      articleId,
      maxColumnCount: columns,
      readerSettings: settings,
      readerTheme: theme,
    } = readLayoutInput();
    const previousMaxColumnCount = maxColumnCountRef.current;
    maxColumnCountRef.current = columns;
    readerSettingsRef.current = settings;
    readerThemeRef.current = theme;
    const view = viewRef.current;
    const pageInfoBeforeLayout = view?.getPageInfo?.() ?? lastStablePageInfoRef.current;
    if (pageInfoBeforeLayout) lastStablePageInfoRef.current = pageInfoBeforeLayout;
    configureFoliateView(view, settings, theme, columns);
    if (view && readerStateStatusRef.current === 'ready' && previousMaxColumnCount !== columns) {
      const livePageInfo = view.getPageInfo?.() ?? null;
      const restorePageInfo = pageInfoBeforeLayout ?? livePageInfo;
      if (restorePageInfo) lastStablePageInfoRef.current = restorePageInfo;
      const restoreProgress = restorePageInfo
        ? {
            kind: 'chapter' as const,
            chapterIndex: restorePageInfo.sectionIndex,
            chapterProgress: ebookReadingProgressPageAnchor(restorePageInfo) ?? 0,
            bookProgress: progressRef.current,
            updatedAt: new Date().toISOString(),
          }
        : {
            kind: 'scroll' as const,
            progress: clampNumber(progressRef.current, 0, 1, 0),
            updatedAt: new Date().toISOString(),
          };
      recordRendererPerformanceTiming('ebook_layout', {
        articleId,
        fromColumns: previousMaxColumnCount,
        livePageInfo,
        pageInfo: restorePageInfo,
        progress: progressRef.current,
        toColumns: columns,
      });
      void restoreEbookReadingProgress(view, restoreProgress);
    }
    scheduleEbookBoxUpdate('reader_settings');
  }, []);

  const openBook = useCallback(
    (marker: HTMLElement | null) => {
      const host = viewHostRef.current;
      if (!marker || !host) return;
      const hostElement = host;
      const openedArticle = readArticle();

      let cancelled = false;
      let view: FoliateViewElement | null = null;

      const handleRelocate = (event: Event) => {
        const detail = (event as CustomEvent<FoliateRelocateDetail>).detail;
        const nextProgress = clampNumber(detail.fraction, 0, 1, 0);
        const nextPageInfo =
          (event.currentTarget as FoliateViewElement | null)?.getPageInfo?.() ?? null;
        const progressSnapshot = ebookReadingProgressSnapshot(nextPageInfo, nextProgress);
        recordEbookPageTurnTrace(pageTurnTraceRef.current, 'relocate', {
          pageIndex: nextPageInfo?.pageIndex,
          pageCount: nextPageInfo?.pageCount,
          reason: detail.reason,
          sectionIndex: nextPageInfo?.sectionIndex,
        });

        progressRef.current = nextProgress;
        rememberPageInfo(nextPageInfo);
        dispatch({ type: 'relocated', pageInfo: nextPageInfo, progress: nextProgress });
        if (nextPageInfo) recordKnownPageInfo(nextPageInfo);
        attachDocumentListeners(event.currentTarget as FoliateViewElement);
        scheduleEbookBoxUpdate('relocate');
        scheduleEbookProgressSave({
          ...progressSnapshot,
          updatedAt: new Date().toISOString(),
        });
      };

      const handleExternalLink = (event: Event) => {
        const customEvent = event as CustomEvent<Record<string, string | undefined>>;
        const href = customEvent.detail['href_'] || customEvent.detail.href;
        if (!href) return;
        event.preventDefault();
        void getDesktopApi().app.openUrl(href);
      };

      const handleLoad = (event: Event) => {
        const detail = (event as CustomEvent<{ index?: number }>).detail;
        recordEbookPageTurnTrace(pageTurnTraceRef.current, 'load', {
          sectionIndex: detail.index,
        });
      };

      const handlePageTurnStart = (event: Event) => {
        const detail = (event as CustomEvent<{ direction?: number; reason?: string }>).detail;
        const trace =
          pageTurnTraceRef.current ?? beginPageTurnTrace('foliate', detail.direction ?? 0);
        recordEbookPageTurnTrace(trace, 'foliate_page_turn_start', {
          pageInfo: viewRef.current?.getPageInfo?.() ?? null,
          reason: detail.reason,
        });
        beforePageTurn(trace);
      };

      async function openEbook() {
        try {
          await import('../../vendor/foliate-js/view.js');
          const data = await getDesktopApi().article.ebook.readFile(openedArticle.id);
          if (cancelled) return;

          const file = ebookSourceFile(openedArticle, data);
          ebookFileRef.current = file;
          view = document.createElement('foliate-view') as FoliateViewElement;
          view.className = 'ebook-foliate-view';
          view.addEventListener('relocate', handleRelocate);
          view.addEventListener('external-link', handleExternalLink);
          view.addEventListener('load', handleLoad);
          view.addEventListener('page-turn-start', handlePageTurnStart);
          hostElement.replaceChildren(view);
          await view.open(file);
          if (cancelled) return;

          viewRef.current = view;
          configureFoliateView(
            view,
            readerSettingsRef.current,
            readerThemeRef.current,
            maxColumnCountRef.current,
          );
          readerStateStatusRef.current = 'ready';
          dispatch({
            type: 'bookOpened',
            tocItems: flattenFoliateToc(view.book?.toc ?? []),
            sectionFractions: view.getSectionFractions?.() ?? [],
          });

          if (!(await restoreEbookReadingProgress(view, openedArticle.readingProgress))) {
            await view.next();
          }
          attachDocumentListeners(view);
          scheduleEbookBoxUpdate('open_ebook');
          dispatch({ type: 'openSettled' });
        } catch (error) {
          if (cancelled) return;
          readerStateStatusRef.current = 'error';
          dispatch({ type: 'openFailed', message: ebookOpenErrorMessage(error) });
        }
      }

      void openEbook();

      return () => {
        cancelled = true;
        view?.removeEventListener('relocate', handleRelocate);
        view?.removeEventListener('external-link', handleExternalLink);
        view?.removeEventListener('load', handleLoad);
        view?.removeEventListener('page-turn-start', handlePageTurnStart);
        cleanupDocumentListeners();
        closeFoliateView(view);
        view?.remove();
        if (viewRef.current === view) viewRef.current = null;
        if (viewRef.current === null) ebookFileRef.current = null;
        hostElement.replaceChildren();
      };
    },
    [
      beginPageTurnTrace,
      pageTurnTraceRef,
      recordKnownPageInfo,
      rememberPageInfo,
      scheduleEbookProgressSave,
    ],
  );

  const drainPageTurnQueue = useCallback(() => {
    if (pageTurnRunningRef.current) return;
    pageTurnRunningRef.current = true;

    void (async () => {
      try {
        while (pageTurnQueueRef.current.length > 0) {
          const direction = pageTurnQueueRef.current.shift()!;
          const view = viewRef.current;
          if (!view || readerStateStatusRef.current !== 'ready') continue;

          const trace = beginPageTurnTrace('control', direction);
          beforePageTurn(trace);
          recordEbookPageTurnTrace(trace, 'view_go_start');
          if (direction === 'left') await view.goLeft();
          else await view.goRight();
          recordEbookPageTurnTrace(trace, 'view_go_done', {
            pageInfo: view.getPageInfo?.() ?? null,
          });
          scheduleEbookBoxUpdate('page_turn');
        }
      } finally {
        pageTurnRunningRef.current = false;
      }
    })();
  }, [beginPageTurnTrace]);

  const turnPage = useCallback(
    (direction: PageTurnDirection) => {
      pageTurnQueueRef.current.push(direction);
      drainPageTurnQueue();
    },
    [drainPageTurnQueue],
  );

  const goLeft = useCallback(() => {
    turnPage('left');
  }, [turnPage]);

  const goRight = useCallback(() => {
    turnPage('right');
  }, [turnPage]);

  const goToTocItem = useCallback((item: { href: string }) => {
    void viewRef.current?.goTo(item.href);
  }, []);

  const goToProgress = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextProgress = clampNumber(Number(event.currentTarget.value), 0, 1, progress);
      dispatch({ type: 'progressJumped', progress: nextProgress });
      progressRef.current = nextProgress;
      void viewRef.current?.goToFraction(nextProgress);
    },
    [progress],
  );

  return {
    viewHostRef,
    measureHostRef,
    viewRef,
    pageInfoSectionIndexRef,
    paginationLayoutKeyRef,
    readerSettingsRef,
    readerStateStatusRef,
    tocItems,
    sectionFractions,
    pageInfo,
    sectionPageCounts,
    progress,
    readerState,
    openSettled,
    // Rendered after the reader shell; layout settings attach before pagination reads them.
    markers: [
      createElement('span', { hidden: true, key: layoutKey, ref: applyLayout }),
      createElement('span', { hidden: true, key: 'open', ref: openBook }),
      ...pagination.markers,
    ],
    goLeft,
    goRight,
    goToProgress,
    goToTocItem,
  };
}

export function ebookSourceFile(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  data: ArrayBuffer,
) {
  const format = article.ebook.metadata.format;
  return new File([data], article.ebook.metadata.fileName || `${article.title}.${format}`, {
    type: ebookSourceMimeType(format),
  });
}

function ebookSourceMimeType(format: NonNullable<ArticleRecord['ebook']>['metadata']['format']) {
  if (format === 'azw3') return 'application/vnd.amazon.ebook';
  if (format === 'mobi') return 'application/x-mobipocket-ebook';
  return 'application/epub+zip';
}

function ebookOpenErrorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message) return i18next.t('ebookReader.openFailed');
  if (error.message === 'EBOOK_SOURCE_FILE_MISSING') return i18next.t('ebookReader.sourceMissing');
  if (error.message === 'EBOOK_SOURCE_INVALID_ID') return i18next.t('ebookReader.openFailed');
  return error.message;
}

async function restoreEbookReadingProgress(
  view: FoliateViewElement,
  progress: ArticleReadingProgress | undefined,
) {
  const target = ebookReadingProgressRestoreTarget(progress);
  if (!target) return false;

  if (target.kind === 'fraction') {
    await view.goToFraction(target.fraction);
    return true;
  }

  if (view.renderer?.goTo) {
    await view.renderer.goTo({ index: target.sectionIndex, anchor: target.anchor });
    return true;
  }

  const fractions = view.getSectionFractions?.() ?? [];
  const start = fractions[target.sectionIndex];
  const end = fractions[target.sectionIndex + 1];
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    await view.goToFraction(clampNumber(start + (end - start) * target.anchor, 0, 1, 0));
    return true;
  }

  await view.goTo(target.sectionIndex);
  return true;
}
