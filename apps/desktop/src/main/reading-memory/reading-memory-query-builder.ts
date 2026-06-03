import type {
  ReadReadingMemoryEntriesOptions,
  SoftDeleteReadingMemoryEntriesBySourceOptions,
} from './reading-memory-store';
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
