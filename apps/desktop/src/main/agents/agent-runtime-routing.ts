import type {
  Agent,
  AgentMessagePayload,
  AppSettings,
  AssistantExecutionMode,
  LlmProvider,
  UiLanguage,
} from '@yomitomo/shared';
import { resolveAgentPublicIdentity } from '@yomitomo/shared';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../ipc-errors';
import type { DesktopMainIpcContext } from '../ipc/ipc';

export type ProviderTask = 'readingAssistant' | 'reviewAssistant';

const providerTaskSettings: Record<ProviderTask, keyof AppSettings> = {
  readingAssistant: 'readingAssistantProviderId',
  reviewAssistant: 'reviewAssistantProviderId',
};

export async function taskProvider(
  context: DesktopMainIpcContext,
  providers: LlmProvider[],
  settings: AppSettings,
  task: ProviderTask,
): Promise<LlmProvider> {
  const providerId = settings[providerTaskSettings[task]] || settings.defaultProviderId;
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) throw providerRouteRequiredError(task);
  const { hydrateProviderApiKey } = await context.getStoreModule();
  return hydrateProviderApiKey(provider);
}

export function agentNotFoundError(username: string) {
  return new DesktopIpcError(
    desktopIpcErrorCodes.agentNotFound,
    desktopIpcErrorCodes.agentNotFound,
    {
      detail: { username },
    },
  );
}

export function reviewAgentNotFoundError(username: string) {
  return new DesktopIpcError(
    desktopIpcErrorCodes.reviewAgentNotFound,
    desktopIpcErrorCodes.reviewAgentNotFound,
    { detail: { username } },
  );
}

export function annotationAgentNotFoundError(username: string) {
  return new DesktopIpcError(
    desktopIpcErrorCodes.annotationAgentNotFound,
    desktopIpcErrorCodes.annotationAgentNotFound,
    { detail: { username } },
  );
}

function providerRouteRequiredError(task: ProviderTask) {
  return new DesktopIpcError(
    desktopIpcErrorCodes.providerRouteRequired,
    desktopIpcErrorCodes.providerRouteRequired,
    { detail: { task } },
  );
}

export function findAnnotationAgent(
  agents: Agent[],
  agentId: string | undefined,
  username: string,
) {
  return agents
    .filter((agent) => agent.kind === 'annotation' && agent.enabled)
    .find((agent) => agent.id === agentId || agent.username === username);
}

export function findCommentAgent(
  agents: Agent[],
  agentId: string | undefined,
  username: string,
  includeDisabled = false,
) {
  return agents
    .filter((agent) => agent.enabled || (includeDisabled && agent.kind === 'annotation'))
    .find((agent) => agent.id === agentId || agent.username === username);
}

export function findReviewAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return agents
    .filter((agent) => agent.kind === 'review' && agent.enabled)
    .find((agent) => agent.id === agentId || agent.username === username);
}

export function providerTaskForAgent(agent: Agent): ProviderTask {
  return agent.kind === 'review' ? 'reviewAssistant' : 'readingAssistant';
}

export function agentMessageRuntimeTaskType(payload: AgentMessagePayload) {
  if (payload.responseMode === 'create_thought') return 'create_thought';
  if (payload.responseMode === 'distillation_review') return 'distillation_review';
  return 'thread_reply';
}

export type AgentRuntimeTaskType = ReturnType<typeof agentMessageRuntimeTaskType>;

export function selectAgentRuntime(input: {
  requestedMode: AssistantExecutionMode;
  taskType: AgentRuntimeTaskType;
  supportedTaskTypes: AgentRuntimeTaskType[];
}) {
  if (input.requestedMode !== 'deep_verification') return null;
  return input.supportedTaskTypes.includes(input.taskType) ? input.taskType : null;
}

export function publicCommentAgents(agents: Agent[], uiLanguage: UiLanguage) {
  return agents
    .filter((agent) => agent.enabled)
    .map((agent) => resolveAgentPublicIdentity(agent, uiLanguage));
}
