import { describe, expect, it } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';
import {
  articleTranslationIdentityKey,
  resolveArticleTranslationIdentity,
  type ArticleTranslationIdentity,
} from './article-translation-identity';

const settings = { bilingualTranslationTargetLanguage: 'zh-CN' };

describe('article translation identity', () => {
  it('resolves web translations to the fixed article source', () => {
    const identity = resolveArticleTranslationIdentity({
      article: webArticle(),
      requestedSourceId: 'ignored-source',
      requestedTargetLanguage: ' English ',
      settings,
      promptVersion: 3,
    });

    expect(identity).toEqual({
      articleId: 'web-1',
      sourceId: 'article',
      sourceContentHash: 'web-content-hash',
      targetLanguage: 'English',
      promptVersion: 3,
    });
  });

  it('resolves a trimmed EPUB chapter source', () => {
    const identity = resolveArticleTranslationIdentity({
      article: ebookArticle(),
      requestedSourceId: ' chapter-1 ',
      settings,
      promptVersion: 1,
    });

    expect(identity.sourceId).toBe('chapter-1');
    expect(identity.targetLanguage).toBe('简体中文');
  });

  it.each([
    ['requested language', 'en', settings],
    ['configured fallback', ' ', { bilingualTranslationTargetLanguage: ' English ' }],
  ])('normalizes English from the %s', (_, requestedTargetLanguage, identitySettings) => {
    const identity = resolveArticleTranslationIdentity({
      article: webArticle(),
      requestedTargetLanguage,
      settings: identitySettings,
      promptVersion: 1,
    });

    expect(identity.targetLanguage).toBe('English');
  });

  it.each([
    ['requested language', 'ja', settings],
    ['configured fallback', ' ', { bilingualTranslationTargetLanguage: ' Japanese ' }],
  ])('normalizes Japanese from the %s', (_, requestedTargetLanguage, identitySettings) => {
    const identity = resolveArticleTranslationIdentity({
      article: webArticle(),
      requestedTargetLanguage,
      settings: identitySettings,
      promptVersion: 1,
    });

    expect(identity.targetLanguage).toBe('日本語');
  });

  it('rejects EPUB translations without a valid chapter', () => {
    expect(() =>
      resolveArticleTranslationIdentity({
        article: ebookArticle(),
        settings,
        promptVersion: 1,
      }),
    ).toThrow('EBOOK_TRANSLATION_CHAPTER_REQUIRED');
    expect(() =>
      resolveArticleTranslationIdentity({
        article: ebookArticle(),
        requestedSourceId: 'missing-chapter',
        settings,
        promptVersion: 1,
      }),
    ).toThrow('EBOOK_TRANSLATION_CHAPTER_NOT_FOUND');
  });

  it('rejects non-EPUB and unsupported translation sources', () => {
    const epub = ebookArticle();
    const nonEpub = {
      ...epub,
      ebook: { ...epub.ebook, metadata: { ...epub.ebook.metadata, format: 'mobi' as const } },
    };

    expect(() =>
      resolveArticleTranslationIdentity({
        article: nonEpub,
        requestedSourceId: 'chapter-1',
        settings,
        promptVersion: 1,
      }),
    ).toThrow('EBOOK_TRANSLATION_EPUB_ONLY');
    expect(() =>
      resolveArticleTranslationIdentity({
        article: textArticle(),
        settings,
        promptVersion: 1,
      }),
    ).toThrow('ARTICLE_TRANSLATION_SOURCE_UNSUPPORTED');
  });

  it('distinguishes content, language, and prompt versions in the key', () => {
    const identity = resolveArticleTranslationIdentity({
      article: webArticle(),
      settings,
      promptVersion: 1,
    });
    const keys = new Set([
      articleTranslationIdentityKey(identity),
      articleTranslationIdentityKey({ ...identity, sourceContentHash: 'changed-content-hash' }),
      articleTranslationIdentityKey({ ...identity, targetLanguage: 'English' }),
      articleTranslationIdentityKey({ ...identity, promptVersion: 2 }),
    ]);

    expect(keys.size).toBe(4);
  });

  it('does not collide when field values cross the old NUL boundary', () => {
    const first: ArticleTranslationIdentity = {
      articleId: 'article',
      sourceId: 'chapter\0hash',
      sourceContentHash: 'language',
      targetLanguage: 'target',
      promptVersion: 1,
    };
    const second: ArticleTranslationIdentity = {
      ...first,
      sourceId: 'chapter',
      sourceContentHash: 'hash\0language',
    };

    expect(legacyNulKey(first)).toBe(legacyNulKey(second));
    expect(articleTranslationIdentityKey(first)).not.toBe(articleTranslationIdentityKey(second));
  });
});

function legacyNulKey(identity: ArticleTranslationIdentity): string {
  return [
    identity.articleId,
    identity.sourceId,
    identity.sourceContentHash,
    identity.targetLanguage,
    String(identity.promptVersion),
  ].join('\0');
}

function webArticle(): ArticleRecord {
  return {
    id: 'web-1',
    url: 'https://example.com/web-1',
    canonicalUrl: 'https://example.com/web-1',
    sourceType: 'web',
    title: 'Web article',
    contentHash: 'web-content-hash',
    annotations: [],
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

function ebookArticle(): Extract<ArticleRecord, { sourceType: 'ebook' }> {
  return {
    id: 'ebook-1',
    url: 'ebook:test',
    canonicalUrl: 'ebook:test',
    sourceType: 'ebook',
    title: 'Ebook',
    contentHash: 'ebook-content-hash',
    annotations: [],
    ebook: {
      metadata: { format: 'epub', fileName: 'test.epub', fileSize: 1024 },
      chapters: [{ id: 'chapter-1', title: 'Chapter 1', html: '<p>Text</p>', textLength: 4 }],
    },
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

function textArticle(): Extract<ArticleRecord, { sourceType: 'text' }> {
  return {
    id: 'text-1',
    url: 'text:test',
    canonicalUrl: 'text:test',
    sourceType: 'text',
    text: { format: 'plain' },
    title: 'Text',
    contentHash: 'text-content-hash',
    annotations: [],
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}
