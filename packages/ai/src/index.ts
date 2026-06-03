import type { LlmProvider } from '@yomitomo/shared';
import { callProviderText } from './provider/provider-client';

export {
  budgetArticleText,
  formatBudgetNotice,
  normalizeAnthropicError,
  type ModelBudgetReport,
  type ModelInputTask,
} from './provider/budget';
export {
  callProviderText,
  listProviderModels,
  streamProviderText,
  type GenerateOptions,
  type TextPayload,
} from './provider/provider-client';
export {
  collectReadingContextBlocks,
  packReadingContext,
  packReadingContextBlocks,
  type OmittedContextBlock,
  type PackedContextBlock,
  type PackedReadingContext,
  type PackReadingContextOptions,
  type TokenEstimator,
} from './context/context-packing';
export { memoryViewContextBlocks } from './context/reading-view-assembler';
export {
  DEFAULT_ASSISTANT_RUNTIME_BUDGETS,
  runAssistantAiSdkToolRuntime,
  runAssistantToolRuntime,
  validateAssistantFinalAction,
  type AssistantAiSdkRuntimeOptions,
  type AssistantEvidence,
  type AssistantEvidenceProvenance,
  type AssistantFinalAction,
  type AssistantProviderEvent,
  type AssistantProviderFailureEvent,
  type AssistantProviderFinalActionEvent,
  type AssistantProviderInvalidResponseEvent,
  type AssistantProviderToolCallEvent,
  type AssistantRuntimeBudget,
  type AssistantRuntimeOptions,
  type AssistantRuntimeResult,
  type AssistantRuntimeStreamEvent,
  type AssistantRuntimeTaskType,
  type AssistantRuntimeTrace,
  type AssistantRuntimeTraceStep,
  type AssistantRuntimeTurn,
  type AssistantToolCall,
  type AssistantToolDefinition,
  type AssistantToolExecutionResult,
  type AssistantToolEvidenceInput,
  type AssistantToolName,
} from './assistant/assistant-runtime';
export {
  buildSelectionAnnotationContext,
  buildSelectionThreadContext,
  selectionAnnotationContextPrompt,
  selectionThreadContextPrompt,
} from './context/selection-context';
export {
  aggregateEpubEvaluation,
  epubEvaluationBookTypes,
  epubEvaluationChapterLengths,
  epubEvaluationControlGroups,
  epubEvaluationFailureLabels,
  epubEvaluationTaskTypes,
  epubPhaseOneCriteria,
  evaluateEpubPhaseOne,
  evaluateEpubRun,
  type EpubEvaluationBookType,
  type EpubEvaluationCase,
  type EpubEvaluationCaseResult,
  type EpubEvaluationChapterLength,
  type EpubEvaluationControlGroup,
  type EpubEvaluationControlSummary,
  type EpubEvaluationExpectation,
  type EpubEvaluationFailureLabel,
  type EpubEvaluationManualScores,
  type EpubEvaluationMetrics,
  type EpubEvaluationReport,
  type EpubEvaluationRun,
  type EpubEvaluationSegmentOutput,
  type EpubEvaluationTaskInput,
  type EpubEvaluationTaskType,
  type EpubEvaluationUsage,
  type EpubPhaseOneCheck,
  type EpubPhaseOneCriteria,
} from './evaluation/evaluation';
export { epubEvaluationBooks, epubEvaluationCases } from './evaluation/evaluation-fixtures';
export { setAiLogger, type AiLogger } from './logger';
export { type NormalizedAiUsage } from './provider/usage';
export {
  generateYomitomoText,
  streamYomitomoText,
  type YomitomoTextGenerationResult,
} from './provider/generation-runtime';
export { extractJsonObjects } from './json';
export {
  parseAgentMentionInstructions,
  parseAgentMentionRoutePlan,
  planAgentMentionInstructions,
  planAgentMentionRoute,
} from './agent/annotation-metadata';
export {
  buildAgentMessageSystemPrompt,
  buildAgentCreateThoughtRuntimePayload,
  buildAgentDistillationReviewRuntimePayload,
  buildAgentThreadReplyRuntimePayload,
  buildAgentPrompt,
  runAgent,
  runAgentStream,
} from './agent/agent-message';
export {
  buildAgentCoReadingRuntimePayload,
  buildAgentSelectionRuntimePayload,
  runAgentAnnotate,
  runAgentAnnotateStream,
  runAgentAnnotateWithMemory,
} from './agent/agent-annotation';
export { runAgentReview } from './agent/agent-review';

export async function testProvider(
  provider: LlmProvider,
): Promise<{ ok: boolean; message: string }> {
  try {
    const content = await callProviderText(provider, {
      system: 'You are a connectivity test assistant.',
      user: 'Reply with OK only.',
      maxTokens: 128,
    });
    return { ok: true, message: content };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Provider 测试失败' };
  }
}
