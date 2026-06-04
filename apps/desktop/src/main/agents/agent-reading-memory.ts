import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentMessagePayload,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import {
  readingMemoryAnchorCheckpointEntries,
  readingMemoryEntriesFromMemoryDelta,
  readingMemoryFromEntries,
  readingMemoryViewRequestForAnnotatePayload,
  readingMemoryViewRequestForMessagePayload,
} from '@yomitomo/core';
import {
  appendReadingMemoryEntries,
  buildReadingMemoryView,
  readReadingMemoryEntries,
} from '../reading-memory/reading-memory-store';

export function agentAnnotatePayloadWithReadingMemoryEntries(input: {
  payload: AgentAnnotatePayload;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
}): AgentAnnotatePayload {
  const articleId = input.payload.article.id;
  if (!articleId) return input.payload;

  try {
    const entries = readReadingMemoryEntries({
      articleId,
      performanceLogger: input.logInfo,
    });
    const memory = readingMemoryFromEntries(entries);
    const viewRequest = readingMemoryViewRequestForAnnotatePayload(input.payload);
    const readingMemoryView = viewRequest
      ? buildReadingMemoryView({ ...viewRequest, performanceLogger: input.logInfo })
      : undefined;
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

export function agentMessagePayloadWithReadingMemoryView(input: {
  payload: AgentMessagePayload;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
}): AgentMessagePayload {
  const articleId = input.payload.article.id;
  if (!articleId) return input.payload;

  try {
    const viewRequest = readingMemoryViewRequestForMessagePayload(input.payload);
    const readingMemoryView = viewRequest
      ? buildReadingMemoryView({ ...viewRequest, performanceLogger: input.logInfo })
      : undefined;
    if (!readingMemoryView || readingMemoryView.entries.length === 0) return input.payload;
    return {
      ...input.payload,
      readingMemoryView,
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
