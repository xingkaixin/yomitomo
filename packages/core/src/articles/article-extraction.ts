import { Readability } from '@mozilla/readability';
import type { ArticleRecord } from '@yomitomo/shared';
import { hashText } from '@yomitomo/shared';
import { sanitizeArticleContentHtml } from './article-content-html';
import { resolveHttpUrl } from './article-url';

export type ExtractedArticle = {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  byline?: string;
  excerpt?: string;
  publishedAt?: string;
  siteName?: string;
  siteIconUrl?: string;
  leadImageUrl?: string;
  themeColor?: string;
  content: string;
  contentHash: string;
};

export type ArticlePreview = {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  domain: string;
  wordCount: number;
  readingMinutes: number;
  readerActive: boolean;
};

export async function extractCurrentArticle(): Promise<ExtractedArticle> {
  return extractArticleFromDocument(document, location.href);
}

export async function extractArticleFromDocument(
  articleDocument: Document,
  pageUrl = documentPageUrl(articleDocument),
): Promise<ExtractedArticle> {
  const canonicalUrl = getCanonicalUrl(articleDocument, pageUrl);
  const defuddleArticle = await extractWithDefuddle(articleDocument, canonicalUrl, pageUrl);
  if (defuddleArticle) return defuddleArticle;
  const metadata = extractArticleMetadata(articleDocument, canonicalUrl);

  const wechatContent =
    hostnameFromUrl(pageUrl) === 'mp.weixin.qq.com'
      ? articleDocument.getElementById('js_content')
      : null;

  if (wechatContent) {
    const title =
      articleDocument.querySelector('h1')?.textContent?.trim() ||
      articleDocument.title ||
      'Untitled';
    const content = sanitizeArticleContentHtml(
      articleDocument,
      wechatContent.innerHTML,
      canonicalUrl,
    );
    const contentHash = articleContentHash(articleDocument, content);
    return {
      id: hashText(canonicalUrl || contentHash),
      url: pageUrl,
      canonicalUrl,
      title,
      byline: extractAuthor(articleDocument),
      ...metadata,
      content,
      contentHash,
    };
  }

  const cloned = cloneArticleDocument(articleDocument);
  const parsed = new Readability(cloned).parse();
  const fallbackTitle =
    articleDocument.querySelector('h1')?.textContent?.trim() || articleDocument.title || 'Untitled';
  const rawContent =
    parsed?.content ||
    articleDocument.querySelector('article')?.innerHTML ||
    articleDocument.body.innerHTML;
  const content = sanitizeArticleContentHtml(articleDocument, rawContent, canonicalUrl);
  const contentHash = articleContentHash(articleDocument, content);

  return {
    id: hashText(canonicalUrl || contentHash),
    url: pageUrl,
    canonicalUrl,
    title: parsed?.title || fallbackTitle,
    byline: parsed?.byline || extractAuthor(articleDocument),
    excerpt: parsed?.excerpt || undefined,
    ...metadata,
    content,
    contentHash,
  };
}

export function fallbackCurrentArticle(): ExtractedArticle {
  return fallbackArticleFromDocument(document, location.href);
}

export function fallbackArticleFromDocument(
  articleDocument: Document,
  pageUrl = documentPageUrl(articleDocument),
): ExtractedArticle {
  const canonicalUrl = getCanonicalUrl(articleDocument, pageUrl);
  const metadata = extractArticleMetadata(articleDocument, canonicalUrl);
  const rawContent =
    articleDocument.querySelector('article')?.innerHTML || articleDocument.body?.innerHTML || '';
  const content = sanitizeArticleContentHtml(
    articleDocument,
    rawContent || '<p>当前页面没有可读取内容。</p>',
    canonicalUrl,
  );
  const contentHash = articleContentHash(articleDocument, content);

  return {
    id: hashText(canonicalUrl || contentHash),
    url: pageUrl,
    canonicalUrl,
    title:
      articleDocument.querySelector('h1')?.textContent?.trim() ||
      articleDocument.title ||
      'Untitled',
    byline: extractAuthor(articleDocument),
    ...metadata,
    content,
    contentHash,
  };
}

export function articlePreviewFromExtractedArticle(
  article: ExtractedArticle,
  articleDocument = document,
): ArticlePreview {
  const wordCount = countReadableWords(textFromHtml(articleDocument, article.content));
  return {
    id: article.id,
    url: article.url,
    canonicalUrl: article.canonicalUrl,
    title: article.title,
    domain: domainFromUrl(article.canonicalUrl || article.url),
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 250)),
    readerActive: false,
  };
}

export function articleRecordFromExtractedArticle(
  article: ExtractedArticle,
  timestamp = new Date().toISOString(),
): ArticleRecord {
  return {
    id: article.id,
    url: article.url,
    canonicalUrl: article.canonicalUrl,
    sourceType: 'web',
    title: article.title,
    byline: article.byline,
    excerpt: article.excerpt,
    siteName: article.siteName,
    siteIconUrl: article.siteIconUrl,
    leadImageUrl: article.leadImageUrl,
    themeColor: article.themeColor,
    contentHtml: article.content,
    contentHash: article.contentHash,
    annotations: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function extractWithDefuddle(
  articleDocument: Document,
  canonicalUrl: string,
  pageUrl: string,
): Promise<ExtractedArticle | null> {
  try {
    const { default: Defuddle } = (await import('defuddle')) as { default: any };
    const cloned = cloneArticleDocument(articleDocument);
    const result = await new Defuddle(cloned, { url: pageUrl }).parseAsync();
    if (!result?.content) return null;

    const content = sanitizeArticleContentHtml(articleDocument, result.content, canonicalUrl);
    const contentHash = articleContentHash(articleDocument, content);
    const metadata = extractArticleMetadata(articleDocument, canonicalUrl, {
      siteName: result.site,
      siteIconUrl: result.favicon,
    });
    return {
      id: hashText(canonicalUrl || contentHash),
      url: pageUrl,
      canonicalUrl,
      title:
        result.title ||
        articleDocument.querySelector('h1')?.textContent?.trim() ||
        articleDocument.title ||
        'Untitled',
      byline: result.author || extractAuthor(articleDocument) || result.site || undefined,
      excerpt: result.description || undefined,
      ...metadata,
      publishedAt:
        normalizeDateString(result.publishedAt || result.date || result.published) ||
        metadata.publishedAt,
      content,
      contentHash,
    };
  } catch {
    return null;
  }
}

function cloneArticleDocument(articleDocument: Document): Document {
  const cloned = articleDocument.cloneNode(true);
  if (isDocumentNode(cloned)) return cloned;
  throw new Error('Expected cloned article document to be a Document.');
}

function isDocumentNode(value: Node): value is Document {
  return value.nodeType === value.DOCUMENT_NODE;
}

function getCanonicalUrl(articleDocument: Document, pageUrl: string) {
  const link = articleDocument.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  return resolveHttpUrl(link?.getAttribute('href') || link?.href, pageUrl) || pageUrl.split('#')[0];
}

function extractArticleMetadata(
  articleDocument: Document,
  baseUrl: string,
  fallback: { siteName?: string; siteIconUrl?: string } = {},
): Pick<
  ExtractedArticle,
  'siteName' | 'siteIconUrl' | 'leadImageUrl' | 'themeColor' | 'publishedAt'
> {
  return {
    siteName:
      nonEmptyMetaProperty(articleDocument, 'og:site_name') ||
      cleanString(fallback.siteName) ||
      domainFromUrl(baseUrl),
    siteIconUrl:
      resolveHttpUrl(fallback.siteIconUrl, baseUrl) || getSiteIconUrl(articleDocument, baseUrl),
    leadImageUrl: getOpenGraphImageUrl(articleDocument, baseUrl),
    themeColor: normalizeThemeColor(nonEmptyMetaName(articleDocument, 'theme-color')),
    publishedAt: extractPublishedAt(articleDocument),
  };
}

function getOpenGraphImageUrl(articleDocument: Document, baseUrl: string) {
  return resolveHttpUrl(
    nonEmptyMetaProperty(articleDocument, 'og:image:secure_url') ||
      nonEmptyMetaProperty(articleDocument, 'og:image:url') ||
      nonEmptyMetaProperty(articleDocument, 'og:image'),
    baseUrl,
  );
}

function getSiteIconUrl(articleDocument: Document, baseUrl: string) {
  const links = Array.from(articleDocument.querySelectorAll<HTMLLinkElement>('link[rel]')).filter(
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

function nonEmptyMetaProperty(articleDocument: Document, property: string) {
  return cleanString(
    articleDocument.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)?.content,
  );
}

function nonEmptyMetaName(articleDocument: Document, name: string) {
  return cleanString(
    articleDocument.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content,
  );
}

function extractPublishedAt(articleDocument: Document) {
  return normalizeDateString(
    nonEmptyMetaProperty(articleDocument, 'article:published_time') ||
      nonEmptyMetaProperty(articleDocument, 'og:article:published_time') ||
      nonEmptyMetaProperty(articleDocument, 'article:modified_time') ||
      nonEmptyMetaName(articleDocument, 'publishdate') ||
      nonEmptyMetaName(articleDocument, 'pubdate') ||
      nonEmptyMetaName(articleDocument, 'date') ||
      nonEmptyMetaName(articleDocument, 'dc.date') ||
      nonEmptyMetaName(articleDocument, 'dc.date.issued') ||
      nonEmptyMetaName(articleDocument, 'sailthru.date') ||
      articleDocument.querySelector<HTMLTimeElement>('time[datetime]')?.dateTime ||
      articleDocument.getElementById('publish_time')?.textContent,
  );
}

function extractAuthor(articleDocument: Document) {
  return (
    cleanString(articleDocument.getElementById('js_name')?.textContent) ||
    nonEmptyMetaName(articleDocument, 'author') ||
    nonEmptyMetaProperty(articleDocument, 'article:author') ||
    nonEmptyMetaName(articleDocument, 'byl') ||
    cleanString(articleDocument.querySelector<HTMLAnchorElement>('[rel="author"]')?.textContent)
  );
}

function cleanString(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeDateString(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return undefined;

  const cjkDate = raw
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\//g, '-');
  const parsed = Date.parse(raw) || Date.parse(cjkDate);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString();
}

function normalizeThemeColor(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return undefined;
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return undefined;
  return raw.toLowerCase();
}

function articleContentHash(articleDocument: Document, html: string) {
  return hashText(textFromHtml(articleDocument, html).slice(0, 8000));
}

function textFromHtml(articleDocument: Document, html: string) {
  const container = articleDocument.createElement('div');
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

function hostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function documentPageUrl(articleDocument: Document) {
  return articleDocument.location?.href || articleDocument.URL || '';
}
