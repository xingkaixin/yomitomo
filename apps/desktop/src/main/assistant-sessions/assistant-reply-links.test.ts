import { describe, expect, it } from 'vitest';
import { resolveReplyLinks } from './assistant-reply-links';

describe('resolveReplyLinks', () => {
  it('turns paragraph and discussion citations into in-app links', () => {
    const text = resolveReplyLinks(
      '见[新版序言](#b2)，也见[另一条讨论](#comment_1)，[旧段落](#b9) 已不存在。',
      { text: '第一段。\n\n第二段讲选择压力。', sections: [] },
      (id) => (id === 'comment_1' ? 'annotation_1' : undefined),
    );

    expect(text).toBe(
      '见[新版序言](#passage:6-15)，也见[另一条讨论](#discussion:annotation_1)，旧段落 已不存在。',
    );
  });
});
