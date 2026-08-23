import type { ReaderProgress, TextRange } from '@yomitomo/shared';
import { uniqueNonEmptyStrings } from '@yomitomo/shared';
import type {
  BuildReadingMemoryViewOptions,
  ReadReadingMemoryEntriesOptions,
  SoftDeleteReadingMemoryEntriesBySourceOptions,
} from './reading-memory-store-types';
import type { SqliteValue } from './reading-memory-row-mapper';

export function readingMemoryWhereClause(options: ReadReadingMemoryEntriesOptions) {
  const clauses = ['article_id = ?'];
  const values: SqliteValue[] = [options.articleId];
  if (options.kind) {
    clauses.push('kind = ?');
    values.push(options.kind);
  }
  if (options.scope) {
    clauses.push('scope = ?');
    values.push(options.scope);
  }
  if (options.agentId) {
    clauses.push('agent_id = ?');
    values.push(options.agentId);
  }
  if (options.excludeAgentId) {
    clauses.push('agent_id IS NOT NULL');
    clauses.push('agent_id != ?');
    values.push(options.excludeAgentId);
  } else if (options.requireAgentId) {
    clauses.push('agent_id IS NOT NULL');
  }
  if (options.visibility && options.visibility.length > 0) {
    clauses.push(`visibility IN (${options.visibility.map(() => '?').join(', ')})`);
    values.push(...options.visibility);
  }
  if (options.chapterId) {
    clauses.push('chapter_id = ?');
    values.push(options.chapterId);
  }
  if (options.segmentId) {
    clauses.push('segment_id = ?');
    values.push(options.segmentId);
  }
  if (!options.includeDeleted) clauses.push('deleted_at IS NULL');
  return { where: `WHERE ${clauses.join('\n  AND ')}`, values };
}

export function sourceWhereClause(options: SoftDeleteReadingMemoryEntriesBySourceOptions) {
  const clauses: string[] = [];
  const values: SqliteValue[] = [];
  if (options.sourceAnnotationId) {
    clauses.push('source_annotation_id = ?');
    values.push(options.sourceAnnotationId);
  }
  if (options.sourceCommentId) {
    clauses.push('source_comment_id = ?');
    values.push(options.sourceCommentId);
  }
  if (options.sourceType && options.sourceId) {
    clauses.push('(source_type = ? AND source_id = ?)');
    values.push(options.sourceType, options.sourceId);
  }
  return { where: clauses.join(' OR '), values };
}

export function readingMemoryFtsQuery(query: string) {
  const tokens = Array.from(query.matchAll(/[\p{L}\p{M}\p{N}_]+/gu), (match) => match[0])
    .map((token) => token.trim())
    .filter(Boolean);
  const uniqueTokens = tokens.filter((token, index, list) => list.indexOf(token) === index);
  if (uniqueTokens.length === 0) return '';
  return uniqueTokens
    .slice(0, 16)
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(' ');
}

export function structuredMemoryViewCandidateClause(options: BuildReadingMemoryViewOptions) {
  const clauses = [`kind IN ('summary', 'trace', 'correction', 'reader_signal')`];
  const values: SqliteValue[] = [];

  if (options.viewType === 'selection' || options.viewType === 'selection_thread') {
    addOptionalChapterClause(clauses, values, options.chapterId);
    addNearTextRangeClause(clauses, values, options.textRange, 2400);
  } else if (options.viewType === 'article_section') {
    addNearTextRangeClause(clauses, values, options.textRange, 2400);
  } else if (options.viewType === 'segment') {
    clauses.push(`scope IN ('segment', 'chapter', 'reader')`);
    addOptionalChapterClause(clauses, values, options.chapterId);
    if (options.textRange) {
      clauses.push('(text_start IS NULL OR text_end IS NULL OR text_end <= ?)');
      values.push(options.textRange.textEnd);
    }
  } else if (options.viewType === 'chapter') {
    clauses.push(`scope IN ('chapter', 'segment', 'reader')`);
    addOptionalChapterClause(clauses, values, options.chapterId);
  } else {
    clauses.push('0');
  }

  addProgressClause(clauses, values, options.readerProgress);
  return { where: clauses.join('\n    AND '), values };
}

function addOptionalChapterClause(
  clauses: string[],
  values: SqliteValue[],
  chapterId: string | undefined,
) {
  if (!chapterId) return;
  clauses.push('(chapter_id IS NULL OR chapter_id = ?)');
  values.push(chapterId);
}

function addNearTextRangeClause(
  clauses: string[],
  values: SqliteValue[],
  textRange: TextRange | undefined,
  distance: number,
) {
  if (!textRange) return;
  clauses.push('(text_start IS NULL OR text_end IS NULL OR (text_end >= ? AND text_start <= ?))');
  values.push(textRange.textStart - distance, textRange.textEnd + distance);
}

function addProgressClause(
  clauses: string[],
  values: SqliteValue[],
  progress: ReaderProgress | undefined,
) {
  if (!progress) return;
  const readChapterIds = uniqueNonEmptyStrings(progress.readChapterIds);
  const chapterClauses = ['chapter_id IS NULL', 'chapter_id = ?'];
  const chapterValues: SqliteValue[] = [progress.currentChapterId];
  if (readChapterIds.length > 0) {
    chapterClauses.unshift(`chapter_id IN (${questionMarks(readChapterIds.length)})`);
    chapterValues.unshift(...readChapterIds);
  }
  clauses.push(`(${chapterClauses.join(' OR ')})`);
  values.push(...chapterValues);
  if (progress.readUntilTextOffset !== undefined) {
    const offsetClauses = ['text_start IS NULL', 'text_end IS NULL', 'text_end <= ?'];
    const offsetValues: SqliteValue[] = [progress.readUntilTextOffset];
    if (readChapterIds.length > 0) {
      offsetClauses.unshift(`chapter_id IN (${questionMarks(readChapterIds.length)})`);
      offsetValues.unshift(...readChapterIds);
    }
    clauses.push(
      `(
        ${offsetClauses.join('\n        OR ')}
      )`,
    );
    values.push(...offsetValues);
  }
}

function questionMarks(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}
