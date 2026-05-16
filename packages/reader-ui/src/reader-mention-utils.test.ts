import { describe, expect, it } from 'vitest';
import type { MentionQuery } from '@yomitomo/core';
import type { PublicAgent } from '@yomitomo/shared';
import { matchesAgentMentionQuery, mentionDraftWithAgent } from './reader-mention-utils';

function agent(overrides: Partial<PublicAgent> = {}): PublicAgent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    enabled: true,
    nickname: '林知微',
    username: 'linzhiwei',
    pinyin: 'lin zhi wei',
    avatar: '',
    annotationColor: '#54cda0',
    annotationDensity: 'medium',
    personalityName: '林知微',
    temperature: 0.3,
    ...overrides,
  };
}

describe('reader mention utils', () => {
  it('replaces the mention query under the caret', () => {
    const query: MentionQuery = { query: 'lin', start: 2, end: 6 };

    expect(mentionDraftWithAgent('问 @lin 今天', 'linzhiwei', query)).toEqual({
      content: '问 @linzhiwei  今天',
      caretIndex: 13,
    });
  });

  it('appends a mention when no query is active', () => {
    expect(mentionDraftWithAgent('已有内容  ', 'linzhiwei', null)).toEqual({
      content: '已有内容 @linzhiwei ',
      caretIndex: 16,
    });
  });

  it('matches username, nickname and pinyin without spaces', () => {
    const target = agent();

    expect(matchesAgentMentionQuery(target, 'lin')).toBe(true);
    expect(matchesAgentMentionQuery(target, '知微')).toBe(true);
    expect(matchesAgentMentionQuery(target, 'linzhi')).toBe(true);
    expect(matchesAgentMentionQuery(target, 'zhou')).toBe(false);
  });
});
