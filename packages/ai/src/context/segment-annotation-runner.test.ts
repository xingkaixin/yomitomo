import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, LlmProvider } from '@yomitomo/shared';
import { readingPartnerSoul } from '@yomitomo/shared';
import { buildEpubBookIndex, epubIndexText } from '@yomitomo/core';
import { buildSegmentAnnotationTasks } from './segment-annotation-context';
import { runAgentSegmentAnnotateStreamWithMemory } from './segment-annotation-runner';

const providerMocks = vi.hoisted(() => ({
  callProviderText: vi.fn(),
  streamProviderText: vi.fn(),
}));

vi.mock('../provider/provider-client', () => ({
  callProviderText: providerMocks.callProviderText,
  streamProviderText: providerMocks.streamProviderText,
}));

beforeEach(() => {
  providerMocks.callProviderText.mockReset();
  providerMocks.streamProviderText.mockReset();
});

describe('runAgentSegmentAnnotateStreamWithMemory', () => {
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
    providerMocks.streamProviderText.mockImplementation(async (_provider, request, onDelta) => {
      streamPrompts.push(request.user);
      if (streamPrompts.length === 1) {
        emitJson(onDelta, suggestion(secondExact, 'challenge_argument'));
        emitJsonInChunks(onDelta, suggestion(firstExact, 'challenge_argument'));
      } else if (streamPrompts.length === 2) {
        emitJson(onDelta, suggestion(secondExact, 'ask_question'));
        emitJson(onDelta, suggestion(duplicateMoveExact, 'ask_question'));
      }
      return { text: '' };
    });
    providerMocks.callProviderText.mockImplementation(async (_provider, request) => {
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
      return JSON.stringify({
        segmentSummary: { summary, keyTerms: [] },
        segmentTrace: { items: traceItems },
      });
    });
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
    expect(providerMocks.streamProviderText).toHaveBeenCalledTimes(2);
    expect(providerMocks.callProviderText).toHaveBeenCalledTimes(2);
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
