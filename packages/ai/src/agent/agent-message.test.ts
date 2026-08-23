import { describe, expect, it } from 'vitest';
import type { AgentMessagePayload, LlmProvider, PublicAgent } from '@yomitomo/shared';
import { readingPartnerSoul } from '@yomitomo/shared';
import {
  annotationAgentAuthorRef,
  buildEpubBookIndex,
  createEpubTextAnchor,
  epubIndexText,
} from '@yomitomo/core';
import {
  buildAgentCreateThoughtRuntimePayload,
  buildAgentDistillationReviewRuntimePayload,
  buildAgentMessageSystemPrompt,
  buildAgentPrompt,
  buildAgentThreadReplyRuntimePayload,
} from './agent-message';

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
      author: annotationAgentAuthorRef(lin),
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
          author: annotationAgentAuthorRef(lin),
          content: '这里的关键在于迭代。',
          createdAt: '2026-05-07T00:00:00.000Z',
        },
      ],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    },
    userComment: {
      id: 'comment_2',
      author: { kind: 'user', username: 'xingkaixin', nickname: '行开心' },
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
    expect(prompt).toContain('## 阅读助手原则');
    expect(prompt).toContain('你是阅读助手，不是普通摘要器');
    expect(prompt).toContain('始终保留用户与原文之间的连接');
  });

  it('keeps assistant-created thoughts concise and non-dialogic', () => {
    const thoughtPayload: AgentMessagePayload = {
      ...payload,
      responseMode: 'create_thought',
      instruction: '给一个能带走的判断框架',
    };
    const system = buildAgentMessageSystemPrompt(
      {
        presetId: 'reading-partner',
        soul: readingPartnerSoul,
        username: lin.username,
        nickname: lin.nickname,
      },
      thoughtPayload,
    );
    const prompt = buildAgentPrompt(provider, thoughtPayload, lin);

    expect(system).toContain('## 角色卡');
    expect(system).toContain('只输出一个单纯、可带走的观点或判断框架');
    expect(system).toContain('角色卡用于影响你的判断视角、问题敏感度和取舍标准');
    expect(system).toContain('不要把角色卡写成自我介绍或身份表演');
    expect(system).toContain('不要 @ 用户或其他助手');
    expect(system).toContain('不展示思考过程');
    expect(prompt).toContain('请输出一条新的批注想法');
    expect(prompt).toContain('不展示思考过程');
    expect(prompt).toContain('不要 @ 任何人');
    expect(prompt).toContain('给一个能带走的判断框架');
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
    expect(system).not.toContain('## 审阅助手原则');
    expect(prompt).toContain('历史断言规则');
    expect(prompt).toContain('才能说“我之前批注过”“我之前说过”或“其他助手批注过”');
  });

  it('adds draft review principles to distillation review prompts', () => {
    const system = buildAgentMessageSystemPrompt(
      {
        presetId: 'reading-partner',
        soul: readingPartnerSoul,
        username: lin.username,
        nickname: lin.nickname,
      },
      { ...payload, responseMode: 'distillation_review' },
    );

    expect(system).toContain('## 审阅助手原则');
    expect(system).toContain('你是面向阅读沉淀稿的审阅助手');
    expect(system).toContain('之前阅读助手说过的话不能自动视为证据');
    expect(system).toContain('用户当前草稿是要改进的对象，不应被整体覆盖');
    expect(system).toContain('新增、修改、删除、合并、拆分、移动、澄清、补证据');
  });

  it('keeps discussion organization prompts from evaluating empty drafts', () => {
    const organizePayload: AgentMessagePayload = {
      ...payload,
      responseMode: 'distillation_review',
      distillationReviewMode: 'organize_discussion',
      instruction: '',
      distillationDraft: '',
      distillationReviewRequest: '请整理讨论，生成可加入沉淀稿的新增建议。',
      userComment: {
        ...payload.userComment,
        content: '请整理讨论，生成可加入沉淀稿的新增建议。',
      },
    };
    const runtimeAgent = {
      id: lin.id,
      presetId: 'reading-partner',
      soul: readingPartnerSoul,
      username: lin.username,
      nickname: lin.nickname,
      avatar: lin.avatar,
      annotationColor: lin.annotationColor,
      temperature: lin.temperature,
    };
    const prompt = buildAgentPrompt(provider, organizePayload, lin);
    const runtimePayload = buildAgentDistillationReviewRuntimePayload(
      provider,
      runtimeAgent,
      organizePayload,
    );

    expect(prompt).toContain('请整理讨论');
    expect(prompt).toContain('当前草稿为空，不能写“草稿已经”“草稿抓住”“草稿遗漏”“整体可靠”');
    expect(prompt).toContain('不要假装用户已经写出了这些判断');
    expect(prompt).not.toContain('请审阅这段沉淀');
    expect(prompt).not.toContain('是否值得发布');
    expect(runtimePayload.user).toContain('讨论整理要求');
    expect(runtimePayload.user).toContain('不要评价现有草稿质量');
    expect(runtimePayload.user).not.toContain('判断沉淀稿是否站得住');
    expect(runtimePayload.distillationReviewMode).toBe('organize_discussion');
  });

  it('adds the selected interface language to assistant replies', () => {
    const system = buildAgentMessageSystemPrompt(
      {
        presetId: 'reading-partner',
        soul: readingPartnerSoul,
        username: lin.username,
        nickname: lin.nickname,
      },
      { ...payload, uiLanguage: 'en' },
    );

    expect(system).toContain('回复语言');
    expect(system).toContain('English');
    expect(system).toContain('## Reading Assistant Principles');
    expect(system).toContain('You are a reading assistant, not a generic summarizer.');
    expect(system).toContain('引用原文、用户名、助手名、代码、JSON 字段名和工具参数保持原样');
  });

  it('repeats response language near tool runtime final output requirements', () => {
    const runtimeAgent = {
      id: lin.id,
      presetId: 'reading-partner',
      soul: readingPartnerSoul,
      username: lin.username,
      nickname: lin.nickname,
      avatar: lin.avatar,
      annotationColor: lin.annotationColor,
      temperature: lin.temperature,
    };
    const replyRuntime = buildAgentThreadReplyRuntimePayload(provider, runtimeAgent, {
      ...payload,
      uiLanguage: 'zh-CN',
    });
    const thoughtRuntime = buildAgentCreateThoughtRuntimePayload(provider, runtimeAgent, {
      ...payload,
      responseMode: 'create_thought',
      uiLanguage: 'en',
    });

    expect(replyRuntime.user.slice(-160)).toContain('最终面向读者的自然语言内容必须使用简体中文');
    expect(thoughtRuntime.user.slice(-160)).toContain('最终面向读者的自然语言内容必须使用English');
  });

  it('uses English draft review principles for English distillation reviews', () => {
    const system = buildAgentMessageSystemPrompt(
      {
        presetId: 'reading-partner',
        soul: readingPartnerSoul,
        username: lin.username,
        nickname: lin.nickname,
      },
      { ...payload, responseMode: 'distillation_review', uiLanguage: 'en' },
    );

    expect(system).toContain('## Review Assistant Principles');
    expect(system).toContain('You are a review assistant for reading distillation drafts.');
    expect(system).toContain('Prior assistant comments are not evidence by themselves.');
    expect(system).toContain("Preserve the user's voice.");
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
      author: { kind: 'user', username: 'xingkaixin', nickname: '行开心' } as const,
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
      author: { kind: 'user', username: 'xingkaixin', nickname: '行开心' } as const,
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
              author: annotationAgentAuthorRef(lin),
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
    expect(prompt).toContain('自然语言回复正文必须遵守回复语言设置');
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
      author: { kind: 'user', username: 'xingkaixin', nickname: '行开心' } as const,
      content: '@林知微 最晚追问',
      createdAt: '2026-05-13T00:20:00.000Z',
    };
    const comments = [
      {
        id: 'comment_original',
        author: annotationAgentAuthorRef(lin),
        content: '原始批注需要保留',
        createdAt: '2026-05-13T00:00:00.000Z',
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `comment_history_${index + 1}`,
        author: { kind: 'user', username: 'xingkaixin', nickname: '行开心' } as const,
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
      author: { kind: 'user', username: 'xingkaixin', nickname: '行开心' } as const,
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

  it('uses fast reading context snapshot for non-epub thread replies', () => {
    const prompt = buildAgentPrompt(provider, payload, lin, {
      readingContext: {
        memoryEvidence: [
          {
            summary: '助手之前提醒过迭代上下文',
            text: 'comment: 助手之前提醒过迭代上下文',
            provenance: {
              articleId: 'article_1',
              sourceType: 'comment',
              sourceCommentId: 'comment_1',
              agentId: lin.id,
            },
          },
        ],
      },
    });

    expect(prompt).toContain('thread memory_view');
    expect(prompt).toContain('comment: 助手之前提醒过迭代上下文');
    expect(prompt).toContain('"source": "comment"');
  });
});
