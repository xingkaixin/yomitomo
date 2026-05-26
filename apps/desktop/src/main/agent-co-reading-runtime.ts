import type { AssistantRuntimeResult } from '@yomitomo/ai';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  Annotation,
  ArticleRecord,
  LlmProvider,
} from '@yomitomo/shared';
import {
  assistantReadingToolDefinitions,
  createAssistantReadingToolExecutor,
} from './assistant-runtime-tools';

type AiModule = typeof import('@yomitomo/ai');

export type CoReadingRuntimeTrace = {
  annotationId: string;
  status: AssistantRuntimeResult['status'] | 'kept_without_runtime';
  actionType?: string;
  failureReason?: string;
};

export type CoReadingRuntimeResult =
  | {
      status: 'result';
      result: AgentAnnotateResult;
      traces: CoReadingRuntimeTrace[];
    }
  | {
      status: 'fallback';
      failureReason: string;
    };

export async function runAgentCoReadingHybridWithToolLoop(input: {
  ai: Pick<
    AiModule,
    | 'buildAgentCoReadingRuntimePayload'
    | 'createAssistantProviderModelAdapter'
    | 'runAgentAnnotateWithMemory'
    | 'runAssistantToolRuntime'
  >;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentAnnotatePayload;
}): Promise<CoReadingRuntimeResult> {
  const articleId = input.payload.article.id;
  if (!articleId) return { status: 'fallback', failureReason: 'missing_article_id' };
  if (!input.payload.readingPlan?.length) {
    return { status: 'fallback', failureReason: 'missing_reading_plan' };
  }

  const baseResult = await input.ai.runAgentAnnotateWithMemory(
    input.provider,
    input.agent,
    input.payload,
  );
  const kept: Annotation[] = [];
  const traces: CoReadingRuntimeTrace[] = [];

  for (const annotation of baseResult.annotations) {
    const decision = await coReadingAnnotationDecision(input, articleId, annotation);
    traces.push(decision.trace);
    if (decision.keep) kept.push(decision.annotation);
  }

  return {
    status: 'result',
    traces,
    result: {
      annotations: kept,
      readingMemory: baseResult.readingMemory,
    },
  };
}

async function coReadingAnnotationDecision(
  input: {
    ai: Pick<
      AiModule,
      | 'buildAgentCoReadingRuntimePayload'
      | 'createAssistantProviderModelAdapter'
      | 'runAssistantToolRuntime'
    >;
    provider: LlmProvider;
    agent: Agent;
    payload: AgentAnnotatePayload;
  },
  articleId: string,
  annotation: Annotation,
): Promise<{ keep: boolean; annotation: Annotation; trace: CoReadingRuntimeTrace }> {
  const runtime = await input.ai.runAssistantToolRuntime({
    taskType: 'co_reading_section',
    articleId,
    agentId: input.agent.id,
    tools: assistantReadingToolDefinitions,
    modelAdapter: input.ai.createAssistantProviderModelAdapter(
      input.provider,
      input.ai.buildAgentCoReadingRuntimePayload(
        input.provider,
        input.agent,
        input.payload,
        annotation,
      ),
    ),
    toolExecutor: createAssistantReadingToolExecutor({
      article: {
        id: articleId,
        title: input.payload.article.title,
        annotations: [...(input.payload.annotations || []), annotation],
        ebook: ebookRuntimeRecord(input.payload),
      },
      articleText: input.payload.article.text,
      agentId: input.agent.id,
      currentAnchor: annotation.anchor,
      readerProgress: input.payload.readerProgress,
    }),
  });

  if (runtime.status !== 'final') {
    return {
      keep: true,
      annotation,
      trace: {
        annotationId: annotation.id,
        status: runtime.status,
        failureReason: runtime.failureReason,
      },
    };
  }

  if (runtime.action.type === 'no_action') {
    return {
      keep: false,
      annotation,
      trace: {
        annotationId: annotation.id,
        status: runtime.status,
        actionType: runtime.action.type,
      },
    };
  }

  if (runtime.action.type !== 'add_annotation') {
    return {
      keep: true,
      annotation,
      trace: {
        annotationId: annotation.id,
        status: runtime.status,
        actionType: runtime.action.type,
      },
    };
  }

  return {
    keep: true,
    annotation: annotationWithThought(annotation, runtime.action.thought),
    trace: {
      annotationId: annotation.id,
      status: runtime.status,
      actionType: runtime.action.type,
    },
  };
}

function annotationWithThought(annotation: Annotation, thought: string): Annotation {
  const primary = annotation.comments[0];
  if (!primary || primary.content === thought) return annotation;
  return {
    ...annotation,
    comments: [{ ...primary, content: thought }, ...annotation.comments.slice(1)],
  };
}

function ebookRuntimeRecord(payload: AgentAnnotatePayload): ArticleRecord['ebook'] {
  if (!payload.article.ebookIndex) return undefined;
  return { index: payload.article.ebookIndex } as ArticleRecord['ebook'];
}
