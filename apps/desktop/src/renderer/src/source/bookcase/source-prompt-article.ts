import type { ArticleRecord } from '@yomitomo/shared';
import type { PromptArticle } from '../../shell/app-reading-types';

export function promptArticle(
  currentArticle: ArticleRecord | null,
  articleText: string,
): PromptArticle {
  return {
    id: currentArticle?.id,
    title: currentArticle?.title || '',
    url: currentArticle?.canonicalUrl || currentArticle?.url || '',
    byline: currentArticle?.byline,
    text: articleText,
    ebookIndex: currentArticle?.ebook?.index,
    ebookMetadata: currentArticle?.ebook?.metadata,
  };
}
