import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentMessagePayload, LlmProvider, PublicAgent } from '@yomitomo/shared';
import { readingPartnerSoul } from '@yomitomo/shared';
import {
  buildAgentMessageSystemPrompt,
  buildAgentPrompt,
  extractJsonObjects,
  parseAgentMentionInstructions,
  parseFocusCoReadingRouteResult,
  runAgentAnnotate,
} from './index';

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('parses focus co-reading routes against selected agents and sections', () => {
    const route = parseFocusCoReadingRouteResult(
      JSON.stringify({
        sections: [
          {
            sectionId: 'intro',
            summary: '作者铺垫问题背景',
            tag: '背景',
            agentIds: [
              'agent_lin',
              'missing',
              'agent_zhou',
              'agent_qin',
              'agent_shen',
              'agent_lin',
            ],
          },
          {
            sectionId: 'unknown',
            summary: '跳过',
            tag: '跳过',
            agentIds: ['agent_lin'],
          },
        ],
      }),
      {
        selectedAgentIds: ['agent_lin', 'agent_zhou', 'agent_qin', 'agent_shen'],
        article: {
          title: '代码审查',
          url: 'https://example.test/article',
          text: '代码审查是迭代过程。',
        },
        sections: [
          {
            sectionId: 'intro',
            sectionTitle: '引文',
            sectionStart: 0,
            sectionEnd: 10,
          },
        ],
      },
      [
        { id: 'agent_lin' },
        { id: 'agent_zhou' },
        { id: 'agent_qin' },
        { id: 'agent_shen' },
      ] as Pick<Agent, 'id'>[],
    );

    expect(route).toEqual({
      sections: [
        {
          sectionId: 'intro',
          summary: '作者铺垫问题背景',
          tag: '背景',
          agentIds: ['agent_lin', 'agent_zhou', 'agent_qin', 'agent_shen'],
        },
      ],
    });
  });
});

describe('agent annotations', () => {
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
  const agent: Agent = {
    id: 'agent_lin',
    kind: 'annotation',
    providerId: 'provider_1',
    enabled: true,
    nickname: '林知微',
    username: '林知微',
    avatar: '',
    annotationColor: '#6fa48f',
    annotationDensity: 'medium',
    temperature: 0.35,
    soul: readingPartnerSoul,
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  };

  it('caps short article output for a single assistant', async () => {
    const content = JSON.stringify([
      { exact: '第一句很短', type: 'key_point', comment: '一' },
      { exact: '第二句也短', type: 'key_point', comment: '二' },
      { exact: '第三句继续短', type: 'key_point', comment: '三' },
    ]);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
      );

    const annotations = await runAgentAnnotate(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      article: {
        title: '短文',
        url: 'https://example.test/article',
        text: '第一句很短。第二句也短。第三句继续短。',
      },
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(requestBody.messages[1]?.content).toContain('最多 1 条');
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.anchor.exact).toBe('第一句很短');
  });
});
