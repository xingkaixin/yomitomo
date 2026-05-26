import type { Agent, AgentAnnotatePayload, AgentAnnotateResult } from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { readingMemoryEntriesFromMemoryDelta, readingMemoryFromEntries } from '@yomitomo/core';
import { appendReadingMemoryEntries, readReadingMemoryEntries } from './reading-memory-store';

export function agentAnnotatePayloadWithReadingMemoryEntries(input: {
  payload: AgentAnnotatePayload;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
}): AgentAnnotatePayload {
  const articleId = input.payload.article.id;
  if (!articleId) return input.payload;

  try {
    const memory = readingMemoryFromEntries(readReadingMemoryEntries({ articleId }));
    if (!memory) return input.payload;
    return {
      ...input.payload,
      readingMemory: memory,
    };
  } catch (error) {
    input.logError('reading_memory.read_failed', error, { articleId });
    return input.payload;
  }
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
    const entries = readingMemoryEntriesFromMemoryDelta({
      articleId,
      agentId: input.agent.id,
      sourceTaskId: makeId('reading_memory_task'),
      createdAt: input.now || new Date().toISOString(),
      current: input.payload.readingMemory,
      next,
    });
    if (entries.length === 0) return;
    appendReadingMemoryEntries(entries);
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
