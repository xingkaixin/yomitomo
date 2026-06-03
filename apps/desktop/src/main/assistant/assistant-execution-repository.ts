import type { Agent, AssistantExecutionMode, LlmProvider } from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { StoreExecutor } from '../store/store-db';
import { estimateAssistantRunCostMicros } from '../providers/model-pricing-repository';

export type AssistantExecutionRunStatus = 'success' | 'fallback' | 'error';

type NormalizedAiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
};

export type AssistantExecutionRunInput = {
  agent: Agent;
  provider: LlmProvider;
  taskType: string;
  requestedMode: AssistantExecutionMode;
  effectiveMode: AssistantExecutionMode;
  status: AssistantExecutionRunStatus;
  fallbackReason?: string;
  usage?: NormalizedAiUsage;
  durationMs?: number;
  stepCount?: number;
  traceJson?: unknown;
  now?: string;
};

export function insertAssistantExecutionRun(
  database: StoreExecutor,
  input: AssistantExecutionRunInput,
) {
  const usage = input.usage || {};
  const estimatedCostMicros = estimateAssistantRunCostMicros(database, input.provider, usage);
  database
    .insert(schema.assistantExecutionRuns)
    .values({
      id: makeId('assistant_run'),
      createdAt: input.now || new Date().toISOString(),
      agentId: input.agent.id,
      agentUsername: input.agent.username,
      agentNickname: input.agent.nickname,
      taskType: input.taskType,
      requestedMode: input.requestedMode,
      effectiveMode: input.effectiveMode,
      providerId: input.provider.id,
      providerName: input.provider.name,
      modelName: input.provider.modelName,
      status: input.status,
      fallbackReason: input.fallbackReason || null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      reasoningTokens: usage.reasoningTokens ?? null,
      cachedInputTokens: usage.cachedInputTokens ?? null,
      cacheWriteTokens: usage.cacheWriteTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      estimatedCostMicros,
      currency: estimatedCostMicros === null ? null : 'USD',
      durationMs: input.durationMs ?? null,
      stepCount: input.stepCount || 0,
      traceJson: input.traceJson ?? null,
    })
    .run();
}
