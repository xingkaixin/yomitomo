import type {
  AssistantToolCall,
  AssistantToolDefinition,
  AssistantToolEvidenceInput,
  AssistantToolExecutionResult,
} from '@yomitomo/ai';
import type {
  Annotation,
  ArticleRecord,
  ReaderProgress,
  ReadingMemoryEntry,
  TextAnchor,
} from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import {
  buildCurrentChapterLexicalRelatedPassages,
  readingMemoryEntrySearchText,
  selectionThreadSpoilerPolicy,
} from '@yomitomo/core';
import {
  searchReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from './reading-memory-store';

const DEFAULT_TOOL_LIMIT = 6;
const ANCHOR_CONTEXT_RADIUS = 700;

export type AssistantReadingToolExecutorInput = {
  article: Pick<ArticleRecord, 'id' | 'title' | 'annotations' | 'ebook'>;
  articleText: string;
  agentId: string;
  currentAnnotationId?: string;
  currentAnchor?: TextAnchor;
  readerProgress?: ReaderProgress;
  executor?: ReadingMemorySqliteExecutor;
};

export const assistantReadingToolDefinitions: AssistantToolDefinition[] = [
  {
    name: 'get_current_thread',
    description: '读取当前批注 thread 的锚点、批注和评论。',
  },
  {
    name: 'get_anchor_context',
    description: '读取当前 anchor 附近原文。',
  },
  {
    name: 'search_article_passages',
    description: '在当前文章原文内按关键词检索 passage。',
    validateInput: requireQuery,
  },
  {
    name: 'search_article_memory',
    description: '检索当前文章内公开可见的阅读记忆。',
    validateInput: requireQuery,
  },
  {
    name: 'search_own_memory',
    description: '只检索当前助手自己在当前文章留下的阅读记忆。',
    validateInput: requireQuery,
  },
  {
    name: 'search_other_agents_memory',
    description: '检索其他助手在当前文章留下的公开阅读记忆。',
    validateInput: requireQuery,
  },
  {
    name: 'check_duplicate_thought',
    description: '检查候选想法是否和当前 anchor 附近记忆重复。',
    validateInput: requireCandidateThought,
  },
];

export function createAssistantReadingToolExecutor(input: AssistantReadingToolExecutorInput) {
  return async (toolCall: AssistantToolCall): Promise<AssistantToolExecutionResult> => {
    try {
      switch (toolCall.name) {
        case 'get_current_thread':
          return okEvidence(currentThreadEvidence(input, toolCall.input));
        case 'get_anchor_context':
          return okEvidence(anchorContextEvidence(input, toolCall.input));
        case 'search_article_passages':
          return okEvidence(searchArticlePassageEvidence(input, toolCall.input));
        case 'search_article_memory':
          return okEvidence(searchMemoryEvidence(input, toolCall.input));
        case 'search_own_memory':
          return okEvidence(
            searchMemoryEvidence(input, toolCall.input, { agentId: input.agentId }),
          );
        case 'search_other_agents_memory':
          return okEvidence(
            searchMemoryEvidence(input, toolCall.input, {
              excludeAgentId: input.agentId,
              requireAgentId: true,
            }),
          );
        case 'check_duplicate_thought':
          return okEvidence(duplicateThoughtEvidence(input, toolCall.input));
      }
    } catch (error) {
      return {
        ok: false,
        failureReason: error instanceof Error ? error.message : 'tool_execution_failed',
      };
    }
  };
}

function currentThreadEvidence(
  input: AssistantReadingToolExecutorInput,
  raw: unknown,
): AssistantToolEvidenceInput[] {
  const annotation = annotationForTool(input, stringField(recordField(raw, 'annotationId')));
  if (!annotation) return [];
  const comments = annotation.comments.map(formatComment).join('\n');
  const text = [
    `selection: ${annotation.anchor.exact}`,
    `annotation: ${annotation.author}${annotation.agentNickname ? ` / ${annotation.agentNickname}` : ''}`,
    comments ? `comments:\n${comments}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    {
      summary: `当前 thread：${annotation.anchor.exact}`,
      text,
      provenance: annotationProvenance(input.article.id, annotation),
    },
  ];
}

function anchorContextEvidence(
  input: AssistantReadingToolExecutorInput,
  raw: unknown,
): AssistantToolEvidenceInput[] {
  const annotation = annotationForTool(input, stringField(recordField(raw, 'annotationId')));
  const anchor = anchorFromInput(raw) || annotation?.anchor || input.currentAnchor;
  if (!anchor) return [];
  const range = anchorRange(input.articleText, anchor);
  const textStart = Math.max(0, range.textStart - ANCHOR_CONTEXT_RADIUS);
  const textEnd = Math.min(input.articleText.length, range.textEnd + ANCHOR_CONTEXT_RADIUS);
  const text = input.articleText.slice(textStart, textEnd).trim();
  if (!text) return [];
  return [
    {
      summary: `当前 anchor 附近原文：${anchor.exact}`,
      text,
      provenance: {
        articleId: input.article.id,
        sourceType: 'original_text',
        sourceAnnotationId: annotation?.id,
        anchor,
        textStart,
        textEnd,
      },
    },
  ];
}

function searchArticlePassageEvidence(
  input: AssistantReadingToolExecutorInput,
  raw: unknown,
): AssistantToolEvidenceInput[] {
  const query = queryField(raw);
  if (!query) return [];
  const limit = limitField(raw);
  const index = input.article.ebook?.index;
  if (index) {
    return buildCurrentChapterLexicalRelatedPassages({
      articleText: input.articleText,
      ebookIndex: index,
      query,
      targetAnchor: input.currentAnchor,
      readerProgress: input.readerProgress,
      spoilerPolicy: selectionThreadSpoilerPolicy,
      maxPassages: limit,
    }).map((passage) => ({
      summary: passage.reason || `原文 passage：${passage.text.slice(0, 80)}`,
      text: passage.text,
      provenance: {
        articleId: input.article.id,
        sourceType: 'original_text',
        anchor: passage.anchor,
        textStart: passage.textStart,
        textEnd: passage.textEnd,
      },
    }));
  }
  return fallbackPassageSearch(input, query, limit);
}

function searchMemoryEvidence(
  input: AssistantReadingToolExecutorInput,
  raw: unknown,
  filter: { agentId?: string; excludeAgentId?: string; requireAgentId?: boolean } = {},
): AssistantToolEvidenceInput[] {
  const query = queryField(raw);
  if (!query) return [];
  const entries = searchReadingMemoryEntries({
    articleId: input.article.id,
    query,
    limit: limitField(raw),
    visibility: ['default'],
    fallbackToSubstring: true,
    ...filter,
    executor: input.executor,
  });
  return entries.map(memoryEntryEvidence);
}

function duplicateThoughtEvidence(
  input: AssistantReadingToolExecutorInput,
  raw: unknown,
): AssistantToolEvidenceInput[] {
  const thought = stringField(recordField(raw, 'candidateThought'));
  if (!thought) return [];
  const entries = searchReadingMemoryEntries({
    articleId: input.article.id,
    query: thought,
    limit: limitField(raw),
    visibility: ['default'],
    fallbackToSubstring: true,
    executor: input.executor,
  }).filter((entry) => memoryNearAnchor(entry, input.currentAnchor));
  return entries.map((entry) => ({
    ...memoryEntryEvidence(entry),
    summary: `可能重复的既有记忆：${memoryEntrySummary(entry)}`,
  }));
}

function fallbackPassageSearch(
  input: AssistantReadingToolExecutorInput,
  query: string,
  limit: number,
): AssistantToolEvidenceInput[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const lowerText = input.articleText.toLocaleLowerCase();
  const ranges: Array<{ start: number; end: number; term: string }> = [];
  for (const term of terms) {
    const index = lowerText.indexOf(term.toLocaleLowerCase());
    if (index >= 0) ranges.push({ start: index, end: index + term.length, term });
    if (ranges.length >= limit) break;
  }
  return ranges.map((range) => {
    const textStart = Math.max(0, range.start - ANCHOR_CONTEXT_RADIUS);
    const textEnd = Math.min(input.articleText.length, range.end + ANCHOR_CONTEXT_RADIUS);
    const anchor = createTextAnchor(input.articleText, range.start, range.end);
    return {
      summary: `原文命中：${range.term}`,
      text: input.articleText.slice(textStart, textEnd).trim(),
      provenance: {
        articleId: input.article.id,
        sourceType: 'original_text',
        anchor,
        textStart,
        textEnd,
      },
    };
  });
}

function memoryEntryEvidence(entry: ReadingMemoryEntry): AssistantToolEvidenceInput {
  const summary = memoryEntrySummary(entry);
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

function memoryEntrySummary(entry: ReadingMemoryEntry) {
  return readingMemoryEntrySearchText(entry) || `${entry.kind}:${entry.scope}:${entry.id}`;
}

function memoryNearAnchor(entry: ReadingMemoryEntry, anchor: TextAnchor | undefined) {
  if (!anchor || !entry.textRange) return true;
  const range = anchorRange('', anchor);
  return (
    entry.textRange.textEnd >= range.textStart - 2400 &&
    entry.textRange.textStart <= range.textEnd + 2400
  );
}

function annotationForTool(input: AssistantReadingToolExecutorInput, annotationId: string) {
  const id = annotationId || input.currentAnnotationId;
  if (!id) return null;
  return input.article.annotations.find((annotation) => annotation.id === id) || null;
}

function annotationProvenance(articleId: string, annotation: Annotation) {
  return {
    articleId,
    sourceType: 'annotation',
    sourceAnnotationId: annotation.id,
    agentId: annotation.agentId,
    authorType: annotation.author,
    anchor: annotation.anchor,
    textStart: annotation.anchor.textStartInBook ?? annotation.anchor.start,
    textEnd: annotation.anchor.textEndInBook ?? annotation.anchor.end,
    createdAt: annotation.createdAt,
  } satisfies AssistantToolEvidenceInput['provenance'];
}

function anchorRange(articleText: string, anchor: TextAnchor) {
  const textStart = anchor.textStartInBook ?? anchor.start;
  const textEnd = anchor.textEndInBook ?? anchor.end;
  if (articleText && (textStart < 0 || textEnd > articleText.length || textEnd <= textStart)) {
    const start = articleText.indexOf(anchor.exact);
    if (start >= 0) return { textStart: start, textEnd: start + anchor.exact.length };
  }
  return { textStart, textEnd };
}

function memoryAuthorType(entry: ReadingMemoryEntry) {
  if (entry.agentId) return 'ai' as const;
  if (entry.readerId || entry.scope === 'reader') return 'user' as const;
  return undefined;
}

function anchorFromInput(raw: unknown): TextAnchor | undefined {
  const anchor = recordField(raw, 'anchor');
  if (!isRecord(anchor)) return undefined;
  if (
    typeof anchor.exact === 'string' &&
    typeof anchor.prefix === 'string' &&
    typeof anchor.suffix === 'string' &&
    typeof anchor.start === 'number' &&
    typeof anchor.end === 'number'
  ) {
    return anchor as TextAnchor;
  }
  return undefined;
}

function okEvidence(evidence: AssistantToolEvidenceInput[]): AssistantToolExecutionResult {
  return { ok: true, evidence };
}

function formatComment(comment: Annotation['comments'][number]) {
  const author =
    comment.author === 'ai'
      ? comment.agentNickname || comment.agentUsername || 'assistant'
      : comment.userNickname || comment.userUsername || 'user';
  return `${author}: ${comment.content}`;
}

function requireQuery(input: unknown) {
  return queryField(input) ? null : 'missing_query';
}

function requireCandidateThought(input: unknown) {
  return stringField(recordField(input, 'candidateThought')) ? null : 'missing_candidate_thought';
}

function queryField(input: unknown) {
  return stringField(recordField(input, 'query'));
}

function limitField(input: unknown) {
  const value = Number(recordField(input, 'limit'));
  return Number.isInteger(value) && value > 0 ? Math.min(value, 20) : DEFAULT_TOOL_LIMIT;
}

function queryTerms(query: string) {
  return Array.from(query.matchAll(/[\p{L}\p{M}\p{N}_]+/gu), (match) => match[0]).slice(0, 8);
}

function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
