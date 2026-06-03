import type { AnnotationConfidence } from '../annotation-types';
import type { TextAnchor } from '../anchor-types';

export type TextRange = {
  textStart: number;
  textEnd: number;
};

export type TextSummaryScope = 'segment' | 'chapter' | 'book';

export type TextSummary = {
  scope: TextSummaryScope;
  sourceRange: TextRange;
  chapterId?: string;
  segmentId?: string;
  summary: string;
  keyTerms: string[];
  updatedAt: string;
};

export type TraceItemType =
  | 'claim'
  | 'question'
  | 'agent_observation'
  | 'reader_interest'
  | 'cross_reference_candidate';

export type TraceItem = {
  type: TraceItemType;
  content: string;
  evidenceAnchors: TextAnchor[];
  agentId?: string;
  confidence: AnnotationConfidence;
  createdFromTask: string;
};

export type ReadingTraceScope = 'segment' | 'chapter' | 'agent' | 'reader';

export type ReadingTrace = {
  scope: ReadingTraceScope;
  sourceRange?: TextRange;
  chapterId?: string;
  segmentId?: string;
  agentId?: string;
  items: TraceItem[];
  updatedAt: string;
};

export type ReadingMemory = {
  textSummaries: TextSummary[];
  readingTraces: ReadingTrace[];
  updatedAt: string;
};
