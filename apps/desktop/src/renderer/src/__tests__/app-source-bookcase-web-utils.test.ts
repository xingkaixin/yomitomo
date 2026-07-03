// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { ArticleRecord, ArticleTranslation } from '@yomitomo/shared';
import {
  articleLinkExternalUrl,
  articleTranslationStats,
  sourceArticleBodyHtml,
  translationCompletionToastDescription,
  translationCompletionToastTitle,
  translationProgressToastText,
} from '../source/web/app-source-bookcase-web-utils';

const now = '2026-05-16T12:00:00.000Z';

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'article-1',
    url: 'https://example.com/posts/story',
    canonicalUrl: 'https://example.com/canonical/story',
    sourceType: 'web',
    title: '网页文章',
    byline: '',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash-1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function translation(overrides: Partial<ArticleTranslation> = {}): ArticleTranslation {
  return {
    id: 'translation-1',
    articleId: 'article-1',
    sourceContentHash: 'hash-1',
    targetLanguage: 'zh-CN',
    promptVersion: 1,
    status: 'translating',
    segments: [
      translationSegment('segment-1', 'ready'),
      translationSegment('segment-2', 'failed'),
      translationSegment('segment-3', 'translating'),
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function translationSegment(
  id: string,
  status: ArticleTranslation['segments'][number]['status'],
): ArticleTranslation['segments'][number] {
  return {
    id,
    translationId: 'translation-1',
    sourceBlockId: `block-${id}`,
    sourceTextHash: `hash-${id}`,
    sourceText: `source ${id}`,
    status,
    order: Number(id.replace('segment-', '')),
    createdAt: now,
    updatedAt: now,
  };
}

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key) as TFunction;

describe('articleLinkExternalUrl', () => {
  it('keeps same-document anchors inside the reader', () => {
    expect(articleLinkExternalUrl(article(), '#footnote-1')).toBe('');
  });

  it('opens absolute http links externally', () => {
    expect(articleLinkExternalUrl(article(), 'https://other.example/path')).toBe(
      'https://other.example/path',
    );
  });

  it('resolves relative links against the article URL', () => {
    expect(articleLinkExternalUrl(article(), '../next')).toBe('https://example.com/next');
  });

  it('falls back to the source URL when canonical URL is not external', () => {
    expect(articleLinkExternalUrl(article({ canonicalUrl: 'about:blank' }), './next')).toBe(
      'https://example.com/posts/next',
    );
  });

  it('ignores non-http links', () => {
    expect(articleLinkExternalUrl(article(), 'mailto:hello@example.com')).toBe('');
  });
});

describe('sourceArticleBodyHtml', () => {
  it('removes unsafe article html before reader rendering', () => {
    const html = sourceArticleBodyHtml(
      article({
        contentHtml: `
          <p>正文</p>
          <img src="https://cdn.example.com/image.jpg" onerror="alert(1)" />
          <a href="javascript:alert(1)">bad link</a>
          <form><button formaction="javascript:alert(1)">bad form</button></form>
          <svg><use xlink:href="javascript:alert(1)"></use></svg>
          <a href="data:text/html,<script>alert(1)</script>">bad data</a>
          <img srcset="javascript:alert(1) 1x, https://cdn.example.com/good.jpg 2x" />
        `,
      }),
    );

    expect(html).toContain('<p>正文</p>');
    expect(html).toContain('src="https://cdn.example.com/image.jpg"');
    expect(html).not.toContain('srcset=');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('formaction');
    expect(html).not.toContain('xlink:href');
    expect(html).not.toContain('data:text/html');
  });

  it('keeps safe article links and images', () => {
    const html = sourceArticleBodyHtml(
      article({
        contentHtml: `
          <p>正文</p>
          <a href="/relative/path">relative</a>
          <a href="https://example.com/path">https</a>
          <img src="data:image/png;base64,abc" />
          <img srcset="/image-small.jpg 1x, https://cdn.example.com/image-large.jpg 2x" />
        `,
      }),
    );

    expect(html).toContain('href="/relative/path"');
    expect(html).toContain('href="https://example.com/path"');
    expect(html).toContain('src="data:image/png;base64,abc"');
    expect(html).toContain('/image-small.jpg 1x');
    expect(html).toContain('https://cdn.example.com/image-large.jpg 2x');
  });
});

describe('articleTranslationStats', () => {
  it('counts ready and failed segments from translation status', () => {
    expect(articleTranslationStats(translation())).toEqual({
      failed: 1,
      ready: 1,
      total: 3,
    });
  });
});

describe('translation toast copy helpers', () => {
  it('uses success copy when all translated segments are ready', () => {
    const nextTranslation = translation({
      segments: [
        translationSegment('segment-1', 'ready'),
        translationSegment('segment-2', 'ready'),
      ],
    });

    expect(translationCompletionToastTitle(nextTranslation, t)).toBe(
      'source.translationCompleteToast',
    );
    expect(translationCompletionToastDescription(nextTranslation, t)).toBe(
      'source.translationCompleteToastDescription:{"ready":2,"total":2}',
    );
    expect(translationProgressToastText(nextTranslation, t)).toBe(
      'source.translationProgressToastDescription:{"ready":2,"total":2}',
    );
  });

  it('uses failure copy when any segment failed', () => {
    const nextTranslation = translation();

    expect(translationCompletionToastTitle(nextTranslation, t)).toBe(
      'source.translationCompleteWithFailuresToast:{"failed":1}',
    );
    expect(translationCompletionToastDescription(nextTranslation, t)).toBe(
      'source.translationCompleteWithFailuresDescription:{"failed":1,"ready":1,"total":3}',
    );
    expect(translationProgressToastText(nextTranslation, t)).toBe(
      'source.translationProgressWithFailuresToastDescription:{"failed":1,"ready":1,"total":3}',
    );
  });
});
