import type {
  Annotation,
  ArticleRecord,
  PublicAgent,
  ReadingMemory,
  UiLanguage,
} from '@yomitomo/shared';
import type { PromptArticle } from '../../shell/app-reading-types';
import {
  createPendingAgentAnnotation,
  prepareSourceAgentAnnotationRequestInput,
  runSourceAgentAnnotationRequest,
  type SourceAgentAnnotationRequestInput,
  type SourceAgentAnnotationRequestOptions,
  withoutAnnotationId,
} from './app-source-agent-request';

export type SourceAgentAnnotationContext<TSource = unknown> = {
  article: PromptArticle;
  articleId: string;
  articleScopedWrite?: boolean;
  articleText: string;
  readingMemory?: ReadingMemory;
  showProgress?: boolean;
  source?: TSource;
  visibleArticle?: boolean;
};

export type SourceAgentAnnotationOutcome =
  | { status: 'empty' }
  | { annotationCount: number; status: 'success' }
  | { status: 'failure' };

export type SourceAgentAnnotationPlayback = {
  accept: (
    annotation: Annotation,
    requestInput: SourceAgentAnnotationRequestInput,
  ) => Promise<boolean> | boolean;
  finish: (outcome: SourceAgentAnnotationOutcome) => Promise<void> | void;
};

export type SourceAgentAnnotationRun<TSource = unknown> = {
  context: SourceAgentAnnotationContext<TSource>;
  options: SourceAgentAnnotationRequestOptions;
  start: (
    requestInput: SourceAgentAnnotationRequestInput,
  ) => Promise<SourceAgentAnnotationPlayback> | SourceAgentAnnotationPlayback;
};

export type SourceAgentAnnotationSurface = {
  annotations: () => Annotation[];
  applyAnnotations: (annotations: Annotation[], updatedAt?: string) => void;
  openAnnotation?: (annotationId: string) => void;
};

export type SourceAgentAnnotationAdapter<TSource = unknown> = {
  prepare: (args: {
    agent: PublicAgent;
    currentArticle: ArticleRecord;
    options: SourceAgentAnnotationRequestOptions;
    surface: SourceAgentAnnotationSurface;
  }) =>
    | Promise<SourceAgentAnnotationRun<TSource> | null>
    | SourceAgentAnnotationRun<TSource>
    | null;
};

type SourceAgentAnnotationDesktop = Parameters<
  typeof prepareSourceAgentAnnotationRequestInput
>[0]['desktop'] &
  Parameters<typeof runSourceAgentAnnotationRequest>[0]['desktop'];

export async function runSourceAgentAnnotationSession({
  adapter,
  agent,
  annotationAgents,
  currentArticle,
  desktop,
  onSettled,
  options,
  surface,
  uiLanguage,
}: {
  adapter: SourceAgentAnnotationAdapter;
  agent: PublicAgent;
  annotationAgents: PublicAgent[];
  currentArticle: ArticleRecord;
  desktop: SourceAgentAnnotationDesktop;
  onSettled?: () => void;
  options: SourceAgentAnnotationRequestOptions;
  surface: SourceAgentAnnotationSurface;
  uiLanguage?: UiLanguage;
}) {
  let pendingAnnotation: Annotation | null = null;
  const removePendingAnnotation = () => {
    if (!pendingAnnotation) return;
    surface.applyAnnotations(withoutAnnotationId(surface.annotations(), pendingAnnotation.id));
    pendingAnnotation = null;
  };

  try {
    const run = await adapter.prepare({ agent, currentArticle, options, surface });
    if (!run) return;

    const requestInput = await prepareSourceAgentAnnotationRequestInput({
      desktop,
      agent,
      agents: annotationAgents,
      options: run.options,
      context: {
        article: run.context.article,
        annotations: surface.annotations(),
        readingMemory:
          run.context.readingMemory ?? currentArticle.focusCoReadingPlan?.readingMemory,
        uiLanguage,
      },
    });
    const playback = await run.start(requestInput);

    if (
      run.context.showProgress !== false &&
      run.context.visibleArticle !== false &&
      run.options.targetAnchor &&
      !run.options.pendingAnnotationId
    ) {
      pendingAnnotation = createPendingAgentAnnotation(
        agent,
        run.options.targetAnchor,
        run.options.readingIntent,
      );
      surface.applyAnnotations([...surface.annotations(), pendingAnnotation]);
      surface.openAnnotation?.(pendingAnnotation.id);
    }

    let outcome: SourceAgentAnnotationOutcome = { status: 'failure' };
    try {
      const { annotationCount } = await runSourceAgentAnnotationRequest({
        desktop,
        requestInput,
        onAnnotation: (annotation) => {
          removePendingAnnotation();
          return playback.accept(annotation, requestInput);
        },
      });
      outcome =
        annotationCount === 0 ? { status: 'empty' } : { status: 'success', annotationCount };
    } finally {
      removePendingAnnotation();
      await playback.finish(outcome);
    }
  } finally {
    onSettled?.();
  }
}
