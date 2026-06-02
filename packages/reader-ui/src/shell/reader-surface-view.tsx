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
  HighlightChoice,
  PendingComposer,
  ReaderArticle,
  SelectionAction,
} from './reader-app-view-types';

type AnnotationRailStyle = React.CSSProperties & {
  '--reader-empty-left': string;
  '--reader-note-width': string;
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
  distillationAnimation?: {
    annotationId: string;
    transition: 'publish' | 'update' | 'unpublish';
    token: number;
  } | null;
  exitingAnnotationIds: Set<string>;
  expandedPrimaryCommentIds: Set<string>;
  extracted: ReaderArticle;
  highlightChoice: HighlightChoice | null;
  messageSendShortcut: MessageSendShortcut;
  pendingAnnotationAgents?: Record<string, PublicAgent[]>;
  noteRefForAnnotation: (annotationId: string) => (element: HTMLElement | null) => void;
  notesRef: React.RefObject<HTMLElement | null>;
  selectionAction: SelectionAction | null;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  shortcutModifier: string;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  temporaryBoxes: HighlightBox[];
  reviewAgents?: PublicAgent[];
  userProfile: UserProfile;
  visibleAnnotationIds: Set<string>;
  visibleAnnotations: Annotation[];
  onAddComment: (annotationId: string, content: string, replyTo?: string) => void | Promise<void>;
  onCancelComposer: () => void;
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
  onOpenComposer: (action: SelectionAction) => void;
  onPrimaryCommentExpandedChange: (annotationId: string, expanded: boolean) => void;
  onScrollToHighlight: (annotationId: string) => void;
};

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
  distillationAnimation,
  exitingAnnotationIds,
  expandedPrimaryCommentIds,
  extracted,
  highlightChoice,
  messageSendShortcut,
  pendingAnnotationAgents = {},
  noteRefForAnnotation,
  notesRef,
  selectionAction,
  selectionActionShortcuts,
  shortcutModifier,
  surfaceRef,
  temporaryBoxes,
  reviewAgents = [],
  userProfile,
  visibleAnnotationIds,
  visibleAnnotations,
  onAddComment,
  onCancelComposer,
  onCloseHighlightChoice,
  onCopySelection,
  onCreateAnnotation,
  onDeleteAnnotation,
  onDeleteComment,
  onFocusAnnotation,
  onOpenAnnotationDiscussion,
  onHighlightClick,
  onMouseUp,
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
              const segmentStyle = highlightSegmentStyle(segment, active) as React.CSSProperties;
              return (
                <button
                  aria-label={highlightLabel(annotationId)}
                  className={['reader-highlight', active ? 'is-active' : '']
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
          </div>
          <aside
            className="reader-annotation-rail"
            ref={notesRef}
            aria-label="引文讨论"
            style={annotationRailStyle}
          >
            {annotations.length === 0 ? <EmptyNotes /> : null}
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
              shortcuts={selectionActionShortcuts}
              onAnnotate={() => onOpenComposer(selectionAction)}
              onCopy={() => onCopySelection(selectionAction)}
            />
          ) : null}
          {highlightChoice && highlightChoiceAnnotations.length > 1 ? (
            <HighlightChoiceMenu
              action={highlightChoice}
              agents={agents}
              annotations={highlightChoiceAnnotations}
              userProfile={userProfile}
              onCancel={onCloseHighlightChoice}
              onSelect={onFocusAnnotation}
            />
          ) : null}
          {composer ? (
            <Composer
              agents={agents}
              composer={composer}
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
