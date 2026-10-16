import type {
  Agent,
  AgentDistillationReviewPayload,
  AnnotationDistillationProposal,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewMessage,
  LlmProvider,
} from '@yomitomo/shared';
import { makeId, normalizeUiLanguage } from '@yomitomo/shared';
import type { DistillationReviewRequest } from '../assistant-sessions/assistant-distillation-review';
import type { DesktopMainIpcContext } from '../ipc/ipc';
import { distillationReviewMessagePayload } from './agent-distillation-proposals';
import {
  pendingDistillationReviewMessage,
  type AgentRuntimeExecutionEvent,
} from './agent-execution-projection';
import type { AssistantExecutionRecorder } from './agent-execution-recorder';
import { findReviewAgent, reviewAgentNotFoundError, taskProvider } from './agent-runtime-routing';

export type AgentTaskExecutionContext = Pick<
  DesktopMainIpcContext,
  'elapsedMs' | 'logError' | 'logInfo'
> & {
  getPersistenceModules: () => Promise<{
    providerRepository: Pick<
      typeof import('../providers/provider-repository'),
      'hydrateProviderApiKey'
    >;
    storeAgents: Pick<typeof import('../store/store-agents'), 'readAgentRuntimeContext'>;
  }>;
  recorder: AssistantExecutionRecorder;
  runDistillationReview: (request: DistillationReviewRequest) => Promise<{
    items: AnnotationDistillationReviewItem[];
    content: string;
    proposals: AnnotationDistillationProposal[];
  }>;
};

export type AgentDistillationReviewExecutionEvent =
  | { type: 'start'; message: AnnotationDistillationReviewMessage }
  | { type: 'item'; item: AnnotationDistillationReviewItem }
  | AgentRuntimeExecutionEvent;

export async function executeAgentDistillationReviewTask(
  context: AgentTaskExecutionContext,
  payload: AgentDistillationReviewPayload,
  emit: (event: AgentDistillationReviewExecutionEvent) => void,
  signal?: AbortSignal,
): Promise<AnnotationDistillationReviewMessage> {
  const articleId = payload.article.id;
  if (!articleId) throw new Error('ASSISTANT_ARTICLE_REQUIRED');
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
  emit({ type: 'start', message });
  const result = await context.runDistillationReview({
    articleId,
    resolved: {
      agent,
      provider,
      uiLanguage: normalizeUiLanguage(store.settings.uiLanguage),
      fake: false,
    },
    payload: distillationReviewMessagePayload(payload, store.agents, store.settings),
    onItem: (item) => emit({ type: 'item', item }),
    signal,
  });
  if (signal?.aborted) throw new Error('AGENT_TASK_CANCELLED');
  recordExecution(context, agent, provider, context.elapsedMs(startedAt));
  return { ...message, ...result };
}

async function readAgentRuntimeStore(context: AgentTaskExecutionContext) {
  const { storeAgents } = await context.getPersistenceModules();
  return storeAgents.readAgentRuntimeContext();
}

function recordExecution(
  context: AgentTaskExecutionContext,
  agent: Agent,
  provider: LlmProvider,
  durationMs: number,
) {
  context.recorder.recordFastExecution({
    agent,
    provider,
    taskType: 'distillation_review',
    requestedMode: 'fast_response',
    effectiveMode: 'fast_response',
    status: 'success',
    durationMs,
  });
}
