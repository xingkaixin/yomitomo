import React from 'react';
import { annotationTypeLabel } from '@yomitomo/core';
import type { HighlightBox } from '@yomitomo/core';
import type {
  Annotation,
  MessageSendShortcut,
  PublicAgent,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import { AnnotationCard } from './reader-annotation-card';
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
import {
  buildAnnotationRailItems,
  buildHighlightSegments,
  highlightSegmentStyle,
} from './reader-utils';

export type ReaderSurfaceViewProps = {
  activeId: string | null;
  agentTheaterBoxes: HighlightBox[];
  agents: PublicAgent[];
  annotationRailItems: ReturnType<typeof buildAnnotationRailItems>;
  annotations: Annotation[];
  articleContent?: React.ReactNode;
  articleRef: React.RefObject<HTMLElement | null>;
  boxes: HighlightBox[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  commentsCloseKey: number;
  composer: PendingComposer | null;
  exitingAnnotationIds: Set<string>;
  expandedPrimaryCommentIds: Set<string>;
  extracted: ReaderArticle;
  filterActive: boolean;
  highlightChoice: HighlightChoice | null;
  messageSendShortcut: MessageSendShortcut;
  noteRefForAnnotation: (annotationId: string) => (element: HTMLElement | null) => void;
  notesRef: React.RefObject<HTMLElement | null>;
  replyRequest: { annotationId: string; key: number } | null;
  selectionAction: SelectionAction | null;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  shortcutModifier: string;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  temporaryBoxes: HighlightBox[];
  userProfile: UserProfile;
  visibleAnnotationIds: Set<string>;
  visibleAnnotations: Annotation[];
  visibleRailAnnotations: Annotation[];
  onAddComment: (annotationId: string, content: string) => void | Promise<void>;
  onCancelComposer: () => void;
  onCloseHighlightChoice: () => void;
  onCopySelection: (action: SelectionAction) => void | Promise<void>;
  onCreateAnnotation: (note: string) => void | Promise<void>;
  onDeleteAnnotation: (annotationId: string) => void | Promise<void>;
  onFocusAnnotation: (annotationId: string) => void;
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
  annotations,
  articleContent,
  articleRef,
  boxes,
  canvasRef,
  commentsCloseKey,
  composer,
  exitingAnnotationIds,
  expandedPrimaryCommentIds,
  extracted,
  filterActive,
  highlightChoice,
  messageSendShortcut,
  noteRefForAnnotation,
  notesRef,
  replyRequest,
  selectionAction,
  selectionActionShortcuts,
  shortcutModifier,
  surfaceRef,
  temporaryBoxes,
  userProfile,
  visibleAnnotationIds,
  visibleAnnotations,
  visibleRailAnnotations,
  onAddComment,
  onCancelComposer,
  onCloseHighlightChoice,
  onCopySelection,
  onCreateAnnotation,
  onDeleteAnnotation,
  onFocusAnnotation,
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
  const highlightChoiceAnnotations = highlightChoice
    ? highlightChoice.annotationIds
        .map((id) => visibleAnnotations.find((annotation) => annotation.id === id))
        .filter((annotation): annotation is Annotation => Boolean(annotation))
    : [];

  function highlightLabel(annotationId: string) {
    const index = annotations.findIndex((annotation) => annotation.id === annotationId);
    const annotation = annotations[index];
    const type = annotation?.annotationType
      ? annotationTypeLabel(annotation.annotationType)
      : '批注';
    return index >= 0 ? `打开${type} ${index + 1}` : '打开批注';
  }

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
              const dimmed =
                filterActive && segment.annotationIds.every((id) => !visibleAnnotationIds.has(id));
              const active = !dimmed && segment.annotationIds.includes(activeId || '');
              const clickableAnnotationIds = segment.annotationIds.filter((id) =>
                visibleAnnotationIds.has(id),
              );
              const annotationId = clickableAnnotationIds[0] || segment.annotationIds[0] || '';
              const segmentStyle = {
                ...highlightSegmentStyle(segment, active),
                ...(dimmed ? { '--highlight-opacity': 0.42 } : {}),
              } as React.CSSProperties;
              return (
                <button
                  aria-label={highlightLabel(annotationId)}
                  aria-disabled={dimmed || undefined}
                  className={[
                    'reader-highlight',
                    active ? 'is-active' : '',
                    dimmed ? 'is-filter-dimmed' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={`highlight-${segment.id}`}
                  style={segmentStyle}
                  tabIndex={dimmed ? -1 : undefined}
                  type="button"
                  onClick={
                    dimmed
                      ? undefined
                      : (event) => onHighlightClick(annotationId, event, clickableAnnotationIds)
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
          </div>
          <aside className="reader-annotation-rail" ref={notesRef} aria-label="文章批注">
            {annotations.length === 0 ? <EmptyNotes /> : null}
            {annotations.length > 0 && visibleRailAnnotations.length === 0 ? (
              <div className="reader-empty">
                <strong>没有匹配的批注</strong>
                <p>当前视图没有匹配的批注。</p>
              </div>
            ) : null}
            {annotationRailItems.map(
              ({ annotation, isStackFront, stackCount, stackIndex, style }) => (
                <AnnotationCard
                  active={annotation.id === activeId}
                  agents={agents}
                  annotation={annotation}
                  exiting={exitingAnnotationIds.has(annotation.id)}
                  isStackFront={isStackFront}
                  messageSendShortcut={messageSendShortcut}
                  key={annotation.id}
                  noteRef={noteRefForAnnotation(annotation.id)}
                  primaryCommentExpanded={expandedPrimaryCommentIds.has(annotation.id)}
                  shortcutModifier={shortcutModifier}
                  stackCount={stackCount}
                  stackIndex={stackIndex}
                  commentsCloseKey={commentsCloseKey}
                  replyRequestKey={
                    replyRequest?.annotationId === annotation.id ? replyRequest.key : undefined
                  }
                  style={style}
                  userProfile={userProfile}
                  onAddComment={onAddComment}
                  onDelete={onDeleteAnnotation}
                  onFocus={onScrollToHighlight}
                  onPrimaryCommentExpandedChange={onPrimaryCommentExpandedChange}
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
