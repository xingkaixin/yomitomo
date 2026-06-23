import React from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type {
  Annotation,
  MessageSendShortcut,
  PublicAgent,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import { AnnotationCard } from '../annotations/reader-annotation-card';
import type { ReaderWindowSourceRect } from '../annotations/reader-annotation-card';
import { Composer } from './reader-composer';
import { EmptyNotes } from './reader-empty-notes';
import { HighlightChoiceMenu } from './reader-highlight-choice-menu';
import { SelectionMenu } from './reader-selection-menu';
import type {
  ReaderChatModel,
  HighlightChoice,
  PendingComposer,
  ReaderArticle,
  ReaderUiLabels,
  SelectionAction,
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
  buildAnnotationRailItems,
  buildHighlightSegments,
  highlightSegmentStyle,
  type AnnotationRailLayout,
} from '../annotations/reader-annotations';

export type ReaderSurfaceViewProps = {
  activeId: string | null;
  agentTheaterBoxes: HighlightBox[];
  agents: PublicAgent[];
  annotationRailItems: ReturnType<typeof buildAnnotationRailItems>;
  annotationRailLayout: AnnotationRailLayout;
  annotations: Annotation[];
  articleContent?: React.ReactNode;
  articleRef: React.RefObject<HTMLElement | null>;
  boxes: HighlightBox[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  commentsCloseKey: number;
  composer: PendingComposer | null;
  chat?: ReaderChatModel;
  distillationAnimation?: {
    annotationId: string;
    transition: 'publish' | 'update' | 'unpublish';
    phase: 'morph-out' | 'morph-in' | 'update';
    token: number;
  } | null;
  exitingAnnotationIds: Set<string>;
  expandedPrimaryCommentIds: Set<string>;
  extracted: ReaderArticle;
  highlightChoice: HighlightChoice | null;
  labels?: ReaderUiLabels;
  messageSendShortcut: MessageSendShortcut;
  newAnnotationIds?: Set<string>;
  pendingAnnotationAgents?: Record<string, PublicAgent[]>;
  noteRefForAnnotation: (annotationId: string) => (element: HTMLElement | null) => void;
  notesRef: React.RefObject<HTMLElement | null>;
  selectionAction: SelectionAction | null;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  selectionCopyRequestKey?: number;
  shortcutModifier: string;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  temporaryBoxes: HighlightBox[];
  reviewAgents?: PublicAgent[];
  searchBoxes?: HighlightBox[];
  showEmptyNotes?: boolean;
  userProfile: UserProfile;
  visibleAnnotationIds: Set<string>;
  visibleAnnotations: Annotation[];
  onAddComment: (annotationId: string, content: string, replyTo?: string) => void | Promise<void>;
  onCancelComposer: () => void;
  onClearSelection: () => void;
  onCloseHighlightChoice: () => void;
  onCopySelection: (action: SelectionAction) => void | Promise<void>;
  onCreateAnnotation: (note: string) => void | Promise<void>;
  onDeleteAnnotation: (annotationId: string) => void | Promise<void>;
  onDeleteComment: (annotationId: string, commentId: string) => void | Promise<void>;
  onFocusAnnotation: (annotationId: string) => void;
  onOpenAnnotationDiscussion?: (annotationId: string, sourceRect?: ReaderWindowSourceRect) => void;
  onHighlightClick: (
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    annotationIds: string[],
  ) => void;
  onMouseUp: (event: React.MouseEvent<HTMLElement>) => void;
  onAskSelection?: (action: SelectionAction) => void;
  onOpenComposer: (action: SelectionAction) => void;
  onPrimaryCommentExpandedChange: (annotationId: string, expanded: boolean) => void;
  onScrollToHighlight: (annotationId: string) => void;
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

export function ReaderSurfaceView({
  activeId,
  agentTheaterBoxes,
  agents,
  annotationRailItems,
  annotationRailLayout,
  annotations,
  articleContent,
  articleRef,
  boxes,
  canvasRef,
  commentsCloseKey,
  composer,
  chat,
  distillationAnimation,
  exitingAnnotationIds,
  expandedPrimaryCommentIds,
  extracted,
  highlightChoice,
  labels = defaultReaderUiLabels,
  messageSendShortcut,
  newAnnotationIds = emptyNewAnnotationIds,
  pendingAnnotationAgents = {},
  noteRefForAnnotation,
  notesRef,
  selectionAction,
  selectionActionShortcuts,
  selectionCopyRequestKey,
  shortcutModifier,
  surfaceRef,
  temporaryBoxes,
  reviewAgents = [],
  searchBoxes = [],
  showEmptyNotes,
  userProfile,
  visibleAnnotationIds,
  visibleAnnotations,
  onAddComment,
  onCancelComposer,
  onClearSelection,
  onCloseHighlightChoice,
  onCopySelection,
  onCreateAnnotation,
  onDeleteAnnotation,
  onDeleteComment,
  onFocusAnnotation,
  onOpenAnnotationDiscussion,
  onHighlightClick,
  onMouseUp,
  onAskSelection,
  onOpenComposer,
  onPrimaryCommentExpandedChange,
  onScrollToHighlight,
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
      <section className="reader-surface" ref={surfaceRef} onMouseUp={onMouseUp}>
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
                  onClick={(event) => onHighlightClick(annotationId, event, clickableAnnotationIds)}
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
                  messageSendShortcut={messageSendShortcut}
                  key={annotation.id}
                  labels={labels}
                  noteRef={noteRefForAnnotation(annotation.id)}
                  pendingAgents={pendingAnnotationAgents[annotation.id] || []}
                  primaryCommentExpanded={expandedPrimaryCommentIds.has(annotation.id)}
                  shortcutModifier={shortcutModifier}
                  stackCount={stackCount}
                  stackIndex={stackIndex}
                  commentsCloseKey={commentsCloseKey}
                  railSide={railSide}
                  style={style}
                  userProfile={userProfile}
                  onAddComment={onAddComment}
                  onDelete={onDeleteAnnotation}
                  onDeleteComment={onDeleteComment}
                  onFocus={onScrollToHighlight}
                  onOpenDiscussion={onOpenAnnotationDiscussion}
                  onPrimaryCommentExpandedChange={onPrimaryCommentExpandedChange}
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
              onAnnotate={() => onOpenComposer(selectionAction)}
              onAsk={chat ? () => onAskSelection?.(selectionAction) : undefined}
              onCopy={() => onCopySelection(selectionAction)}
              onCopySettled={onClearSelection}
            />
          ) : null}
          {highlightChoice && highlightChoiceAnnotations.length > 1 ? (
            <HighlightChoiceMenu
              action={highlightChoice}
              agents={agents}
              annotations={highlightChoiceAnnotations}
              labels={labels}
              userProfile={userProfile}
              onCancel={onCloseHighlightChoice}
              onSelect={onFocusAnnotation}
            />
          ) : null}
          {composer ? (
            <Composer
              agents={agents}
              composer={composer}
              labels={labels}
              messageSendShortcut={messageSendShortcut}
              shortcutModifier={shortcutModifier}
              onCancel={onCancelComposer}
              onSave={onCreateAnnotation}
            />
          ) : null}
        </div>
      </section>
      <ReaderEdgeBlur position="top" />
      <ReaderEdgeBlur position="bottom" />
    </div>
  );
}
