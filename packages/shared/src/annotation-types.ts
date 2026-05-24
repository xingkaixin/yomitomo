import type { AgentReadingIntent } from './agent-types';
import type { TextAnchor } from './anchor-types';

export type AnnotationAuthor = 'user' | 'ai';

export type AnnotationType = 'key_point' | 'assumption' | 'concept' | 'question' | 'quote';

export type AnnotationMove =
  | 'explain_concept'
  | 'surface_assumption'
  | 'ask_question'
  | 'connect_previous'
  | 'challenge_argument'
  | 'reader_application'
  | 'style_observation'
  | 'structure_marker'
  | 'definition_watch'
  | 'foreshadowing_watch';

export type AnnotationEvidenceSource = 'localText' | 'chapterSummary' | 'trace' | 'relatedPassage';

export type AnnotationConfidence = 'low' | 'medium' | 'high';

export type ReviewOpinionLabel = '站得住' | '有洞察' | '有异议' | '待验证' | '可深挖' | '有遗漏';

export type Comment = {
  id: string;
  author: AnnotationAuthor;
  content: string;
  createdAt: string;
  replyTo?: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
  agentAnnotationColor?: string;
  userId?: string;
  userUsername?: string;
  userNickname?: string;
  userAvatar?: string;
  userAnnotationColor?: string;
  readingIntent?: AgentReadingIntent;
  reviewLabel?: ReviewOpinionLabel;
  pending?: boolean;
};

export type Annotation = {
  id: string;
  anchor: TextAnchor;
  author: AnnotationAuthor;
  annotationType?: AnnotationType;
  moveType?: AnnotationMove;
  whyHere?: string;
  evidenceUsed?: AnnotationEvidenceSource[];
  confidence?: AnnotationConfidence;
  shouldShow?: boolean;
  color: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
  agentAnnotationColor?: string;
  userId?: string;
  userUsername?: string;
  userNickname?: string;
  userAvatar?: string;
  userAnnotationColor?: string;
  readingIntent?: AgentReadingIntent;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
};
