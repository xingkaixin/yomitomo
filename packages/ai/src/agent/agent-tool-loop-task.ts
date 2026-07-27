import type { Agent, AgentMessagePayload, LlmProvider } from '@yomitomo/shared';
import { runAssistantAiSdkToolRuntime } from '../assistant/assistant-runtime';
import type {
  AssistantFinalAction,
  AssistantRuntimeResult,
  AssistantRuntimeStreamEvent,
  AssistantToolDefinition,
  AssistantToolExecutionResult,
  AssistantToolCall,
  AgentToolLoopTaskType,
} from '../assistant/assistant-runtime-types';
import {
  buildAgentCreateThoughtRuntimePayload,
  buildAgentDistillationReviewRuntimePayload,
  buildAgentThreadReplyRuntimePayload,
} from './agent-message';

type AgentToolLoopActionByTask = {
  thread_reply: Extract<AssistantFinalAction, { type: 'reply_to_thread' }>;
  create_thought: Extract<AssistantFinalAction, { type: 'create_thread_thought' }>;
  distillation_review: Extract<AssistantFinalAction, { type: 'review_distillation' }>;
};

type AgentToolLoopTaskDefinition<TaskType extends AgentToolLoopTaskType> = {
  actionType: AgentToolLoopActionByTask[TaskType]['type'];
  buildPayload: typeof buildAgentThreadReplyRuntimePayload;
};

const agentToolLoopTaskDefinitions = {
  thread_reply: {
    actionType: 'reply_to_thread',
    buildPayload: buildAgentThreadReplyRuntimePayload,
  },
  create_thought: {
    actionType: 'create_thread_thought',
    buildPayload: buildAgentCreateThoughtRuntimePayload,
  },
  distillation_review: {
    actionType: 'review_distillation',
    buildPayload: buildAgentDistillationReviewRuntimePayload,
  },
} satisfies {
  [TaskType in AgentToolLoopTaskType]: AgentToolLoopTaskDefinition<TaskType>;
};

export type AgentToolLoopTaskInput<TaskType extends AgentToolLoopTaskType> = {
  taskType: TaskType;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentMessagePayload;
  tools: AssistantToolDefinition[];
  onEvent?: (event: AssistantRuntimeStreamEvent) => void;
  toolExecutor: (toolCall: AssistantToolCall) => Promise<AssistantToolExecutionResult>;
};

export type AgentToolLoopTaskResult<TaskType extends AgentToolLoopTaskType> =
  | {
      status: 'final';
      action: AgentToolLoopActionByTask[TaskType];
      runtime: Extract<AssistantRuntimeResult, { status: 'final' }>;
    }
  | {
      status: 'fallback';
      failureReason: string;
      runtime?: AssistantRuntimeResult;
    };

export async function runAgentToolLoopTask<TaskType extends AgentToolLoopTaskType>(
  input: AgentToolLoopTaskInput<TaskType>,
): Promise<AgentToolLoopTaskResult<TaskType>> {
  const articleId = input.payload.article.id;
  if (!articleId) return { status: 'fallback', failureReason: 'missing_article_id' };

  const definition = agentToolLoopTaskDefinitions[input.taskType];
  const runtime = await runAssistantAiSdkToolRuntime({
    taskType: input.taskType,
    articleId,
    agentId: input.agent.id,
    provider: input.provider,
    payload: definition.buildPayload(input.provider, input.agent, input.payload),
    onEvent: input.onEvent,
    tools: input.tools,
    allowedAnnotationIds: [input.payload.annotation.id],
    toolExecutor: input.toolExecutor,
  });
  if (runtime.status === 'fallback') {
    return {
      status: 'fallback',
      failureReason: runtime.failureReason,
      runtime,
    };
  }
  if (!isExpectedAction(input.taskType, runtime.action)) {
    return {
      status: 'fallback',
      failureReason: `unexpected_action:${runtime.action.type}`,
      runtime,
    };
  }
  return {
    status: 'final',
    action: runtime.action,
    runtime,
  };
}

function isExpectedAction<TaskType extends AgentToolLoopTaskType>(
  taskType: TaskType,
  action: AssistantFinalAction,
): action is AgentToolLoopActionByTask[TaskType] {
  return action.type === agentToolLoopTaskDefinitions[taskType].actionType;
}
