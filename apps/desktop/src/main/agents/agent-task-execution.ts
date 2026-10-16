import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewMessage,
  ArticleRecord,
  LlmProvider,
} from '@yomitomo/shared';
import { makeId, normalizeUiLanguage } from '@yomitomo/shared';
import type { DesktopAiModule, DesktopMainIpcContext } from '../ipc/ipc';
import { distillationReviewMessagePayload } from './agent-distillation-proposals';
import {
  pendingDistillationReviewMessage,
  type AgentRuntimeExecutionEvent,
} from './agent-execution-projection';
import { annotateResultUsage, type AssistantExecutionRecorder } from './agent-execution-recorder';
import type { AgentReadingMemoryPort } from './agent-reading-memory';
import {
  annotationAgentNotFoundError,
  findAnnotationAgent,
  findReviewAgent,
  reviewAgentNotFoundError,
  taskProvider,
} from './agent-runtime-routing';

type AgentTaskAiModule = Pick<
  DesktopAiModule,
  'runAgentAnnotateStream' | 'runAgentDistillationReviewStructuredStream'
>;

export type AgentTaskExecutionContext = Pick<
  DesktopMainIpcContext,
  'elapsedMs' | 'logError' | 'logInfo'
> & {
  getAiModule: () => Promise<AgentTaskAiModule>;
  getPersistenceModules: () => Promise<{
    providerRepository: Pick<
      typeof import('../providers/provider-repository'),
      'hydrateProviderApiKey'
    >;
    storeAgents: Pick<typeof import('../store/store-agents'), 'readAgentRuntimeContext'>;
  }>;
  recorder: AssistantExecutionRecorder;
  readingMemory: AgentReadingMemoryPort;
};

export type AgentDistillationReviewExecutionEvent =
  | { type: 'start'; message: AnnotationDistillationReviewMessage }
  | { type: 'item'; item: AnnotationDistillationReviewItem }
  | AgentRuntimeExecutionEvent;

export type AgentAnnotationExecutionEvent =
  | { type: 'start' }
  | { type: 'item'; annotation: ArticleRecord['annotations'][number] };

export async function executeAgentDistillationReviewTask(
  context: AgentTaskExecutionContext,
  payload: AgentDistillationReviewPayload,
  emit: (event: AgentDistillationReviewExecutionEvent) => void,
  signal?: AbortSignal,
): Promise<AnnotationDistillationReviewMessage> {
  const ai = await context.getAiModule();
  const store = await readAgentRuntimeStore(context);
  const agent = findReviewAgent(store.agents, payload.agentId, payload.agentUsername);
  if (!agent) throw reviewAgentNotFoundError(payload.agentUsername);
  const provider = await taskProvider(context, store.providers, store.settings, 'reviewAssistant');
  const startedAt = performance.now();
  const message = pendingDistillationReviewMessage({
    agent,
    payload,
    id: makeId('distillation_review_message'),
    createdAt: new Date().toISOString(),
  });
  const payloadWithRoster = distillationReviewMessagePayload(payload, store.agents, store.settings);
  emit({ type: 'start', message });
  const result = await structuredDistillationReview(
    context,
    ai,
    provider,
    agent,
    payloadWithRoster,
    signal,
    (item) => {
      appendDistillationReviewItem(message, item);
      emit({ type: 'item', item });
    },
  );
  throwIfAgentTaskCancelled(signal);
  recordExecution(context, agent, provider, 'distillation_review', context.elapsedMs(startedAt));
  message.content = result.content;
  message.items = result.items || message.items || [];
  message.proposals = result.proposals || [];
  return message;
}

export async function executeAgentAnnotationTask(
  context: AgentTaskExecutionContext,
  payload: AgentAnnotatePayload,
  emit: (event: AgentAnnotationExecutionEvent) => void,
  signal?: AbortSignal,
): Promise<AgentAnnotateResult> {
  throwIfAgentTaskCancelled(signal);
  const ai = await context.getAiModule();
  throwIfAgentTaskCancelled(signal);
  const store = await readAgentRuntimeStore(context);
  throwIfAgentTaskCancelled(signal);
  const agent = findAnnotationAgent(store.agents, payload.agentId, payload.agentUsername);
  if (!agent) throw annotationAgentNotFoundError(payload.agentUsername);
  const provider = await taskProvider(context, store.providers, store.settings, 'readingAssistant');
  throwIfAgentTaskCancelled(signal);
  const startedAt = performance.now();
  const annotations: ArticleRecord['annotations'] = [];
  emit({ type: 'start' });
  const payloadWithMemory = context.readingMemory.enrichAnnotatePayload({
    ...payload,
    uiLanguage: normalizeUiLanguage(store.settings.uiLanguage),
  });
  throwIfAgentTaskCancelled(signal);
  const result = await ai.runAgentAnnotateStream(
    provider,
    agent,
    payloadWithMemory,
    (annotation) => {
      annotations.push(annotation);
      emit({ type: 'item', annotation });
    },
    signal,
  );
  throwIfAgentTaskCancelled(signal);
  context.readingMemory.saveAnnotateEntries({
    agent,
    payload: payloadWithMemory,
    result,
  });
  throwIfAgentTaskCancelled(signal);
  recordExecution(
    context,
    agent,
    provider,
    'annotation',
    context.elapsedMs(startedAt),
    annotateResultUsage(result),
  );
  return { annotations, readingMemory: result.readingMemory };
}

function throwIfAgentTaskCancelled(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new Error('AGENT_TASK_CANCELLED');
}

function appendDistillationReviewItem(
  message: AnnotationDistillationReviewMessage,
  item: AnnotationDistillationReviewItem,
) {
  message.items = [...(message.items || []), item];
  if (item.type === 'proposal') {
    message.proposals = [...(message.proposals || []), item.proposal];
  }
}

async function structuredDistillationReview(
  context: AgentTaskExecutionContext,
  ai: Pick<AgentTaskAiModule, 'runAgentDistillationReviewStructuredStream'>,
  provider: LlmProvider,
  agent: Agent,
  payload: AgentMessagePayload,
  signal: AbortSignal | undefined,
  onItem: (item: AnnotationDistillationReviewItem) => void,
) {
  throwIfAgentTaskCancelled(signal);
  const fastInput = agentMessageFastInput(context, payload, agent.id);
  throwIfAgentTaskCancelled(signal);
  return ai.runAgentDistillationReviewStructuredStream(provider, agent, fastInput.payload, onItem, {
    ...fastInput.options,
    signal,
  });
}

async function readAgentRuntimeStore(context: AgentTaskExecutionContext) {
  const { storeAgents } = await context.getPersistenceModules();
  return storeAgents.readAgentRuntimeContext();
}

function agentMessageFastInput(
  context: AgentTaskExecutionContext,
  payload: AgentMessagePayload,
  agentId: string,
) {
  const payloadWithMemory = context.readingMemory.enrichMessagePayload(payload);
  return {
    payload: payloadWithMemory,
    options: {
      readingContext: context.readingMemory.createMessageReadingContextSnapshot({
        payload,
        agentId,
      }),
    },
  };
}

function recordExecution(
  context: AgentTaskExecutionContext,
  agent: Agent,
  provider: LlmProvider,
  taskType: 'annotation' | 'distillation_review',
  durationMs: number,
  usage?: Parameters<AssistantExecutionRecorder['recordFastExecution']>[0]['usage'],
) {
  context.recorder.recordFastExecution({
    agent,
    provider,
    taskType,
    requestedMode: 'fast_response',
    effectiveMode: 'fast_response',
    status: 'success',
    usage,
    durationMs,
  });
}
