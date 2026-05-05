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

  const wechatContent =
    location.hostname === 'mp.weixin.qq.com' ? document.getElementById('js_content') : null;

  if (wechatContent) {
    const title = document.querySelector('h1')?.textContent?.trim() || document.title || 'Untitled';
    const content = sanitizeArticleHtml(wechatContent.innerHTML);
    const contentHash = articleContentHash(content);
    return {
      id: hashText(canonicalUrl || contentHash),
      url: location.href,
      canonicalUrl,
      title,
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
  const content = sanitizeArticleHtml(rawContent);
  const contentHash = articleContentHash(content);

  return {
    id: hashText(canonicalUrl || contentHash),
    url: location.href,
    canonicalUrl,
    title: parsed?.title || fallbackTitle,
    byline: parsed?.byline || undefined,
    excerpt: parsed?.excerpt || undefined,
    content,
    contentHash,
  };
}

export function fallbackCurrentArticle(): ExtractedArticle {
  const canonicalUrl = getCanonicalUrl();
  const rawContent = document.querySelector('article')?.innerHTML || document.body?.innerHTML || '';
  const content = sanitizeArticleHtml(rawContent || '<p>当前页面没有可读取内容。</p>');
  const contentHash = articleContentHash(content);

  return {
    id: hashText(canonicalUrl || contentHash),
    url: location.href,
    canonicalUrl,
    title: document.querySelector('h1')?.textContent?.trim() || document.title || 'Untitled',
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

    const content = sanitizeArticleHtml(result.content);
    const contentHash = articleContentHash(content);
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

function sanitizeArticleHtml(html: string) {
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
  return normalizeReaderHtml(sanitized);
}

function normalizeReaderHtml(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('script, style, link').forEach((element) => element.remove());
  container.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.removeAttribute('style');
    element.removeAttribute('width');
    element.removeAttribute('height');
    if (element.tagName.includes('-')) {
      element.replaceWith(...Array.from(element.childNodes));
    }
  });
  return container.innerHTML;
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
