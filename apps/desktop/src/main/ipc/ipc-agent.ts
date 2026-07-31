import { makeId, normalizeUiLanguage } from '@yomitomo/shared';
import {
  executeAgentAnnotationTask,
  executeAgentCommentTask,
  executeAgentDistillationReviewTask,
  type AgentTaskExecutionContext,
} from '../agents/agent-task-execution';
import { createAssistantExecutionRecorder } from '../agents/agent-execution-recorder';
import {
  createAgentReadingMemoryPort,
  createLazyReadingMemoryExecutor,
} from '../agents/agent-reading-memory';
import {
  findReviewAgent,
  publicCommentAgents,
  reviewAgentNotFoundError,
  taskProvider,
} from '../agents/agent-runtime-routing';
import { appendAgentRuntimeTrace } from '../agents/agent-runtime-trace-log';
import { getSqliteExecutor } from '../store/store-db';
import type { ReadingMemorySqliteExecutor } from '../reading-memory/reading-memory-store';
import type { DesktopAiModule, DesktopMainIpcContext } from './ipc';
import { assertDesktopIpcAppLockUnlocked, handleDesktopIpc } from './ipc';
import { registerAgentStreamCancelIpc, runAgentStreamIpc } from './ipc-agent-stream';

type AgentIpcContext = Pick<DesktopMainIpcContext, 'elapsedMs' | 'logError' | 'logInfo'> & {
  getAiModule: () => Promise<
    Awaited<ReturnType<AgentTaskExecutionContext['getAiModule']>> &
      Pick<DesktopAiModule, 'planAgentMentionRoute' | 'runAgentReview'>
  >;
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
      appendRuntimeTrace: appendAgentRuntimeTrace,
      recordAssistantExecutionRun: (input) =>
        context
          .getPersistenceModules()
          .then(({ storeAssistantExecutions }) =>
            storeAssistantExecutions.recordAssistantExecutionRun(input),
          ),
      logger: context,
    }),
    readingMemory: createAgentReadingMemoryPort({
      executor: createLazyReadingMemoryExecutor(
        getSqliteExecutor as () => ReadingMemorySqliteExecutor,
      ),
      logger: context,
    }),
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
  handleDesktopIpc('agent:review', async (_event, payload) => {
    const { runAgentReview } = await context.getAiModule();
    const store = await readAgentRuntimeStore(context);
    const agent = findReviewAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw reviewAgentNotFoundError(payload.agentUsername);
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'reviewAssistant',
    );
    const comments = await runAgentReview(provider, agent, {
      ...payload,
      uiLanguage: normalizeUiLanguage(store.settings.uiLanguage),
      agentRoster: publicCommentAgents(
        store.agents,
        normalizeUiLanguage(store.settings.uiLanguage),
      ),
    });
    for (const comment of comments) comment.id = makeId('comment');
    return comments;
  });
  registerAgentStreamCancelIpc();
  runAgentStreamIpc(
    'agent:comment:stream',
    'AGENT_REPLY_FAILED',
    async (input, sender) => {
      const comment = await executeAgentCommentTask(
        taskExecutionContext,
        input.payload,
        (event) => sender.send(event),
        sender.signal,
      );
      sender.send({ type: 'done', comment });
    },
    () => assertDesktopIpcAppLockUnlocked(context),
  );
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
  runAgentStreamIpc(
    'agent:annotate:stream',
    'AGENT_ANNOTATION_FAILED',
    async (input, sender) => {
      const result = await executeAgentAnnotationTask(
        taskExecutionContext,
        input.payload,
        (event) => sender.send(event),
        sender.signal,
      );
      sender.send({ type: 'done', ...result });
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
