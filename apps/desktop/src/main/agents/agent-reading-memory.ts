import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentMessagePayload,
  ReadingMemoryEntry,
} from '@yomitomo/shared';
import type { AgentMessageReadingContextSnapshot, ReadingEvidence } from '@yomitomo/ai';
import { makeId } from '@yomitomo/shared';
import {
  readingMemoryAnchorCheckpointEntries,
  readingMemoryEntriesFromMemoryDelta,
  readingMemoryEntrySearchText,
  readingMemoryFromEntries,
  readingMemoryViewRequestForAnnotatePayload,
  readingMemoryViewRequestForMessagePayload,
} from '@yomitomo/core';
import {
  appendReadingMemoryEntries,
  buildReadingMemoryView,
  readReadingMemoryEntries,
  searchReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';

const MEMORY_EVIDENCE_PER_QUERY = 6;

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
        return createAgentMessageReadingContextSnapshot(payload, input.executor);
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

function createAgentMessageReadingContextSnapshot(
  payload: AgentMessagePayload,
  executor: ReadingMemorySqliteExecutor,
): AgentMessageReadingContextSnapshot | undefined {
  const articleId = payload.article.id;
  if (!articleId) return undefined;

  const queries = snapshotSearchQueries([
    payload.annotation.anchor.exact,
    payload.userComment.content,
    payload.instruction,
  ]);
  const memoryEvidence = uniqueEvidence(
    queries.flatMap((query) =>
      searchReadingMemoryEntries({
        articleId,
        query,
        limit: MEMORY_EVIDENCE_PER_QUERY,
        visibility: ['default'],
        fallbackToSubstring: true,
        executor,
      }).map(memoryEntryEvidence),
    ),
  );
  return memoryEvidence.length > 0 ? { memoryEvidence } : undefined;
}

function memoryEntryEvidence(entry: ReadingMemoryEntry): ReadingEvidence {
  const summary = readingMemoryEntrySearchText(entry) || `${entry.kind}:${entry.scope}:${entry.id}`;
  return {
    summary,
    text: summary,
    provenance: {
      articleId: entry.articleId,
      sourceType: entry.sourceType,
      sourceAnnotationId: entry.sourceAnnotationId,
      sourceCommentId: entry.sourceCommentId,
      agentId: entry.agentId,
      authorType: memoryAuthorType(entry),
      anchor: entry.anchor,
      textStart: entry.textRange?.textStart,
      textEnd: entry.textRange?.textEnd,
      createdAt: entry.createdAt,
    },
  };
}

function memoryAuthorType(entry: ReadingMemoryEntry) {
  if (entry.agentId) return 'ai' as const;
  if (entry.readerId || entry.scope === 'reader') return 'user' as const;
  return undefined;
}

function uniqueEvidence(evidence: ReadingEvidence[]) {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = [
      item.provenance.sourceAnnotationId,
      item.provenance.sourceCommentId,
      item.provenance.sourceType,
      item.summary,
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function snapshotSearchQueries(values: Array<string | undefined>) {
  const queries = values.flatMap((value) => {
    const text = value?.trim();
    if (!text) return [];
    return [text, ...cjkSearchWindows(text)];
  });
  return Array.from(new Set(queries)).slice(0, 12);
}

function cjkSearchWindows(text: string) {
  const normalized = text.replace(/[^\p{L}\p{N}_]+/gu, '');
  if (!/[\p{Script=Han}]/u.test(normalized) || normalized.length <= 4) return [];
  const windows: string[] = [];
  for (let index = 0; index <= normalized.length - 4 && windows.length < 6; index += 1) {
    windows.push(normalized.slice(index, index + 4));
  }
  return windows;
}
