import type { Agent, AgentAnnotatePayload, AgentAnnotateResult } from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import {
  readingMemoryAnchorCheckpointEntries,
  readingMemoryEntriesFromMemoryDelta,
  readingMemoryFromEntries,
} from '@yomitomo/core';
import {
  appendReadingMemoryEntries,
  buildReadingMemoryView,
  readReadingMemoryEntries,
} from './reading-memory-store';

export function agentAnnotatePayloadWithReadingMemoryEntries(input: {
  payload: AgentAnnotatePayload;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
}): AgentAnnotatePayload {
  const articleId = input.payload.article.id;
  if (!articleId) return input.payload;

  try {
    const entries = readReadingMemoryEntries({ articleId });
    const memory = readingMemoryFromEntries(entries);
    const readingMemoryView = agentAnnotateMemoryView(input.payload, articleId);
    if (!memory && (!readingMemoryView || readingMemoryView.entries.length === 0)) {
      return input.payload;
    }
    return {
      ...input.payload,
      readingMemory: memory || input.payload.readingMemory,
      readingMemoryView,
    };
  } catch (error) {
    input.logError('reading_memory.read_failed', error, { articleId });
    return input.payload;
  }
}

function agentAnnotateMemoryView(payload: AgentAnnotatePayload, articleId: string) {
  const index = payload.article.ebookIndex;
  const firstPlanItem = payload.readingPlan?.[0];
  if (!index || !firstPlanItem) return undefined;

  const segment = index.segments.find(
    (item) =>
      item.textStart < firstPlanItem.sectionEnd && item.textEnd > firstPlanItem.sectionStart,
  );
  if (!segment) return undefined;
  const chapter = index.chapters.find((item) => item.id === segment.chapterId);
  if (!chapter) return undefined;
  const textRange = {
    textStart: Math.max(segment.textStart, firstPlanItem.sectionStart),
    textEnd: Math.min(segment.textEnd, firstPlanItem.sectionEnd),
  };
  if (textRange.textEnd <= textRange.textStart) return undefined;

  return buildReadingMemoryView({
    articleId,
    viewType: 'segment',
    chapterId: chapter.id,
    segmentId: segment.id,
    textRange,
    query: [
      firstPlanItem.sectionSummary || '',
      firstPlanItem.sectionTag || '',
      payload.readingIntent || '',
      payload.instruction || '',
      ...(firstPlanItem.messages || []).map((message) => message.content),
    ].join(' '),
    readerProgress: payload.readerProgress || {
      currentChapterId: chapter.id,
      currentSegmentId: segment.id,
      readChapterIds: index.chapters
        .filter((item) => item.indexInBook < chapter.indexInBook)
        .map((item) => item.id),
      readUntilTextOffset: textRange.textEnd,
    },
  });
}

export function saveAgentAnnotateReadingMemoryEntries(input: {
  agent: Agent;
  payload: AgentAnnotatePayload;
  result: AgentAnnotateResult;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
  now?: string;
}) {
  const articleId = input.payload.article.id;
  const next = input.result.readingMemory;
  if (!articleId || !next) return;

  try {
    const sourceTaskId = makeId('reading_memory_task');
    const createdAt = input.now || new Date().toISOString();
    const entries = readingMemoryEntriesFromMemoryDelta({
      articleId,
      agentId: input.agent.id,
      sourceTaskId,
      createdAt,
      current: input.payload.readingMemory,
      next,
    });
    if (entries.length === 0) return;
    appendReadingMemoryEntries([
      ...entries,
      ...readingMemoryAnchorCheckpointEntries({
        articleText: input.payload.article.text,
        ebookIndex: input.payload.article.ebookIndex,
        sourceTaskId,
        createdAt,
        entries,
      }),
    ]);
  } catch (error) {
    input.logError('reading_memory.write_failed', error, {
      articleId,
      agentId: input.agent.id,
      agentUsername: input.agent.username,
      memorySummaryCount: input.result.readingMemory?.textSummaries.length || 0,
      memoryTraceCount: input.result.readingMemory?.readingTraces.length || 0,
    });
  }
}
