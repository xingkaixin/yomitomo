import type { LlmProvider } from '@yomitomo/shared';
import { callProviderText } from './provider-client';

export {
  budgetArticleText,
  budgetDeliberationJson,
  budgetEvidenceJson,
  budgetReadingCardJson,
  formatBudgetNotice,
  normalizeAnthropicError,
  type ModelBudgetReport,
  type ModelInputTask,
} from './budget';
export {
  callProviderText,
  listProviderModels,
  streamProviderText,
  type GenerateOptions,
  type TextPayload,
} from './provider-client';
export {
  collectReadingContextBlocks,
  packReadingContext,
  packReadingContextBlocks,
  type OmittedContextBlock,
  type PackedContextBlock,
  type PackedReadingContext,
  type PackReadingContextOptions,
  type TokenEstimator,
} from './context-packing';
export {
  buildSelectionAnnotationContext,
  buildSelectionThreadContext,
  selectionAnnotationContextPrompt,
  selectionThreadContextPrompt,
} from './selection-context';
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
} from './evaluation';
export { epubEvaluationBooks, epubEvaluationCases } from './evaluation-fixtures';
export { setAiLogger, type AiLogger } from './logger';
export { extractJsonObjects } from './json';
export { parseFocusCoReadingRouteResult, planFocusCoReadingRoute } from './focus-route';
export {
  inferAnnotationMetadata,
  parseAgentMentionInstructions,
  planAgentMentionInstructions,
} from './annotation-metadata';
export {
  generateReadingCard,
  generateReadingDeliberation,
  reviewReadingCard,
  type GenerateReadingCardInput,
  type GenerateReadingDeliberationInput,
  type ReviewReadingCardInput,
  type ReviewReadingCardResult,
} from './reading-card';
export {
  generateReadingReceiptClarification,
  streamReadingReceiptClarificationOpinion,
  type GenerateReadingReceiptClarificationInput,
  type ReadingReceiptClarificationOpinion,
  type ReadingReceiptClarificationRoundInput,
  type ReadingReceiptClarificationStance,
} from './reading-receipt-clarification';
export {
  buildAgentMessageSystemPrompt,
  buildAgentPrompt,
  runAgent,
  runAgentStream,
} from './agent-message';
export {
  runAgentAnnotate,
  runAgentAnnotateStream,
  runAgentAnnotateWithMemory,
} from './agent-annotation';

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
