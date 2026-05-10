import type { ExtractedArticle } from './article-extraction';

const MAX_INLINE_IMAGES = 40;
const MAX_INLINE_IMAGE_DATA_CHARS = 10_000_000;

export type ImageFetcher = (url: string) => Promise<string | null>;

export type ArticleImageInlineOptions = {
  articleDocument: Document;
  fetcher: ImageFetcher;
};

export async function inlineArticleImages(
  article: ExtractedArticle,
  options: ArticleImageInlineOptions,
): Promise<ExtractedArticle> {
  const inliner = imageInliner(article.canonicalUrl || article.url, options.fetcher);
  return {
    ...article,
    siteIconUrl: (await inliner.inlineUrl(article.siteIconUrl)) || article.siteIconUrl,
    leadImageUrl: (await inliner.inlineUrl(article.leadImageUrl)) || article.leadImageUrl,
    content: await inlineHtmlImages(article.content, options.articleDocument, inliner),
  };
}

async function inlineHtmlImages(
  html: string,
  articleDocument: Document,
  inliner: ReturnType<typeof imageInliner>,
): Promise<string> {
  const container = articleDocument.createElement('div');
  container.innerHTML = html;

  for (const image of Array.from(container.querySelectorAll<HTMLImageElement>('img'))) {
    const sourceUrl = imageSourceUrl(image, inliner.baseUrl);
    if (sourceUrl) image.setAttribute('src', sourceUrl);
    const dataUrl = await inliner.inlineUrl(sourceUrl);
    if (!dataUrl) continue;

    image.setAttribute('src', dataUrl);
    removeExternalImageHints(image);
    image
      .closest('picture')
      ?.querySelectorAll('source')
      .forEach((source) => source.remove());
  }

  return container.innerHTML;
}

function imageInliner(baseUrl: string, fetcher: ImageFetcher) {
  const cache = new Map<string, string | null>();
  let imageCount = 0;
  let dataChars = 0;

  async function inlineUrl(value: string | undefined) {
    const url = normalizeHttpImageUrl(value, baseUrl);
    if (!url) return null;
    if (url.startsWith('data:image/')) return url;
    if (cache.has(url)) return cache.get(url) || null;
    if (imageCount >= MAX_INLINE_IMAGES) return null;

    const dataUrl = await fetcher(url);
    if (!dataUrl?.startsWith('data:image/')) {
      cache.set(url, null);
      return null;
    }
    if (dataChars + dataUrl.length > MAX_INLINE_IMAGE_DATA_CHARS) {
      cache.set(url, null);
      return null;
    }

    imageCount += 1;
    dataChars += dataUrl.length;
    cache.set(url, dataUrl);
    return dataUrl;
  }

  return { baseUrl, inlineUrl };
}

function imageSourceUrl(image: HTMLImageElement, baseUrl: string) {
  return (
    normalizeHttpImageUrl(image.getAttribute('data-src'), baseUrl) ||
    normalizeHttpImageUrl(image.getAttribute('data-original'), baseUrl) ||
    normalizeHttpImageUrl(image.getAttribute('data-lazy-src'), baseUrl) ||
    normalizeHttpImageUrl(image.getAttribute('data-actualsrc'), baseUrl) ||
    firstSrcsetUrl(image.getAttribute('data-srcset'), baseUrl) ||
    normalizeHttpImageUrl(image.getAttribute('src'), baseUrl) ||
    firstSrcsetUrl(image.getAttribute('srcset'), baseUrl) ||
    undefined
  );
}

function removeExternalImageHints(image: HTMLImageElement) {
  [
    'srcset',
    'data-src',
    'data-original',
    'data-lazy-src',
    'data-actualsrc',
    'data-srcset',
    'loading',
  ].forEach((attribute) => image.removeAttribute(attribute));
}

function firstSrcsetUrl(value: string | null, baseUrl: string) {
  if (!value) return undefined;
  if (value.trim().startsWith('data:image/')) return value.trim();
  for (const candidate of value.split(',')) {
    const url = normalizeHttpImageUrl(candidate.trim().split(/\s+/)[0], baseUrl);
    if (url) return url;
  }
  return undefined;
}

function normalizeHttpImageUrl(value: string | null | undefined, baseUrl: string) {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (raw.startsWith('data:image/')) return raw;
  try {
    const url = new URL(raw, baseUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}
