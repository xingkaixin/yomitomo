import DOMPurify from 'dompurify';
import type { Config } from 'dompurify';
import { resolveHttpUrl } from './article-url';

export const readerHtmlPurifyConfig = {
  ADD_TAGS: ['math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'msqrt', 'semantics', 'annotation'],
  ADD_ATTR: ['display', 'xmlns', 'encoding'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?):|data:image\/|(?:[^:/?#]+(?:[/?#]|$))|[/?#])/i,
} satisfies Config;

export function sanitizeArticleContentHtml(
  articleDocument: Document,
  html: string,
  baseUrl: string,
) {
  return sanitizeArticleContent(articleDocument, html, baseUrl).html;
}

export function sanitizeArticleContent(articleDocument: Document, html: string, baseUrl: string) {
  const purifyWindow = articleDocument.defaultView;
  const purifier = purifyWindow ? DOMPurify(purifyWindow) : DOMPurify;
  const sanitized = purifier.sanitize(html, readerHtmlPurifyConfig);
  const container = normalizeReaderContent(articleDocument, sanitized, baseUrl);
  return {
    html: container.innerHTML,
    container,
  };
}

function normalizeReaderContent(articleDocument: Document, html: string, baseUrl: string) {
  const container = articleDocument.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('script, style, link').forEach((element) => element.remove());
  container.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.removeAttribute('style');
    element.removeAttribute('width');
    element.removeAttribute('height');
    normalizeReaderElementUrls(element, baseUrl);
    if (element.tagName.includes('-')) {
      element.replaceWith(...Array.from(element.childNodes));
    }
  });
  return container;
}

function normalizeReaderElementUrls(element: HTMLElement, baseUrl: string) {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'img') {
    normalizeUrlAttribute(element, 'src', baseUrl);
    normalizeUrlAttribute(element, 'data-src', baseUrl);
    normalizeUrlAttribute(element, 'data-original', baseUrl);
    normalizeUrlAttribute(element, 'data-lazy-src', baseUrl);
    normalizeUrlAttribute(element, 'data-actualsrc', baseUrl);
    normalizeSrcsetAttribute(element, 'srcset', baseUrl);
    normalizeSrcsetAttribute(element, 'data-srcset', baseUrl);
  }
  if (tagName === 'source') {
    normalizeSrcsetAttribute(element, 'srcset', baseUrl);
  }
}

function normalizeUrlAttribute(element: HTMLElement, attribute: string, baseUrl: string) {
  const resolved = resolveImageUrl(element.getAttribute(attribute), baseUrl);
  if (resolved) element.setAttribute(attribute, resolved);
}

function normalizeSrcsetAttribute(element: HTMLElement, attribute: string, baseUrl: string) {
  const value = element.getAttribute(attribute);
  if (!value) return;
  if (value.trim().startsWith('data:image/')) return;

  const normalized = value
    .split(',')
    .map((candidate) => {
      const parts = candidate.trim().split(/\s+/).filter(Boolean);
      const resolved = resolveHttpUrl(parts[0], baseUrl);
      return resolved ? [resolved, ...parts.slice(1)].join(' ') : '';
    })
    .filter(Boolean)
    .join(', ');

  if (normalized) element.setAttribute(attribute, normalized);
  else element.removeAttribute(attribute);
}

function resolveImageUrl(value: unknown, baseUrl: string) {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  if (raw.startsWith('data:image/')) return raw;
  return resolveHttpUrl(raw, baseUrl);
}
