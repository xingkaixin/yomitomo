import type { AssistantToolEvidenceInput } from '@yomitomo/ai';
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
} from '../reading-memory/reading-memory-store';

const DEFAULT_CONTEXT_LIMIT = 6;
const ANCHOR_CONTEXT_RADIUS = 700;

export type AssistantReadingContextProviderInput = {
  article: Pick<ArticleRecord, 'id' | 'title' | 'annotations' | 'ebook'>;
  articleText: string;
  agentId: string;
  currentAnnotationId?: string;
  currentThreadRootCommentId?: string;
  currentAnchor?: TextAnchor;
  readerProgress?: ReaderProgress;
  executor?: ReadingMemorySqliteExecutor;
};

type MemorySearchFilter = {
  agentId?: string;
  excludeAgentId?: string;
  requireAgentId?: boolean;
};

export type AssistantReadingContextProvider = ReturnType<
  typeof createAssistantReadingContextProvider
>;

export function createAssistantReadingContextProvider(input: AssistantReadingContextProviderInput) {
  return {
    currentThread(raw: unknown) {
      return currentThreadEvidence(input, raw);
    },
    anchorContext(raw: unknown) {
      return anchorContextEvidence(input, raw);
    },
    searchArticlePassages(raw: unknown) {
      return searchArticlePassageEvidence(input, raw);
    },
    searchArticleMemory(raw: unknown) {
      return searchMemoryEvidence(input, raw);
    },
    searchOwnMemory(raw: unknown) {
      return searchMemoryEvidence(input, raw, { agentId: input.agentId });
    },
    searchOtherAgentsMemory(raw: unknown) {
      return searchMemoryEvidence(input, raw, {
        excludeAgentId: input.agentId,
        requireAgentId: true,
      });
    },
    checkDuplicateThought(raw: unknown) {
      return duplicateThoughtEvidence(input, raw);
    },
  };
}

function currentThreadEvidence(
  input: AssistantReadingContextProviderInput,
  raw: unknown,
): AssistantToolEvidenceInput[] {
  const annotation = annotationForTool(input, stringField(recordField(raw, 'annotationId')));
  if (!annotation) return [];
  const rootComment = rootCommentForThread(annotation, input.currentThreadRootCommentId);
  const threadComments = commentsForThread(annotation, rootComment?.id);
  const latestUserComment = threadComments
    .toReversed()
    .find((comment) => comment.author === 'user');
  const comments = threadComments.map(formatThreadComment).join('\n');
  const text = [
    `selection: ${annotation.anchor.exact}`,
    `annotation_author: ${annotationAuthorLabel(annotation)}`,
    rootComment ? `original_thought_author: ${formatCommentAuthor(rootComment)}` : '',
    rootComment ? `original_thought: ${rootComment.content}` : '',
    latestUserComment
      ? `latest_user_comment: ${formatCommentAuthor(latestUserComment)}: ${latestUserComment.content}`
      : '',
    comments ? `thread_messages:\n${comments}` : '',
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
  input: AssistantReadingContextProviderInput,
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
  input: AssistantReadingContextProviderInput,
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
  input: AssistantReadingContextProviderInput,
  raw: unknown,
  filter: MemorySearchFilter = {},
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
  input: AssistantReadingContextProviderInput,
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
  return entries.map((entry) => {
    const evidence = memoryEntryEvidence(entry);
    evidence.summary = `可能重复的既有记忆：${memoryEntrySummary(entry)}`;
    return evidence;
  });
}

function fallbackPassageSearch(
  input: AssistantReadingContextProviderInput,
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

function annotationForTool(input: AssistantReadingContextProviderInput, annotationId: string) {
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
    return {
      exact: anchor.exact,
      prefix: anchor.prefix,
      suffix: anchor.suffix,
      start: anchor.start,
      end: anchor.end,
      paragraphId: stringField(anchor.paragraphId) || undefined,
      chapterId: stringField(anchor.chapterId) || undefined,
      segmentId: stringField(anchor.segmentId) || undefined,
      textStartInParagraph: numberField(anchor.textStartInParagraph),
      textEndInParagraph: numberField(anchor.textEndInParagraph),
      textStartInBook: numberField(anchor.textStartInBook),
      textEndInBook: numberField(anchor.textEndInBook),
      quoteHash: stringField(anchor.quoteHash) || undefined,
    };
  }
  return undefined;
}

function rootCommentForThread(annotation: Annotation, rootCommentId: string | undefined) {
  if (rootCommentId) {
    const exact = annotation.comments.find((comment) => comment.id === rootCommentId);
    if (exact?.replyTo) {
      return annotation.comments.find((comment) => comment.id === exact.replyTo) || exact;
    }
    if (exact) return exact;
  }
  return (
    annotation.comments.find((comment) => !comment.replyTo && comment.content.trim()) ||
    annotation.comments.find((comment) => comment.content.trim())
  );
}

function commentsForThread(annotation: Annotation, rootCommentId: string | undefined) {
  if (!rootCommentId) return annotation.comments.filter((comment) => comment.content.trim());
  const focused = annotation.comments.filter(
    (comment) =>
      comment.content.trim() && (comment.id === rootCommentId || comment.replyTo === rootCommentId),
  );
  return focused.length > 0
    ? focused
    : annotation.comments.filter((comment) => comment.content.trim());
}

function annotationAuthorLabel(annotation: Annotation) {
  if (annotation.author === 'ai') {
    return annotation.agentNickname || annotation.agentUsername || 'assistant';
  }
  return annotation.userNickname || annotation.userUsername || 'user';
}

function formatThreadComment(comment: Annotation['comments'][number]) {
  const role = comment.replyTo ? `reply_to:${comment.replyTo}` : 'root_thought';
  return `${role} ${formatCommentAuthor(comment)}: ${comment.content}`;
}

function formatCommentAuthor(comment: Annotation['comments'][number]) {
  const author =
    comment.author === 'ai'
      ? comment.agentNickname || comment.agentUsername || 'assistant'
      : comment.userNickname || comment.userUsername || 'user';
  return comment.author === 'ai' && comment.agentUsername
    ? `${author} (@${comment.agentUsername})`
    : author;
}

function queryField(input: unknown) {
  return stringField(recordField(input, 'query'));
}

function limitField(input: unknown) {
  const value = Number(recordField(input, 'limit'));
  return Number.isInteger(value) && value > 0 ? Math.min(value, 20) : DEFAULT_CONTEXT_LIMIT;
}

function queryTerms(query: string) {
  return Array.from(query.matchAll(/[\p{L}\p{M}\p{N}_]+/gu), (match) => match[0]).slice(0, 8);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
