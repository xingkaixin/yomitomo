import type { ArticleRecord } from '@yomitomo/shared';
import { normalizeArticleTranslationTargetLanguage } from '@yomitomo/shared';

const ARTICLE_TRANSLATION_SOURCE_ID = 'article';
const PDF_TRANSLATION_SOURCE_ID = 'pdf';
const PDF_PAGE_SOURCE_ID_PATTERN = /^pdf-page-(\d+)$/;

export type ArticleTranslationIdentity = {
  readonly articleId: string;
  readonly sourceId: string;
  readonly sourceContentHash: string;
  readonly targetLanguage: string;
  readonly promptVersion: number;
};

export function resolveArticleTranslationIdentity(input: {
  article: ArticleRecord;
  requestedSourceId?: string;
  requestedTargetLanguage?: string;
  settings: { bilingualTranslationTargetLanguage?: string };
  promptVersion: number;
}): ArticleTranslationIdentity {
  return {
    articleId: input.article.id,
    sourceId: articleTranslationSourceId(input.article, input.requestedSourceId),
    sourceContentHash: input.article.contentHash,
    targetLanguage: normalizeArticleTranslationTargetLanguage(
      input.requestedTargetLanguage?.trim() || input.settings.bilingualTranslationTargetLanguage,
    ),
    promptVersion: input.promptVersion,
  };
}

export function articleTranslationIdentityKey(identity: ArticleTranslationIdentity): string {
  return JSON.stringify([
    identity.articleId,
    identity.sourceId,
    identity.sourceContentHash,
    identity.targetLanguage,
    identity.promptVersion,
  ]);
}

function articleTranslationSourceId(article: ArticleRecord, requestedSourceId?: string): string {
  if (article.sourceType === 'web') return ARTICLE_TRANSLATION_SOURCE_ID;
  if (article.sourceType === 'pdf') return pdfTranslationSourceId(article, requestedSourceId);
  if (article.sourceType !== 'ebook') throw new Error('ARTICLE_TRANSLATION_SOURCE_UNSUPPORTED');
  if (article.ebook?.metadata.format !== 'epub') throw new Error('EBOOK_TRANSLATION_EPUB_ONLY');

  const sourceId = requestedSourceId?.trim();
  if (!sourceId) throw new Error('EBOOK_TRANSLATION_CHAPTER_REQUIRED');
  if (!ebookTranslationChapter(article, sourceId)) {
    throw new Error('EBOOK_TRANSLATION_CHAPTER_NOT_FOUND');
  }
  return sourceId;
}

function pdfTranslationSourceId(
  article: Extract<ArticleRecord, { sourceType: 'pdf' }>,
  requestedSourceId?: string,
): string {
  const sourceId = requestedSourceId?.trim();
  if (!sourceId || sourceId === PDF_TRANSLATION_SOURCE_ID) return PDF_TRANSLATION_SOURCE_ID;
  const match = PDF_PAGE_SOURCE_ID_PATTERN.exec(sourceId);
  if (!match) throw new Error('PDF_TRANSLATION_PAGE_INVALID');
  const pageIndex = Number(match[1]);
  const pageCount = article.pdf.metadata.pageCount;
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || (pageCount > 0 && pageIndex >= pageCount)) {
    throw new Error('PDF_TRANSLATION_PAGE_INVALID');
  }
  return `pdf-page-${pageIndex}`;
}

function ebookTranslationChapter(article: ArticleRecord, id: string) {
  return (
    article.ebook?.index?.chapters.find((chapter) => chapter.id === id) ||
    article.ebook?.chapters.find((chapter) => chapter.id === id) ||
    null
  );
}
