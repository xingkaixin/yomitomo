import type { NormalizedAiUsage } from '../provider/usage';
import type {
  AssistantEvidence,
  AssistantProviderEvent,
  AssistantRuntimeResult,
  AssistantRuntimeTrace,
  AssistantRuntimeTraceStep,
  AssistantToolEvidenceInput,
  AssistantToolName,
} from './assistant-runtime-types';

export function requestRepair(reason: string, repairUsed: boolean) {
  if (repairUsed) return { ok: false as const, reason: `repair_failed:${reason}` };
  return { ok: true as const, reason };
}

export function fallback(
  trace: AssistantRuntimeTrace,
  evidence: AssistantEvidence[],
  failureReason: string,
  repairUsed: boolean,
  now: () => string,
): AssistantRuntimeResult {
  trace.completedAt = now();
  trace.failureReason = failureReason;
  return {
    status: 'fallback',
    failureReason,
    evidence,
    trace,
    repairUsed,
  };
}

export function traceStep(
  stepIndex: number,
  event: AssistantProviderEvent,
  startedAt: number,
  data: Partial<
    Pick<
      AssistantRuntimeTraceStep,
      'resultCount' | 'evidenceIds' | 'evidenceSummaries' | 'failureReason'
    >
  > = {},
): AssistantRuntimeTraceStep {
  const toolCall = event.type === 'tool_call' ? event.toolCall : undefined;
  return {
    stepIndex,
    eventType: event.type,
    toolName: toolCall?.name,
    sanitizedToolInput: toolCall ? sanitizeToolInput(toolCall.input) : undefined,
    resultCount: data.resultCount || 0,
    evidenceIds: data.evidenceIds || [],
    evidenceSummaries: data.evidenceSummaries || [],
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    failureReason: data.failureReason,
  };
}

export function normalizeEvidence(
  input: AssistantToolEvidenceInput,
  options: {
    id: string;
    toolCallId: string;
    toolName: AssistantToolName;
    maxCharacters: number;
  },
): AssistantEvidence {
  return {
    ...input,
    id: options.id,
    toolCallId: options.toolCallId,
    toolName: options.toolName,
    summary: truncateText(input.summary, options.maxCharacters),
    text: input.text ? truncateText(input.text, options.maxCharacters) : undefined,
  };
}

export function sanitizeToolInput(value: unknown): unknown {
  if (typeof value === 'string') return truncateText(value, 400);
  if (!isRecord(value)) {
    if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeToolInput);
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 50)
      .map(([key, item]) => [key, sanitizeToolInput(item)]),
  );
}

export function truncateText(text: string, maxCharacters: number) {
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, Math.max(0, maxCharacters - 1))}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function addUsage(
  left: NormalizedAiUsage | undefined,
  right: NormalizedAiUsage | undefined,
): NormalizedAiUsage | undefined {
  if (!left && !right) return undefined;
  return {
    inputTokens: addUsageField(left?.inputTokens, right?.inputTokens),
    outputTokens: addUsageField(left?.outputTokens, right?.outputTokens),
    reasoningTokens: addUsageField(left?.reasoningTokens, right?.reasoningTokens),
    cachedInputTokens: addUsageField(left?.cachedInputTokens, right?.cachedInputTokens),
    cacheWriteTokens: addUsageField(left?.cacheWriteTokens, right?.cacheWriteTokens),
    totalTokens: addUsageField(left?.totalTokens, right?.totalTokens),
  };
}

function addUsageField(left: number | undefined, right: number | undefined) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left + right;
}
