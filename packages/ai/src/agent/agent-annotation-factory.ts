import type { Agent, Annotation } from '@yomitomo/shared';
import { createTextAnchor, makeId } from '@yomitomo/shared';
import { annotationAgentAuthorRef, createEpubTextAnchor } from '@yomitomo/core';
import { findAgentAnnotationMatch } from './agent-annotation-matcher';
import type {
  AnnotationSuggestion,
  CreateAgentAnnotationOptions,
} from './annotation-generation-types';

export function createAgentAnnotation(
  agent: Agent,
  articleText: string,
  suggestion: AnnotationSuggestion,
  now = new Date().toISOString(),
  options: CreateAgentAnnotationOptions = {},
): Annotation | null {
  const match = findAgentAnnotationMatch(articleText, suggestion, options);
  if (!match) return null;

  const comment = suggestion.comment.trim();
  const author = annotationAgentAuthorRef(agent);
  return {
    id: makeId('annotation'),
    anchor: createAnnotationAnchor(articleText, match.start, match.end, options),
    author,
    annotationType: suggestion.annotationType || 'key_point',
    readingIntent: suggestion.readingIntent || undefined,
    moveType: suggestion.moveType || undefined,
    whyHere: suggestion.whyHere || undefined,
    evidenceUsed: suggestion.evidenceUsed?.length ? suggestion.evidenceUsed : undefined,
    confidence: suggestion.confidence || undefined,
    shouldShow: typeof suggestion.shouldShow === 'boolean' ? suggestion.shouldShow : undefined,
    color: agent.annotationColor,
    comments: comment
      ? [
          {
            id: makeId('comment'),
            author,
            content: comment,
            createdAt: now,
            readingIntent: suggestion.readingIntent || undefined,
          },
        ]
      : [],
    createdAt: now,
    updatedAt: now,
  };
}

function createAnnotationAnchor(
  articleText: string,
  start: number,
  end: number,
  options: CreateAgentAnnotationOptions,
) {
  return options.ebookIndex
    ? createEpubTextAnchor(options.ebookIndex, articleText, start, end)
    : createTextAnchor(articleText, start, end);
}
