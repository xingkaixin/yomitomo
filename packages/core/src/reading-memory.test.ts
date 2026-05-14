import { describe, expect, it } from 'vitest';
import type { ReadingMemory, TraceItem } from '@yomitomo/shared';
import { mergeReadingMemory } from './reading-memory';

describe('reading memory', () => {
  it('overwrites segment summaries for the same source range', () => {
    const merged = mergeReadingMemory(
      memory({
        summaries: [{ summary: '旧摘要', terms: ['旧'] }],
      }),
      memory({
        summaries: [{ summary: '新摘要', terms: ['新', '新'] }],
      }),
    );

    expect(merged?.textSummaries).toHaveLength(1);
    expect(merged?.textSummaries[0]).toMatchObject({
      summary: '新摘要',
      keyTerms: ['新'],
    });
  });

  it('deduplicates trace items and caps segment trace length', () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      traceItem(`关注点 ${index < 2 ? 1 : index}`),
    );

    const merged = mergeReadingMemory(undefined, memory({ traceItems: items }));

    expect(merged?.readingTraces[0]?.items).toHaveLength(6);
    expect(merged?.readingTraces[0]?.items.map((item) => item.content)).toEqual([
      '关注点 2',
      '关注点 3',
      '关注点 4',
      '关注点 5',
      '关注点 6',
      '关注点 7',
    ]);
  });

  it('keeps summaries when a segment has no trace items', () => {
    const merged = mergeReadingMemory(
      undefined,
      memory({
        summaries: [{ summary: '这一段交代背景。', terms: ['背景'] }],
        traceItems: [],
      }),
    );

    expect(merged?.textSummaries[0]?.summary).toBe('这一段交代背景。');
    expect(merged?.readingTraces).toEqual([]);
  });
});

function memory(input: {
  summaries?: Array<{ summary: string; terms: string[] }>;
  traceItems?: TraceItem[];
}): ReadingMemory {
  return {
    updatedAt: '2026-05-14T00:00:00.000Z',
    textSummaries: (input.summaries || []).map((summary) => ({
      scope: 'segment',
      chapterId: 'chapter-1',
      segmentId: 'segment-1',
      sourceRange: { textStart: 0, textEnd: 100 },
      summary: summary.summary,
      keyTerms: summary.terms,
      updatedAt: '2026-05-14T00:00:00.000Z',
    })),
    readingTraces:
      input.traceItems === undefined
        ? [
            {
              scope: 'segment',
              chapterId: 'chapter-1',
              segmentId: 'segment-1',
              sourceRange: { textStart: 0, textEnd: 100 },
              items: [traceItem('默认关注点')],
              updatedAt: '2026-05-14T00:00:00.000Z',
            },
          ]
        : [
            {
              scope: 'segment',
              chapterId: 'chapter-1',
              segmentId: 'segment-1',
              sourceRange: { textStart: 0, textEnd: 100 },
              items: input.traceItems,
              updatedAt: '2026-05-14T00:00:00.000Z',
            },
          ],
  };
}

function traceItem(content: string): TraceItem {
  return {
    type: 'agent_observation',
    content,
    evidenceAnchors: [],
    confidence: 'medium',
    createdFromTask: 'chapter_segment_annotation',
  };
}
