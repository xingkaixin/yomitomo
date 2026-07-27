import React from 'react';
import type { Annotation, MessageSendShortcut, PublicAgent, UserProfile } from '@yomitomo/shared';
import { AnnotationCard } from '../annotations/reader-annotation-card';
import type { ReaderAnnotationRailState } from '../annotations/use-reader-annotation-rail';
import { Composer, type ComposerPopupPhase } from './reader-composer';
import { EmptyNotes } from './reader-empty-notes';
import { HighlightChoiceMenu } from './reader-highlight-choice-menu';
import { SelectionMenu } from './reader-selection-menu';
import { SelectionHandles } from './reader-selection-handles';
import type {
  PendingComposer,
  ReaderAgentModel,
  ReaderAnnotationModel,
  ReaderAppViewActions,
  ReaderArticleModel,
  ReaderSelectionModel,
  ReaderSettingsModel,
  ReaderUiLabels,
} from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

type AnnotationRailStyle = React.CSSProperties & {
  '--reader-empty-left': string;
  '--reader-empty-top': string;
  '--reader-note-width': string;
};
type HighlightGrowStyle = React.CSSProperties & {
  '--highlight-grow-delay'?: string;
};
import {
  buildHighlightSegments,
  highlightSegmentStyle,
  type AnnotationRailLayout,
} from '../annotations/reader-annotations';

type ReaderSurfaceActions = Pick<ReaderAppViewActions, 'annotation' | 'selection'>;

type ReaderSurfaceRefs = {
  articleRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  notesRef: React.RefObject<HTMLElement | null>;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
};

type ReaderSurfaceSelectionModel = ReaderSelectionModel & {
  copyRequestKey: number;
};

type AnimatedComposerLabels = Pick<
  ReaderUiLabels,
  | 'cancel'
  | 'recordThought'
  | 'submitHighlight'
  | 'submitThought'
  | 'thoughtContent'
  | 'thoughtPlaceholder'
>;

type ReaderSurfaceViewLabels = Pick<
  ReaderUiLabels,
  | 'adjustSelectionEnd'
  | 'adjustSelectionStart'
  | 'annotationCardTab'
  | 'annotationProcessing'
  | 'askSelection'
  | 'assistantParticipationSummary'
  | 'cancel'
  | 'closeHighlightChoice'
  | 'copySelection'
  | 'dateLocale'
  | 'deleteAnnotation'
  | 'deleteAnnotationConfirmAction'
  | 'deleteAnnotationConfirmDescription'
  | 'deleteAnnotationConfirmTitle'
  | 'deleteHighlight'
  | 'distillations'
  | 'emptyNotesDescription'
  | 'emptyNotesGestureLabel'
  | 'emptyNotesTitle'
  | 'enterDiscussion'
  | 'highlightChoice'
  | 'openDistillationActions'
  | 'openHighlightActions'
  | 'recordThought'
  | 'relativeTimeLabel'
  | 'submitHighlight'
  | 'submitThought'
  | 'thoughtContent'
  | 'thoughtPlaceholder'
  | 'thoughtSummary'
>;

export type ReaderSurfaceViewProps = {
  actions: ReaderSurfaceActions;
  agents: ReaderAgentModel;
  annotationRail: ReaderAnnotationRailState;
  annotationRailLayout: AnnotationRailLayout;
  annotations: ReaderAnnotationModel;
  article: ReaderArticleModel;
  chatAvailable: boolean;
  labels?: ReaderSurfaceViewLabels;
  refs: ReaderSurfaceRefs;
  selection: ReaderSurfaceSelectionModel;
  settings: ReaderSettingsModel;
  userProfile: UserProfile;
};

const emptyNewAnnotationIds = new Set<string>();
const COMPOSER_CLOSE_FALLBACK_MS = 120;

function HighlightDots({ colors }: { colors: string[] }) {
  if (colors.length <= 1) return null;

  return (
    <>
      <span className="reader-highlight-dots is-start" aria-hidden="true">
        {colors.map((color, index) => (
          <i key={`${color}-${index}`} style={{ backgroundColor: color }} />
        ))}
      </span>
      <span className="reader-highlight-dots is-end" aria-hidden="true">
        {colors.map((color, index) => (
          <i key={`${color}-${index}`} style={{ backgroundColor: color }} />
        ))}
      </span>
    </>
  );
}

function ReaderEdgeBlur({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div className={`reader-edge-blur is-${position}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function AnimatedComposer({
  agents,
  canvasRef,
  composer,
  labels,
  messageSendShortcut,
  shortcutModifier,
  onCancel,
  onSave,
}: {
  agents: PublicAgent[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  composer: PendingComposer | null;
  labels: AnimatedComposerLabels;
  messageSendShortcut: MessageSendShortcut;
  shortcutModifier: string;
  onCancel: () => void;
  onSave: (note: string) => void | Promise<void>;
}) {
  const [visibleComposer, setVisibleComposer] = React.useState<PendingComposer | null>(composer);
  const [phase, setPhase] = React.useState<ComposerPopupPhase>(composer ? 'opening' : 'closing');
  const [sessionKey, setSessionKey] = React.useState(0);
  const openFrameRef = React.useRef<number | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (openFrameRef.current !== null) window.cancelAnimationFrame(openFrameRef.current);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!composer) return;

    if (openFrameRef.current !== null) window.cancelAnimationFrame(openFrameRef.current);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    openFrameRef.current = null;
    closeTimerRef.current = null;

    setVisibleComposer(composer);
    setSessionKey((key) => key + 1);
    setPhase('opening');
    openFrameRef.current = window.requestAnimationFrame(() => {
      openFrameRef.current = null;
      setPhase('open');
    });
  }, [composer]);

  React.useEffect(() => {
    if (composer || !visibleComposer || phase === 'closing') return;

    if (openFrameRef.current !== null) {
      window.cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }

    setPhase('closing');
    const readerApp = canvasRef.current?.closest<HTMLElement>('.reader-app');
    const closeMs = prefersReducedMotion()
      ? 0
      : getCssDurationMs(
          readerApp || document.documentElement,
          '--dropdown-close-dur',
          COMPOSER_CLOSE_FALLBACK_MS,
        );
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setVisibleComposer(null);
    }, closeMs);
  }, [canvasRef, composer, phase, visibleComposer]);

  if (!visibleComposer) return null;

  return (
    <Composer
      agents={agents}
      composer={visibleComposer}
      key={sessionKey}
      labels={labels}
      messageSendShortcut={messageSendShortcut}
      phase={phase}
      shortcutModifier={shortcutModifier}
      onCancel={onCancel}
      onSave={onSave}
    />
  );
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function getCssDurationMs(element: Element, variableName: string, fallback: number) {
  const raw = window.getComputedStyle(element).getPropertyValue(variableName).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith('ms') ? value : value * 1000;
}

export function ReaderSurfaceView({
  actions: { annotation: annotationActions, selection: selectionActions },
  agents: {
    agents,
    pendingAnnotationAgents = {},
    reviewAgents = [],
    theaterBoxes: agentTheaterBoxes,
  },
  annotationRail: {
    annotationRailItems,
    exitingAnnotationIds,
    noteRefForAnnotation,
    visibleAnnotationIds,
    visibleAnnotations,
  },
  annotationRailLayout,
  annotations: {
    activeId,
    annotations,
    boxes,
    distillationAnimation,
    newAnnotationIds = emptyNewAnnotationIds,
    searchBoxes = [],
    showEmptyNotes,
    temporaryBoxes,
  },
  article: { content: articleContent, extracted },
  chatAvailable,
  labels = defaultReaderUiLabels,
  refs: { articleRef, canvasRef, notesRef, surfaceRef },
  selection: {
    composer,
    copyRequestKey: selectionCopyRequestKey,
    highlightChoice,
    selectionAction,
  },
  settings: { messageSendShortcut, selectionActionShortcuts, shortcutModifier },
  userProfile,
}: ReaderSurfaceViewProps) {
  const highlightSegments = React.useMemo(() => buildHighlightSegments(boxes), [boxes]);
  const temporarySegments = React.useMemo(
    () => buildHighlightSegments(temporaryBoxes),
    [temporaryBoxes],
  );
  const agentTheaterSegments = React.useMemo(
    () => buildHighlightSegments(agentTheaterBoxes),
    [agentTheaterBoxes],
  );
  const searchSegments = React.useMemo(() => buildHighlightSegments(searchBoxes), [searchBoxes]);
  const newHighlightDelayBySegmentId = React.useMemo(() => {
    const delays = new Map<string, number>();
    if (newAnnotationIds.size === 0) return delays;

    let newSegmentIndex = 0;
    for (const segment of highlightSegments) {
      if (!segment.annotationIds.some((id) => newAnnotationIds.has(id))) continue;
      delays.set(segment.id, Math.min(newSegmentIndex * 55, 280));
      newSegmentIndex += 1;
    }
    return delays;
  }, [highlightSegments, newAnnotationIds]);
  const visibleAnnotationById = React.useMemo(
    () => new Map(visibleAnnotations.map((annotation) => [annotation.id, annotation])),
    [visibleAnnotations],
  );
  const highlightChoiceAnnotations = highlightChoice
    ? highlightChoice.annotationIds
        .map((id) => visibleAnnotationById.get(id))
        .filter((annotation): annotation is Annotation => Boolean(annotation))
    : [];

  function highlightLabel(annotationId: string) {
    const index = annotations.findIndex((annotation) => annotation.id === annotationId);
    return index >= 0 ? `打开引文讨论 ${index + 1}` : '打开引文讨论';
  }

  const annotationRailStyle: AnnotationRailStyle | undefined =
    annotationRailLayout.mode === 'stacked'
      ? undefined
      : {
          '--reader-empty-top': annotationRailLayout.viewportHeight
            ? `${Math.max(0, annotationRailLayout.viewportHeight) / 2}px`
            : '50vh',
          '--reader-empty-left': `${
            annotationRailLayout.mode === 'left'
              ? annotationRailLayout.leftRailLeft
              : annotationRailLayout.rightRailLeft
          }px`,
          '--reader-note-width': `${annotationRailLayout.railWidth}px`,
        };

  return (
    <div className="reader-surface-frame">
      <section className="reader-surface" ref={surfaceRef} onMouseUp={selectionActions.onMouseUp}>
        <div className="reader-canvas" ref={canvasRef}>
          <article className="reader-article" ref={articleRef}>
            {articleContent ?? (
              <div
                className="reader-article-body"
                dangerouslySetInnerHTML={{ __html: extracted.content }}
              />
            )}
          </article>
          <div className="reader-highlight-layer">
            {highlightSegments.map((segment) => {
              const active = segment.annotationIds.includes(activeId || '');
              const clickableAnnotationIds = segment.annotationIds.filter((id) =>
                visibleAnnotationIds.has(id),
              );
              const annotationId = clickableAnnotationIds[0] || segment.annotationIds[0] || '';
              const growDelay = newHighlightDelayBySegmentId.get(segment.id);
              const isNew = growDelay !== undefined;
              const segmentStyle = {
                ...(highlightSegmentStyle(segment, active) as React.CSSProperties),
                ...(isNew ? { '--highlight-grow-delay': `${growDelay}ms` } : {}),
              } as HighlightGrowStyle;
              return (
                <button
                  aria-label={highlightLabel(annotationId)}
                  className={['reader-highlight', active ? 'is-active' : '', isNew ? 'is-new' : '']
                    .filter(Boolean)
                    .join(' ')}
                  key={`highlight-${segment.id}`}
                  style={segmentStyle}
                  type="button"
                  onClick={(event) =>
                    annotationActions.onHighlightClick(annotationId, event, clickableAnnotationIds)
                  }
                >
                  <HighlightDots colors={segment.colors} />
                </button>
              );
            })}
            {temporarySegments.map((segment) => (
              <div
                className="reader-highlight is-temporary"
                key={`temporary-${segment.id}`}
                style={highlightSegmentStyle(segment, false) as React.CSSProperties}
              >
                <HighlightDots colors={segment.colors} />
              </div>
            ))}
            {agentTheaterSegments.map((segment) => (
              <div
                className="reader-highlight is-agent-theater"
                key={`agent-theater-${segment.id}`}
                style={highlightSegmentStyle(segment, false) as React.CSSProperties}
              >
                <HighlightDots colors={segment.colors} />
              </div>
            ))}
            {searchSegments.map((segment) => (
              <div
                className="reader-highlight is-search is-active"
                key={`search-${segment.id}`}
                style={highlightSegmentStyle(segment, true) as React.CSSProperties}
              />
            ))}
            {selectionAction &&
            selectionAction.adjustable !== false &&
            !composer &&
            selectionActions.onSelectionHandleDrag &&
            selectionActions.onSelectionHandleDragEnd &&
            selectionActions.onSelectionHandleDragStart ? (
              <SelectionHandles
                boxes={temporaryBoxes}
                draggingHandle={selectionAction.draggingHandle}
                labels={labels}
                onDrag={selectionActions.onSelectionHandleDrag}
                onDragEnd={selectionActions.onSelectionHandleDragEnd}
                onDragStart={selectionActions.onSelectionHandleDragStart}
              />
            ) : null}
          </div>
          <aside
            className="reader-annotation-rail"
            ref={notesRef}
            aria-label="引文讨论"
            style={annotationRailStyle}
          >
            {(showEmptyNotes ?? annotations.length === 0) ? <EmptyNotes labels={labels} /> : null}
            {annotationRailItems.map(
              ({ annotation, isStackFront, railSide, stackCount, stackIndex, style }) => (
                <AnnotationCard
                  active={annotation.id === activeId}
                  agents={agents}
                  annotation={annotation}
                  distillationAnimation={
                    distillationAnimation?.annotationId === annotation.id
                      ? distillationAnimation
                      : null
                  }
                  exiting={exitingAnnotationIds.has(annotation.id)}
                  isStackFront={isStackFront}
                  key={annotation.id}
                  labels={labels}
                  noteRef={noteRefForAnnotation(annotation.id)}
                  pendingAgents={pendingAnnotationAgents[annotation.id] || []}
                  stackCount={stackCount}
                  stackIndex={stackIndex}
                  railSide={railSide}
                  style={style}
                  userProfile={userProfile}
                  onDelete={annotationActions.onDeleteAnnotation}
                  onFocus={annotationActions.onScrollToHighlight}
                  onOpenDiscussion={annotationActions.onOpenAnnotationDiscussion}
                  reviewAgents={reviewAgents}
                />
              ),
            )}
          </aside>
          {selectionAction && !composer ? (
            <SelectionMenu
              action={selectionAction}
              labels={labels}
              shortcuts={selectionActionShortcuts}
              copyRequestKey={selectionCopyRequestKey}
              onAnnotate={() => selectionActions.onOpenComposer(selectionAction)}
              onAsk={
                chatAvailable ? () => selectionActions.onAskSelection?.(selectionAction) : undefined
              }
              onCopy={() => selectionActions.onCopySelection(selectionAction)}
              onCopySettled={selectionActions.onClearSelection}
            />
          ) : null}
          {highlightChoice && highlightChoiceAnnotations.length > 1 ? (
            <HighlightChoiceMenu
              action={highlightChoice}
              agents={agents}
              annotations={highlightChoiceAnnotations}
              labels={labels}
              userProfile={userProfile}
              onCancel={selectionActions.onCloseHighlightChoice}
              onSelect={annotationActions.onFocusAnnotation}
            />
          ) : null}
          <AnimatedComposer
            agents={agents}
            canvasRef={canvasRef}
            composer={composer}
            labels={labels}
            messageSendShortcut={messageSendShortcut}
            shortcutModifier={shortcutModifier}
            onCancel={selectionActions.onCancelComposer}
            onSave={annotationActions.onCreateAnnotation}
          />
        </div>
      </section>
      <ReaderEdgeBlur position="top" />
      <ReaderEdgeBlur position="bottom" />
    </div>
  );
}
