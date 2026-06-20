import type {
  AnnotationDistillationProposal,
  AnnotationDistillationReviewItem,
  LlmProvider,
  TextAnchor,
} from '@yomitomo/shared';
import type { NormalizedAiUsage } from '../provider/usage';

export type AssistantRuntimeTaskType =
  | 'thread_reply'
  | 'create_thought'
  | 'distillation_review'
  | 'selection_first'
  | 'co_reading_section';

export type AssistantToolName =
  | 'get_current_thread'
  | 'get_anchor_context'
  | 'search_article_passages'
  | 'search_article_memory'
  | 'search_own_memory'
  | 'search_other_agents_memory'
  | 'check_duplicate_thought';

export type AssistantRuntimeBudget = {
  maxSteps: number;
  maxToolResults: number;
  maxToolResultCharacters: number;
};

export const DEFAULT_ASSISTANT_RUNTIME_BUDGETS: Record<
  AssistantRuntimeTaskType,
  AssistantRuntimeBudget
> = {
  thread_reply: {
    maxSteps: 20,
    maxToolResults: 6,
    maxToolResultCharacters: 2400,
  },
  create_thought: {
    maxSteps: 20,
    maxToolResults: 8,
    maxToolResultCharacters: 3200,
  },
  distillation_review: {
    maxSteps: 20,
    maxToolResults: 8,
    maxToolResultCharacters: 3200,
  },
  selection_first: {
    maxSteps: 20,
    maxToolResults: 8,
    maxToolResultCharacters: 3200,
  },
  co_reading_section: {
    maxSteps: 20,
    maxToolResults: 8,
    maxToolResultCharacters: 3600,
  },
};

export type AssistantToolDefinition = {
  name: AssistantToolName;
  description?: string;
  validateInput?: (input: unknown) => string | null;
};

export type AssistantToolCall = {
  id?: string;
  name: AssistantToolName;
  input: unknown;
};

export type AssistantEvidenceProvenance = {
  articleId: string;
  sourceType: string;
  sourceAnnotationId?: string;
  sourceCommentId?: string;
  agentId?: string;
  authorType?: 'user' | 'ai' | 'system';
  anchor?: TextAnchor;
  textStart?: number;
  textEnd?: number;
  createdAt?: string;
};

export type AssistantToolEvidenceInput = {
  summary: string;
  text?: string;
  provenance: AssistantEvidenceProvenance;
};

export type AssistantEvidence = AssistantToolEvidenceInput & {
  id: string;
  toolCallId: string;
  toolName: AssistantToolName;
};

export type AssistantToolExecutionResult =
  | {
      ok: true;
      summary?: string;
      evidence?: AssistantToolEvidenceInput[];
    }
  | {
      ok: false;
      failureReason: string;
    };

export type AssistantProviderToolCallEvent = {
  type: 'tool_call';
  toolCall: AssistantToolCall;
  usage?: NormalizedAiUsage;
};

export type AssistantProviderFinalActionEvent = {
  type: 'final_action';
  action: unknown;
  usage?: NormalizedAiUsage;
};

export type AssistantProviderInvalidResponseEvent = {
  type: 'invalid_response';
  reason: string;
  raw?: unknown;
  usage?: NormalizedAiUsage;
};

export type AssistantProviderFailureEvent = {
  type: 'provider_failure';
  reason: string;
  retryable?: boolean;
  usage?: NormalizedAiUsage;
};

export type AssistantProviderEvent =
  | AssistantProviderToolCallEvent
  | AssistantProviderFinalActionEvent
  | AssistantProviderInvalidResponseEvent
  | AssistantProviderFailureEvent;

export type AssistantToolResultMessage = {
  toolCallId: string;
  toolName: AssistantToolName;
  ok: boolean;
  summary?: string;
  evidenceIds: string[];
  evidence: AssistantEvidence[];
  failureReason?: string;
};

export type AssistantFinalAction =
  | {
      type: 'reply_to_thread';
      annotationId: string;
      content: string;
      evidenceIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      type: 'add_annotation';
      anchor: TextAnchor;
      thought: string;
      evidenceIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      type: 'create_thread_thought';
      annotationId: string;
      thought: string;
      evidenceIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      type: 'review_distillation';
      annotationId: string;
      content: string;
      items?: AnnotationDistillationReviewItem[];
      proposals?: AnnotationDistillationProposal[];
      evidenceIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      type: 'no_action';
      reason: string;
      evidenceIds: string[];
      confidence: number;
    };

export type AssistantRuntimeTurn = {
  taskType: AssistantRuntimeTaskType;
  articleId: string;
  agentId: string;
  stepIndex: number;
  availableTools: AssistantToolDefinition[];
  evidence: AssistantEvidence[];
  toolResults: AssistantToolResultMessage[];
  repairReason?: string;
};

export type AssistantRuntimeTraceStep = {
  stepIndex: number;
  eventType: AssistantProviderEvent['type'];
  toolName?: AssistantToolName;
  sanitizedToolInput?: unknown;
  resultCount: number;
  evidenceIds: string[];
  evidenceSummaries: Array<{
    id: string;
    summary: string;
    provenance: AssistantEvidenceProvenance;
  }>;
  latencyMs: number;
  failureReason?: string;
};

export type AssistantRuntimeTrace = {
  taskType: AssistantRuntimeTaskType;
  agentId: string;
  articleId: string;
  startedAt: string;
  completedAt?: string;
  steps: AssistantRuntimeTraceStep[];
  finalActionType?: AssistantFinalAction['type'];
  failureReason?: string;
  usage?: NormalizedAiUsage;
};

export type AssistantRuntimeResult =
  | {
      status: 'final';
      action: AssistantFinalAction;
      evidence: AssistantEvidence[];
      trace: AssistantRuntimeTrace;
      repairUsed: boolean;
    }
  | {
      status: 'fallback';
      failureReason: string;
      evidence: AssistantEvidence[];
      trace: AssistantRuntimeTrace;
      repairUsed: boolean;
    };

export type AssistantRuntimeStreamEvent =
  | {
      type: 'tool_call';
      toolName: AssistantToolName;
      stepIndex: number;
    }
  | {
      type: 'tool_result';
      toolName: AssistantToolName;
      stepIndex: number;
      ok: boolean;
    }
  | {
      type: 'text_delta';
      delta: string;
    }
  | {
      type: 'distillation_review_item';
      item: AnnotationDistillationReviewItem;
    }
  | {
      type: 'fallback';
      reason: string;
    }
  | {
      type: 'done';
      usage?: NormalizedAiUsage;
      trace: AssistantRuntimeTrace;
    };

export type AssistantRuntimeOptions = {
  taskType: AssistantRuntimeTaskType;
  articleId: string;
  agentId: string;
  tools: AssistantToolDefinition[];
  allowedAnnotationIds?: string[];
  addAnnotationAnchor?: TextAnchor;
  budget?: Partial<AssistantRuntimeBudget>;
  now?: () => string;
  modelAdapter: (turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>;
  toolExecutor: (toolCall: AssistantToolCall) => Promise<AssistantToolExecutionResult>;
};

export type AssistantAiSdkRuntimeOptions = {
  taskType: 'thread_reply' | 'create_thought' | 'distillation_review';
  articleId: string;
  agentId: string;
  provider: LlmProvider;
  payload: {
    system: string;
    user: string;
    maxTokens: number;
    temperature?: number;
    distillationReviewMode?: 'review' | 'organize_discussion';
  };
  tools: AssistantToolDefinition[];
  allowedAnnotationIds: string[];
  budget?: Partial<AssistantRuntimeBudget>;
  now?: () => string;
  onEvent?: (event: AssistantRuntimeStreamEvent) => void;
  toolExecutor: (toolCall: AssistantToolCall) => Promise<AssistantToolExecutionResult>;
};
