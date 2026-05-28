import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentMessagePayload,
  Annotation,
  LlmProvider,
  PublicAgent,
  ReadingMemoryEntry,
} from '@yomitomo/shared';
import { readingPartnerSoul } from '@yomitomo/shared';
import {
  buildEpubBookIndex,
  createEpubTextAnchor,
  epubIndexText,
  readingMemoryCorrectionEntry,
  readingMemoryFromEntries,
} from '@yomitomo/core';
import {
  buildAgentMessageSystemPrompt,
  buildAgentPrompt,
  extractJsonObjects,
  parseAgentMentionInstructions,
  parseAgentMentionRoutePlan,
  runAgentAnnotate,
  runAgentAnnotateWithMemory,
} from './index';

afterEach(() => {
  vi.restoreAllMocks();
});

function requestBodyText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

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

  it('guards historical claims in plain thread replies', () => {
    const system = buildAgentMessageSystemPrompt(
      {
        presetId: 'reading-partner',
        soul: readingPartnerSoul,
        username: lin.username,
        nickname: lin.nickname,
      },
      payload,
    );
    const prompt = buildAgentPrompt(provider, payload, lin);

    expect(system).toContain('只有当前 thread 或 memory_view 明确提供了对应内容时');
    expect(system).toContain('没有证据时，直接说明当前上下文里没有看到这类历史记录');
    expect(prompt).toContain('历史断言规则');
    expect(prompt).toContain('才能说“我之前批注过”“我之前说过”或“其他助手批注过”');
  });

  it('builds a thought review prompt with all thoughts and the target thought', () => {
    const reviewer: PublicAgent = {
      ...lin,
      id: 'review_liang',
      kind: 'review',
      nickname: '梁证言',
      username: '梁证言',
      personalityName: '梁证言',
    };
    const targetThought = {
      ...payload.annotation.comments[0],
      id: 'thought_target',
      content: '这里的判断可能缺少直接证据。',
    };
    const otherThought = {
      id: 'thought_other',
      author: 'user' as const,
      userUsername: 'xingkaixin',
      userNickname: '行开心',
      content: '我更关心这个判断能不能落到行动。',
      createdAt: '2026-05-07T00:02:00.000Z',
    };
    const reply = {
      ...otherThought,
      id: 'reply_other',
      content: '行动前需要先补证据。',
      replyTo: otherThought.id,
    };
    const prompt = buildAgentPrompt(
      provider,
      {
        ...payload,
        agentId: reviewer.id,
        agentUsername: reviewer.username,
        reviewTargetCommentId: targetThought.id,
        annotation: {
          ...payload.annotation,
          comments: [targetThought, otherThought, reply],
        },
        userComment: targetThought,
      },
      reviewer,
    );

    expect(prompt).toContain('批注中的全部想法');
    expect(prompt).toContain('1. 林知微 (@林知微): 这里的判断可能缺少直接证据。');
    expect(prompt).toContain('2. 行开心 (@xingkaixin): 我更关心这个判断能不能落到行动。');
    expect(prompt).toContain('回复 行开心 (@xingkaixin): 行动前需要先补证据。');
    expect(prompt).toContain('审阅目标想法');
    expect(prompt).toContain('第一句话以【审阅】开头');
    expect(prompt).not.toContain('刚刚触发你的读者评论');
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

  it('includes memory view blocks in epub thread-first context', () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['选区前文。目标观点需要局部上下文。选区后文。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const start = text.indexOf('目标观点');
    const anchor = createEpubTextAnchor(ebookIndex, text, start, start + '目标观点'.length);
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
        },
        readingMemoryView: {
          articleId: 'book-1',
          viewType: 'selection_thread',
          viewKey: 'selection_thread:chapter-1::0:4',
          sourceEntryIds: ['comment_memory_comment_1'],
          updatedAt: '2026-05-26T00:00:00.000Z',
          entries: [
            {
              source: 'structured',
              entry: {
                id: 'comment_memory_comment_1',
                articleId: 'book-1',
                kind: 'reader_signal',
                scope: 'reader',
                visibility: 'default',
                payloadVersion: 1,
                textRange: { textStart: start, textEnd: start + '目标观点'.length },
                sourceType: 'comment',
                sourceCommentId: 'comment_1',
                sourceEntryIds: [],
                payload: {
                  source: 'comment',
                  author: 'user',
                  content: '用户之前问过目标观点的证据缺口',
                },
                createdAt: '2026-05-26T00:00:00.000Z',
                updatedAt: '2026-05-26T00:00:00.000Z',
              },
            },
          ],
        },
      },
      lin,
    );

    expect(prompt).toContain('thread-first 上下文');
    expect(prompt).toContain('"type": "memory_view"');
    expect(prompt).toContain('用户之前问过目标观点的证据缺口');
    expect(prompt).toContain('不能覆盖当前 thread');
    expect(prompt).toContain('只有 thread 或 memory_view 明确提供证据时');
  });

  it('adds current-chapter lexical passages to epub thread context', () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: [
          '人口红利在本章开头被定义为劳动力供给优势。',
          '过渡段落。',
          '另一个局部段落。',
          '目标观点讨论选择压力。',
        ],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const start = text.indexOf('目标观点');
    const anchor = createEpubTextAnchor(ebookIndex, text, start, start + '目标观点'.length);
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
          comments: [],
        },
        userComment: {
          ...payload.userComment,
          content: '@林知微 这里的人口红利前面怎么说的？',
        },
      },
      lin,
    );

    expect(prompt).toContain('"source": "current-chapter-lexical"');
    expect(prompt).toContain('人口红利在本章开头被定义为劳动力供给优势。');
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

  it('includes memory view blocks in non-epub thread replies', () => {
    const prompt = buildAgentPrompt(
      provider,
      {
        ...payload,
        readingMemoryView: {
          articleId: 'article_1',
          viewType: 'selection_thread',
          viewKey: 'selection_thread:::0:10',
          sourceEntryIds: ['comment_memory_comment_1'],
          updatedAt: '2026-05-26T00:00:00.000Z',
          entries: [
            {
              source: 'structured',
              entry: {
                id: 'comment_memory_comment_1',
                articleId: 'article_1',
                kind: 'trace',
                scope: 'agent',
                visibility: 'default',
                payloadVersion: 1,
                textRange: { textStart: 0, textEnd: 10 },
                sourceType: 'comment',
                sourceCommentId: 'comment_1',
                sourceEntryIds: [],
                payload: {
                  source: 'comment',
                  author: 'ai',
                  content: '助手之前提醒过迭代上下文',
                },
                createdAt: '2026-05-26T00:00:00.000Z',
                updatedAt: '2026-05-26T00:00:00.000Z',
              },
            },
          ],
        },
      },
      lin,
    );

    expect(prompt).toContain('thread memory_view');
    expect(prompt).toContain('助手之前提醒过迭代上下文');
    expect(prompt).toContain('当前批注讨论和刚刚触发你的读者评论优先级更高');
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
        action: 'comment',
        instruction: '解释这个概念',
        readingIntent: 'explain',
      },
      {
        agentId: zhou.id,
        agentUsername: zhou.username,
        action: 'comment',
      },
    ]);
  });

  it('parses mention route plans with multiple actions', () => {
    const route = parseAgentMentionRoutePlan(
      JSON.stringify({
        createUserThought: true,
        directives: [
          {
            agentUsername: '林知微',
            action: 'comment',
            instruction: '回应我的想法',
          },
          {
            agentUsername: '周砚',
            actions: ['comment', 'create_thought'],
            instruction: '从反方角度处理',
            readingIntent: 'challenge',
          },
        ],
      }),
      [lin, zhou],
    );

    expect(route).toEqual({
      createUserThought: true,
      directives: [
        {
          agentId: lin.id,
          agentUsername: lin.username,
          action: 'comment',
          instruction: '回应我的想法',
        },
        {
          agentId: zhou.id,
          agentUsername: zhou.username,
          action: 'comment',
          instruction: '从反方角度处理',
          readingIntent: 'challenge',
        },
        {
          agentId: zhou.id,
          agentUsername: zhou.username,
          action: 'create_thought',
          instruction: '从反方角度处理',
          readingIntent: 'challenge',
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
        status: 200,
      }),
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

    const requestBody = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
        status: 200,
      }),
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

    const requestBody = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = requestBody.messages[1]?.content || '';
    expect(prompt).toContain('第二章开头。');
    expect(prompt).toContain('第二章已读论证');
    expect(prompt).not.toContain('第二章未读反转。');
    expect(prompt).not.toContain('第三章未来剧情。');
    expect(annotations[0]?.anchor.exact).toBe('第二章已读论证');
  });

  it('includes selection memory view for target annotation prompts', async () => {
    const content = JSON.stringify([{ exact: '目标句子', type: 'question', comment: '一' }]);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
        status: 200,
      }),
    );

    await runAgentAnnotate(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      targetAnchor: {
        start: 3,
        end: 7,
        exact: '目标句子',
        prefix: '前文',
        suffix: '后文',
      },
      article: {
        title: '短文',
        url: 'https://example.test/article',
        text: '前文目标句子后文。',
      },
      readingMemoryView: {
        articleId: 'article_1',
        viewType: 'selection',
        viewKey: 'selection:::3:7',
        sourceEntryIds: ['comment_memory_comment_1'],
        updatedAt: '2026-05-26T00:00:00.000Z',
        entries: [
          {
            source: 'structured',
            entry: {
              id: 'comment_memory_comment_1',
              articleId: 'article_1',
              kind: 'reader_signal',
              scope: 'reader',
              visibility: 'default',
              payloadVersion: 1,
              textRange: { textStart: 3, textEnd: 7 },
              sourceType: 'comment',
              sourceCommentId: 'comment_1',
              sourceEntryIds: [],
              payload: {
                source: 'comment',
                author: 'user',
                content: '用户之前关心这里的因果关系',
              },
              createdAt: '2026-05-26T00:00:00.000Z',
              updatedAt: '2026-05-26T00:00:00.000Z',
            },
          },
        ],
      },
    });

    const requestBody = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = requestBody.messages[1]?.content || '';
    expect(prompt).toContain('selection memory_view');
    expect(prompt).toContain('用户之前关心这里的因果关系');
    expect(prompt).toContain('批注锚点仍必须保持为目标选区本身');
  });

  it('scopes ebook reading plan annotations to the current segment range', async () => {
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
        status: 200,
      }),
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

    const requestBody = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = requestBody.messages[1]?.content || '';
    expect(prompt).toContain('segment-level 上下文');
    expect(prompt).toContain('第二章已读论证。');
    expect(prompt).not.toContain('第一章已读背景。');
    expect(prompt).not.toContain('第二章未读反转。');
    expect(prompt).not.toContain('第三章未来剧情。');
  });

  it('includes article-section memory view for non-epub reading plans', async () => {
    const content = JSON.stringify([{ exact: '第二节关键判断', type: 'key_point', comment: '一' }]);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
        status: 200,
      }),
    );
    const text = '第一节背景。第二节关键判断需要讨论。第三节后续。';
    const sectionStart = text.indexOf('第二节关键判断');
    const sectionEnd = text.indexOf('第三节后续');

    await runAgentAnnotate(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      readingPlan: [
        {
          sectionId: 'section_2',
          sectionTitle: '第二节',
          sectionStart,
          sectionEnd,
          sectionSummary: '关键判断',
        },
      ],
      article: {
        title: '网页文章',
        url: 'https://example.test/article',
        text,
      },
      readingMemoryView: {
        articleId: 'article_1',
        viewType: 'article_section',
        viewKey: 'article_section:::5:20',
        sourceEntryIds: ['comment_memory_comment_1'],
        updatedAt: '2026-05-26T00:00:00.000Z',
        entries: [
          {
            source: 'structured',
            entry: {
              id: 'comment_memory_comment_1',
              articleId: 'article_1',
              kind: 'reader_signal',
              scope: 'reader',
              visibility: 'default',
              payloadVersion: 1,
              textRange: { textStart: sectionStart, textEnd: sectionEnd },
              sourceType: 'comment',
              sourceCommentId: 'comment_1',
              sourceEntryIds: [],
              payload: {
                source: 'comment',
                author: 'user',
                content: '用户之前关心第二节的证据',
              },
              createdAt: '2026-05-26T00:00:00.000Z',
              updatedAt: '2026-05-26T00:00:00.000Z',
            },
          },
        ],
      },
    });

    const requestBody = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const prompt = requestBody.messages[1]?.content || '';
    expect(prompt).toContain('article-section memory_view');
    expect(prompt).toContain('用户之前关心第二节的证据');
    expect(prompt).toContain('批注 exact 仍必须来自编排列表里的 sectionText');
  });

  it('skips repeated reading-plan thoughts on the same article anchor', async () => {
    const text = '开头。工具的本质是解决问题。后续说明。';
    const exact = '工具的本质是解决问题';
    const start = text.indexOf(exact);
    const existingAnnotation: Annotation = {
      id: 'annotation_existing',
      author: 'ai',
      color: agent.annotationColor,
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      anchor: {
        start,
        end: start + exact.length,
        exact,
        prefix: '开头。',
        suffix: '。后续说明。',
      },
      comments: [
        {
          id: 'comment_existing',
          author: 'ai',
          content:
            '这句话是全文的方法论基石。作者用最朴素的表述定义了工具的价值标准，不是功能多，而是能解决真实问题。',
          createdAt: '2026-05-26T00:00:00.000Z',
          agentId: agent.id,
          agentUsername: agent.username,
          agentNickname: agent.nickname,
        },
      ],
      createdAt: '2026-05-26T00:00:00.000Z',
      updatedAt: '2026-05-26T00:00:00.000Z',
    };
    const content = JSON.stringify([
      {
        exact,
        type: 'key_point',
        comment:
          '这是全文的方法论基石。作者用一句朴素的话定义工具价值标准，不是功能多，而是解决真实问题。',
      },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
        status: 200,
      }),
    );

    const annotations = await runAgentAnnotate(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      annotations: [existingAnnotation],
      readingPlan: [
        {
          sectionId: 'article',
          sectionTitle: '全文',
          sectionStart: 0,
          sectionEnd: text.length,
        },
      ],
      article: {
        title: '网页文章',
        url: 'https://example.test/article',
        text,
      },
    });

    expect(annotations).toEqual([]);
  });

  it('generates ebook reading plan annotations segment by segment', async () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: [
          '第一段核心观点可以讨论。',
          '第二段核心判断适合批注。',
          '第三段边界内容不应进入第一段 prompt。',
        ],
      },
    ];
    const ebookIndex = buildEpubBookIndex({
      articleId: 'book-1',
      chapters,
      maxSegmentTextLength: 18,
      minSegmentTextLength: 1,
    });
    const text = epubIndexText(chapters);
    const segments = ebookIndex.segments.filter((segment) => segment.chapterId === 'chapter-1');
    let callIndex = 0;
    const contents = [
      JSON.stringify([
        {
          exact: '第二段核心判断',
          type: 'key_point',
          moveType: 'explain_concept',
          whyHere: '故意越界。',
          evidenceUsed: ['localText'],
          confidence: 'high',
          shouldShow: true,
          comment: '不应落在第一段。',
        },
      ]),
      JSON.stringify([
        {
          exact: '第二段核心判断',
          type: 'key_point',
          moveType: 'challenge_argument',
          whyHere: '这里有可检验判断。',
          evidenceUsed: ['localText', 'trace'],
          confidence: 'high',
          shouldShow: true,
          comment: '这里的判断需要看证据。',
        },
      ]),
      '[]',
    ];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const content = contents[callIndex] || '[]';
      callIndex += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
          status: 200,
        }),
      );
    });

    const annotations = await runAgentAnnotate(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      readingPlan: [
        {
          sectionId: 'chapter-1',
          sectionTitle: '第一章',
          sectionStart: ebookIndex.chapters[0].textStart,
          sectionEnd: ebookIndex.chapters[0].textEnd,
          sectionSummary: '讨论这一章的判断。',
          sectionTag: '判断',
          targetDensity: 'high',
        },
      ],
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(segments.length);
    const firstPrompt = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)).messages[1]
      ?.content as string;
    expect(firstPrompt).toContain('segment-level 上下文');
    expect(firstPrompt).toContain('"segmentId": "chapter-1-segment-1"');
    expect(firstPrompt).toContain('allowedAnchorRange');
    expect(firstPrompt).not.toContain('第三段边界内容不应进入第一段 prompt。');
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.anchor.segmentId).toBe('chapter-1-segment-2');
    expect(annotations[0]).toMatchObject({
      moveType: 'challenge_argument',
      whyHere: '这里有可检验判断。',
      evidenceUsed: ['localText', 'trace'],
      confidence: 'high',
      shouldShow: true,
    });
  });

  it('does not cross epub chapter boundaries for segment generation', async () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['第一章第一段。', '第一章第二段。'],
      },
      {
        id: 'chapter-2',
        title: '第二章',
        paragraphs: ['第二章核心内容不应调用。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({
      articleId: 'book-1',
      chapters,
      maxSegmentTextLength: 10,
      minSegmentTextLength: 1,
    });
    const text = epubIndexText(chapters);
    const chapterOne = ebookIndex.chapters[0];
    const chapterOneSegmentCount = ebookIndex.segments.filter(
      (segment) => segment.chapterId === chapterOne.id,
    ).length;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [{ index: 0, message: { content: '[]' } }] }), {
          status: 200,
        }),
      ),
    );

    await runAgentAnnotate(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      readingPlan: [
        {
          sectionId: chapterOne.id,
          sectionTitle: chapterOne.title,
          sectionStart: chapterOne.textStart,
          sectionEnd: chapterOne.textEnd,
        },
      ],
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(chapterOneSegmentCount);
    const prompts = fetchMock.mock.calls.map(
      (call) => JSON.parse(requestBodyText(call[1]?.body)).messages[1]?.content as string,
    );
    expect(prompts.join('\n')).not.toContain('第二章核心内容不应调用。');
  });

  it('allows empty segment output and deduplicates repeated move types', async () => {
    const body = [
      '第一可批注点需要跳过。',
      '第二可批注点需要保留。',
      '第三可批注点与第二点动作重复。',
      '补足长度。'.repeat(80),
    ].join('');
    const chapters = [{ id: 'chapter-1', title: '第一章', paragraphs: [body] }];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const content = JSON.stringify([
      {
        exact: '第一可批注点',
        type: 'key_point',
        moveType: 'ask_question',
        whyHere: '不展示。',
        evidenceUsed: ['localText'],
        confidence: 'low',
        shouldShow: false,
        comment: '跳过。',
      },
      {
        exact: '第二可批注点',
        type: 'question',
        moveType: 'ask_question',
        whyHere: '提出问题。',
        evidenceUsed: ['localText'],
        confidence: 'medium',
        shouldShow: true,
        comment: '这里可以追问。',
      },
      {
        exact: '第三可批注点',
        type: 'question',
        moveType: 'ask_question',
        whyHere: '动作重复。',
        evidenceUsed: ['localText'],
        confidence: 'medium',
        shouldShow: true,
        comment: '这里也想追问。',
      },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
        status: 200,
      }),
    );

    const annotations = await runAgentAnnotate(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      readingPlan: [
        {
          sectionId: 'chapter-1',
          sectionTitle: '第一章',
          sectionStart: 0,
          sectionEnd: text.length,
        },
      ],
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    });

    expect(annotations.map((annotation) => annotation.anchor.exact)).toEqual(['第二可批注点']);
  });

  it('splits overlong epub segment text into bounded annotation calls', async () => {
    const tail = '尾部也应可批注';
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: [`开头可见。${'中间内容'.repeat(1800)}${tail}`],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const content = JSON.stringify([
      {
        exact: tail,
        type: 'key_point',
        moveType: 'structure_marker',
        whyHere: '尾部在后续 chunk 中可见。',
        evidenceUsed: ['localText'],
        confidence: 'high',
        shouldShow: true,
        comment: '后续 chunk 也应能生成。',
      },
    ]);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
          status: 200,
        }),
      ),
    );

    const annotations = await runAgentAnnotate(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      readingPlan: [
        {
          sectionId: 'chapter-1',
          sectionTitle: '第一章',
          sectionStart: 0,
          sectionEnd: text.length,
        },
      ],
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const prompts = fetchMock.mock.calls.map(
      (call) => JSON.parse(requestBodyText(call[1]?.body)).messages[1]?.content as string,
    );
    expect(prompts[0]).toContain('开头可见。');
    expect(prompts[0]).not.toContain(tail);
    expect(prompts[1]).toContain(tail);
    expect(annotations.map((annotation) => annotation.anchor.exact)).toEqual([tail]);
    expect(annotations[0]?.anchor.textStartInBook).toBe(text.indexOf(tail));
  });

  it('updates reading memory and feeds prior summary and trace into following segments', async () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['第一段核心判断可以讨论。', '第二段展开这个判断的后果。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({
      articleId: 'book-1',
      chapters,
      maxSegmentTextLength: 12,
      minSegmentTextLength: 1,
    });
    const text = epubIndexText(chapters);
    const chapter = ebookIndex.chapters[0];
    const annotationPrompts: string[] = [];
    const memoryPrompts: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse(requestBodyText(init?.body)) as {
        messages?: Array<{ content?: string }>;
      };
      const prompt = body.messages?.[1]?.content || '';
      if (prompt.includes('请更新当前 segment 的最小阅读记忆')) {
        memoryPrompts.push(prompt);
        const content =
          memoryPrompts.length === 1
            ? JSON.stringify({
                segmentSummary: {
                  summary: '第一段提出一个核心判断。',
                  keyTerms: ['核心判断'],
                },
                segmentTrace: {
                  items: [
                    {
                      type: 'agent_observation',
                      content: '注意到这个核心判断需要后续证据。',
                      evidenceExact: '第一段核心判断',
                      confidence: 'high',
                    },
                  ],
                },
              })
            : JSON.stringify({
                segmentSummary: {
                  summary: '第二段展开这个判断的后果。',
                  keyTerms: ['后果'],
                },
                segmentTrace: { items: [] },
              });
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
            status: 200,
          }),
        );
      }

      annotationPrompts.push(prompt);
      const content =
        annotationPrompts.length === 1
          ? JSON.stringify([
              {
                exact: '第一段核心判断',
                type: 'key_point',
                moveType: 'challenge_argument',
                whyHere: '这里是后文论证起点。',
                evidenceUsed: ['localText'],
                confidence: 'high',
                shouldShow: true,
                comment: '这个判断后面要看证据。',
              },
            ])
          : '[]';
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
          status: 200,
        }),
      );
    });

    const result = await runAgentAnnotateWithMemory(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      readingPlan: [
        {
          sectionId: chapter.id,
          sectionTitle: chapter.title,
          sectionStart: chapter.textStart,
          sectionEnd: chapter.textEnd,
        },
      ],
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    });

    expect(result.annotations).toHaveLength(1);
    expect(result.readingMemory?.textSummaries.map((summary) => summary.summary)).toEqual([
      '第一段提出一个核心判断。',
      '第二段展开这个判断的后果。',
    ]);
    expect(
      result.readingMemory?.readingTraces.find((trace) => trace.scope === 'chapter')?.items[0]
        ?.content,
    ).toBe('注意到这个核心判断需要后续证据。');
    expect(annotationPrompts[1]).toContain('reading-memory-summary');
    expect(annotationPrompts[1]).toContain('第一段提出一个核心判断。');
    expect(annotationPrompts[1]).toContain('segment_trace');
    expect(annotationPrompts[1]).toContain('注意到这个核心判断需要后续证据。');
    expect(annotationPrompts[1]).toContain('summary/trace 不能当作原文事实证据');
  });

  it('feeds correction projection instead of superseded trace into segment context', async () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['第一段核心判断可以讨论。', '第二段展开这个判断的后果。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({
      articleId: 'book-1',
      chapters,
      maxSegmentTextLength: 12,
      minSegmentTextLength: 1,
    });
    const text = epubIndexText(chapters);
    const chapter = ebookIndex.chapters[0];
    const wrongTrace = memoryEntry({
      id: 'wrong_trace',
      articleId: 'book-1',
      kind: 'trace',
      segmentId: ebookIndex.segments[0].id,
      payload: { items: [traceItem('旧判断不应再出现')] },
    });
    const correction = readingMemoryCorrectionEntry({
      id: 'correction_1',
      articleId: 'book-1',
      targetEntry: wrongTrace,
      reason: '旧判断不成立',
      replacement: '应理解为人物在试探环境',
      createdAt: '2026-05-26T01:00:00.000Z',
    });
    const annotationPrompts: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse(requestBodyText(init?.body)) as {
        messages?: Array<{ content?: string }>;
      };
      const prompt = body.messages?.[1]?.content || '';
      if (prompt.includes('请更新当前 segment 的最小阅读记忆')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  index: 0,
                  message: {
                    content: JSON.stringify({
                      segmentSummary: { summary: '当前段摘要。', keyTerms: [] },
                      segmentTrace: { items: [] },
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      annotationPrompts.push(prompt);
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ index: 0, message: { content: '[]' } }] }), {
          status: 200,
        }),
      );
    });

    await runAgentAnnotateWithMemory(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      readingMemory: readingMemoryFromEntries([wrongTrace, correction!]),
      readingPlan: [
        {
          sectionId: chapter.id,
          sectionTitle: chapter.title,
          sectionStart: chapter.textStart,
          sectionEnd: chapter.textEnd,
        },
      ],
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    });

    expect(annotationPrompts[1]).not.toContain('旧判断不应再出现');
    expect(annotationPrompts[1]).toContain('correction：旧判断不成立');
    expect(annotationPrompts[1]).toContain('应理解为人物在试探环境');
  });

  it('feeds prior chunk memory into later chunks of one overlong segment', async () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: [`第一块核心判断可以讨论。${'中间内容'.repeat(1800)}第二块继续展开。`],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const chapter = ebookIndex.chapters[0];
    const annotationPrompts: string[] = [];
    const memoryPrompts: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const body = JSON.parse(requestBodyText(init?.body)) as {
        messages?: Array<{ content?: string }>;
      };
      const prompt = body.messages?.[1]?.content || '';
      if (prompt.includes('请更新当前 segment 的最小阅读记忆')) {
        memoryPrompts.push(prompt);
        const content =
          memoryPrompts.length === 1
            ? JSON.stringify({
                segmentSummary: {
                  summary: '前半段提出核心判断。',
                  keyTerms: ['核心判断'],
                },
                segmentTrace: {
                  items: [
                    {
                      type: 'agent_observation',
                      content: '核心判断需要后半段继续验证。',
                      evidenceExact: '第一块核心判断',
                      confidence: 'high',
                    },
                  ],
                },
              })
            : JSON.stringify({
                segmentSummary: {
                  summary: '后半段继续展开。',
                  keyTerms: ['展开'],
                },
                segmentTrace: { items: [] },
              });
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), {
            status: 200,
          }),
        );
      }

      annotationPrompts.push(prompt);
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ index: 0, message: { content: '[]' } }] }), {
          status: 200,
        }),
      );
    });

    const result = await runAgentAnnotateWithMemory(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      readingPlan: [
        {
          sectionId: chapter.id,
          sectionTitle: chapter.title,
          sectionStart: chapter.textStart,
          sectionEnd: chapter.textEnd,
        },
      ],
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    });

    expect(annotationPrompts).toHaveLength(2);
    expect(annotationPrompts[1]).toContain('reading-memory-summary');
    expect(annotationPrompts[1]).toContain('前半段提出核心判断。');
    expect(annotationPrompts[1]).toContain('核心判断需要后半段继续验证。');
    expect(result.readingMemory?.textSummaries.map((summary) => summary.summary)).toEqual([
      '前半段提出核心判断。',
      '后半段继续展开。',
    ]);
  });

  it('keeps annotations when reading memory generation fails', async () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['第一段核心判断可以讨论。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    let callIndex = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      callIndex += 1;
      if (callIndex === 2) return Promise.reject(new Error('memory failed'));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                index: 0,
                message: {
                  content: JSON.stringify([
                    {
                      exact: '第一段核心判断',
                      type: 'key_point',
                      comment: '这个判断后面要看证据。',
                    },
                  ]),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });

    const result = await runAgentAnnotateWithMemory(provider, agent, {
      agentId: agent.id,
      agentUsername: agent.username,
      readingPlan: [
        {
          sectionId: 'chapter-1',
          sectionTitle: '第一章',
          sectionStart: 0,
          sectionEnd: text.length,
        },
      ],
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    });

    expect(result.annotations.map((annotation) => annotation.anchor.exact)).toEqual([
      '第一段核心判断',
    ]);
    expect(result.readingMemory).toBeUndefined();
  });
});

function memoryEntry(overrides: Partial<ReadingMemoryEntry> = {}): ReadingMemoryEntry {
  return {
    id: 'entry_1',
    articleId: 'book-1',
    kind: 'trace',
    scope: 'segment',
    visibility: 'default',
    payloadVersion: 1,
    chapterId: 'chapter-1',
    segmentId: 'chapter-1-segment-0',
    textRange: { textStart: 0, textEnd: 10 },
    sourceType: 'ai_task',
    sourceTaskId: 'task_1',
    sourceEntryIds: [],
    payload: { items: [traceItem('memory')] },
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

function traceItem(content: string) {
  return {
    type: 'agent_observation' as const,
    content,
    evidenceAnchors: [],
    confidence: 'medium' as const,
    createdFromTask: 'chapter_segment_annotation',
  };
}
