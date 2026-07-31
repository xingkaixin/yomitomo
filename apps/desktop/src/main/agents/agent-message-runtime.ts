import type { AgentToolLoopTaskType, AssistantRuntimeResult } from '@yomitomo/ai';
import type {
  Agent,
  AnnotationDistillationReviewMessage,
  AgentMessagePayload,
  ArticleRecord,
  Comment,
  LlmProvider,
} from '@yomitomo/shared';
import { annotationAgentAuthorRef } from '@yomitomo/core';
import { createAssistantReadingTools } from '../assistant/assistant-reading-tools';

type AiModule = typeof import('@yomitomo/ai');

export type ThreadReplyRuntimeResult =
  | {
      status: 'comment';
      comment: Comment;
      runtime: AssistantRuntimeResult;
    }
  | {
      status: 'fallback';
      failureReason: string;
      runtime?: AssistantRuntimeResult;
    };

type AgentMessageToolLoopInput<TaskType extends AgentToolLoopTaskType> = {
  ai: Pick<AiModule, 'runAgentToolLoopTask'>;
  signal?: AbortSignal;
  taskType: TaskType;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentMessagePayload;
  onRuntimeEvent?: Parameters<AiModule['runAgentToolLoopTask']>[0]['onEvent'];
};

export type DistillationReviewRuntimeResult =
  | {
      status: 'message';
      message: AnnotationDistillationReviewMessage;
      runtime: AssistantRuntimeResult;
    }
  | {
      status: 'fallback';
      failureReason: string;
      runtime?: AssistantRuntimeResult;
    };

type CommentToolLoopTaskType = Exclude<AgentToolLoopTaskType, 'distillation_review'>;

export function runAgentMessageWithToolLoop(
  input: AgentMessageToolLoopInput<CommentToolLoopTaskType>,
): Promise<ThreadReplyRuntimeResult>;

export function runAgentMessageWithToolLoop(
  input: AgentMessageToolLoopInput<'distillation_review'>,
): Promise<DistillationReviewRuntimeResult>;

export async function runAgentMessageWithToolLoop(
  input: AgentMessageToolLoopInput<AgentToolLoopTaskType>,
): Promise<ThreadReplyRuntimeResult | DistillationReviewRuntimeResult> {
  const articleId = input.payload.article.id;
  if (!articleId) return { status: 'fallback', failureReason: 'missing_article_id' };
  const readingTools = createAgentMessageReadingTools({
    agent: input.agent,
    payload: input.payload,
    articleId,
    currentThreadRootCommentId:
      input.taskType === 'thread_reply' ? threadRootCommentId(input.payload) : undefined,
  });

  const result = await input.ai.runAgentToolLoopTask({
    signal: input.signal,
    taskType: input.taskType,
    provider: input.provider,
    agent: input.agent,
    payload: input.payload,
    onEvent: input.onRuntimeEvent,
    tools: readingTools.tools,
    toolExecutor: readingTools.toolExecutor,
  });

  if (result.status === 'fallback') {
    return {
      status: 'fallback',
      failureReason: result.failureReason,
      runtime: result.runtime,
    };
  }

  const action = result.action;
  if (action.type === 'review_distillation') {
    return {
      status: 'message',
      runtime: result.runtime,
      message: {
        id: '',
        author: annotationAgentAuthorRef(input.agent),
        content: action.content,
        items: action.items || [],
        proposals: action.proposals || [],
        createdAt: new Date().toISOString(),
      },
    };
  }
  return {
    status: 'comment',
    runtime: result.runtime,
    comment: {
      id: '',
      author: annotationAgentAuthorRef(input.agent),
      content: action.type === 'reply_to_thread' ? action.content : action.thought,
      createdAt: new Date().toISOString(),
      readingIntent: input.payload.readingIntent,
    },
  };
}

function ebookRuntimeRecord(payload: AgentMessagePayload): ArticleRecord['ebook'] {
  if (!payload.article.ebookIndex) return undefined;
  return { index: payload.article.ebookIndex } as ArticleRecord['ebook'];
}

function createAgentMessageReadingTools(input: {
  agent: Agent;
  payload: AgentMessagePayload;
  articleId: string;
  currentThreadRootCommentId?: string;
}) {
  return createAssistantReadingTools({
    article: {
      id: input.articleId,
      title: input.payload.article.title,
      annotations: [input.payload.annotation],
      ebook: ebookRuntimeRecord(input.payload),
    },
    articleText: input.payload.article.text,
    agentId: input.agent.id,
    currentAnnotationId: input.payload.annotation.id,
    currentThreadRootCommentId: input.currentThreadRootCommentId,
    currentAnchor: input.payload.annotation.anchor,
    readerProgress: input.payload.readerProgress,
  });
}

function threadRootCommentId(payload: AgentMessagePayload) {
  return payload.reviewTargetCommentId || payload.userComment.replyTo;
}
