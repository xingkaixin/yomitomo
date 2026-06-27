import i18next from 'i18next';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import { sanitizeArticleContentHtml } from '@yomitomo/core/article-extraction';
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
  grid-template-columns:var(--reader-toc-line-width) minmax(0,1fr);
  align-items:center;
  gap:8px;
  position:relative;
  width:100%;
  margin:0;
  border:0;
  border-radius:8px;
  background:transparent;
  color:var(--reader-muted);
  font-size:12px;
  font-weight:820;
  line-height:1.3;
  overflow:hidden;
  padding:9px 8px;
  transform:translateX(var(--reader-toc-shift,0px));
  transition:background .16s ease,color .16s ease,transform var(--reader-toc-dur) var(--reader-toc-ease,cubic-bezier(.22,1,.36,1));
  will-change:transform;
}
.reader-toc-item:hover,
.reader-toc-item.is-active{
  --reader-toc-line-scale:var(--reader-toc-line-active-scale);
  background:var(--app-reader-toc-item-hover-bg);
  color:var(--reader-ink);
}
.reader-toc-item.is-active{
  background:color-mix(in srgb,var(--reader-green) 10%,var(--app-reader-toc-item-hover-bg));
  box-shadow:none;
}
.reader-toc-line{
  display:block;
  width:var(--reader-toc-line-width);
  height:1px;
  border-radius:999px;
  background:color-mix(in srgb,var(--reader-ink) 22%,transparent);
  transform:scaleX(var(--reader-toc-line-scale,1));
  transform-origin:left center;
  transition:background .16s ease,transform var(--reader-toc-dur) var(--reader-toc-ease,cubic-bezier(.22,1,.36,1));
  will-change:transform;
}
.reader-toc-item:hover .reader-toc-line,
.reader-toc-item.is-active .reader-toc-line{
  background:var(--reader-green);
}
.source-reader-shell .reader-article.is-web-selection-gesture ::selection,
.source-reader-shell .reader-article.is-web-selection-gesture::selection{
  background:transparent;
}
.reader-toc-item-main{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
}
.reader-toc-label{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.reader-toc-count{
  display:grid;
  min-width:23px;
  height:23px;
  place-items:center;
  border:1px solid color-mix(in srgb,var(--reader-toc-count-color,var(--reader-green)) 42%,rgba(37,29,22,.14));
  border-radius:999px;
  background:color-mix(in srgb,var(--reader-toc-count-color,var(--reader-green)) 58%,var(--reader-paper));
  box-shadow:inset 0 1px 0 color-mix(in srgb,var(--reader-paper) 46%,transparent);
  color:var(--reader-ink);
  font-size:11px;
  font-weight:850;
  line-height:1;
  padding:0 6px;
}
.reader-toc-summary{
  margin-top:12px;
  border-radius:8px;
}
@media(prefers-reduced-motion:reduce){
  .reader-toc-item,
  .reader-toc-line{
    transform:none!important;
    transition:none!important;
    will-change:auto;
  }
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
  if (annotations.length === 0) return annotationNavigationForInsertionIndex(annotations, 0);
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
  const html =
    article.contentHtml ||
    `<p>${escapeHtml(article.excerpt || i18next.t('source.emptyContent'))}</p>`;
  return sanitizeArticleContentHtml(document, html, article.canonicalUrl || article.url);
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
  const next = positions.find((position) => position.top > viewportBottom);
  const insertionIndex = next?.index ?? annotations.length;
  return annotationNavigationForInsertionIndex(annotations, insertionIndex);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
