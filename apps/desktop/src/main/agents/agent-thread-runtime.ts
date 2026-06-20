import type { AssistantRuntimeResult } from '@yomitomo/ai';
import type {
  Agent,
  AnnotationDistillationReviewMessage,
  AgentMessagePayload,
  ArticleRecord,
  Comment,
  LlmProvider,
} from '@yomitomo/shared';
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

export async function runAgentThreadReplyWithToolLoop(input: {
  ai: Pick<AiModule, 'buildAgentThreadReplyRuntimePayload' | 'runAssistantAiSdkToolRuntime'>;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentMessagePayload;
  onRuntimeEvent?: Parameters<AiModule['runAssistantAiSdkToolRuntime']>[0]['onEvent'];
}): Promise<ThreadReplyRuntimeResult> {
  const articleId = input.payload.article.id;
  if (!articleId) return { status: 'fallback', failureReason: 'missing_article_id' };
  const readingTools = createAgentMessageReadingTools({
    agent: input.agent,
    payload: input.payload,
    articleId,
    currentThreadRootCommentId: threadRootCommentId(input.payload),
  });

  const runtime = await input.ai.runAssistantAiSdkToolRuntime({
    taskType: 'thread_reply',
    articleId,
    agentId: input.agent.id,
    provider: input.provider,
    payload: input.ai.buildAgentThreadReplyRuntimePayload(
      input.provider,
      input.agent,
      input.payload,
    ),
    onEvent: input.onRuntimeEvent,
    tools: readingTools.tools,
    allowedAnnotationIds: [input.payload.annotation.id],
    toolExecutor: readingTools.toolExecutor,
  });

  if (runtime.status !== 'final') {
    return { status: 'fallback', failureReason: runtime.failureReason, runtime };
  }

  if (runtime.action.type !== 'reply_to_thread') {
    return {
      status: 'fallback',
      failureReason: `unexpected_action:${runtime.action.type}`,
      runtime,
    };
  }

  return {
    status: 'comment',
    runtime,
    comment: {
      id: '',
      author: 'ai',
      content: runtime.action.content,
      createdAt: new Date().toISOString(),
      agentId: input.agent.id,
      agentUsername: input.agent.username,
      agentNickname: input.agent.nickname,
      agentAvatar: input.agent.avatar,
      agentAnnotationColor: input.agent.annotationColor,
      readingIntent: input.payload.readingIntent,
    },
  };
}

export async function runAgentCreateThoughtWithToolLoop(input: {
  ai: Pick<AiModule, 'buildAgentCreateThoughtRuntimePayload' | 'runAssistantAiSdkToolRuntime'>;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentMessagePayload;
  onRuntimeEvent?: Parameters<AiModule['runAssistantAiSdkToolRuntime']>[0]['onEvent'];
}): Promise<ThreadReplyRuntimeResult> {
  const articleId = input.payload.article.id;
  if (!articleId) return { status: 'fallback', failureReason: 'missing_article_id' };
  const readingTools = createAgentMessageReadingTools({
    agent: input.agent,
    payload: input.payload,
    articleId,
  });

  const runtime = await input.ai.runAssistantAiSdkToolRuntime({
    taskType: 'create_thought',
    articleId,
    agentId: input.agent.id,
    provider: input.provider,
    payload: input.ai.buildAgentCreateThoughtRuntimePayload(
      input.provider,
      input.agent,
      input.payload,
    ),
    onEvent: input.onRuntimeEvent,
    tools: readingTools.tools,
    allowedAnnotationIds: [input.payload.annotation.id],
    toolExecutor: readingTools.toolExecutor,
  });

  if (runtime.status !== 'final') {
    return { status: 'fallback', failureReason: runtime.failureReason, runtime };
  }

  if (runtime.action.type !== 'create_thread_thought') {
    return {
      status: 'fallback',
      failureReason: `unexpected_action:${runtime.action.type}`,
      runtime,
    };
  }

  return {
    status: 'comment',
    runtime,
    comment: {
      id: '',
      author: 'ai',
      content: runtime.action.thought,
      createdAt: new Date().toISOString(),
      agentId: input.agent.id,
      agentUsername: input.agent.username,
      agentNickname: input.agent.nickname,
      agentAvatar: input.agent.avatar,
      agentAnnotationColor: input.agent.annotationColor,
      readingIntent: input.payload.readingIntent,
    },
  };
}

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

export async function runAgentDistillationReviewWithToolLoop(input: {
  ai: Pick<AiModule, 'buildAgentDistillationReviewRuntimePayload' | 'runAssistantAiSdkToolRuntime'>;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentMessagePayload;
  onRuntimeEvent?: Parameters<AiModule['runAssistantAiSdkToolRuntime']>[0]['onEvent'];
}): Promise<DistillationReviewRuntimeResult> {
  const articleId = input.payload.article.id;
  if (!articleId) return { status: 'fallback', failureReason: 'missing_article_id' };
  const readingTools = createAgentMessageReadingTools({
    agent: input.agent,
    payload: input.payload,
    articleId,
  });

  const runtime = await input.ai.runAssistantAiSdkToolRuntime({
    taskType: 'distillation_review',
    articleId,
    agentId: input.agent.id,
    provider: input.provider,
    payload: input.ai.buildAgentDistillationReviewRuntimePayload(
      input.provider,
      input.agent,
      input.payload,
    ),
    onEvent: input.onRuntimeEvent,
    tools: readingTools.tools,
    allowedAnnotationIds: [input.payload.annotation.id],
    toolExecutor: readingTools.toolExecutor,
  });

  if (runtime.status !== 'final') {
    return { status: 'fallback', failureReason: runtime.failureReason, runtime };
  }

  if (runtime.action.type !== 'review_distillation') {
    return {
      status: 'fallback',
      failureReason: `unexpected_action:${runtime.action.type}`,
      runtime,
    };
  }

  return {
    status: 'message',
    runtime,
    message: {
      id: '',
      author: 'ai',
      content: runtime.action.content,
      items: runtime.action.items || [],
      proposals: runtime.action.proposals || [],
      createdAt: new Date().toISOString(),
      agentId: input.agent.id,
      agentUsername: input.agent.username,
      agentNickname: input.agent.nickname,
      agentAvatar: input.agent.avatar,
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
