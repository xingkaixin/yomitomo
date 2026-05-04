// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { Annotation, ArticleRecord, Comment } from '@yomitomo/shared';
import {
  annotationAuthorProfile,
  articleExternalUrl,
  articlePlainText,
  commentAuthorProfile,
  formatLogData,
  isImageAvatar,
  isSvgAvatar,
  parseLogEntries,
  svgToDataUrl,
  urlHost,
} from '../app-utils';

const now = '2026-05-04T00:00:00.000Z';

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/canonical',
    title: '文章',
    excerpt: '摘要',
    contentHtml: '<article><p>第一段</p><p>第二段</p></article>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('app utils', () => {
  it('extracts article display text and safe external urls', () => {
    expect(articlePlainText(article())).toBe('第一段第二段');
    expect(articlePlainText(article({ contentHtml: '', excerpt: '备用摘要' }))).toBe('备用摘要');
    expect(articleExternalUrl(article({ canonicalUrl: 'file:///tmp/a.html' }))).toBe(
      'https://example.com/post',
    );
    expect(articleExternalUrl(article({ canonicalUrl: 'app://local', url: 'about:blank' }))).toBe(
      '',
    );
  });

  it('parses structured and raw log lines', () => {
    const entries = parseLogEntries(
      '{"at":"2026-05-04T00:00:00.000Z","level":"error","event":"llm.fail","data":{"code":500}}\nraw line\n',
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual(
      expect.objectContaining({ at: now, level: 'error', event: 'llm.fail' }),
    );
    expect(entries[1]).toEqual(expect.objectContaining({ level: 'info', event: 'raw' }));
    expect(formatLogData({ code: 500 })).toContain('"code": 500');
  });

  it('derives author profiles and avatar kinds', () => {
    const aiAnnotation = {
      author: 'ai',
      agentNickname: '阅读伙伴',
      agentUsername: 'reader',
      agentAvatar: 'AI',
    } as Annotation;
    const userComment = {
      author: 'user',
      userNickname: 'Kevin',
      userUsername: 'kevin',
      userAvatar: '/avatar.png',
    } as Comment;

    expect(annotationAuthorProfile(aiAnnotation)).toEqual({ avatar: 'AI', name: '阅读伙伴' });
    expect(commentAuthorProfile(userComment)).toEqual({ avatar: '/avatar.png', name: 'Kevin' });
    expect(isImageAvatar('/avatar.png')).toBe(true);
    expect(isSvgAvatar('data:image/svg+xml,<svg />')).toBe(true);
    expect(svgToDataUrl('<svg />')).toContain('%3Csvg%20%2F%3E');
  });

  it('formats invalid hosts as the original value', () => {
    expect(urlHost('https://example.com/post')).toBe('example.com');
    expect(urlHost('not a url')).toBe('not a url');
  });
});
