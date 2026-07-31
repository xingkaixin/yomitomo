import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentMessagePayload,
} from '@yomitomo/shared';
import type { AgentMessageReadingContextSnapshot } from '@yomitomo/ai';
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
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';
import { createAgentMessageReadingContextSnapshot } from '../assistant/assistant-reading-tools';

type AgentReadingMemoryLogger = {
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
};

export type AgentReadingMemoryPort = {
  executor: ReadingMemorySqliteExecutor;
  enrichAnnotatePayload: (payload: AgentAnnotatePayload) => AgentAnnotatePayload;
  enrichMessagePayload: (payload: AgentMessagePayload) => AgentMessagePayload;
  saveAnnotateEntries: (input: {
    agent: Agent;
    payload: AgentAnnotatePayload;
    result: AgentAnnotateResult;
  }) => void;
  createMessageReadingContextSnapshot: (input: {
    payload: AgentMessagePayload;
    agentId: string;
  }) => AgentMessageReadingContextSnapshot | undefined;
};

export function createLazyReadingMemoryExecutor(
  resolveExecutor: () => ReadingMemorySqliteExecutor,
): ReadingMemorySqliteExecutor {
  return {
    exec: (sql) => resolveExecutor().exec(sql),
    prepare: (sql) => resolveExecutor().prepare(sql),
  };
}

export function createAgentReadingMemoryPort(input: {
  executor: ReadingMemorySqliteExecutor;
  logger: AgentReadingMemoryLogger;
}): AgentReadingMemoryPort {
  return {
    executor: input.executor,
    enrichAnnotatePayload: (payload) =>
      agentAnnotatePayloadWithReadingMemoryEntries({
        payload,
        executor: input.executor,
        logInfo: input.logger.logInfo,
        logError: input.logger.logError,
      }),
    enrichMessagePayload: (payload) =>
      agentMessagePayloadWithReadingMemoryView({
        payload,
        executor: input.executor,
        logInfo: input.logger.logInfo,
        logError: input.logger.logError,
      }),
    saveAnnotateEntries: ({ agent, payload, result }) =>
      saveAgentAnnotateReadingMemoryEntries({
        agent,
        payload,
        result,
        executor: input.executor,
        logError: input.logger.logError,
      }),
    createMessageReadingContextSnapshot: ({ payload, agentId }) => {
      try {
        return createAgentMessageReadingContextSnapshot({
          payload,
          agentId,
          executor: input.executor,
        });
      } catch (error) {
        input.logger.logError('reading_context.snapshot_failed', error, {
          articleId: payload.article.id,
          agentId,
        });
        return undefined;
      }
    },
  };
}

export function agentAnnotatePayloadWithReadingMemoryEntries(input: {
  payload: AgentAnnotatePayload;
  executor?: ReadingMemorySqliteExecutor;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
}): AgentAnnotatePayload {
  const articleId = input.payload.article.id;
  if (!articleId) return input.payload;

  try {
    const entries = readReadingMemoryEntries({
      articleId,
      performanceLogger: input.logInfo,
      executor: input.executor,
    });
    const memory = readingMemoryFromEntries(entries);
    const viewRequest = readingMemoryViewRequestForAnnotatePayload(input.payload);
    const readingMemoryView = viewRequest
      ? buildReadingMemoryView({
          ...viewRequest,
          executor: input.executor,
          performanceLogger: input.logInfo,
        })
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
  executor?: ReadingMemorySqliteExecutor;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
}): AgentMessagePayload {
  const articleId = input.payload.article.id;
  if (!articleId) return input.payload;

  try {
    const viewRequest = readingMemoryViewRequestForMessagePayload(input.payload);
    const readingMemoryView = viewRequest
      ? buildReadingMemoryView({
          ...viewRequest,
          executor: input.executor,
          performanceLogger: input.logInfo,
        })
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
  executor?: ReadingMemorySqliteExecutor;
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
    appendReadingMemoryEntries(
      [
        ...entries,
        ...readingMemoryAnchorCheckpointEntries({
          articleText: input.payload.article.text,
          ebookIndex: input.payload.article.ebookIndex,
          sourceTaskId,
          createdAt,
          entries,
        }),
      ],
      input.executor,
    );
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
