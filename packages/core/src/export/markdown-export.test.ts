import { describe, expect, it } from 'vitest';
import type { ArticleRecord, PublicAgent, UserProfile, WeReadBookDetail } from '@yomitomo/shared';
import {
  formatArticleNotesMarkdown,
  formatDistillationMarkdown,
  formatWeReadBookMarkdown,
  sanitizeMarkdownFileName,
} from './markdown-export';

const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const agent: PublicAgent = {
  id: 'agent_1',
  kind: 'annotation',
  nickname: '林知微',
  username: 'linzhiwei',
  avatar: '',
  annotationColor: '#8ab6d6',
  annotationDensity: 'medium',
  enabled: true,
  personalityName: '页边同读者',
  temperature: 0.35,
};

describe('markdown export formatting', () => {
  it('formats article highlights, verbatim user thoughts, AI discussions, and published distillations in reading order', () => {
    const article: ArticleRecord = {
      id: 'article_1',
      sourceType: 'web',
      url: 'https://example.com/essay',
      canonicalUrl: 'https://example.com/essay',
      title: 'Deep Work Notes',
      byline: 'Cal Newport',
      contentHtml: '<p>Body</p>',
      contentHash: 'hash',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      annotations: [
        {
          id: 'anno_2',
          anchor: { exact: 'Second quote', prefix: '', suffix: '', start: 120, end: 132 },
          author: { kind: 'user', userId: userProfile.id, username: 'kevin', nickname: 'Kevin' },
          color: '#f4c95d',
          comments: [],
          distillation: {
            status: 'unpublished',
            content: 'Unpublished draft should not appear',
            updatedAt: '2026-06-02T00:00:00.000Z',
          },
          createdAt: '2026-06-01T02:00:00.000Z',
          updatedAt: '2026-06-01T02:00:00.000Z',
        },
        {
          id: 'anno_1',
          anchor: {
            exact: 'First line\nSecond line with *verbatim* text',
            prefix: '',
            suffix: '',
            start: 10,
            end: 50,
          },
          author: { kind: 'user', userId: userProfile.id, username: 'kevin', nickname: 'Kevin' },
          color: '#f4c95d',
          distillation: {
            status: 'published',
            content: 'Published synthesis **verbatim**.',
            publishedAt: '2026-06-02T00:00:00.000Z',
            updatedAt: '2026-06-02T00:00:00.000Z',
          },
          comments: [
            {
              id: 'c_reply',
              author: {
                kind: 'agent',
                agentId: agent.id,
                username: agent.username,
                nickname: agent.nickname,
              },
              content: 'Follow-up question',
              createdAt: '2026-06-01T01:05:00.000Z',
              replyTo: 'c_root',
            },
            {
              id: 'c_root',
              author: {
                kind: 'user',
                userId: userProfile.id,
                username: 'kevin',
                nickname: 'Kevin',
              },
              content: 'Line one of my thought\nLine two with `code`',
              createdAt: '2026-06-01T01:00:00.000Z',
            },
          ],
          createdAt: '2026-06-01T01:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      ],
    };

    const markdown = formatArticleNotesMarkdown({
      article,
      userProfile,
      agents: [agent],
    });

    expect(markdown).toBe(
      [
        '# Deep Work Notes',
        '',
        '- 作者: Cal Newport',
        '- 来源: https://example.com/essay',
        '',
        '> First line',
        '> Second line with *verbatim* text',
        '',
        '### 沉淀',
        '',
        'Published synthesis **verbatim**.',
        '',
        '- **Kevin**: Line one of my thought',
        '  Line two with `code`',
        '  - **林知微** (AI): Follow-up question',
        '',
        '---',
        '',
        '> Second quote',
        '',
      ].join('\n'),
    );
    expect(markdown).not.toContain('Unpublished draft should not appear');
  });

  it('formats a single distillation while preserving quote and user content verbatim', () => {
    const markdown = formatDistillationMarkdown({
      articleTitle: 'Systems Thinking',
      articleByline: 'Donella Meadows',
      sourceUrl: 'https://example.com/systems',
      quote: 'A system is an interconnected set of elements.',
      content: 'My distilled note:\n\n- Keep feedback loops short.',
    });

    expect(markdown).toBe(
      [
        '# Systems Thinking',
        '',
        '- 作者: Donella Meadows',
        '- 来源: https://example.com/systems',
        '',
        '> A system is an interconnected set of elements.',
        '',
        'My distilled note:',
        '',
        '- Keep feedback loops short.',
        '',
      ].join('\n'),
    );
  });

  it('formats WeRead book highlights and thoughts grouped by chapter order', () => {
    const detail: WeReadBookDetail = {
      book: {
        bookId: 'book_1',
        title: '思考，快与慢',
        author: '丹尼尔·卡尼曼',
        reviewCount: 2,
        noteCount: 2,
        bookmarkCount: 2,
        readingProgress: 0.5,
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      chapters: [
        { bookId: 'book_1', chapterUid: 20, chapterIdx: 2, title: '第二章 锚定效应', level: 1 },
        {
          bookId: 'book_1',
          chapterUid: 10,
          chapterIdx: 1,
          title: '第一章 系统一与系统二',
          level: 1,
        },
      ],
      highlights: [
        {
          bookmarkId: 'h_2',
          bookId: 'book_1',
          chapterUid: 20,
          range: '100-140',
          markText: '锚定效应非常顽固。',
          createTime: 2000,
        },
        {
          bookmarkId: 'h_1',
          bookId: 'book_1',
          chapterUid: 10,
          range: '10-30',
          markText: '系统一运行是无意识且快速的。',
          createTime: 1000,
        },
      ],
      thoughts: [
        {
          reviewId: 't_1',
          bookId: 'book_1',
          chapterUid: 10,
          range: '10-30',
          abstract: '系统一运行是无意识且快速的。',
          content: '写代码评审时也要防直觉误判。',
          createTime: 1005,
        },
        {
          reviewId: 't_book',
          bookId: 'book_1',
          content: '全书总结想法。',
          createTime: 3000,
        },
      ],
    };

    const markdown = formatWeReadBookMarkdown({ detail });

    expect(markdown).toBe(
      [
        '# 思考，快与慢',
        '',
        '- 作者: 丹尼尔·卡尼曼',
        '',
        '## 第一章 系统一与系统二',
        '',
        '> 系统一运行是无意识且快速的。',
        '',
        '- 写代码评审时也要防直觉误判。',
        '',
        '## 第二章 锚定效应',
        '',
        '> 锚定效应非常顽固。',
        '',
        '## 其他想法',
        '',
        '- 全书总结想法。',
        '',
      ].join('\n'),
    );
  });

  it('sanitizes markdown file names against path separators and invalid filename characters', () => {
    expect(sanitizeMarkdownFileName('  Notes: A/B\\C*?"<>|  ')).toBe('Notes A B C.md');
    expect(sanitizeMarkdownFileName('already.md')).toBe('already.md');
    expect(sanitizeMarkdownFileName('...   ...')).toBe('notes.md');
  });
});
