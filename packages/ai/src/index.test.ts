import { describe, expect, it } from 'vitest';
import type { AgentMessagePayload, LlmProvider, PublicAgent } from '@yomitomo/shared';
import { readingPartnerSoul } from '@yomitomo/shared';
import {
  buildAgentMessageSystemPrompt,
  buildAgentPrompt,
  extractJsonObjects,
  parseAgentMentionInstructions,
} from './index';

describe('extractJsonObjects', () => {
  it('extracts pretty-printed objects from a stream buffer', () => {
    const result = extractJsonObjects(`{
  "exact": "target",
  "prefix": "before",
  "suffix": "after",
  "type": "quote",
  "comment": "note"
}
{
  "exact": "next"`);

    expect(result.objects).toEqual([
      `{
  "exact": "target",
  "prefix": "before",
  "suffix": "after",
  "type": "quote",
  "comment": "note"
}`,
    ]);
    expect(result.rest).toBe(`{
  "exact": "next"`);
  });

  it('keeps braces inside strings as content', () => {
    const result = extractJsonObjects(
      '{"exact":"target","comment":"use {literal} braces and \\"quotes\\""}',
    );

    expect(result.objects).toHaveLength(1);
    expect(JSON.parse(result.objects[0])).toEqual({
      exact: 'target',
      comment: 'use {literal} braces and "quotes"',
    });
    expect(result.rest).toBe('');
  });
});

describe('agent message prompts', () => {
  const provider: LlmProvider = {
    id: 'provider_1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://example.test',
    apiKey: 'key',
    modelName: 'model',
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  };
  const lin: PublicAgent = {
    id: 'agent_lin',
    kind: 'annotation',
    enabled: true,
    nickname: '林知微',
    username: '林知微',
    avatar: '',
    annotationColor: '#6fa48f',
    annotationDensity: 'medium',
    personalityName: '林知微',
    temperature: 0.35,
  };
  const zhou: PublicAgent = {
    ...lin,
    id: 'agent_zhou',
    nickname: '周砚',
    username: '周砚',
    personalityName: '周砚',
  };
  const payload: AgentMessagePayload = {
    agentId: lin.id,
    agentUsername: lin.username,
    agentRoster: [lin, zhou],
    article: {
      title: '代码审查',
      url: 'https://example.test/article',
      text: '代码审查是迭代过程。',
    },
    annotation: {
      id: 'annotation_1',
      author: 'ai',
      agentId: lin.id,
      agentUsername: lin.username,
      agentNickname: lin.nickname,
      color: '#6fa48f',
      anchor: {
        exact: '代码审查是迭代过程',
        prefix: '',
        suffix: '',
        start: 0,
        end: 10,
      },
      comments: [
        {
          id: 'comment_1',
          author: 'ai',
          agentId: lin.id,
          agentUsername: lin.username,
          agentNickname: lin.nickname,
          content: '这里的关键在于迭代。',
          createdAt: '2026-05-07T00:00:00.000Z',
        },
      ],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    },
    userComment: {
      id: 'comment_2',
      author: 'user',
      userUsername: 'xingkaixin',
      userNickname: '行开心',
      content: '@周砚 你同意 @林知微 的看法么？',
      createdAt: '2026-05-07T00:01:00.000Z',
    },
  };

  it('anchors the current agent identity in the system prompt', () => {
    const prompt = buildAgentMessageSystemPrompt(
      {
        presetId: 'reading-partner',
        soul: readingPartnerSoul,
        username: lin.username,
        nickname: lin.nickname,
      },
      payload,
    );

    expect(prompt).toContain('## 角色卡');
    expect(prompt).toContain('- 身份摘要：安静陪读，帮你把原文、上下文和读者问题稳稳接起来。');
    expect(prompt).toContain('你好，我是知微。');
    expect(prompt).toContain('## 角色灵魂');
    expect(prompt).toContain('你就是 林知微（@林知微）');
    expect(prompt).toContain('当前讨论里出现 林知微、@林知微 时，按你本人理解。');
    expect(prompt).toContain('涉及自己的判断时，用自然的第一人称承接');
    expect(prompt).toContain('角色卡中的自我介绍、核心气质、判断习惯和输出偏好');
  });

  it('includes assistant handles in the discussion context', () => {
    const prompt = buildAgentPrompt(provider, payload, lin);

    expect(prompt).toContain('- 林知微（@林知微）：当前发言助手');
    expect(prompt).toContain('- 周砚（@周砚）：可被 @ 的伴读助手');
    expect(prompt).toContain('本轮发言者：林知微（@林知微）');
    expect(prompt).toContain('读者评论里的 林知微、@林知微 指向你本人。');
    expect(prompt).toContain('涉及自己的判断时，用自然的第一人称承接');
  });

  it('parses per-agent mention instructions', () => {
    const instructions = parseAgentMentionInstructions(
      JSON.stringify([
        {
          agentUsername: '林知微',
          instruction: '解释这个概念',
          readingIntent: 'explain',
        },
      ]),
      [lin, zhou],
    );

    expect(instructions).toEqual([
      {
        agentId: lin.id,
        agentUsername: lin.username,
        instruction: '解释这个概念',
        readingIntent: 'explain',
      },
      {
        agentId: zhou.id,
        agentUsername: zhou.username,
      },
    ]);
  });
});
