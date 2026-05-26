import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentAnnotatePayload, AgentAnnotateResult } from '@yomitomo/shared';

const memoryStore = vi.hoisted(() => ({
  appendReadingMemoryEntries: vi.fn(),
}));

vi.mock('./reading-memory-store', () => memoryStore);

import { saveAgentAnnotateReadingMemoryEntries } from './agent-reading-memory';

describe('agent reading memory persistence', () => {
  beforeEach(() => {
    memoryStore.appendReadingMemoryEntries.mockReset();
  });

  it('appends changed reading memory entries for article-scoped annotate results', () => {
    const logError = vi.fn();

    saveAgentAnnotateReadingMemoryEntries({
      agent: annotationAgent(),
      payload: annotatePayload(),
      result: annotateResult(),
      logError,
      now: '2026-05-26T00:00:00.000Z',
    });

    expect(memoryStore.appendReadingMemoryEntries).toHaveBeenCalledTimes(1);
    const entries = memoryStore.appendReadingMemoryEntries.mock.calls[0]?.[0];
    expect(entries).toMatchObject([
      {
        articleId: 'article_1',
        kind: 'summary',
        scope: 'segment',
        agentId: 'agent_1',
        sourceType: 'ai_task',
        payload: { summary: '新摘要', keyTerms: ['新'] },
      },
      {
        articleId: 'article_1',
        kind: 'trace',
        scope: 'chapter',
        agentId: 'agent_1',
        sourceType: 'ai_task',
      },
    ]);
    expect(entries?.[0]?.sourceTaskId).toMatch(/^reading_memory_task_/);
    expect(logError).not.toHaveBeenCalled();
  });

  it('skips persistence when the prompt article has no article id', () => {
    const payload = annotatePayload();
    payload.article.id = undefined;

    saveAgentAnnotateReadingMemoryEntries({
      agent: annotationAgent(),
      payload,
      result: annotateResult(),
      logError: vi.fn(),
    });

    expect(memoryStore.appendReadingMemoryEntries).not.toHaveBeenCalled();
  });

  it('logs memory write failures without throwing', () => {
    const logError = vi.fn();
    memoryStore.appendReadingMemoryEntries.mockImplementationOnce(() => {
      throw new Error('write failed');
    });

    expect(() =>
      saveAgentAnnotateReadingMemoryEntries({
        agent: annotationAgent(),
        payload: annotatePayload(),
        result: annotateResult(),
        logError,
      }),
    ).not.toThrow();

    expect(logError).toHaveBeenCalledWith(
      'reading_memory.write_failed',
      expect.any(Error),
      expect.objectContaining({
        articleId: 'article_1',
        agentId: 'agent_1',
        memorySummaryCount: 1,
        memoryTraceCount: 1,
      }),
    );
  });
});

function annotationAgent(): Agent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    providerId: 'provider_1',
    nickname: '助手',
    username: 'assistant',
    avatar: '',
    annotationColor: '#f4c95d',
    annotationDensity: 'medium',
    enabled: true,
    temperature: 0.5,
    soul: '',
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
}

function annotatePayload(): AgentAnnotatePayload {
  return {
    agentId: 'agent_1',
    agentUsername: 'assistant',
    article: {
      id: 'article_1',
      title: '文章',
      url: 'https://example.com',
      text: '正文',
    },
    readingMemory: {
      updatedAt: '2026-05-26T00:00:00.000Z',
      textSummaries: [],
      readingTraces: [],
    },
  };
}

function annotateResult(): AgentAnnotateResult {
  return {
    annotations: [],
    readingMemory: {
      updatedAt: '2026-05-26T00:00:00.000Z',
      textSummaries: [
        {
          scope: 'segment',
          chapterId: 'chapter_1',
          segmentId: 'segment_1',
          sourceRange: { textStart: 0, textEnd: 100 },
          summary: '新摘要',
          keyTerms: ['新'],
          updatedAt: '2026-05-26T00:00:00.000Z',
        },
      ],
      readingTraces: [
        {
          scope: 'chapter',
          chapterId: 'chapter_1',
          agentId: 'agent_1',
          sourceRange: { textStart: 0, textEnd: 100 },
          items: [
            {
              type: 'agent_observation',
              content: '新 trace',
              evidenceAnchors: [],
              confidence: 'medium',
              createdFromTask: 'chapter_segment_annotation',
            },
          ],
          updatedAt: '2026-05-26T00:00:00.000Z',
        },
      ],
    },
  };
}
