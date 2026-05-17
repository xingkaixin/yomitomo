import type { ExtractedArticle } from './article-extraction';

const MAX_INLINE_IMAGES = 40;
const MAX_INLINE_IMAGE_DATA_CHARS = 10_000_000;
const INLINE_IMAGE_CONCURRENCY = 4;

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

  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  for (let index = 0; index < images.length; index += INLINE_IMAGE_CONCURRENCY) {
    await Promise.all(
      images.slice(index, index + INLINE_IMAGE_CONCURRENCY).map(async (image) => {
        const sourceUrl = imageSourceUrl(image, inliner.baseUrl);
        if (sourceUrl) image.setAttribute('src', sourceUrl);
        const dataUrl = await inliner.inlineUrl(sourceUrl);
        if (!dataUrl) return;

        image.setAttribute('src', dataUrl);
        removeExternalImageHints(image);
        image
          .closest('picture')
          ?.querySelectorAll('source')
          .forEach((source) => source.remove());
      }),
    );
  }

  return container.innerHTML;
}

function imageInliner(baseUrl: string, fetcher: ImageFetcher) {
  const fetchedByUrl = new Map<string, Promise<string | null>>();
  const committedByUrl = new Map<string, string | null>();
  let imageCount = 0;
  let dataChars = 0;
  let commitQueue = Promise.resolve();

  function fetchDataUrl(url: string) {
    const cached = fetchedByUrl.get(url);
    if (cached) return cached;
    const pending = fetcher(url).then((dataUrl) =>
      dataUrl?.startsWith('data:image/') ? dataUrl : null,
    );
    fetchedByUrl.set(url, pending);
    return pending;
  }

  function inlineUrl(value: string | undefined) {
    const url = normalizeHttpImageUrl(value, baseUrl);
    if (!url) return Promise.resolve(null);
    if (url.startsWith('data:image/')) return Promise.resolve(url);
    if (committedByUrl.has(url)) return Promise.resolve(committedByUrl.get(url) || null);
    if (imageCount >= MAX_INLINE_IMAGES) return Promise.resolve(null);

    const dataUrlPromise = fetchDataUrl(url);
    const result = commitQueue.then(async () => {
      if (committedByUrl.has(url)) return committedByUrl.get(url) || null;

      const dataUrl = await dataUrlPromise;
      if (!dataUrl) {
        committedByUrl.set(url, null);
        return null;
      }
      if (
        imageCount >= MAX_INLINE_IMAGES ||
        dataChars + dataUrl.length > MAX_INLINE_IMAGE_DATA_CHARS
      ) {
        committedByUrl.set(url, null);
        return null;
      }

      imageCount += 1;
      dataChars += dataUrl.length;
      committedByUrl.set(url, dataUrl);
      return dataUrl;
    });
    commitQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
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
