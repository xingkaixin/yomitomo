import { browser } from 'wxt/browser';
import type { ExtractedArticle } from './article-extraction';
import {
  inlineArticleImages as inlineCoreArticleImages,
  type ImageFetcher,
} from '@yomitomo/core/article-images';
import {
  ARTICLE_IMAGE_FETCH_MESSAGE_TYPE,
  type ArticleImageFetchResponse,
} from './background-bridge';

export async function inlineArticleImages(
  article: ExtractedArticle,
  fetcher: ImageFetcher = fetchArticleImageDataUrl,
): Promise<ExtractedArticle> {
  return inlineCoreArticleImages(article, { articleDocument: document, fetcher });
}

export async function fetchArticleImageDataUrl(url: string) {
  try {
    const response = (await browser.runtime.sendMessage({
      type: ARTICLE_IMAGE_FETCH_MESSAGE_TYPE,
      url,
    })) as ArticleImageFetchResponse | undefined;
    return response?.ok ? response.dataUrl : null;
  } catch {
    return null;
  }
}
