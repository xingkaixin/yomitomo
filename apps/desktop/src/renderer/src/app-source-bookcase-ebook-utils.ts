import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import {
  annotationNavigationForInsertionIndex,
  annotationNavigationForReferenceIndex,
} from '@yomitomo/reader-ui/reader-navigation';
import {
  ebookChapterForFoliateSection,
  type FoliatePageInfo,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import {
  annotationViewportPositions,
  navigationForActiveAnnotation,
} from './app-source-bookcase-shared';

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
  grid-template-rows:auto minmax(0,1fr) auto;
  gap:12px;
  height:100%;
  min-height:0;
  width:min(100%,var(--ebook-content-width));
  margin:0 auto;
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
  width:100%;
  min-height:0;
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
@container reader-surface (max-width:1220px) and (min-width:941px){
  .source-ebook-reader-shell .reader-app.has-toc .reader-surface{
    padding-left:28px;
    padding-right:28px;
  }
  .source-ebook-reader-shell .reader-canvas{
    width:100%;
    margin:0;
  }
  .source-ebook-reader-shell .reader-article{
    width:min(var(--reader-content-width),calc(100% - 300px));
    margin:0;
  }
  .source-ebook-reader-shell .ebook-reader-content{
    width:100%;
    margin:0;
  }
}
@media(max-width:1220px) and (min-width:941px){
  .source-ebook-reader-shell .reader-app.has-toc .reader-surface{
    padding-left:28px;
    padding-right:28px;
  }
  .source-ebook-reader-shell .reader-canvas{
    width:100%;
    margin:0;
  }
  .source-ebook-reader-shell .reader-article{
    width:min(var(--reader-content-width),calc(100% - 300px));
    margin:0;
  }
  .source-ebook-reader-shell .ebook-reader-content{
    width:100%;
    margin:0;
  }
}
`;

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
  if (annotations.length === 0) return { previousId: null, nextId: null };

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
  let previousId: string | null = null;
  let nextId: string | null = null;

  for (const annotation of annotations) {
    const start = annotationTextStart(annotation);
    const end = annotationTextEnd(annotation);
    if (end <= rangeStart) previousId = annotation.id;
    if (nextId === null && start >= rangeEnd) nextId = annotation.id;
  }

  return { previousId, nextId };
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
