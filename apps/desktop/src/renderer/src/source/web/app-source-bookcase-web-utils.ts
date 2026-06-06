import i18next from 'i18next';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import {
  annotationNavigationForInsertionIndex,
  annotationNavigationForReferenceIndex,
} from '@yomitomo/reader-ui/reader-navigation';
import {
  annotationViewportPositions,
  navigationForActiveAnnotation,
} from '../bookcase/app-source-bookcase-shared';

export const sourceReaderTocStyles = `
@media(min-width:1101px){
  .source-reader-shell .reader-app.has-toc .reader-surface{
    padding:18px 14px 64px;
  }
  .source-reader-shell .reader-app.has-toc .reader-canvas{
    margin:0 auto;
  }
}
.reader-app.has-toc.is-toc-open .reader-toc{
  padding:14px;
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:8px;
  background:var(--app-reader-toc-bg);
}
.reader-toc-title{
  margin:0 0 10px;
  color:var(--reader-muted);
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
  color:var(--reader-muted);
  font-size:12px;
  font-weight:820;
  line-height:1.3;
  padding:9px 8px;
}
.reader-toc-item:hover{
  background:var(--app-reader-toc-item-hover-bg);
  color:var(--reader-ink);
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
@media(max-width:760px){
  .reader-app.has-toc.is-toc-open .reader-toc{
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
    article.contentHtml ||
    `<p>${escapeHtml(article.excerpt || i18next.t('source.emptyContent'))}</p>`;
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

export function articleLinkExternalUrl(article: ArticleRecord, href: string | null) {
  const rawHref = href?.trim();
  if (!rawHref || rawHref.startsWith('#')) return '';

  const directUrl = httpUrl(rawHref);
  if (directUrl) return directUrl;

  const baseUrl = httpUrl(article.canonicalUrl) || httpUrl(article.url);
  if (!baseUrl) return '';

  return httpUrl(rawHref, baseUrl);
}

function httpUrl(value: string, base?: string) {
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
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
