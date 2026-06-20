import type { AgentReadingIntent } from './agents/agent-types';
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

export type AnnotationDistillationStatus = 'unpublished' | 'published';

export type AnnotationDistillationProposalKind = 'insert' | 'replace' | 'delete';

export type AnnotationDistillationProposalStatus = 'pending' | 'accepted' | 'ignored';

export type AnnotationDistillationProposal = {
  id: string;
  kind: AnnotationDistillationProposalKind;
  status: AnnotationDistillationProposalStatus;
  title: string;
  rationale?: string;
  insertAfterText?: string;
  targetText?: string;
  replacementText?: string;
  content?: string;
  acceptedAt?: string;
  ignoredAt?: string;
  updatedAt: string;
};

export type AnnotationDistillationReviewStance = 'solid' | 'mixed' | 'weak';

export type AnnotationDistillationReviewFindingCategory =
  | 'evidence'
  | 'logic'
  | 'coverage'
  | 'clarity'
  | 'actionability';

export type AnnotationDistillationReviewFindingSeverity = 'low' | 'medium' | 'high';

export type AnnotationDistillationReviewOverviewItem = {
  id: string;
  type: 'overview';
  stance: AnnotationDistillationReviewStance;
  content: string;
};

export type AnnotationDistillationReviewFindingItem = {
  id: string;
  type: 'finding';
  category: AnnotationDistillationReviewFindingCategory;
  severity: AnnotationDistillationReviewFindingSeverity;
  title: string;
  content: string;
  draftTargetText?: string;
};

export type AnnotationDistillationReviewProposalItem = {
  id: string;
  type: 'proposal';
  proposal: AnnotationDistillationProposal;
};

export type AnnotationDistillationReviewItem =
  | AnnotationDistillationReviewOverviewItem
  | AnnotationDistillationReviewFindingItem
  | AnnotationDistillationReviewProposalItem;

export type AssistantRuntimeProgressStepStatus = 'active' | 'done' | 'failed';

export type AssistantRuntimeProgressStep = {
  id: string;
  label: string;
  status: AssistantRuntimeProgressStepStatus;
};

export type AssistantRuntimeProgressSummary = {
  steps: AssistantRuntimeProgressStep[];
  fallbackMessage?: string;
};

export type AssistantRuntimeProgressEvent =
  | { type: 'step'; step: AssistantRuntimeProgressStep }
  | { type: 'fallback'; message: string };

export type AnnotationDistillationReviewMessage = {
  id: string;
  author: AnnotationAuthor;
  content: string;
  createdAt: string;
  status?: 'pending' | 'done' | 'failed';
  errorMessage?: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
  assistantProgress?: AssistantRuntimeProgressSummary;
  items?: AnnotationDistillationReviewItem[];
  proposals?: AnnotationDistillationProposal[];
};

export type AnnotationDistillationReviewSession = {
  id: string;
  agentId: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
  messages: AnnotationDistillationReviewMessage[];
  createdAt: string;
  updatedAt: string;
};

export type AnnotationDistillation = {
  status: AnnotationDistillationStatus;
  content: string;
  publishedAt?: string;
  updatedAt?: string;
  reviewSessions?: AnnotationDistillationReviewSession[];
};

export type AnnotationDraftKind = 'discussion_reply' | 'distillation';

export type AnnotationLightweightDraft = {
  articleId: string;
  annotationId: string;
  kind: AnnotationDraftKind;
  content: string;
  updatedAt: string;
  commentId?: string;
};

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
  assistantProgress?: AssistantRuntimeProgressSummary;
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
  distillation?: AnnotationDistillation;
  createdAt: string;
  updatedAt: string;
};
