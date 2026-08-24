import type {
  Agent,
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  TextAnchor,
} from '@yomitomo/shared';
import type { PerformanceTimingLogger } from '@yomitomo/core';
import { createAgentAnnotation } from './agent-annotation-factory';
import type {
  AnnotationSuggestion,
  AnnotationSuggestionAcceptance,
  AnnotationSuggestionDedupeMode,
  AnnotationSuggestionPath,
  AnnotationSuggestionRejectionReason,
} from './annotation-generation-types';
import { createAnnotationSuggestionDeduper } from './annotation-suggestion-deduper';
import { normalizeAnnotationSuggestion } from './annotation-suggestion-parser';

export function createAnnotationSuggestionAcceptance(options: {
  agent: Agent;
  articleText: string;
  path: AnnotationSuggestionPath;
  dedupe: AnnotationSuggestionDedupeMode;
  existingAnnotations?: Annotation[];
  logger?: PerformanceTimingLogger;
}): AnnotationSuggestionAcceptance {
  const acceptedByScope = new Map<string, number>();
  const deduper = createAnnotationSuggestionDeduper(
    options.dedupe,
    options.articleText,
    options.existingAnnotations || [],
  );

  return {
    accept(input, acceptanceOptions) {
      const suggestion = normalizeAnnotationSuggestion(input);
      if (!suggestion) {
        logAnnotationSuggestionDecision(
          options.logger,
          options.path,
          options.agent,
          undefined,
          { status: 'rejected', reason: 'invalid_suggestion' },
          acceptanceOptions.diagnosticContext,
        );
        return { status: 'rejected', reason: 'invalid_suggestion' };
      }

      const resolvedSuggestion = resolveAnnotationSuggestionMetadata(suggestion, acceptanceOptions);
      const densityScope = acceptanceOptions.densityScope || 'default';
      if ((acceptedByScope.get(densityScope) || 0) >= acceptanceOptions.maxAnnotations) {
        return rejectAnnotationSuggestion(
          options,
          resolvedSuggestion,
          'density_limit',
          acceptanceOptions.diagnosticContext,
        );
      }
      if (resolvedSuggestion.shouldShow === false) {
        return rejectAnnotationSuggestion(
          options,
          resolvedSuggestion,
          'should_not_show',
          acceptanceOptions.diagnosticContext,
        );
      }

      const annotation = createAgentAnnotation(
        options.agent,
        options.articleText,
        resolvedSuggestion,
        acceptanceOptions.now,
        acceptanceOptions.createOptions,
      );
      if (!annotation) {
        return rejectAnnotationSuggestion(
          options,
          resolvedSuggestion,
          'anchor_not_found',
          acceptanceOptions.diagnosticContext,
        );
      }
      if (!deduper.accept(annotation)) {
        return rejectAnnotationSuggestion(
          options,
          resolvedSuggestion,
          'duplicate',
          acceptanceOptions.diagnosticContext,
        );
      }

      acceptedByScope.set(densityScope, (acceptedByScope.get(densityScope) || 0) + 1);
      logAnnotationSuggestionDecision(
        options.logger,
        options.path,
        options.agent,
        resolvedSuggestion,
        { status: 'accepted' },
        acceptanceOptions.diagnosticContext,
      );
      return { status: 'accepted', annotation, suggestion: resolvedSuggestion };
    },
  };
}

function rejectAnnotationSuggestion(
  options: {
    agent: Agent;
    path: AnnotationSuggestionPath;
    logger?: PerformanceTimingLogger;
  },
  suggestion: AnnotationSuggestion,
  reason: AnnotationSuggestionRejectionReason,
  diagnosticContext?: Record<string, unknown>,
) {
  logAnnotationSuggestionDecision(
    options.logger,
    options.path,
    options.agent,
    suggestion,
    { status: 'rejected', reason },
    diagnosticContext,
  );
  return { status: 'rejected' as const, reason, suggestion };
}

function resolveAnnotationSuggestionMetadata(
  suggestion: AnnotationSuggestion,
  options: {
    annotationType?: AnnotationType;
    readingIntent?: AgentReadingIntent;
    targetAnchor?: Pick<TextAnchor, 'exact' | 'prefix' | 'suffix'>;
  },
) {
  return {
    ...suggestion,
    ...options.targetAnchor,
    annotationType: options.annotationType || suggestion.annotationType,
    readingIntent: options.readingIntent || suggestion.readingIntent,
  };
}

function logAnnotationSuggestionDecision(
  logger: PerformanceTimingLogger | undefined,
  path: AnnotationSuggestionPath,
  agent: Agent,
  suggestion: AnnotationSuggestion | undefined,
  decision:
    | { status: 'accepted' }
    | { status: 'rejected'; reason: AnnotationSuggestionRejectionReason },
  context: Record<string, unknown> = {},
) {
  logger?.('agent.annotation_suggestion.decision', {
    path,
    agent: agent.username,
    status: decision.status,
    reason: decision.status === 'rejected' ? decision.reason : undefined,
    exactPreview: suggestion?.exact.slice(0, 120),
    annotationType: suggestion?.annotationType,
    readingIntent: suggestion?.readingIntent,
    moveType: suggestion?.moveType,
    evidenceUsed: suggestion?.evidenceUsed,
    confidence: suggestion?.confidence,
    shouldShow: suggestion?.shouldShow,
    ...context,
  });
}
