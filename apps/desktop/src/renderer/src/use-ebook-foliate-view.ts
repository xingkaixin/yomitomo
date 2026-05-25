import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ArticleReadingProgress } from '@yomitomo/shared';
import type { ReaderSettings } from '@yomitomo/reader-ui/reader-types';
import { clampNumber } from '@yomitomo/reader-ui/reader-utils';
import {
  closeFoliateView,
  configureFoliateView,
  flattenFoliateToc,
  recordEbookPageTurnTrace,
  updateKnownSectionPageCount,
  waitForFoliateIdle,
  waitForFoliatePageInfo,
  type EbookBoxUpdateReason,
  type EbookPageTurnTrace,
  type FoliatePageInfo,
  type FoliateRelocateDetail,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import type { EbookBookcaseProps } from './app-source-bookcase-shared';

type EbookReaderState = {
  status: 'loading' | 'ready' | 'error';
  message: string;
};

type UseEbookFoliateViewInput = {
  article: EbookBookcaseProps['article'];
  readerSettings: ReaderSettings;
  onSaveArticleReadingProgress: EbookBookcaseProps['onSaveArticleReadingProgress'];
  onAttachFoliateDocumentListeners: (view: FoliateViewElement | null) => void;
  onBeforePageTurn: (trace: EbookPageTurnTrace) => void;
  onCleanupFoliateDocumentListeners: () => void;
  onScheduleEbookBoxUpdate: (reason: EbookBoxUpdateReason) => void;
  pageTurnTraceRef: React.RefObject<EbookPageTurnTrace | null>;
};

type PageTurnDirection = 'left' | 'right';

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
  detail: FoliateRelocateDetail,
  pageInfo: FoliatePageInfo | null,
  progress: number,
): Omit<ArticleReadingProgress, 'updatedAt'> {
  return {
    pageIndex: Math.max(
      0,
      pageInfo?.pageIndex ?? detail.location?.current ?? Math.round(progress * 1000),
    ),
    pageCount: Math.max(1, pageInfo?.pageCount ?? detail.location?.total ?? 1000),
    chapterIndex: pageInfo?.sectionIndex ?? detail.section?.current,
    chapterProgress: ebookReadingProgressPageAnchor(pageInfo),
    progress,
  };
}

export function ebookReadingProgressRestoreTarget(
  progress: ArticleReadingProgress | undefined,
): EbookProgressRestoreTarget | null {
  if (!progress) return null;
  const chapterIndex = progress.chapterIndex;
  if (
    typeof chapterIndex === 'number' &&
    Number.isInteger(chapterIndex) &&
    typeof progress.chapterProgress === 'number'
  ) {
    return {
      kind: 'section-anchor',
      sectionIndex: Math.max(0, chapterIndex),
      anchor: clampNumber(progress.chapterProgress, 0, 1, 0),
    };
  }

  if (progress.pageCount > 0 && (progress.pageIndex > 0 || progress.progress > 0)) {
    return {
      kind: 'fraction',
      fraction: clampNumber(progress.pageIndex / progress.pageCount, 0, 1, progress.progress),
    };
  }

  if (progress.progress > 0) {
    return {
      kind: 'fraction',
      fraction: clampNumber(progress.progress, 0, 1, 0),
    };
  }

  return null;
}

export function useEbookFoliateView({
  article,
  readerSettings,
  onSaveArticleReadingProgress,
  onAttachFoliateDocumentListeners,
  onBeforePageTurn,
  onCleanupFoliateDocumentListeners,
  onScheduleEbookBoxUpdate,
  pageTurnTraceRef,
}: UseEbookFoliateViewInput) {
  const viewHostRef = useRef<HTMLDivElement | null>(null);
  const measureHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<FoliateViewElement | null>(null);
  const ebookFileRef = useRef<File | null>(null);
  const pageInfoSectionIndexRef = useRef<number | undefined>(undefined);
  const paginationLayoutKeyRef = useRef('');
  const readerSettingsRef = useRef<ReaderSettings>(readerSettings);
  const onSaveArticleReadingProgressRef = useRef(onSaveArticleReadingProgress);
  const onBeforePageTurnRef = useRef(onBeforePageTurn);
  const pageTurnQueueRef = useRef<PageTurnDirection[]>([]);
  const pageTurnRunningRef = useRef(false);
  const pageTurnSequenceRef = useRef(0);
  const [tocItems, setTocItems] = useState<ReturnType<typeof flattenFoliateToc>>([]);
  const [sectionFractions, setSectionFractions] = useState<number[]>([]);
  const [pageInfo, setPageInfo] = useState<FoliatePageInfo | null>(null);
  const [sectionPageCounts, setSectionPageCounts] = useState<Array<number | null>>([]);
  const [paginationLayoutKey, setPaginationLayoutKey] = useState('');
  const [progress, setProgress] = useState(() => article.readingProgress?.progress ?? 0);
  const [readerState, setReaderState] = useState<EbookReaderState>({
    status: 'loading',
    message: '正在打开 EPUB。',
  });
  const readerStateStatusRef = useRef<EbookReaderState['status']>(readerState.status);

  useEffect(() => {
    onSaveArticleReadingProgressRef.current = onSaveArticleReadingProgress;
  }, [onSaveArticleReadingProgress]);

  useEffect(() => {
    onBeforePageTurnRef.current = onBeforePageTurn;
  }, [onBeforePageTurn]);

  useLayoutEffect(() => {
    onCleanupFoliateDocumentListeners();
    pageTurnQueueRef.current = [];
    pageTurnRunningRef.current = false;
    pageTurnTraceRef.current = null;
    setTocItems([]);
    setSectionFractions([]);
    pageInfoSectionIndexRef.current = undefined;
    setPageInfo(null);
    setSectionPageCounts([]);
    paginationLayoutKeyRef.current = '';
    setPaginationLayoutKey('');
    setProgress(article.readingProgress?.progress ?? 0);
    readerStateStatusRef.current = 'loading';
    setReaderState({ status: 'loading', message: '正在打开 EPUB。' });
  }, [article.id, onCleanupFoliateDocumentListeners, pageTurnTraceRef]);

  const beginPageTurnTrace = useCallback(
    (source: EbookPageTurnTrace['source'], direction: EbookPageTurnTrace['direction']) => {
      const trace: EbookPageTurnTrace = {
        articleId: article.id,
        direction,
        source,
        startedAt: performance.now(),
        turnId: `${article.id}:${Date.now().toString(36)}:${++pageTurnSequenceRef.current}`,
      };
      pageTurnTraceRef.current = trace;
      recordEbookPageTurnTrace(trace, 'start', {
        pageInfo: viewRef.current?.getPageInfo?.() ?? null,
        queueLength: pageTurnQueueRef.current.length,
      });
      return trace;
    },
    [article.id, pageTurnTraceRef],
  );

  useEffect(() => {
    readerSettingsRef.current = readerSettings;
    configureFoliateView(viewRef.current, readerSettings);
    onScheduleEbookBoxUpdate('reader_settings');
  }, [onScheduleEbookBoxUpdate, readerSettings]);

  useEffect(() => {
    readerStateStatusRef.current = readerState.status;
  }, [readerState.status]);

  useEffect(() => {
    const host = viewHostRef.current;
    if (!host) return;
    const hostElement = host;

    let cancelled = false;
    let view: FoliateViewElement | null = null;

    const handleRelocate = (event: Event) => {
      const detail = (event as CustomEvent<FoliateRelocateDetail>).detail;
      const nextProgress = clampNumber(detail.fraction, 0, 1, 0);
      const nextPageInfo =
        (event.currentTarget as FoliateViewElement | null)?.getPageInfo?.() ?? null;
      const progressSnapshot = ebookReadingProgressSnapshot(detail, nextPageInfo, nextProgress);
      recordEbookPageTurnTrace(pageTurnTraceRef.current, 'relocate', {
        pageIndex: nextPageInfo?.pageIndex,
        pageCount: nextPageInfo?.pageCount,
        reason: detail.reason,
        sectionIndex: nextPageInfo?.sectionIndex,
      });

      setProgress(nextProgress);
      pageInfoSectionIndexRef.current = nextPageInfo?.sectionIndex;
      setPageInfo(nextPageInfo);
      if (nextPageInfo) {
        setSectionPageCounts((counts) => updateKnownSectionPageCount(counts, nextPageInfo));
      }
      onAttachFoliateDocumentListeners(event.currentTarget as FoliateViewElement);
      onScheduleEbookBoxUpdate('relocate');
      void onSaveArticleReadingProgressRef.current(article.id, {
        ...progressSnapshot,
        updatedAt: new Date().toISOString(),
      });
    };

    const handleExternalLink = (event: Event) => {
      const customEvent = event as CustomEvent<Record<string, string | undefined>>;
      const href = customEvent.detail['href_'] || customEvent.detail.href;
      if (!href) return;
      event.preventDefault();
      void window.yomitomoDesktop.openUrl(href);
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
      onBeforePageTurnRef.current(trace);
    };

    async function openEbook() {
      try {
        await import('./vendor/foliate-js/view.js');
        const data = await window.yomitomoDesktop.readEbookFile(article.id);
        if (cancelled) return;

        const file = new File([data], article.ebook.metadata.fileName || `${article.title}.epub`, {
          type: 'application/epub+zip',
        });
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
        configureFoliateView(view, readerSettingsRef.current);
        setTocItems(flattenFoliateToc(view.book?.toc ?? []));
        setSectionFractions(view.getSectionFractions?.() ?? []);
        readerStateStatusRef.current = 'ready';
        setReaderState({ status: 'ready', message: '' });

        if (!(await restoreEbookReadingProgress(view, article.readingProgress))) {
          await view.next();
        }
        onAttachFoliateDocumentListeners(view);
        onScheduleEbookBoxUpdate('open_ebook');
      } catch (error) {
        if (cancelled) return;
        readerStateStatusRef.current = 'error';
        setReaderState({
          status: 'error',
          message: error instanceof Error ? error.message : 'EPUB 打开失败',
        });
      }
    }

    void openEbook();

    return () => {
      cancelled = true;
      view?.removeEventListener('relocate', handleRelocate);
      view?.removeEventListener('external-link', handleExternalLink);
      view?.removeEventListener('load', handleLoad);
      view?.removeEventListener('page-turn-start', handlePageTurnStart);
      onCleanupFoliateDocumentListeners();
      closeFoliateView(view);
      view?.remove();
      if (viewRef.current === view) viewRef.current = null;
      if (viewRef.current === null) ebookFileRef.current = null;
      hostElement.replaceChildren();
    };
  }, [
    article.id,
    article.ebook.metadata.fileName,
    article.title,
    onAttachFoliateDocumentListeners,
    beginPageTurnTrace,
    onCleanupFoliateDocumentListeners,
    onScheduleEbookBoxUpdate,
    pageTurnTraceRef,
  ]);

  useLayoutEffect(() => {
    const host = viewHostRef.current;
    if (!host) return;

    const updateLayoutKey = (reason: EbookBoxUpdateReason) => {
      const rect = host.getBoundingClientRect();
      const nextLayoutKey = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      paginationLayoutKeyRef.current = nextLayoutKey;
      setPaginationLayoutKey(nextLayoutKey);
      onScheduleEbookBoxUpdate(reason);
    };

    updateLayoutKey('layout_measure');
    const observer = new ResizeObserver(() => updateLayoutKey('resize_observer'));
    observer.observe(host);
    return () => observer.disconnect();
  }, [article.id, onScheduleEbookBoxUpdate]);

  useEffect(() => {
    const measureHost = measureHostRef.current;
    const sourceFile = ebookFileRef.current;
    const visibleView = viewRef.current;
    const sections = visibleView?.book?.sections ?? [];
    const [layoutWidth, layoutHeight] = paginationLayoutKey.split('x').map(Number);
    if (
      readerState.status !== 'ready' ||
      !measureHost ||
      !sourceFile ||
      !visibleView ||
      sections.length === 0 ||
      !layoutWidth ||
      !layoutHeight
    ) {
      return;
    }
    const measureHostElement = measureHost;
    const sourceEbookFile = sourceFile;
    const visibleEbookView = visibleView;

    let cancelled = false;
    let measureView: FoliateViewElement | null = null;
    const counts: Array<number | null> = sections.map((section) =>
      section.linear === 'no' ? 0 : null,
    );
    const currentPageInfo = visibleEbookView.getPageInfo?.();
    pageInfoSectionIndexRef.current = currentPageInfo?.sectionIndex;
    setPageInfo(currentPageInfo ?? null);
    setSectionPageCounts(
      currentPageInfo ? updateKnownSectionPageCount(counts, currentPageInfo) : counts,
    );

    const timer = window.setTimeout(() => {
      void measureEbookPages();
    }, 360);

    async function measureEbookPages() {
      try {
        await waitForFoliateIdle();
        if (cancelled) return;

        await import('./vendor/foliate-js/view.js');
        measureView = document.createElement('foliate-view') as FoliateViewElement;
        measureView.className = 'ebook-foliate-view';
        measureHostElement.replaceChildren(measureView);
        await measureView.open(sourceEbookFile);
        configureFoliateView(measureView, readerSettingsRef.current);

        for (const [index, section] of sections.entries()) {
          if (cancelled) return;
          if (section.linear === 'no') continue;

          await waitForFoliateIdle();
          if (cancelled) return;

          await measureView.goTo(index);
          const nextPageInfo = await waitForFoliatePageInfo(measureView, index);
          if (cancelled) return;

          counts[index] = Math.max(1, nextPageInfo?.pageCount ?? 1);
        }

        if (!cancelled) setSectionPageCounts(counts);
      } catch (error) {
        console.warn(error);
      } finally {
        closeFoliateView(measureView);
        measureView?.remove();
        if (measureHostElement.firstChild === measureView) measureHostElement.replaceChildren();
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      closeFoliateView(measureView);
      measureView?.remove();
      if (measureHost.firstChild === measureView) measureHost.replaceChildren();
    };
  }, [
    article.id,
    paginationLayoutKey,
    readerSettings.contentWidth,
    readerSettings.fontSize,
    readerState.status,
  ]);

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
          onBeforePageTurnRef.current(trace);
          recordEbookPageTurnTrace(trace, 'view_go_start');
          if (direction === 'left') await view.goLeft();
          else await view.goRight();
          recordEbookPageTurnTrace(trace, 'view_go_done', {
            pageInfo: view.getPageInfo?.() ?? null,
          });
          onScheduleEbookBoxUpdate('page_turn');
        }
      } finally {
        pageTurnRunningRef.current = false;
      }
    })();
  }, [onScheduleEbookBoxUpdate]);

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
      setProgress(nextProgress);
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
    goLeft,
    goRight,
    goToProgress,
    goToTocItem,
  };
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
