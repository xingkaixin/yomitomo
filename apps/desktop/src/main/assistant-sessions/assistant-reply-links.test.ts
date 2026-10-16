import { describe, expect, it } from 'vitest';
import { resolveReplyLinks } from './assistant-reply-links';

const snapshot = { text: '第一段。\n\n游戏#1：搞笑版', sections: [] };
const findDiscussion = (id: string) =>
  id === 'comment_1' ? { annotationId: 'annotation_1', quote: '一句话故事的四个要素' } : undefined;

describe('resolveReplyLinks', () => {
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
});
