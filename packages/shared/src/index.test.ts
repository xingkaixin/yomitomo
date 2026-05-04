import { describe, expect, it } from 'vitest';
import {
  createTextAnchor,
  isDesktopSocketOriginAllowed,
  parseDesktopClientMessage,
  renderMarkdown,
  resolveTextAnchor,
} from './index';

describe('shared text anchors', () => {
  it('resolves repeated exact text with prefix and suffix context', () => {
    const text = 'alpha target omega. beta target gamma.';
    const anchor = createTextAnchor(text, 25, 31);

    expect(resolveTextAnchor(text, { ...anchor, start: 0, end: 6 })).toEqual({
      start: 25,
      end: 31,
    });
  });
});

describe('shared markdown rendering', () => {
  it('escapes inline html while rendering simple markdown', () => {
    const html = renderMarkdown('Hello **world** <script>alert(1)</script>');

    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('desktop socket origin policy', () => {
  it('accepts extension and localhost origins', () => {
    expect(isDesktopSocketOriginAllowed('chrome-extension://abcdefghijklmnop')).toBe(true);
    expect(isDesktopSocketOriginAllowed('moz-extension://abcdefghijklmnop')).toBe(true);
    expect(isDesktopSocketOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isDesktopSocketOriginAllowed('http://127.0.0.1:3000')).toBe(true);
  });

  it('rejects web page and missing origins', () => {
    expect(isDesktopSocketOriginAllowed('https://example.com')).toBe(false);
    expect(isDesktopSocketOriginAllowed('not a url')).toBe(false);
    expect(isDesktopSocketOriginAllowed(undefined)).toBe(false);
  });
});

describe('desktop client message parser', () => {
  it('accepts a valid article save message', () => {
    const result = parseDesktopClientMessage({
      type: 'article:save',
      requestId: 'request-1',
      payload: articleRecord(),
    });

    expect(result.ok).toBe(true);
  });

  it('rejects unknown types and missing request ids', () => {
    expect(parseDesktopClientMessage({ type: 'unknown', requestId: 'request-1' })).toEqual({
      ok: false,
      error: { requestId: 'request-1', message: '未知消息类型' },
    });

    expect(parseDesktopClientMessage({ type: 'agent:list' })).toEqual({
      ok: false,
      error: { requestId: undefined, message: 'requestId 必须是非空字符串' },
    });
  });

  it('rejects non-http urls', () => {
    expect(
      parseDesktopClientMessage({
        type: 'article:get',
        requestId: 'request-1',
        payload: {
          id: 'article-1',
          url: 'file:///tmp/article.html',
          canonicalUrl: 'https://example.com/article',
        },
      }),
    ).toEqual({
      ok: false,
      error: { requestId: 'request-1', message: 'article:get URL 必须是 http 或 https' },
    });
  });

  it('rejects payloads above the transport boundary', () => {
    const record = articleRecord({ contentHtml: 'x'.repeat(2_000_001) });

    expect(
      parseDesktopClientMessage({
        type: 'article:save',
        requestId: 'request-1',
        payload: record,
      }),
    ).toEqual({
      ok: false,
      error: { requestId: 'request-1', message: 'article.contentHtml 超出存储容量边界' },
    });
  });

  it('accepts valid agent messages with empty pending ai comments', () => {
    const record = articleRecord();
    const result = parseDesktopClientMessage({
      type: 'agent:message',
      requestId: 'request-1',
      payload: {
        agentUsername: 'reader',
        article: {
          title: 'Article',
          url: 'https://example.com/article',
          text: 'Article text',
        },
        annotation: record.annotations[0],
        userComment: {
          id: 'comment-user',
          author: 'user',
          content: '@reader 怎么看？',
          createdAt: '2026-05-04T00:00:00.000Z',
        },
      },
    });

    expect(result.ok).toBe(true);
  });
});

function articleRecord(overrides: Record<string, unknown> = {}) {
  const anchor = createTextAnchor('Article text', 0, 7);
  return {
    id: 'article-1',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    title: 'Article',
    byline: 'Author',
    excerpt: 'Excerpt',
    contentHtml: '<p>Article text</p>',
    contentHash: 'hash-1',
    annotations: [
      {
        id: 'annotation-1',
        anchor,
        author: 'ai',
        color: '#f4c95d',
        comments: [
          {
            id: 'comment-ai',
            author: 'ai',
            content: '',
            createdAt: '2026-05-04T00:00:00.000Z',
          },
        ],
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
    ],
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
    ...overrides,
  };
}
