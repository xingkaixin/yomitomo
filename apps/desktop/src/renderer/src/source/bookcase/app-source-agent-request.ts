import type {
  AgentAnnotatePayload,
  AgentReadingIntent,
  AgentReadingPlanItem,
  Annotation,
  AnnotationType,
  PublicAgent,
  ReadingMemory,
  UiLanguage,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import type { PromptArticle } from '../../shell/app-reading-types';
import i18next from 'i18next';
import {
  routeFocusReadingPlanMessages,
  targetAnchorReadingPlan,
} from './app-source-agent-mention-request';

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
  uiLanguage?: UiLanguage;
};

export type SourceAgentAnnotationPlaybackMode = 'target' | 'careful' | 'article';

export type SourceAgentAnnotationRequestInput = {
  agent: PublicAgent;
  payload: AgentAnnotatePayload;
  readingPlan: AgentReadingPlanItem[];
  playbackMode: SourceAgentAnnotationPlaybackMode;
  shouldSaveReadingMemory: boolean;
};

type SourceAgentAnnotationRequester = Pick<
  typeof window.yomitomoDesktop,
  'requestAgentAnnotationsStream'
>;

type AnnotationHandlingState = { status: 'accepting' } | { status: 'failed'; error: unknown };

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
    agent,
    payload: {
      agentId: agent.id,
      agentUsername: agent.username,
      uiLanguage: context.uiLanguage,
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
        content: i18next.t('source.agentThinking', { name: agent.nickname }),
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
  onAnnotation: (annotation: Annotation) => Promise<boolean> | boolean;
}) {
  let annotationCount = 0;
  let annotationHandling = Promise.resolve<AnnotationHandlingState>({ status: 'accepting' });
  let result: Awaited<ReturnType<SourceAgentAnnotationRequester['requestAgentAnnotationsStream']>>;
  try {
    result = await desktop.requestAgentAnnotationsStream(requestInput.payload, (event) => {
      if (event.type !== 'item') return;
      const annotation = localizedAgentAnnotation(requestInput.agent, event.annotation);
      annotationHandling = annotationHandling.then(async (state) => {
        if (state.status === 'failed') return state;
        try {
          if (await onAnnotation(annotation)) annotationCount += 1;
          return state;
        } catch (error) {
          console.warn('[agent-annotation] stream item handling failed', {
            agentId: requestInput.agent.id,
            annotationId: annotation.id,
            error,
          });
          return { status: 'failed', error };
        }
      });
    });
  } catch (error) {
    await annotationHandling;
    throw error;
  }
  const handlingState = await annotationHandling;
  if (handlingState.status === 'failed') throw handlingState.error;
  return { result, annotationCount };
}

function localizedAgentAnnotation(agent: PublicAgent, annotation: Annotation): Annotation {
  return {
    ...annotation,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    comments: annotation.comments.map((comment) =>
      comment.author === 'ai'
        ? {
            ...comment,
            agentId: agent.id,
            agentUsername: agent.username,
            agentNickname: agent.nickname,
            agentAvatar: agent.avatar,
            agentAnnotationColor: agent.annotationColor,
          }
        : comment,
    ),
  };
}
