import type { ArticleRecord } from '@yomitomo/shared';

const ARTICLE_TRANSLATION_SOURCE_ID = 'article';

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
    targetLanguage: translationTargetLanguage(input.requestedTargetLanguage, input.settings),
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
  if (article.sourceType !== 'ebook') throw new Error('ARTICLE_TRANSLATION_SOURCE_UNSUPPORTED');
  if (article.ebook?.metadata.format !== 'epub') throw new Error('EBOOK_TRANSLATION_EPUB_ONLY');

  const sourceId = requestedSourceId?.trim();
  if (!sourceId) throw new Error('EBOOK_TRANSLATION_CHAPTER_REQUIRED');
  if (!ebookTranslationChapter(article, sourceId)) {
    throw new Error('EBOOK_TRANSLATION_CHAPTER_NOT_FOUND');
  }
  return sourceId;
}

function ebookTranslationChapter(article: ArticleRecord, id: string) {
  return (
    article.ebook?.index?.chapters.find((chapter) => chapter.id === id) ||
    article.ebook?.chapters.find((chapter) => chapter.id === id) ||
    null
  );
}

function translationTargetLanguage(
  requested: string | undefined,
  settings: { bilingualTranslationTargetLanguage?: string },
): string {
  const value = requested?.trim() || settings.bilingualTranslationTargetLanguage?.trim() || 'zh-CN';
  const normalized = value.toLowerCase();
  if (normalized === 'en' || normalized === 'english') return 'English';
  if (normalized === 'ja' || normalized === 'japanese' || value === '日本語') return '日本語';
  return '简体中文';
}
