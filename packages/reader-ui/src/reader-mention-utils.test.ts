import { describe, expect, it } from 'vitest';
import type { MentionQuery } from '@yomitomo/core';
import type { PublicAgent } from '@yomitomo/shared';
import {
  hasMatchedAgentMention,
  matchesAgentMentionQuery,
  mentionChipSegments,
  mentionDraftWithAgent,
  type MentionChipSegment,
} from './reader-mention-utils';

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

  it('splits matched username mentions into agent chip segments', () => {
    const zhou = agent({
      id: 'agent_2',
      nickname: '周砚',
      username: 'zhouyan',
    });

    expect(
      segmentSnapshot(mentionChipSegments('问 @linzhiwei 和 @zhouyan', [agent(), zhou])),
    ).toEqual([
      { type: 'text', text: '问 ' },
      { type: 'agent', text: '@linzhiwei', source: 'mention', username: 'linzhiwei' },
      { type: 'text', text: ' 和 ' },
      { type: 'agent', text: '@zhouyan', source: 'mention', username: 'zhouyan' },
    ]);
  });

  it('keeps unmatched handles as plain text', () => {
    expect(segmentSnapshot(mentionChipSegments('问 @unknown', [agent()]))).toEqual([
      { type: 'text', text: '问 @unknown' },
    ]);
  });

  it('matches confirmed assistant names only when enabled', () => {
    const zhou = agent({
      id: 'agent_2',
      nickname: '周砚',
      username: 'zhouyan',
    });

    expect(segmentSnapshot(mentionChipSegments('林知微提到了周砚', [agent(), zhou]))).toEqual([
      { type: 'text', text: '林知微提到了周砚' },
    ]);
    expect(
      segmentSnapshot(
        mentionChipSegments('林知微提到了周砚', [agent(), zhou], { includeNameMatches: true }),
      ),
    ).toEqual([
      { type: 'agent', text: '林知微', source: 'name', username: 'linzhiwei' },
      { type: 'text', text: '提到了' },
      { type: 'agent', text: '周砚', source: 'name', username: 'zhouyan' },
    ]);
  });

  it('does not match ambiguous assistant names', () => {
    const duplicate = agent({
      id: 'agent_2',
      username: 'another-lin',
    });

    expect(
      segmentSnapshot(
        mentionChipSegments('林知微正在回复', [agent(), duplicate], { includeNameMatches: true }),
      ),
    ).toEqual([{ type: 'text', text: '林知微正在回复' }]);
  });

  it('uses the longest assistant name at the same position', () => {
    const shortName = agent({
      id: 'agent_2',
      nickname: '林知',
      username: 'linzhi',
    });
    const longName = agent({
      id: 'agent_3',
      nickname: '林知微',
      username: 'linzhiwei-v2',
    });

    expect(
      segmentSnapshot(
        mentionChipSegments('林知微正在回复', [shortName, longName], { includeNameMatches: true }),
      ),
    ).toEqual([
      { type: 'agent', text: '林知微', source: 'name', username: 'linzhiwei-v2' },
      { type: 'text', text: '正在回复' },
    ]);
  });

  it('checks explicit agent mentions without name fallback', () => {
    expect(hasMatchedAgentMention('请 @linzhiwei 看看', [agent()])).toBe(true);
    expect(hasMatchedAgentMention('请 林知微 看看', [agent()])).toBe(false);
  });
});

function segmentSnapshot(segments: MentionChipSegment[]) {
  return segments.map((segment) =>
    segment.type === 'text'
      ? { type: segment.type, text: segment.text }
      : {
          type: segment.type,
          text: segment.text,
          source: segment.source,
          username: segment.agent.username,
        },
  );
}
