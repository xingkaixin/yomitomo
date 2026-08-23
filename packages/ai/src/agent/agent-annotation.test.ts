import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Annotation, LlmProvider, ReadingMemoryEntry } from '@yomitomo/shared';
import { readingPartnerSoul } from '@yomitomo/shared';
import {
  annotationAgentAuthorRef,
  buildEpubBookIndex,
  createEpubTextAnchor,
  epubIndexText,
  readingMemoryFromEntries,
} from '@yomitomo/core';
import {
  runAgentAnnotate,
  runAgentAnnotateStream,
  runAgentAnnotateWithMemory,
} from './agent-annotation';

afterEach(() => {
  vi.restoreAllMocks();
});

function requestBodyText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function streamResponseFromDeltas(deltas: string[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const delta of deltas) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(streamDelta(delta))}\n\n`));
        }
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            })}\n\n`,
          ),
        );
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function streamDelta(content: string) {
  return {
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
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
    expect(requestBody.messages[0]?.content).toContain('## 阅读助手原则');
    expect(requestBody.messages[0]?.content).toContain('你的默认回答应该像原文旁边的一层智能批注');
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
      author: annotationAgentAuthorRef(agent),
      color: agent.annotationColor,
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
          author: annotationAgentAuthorRef(agent),
          content:
            '这句话是全文的方法论基石。作者用最朴素的表述定义了工具的价值标准，不是功能多，而是能解决真实问题。',
          createdAt: '2026-05-26T00:00:00.000Z',
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

  it('streams reading-plan annotations from JSON chunks and skips existing thoughts', async () => {
    const text = '开头。工具的本质是解决问题。后续还有新的判断。';
    const duplicateExact = '工具的本质是解决问题';
    const newExact = '后续还有新的判断';
    const duplicateStart = text.indexOf(duplicateExact);
    const duplicateComment =
      '这是全文的方法论基石。作者用朴素表达定义工具价值，不是功能多，而是解决真实问题。';
    const existingAnnotation: Annotation = {
      id: 'annotation_existing',
      author: annotationAgentAuthorRef(agent),
      color: agent.annotationColor,
      anchor: {
        start: duplicateStart,
        end: duplicateStart + duplicateExact.length,
        exact: duplicateExact,
        prefix: '开头。',
        suffix: '。后续还有新的判断。',
      },
      comments: [
        {
          id: 'comment_existing',
          author: annotationAgentAuthorRef(agent),
          content: duplicateComment,
          createdAt: '2026-05-26T00:00:00.000Z',
        },
      ],
      createdAt: '2026-05-26T00:00:00.000Z',
      updatedAt: '2026-05-26T00:00:00.000Z',
    };
    const duplicate = JSON.stringify({
      exact: duplicateExact,
      type: 'key_point',
      readingIntent: 'explain',
      comment: duplicateComment,
    });
    const next = JSON.stringify({
      exact: newExact,
      type: 'question',
      readingIntent: 'question',
      moveType: 'challenge_argument',
      whyHere: '这里提出了一个需要证据支撑的新判断。',
      evidenceUsed: ['localText', 'trace'],
      confidence: 'high',
      shouldShow: true,
      comment: '这里提出了新的判断，适合继续追问证据和适用边界。',
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        streamResponseFromDeltas([
          duplicate.slice(0, 16),
          duplicate.slice(16),
          '\n',
          next.slice(0, 12),
          next.slice(12),
          '{"exact":"未完成"',
        ]),
      );
    const onAnnotation = vi.fn();

    const result = await runAgentAnnotateStream(
      provider,
      { ...agent, annotationDensity: 'high' },
      {
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
      },
      onAnnotation,
    );

    const requestBody = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(requestBody.messages[1]?.content).toContain('请用 NDJSON 返回批注');
    expect(result.annotations.map((annotation) => annotation.anchor.exact)).toEqual([newExact]);
    expect(onAnnotation).toHaveBeenCalledTimes(1);
    expect(onAnnotation.mock.calls[0]?.[0]).toMatchObject({
      anchor: { exact: newExact },
      annotationType: 'question',
      readingIntent: 'question',
      moveType: 'challenge_argument',
      whyHere: '这里提出了一个需要证据支撑的新判断。',
      evidenceUsed: ['localText', 'trace'],
      confidence: 'high',
      shouldShow: true,
    });
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
    const correction = memoryEntry({
      id: 'correction_1',
      articleId: 'book-1',
      kind: 'correction',
      scope: wrongTrace.scope,
      chapterId: wrongTrace.chapterId,
      segmentId: wrongTrace.segmentId,
      paragraphId: wrongTrace.paragraphId,
      textRange: wrongTrace.textRange,
      anchor: wrongTrace.anchor,
      sourceType: 'correction',
      sourceId: 'correction_1',
      sourceTaskId: undefined,
      sourceEntryIds: ['wrong_trace'],
      supersedesEntryId: 'wrong_trace',
      payload: {
        reason: '旧判断不成立',
        replacement: '应理解为人物在试探环境',
      },
      createdAt: '2026-05-26T01:00:00.000Z',
      updatedAt: '2026-05-26T01:00:00.000Z',
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
      readingMemory: readingMemoryFromEntries([wrongTrace, correction]),
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

  it('keeps annotations when reading memory parsing fails', async () => {
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
      const content =
        callIndex === 2
          ? '不是 JSON'
          : JSON.stringify([
              {
                exact: '第一段核心判断',
                type: 'key_point',
                comment: '这个判断后面要看证据。',
              },
            ]);
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
