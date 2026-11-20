import { describe, expect, it } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';
import {
  articleTranslationIdentityKey,
  resolveArticleTranslationIdentity,
  type ArticleTranslationIdentity,
} from './article-translation-identity';

const settings = { bilingualTranslationTargetLanguage: 'zh-CN' };

describe('article translation identity', () => {
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

  it('resolves page-scoped PDF translation identities and rejects out-of-range pages', () => {
    const pageZero = resolveArticleTranslationIdentity({
      article: pdfArticle(),
      requestedSourceId: 'pdf-page-0',
      settings,
      promptVersion: 1,
    });
    const pageOne = resolveArticleTranslationIdentity({
      article: pdfArticle(),
      requestedSourceId: 'pdf-page-1',
      settings,
      promptVersion: 1,
    });

    expect(pageZero.sourceId).toBe('pdf-page-0');
    expect(pageOne.sourceId).toBe('pdf-page-1');
    expect(articleTranslationIdentityKey(pageZero)).not.toBe(
      articleTranslationIdentityKey(pageOne),
    );
    expect(() =>
      resolveArticleTranslationIdentity({
        article: pdfArticle(),
        requestedSourceId: 'pdf-page-5',
        settings,
        promptVersion: 1,
      }),
    ).toThrow('PDF_TRANSLATION_PAGE_INVALID');
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

function pdfArticle(): ArticleRecord {
  return {
    id: 'pdf-1',
    url: 'pdf://pdf-1',
    canonicalUrl: 'pdf://pdf-1',
    sourceType: 'pdf',
    title: 'Single-column PDF',
    contentHash: 'pdf-content-hash',
    annotations: [],
    pdf: {
      metadata: {
        format: 'pdf',
        fileName: 'paper.pdf',
        fileSize: 4096,
        pageCount: 3,
      },
    },
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}
