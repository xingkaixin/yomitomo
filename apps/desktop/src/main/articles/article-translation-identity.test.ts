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
