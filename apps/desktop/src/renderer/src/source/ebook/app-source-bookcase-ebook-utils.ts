import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import {
  annotationNavigationForInsertionIndex,
  annotationNavigationForReferenceIndex,
} from '@yomitomo/reader-ui/reader-navigation';
import { annotationRailLayoutForWidth } from '@yomitomo/reader-ui/reader-shell-state';
import type { AnnotationRailLayout } from '@yomitomo/reader-ui/reader-annotations';
import {
  ebookChapterForFoliateSection,
  type FoliatePageInfo,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import {
  annotationViewportPositions,
  navigationForActiveAnnotation,
} from '../bookcase/app-source-bookcase-shared';

export type EbookClickPagingDirection = 'left' | 'right';

export const EBOOK_CLICK_PAGING_HOT_ZONE_MIN_WIDTH = 48;
export const EBOOK_CLICK_PAGING_HOT_ZONE_MAX_WIDTH = 120;
export const EBOOK_CLICK_PAGING_HOT_ZONE_RATIO = 0.12;

export const sourceEbookReaderStyles = `
.source-ebook-reader-shell{
  grid-template-rows:minmax(0,1fr);
  padding:0;
}
.source-ebook-reader-shell .reader-app.has-toc .reader-surface{
  padding:18px 14px 24px;
}
.source-ebook-reader-shell .reader-article{
  width:min(100%,var(--reader-content-width));
  max-width:100%;
  margin:0 auto;
  padding:0;
  border:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
}
.source-ebook-reader-shell .ebook-reader-content{
  display:grid;
  grid-template-rows:minmax(0,1fr);
  gap:0;
  height:100%;
  min-height:0;
  width:min(100%,var(--ebook-content-width));
  margin:0 auto;
}
.source-ebook-reader-shell .reader-floating-control-group.is-paginating{
  opacity:1;
  filter:none;
}
.source-ebook-reader-shell .reader-floating-value.is-paginating{
  position:relative;
  color:transparent;
  overflow:hidden;
}
.source-ebook-reader-shell .reader-floating-value.is-paginating::after{
  content:"";
  width:42px;
  height:10px;
  border-radius:999px;
  background:var(--reader-border);
  opacity:.7;
  filter:blur(3px);
}
.source-ebook-reader-shell .reader-canvas,
.source-ebook-reader-shell .reader-article{
  height:100%;
  min-height:0;
}
.source-ebook-reader-shell .reader-article{
  display:grid;
}
.source-ebook-reader-shell .ebook-page-control-row,
.source-ebook-reader-shell .ebook-reader-progress,
.source-ebook-reader-shell .ebook-foliate-frame,
.source-ebook-reader-shell .ebook-reader-status{
  width:100%;
}
.source-ebook-reader-shell .ebook-page-stage{
  position:relative;
  width:100%;
  min-height:0;
}
.source-ebook-reader-shell .ebook-click-paging-hints{
  position:absolute;
  inset:0;
  z-index:2;
  pointer-events:none;
}
.source-ebook-reader-shell .ebook-click-paging-hint{
  position:absolute;
  top:50%;
  display:grid;
  width:38px;
  height:54px;
  place-items:center;
  border:1px solid color-mix(in srgb,var(--reader-border) 72%,transparent);
  border-radius:8px;
  background:color-mix(in srgb,var(--reader-paper) 76%,transparent);
  box-shadow:var(--reader-soft-shadow);
  color:var(--reader-muted);
  opacity:0;
  transform:translateY(-50%) scale(.96);
  transition:opacity .14s ease,transform .14s ease,color .14s ease;
}
.source-ebook-reader-shell .ebook-click-paging-hint.is-left{
  left:10px;
}
.source-ebook-reader-shell .ebook-click-paging-hint.is-right{
  right:10px;
}
.source-ebook-reader-shell .reader-canvas[data-ebook-click-paging-hover="left"] .ebook-click-paging-hint.is-left,
.source-ebook-reader-shell .reader-canvas[data-ebook-click-paging-hover="right"] .ebook-click-paging-hint.is-right{
  color:var(--reader-ink);
  opacity:.72;
  transform:translateY(-50%) scale(1);
}
.source-ebook-reader-shell .reader-edge-blur.is-bottom{
  display:none;
}
.source-ebook-reader-shell .reader-canvas.is-ebook-page-turning .reader-highlight-layer,
.source-ebook-reader-shell .reader-canvas.is-ebook-page-turning .reader-annotation-rail{
  visibility:hidden;
  pointer-events:none;
}
.source-ebook-reader-shell .reader-highlight.is-active::after{
  opacity:.8;
}
.source-ebook-reader-shell .reader-highlight.is-active::before{
  opacity:.88;
  filter:drop-shadow(0 1px 0 var(--reader-paper)) drop-shadow(0 0 4px rgba(37,29,22,.14));
}
@media(min-width:1101px){
  .source-ebook-reader-shell .reader-app.has-toc .reader-canvas{
    margin:0 auto;
  }
}
@media(max-width:1320px){
  .source-ebook-reader-shell .reader-app.has-toc.is-toc-open .reader-canvas{
    margin:0 auto;
  }
}
.source-ebook-reader-shell .reader-app.is-annotation-right .reader-article{
  width:min(var(--reader-layout-article-width,var(--reader-content-width)),100%);
  margin:0;
}
.source-ebook-reader-shell .reader-app.is-annotation-right .ebook-reader-content{
  width:100%;
  margin:0;
}
@media(max-width:940px){
  .source-ebook-reader-shell .ebook-reader-content{
    width:100%;
    margin:0;
  }
}
.source-ebook-reader-shell.is-ebook-spread .reader-article{
  width:min(100%,calc(var(--reader-content-width) * 2));
}
`;

export function ebookClickPagingHotZoneWidth(stageWidth: number) {
  if (!Number.isFinite(stageWidth) || stageWidth <= 0) return 0;
  return Math.min(
    EBOOK_CLICK_PAGING_HOT_ZONE_MAX_WIDTH,
    Math.max(EBOOK_CLICK_PAGING_HOT_ZONE_MIN_WIDTH, stageWidth * EBOOK_CLICK_PAGING_HOT_ZONE_RATIO),
  );
}

export function ebookClickPagingDirectionAtClientX({
  clientX,
  rect,
}: {
  clientX: number;
  rect: Pick<DOMRect, 'left' | 'width'>;
}): EbookClickPagingDirection | null {
  const hotZoneWidth = ebookClickPagingHotZoneWidth(rect.width);
  if (!hotZoneWidth) return null;

  const localX = clientX - rect.left;
  if (localX < 0 || localX > rect.width) return null;
  if (localX <= hotZoneWidth) return 'left';
  if (localX >= rect.width - hotZoneWidth) return 'right';
  return null;
}

export function ebookAnnotationNavigationState({
  activeId,
  annotations,
  boxes,
  pageInfo,
  article,
  view,
}: {
  activeId: string | null;
  annotations: Annotation[];
  boxes: HighlightBox[];
  pageInfo: FoliatePageInfo | null;
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> };
  view: FoliateViewElement | null;
}) {
  if (annotations.length === 0) return annotationNavigationForInsertionIndex(annotations, 0);

  const pageAnnotationIds = new Set(boxes.map((box) => box.annotationId).filter(Boolean));
  if (activeId && pageAnnotationIds.has(activeId)) {
    const activeNavigation = navigationForActiveAnnotation(annotations, activeId);
    if (activeNavigation) return activeNavigation;
  }

  const positions = annotationViewportPositions(annotations, boxes, 0);
  const firstPageAnnotation = positions[0];
  if (firstPageAnnotation) {
    return annotationNavigationForReferenceIndex(annotations, firstPageAnnotation.index);
  }

  const pageRange = ebookPageTextRange(article, view, pageInfo);
  if (!pageRange) return annotationNavigationForInsertionIndex(annotations, 0);

  return annotationNavigationForTextRange(annotations, pageRange.start, pageRange.end);
}

function annotationNavigationForTextRange(
  annotations: Annotation[],
  rangeStart: number,
  rangeEnd: number,
) {
  let insertionIndex = annotations.length;

  for (let index = 0; index < annotations.length; index += 1) {
    const annotation = annotations[index];
    const start = annotationTextStart(annotation);
    const end = annotationTextEnd(annotation);
    if (end <= rangeStart) continue;
    if (start >= rangeEnd) insertionIndex = index;
    break;
  }

  return annotationNavigationForInsertionIndex(annotations, insertionIndex);
}

function annotationTextStart(annotation: Annotation) {
  return (
    finiteNumber(annotation.anchor.textStartInBook) ?? finiteNumber(annotation.anchor.start) ?? 0
  );
}

function annotationTextEnd(annotation: Annotation) {
  return (
    finiteNumber(annotation.anchor.textEndInBook) ??
    finiteNumber(annotation.anchor.end) ??
    annotationTextStart(annotation)
  );
}

function finiteNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ebookPageTextRange(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  view: FoliateViewElement | null,
  pageInfo: FoliatePageInfo | null,
) {
  if (!pageInfo) return null;
  const chapter = ebookChapterForFoliateSection(article, view, pageInfo.sectionIndex);
  if (!chapter) return null;

  const pageCount = Math.max(1, pageInfo.pageCount);
  const startRatio = Math.max(0, Math.min(1, pageInfo.pageIndex / pageCount));
  const endRatio = Math.max(startRatio, Math.min(1, (pageInfo.pageIndex + 1) / pageCount));
  return {
    start: chapter.textStart + Math.floor(chapter.textLength * startRatio),
    end: chapter.textStart + Math.ceil(chapter.textLength * endRatio),
  };
}

export type EbookSpreadLayout = {
  columns: 1 | 2;
  railLayout: AnnotationRailLayout;
};

const EBOOK_ANNOTATION_RAIL_STACK_OVERFLOW_RESERVE = 56;

export function ebookSpreadAvailableWidth({
  layoutWidth,
  paddingLeft = 0,
  paddingRight = 0,
}: {
  layoutWidth: number;
  paddingLeft?: number;
  paddingRight?: number;
}) {
  return Math.max(
    0,
    layoutWidth - paddingLeft - paddingRight - EBOOK_ANNOTATION_RAIL_STACK_OVERFLOW_RESERVE,
  );
}

export function ebookSpreadLayout({
  canvasWidth,
  contentWidth,
}: {
  canvasWidth: number;
  contentWidth: number;
}): EbookSpreadLayout {
  if (canvasWidth <= 0 || contentWidth <= 0) {
    return {
      columns: 1,
      railLayout: annotationRailLayoutForWidth({ canvasWidth, targetArticleWidth: contentWidth }),
    };
  }

  const singlePageLayout = annotationRailLayoutForWidth({
    canvasWidth,
    targetArticleWidth: contentWidth,
  });
  const spreadWidth = contentWidth * 2;
  const spreadLayout = annotationRailLayoutForWidth({
    canvasWidth,
    targetArticleWidth: spreadWidth,
  });

  const spreadFits = spreadLayout.mode !== 'stacked' && spreadLayout.articleWidth === spreadWidth;

  return spreadFits
    ? { columns: 2, railLayout: spreadLayout }
    : { columns: 1, railLayout: singlePageLayout };
}
