import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, LlmProvider } from '@yomitomo/shared';
import { readingPartnerSoul } from '@yomitomo/shared';
import { buildEpubBookIndex, epubIndexText } from '@yomitomo/core';
import { Effect } from 'effect';
import { buildSegmentAnnotationTasks } from './segment-annotation-context';
import {
  runAgentSegmentAnnotate,
  runAgentSegmentAnnotateStreamWithMemory,
} from './segment-annotation-runner';

const providerMocks = vi.hoisted(() => ({
  generateYomitomoTextEffect: vi.fn(),
  streamYomitomoTextEffect: vi.fn(),
}));

vi.mock('../provider/generation-runtime', () => ({
  generateYomitomoTextEffect: providerMocks.generateYomitomoTextEffect,
  streamYomitomoTextEffect: providerMocks.streamYomitomoTextEffect,
}));

beforeEach(() => {
  providerMocks.generateYomitomoTextEffect.mockReset();
  providerMocks.streamYomitomoTextEffect.mockReset();
});

describe('runAgentSegmentAnnotateStreamWithMemory', () => {
  it('uses one annotation contract for JSON and NDJSON generation', async () => {
    const provider = testProvider();
    const agent = testAgent();
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['同一段批注内容需要使用相同语义契约。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({
      articleId: 'book-contract',
      chapters,
      maxSegmentTextLength: 100,
      minSegmentTextLength: 1,
    });
    const payload = {
      agentId: agent.id,
      agentUsername: agent.username,
      article: {
        title: '契约测试',
        url: 'ebook://book-contract',
        text: epubIndexText(chapters),
        ebookIndex,
      },
      readingPlan: [
        {
          sectionId: ebookIndex.chapters[0].id,
          sectionTitle: ebookIndex.chapters[0].title,
          sectionStart: ebookIndex.chapters[0].textStart,
          sectionEnd: ebookIndex.chapters[0].textEnd,
        },
      ],
    };
    const task = buildSegmentAnnotationTasks(payload, agent)[0];
    const annotationPrompts: string[] = [];

    providerMocks.generateYomitomoTextEffect.mockImplementation((_provider, request) =>
      Effect.sync(() => {
        if (request.user.includes('## 批注语义')) {
          annotationPrompts.push(request.user);
          return { text: '[]' };
        }
        return { text: '{"segmentTrace":{"items":[]}}' };
      }),
    );
    providerMocks.streamYomitomoTextEffect.mockImplementation((_provider, request) =>
      Effect.sync(() => {
        annotationPrompts.push(request.user);
        return { text: '' };
      }),
    );

    await runAgentSegmentAnnotate(provider, agent, payload, 'system', [task]);
    await runAgentSegmentAnnotateStreamWithMemory(
      provider,
      agent,
      payload,
      'system',
      [task],
      vi.fn(),
    );

    expect(annotationPrompts).toHaveLength(2);
    const [jsonPrompt, ndjsonPrompt] = annotationPrompts;
    expect(promptBeforeOutputFormat(jsonPrompt)).toBe(promptBeforeOutputFormat(ndjsonPrompt));
    expect(jsonPrompt).toContain('请返回 JSON 数组');
    expect(jsonPrompt).toContain('没有值得批注的内容时返回空数组');
    expect(ndjsonPrompt).toContain('请用 NDJSON 返回批注');
    expect(ndjsonPrompt).toContain('每一行是一个完整 JSON 对象');
  });

  it('streams allowed segment annotations, deduplicates moves, and feeds memory forward', async () => {
    const provider = testProvider();
    const agent = testAgent();
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['第一段有效点可以讨论。', '第二段有效点和重复动作都在这里。'],
      },
    ];
    const ebookIndex = buildEpubBookIndex({
      articleId: 'book-1',
      chapters,
      maxSegmentTextLength: 18,
      minSegmentTextLength: 1,
    });
    const text = epubIndexText(chapters);
    const chapter = ebookIndex.chapters[0];
    const firstExact = '第一段有效点';
    const secondExact = '第二段有效点';
    const duplicateMoveExact = '重复动作';
    const payload = {
      agentId: agent.id,
      agentUsername: agent.username,
      readingPlan: [
        {
          sectionId: chapter.id,
          sectionTitle: chapter.title,
          sectionStart: chapter.textStart,
          sectionEnd: chapter.textEnd,
          targetDensity: 'high' as const,
        },
      ],
      article: {
        title: '长书',
        url: 'ebook://book-1',
        text,
        ebookIndex,
      },
    };
    const segmentTasks = buildSegmentAnnotationTasks(payload, agent);
    const streamPrompts: string[] = [];
    const memoryPrompts: string[] = [];
    providerMocks.streamYomitomoTextEffect.mockImplementation((_provider, request, onDelta) =>
      Effect.sync(() => {
        streamPrompts.push(request.user);
        if (streamPrompts.length === 1) {
          emitJson(onDelta, suggestion(secondExact, 'challenge_argument'));
          emitJsonInChunks(onDelta, suggestion(firstExact, 'challenge_argument'));
        } else if (streamPrompts.length === 2) {
          emitJson(onDelta, suggestion(secondExact, 'ask_question'));
          emitJson(onDelta, suggestion(duplicateMoveExact, 'ask_question'));
        }
        return { text: '' };
      }),
    );
    providerMocks.generateYomitomoTextEffect.mockImplementation((_provider, request) =>
      Effect.sync(() => {
        memoryPrompts.push(request.user);
        const summary = memoryPrompts.length === 1 ? '第一段摘要。' : '第二段摘要。';
        const traceItems =
          memoryPrompts.length === 1
            ? [
                {
                  type: 'agent_observation',
                  content: '第一段有效点需要后续验证。',
                  evidenceExact: firstExact,
                  confidence: 'high',
                },
              ]
            : [];
        return {
          text: JSON.stringify({
            segmentSummary: { summary, keyTerms: [] },
            segmentTrace: { items: traceItems },
          }),
        };
      }),
    );
    const onAnnotation = vi.fn();

    const result = await runAgentSegmentAnnotateStreamWithMemory(
      provider,
      agent,
      payload,
      'system',
      segmentTasks,
      onAnnotation,
    );

    expect(segmentTasks).toHaveLength(2);
    expect(providerMocks.streamYomitomoTextEffect).toHaveBeenCalledTimes(2);
    expect(providerMocks.generateYomitomoTextEffect).toHaveBeenCalledTimes(2);
    expect(streamPrompts[1]).toContain('第一段摘要。');
    expect(result.annotations.map((annotation) => annotation.anchor.exact)).toEqual([
      firstExact,
      secondExact,
    ]);
    expect(onAnnotation.mock.calls.map((call) => call[0].anchor.exact)).toEqual([
      firstExact,
      secondExact,
    ]);
    expect(result.readingMemory?.textSummaries.map((summary) => summary.summary)).toEqual([
      '第一段摘要。',
      '第二段摘要。',
    ]);
    expect(
      result.readingMemory?.readingTraces.find((trace) => trace.scope === 'chapter')?.items[0]
        ?.content,
    ).toBe('第一段有效点需要后续验证。');
  });
});

function promptBeforeOutputFormat(prompt: string | undefined) {
  return prompt?.split('\n\n## 输出格式\n')[0];
}

function emitJson(onDelta: (delta: string) => void, value: Record<string, unknown>) {
  onDelta(`${JSON.stringify(value)}\n`);
}

function emitJsonInChunks(onDelta: (delta: string) => void, value: Record<string, unknown>) {
  const json = JSON.stringify(value);
  onDelta(json.slice(0, 18));
  onDelta(`${json.slice(18)}\n`);
}

function suggestion(exact: string, moveType: string) {
  return {
    exact,
    type: 'key_point',
    readingIntent: 'explain',
    moveType,
    whyHere: '这里值得批注。',
    evidenceUsed: ['localText'],
    confidence: 'high',
    shouldShow: true,
    comment: `围绕${exact}给出一个可继续思考的问题。`,
  };
}

function testProvider(): LlmProvider {
  return {
    id: 'provider_1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://example.test',
    apiKey: 'key',
    modelName: 'model',
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  };
}

function testAgent(): Agent {
  return {
    id: 'agent_lin',
    kind: 'annotation',
    providerId: 'provider_1',
    enabled: true,
    nickname: '林知微',
    username: '林知微',
    avatar: '',
    annotationColor: '#6fa48f',
    annotationDensity: 'high',
    temperature: 0.35,
    soul: readingPartnerSoul,
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  };
}
