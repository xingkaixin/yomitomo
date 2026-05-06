import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import { hashText } from '@yomitomo/shared';

export type ExtractedArticle = {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  byline?: string;
  excerpt?: string;
  siteName?: string;
  siteIconUrl?: string;
  leadImageUrl?: string;
  themeColor?: string;
  content: string;
  contentHash: string;
};

export type ArticlePreview = {
  title: string;
  domain: string;
  wordCount: number;
  readingMinutes: number;
};

export async function extractCurrentArticle(): Promise<ExtractedArticle> {
  const canonicalUrl = getCanonicalUrl();
  const defuddleArticle = await extractWithDefuddle(canonicalUrl);
  if (defuddleArticle) return defuddleArticle;
  const metadata = extractArticleMetadata(canonicalUrl);

  const wechatContent =
    location.hostname === 'mp.weixin.qq.com' ? document.getElementById('js_content') : null;

  if (wechatContent) {
    const title = document.querySelector('h1')?.textContent?.trim() || document.title || 'Untitled';
    const content = sanitizeArticleHtml(wechatContent.innerHTML, canonicalUrl);
    const contentHash = articleContentHash(content);
    return {
      id: hashText(canonicalUrl || contentHash),
      url: location.href,
      canonicalUrl,
      title,
      ...metadata,
      content,
      contentHash,
    };
  }

  const cloned = document.cloneNode(true) as Document;
  const parsed = new Readability(cloned).parse();
  const fallbackTitle =
    document.querySelector('h1')?.textContent?.trim() || document.title || 'Untitled';
  const rawContent =
    parsed?.content || document.querySelector('article')?.innerHTML || document.body.innerHTML;
  const content = sanitizeArticleHtml(rawContent, canonicalUrl);
  const contentHash = articleContentHash(content);

  return {
    id: hashText(canonicalUrl || contentHash),
    url: location.href,
    canonicalUrl,
    title: parsed?.title || fallbackTitle,
    byline: parsed?.byline || undefined,
    excerpt: parsed?.excerpt || undefined,
    ...metadata,
    content,
    contentHash,
  };
}

export function fallbackCurrentArticle(): ExtractedArticle {
  const canonicalUrl = getCanonicalUrl();
  const metadata = extractArticleMetadata(canonicalUrl);
  const rawContent = document.querySelector('article')?.innerHTML || document.body?.innerHTML || '';
  const content = sanitizeArticleHtml(
    rawContent || '<p>当前页面没有可读取内容。</p>',
    canonicalUrl,
  );
  const contentHash = articleContentHash(content);

  return {
    id: hashText(canonicalUrl || contentHash),
    url: location.href,
    canonicalUrl,
    title: document.querySelector('h1')?.textContent?.trim() || document.title || 'Untitled',
    ...metadata,
    content,
    contentHash,
  };
}

export function articlePreviewFromExtractedArticle(article: ExtractedArticle): ArticlePreview {
  const wordCount = countReadableWords(textFromHtml(article.content));
  return {
    title: article.title,
    domain: domainFromUrl(article.canonicalUrl || article.url),
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 250)),
  };
}

async function extractWithDefuddle(canonicalUrl: string): Promise<ExtractedArticle | null> {
  try {
    const { default: Defuddle } = (await import('defuddle')) as { default: any };
    const cloned = document.cloneNode(true) as Document;
    const result = await new Defuddle(cloned, { url: location.href }).parseAsync();
    if (!result?.content) return null;

    const content = sanitizeArticleHtml(result.content, canonicalUrl);
    const contentHash = articleContentHash(content);
    const metadata = extractArticleMetadata(canonicalUrl, {
      siteName: result.site,
      siteIconUrl: result.favicon,
    });
    return {
      id: hashText(canonicalUrl || contentHash),
      url: location.href,
      canonicalUrl,
      title:
        result.title ||
        document.querySelector('h1')?.textContent?.trim() ||
        document.title ||
        'Untitled',
      byline: result.author || result.site || undefined,
      excerpt: result.description || undefined,
      ...metadata,
      content,
      contentHash,
    };
  } catch {
    return null;
  }
}

function getCanonicalUrl() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  return link?.href || location.href.split('#')[0];
}

function extractArticleMetadata(
  baseUrl: string,
  fallback: { siteName?: string; siteIconUrl?: string } = {},
): Pick<ExtractedArticle, 'siteName' | 'siteIconUrl' | 'leadImageUrl' | 'themeColor'> {
  return {
    siteName:
      nonEmptyMetaProperty('og:site_name') ||
      cleanString(fallback.siteName) ||
      domainFromUrl(baseUrl),
    siteIconUrl: resolveHttpUrl(fallback.siteIconUrl, baseUrl) || getSiteIconUrl(baseUrl),
    leadImageUrl: getOpenGraphImageUrl(baseUrl),
    themeColor: normalizeThemeColor(nonEmptyMetaName('theme-color')),
  };
}

function getOpenGraphImageUrl(baseUrl: string) {
  return resolveHttpUrl(
    nonEmptyMetaProperty('og:image:secure_url') ||
      nonEmptyMetaProperty('og:image:url') ||
      nonEmptyMetaProperty('og:image'),
    baseUrl,
  );
}

function getSiteIconUrl(baseUrl: string) {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel]')).filter(
    (link) => {
      const rel = link.rel.toLowerCase();
      return (
        link.getAttribute('href') && (rel.includes('icon') || rel.includes('apple-touch-icon'))
      );
    },
  );
  const preferred =
    links.find((link) => link.rel.toLowerCase().includes('apple-touch-icon')) ||
    links.find((link) => link.rel.toLowerCase() === 'icon') ||
    links[0];
  return resolveHttpUrl(preferred?.getAttribute('href'), baseUrl);
}

function nonEmptyMetaProperty(property: string) {
  return cleanString(
    document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)?.content,
  );
}

function nonEmptyMetaName(name: string) {
  return cleanString(document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content);
}

function cleanString(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function resolveHttpUrl(value: unknown, baseUrl = location.href) {
  const raw = cleanString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw, baseUrl || location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function normalizeThemeColor(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return undefined;
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return undefined;
  return raw.toLowerCase();
}

function sanitizeArticleHtml(html: string, baseUrl = location.href) {
  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: [
      'math',
      'mrow',
      'mi',
      'mo',
      'mn',
      'msup',
      'msub',
      'msqrt',
      'semantics',
      'annotation',
    ],
    ADD_ATTR: ['display', 'xmlns', 'encoding'],
  });
  return normalizeReaderHtml(sanitized, baseUrl);
}

function normalizeReaderHtml(html: string, baseUrl: string) {
  const container = document.createElement('div');
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
  return container.innerHTML;
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
  const raw = cleanString(value);
  if (!raw) return undefined;
  if (raw.startsWith('data:image/')) return raw;
  return resolveHttpUrl(raw, baseUrl);
}

function articleContentHash(html: string) {
  return hashText(textFromHtml(html).slice(0, 8000));
}

function textFromHtml(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.textContent || '';
}

function countReadableWords(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const cjkCount = normalized.match(/[\u3400-\u9fff]/g)?.length || 0;
  const latinCount =
    normalized.replace(/[\u3400-\u9fff]/g, ' ').match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/gi)?.length || 0;
  return cjkCount + latinCount;
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
