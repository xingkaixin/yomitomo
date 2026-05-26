import type { AssistantRuntimeResult } from '@yomitomo/ai';
import type {
  Agent,
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

function ebookRuntimeRecord(payload: AgentMessagePayload): ArticleRecord['ebook'] {
  if (!payload.article.ebookIndex) return undefined;
  return { index: payload.article.ebookIndex } as ArticleRecord['ebook'];
}

function threadRootCommentId(payload: AgentMessagePayload) {
  return payload.reviewTargetCommentId || payload.userComment.replyTo;
}
