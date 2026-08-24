import type {
  AgentReadingIntent,
  Annotation,
  AnnotationConfidence,
  AnnotationEvidenceSource,
  AnnotationMove,
  AnnotationType,
  EpubBookIndex,
  TextAnchor,
} from '@yomitomo/shared';
import type { PerformanceTimingLogger } from '@yomitomo/core';

export type AnnotationSuggestion = {
  exact: string;
  comment: string;
  annotationType?: AnnotationType | null;
  readingIntent?: AgentReadingIntent | null;
  moveType?: AnnotationMove | null;
  whyHere?: string;
  evidenceUsed?: AnnotationEvidenceSource[];
  confidence?: AnnotationConfidence | null;
  shouldShow?: boolean;
  prefix?: string;
  suffix?: string;
  context?: string;
};

export type CreateAgentAnnotationOptions = {
  ebookIndex?: EpubBookIndex;
  allowedTextStart?: number;
  allowedTextEnd?: number;
  allowedSegmentIds?: string[];
  allowedParagraphIds?: string[];
  performanceLogger?: PerformanceTimingLogger;
};

export type AnnotationSuggestionPath =
  | 'article_json'
  | 'article_ndjson'
  | 'segment_json'
  | 'segment_ndjson';

export type AnnotationSuggestionRejectionReason =
  | 'invalid_suggestion'
  | 'density_limit'
  | 'should_not_show'
  | 'anchor_not_found'
  | 'duplicate';

export type AnnotationSuggestionDedupeMode = 'none' | 'thought' | 'segment';

export type AnnotationSuggestionAcceptance = {
  accept(
    input: unknown,
    options: {
      maxAnnotations: number;
      densityScope?: string;
      annotationType?: AnnotationType;
      readingIntent?: AgentReadingIntent;
      targetAnchor?: Pick<TextAnchor, 'exact' | 'prefix' | 'suffix'>;
      createOptions?: CreateAgentAnnotationOptions;
      now?: string;
      diagnosticContext?: Record<string, unknown>;
    },
  ):
    | { status: 'accepted'; annotation: Annotation; suggestion: AnnotationSuggestion }
    | {
        status: 'rejected';
        reason: AnnotationSuggestionRejectionReason;
        suggestion?: AnnotationSuggestion;
      };
};
