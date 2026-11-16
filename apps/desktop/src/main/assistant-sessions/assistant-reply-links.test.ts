import { describe, expect, it } from 'vitest';
import { buildEpubBookIndex } from '@yomitomo/core';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import {
  resolveArticleReplyLinks,
  resolveReplyLinks,
  type ReplyDiscussion,
} from './assistant-reply-links';

const snapshot = { text: '第一段。\n\n游戏#1：搞笑版', sections: [] };
const findDiscussion = (id: string): ReplyDiscussion | undefined => {
  if (id === 'comment_1' || id === 'annotation_1') {
    return {
      annotationId: 'annotation_1',
      quote: '一句话故事的四个要素',
      anchor: { exact: '第一段。', prefix: '', suffix: '', start: 0, end: 4 },
    };
  }
  if (id === 'comment_future' || id === 'annotation_future') {
    return {
      annotationId: 'annotation_future',
      quote: '后章秘密剧透',
      anchor: { exact: '游戏#1：搞笑版', prefix: '', suffix: '', start: 6, end: 14 },
    };
  }
  return undefined;
};

describe('resolveReplyLinks', () => {
  it('replaces paragraph ids embedded in link labels, including saved links', () => {
    expect(
      resolveReplyLinks(
        '见[第 b2 段](#b2)，以及[段落 b1–b2](#passage:0-14)，[序言](#passage:0-4)。',
        snapshot,
        findDiscussion,
      ),
    ).toBe(
      '见[「游戏#1：搞笑版」](#passage:6-14)，以及[「第一段。 游戏#1：搞笑版」](#passage:0-14)，[序言](#passage:0-4)。',
    );
  });

  it('turns paragraph ranges into one source link with a readable label', () => {
    expect(
      resolveReplyLinks('b1-b2、B1–B2、[b1-b2]、[两段证据](#b1-b2)', snapshot, findDiscussion),
    ).toBe(
      '[「第一段。」](#passage:0-14)、[「第一段。」](#passage:0-14)、[「第一段。」](#passage:0-14)、[两段证据](#passage:0-14)',
    );
  });

  it('turns paragraph and discussion links into in-app links', () => {
    const text = resolveReplyLinks(
      '见[小标题](#b2)，也见[另一条讨论](#comment_1)，[旧段落](#b9) 已不存在。',
      snapshot,
      findDiscussion,
    );

    expect(text).toBe(
      '见[小标题](#passage:6-14)，也见[另一条讨论](#discussion:annotation_1)，旧段落 已不存在。',
    );
  });

  it('labels bare and bracketed ids with the text they cite', () => {
    const text = resolveReplyLinks(
      '原文在 b2 只给了标题，[b1] 到 [b2](#b2) 之间，批注 comment_1 也提到，b9 和 web3 不变。',
      snapshot,
      findDiscussion,
    );

    expect(text).toBe(
      '原文在 [「游戏#1：搞笑版」](#passage:6-14) 只给了标题，[「第一段。」](#passage:0-4) 到 ' +
        '[「游戏#1：搞笑版」](#passage:6-14) 之间，批注 [「一句话故事的四个要素」](#discussion:annotation_1) 也提到，' +
        'b9 和 web3 不变。',
    );
  });

  it('does not resolve out-of-range passages or discussions when visibleRanges is set', () => {
    const text = resolveReplyLinks(
      '可读 b1 和 comment_1；超范围 b2、[后章](#b2)、b1-b2、comment_future、[后章讨论](#comment_future)、[剧透](#passage:6-14)、[剧透讨论](#discussion:annotation_future)。',
      snapshot,
      findDiscussion,
      [{ textStart: 0, textEnd: 4 }],
    );

    expect(text).toBe(
      '可读 [「第一段。」](#passage:0-4) 和 [「一句话故事的四个要素」](#discussion:annotation_1)；' +
        '超范围 b2、后章、b1-b2、comment_future、后章讨论、剧透、剧透讨论。',
    );
    expect(text).not.toContain('游戏#1：搞笑版');
    expect(text).not.toContain('后章秘密剧透');
    expect(text).not.toContain('#passage:6-14');
    expect(text).not.toContain('#discussion:annotation_future');
  });

  it('keeps future references restricted when reopening an EPUB annotation', () => {
    const timestamp = '2026-08-01T00:00:00.000Z';
    const annotation: Annotation = {
      id: 'annotation_1',
      anchor: findDiscussion('annotation_1')!.anchor!,
      author: { kind: 'user', username: 'reader' },
      color: '#888888',
      createdAt: timestamp,
      updatedAt: timestamp,
      comments: [
        {
          id: 'comment_agent',
          author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
          content: resolveReplyLinks('见 b1、b2 和 comment_future', snapshot, findDiscussion, [
            { textStart: 0, textEnd: 4 },
          ]),
          createdAt: timestamp,
        },
      ],
    };
    const article: ArticleRecord = {
      id: 'book',
      url: 'local://book',
      canonicalUrl: 'local://book',
      title: 'Book',
      sourceType: 'ebook',
      contentHash: 'book',
      createdAt: timestamp,
      updatedAt: timestamp,
      ebook: {
        metadata: { format: 'epub', fileName: 'book.epub', fileSize: 1 },
        chapters: [],
        index: buildEpubBookIndex({
          articleId: 'book',
          chapters: [
            { id: 'c1', title: 'First', paragraphs: ['第一段。'] },
            { id: 'c2', title: 'Future', paragraphs: ['游戏#1：搞笑版'] },
          ],
        }),
      },
      annotations: [
        annotation,
        {
          ...annotation,
          id: 'annotation_future',
          anchor: findDiscussion('annotation_future')!.anchor!,
          comments: [{ ...annotation.comments[0], id: 'comment_future', content: '后章讨论' }],
        },
      ],
    };

    const reopened = resolveArticleReplyLinks(article, snapshot);
    expect(reopened.annotations[0].comments[0].content).toBe(annotation.comments[0].content);
  });
});
