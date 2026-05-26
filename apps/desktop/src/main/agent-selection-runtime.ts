import type { AssistantRuntimeResult } from '@yomitomo/ai';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  ArticleRecord,
  LlmProvider,
} from '@yomitomo/shared';
import { createAgentAnnotation } from '@yomitomo/core';
import {
  assistantReadingToolDefinitions,
  createAssistantReadingToolExecutor,
} from './assistant-runtime-tools';

type AiModule = typeof import('@yomitomo/ai');

export type SelectionRuntimeResult =
  | {
      status: 'result';
      result: AgentAnnotateResult;
      runtime: AssistantRuntimeResult;
    }
  | {
      status: 'fallback';
      failureReason: string;
      runtime?: AssistantRuntimeResult;
    };

export async function runAgentSelectionWithToolLoop(input: {
  ai: Pick<
    AiModule,
    | 'buildAgentSelectionRuntimePayload'
    | 'createAssistantProviderModelAdapter'
    | 'runAssistantToolRuntime'
  >;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentAnnotatePayload;
}): Promise<SelectionRuntimeResult> {
  const articleId = input.payload.article.id;
  const targetAnchor = input.payload.targetAnchor;
  if (!articleId) return { status: 'fallback', failureReason: 'missing_article_id' };
  if (!targetAnchor) return { status: 'fallback', failureReason: 'missing_target_anchor' };

  const runtime = await input.ai.runAssistantToolRuntime({
    taskType: 'selection_first',
    articleId,
    agentId: input.agent.id,
    tools: assistantReadingToolDefinitions,
    modelAdapter: input.ai.createAssistantProviderModelAdapter(
      input.provider,
      input.ai.buildAgentSelectionRuntimePayload(input.provider, input.agent, input.payload),
    ),
    toolExecutor: createAssistantReadingToolExecutor({
      article: {
        id: articleId,
        title: input.payload.article.title,
        annotations: input.payload.annotations || [],
        ebook: ebookRuntimeRecord(input.payload),
      },
      articleText: input.payload.article.text,
      agentId: input.agent.id,
      currentAnchor: targetAnchor,
      readerProgress: input.payload.readerProgress,
    }),
  });

  if (runtime.status !== 'final') {
    return { status: 'fallback', failureReason: runtime.failureReason, runtime };
  }

  if (runtime.action.type === 'no_action') {
    return {
      status: 'result',
      runtime,
      result: { annotations: [], readingMemory: input.payload.readingMemory },
    };
  }

  if (runtime.action.type !== 'add_annotation') {
    return {
      status: 'fallback',
      failureReason: `unexpected_action:${runtime.action.type}`,
      runtime,
    };
  }

  const annotation = createAgentAnnotation(
    input.agent,
    input.payload.article.text,
    {
      exact: targetAnchor.exact,
      prefix: targetAnchor.prefix,
      suffix: targetAnchor.suffix,
      comment: runtime.action.thought,
      annotationType: input.payload.annotationType,
      readingIntent: input.payload.readingIntent,
    },
    new Date().toISOString(),
    { ebookIndex: input.payload.article.ebookIndex },
  );

  if (!annotation) {
    return { status: 'fallback', failureReason: 'annotation_anchor_not_found', runtime };
  }

  return {
    status: 'result',
    runtime,
    result: {
      annotations: [annotation],
      readingMemory: input.payload.readingMemory,
    },
  };
}

function ebookRuntimeRecord(payload: AgentAnnotatePayload): ArticleRecord['ebook'] {
  if (!payload.article.ebookIndex) return undefined;
  return { index: payload.article.ebookIndex } as ArticleRecord['ebook'];
}
