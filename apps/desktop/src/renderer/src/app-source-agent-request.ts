import type {
  AgentAnnotatePayload,
  AgentReadingIntent,
  AgentReadingPlanItem,
  Annotation,
  AnnotationType,
  PublicAgent,
  ReadingMemory,
} from '@yomitomo/shared';
import type { PromptArticle } from './app-reading-types';
import { agentInstructionFromNote, targetAnchorReadingPlan } from './app-source-bookcase-shared';

export type SourceAgentAnnotationRequestOptions = {
  annotationType?: AnnotationType;
  readingIntent?: AgentReadingIntent;
  instruction?: string;
  targetAnchor?: Annotation['anchor'];
  readingPlan?: AgentReadingPlanItem[];
  article?: PromptArticle;
  articleId?: string;
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

type SourceAgentMentionPlanner = Pick<
  typeof window.yomitomoDesktop,
  'planAgentMentionInstructions'
>;
type SourceAgentAnnotationRequester = Pick<
  typeof window.yomitomoDesktop,
  'requestAgentAnnotationsStream'
>;

export type SourceAgentMentionStatusOptions = {
  clearAfterMs?: number;
};

export type SourceAgentMentionInstruction = {
  agent: PublicAgent;
  instruction?: string;
  readingIntent?: AgentReadingIntent;
};

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

export async function resolveSourceAgentMentionInstructions({
  desktop,
  article,
  targetAnchor,
  agents,
  note,
  onStatus,
}: {
  desktop: SourceAgentMentionPlanner | undefined;
  article: PromptArticle;
  targetAnchor: Annotation['anchor'];
  agents: PublicAgent[];
  note: string;
  onStatus?: (message: string, options?: SourceAgentMentionStatusOptions) => void;
}): Promise<SourceAgentMentionInstruction[]> {
  const commonInstruction = agentInstructionFromNote(note, agents) || undefined;
  const baseInstructions = agents.map((agent) => ({
    agent,
    instruction: commonInstruction,
    readingIntent: undefined,
  }));
  if (!desktop) return baseInstructions;

  try {
    onStatus?.('正在拆解助手任务');
    const instructions = await desktop.planAgentMentionInstructions({
      article,
      targetAnchor,
      agents,
      note,
    });
    onStatus?.('');
    return agents.map((agent) => {
      const instruction = instructions.find(
        (item) => item.agentId === agent.id || item.agentUsername === agent.username,
      );
      return {
        agent,
        instruction: instruction?.instruction || commonInstruction,
        readingIntent: instruction?.readingIntent,
      };
    });
  } catch (error) {
    onStatus?.(error instanceof Error ? error.message : '助手任务拆解失败', {
      clearAfterMs: 1800,
    });
    return baseInstructions;
  }
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
