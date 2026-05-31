import type { AssistantRuntimeResult } from '@yomitomo/ai';
import type {
  Agent,
  AnnotationDistillationReviewMessage,
  AgentMessagePayload,
  ArticleRecord,
  Comment,
  LlmProvider,
} from '@yomitomo/shared';
import {
  assistantReadingToolDefinitions,
  createAssistantReadingToolExecutor,
} from './assistant-runtime-tools';

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
  ai: Pick<
    AiModule,
    | 'buildAgentThreadReplyRuntimePayload'
    | 'createAssistantProviderModelAdapter'
    | 'runAssistantToolRuntime'
  >;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentMessagePayload;
}): Promise<ThreadReplyRuntimeResult> {
  const articleId = input.payload.article.id;
  if (!articleId) return { status: 'fallback', failureReason: 'missing_article_id' };

  const runtime = await input.ai.runAssistantToolRuntime({
    taskType: 'thread_reply',
    articleId,
    agentId: input.agent.id,
    tools: assistantReadingToolDefinitions,
    allowedAnnotationIds: [input.payload.annotation.id],
    modelAdapter: input.ai.createAssistantProviderModelAdapter(
      input.provider,
      input.ai.buildAgentThreadReplyRuntimePayload(input.provider, input.agent, input.payload),
    ),
    toolExecutor: createAssistantReadingToolExecutor({
      article: {
        id: articleId,
        title: input.payload.article.title,
        annotations: [input.payload.annotation],
        ebook: ebookRuntimeRecord(input.payload),
      },
      articleText: input.payload.article.text,
      agentId: input.agent.id,
      currentAnnotationId: input.payload.annotation.id,
      currentThreadRootCommentId: threadRootCommentId(input.payload),
      currentAnchor: input.payload.annotation.anchor,
      readerProgress: input.payload.readerProgress,
    }),
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
  ai: Pick<
    AiModule,
    | 'buildAgentCreateThoughtRuntimePayload'
    | 'createAssistantProviderModelAdapter'
    | 'runAssistantToolRuntime'
  >;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentMessagePayload;
}): Promise<ThreadReplyRuntimeResult> {
  const articleId = input.payload.article.id;
  if (!articleId) return { status: 'fallback', failureReason: 'missing_article_id' };

  const runtime = await input.ai.runAssistantToolRuntime({
    taskType: 'create_thought',
    articleId,
    agentId: input.agent.id,
    tools: assistantReadingToolDefinitions,
    allowedAnnotationIds: [input.payload.annotation.id],
    modelAdapter: input.ai.createAssistantProviderModelAdapter(
      input.provider,
      input.ai.buildAgentCreateThoughtRuntimePayload(input.provider, input.agent, input.payload),
    ),
    toolExecutor: createAssistantReadingToolExecutor({
      article: {
        id: articleId,
        title: input.payload.article.title,
        annotations: [input.payload.annotation],
        ebook: ebookRuntimeRecord(input.payload),
      },
      articleText: input.payload.article.text,
      agentId: input.agent.id,
      currentAnnotationId: input.payload.annotation.id,
      currentAnchor: input.payload.annotation.anchor,
      readerProgress: input.payload.readerProgress,
    }),
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
  ai: Pick<
    AiModule,
    | 'buildAgentDistillationReviewRuntimePayload'
    | 'createAssistantProviderModelAdapter'
    | 'runAssistantToolRuntime'
  >;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentMessagePayload;
}): Promise<DistillationReviewRuntimeResult> {
  const articleId = input.payload.article.id;
  if (!articleId) return { status: 'fallback', failureReason: 'missing_article_id' };

  const runtime = await input.ai.runAssistantToolRuntime({
    taskType: 'distillation_review',
    articleId,
    agentId: input.agent.id,
    tools: assistantReadingToolDefinitions,
    allowedAnnotationIds: [input.payload.annotation.id],
    modelAdapter: input.ai.createAssistantProviderModelAdapter(
      input.provider,
      input.ai.buildAgentDistillationReviewRuntimePayload(
        input.provider,
        input.agent,
        input.payload,
      ),
    ),
    toolExecutor: createAssistantReadingToolExecutor({
      article: {
        id: articleId,
        title: input.payload.article.title,
        annotations: [input.payload.annotation],
        ebook: ebookRuntimeRecord(input.payload),
      },
      articleText: input.payload.article.text,
      agentId: input.agent.id,
      currentAnnotationId: input.payload.annotation.id,
      currentAnchor: input.payload.annotation.anchor,
      readerProgress: input.payload.readerProgress,
    }),
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

function threadRootCommentId(payload: AgentMessagePayload) {
  return payload.reviewTargetCommentId || payload.userComment.replyTo;
}
