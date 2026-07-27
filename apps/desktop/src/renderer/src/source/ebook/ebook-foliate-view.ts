import { readerBilingualTranslationStyles } from '@yomitomo/reader-ui/reader-bilingual-translation-styles';
import { readerBackgroundTone, readerBodyLineHeight } from '@yomitomo/reader-ui/reader-settings';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import type { ReaderSettings } from '@yomitomo/reader-ui/reader-types';
import jetBrainsMonoBoldUrl from '../../assets/fonts/JetBrainsMono-Bold.woff2?url';
import jetBrainsMonoRegularUrl from '../../assets/fonts/JetBrainsMono-Regular.woff2?url';
import notoSerifScRegularUrl from '../../assets/fonts/NotoSerifSC-Regular.woff2?url';
import sourceSerif4BoldUrl from '../../assets/fonts/SourceSerif4-Bold.woff2?url';
import sourceSerif4ItalicUrl from '../../assets/fonts/SourceSerif4-Italic.woff2?url';
import sourceSerif4RegularUrl from '../../assets/fonts/SourceSerif4-Regular.woff2?url';
import { rendererPerformanceElapsedMs } from '../../shell/app-renderer-performance';

export type FoliateTocSourceItem = {
  label?: unknown;
  href?: string;
  subitems?: FoliateTocSourceItem[];
};

export type FoliateTocItem = {
  label: string;
  href: string;
  depth: number;
};

export type FoliateSectionSource = {
  id?: unknown;
  linear?: string;
  size?: unknown;
};

export type FoliatePageInfo = {
  sectionIndex: number;
  pageIndex: number;
  pageCount: number;
};

export type FoliateContent = {
  doc?: Document;
  index?: number;
};

export type FoliateRelocateDetail = {
  fraction?: number;
  reason?: string;
  location?: {
    current?: number;
    total?: number;
  };
  section?: {
    current?: number;
  };
  tocItem?: {
    label?: unknown;
    href?: string;
  };
};

export type FoliatePageInfoWaitTiming = {
  assetWaitMs: number;
  fontWaitMs: number;
  imageWaitMs: number;
  pendingImageCount: number;
  frameWaitMs: number;
  frameWaitCount: number;
  matched: boolean;
  matchedAfterAssets: boolean;
  synthesized: boolean;
  observedPageInfo: FoliatePageInfo | null;
  contentIndexes: number[];
  elapsedMs: number;
};

export type EbookPageTurnTrace = {
  turnId: string;
  startedAt: number;
  source: 'control' | 'foliate';
  direction: 'left' | 'right' | number;
  articleId: string;
};

export type FoliateViewElement = HTMLElement & {
  book?: {
    toc?: FoliateTocSourceItem[];
    dir?: string;
    sections?: FoliateSectionSource[];
  };
  renderer?:
    | (HTMLElement & {
        getContents?: () => FoliateContent[];
        goTo?: (target: { index: number; anchor?: number }) => Promise<void>;
        scrollToAnchor?: (anchor: Range | Element | number, select?: boolean) => Promise<void>;
        setStyles?: (styles: string | string[]) => void;
      })
    | null;
  close?: () => void;
  getPageInfo?: () => FoliatePageInfo | null;
  getSectionFractions?: () => number[];
  goLeft: () => Promise<void>;
  goRight: () => Promise<void>;
  goTo: (target: string | number) => Promise<unknown>;
  goToFraction: (fraction: number) => Promise<void>;
  next: () => Promise<void>;
  open: (file: File | Blob | string) => Promise<void>;
  prev: () => Promise<void>;
};

function emptyFoliatePageInfoWaitTiming(): FoliatePageInfoWaitTiming {
  return {
    assetWaitMs: 0,
    fontWaitMs: 0,
    imageWaitMs: 0,
    pendingImageCount: 0,
    frameWaitMs: 0,
    frameWaitCount: 0,
    matched: false,
    matchedAfterAssets: false,
    synthesized: false,
    observedPageInfo: null,
    contentIndexes: [],
    elapsedMs: 0,
  };
}

function observeFoliatePageInfo(view: FoliateViewElement) {
  return {
    contentIndexes:
      view.renderer
        ?.getContents?.()
        .map((content) => content.index)
        .filter((index): index is number => typeof index === 'number') ?? [],
    pageInfo: view.getPageInfo?.() ?? null,
  };
}

function assignFoliatePageInfoWaitTiming(
  target: FoliatePageInfoWaitTiming | undefined,
  source: FoliatePageInfoWaitTiming,
) {
  if (!target) return;
  Object.assign(target, source);
}

export function recordEbookPageTurnTrace(
  trace: EbookPageTurnTrace | null,
  phase: string,
  data: Record<string, unknown> = {},
) {
  if (!trace) return;
  void window.yomitomoDesktop?.recordPerformanceTiming?.({
    event: 'ebook_page_turn',
    data: {
      articleId: trace.articleId,
      direction: trace.direction,
      elapsedMs: rendererPerformanceElapsedMs(trace.startedAt),
      phase,
      source: trace.source,
      turnId: trace.turnId,
      ...data,
    },
  });
}

export function configureFoliateView(
  view: FoliateViewElement | null,
  settings: ReaderSettings,
  theme: ReaderTheme,
  maxColumnCount: number = 1,
) {
  if (!view?.renderer) return;
  view.renderer.removeAttribute('animated');
  view.renderer.setAttribute('flow', 'paginated');
  view.renderer.setAttribute('gap', '8%');
  view.renderer.setAttribute('margin', '44px');
  view.renderer.setAttribute('max-inline-size', `${settings.contentWidth}px`);
  view.renderer.setAttribute('max-block-size', '1200px');
  view.renderer.setAttribute('max-column-count', `${maxColumnCount}`);
  view.renderer.setStyles?.(foliateReaderCss(settings, theme));
}

export function closeFoliateView(view: FoliateViewElement | null) {
  try {
    view?.close?.();
  } catch (error) {
    console.warn(error);
  }
}

function foliateReaderCss(settings: ReaderSettings, theme: ReaderTheme) {
  const isDarkBackground = readerBackgroundTone(settings.backgroundColor) === 'dark';
  const colorScheme = isDarkBackground ? 'dark' : 'light';
  const linkUnderline = `color-mix(in srgb, ${theme.ink} 36%, transparent)`;

  return `
    @namespace epub "http://www.idpf.org/2007/ops";

    @font-face {
      font-family: "Source Serif 4";
      src: url("${sourceSerif4RegularUrl}") format("woff2");
      font-style: normal;
      font-weight: 400;
    }

    @font-face {
      font-family: "Source Serif 4";
      src: url("${sourceSerif4BoldUrl}") format("woff2");
      font-style: normal;
      font-weight: 700;
    }

    @font-face {
      font-family: "Source Serif 4";
      src: url("${sourceSerif4ItalicUrl}") format("woff2");
      font-style: italic;
      font-weight: 400;
    }

    @font-face {
      font-family: "Noto Serif SC";
      src: url("${notoSerifScRegularUrl}") format("woff2");
      font-style: normal;
      font-weight: 400;
    }

    @font-face {
      font-family: "JetBrains Mono";
      src: url("${jetBrainsMonoRegularUrl}") format("woff2");
      font-style: normal;
      font-weight: 400;
    }

    @font-face {
      font-family: "JetBrains Mono";
      src: url("${jetBrainsMonoBoldUrl}") format("woff2");
      font-style: normal;
      font-weight: 700;
    }

    html {
      --reader-ink: ${theme.ink};
      --reader-muted: ${theme.muted};
      --reader-green: ${theme.primary};
      --reader-red: ${theme.danger};
      background: ${settings.backgroundColor};
      color: ${theme.ink};
      color-scheme: ${colorScheme};
      font-size: ${settings.fontSize}px;
    }

    body {
      background: ${settings.backgroundColor};
      color: inherit;
      font-size: inherit;
      font-family: "Source Serif 4", "Noto Serif SC", "Songti SC", Georgia, serif;
      overflow-wrap: break-word;
    }

    ::selection {
      background: rgb(77 155 114 / 0.18);
    }

    p, li, blockquote, dd {
      line-height: ${readerBodyLineHeight};
      hanging-punctuation: allow-end last;
      widows: 2;
    }

    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    [align="justify"] { text-align: justify; }

    img, svg, video {
      max-width: 100%;
      height: auto;
    }

    pre {
      white-space: pre-wrap !important;
    }

    code, pre, kbd, samp {
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    a {
      color: inherit;
      text-decoration-color: ${linkUnderline};
      text-underline-offset: .16em;
    }

    figcaption, caption, small {
      color: ${theme.muted};
    }

    ${readerBilingualTranslationStyles}

    [data-reader-translation],
    .reader-bilingual-translation-indicator {
      user-select: none;
    }

    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
      display: none;
    }
  `;
}

export function updateKnownSectionPageCount(
  counts: Array<number | null>,
  pageInfo: FoliatePageInfo,
): Array<number | null> {
  if (counts.length <= pageInfo.sectionIndex) return counts;
  const pageCount = Math.max(1, pageInfo.pageCount);
  if (counts[pageInfo.sectionIndex] === pageCount) return counts;

  const nextCounts = [...counts];
  nextCounts[pageInfo.sectionIndex] = pageCount;
  return nextCounts;
}

export function isEbookPaginationReady(
  pageInfo: FoliatePageInfo | null,
  counts: Array<number | null>,
): pageInfo is FoliatePageInfo {
  return isEbookPageNavigationReady(pageInfo) && hasCompleteEbookPageCounts(counts);
}

export function isEbookPageNavigationReady(
  pageInfo: FoliatePageInfo | null,
): pageInfo is FoliatePageInfo {
  return Boolean(pageInfo && pageInfo.pageCount > 0);
}

export function formatEbookPageLabel(pageInfo: FoliatePageInfo, counts: Array<number | null>) {
  if (!hasCompleteEbookPageCounts(counts)) return '';

  const currentSectionPageCount =
    counts.length > pageInfo.sectionIndex ? counts[pageInfo.sectionIndex] : null;
  const currentPageCount = Math.max(1, currentSectionPageCount ?? pageInfo.pageCount);

  const precedingCounts = counts.slice(0, pageInfo.sectionIndex);
  const currentPage =
    sumKnownPageCounts(precedingCounts) +
    Math.min(pageInfo.pageIndex, Math.max(0, currentPageCount - 1)) +
    1;

  return `${currentPage} / ${sumKnownPageCounts(counts)}`;
}

function hasCompleteEbookPageCounts(counts: Array<number | null>) {
  return counts.length > 0 && counts.every((count) => count !== null);
}

function sumKnownPageCounts(counts: Array<number | null>) {
  return counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
}

export function waitForFoliateIdle() {
  return new Promise<void>((resolve) => {
    const idleWindow = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      };
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(() => resolve(), { timeout: 250 });
      return;
    }

    window.setTimeout(resolve, 16);
  });
}

export function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function waitForTimeout(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function waitForFoliatePageInfo(
  view: FoliateViewElement,
  sectionIndex?: number,
  timing?: FoliatePageInfoWaitTiming,
) {
  const startedAt = performance.now();
  const waitTiming = emptyFoliatePageInfoWaitTiming();
  const assetTiming = await waitForFoliateAssets(view);
  waitTiming.assetWaitMs = assetTiming.elapsedMs;
  waitTiming.fontWaitMs = assetTiming.fontWaitMs;
  waitTiming.imageWaitMs = assetTiming.imageWaitMs;
  waitTiming.pendingImageCount = assetTiming.pendingImageCount;

  let { contentIndexes, pageInfo } = observeFoliatePageInfo(view);
  waitTiming.observedPageInfo = pageInfo;
  waitTiming.contentIndexes = contentIndexes;
  if (foliatePageInfoMatchesSection(pageInfo, sectionIndex)) {
    waitTiming.matched = true;
    waitTiming.matchedAfterAssets = true;
    waitTiming.elapsedMs = rendererPerformanceElapsedMs(startedAt);
    assignFoliatePageInfoWaitTiming(timing, waitTiming);
    return pageInfo;
  }
  if (foliateContentMatchesSection(contentIndexes, sectionIndex)) {
    const synthesizedPageInfo = { sectionIndex, pageIndex: 0, pageCount: 1 };
    waitTiming.matched = true;
    waitTiming.matchedAfterAssets = true;
    waitTiming.synthesized = true;
    waitTiming.observedPageInfo = synthesizedPageInfo;
    waitTiming.elapsedMs = rendererPerformanceElapsedMs(startedAt);
    assignFoliatePageInfoWaitTiming(timing, waitTiming);
    return synthesizedPageInfo;
  }

  const frameStartedAt = performance.now();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await waitForAnimationFrame();
    waitTiming.frameWaitCount += 1;
    ({ contentIndexes, pageInfo } = observeFoliatePageInfo(view));
    waitTiming.observedPageInfo = pageInfo;
    waitTiming.contentIndexes = contentIndexes;
    if (foliatePageInfoMatchesSection(pageInfo, sectionIndex)) {
      waitTiming.matched = true;
      waitTiming.frameWaitMs = rendererPerformanceElapsedMs(frameStartedAt);
      waitTiming.elapsedMs = rendererPerformanceElapsedMs(startedAt);
      assignFoliatePageInfoWaitTiming(timing, waitTiming);
      return pageInfo;
    }
    if (foliateContentMatchesSection(contentIndexes, sectionIndex)) {
      const synthesizedPageInfo = { sectionIndex, pageIndex: 0, pageCount: 1 };
      waitTiming.matched = true;
      waitTiming.synthesized = true;
      waitTiming.observedPageInfo = synthesizedPageInfo;
      waitTiming.frameWaitMs = rendererPerformanceElapsedMs(frameStartedAt);
      waitTiming.elapsedMs = rendererPerformanceElapsedMs(startedAt);
      assignFoliatePageInfoWaitTiming(timing, waitTiming);
      return synthesizedPageInfo;
    }
  }
  waitTiming.frameWaitMs = rendererPerformanceElapsedMs(frameStartedAt);
  waitTiming.elapsedMs = rendererPerformanceElapsedMs(startedAt);
  waitTiming.matched = sectionIndex === undefined || pageInfo?.sectionIndex === sectionIndex;
  assignFoliatePageInfoWaitTiming(timing, waitTiming);
  return sectionIndex === undefined || pageInfo?.sectionIndex === sectionIndex ? pageInfo : null;
}

function foliateContentMatchesSection(
  contentIndexes: number[],
  sectionIndex: number | undefined,
): sectionIndex is number {
  return typeof sectionIndex === 'number' && contentIndexes.includes(sectionIndex);
}

function foliatePageInfoMatchesSection(
  pageInfo: FoliatePageInfo | null,
  sectionIndex: number | undefined,
) {
  return Boolean(
    pageInfo && (sectionIndex === undefined || pageInfo.sectionIndex === sectionIndex),
  );
}

async function waitForFoliateAssets(view: FoliateViewElement) {
  const startedAt = performance.now();
  const timing = {
    elapsedMs: 0,
    fontWaitMs: 0,
    imageWaitMs: 0,
    pendingImageCount: 0,
  };
  const finish = () => {
    timing.elapsedMs = rendererPerformanceElapsedMs(startedAt);
    return timing;
  };
  const doc = view.renderer?.getContents?.()[0]?.doc;
  if (!doc) return finish();

  const fontStartedAt = performance.now();
  await Promise.race([doc.fonts.ready.then(() => undefined), waitForTimeout(800)]).catch(() => {
    return undefined;
  });
  timing.fontWaitMs = rendererPerformanceElapsedMs(fontStartedAt);

  const pendingImages = Array.from(doc.images).filter((image) => !image.complete);
  timing.pendingImageCount = pendingImages.length;
  if (pendingImages.length === 0) return finish();

  const imageStartedAt = performance.now();
  await Promise.race([
    Promise.allSettled(pendingImages.map(waitForImage)).then(() => undefined),
    waitForTimeout(800),
  ]);
  timing.imageWaitMs = rendererPerformanceElapsedMs(imageStartedAt);
  return finish();
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete) return Promise.resolve();
  return image.decode().catch(() => undefined);
}

export function flattenFoliateToc(items: FoliateTocSourceItem[], depth = 1): FoliateTocItem[] {
  return items.flatMap((item) => {
    const label = foliateLabelText(item.label);
    const current =
      item.href && label
        ? [
            {
              label,
              href: item.href,
              depth,
            },
          ]
        : [];
    return [...current, ...flattenFoliateToc(item.subitems ?? [], depth + 1)];
  });
}

function foliateLabelText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const first = Object.values(value as Record<string, unknown>)[0];
  return typeof first === 'string' ? first : '';
}

export function currentFoliateContent(view: FoliateViewElement | null) {
  return view?.renderer?.getContents?.()[0] || null;
}

export function currentFoliateContents(view: FoliateViewElement | null) {
  return view?.renderer?.getContents?.().filter((content) => content.doc) ?? [];
}
