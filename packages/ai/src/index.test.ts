import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentMessagePayload, LlmProvider, PublicAgent } from '@yomitomo/shared';
import { readingPartnerSoul } from '@yomitomo/shared';
import { buildEpubBookIndex, createEpubTextAnchor, epubIndexText } from '@yomitomo/core';
import {
  buildAgentMessageSystemPrompt,
  buildAgentPrompt,
  extractJsonObjects,
  parseAgentMentionInstructions,
  parseFocusCoReadingRouteResult,
  planFocusCoReadingRoute,
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

  it('uses thread-first context for epub annotation replies', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['已读背景。'] },
      {
        id: 'chapter-2',
        title: '第二章',
        paragraphs: [
          '第二章开头。',
          '选区前文。目标观点需要局部上下文。选区后文。',
          '第二章未读后续。',
        ],
      },
      { id: 'chapter-3', title: '第三章', paragraphs: ['未来章节不应出现。'] },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const start = text.indexOf('目标观点');
    const anchor = createEpubTextAnchor(ebookIndex, text, start, start + '目标观点'.length);
    const userComment = {
      id: 'comment_latest',
      author: 'user' as const,
      userUsername: 'xingkaixin',
      userNickname: '行开心',
      content: '@林知微 这和前文矛盾吗？',
      createdAt: '2026-05-13T00:02:00.000Z',
    };
    const prompt = buildAgentPrompt(
      provider,
      {
        ...payload,
        article: {
          title: '长书',
          url: 'ebook://book-1',
          text,
          ebookIndex,
        },
        annotation: {
          ...payload.annotation,
          anchor,
          comments: [
            {
              id: 'comment_original',
              author: 'ai',
              agentId: lin.id,
              agentUsername: lin.username,
              agentNickname: lin.nickname,
              content: '原批注：这句话是本段关键。',
              createdAt: '2026-05-13T00:00:00.000Z',
            },
            userComment,
          ],
        },
        userComment,
      },
      lin,
    );

    expect(prompt).toContain('thread-first 上下文');
    expect(prompt).toContain('"chapterId": "chapter-2"');
    expect(prompt).toContain('目标观点');
    expect(prompt).toContain('选区前文。');
    expect(prompt).toContain('原批注：这句话是本段关键。');
    expect(prompt).toContain('"source": "latest-user-comment"');
    expect(prompt).toContain('@林知微 这和前文矛盾吗？');
    expect(prompt).toContain('回复必须回到 thread-first 上下文中的原文依据');
    expect(prompt).not.toContain('可用原文范围');
    expect(prompt).not.toContain('未来章节不应出现。');
  });

  it('clips long epub thread history before prompting', () => {
    const chapters = [{ id: 'chapter-1', title: '第一章', paragraphs: ['目标观点。'] }];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const anchor = createEpubTextAnchor(ebookIndex, text, 0, '目标观点'.length);
    const userComment = {
      id: 'comment_latest',
      author: 'user' as const,
      userUsername: 'xingkaixin',
      userNickname: '行开心',
      content: '@林知微 最晚追问',
      createdAt: '2026-05-13T00:20:00.000Z',
    };
    const comments = [
      {
        id: 'comment_original',
        author: 'ai' as const,
        agentId: lin.id,
        agentUsername: lin.username,
        agentNickname: lin.nickname,
        content: '原始批注需要保留',
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `comment_history_${index + 1}`,
        author: 'user' as const,
        userUsername: 'xingkaixin',
        userNickname: '行开心',
        content: `历史评论 ${index + 1}`,
        createdAt: `2026-05-13T00:${String(index + 1).padStart(2, '0')}:00.000Z`,
      })),
      userComment,
    ];
    const prompt = buildAgentPrompt(
      provider,
      {
        ...payload,
        article: {
          title: '长书',
          url: 'ebook://book-1',
          text,
          ebookIndex,
        },
        annotation: { ...payload.annotation, anchor, comments },
        userComment,
      },
      lin,
    );

    expect(prompt).toContain('原始批注需要保留');
    expect(prompt).toContain('历史评论 12');
    expect(prompt).toContain('@林知微 最晚追问');
    expect(prompt).not.toContain('历史评论 2');
  });

  it('falls back to anchor context when epub thread location cannot be resolved', () => {
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters: [] });
    const userComment = {
      id: 'comment_latest',
      author: 'user' as const,
      userUsername: 'xingkaixin',
      userNickname: '行开心',
      content: '@林知微 继续解释一下',
      createdAt: '2026-05-13T00:02:00.000Z',
    };
    const prompt = buildAgentPrompt(
      provider,
      {
        ...payload,
        article: {
          title: '旧书',
          url: 'ebook://legacy',
          text: '正文已经变化',
          ebookIndex,
        },
        annotation: {
          ...payload.annotation,
          anchor: {
            exact: '失效选区',
            prefix: '前缀上下文',
            suffix: '后缀上下文',
            start: 0,
            end: 4,
          },
          comments: [userComment],
        },
        userComment,
      },
      lin,
    );

    expect(prompt).toContain('thread-first 上下文');
    expect(prompt).toContain('前缀上下文');
    expect(prompt).toContain('失效选区');
    expect(prompt).toContain('后缀上下文');
    expect(prompt).toContain('"source": "anchor-context"');
  });

  it('keeps the article-text fallback for non-epub annotation replies', () => {
    const prompt = buildAgentPrompt(provider, payload, lin);

    expect(prompt).toContain('可用原文范围');
    expect(prompt).toContain('代码审查是迭代过程。');
    expect(prompt).toContain('当前批注讨论');
    expect(prompt).not.toContain('thread-first 上下文');
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

  it('routes epub chapters from descriptors without injecting full book text', async () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '开场',
        paragraphs: ['开头预览说明问题。', '隐秘中段正文不应该进入路由 prompt。', '开场结尾预览。'],
      },
      {
        id: 'chapter-2',
        title: '反驳',
        paragraphs: [
          '反驳章节开头。',
          '第二章中段完整论证不应该进入路由 prompt。',
          '反驳章节结尾。',
        ],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const content = JSON.stringify({
      sections: [
        {
          sectionId: 'toc-1',
          summary: '这一章负责提出反驳。',
          tag: '反驳',
          assignedAgentIds: ['agent_lin', 'missing'],
          targetDensity: 'high',
          needsFurtherPlanning: true,
        },
      ],
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
      );

    const route = await planFocusCoReadingRoute(
      provider,
      {
        selectedAgentIds: ['agent_lin'],
        chapterSummaries: [
          {
            sectionId: 'toc-1',
            summary: '已有摘要：反驳上一章的核心假设。',
            tag: '已有反驳',
          },
        ],
        article: {
          title: '长书',
          url: 'ebook://book-1',
          text,
          ebookIndex,
          ebookMetadata: {
            format: 'epub',
            fileName: 'book.epub',
            fileSize: 12,
            language: 'zh-CN',
          },
        },
        sections: [
          {
            sectionId: 'toc-0',
            sectionTitle: '开场',
            sectionStart: ebookIndex.chapters[0]!.textStart,
            sectionEnd: ebookIndex.chapters[0]!.textEnd,
          },
          {
            sectionId: 'toc-1',
            sectionTitle: '反驳',
            sectionStart: ebookIndex.chapters[1]!.textStart,
            sectionEnd: ebookIndex.chapters[1]!.textEnd,
          },
        ],
      },
      [routeAgent('agent_lin', '林知微')],
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = requestBody.messages[1]?.content || '';
    expect(prompt).toContain('章节 descriptors');
    expect(prompt).toContain('"chapterId": "chapter-2"');
    expect(prompt).toContain('反驳章节开头。');
    expect(prompt).toContain('反驳章节结尾。');
    expect(prompt).toContain('已有摘要：反驳上一章的核心假设。');
    expect(prompt).not.toContain('隐秘中段正文不应该进入路由 prompt。');
    expect(prompt).not.toContain('第二章中段完整论证不应该进入路由 prompt。');
    expect(route.sections).toEqual([
      {
        sectionId: 'toc-1',
        summary: '这一章负责提出反驳。',
        tag: '反驳',
        targetDensity: 'high',
        needsFurtherPlanning: true,
        agentIds: ['agent_lin'],
      },
    ]);
  });

  it('keeps long epub tables of contents descriptor-only', async () => {
    const chapters = Array.from({ length: 80 }, (_, index) => ({
      id: `chapter-${index + 1}`,
      title: `第 ${index + 1} 章`,
      paragraphs: [
        `第 ${index + 1} 章 preview。`,
        `第 ${index + 1} 章 middle body secret。`,
        `第 ${index + 1} 章 ending preview。`,
      ],
    }));
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"sections":[]}' } }] }), {
        status: 200,
      }),
    );

    await planFocusCoReadingRoute(
      provider,
      {
        selectedAgentIds: ['agent_lin'],
        article: {
          title: '长目录书',
          url: 'ebook://book-1',
          text,
          ebookIndex,
        },
        sections: ebookIndex.chapters.map((chapter) => ({
          sectionId: chapter.id,
          sectionTitle: chapter.title,
          sectionStart: chapter.textStart,
          sectionEnd: chapter.textEnd,
        })),
      },
      [routeAgent('agent_lin', '林知微')],
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = requestBody.messages[1]?.content || '';
    expect(prompt).toContain('"chapterId": "chapter-80"');
    expect(prompt).toContain('第 80 章 preview。');
    expect(prompt).toContain('第 80 章 ending preview。');
    expect(prompt).not.toContain('第 80 章 middle body secret。');
  });

  it('falls back when epub has no toc sections or chapter titles', async () => {
    const content = JSON.stringify({
      sections: [
        {
          sectionId: 'chapter-1',
          summary: '缺标题章节。',
          tag: '缺标题',
          agentIds: ['agent_lin'],
        },
      ],
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
      );

    await planFocusCoReadingRoute(
      provider,
      {
        selectedAgentIds: ['agent_lin'],
        article: {
          title: '无目录书',
          url: 'ebook://book-1',
          text: 'full body should not be routed',
          ebookIndex: {
            version: 1,
            articleId: 'book-1',
            textLength: 120,
            chapters: [
              {
                id: 'chapter-1',
                title: '',
                indexInBook: 0,
                textStart: 0,
                textEnd: 120,
                textLength: 120,
                previewStart: '缺标题章节开头。',
                previewEnd: '缺标题章节结尾。',
                segmentIds: [],
                paragraphIds: [],
              },
            ],
            segments: [],
            paragraphs: [],
          },
        },
        sections: [],
      },
      [routeAgent('agent_lin', '林知微')],
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = requestBody.messages[1]?.content || '';
    expect(prompt).toContain('"sectionId": "chapter-1"');
    expect(prompt).toContain('"chapterTitle": "第 1 章"');
    expect(prompt).toContain('缺标题章节开头。');
    expect(prompt).not.toContain('full body should not be routed');
  });

  it('clips overlong epub chapter previews before routing', async () => {
    const previewStart = '超长开头'.repeat(80);
    const previewEnd = '超长结尾'.repeat(80);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"sections":[]}' } }] }), {
        status: 200,
      }),
    );

    await planFocusCoReadingRoute(
      provider,
      {
        selectedAgentIds: ['agent_lin'],
        article: {
          title: '超长预览书',
          url: 'ebook://book-1',
          text: `${previewStart}\n${previewEnd}`,
          ebookIndex: {
            version: 1,
            articleId: 'book-1',
            textLength: 600,
            chapters: [
              {
                id: 'chapter-1',
                title: '超长章节',
                indexInBook: 0,
                textStart: 0,
                textEnd: 600,
                textLength: 600,
                previewStart,
                previewEnd,
                segmentIds: [],
                paragraphIds: [],
              },
            ],
            segments: [],
            paragraphs: [],
          },
        },
        sections: [],
      },
      [routeAgent('agent_lin', '林知微')],
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = requestBody.messages[1]?.content || '';
    expect(prompt).toContain(`${previewStart.slice(0, 180)}…`);
    expect(prompt).not.toContain(previewStart);
    expect(prompt).not.toContain(previewEnd);
  });
});

function routeAgent(id: string, username: string): Agent {
  return {
    id,
    kind: 'annotation',
    providerId: 'provider_1',
    enabled: true,
    nickname: username,
    username,
    avatar: '',
    annotationColor: '#6fa48f',
    annotationDensity: 'medium',
    temperature: 0.35,
    soul: readingPartnerSoul,
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  };
}

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

  it('scopes ebook target annotations to the current chapter read range', async () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['第一章已读背景。'],
      },
      {
        id: 'chapter-2',
        title: '第二章',
        paragraphs: ['第二章开头。', '第二章已读论证。', '第二章未读反转。'],
      },
      {
        id: 'chapter-3',
        title: '第三章',
        paragraphs: ['第三章未来剧情。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const start = text.indexOf('第二章已读论证');
    const anchor = createEpubTextAnchor(ebookIndex, text, start, start + '第二章已读论证'.length);
    const content = JSON.stringify([{ exact: '第二章开头', type: 'key_point', comment: '一' }]);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
      );

    const annotations = await runAgentAnnotate(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      targetAnchor: anchor,
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = requestBody.messages[1]?.content || '';
    expect(prompt).toContain('第二章开头。');
    expect(prompt).toContain('第二章已读论证');
    expect(prompt).not.toContain('第二章未读反转。');
    expect(prompt).not.toContain('第三章未来剧情。');
    expect(annotations[0]?.anchor.exact).toBe('第二章已读论证');
  });

  it('scopes ebook reading plan annotations to read-so-far evidence', async () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['第一章已读背景。'],
      },
      {
        id: 'chapter-2',
        title: '第二章',
        paragraphs: ['第二章开头。', '第二章已读论证。', '第二章未读反转。'],
      },
      {
        id: 'chapter-3',
        title: '第三章',
        paragraphs: ['第三章未来剧情。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const sectionStart = text.indexOf('第二章开头');
    const sectionEnd = text.indexOf('第二章未读反转');
    const content = JSON.stringify([{ exact: '第二章已读论证', type: 'key_point', comment: '一' }]);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
      );

    await runAgentAnnotate(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      readingPlan: [
        {
          sectionId: 'chapter-2-segment-1',
          sectionTitle: '第二章',
          sectionStart,
          sectionEnd,
        },
      ],
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = requestBody.messages[1]?.content || '';
    expect(prompt).toContain('第一章已读背景。');
    expect(prompt).toContain('第二章已读论证。');
    expect(prompt).not.toContain('第二章未读反转。');
    expect(prompt).not.toContain('第三章未来剧情。');
  });
});
