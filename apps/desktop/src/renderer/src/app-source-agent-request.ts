import type {
  AgentAnnotatePayload,
  AgentReadingIntent,
  AgentReadingPlanItem,
  Annotation,
  AnnotationType,
  PublicAgent,
  ReadingMemory,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import type { PromptArticle } from './app-reading-types';
import {
  routeFocusReadingPlanMessages,
  targetAnchorReadingPlan,
} from './app-source-bookcase-shared';

export type SourceAgentAnnotationRequestOptions = {
  annotationType?: AnnotationType;
  readingIntent?: AgentReadingIntent;
  instruction?: string;
  targetAnchor?: Annotation['anchor'];
  readingPlan?: AgentReadingPlanItem[];
  article?: PromptArticle;
  articleId?: string;
  pendingAnnotationId?: string;
};

export type SourceAgentAnnotationRuntimeContext = {
  article: PromptArticle;
  annotations: Annotation[];
  readingMemory?: ReadingMemory;
};

export type SourceAgentAnnotationPlaybackMode = 'target' | 'careful' | 'article';

export type SourceAgentAnnotationRequestInput = {
  payload: AgentAnnotatePayload;
  readingPlan: AgentReadingPlanItem[];
  playbackMode: SourceAgentAnnotationPlaybackMode;
  shouldSaveReadingMemory: boolean;
};

type SourceAgentAnnotationRequester = Pick<
  typeof window.yomitomoDesktop,
  'requestAgentAnnotationsStream'
>;

export function buildAgentAnnotationRequestInput(
  agent: PublicAgent,
  options: SourceAgentAnnotationRequestOptions,
  context: SourceAgentAnnotationRuntimeContext,
): SourceAgentAnnotationRequestInput {
  const readingPlan =
    options.readingPlan || targetAnchorReadingPlan(options.targetAnchor, options.readingIntent);
  const isTargetRequest = Boolean(options.targetAnchor);
  const hasReadingPlan = readingPlan.length > 0;
  const shouldSaveReadingMemory = !isTargetRequest && hasReadingPlan;

  return {
    payload: {
      agentId: agent.id,
      agentUsername: agent.username,
      annotationType: options.annotationType,
      readingIntent: options.readingIntent,
      instruction: options.instruction,
      annotations: isTargetRequest || hasReadingPlan ? context.annotations : undefined,
      readingMemory: shouldSaveReadingMemory ? context.readingMemory : undefined,
      targetAnchor: options.targetAnchor,
      readingPlan: shouldSaveReadingMemory ? readingPlan : undefined,
      article: context.article,
    },
    readingPlan,
    playbackMode: isTargetRequest ? 'target' : hasReadingPlan ? 'careful' : 'article',
    shouldSaveReadingMemory,
  };
}

export async function prepareSourceAgentAnnotationRequestInput({
  desktop,
  agent,
  agents,
  options,
  context,
}: {
  desktop: Parameters<typeof routeFocusReadingPlanMessages>[0]['desktop'];
  agent: PublicAgent;
  agents: PublicAgent[];
  options: SourceAgentAnnotationRequestOptions;
  context: SourceAgentAnnotationRuntimeContext;
}) {
  const requestInput = buildAgentAnnotationRequestInput(agent, options, context);
  const routedReadingPlan = await routeFocusReadingPlanMessages({
    desktop,
    agent,
    agents,
    article: context.article,
    readingPlan: requestInput.readingPlan,
  });
  if (routedReadingPlan === requestInput.readingPlan) return requestInput;
  return {
    ...requestInput,
    readingPlan: routedReadingPlan,
    payload: {
      ...requestInput.payload,
      readingPlan: requestInput.payload.readingPlan ? routedReadingPlan : undefined,
    },
  };
}

export function createPendingAgentAnnotation(
  agent: PublicAgent,
  targetAnchor: Annotation['anchor'],
  readingIntent?: AgentReadingIntent,
  now = new Date().toISOString(),
): Annotation {
  return {
    id: makeId('annotation'),
    anchor: targetAnchor,
    author: 'ai',
    color: agent.annotationColor,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    readingIntent,
    comments: [
      {
        id: makeId('comment'),
        author: 'ai',
        content: `${agent.nickname} 正在思考`,
        createdAt: now,
        agentId: agent.id,
        agentUsername: agent.username,
        agentNickname: agent.nickname,
        agentAvatar: agent.avatar,
        agentAnnotationColor: agent.annotationColor,
        readingIntent,
        pending: true,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function withoutAnnotationId(annotations: Annotation[], annotationId: string) {
  return annotations.filter((annotation) => annotation.id !== annotationId);
}

export async function runSourceAgentAnnotationRequest({
  desktop,
  requestInput,
  onAnnotation,
}: {
  desktop: SourceAgentAnnotationRequester;
  requestInput: SourceAgentAnnotationRequestInput;
  onAnnotation: (annotation: Annotation) => boolean;
}) {
  let annotationCount = 0;
  const result = await desktop.requestAgentAnnotationsStream(requestInput.payload, (event) => {
    if (event.type !== 'item') return;
    if (onAnnotation(event.annotation)) annotationCount += 1;
  });
  return { result, annotationCount };
}
