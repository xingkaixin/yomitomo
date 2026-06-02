import type { ExtractedArticle } from './article-extraction';
import { Deferred, Effect, Fiber } from 'effect';

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
  return Effect.runPromise(inlineArticleImagesEffect(article, options));
}

function inlineArticleImagesEffect(article: ExtractedArticle, options: ArticleImageInlineOptions) {
  return Effect.gen(function* () {
    const inliner = yield* imageInlinerEffect(article.canonicalUrl || article.url, options.fetcher);
    const siteIconUrl = yield* inliner.inlineUrl(article.siteIconUrl);
    const leadImageUrl = yield* inliner.inlineUrl(article.leadImageUrl);
    const content = yield* inlineHtmlImagesEffect(
      article.content,
      options.articleDocument,
      inliner,
    );

    return {
      ...article,
      siteIconUrl: siteIconUrl || article.siteIconUrl,
      leadImageUrl: leadImageUrl || article.leadImageUrl,
      content,
    };
  });
}

function inlineHtmlImagesEffect(html: string, articleDocument: Document, inliner: EffectInliner) {
  return Effect.gen(function* () {
    const container = articleDocument.createElement('div');
    container.innerHTML = html;

    const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
    yield* Effect.all(
      images.map((image) =>
        Effect.gen(function* () {
          const sourceUrl = imageSourceUrl(image, inliner.baseUrl);
          if (sourceUrl) image.setAttribute('src', sourceUrl);
          const dataUrl = yield* inliner.inlineUrl(sourceUrl);
          if (!dataUrl) return;

          image.setAttribute('src', dataUrl);
          removeExternalImageHints(image);
          image
            .closest('picture')
            ?.querySelectorAll('source')
            .forEach((source) => source.remove());
        }),
      ),
      { concurrency: INLINE_IMAGE_CONCURRENCY, discard: true },
    );

    return container.innerHTML;
  });
}

type EffectInliner = Effect.Effect.Success<ReturnType<typeof imageInlinerEffect>>;
type FetchEntry = Deferred.Deferred<string | null>;

function imageInlinerEffect(baseUrl: string, fetcher: ImageFetcher) {
  return Effect.gen(function* () {
    const fetchSemaphore = yield* Effect.makeSemaphore(INLINE_IMAGE_CONCURRENCY);
    const fetchMapMutex = yield* Effect.makeSemaphore(1);
    const commitTurnMutex = yield* Effect.makeSemaphore(1);
    const fetchedByUrl = new Map<string, FetchEntry>();
    const committedByUrl = new Map<string, string | null>();
    let imageCount = 0;
    let dataChars = 0;
    let commitTail = yield* Deferred.make<void>();
    yield* Deferred.succeed(commitTail, undefined);

    function inlineUrl(value: string | undefined) {
      return Effect.gen(function* () {
        const url = normalizeHttpImageUrl(value, baseUrl);
        if (!url) return null;
        if (url.startsWith('data:image/')) return url;
        if (committedByUrl.has(url)) return committedByUrl.get(url) || null;
        if (imageCount >= MAX_INLINE_IMAGES) return null;

        const dataUrlFiber = yield* Effect.fork(fetchDataUrl(url));
        const turn = yield* reserveCommitTurn();
        return yield* Effect.gen(function* () {
          yield* Deferred.await(turn.previous);
          if (committedByUrl.has(url)) return committedByUrl.get(url) || null;

          const dataUrl = yield* Fiber.join(dataUrlFiber);
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
        }).pipe(Effect.ensuring(Deferred.succeed(turn.next, undefined)));
      });
    }

    function reserveCommitTurn() {
      return Effect.gen(function* () {
        const next = yield* Deferred.make<void>();
        return yield* commitTurnMutex.withPermits(1)(
          Effect.sync(() => {
            const previous = commitTail;
            commitTail = next;
            return { previous, next };
          }),
        );
      });
    }

    function fetchDataUrl(url: string) {
      return Effect.gen(function* () {
        const created = yield* Deferred.make<string | null>();
        const entry = yield* fetchMapMutex.withPermits(1)(
          Effect.sync(() => {
            const existing = fetchedByUrl.get(url);
            if (existing) return { deferred: existing, shouldFetch: false };
            fetchedByUrl.set(url, created);
            return { deferred: created, shouldFetch: true };
          }),
        );

        if (entry.shouldFetch) {
          yield* Deferred.complete(entry.deferred, fetcherDataUrl(url));
        }
        return yield* Deferred.await(entry.deferred);
      });
    }

    function fetcherDataUrl(url: string) {
      return fetchSemaphore.withPermits(1)(
        Effect.tryPromise({
          try: () => fetcher(url),
          catch: () => null,
        }).pipe(
          Effect.map((dataUrl) => (dataUrl?.startsWith('data:image/') ? dataUrl : null)),
          Effect.catchAll(() => Effect.succeed(null)),
        ),
      );
    }

    return { baseUrl, inlineUrl };
  });
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
