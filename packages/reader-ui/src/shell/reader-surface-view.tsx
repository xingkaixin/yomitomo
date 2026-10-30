import React from 'react';
import { useStableCallback } from '../hooks/use-stable-callback';
import { annotationOrdinalsById, highlightDiscussionLabel } from './reader-highlight-labels';
import type { Annotation, MessageSendShortcut, PublicAgent, UserProfile } from '@yomitomo/shared';
import { buildHighlightSegments, highlightSegmentStyle } from '@yomitomo/core';
import { AnnotationCard, type ReaderWindowSourceRect } from '../annotations/reader-annotation-card';
import type { ReaderAnnotationRailState } from '../annotations/use-reader-annotation-rail';
import { Composer, type ComposerPopupPhase } from './reader-composer';
import { EmptyNotes } from './reader-empty-notes';
import { HighlightChoiceMenu } from './reader-highlight-choice-menu';
import { SelectionMenu, type SelectionMenuHandle } from './reader-selection-menu';
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
import { createReaderTimeFormatter } from '../reader-date-utils';

type AnnotationRailStyle = React.CSSProperties & {
  '--reader-empty-left': string;
  '--reader-empty-top': string;
  '--reader-note-width': string;
};
type HighlightGrowStyle = React.CSSProperties & {
  '--highlight-grow-delay'?: string;
};
import type { AnnotationRailLayout } from '../annotations/annotation-rail-layout';

type ReaderSurfaceActions = Pick<ReaderAppViewActions, 'annotation' | 'selection'>;

type ReaderSurfaceRefs = {
  articleRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  notesRef: React.RefObject<HTMLElement | null>;
  selectionMenuRef?: React.Ref<SelectionMenuHandle>;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
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
  | 'findRelated'
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
  selection: ReaderSelectionModel;
  settings: ReaderSettingsModel;
  userProfile: UserProfile;
};

const emptyNewAnnotationIds = new Set<string>();

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

type AnimatedComposerState = {
  composer: PendingComposer | null;
  phase: ComposerPopupPhase;
  sessionKey: number;
  visibleComposer: PendingComposer | null;
};

type AnimatedComposerEvent =
  | { type: 'closeFinished' }
  | { type: 'composerChanged'; composer: PendingComposer | null }
  | { type: 'openFrameShown' };

function animatedComposerReducer(
  state: AnimatedComposerState,
  event: AnimatedComposerEvent,
): AnimatedComposerState {
  switch (event.type) {
    case 'closeFinished':
      return state.phase === 'closing' ? { ...state, visibleComposer: null } : state;
    case 'composerChanged':
      if (event.composer) {
        return {
          composer: event.composer,
          phase: 'opening',
          sessionKey: state.sessionKey + 1,
          visibleComposer: event.composer,
        };
      }
      if (!state.visibleComposer || state.phase === 'closing') return { ...state, composer: null };
      return { ...state, composer: null, phase: 'closing' };
    case 'openFrameShown':
      return state.phase === 'opening' ? { ...state, phase: 'open' } : state;
  }
}

function initialAnimatedComposerState(composer: PendingComposer | null) {
  return animatedComposerReducer(
    { composer: null, phase: 'closing', sessionKey: 0, visibleComposer: null },
    { type: 'composerChanged', composer },
  );
}

function AnimatedComposer({
  agents,
  composer,
  labels,
  messageSendShortcut,
  shortcutModifier,
  onCancel,
  onSave,
}: {
  agents: PublicAgent[];
  composer: PendingComposer | null;
  labels: AnimatedComposerLabels;
  messageSendShortcut: MessageSendShortcut;
  shortcutModifier: string;
  onCancel: () => void;
  onSave: (note: string) => void | Promise<void>;
}) {
  const [state, dispatch] = React.useReducer(
    animatedComposerReducer,
    composer,
    initialAnimatedComposerState,
  );
  if (state.composer !== composer) dispatch({ type: 'composerChanged', composer });

  if (!state.visibleComposer) return null;

  return (
    <Composer
      agents={agents}
      composer={state.visibleComposer}
      key={state.sessionKey}
      labels={labels}
      messageSendShortcut={messageSendShortcut}
      phase={state.phase}
      shortcutModifier={shortcutModifier}
      onCancel={onCancel}
      onClosed={() => dispatch({ type: 'closeFinished' })}
      onOpened={() => dispatch({ type: 'openFrameShown' })}
      onSave={onSave}
    />
  );
}

export function ReaderSurfaceView({
  actions: { annotation: annotationActions, selection: selectionActions },
  agents: { agents, pendingAnnotationAgents = {}, personaAgents },
  annotationRail: {
    annotationRailItems,
    exitingAnnotationIds,
    layoutChangeRef,
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
  refs: { articleRef, canvasRef, notesRef, selectionMenuRef, surfaceRef },
  selection: { composer, highlightChoice, selectionAction },
  settings: { messageSendShortcut, selectionActionShortcuts, shortcutModifier },
  userProfile,
}: ReaderSurfaceViewProps) {
  const timeFormatter = React.useMemo(() => createReaderTimeFormatter(labels), [labels]);
  const latestAnnotationActions = useStableCallback(() => annotationActions);
  const cardActions = React.useMemo(
    () => ({
      onDelete: (id: string) => latestAnnotationActions().onDeleteAnnotation(id),
      onFocus: (id: string) => latestAnnotationActions().onScrollToHighlight(id),
      onOpenDiscussion: (id: string, rect?: ReaderWindowSourceRect) =>
        latestAnnotationActions().onOpenAnnotationDiscussion?.(id, rect),
    }),
    [],
  );
  const highlightSegments = React.useMemo(() => {
    const occurrences = new Map<string, number>();
    return buildHighlightSegments(boxes).map((segment) => {
      const group = JSON.stringify(segment.annotationIds);
      const occurrence = occurrences.get(group) ?? 0;
      occurrences.set(group, occurrence + 1);
      // Global line numbers shift on reflow; keep each annotation's fragments mounted.
      return Object.assign(segment, { renderKey: `${group}:${occurrence}` });
    });
  }, [boxes]);
  const temporarySegments = React.useMemo(
    () => buildHighlightSegments(temporaryBoxes),
    [temporaryBoxes],
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

  const annotationOrdinalById = React.useMemo(
    () => annotationOrdinalsById(annotations),
    [annotations],
  );

  function highlightLabel(annotationId: string) {
    return highlightDiscussionLabel(annotationOrdinalById.get(annotationId));
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
    <div className="reader-surface-frame" ref={layoutChangeRef}>
      <section className="reader-surface" ref={surfaceRef} onMouseUp={selectionActions.onMouseUp}>
        <div className="reader-canvas" ref={canvasRef} tabIndex={-1}>
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
                  key={`highlight-${segment.renderKey}`}
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
                  pendingAgents={pendingAnnotationAgents[annotation.id]}
                  stackCount={stackCount}
                  stackIndex={stackIndex}
                  railSide={railSide}
                  style={style}
                  userProfile={userProfile}
                  timeFormatter={timeFormatter}
                  onDelete={cardActions.onDelete}
                  onFocus={cardActions.onFocus}
                  onOpenDiscussion={
                    annotationActions.onOpenAnnotationDiscussion
                      ? cardActions.onOpenDiscussion
                      : undefined
                  }
                  personaAgents={personaAgents}
                />
              ),
            )}
          </aside>
          {selectionAction && !composer ? (
            <SelectionMenu
              ref={selectionMenuRef}
              action={selectionAction}
              labels={labels}
              shortcuts={selectionActionShortcuts}
              onAnnotate={() => selectionActions.onOpenComposer(selectionAction)}
              onAsk={
                chatAvailable ? () => selectionActions.onAskSelection?.(selectionAction) : undefined
              }
              onFindRelated={
                selectionActions.onFindRelated
                  ? () => selectionActions.onFindRelated?.(selectionAction)
                  : undefined
              }
              onCopy={() => selectionActions.onCopySelection(selectionAction)}
              onCopySettled={selectionActions.onClearSelection}
            />
          ) : null}
          {highlightChoice && highlightChoiceAnnotations.length > 1 ? (
            <HighlightChoiceMenu
              action={highlightChoice}
              agents={personaAgents ?? agents}
              annotations={highlightChoiceAnnotations}
              labels={labels}
              userProfile={userProfile}
              onCancel={selectionActions.onCloseHighlightChoice}
              onSelect={annotationActions.onFocusAnnotation}
            />
          ) : null}
          <AnimatedComposer
            agents={agents}
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
