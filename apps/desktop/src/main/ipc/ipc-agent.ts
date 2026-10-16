import {
  executeAgentDistillationReviewTask,
  type AgentTaskExecutionContext,
} from '../agents/agent-task-execution';
import { createAssistantExecutionRecorder } from '../agents/agent-execution-recorder';
import { taskProvider } from '../agents/agent-runtime-routing';
import { runDistillationReview } from '../assistant-sessions/assistant-session-lifecycle';
import type { DesktopAiModule, DesktopMainIpcContext } from './ipc';
import { assertDesktopIpcAppLockUnlocked, handleDesktopIpc } from './ipc';
import { registerAgentStreamCancelIpc, runAgentStreamIpc } from './ipc-agent-stream';

type AgentIpcContext = Pick<DesktopMainIpcContext, 'elapsedMs' | 'logError' | 'logInfo'> & {
  getAiModule: () => Promise<Pick<DesktopAiModule, 'planAgentMentionRoute'>>;
  getPersistenceModules: () => Promise<{
    providerRepository: Pick<
      typeof import('../providers/provider-repository'),
      'hydrateProviderApiKey'
    >;
    storeAgents: typeof import('../store/store-agents');
    storeAssistantExecutions: Pick<
      typeof import('../store/store-assistant-executions'),
      'recordAssistantExecutionRun'
    >;
    storeSettings: Pick<typeof import('../store/store-settings'), 'readAppLockSettings'>;
    storeSnapshot: Pick<typeof import('../store/store-snapshot'), 'readStore'>;
  }>;
};

export function registerAgentIpc(context: AgentIpcContext) {
  const taskExecutionContext: AgentTaskExecutionContext = {
    ...context,
    recorder: createAssistantExecutionRecorder({
      recordAssistantExecutionRun: (input) =>
        context
          .getPersistenceModules()
          .then(({ storeAssistantExecutions }) =>
            storeAssistantExecutions.recordAssistantExecutionRun(input),
          ),
      logger: context,
    }),
    runDistillationReview,
  };
  handleDesktopIpc('agent:mention-route', async (_event, payload) => {
    const { planAgentMentionRoute } = await context.getAiModule();
    const store = await readAgentRuntimeStore(context);
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'readingAssistant',
    );
    return planAgentMentionRoute(provider, payload);
  });
  registerAgentStreamCancelIpc();
  runAgentStreamIpc(
    'agent:distillation-review:stream',
    'AGENT_DISTILLATION_REVIEW_FAILED',
    async (input, sender) => {
      const message = await executeAgentDistillationReviewTask(
        taskExecutionContext,
        input.payload,
        (event) => sender.send(event),
        sender.signal,
      );
      sender.send({ type: 'done', message });
    },
    () => assertDesktopIpcAppLockUnlocked(context),
  );
  handleDesktopIpc('agent:save', async (_event, input) => {
    const { storeAgents } = await context.getPersistenceModules();
    return storeAgents.saveAgent(input);
  });
  handleDesktopIpc('agent:delete', async (_event, id) => {
    const { storeAgents } = await context.getPersistenceModules();
    return storeAgents.deleteAgent(id);
  });
}

async function readAgentRuntimeStore(context: AgentIpcContext) {
  const { storeAgents } = await context.getPersistenceModules();
  return storeAgents.readAgentRuntimeContext();
}
