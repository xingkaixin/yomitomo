import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import {
  annotationNavigationForInsertionIndex,
  annotationNavigationForReferenceIndex,
} from '@yomitomo/reader-ui';
import {
  annotationViewportPositions,
  navigationForActiveAnnotation,
} from './app-source-bookcase-shared';

export const sourceReaderTocStyles = `
@media(min-width:1321px){
  .source-reader-shell .reader-app.has-toc.is-toc-open .reader-main{
    grid-template-columns:minmax(180px,260px) minmax(0,1fr);
  }
  .source-reader-shell .reader-app.has-toc .reader-surface{
    padding:18px 14px 64px;
  }
  .source-reader-shell .reader-app.has-toc.is-toc-open .reader-canvas{
    margin:0 auto;
  }
}
.reader-app.has-toc.is-toc-open .reader-toc{
  margin:18px 0 18px 18px;
  padding:14px;
  border:1px solid rgba(150,123,84,.28);
  border-radius:8px;
  background:rgba(255,253,248,.72);
}
.reader-toc-title{
  margin:0 0 10px;
  color:#746d63;
  font-size:11px;
  font-weight:900;
  letter-spacing:.12em;
  text-transform:none;
}
.reader-toc-item{
  display:grid;
  width:100%;
  margin:0;
  border:0;
  border-radius:8px;
  background:transparent;
  color:#746d63;
  font-size:12px;
  font-weight:820;
  line-height:1.3;
  padding:9px 8px;
}
.reader-toc-item:hover{
  background:rgba(245,239,226,.9);
  color:#28231d;
}
.reader-toc-item-main{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
}
.reader-toc-item-main>span:first-child{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.reader-toc-summary{
  margin-top:12px;
  border-radius:8px;
}
@media(max-width:1320px){
  .reader-app.has-toc.is-toc-open .reader-toc{
    margin:0;
    border-radius:0;
  }
}
`;

export function webAnnotationNavigationState({
  activeId,
  annotations,
  boxes,
  canvasElement,
  scrollElement,
}: {
  activeId: string | null;
  annotations: Annotation[];
  boxes: HighlightBox[];
  canvasElement: HTMLElement | null;
  scrollElement: HTMLElement | null;
}) {
  const activeNavigation = navigationForActiveAnnotation(annotations, activeId);
  if (activeNavigation) return activeNavigation;
  if (annotations.length === 0) return { previousId: null, nextId: null };
  if (!canvasElement || !scrollElement)
    return annotationNavigationForInsertionIndex(annotations, 0);

  const positions = annotationViewportPositions(annotations, boxes, canvasElement.offsetTop);
  if (positions.length === 0) return annotationNavigationForInsertionIndex(annotations, 0);

  const viewportTop = scrollElement.scrollTop;
  const viewportBottom = viewportTop + scrollElement.clientHeight;
  const visible = positions
    .filter((position) => position.bottom >= viewportTop && position.top <= viewportBottom)
    .toSorted((left, right) => left.top - right.top || left.index - right.index)[0];

  if (visible) return annotationNavigationForReferenceIndex(annotations, visible.index);

  return annotationNavigationForViewportRange(annotations, positions, viewportTop, viewportBottom);
}

export function sourceArticleBodyHtml(article: ArticleRecord) {
  const container = document.createElement('div');
  container.innerHTML =
    article.contentHtml || `<p>${escapeHtml(article.excerpt || '暂无原文内容')}</p>`;
  container.querySelectorAll('script, style, link, iframe, object, embed').forEach((element) => {
    element.remove();
  });
  container.querySelectorAll<HTMLElement>('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trimStart().slice(0, 32).toLowerCase();
      if (
        name.startsWith('on') ||
        ((name === 'href' || name === 'src') && value.startsWith('javascript:'))
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return container.innerHTML;
}

function annotationNavigationForViewportRange(
  annotations: Annotation[],
  positions: Array<{ index: number; top: number; bottom: number }>,
  viewportTop: number,
  viewportBottom: number,
) {
  const previous = positions.findLast((position) => position.bottom < viewportTop);
  const next = positions.find((position) => position.top > viewportBottom);

  return {
    previousId: previous ? (annotations[previous.index]?.id ?? null) : null,
    nextId: next ? (annotations[next.index]?.id ?? null) : null,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
