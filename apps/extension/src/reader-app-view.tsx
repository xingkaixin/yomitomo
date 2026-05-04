import React from 'react';
import { Bot, List, MessageSquare, Settings2, X } from 'lucide-react';
import type { Annotation, AnnotationType, PublicAgent, UserProfile } from '@yomitomo/shared';
import { annotationTypeLabel } from '@yomitomo/core';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import type { ExtractedArticle } from './article-extraction';
import type { HighlightBox, TocItem } from './reader-dom';
import { buildTocAnnotationStats, highlightStyle, isPrimaryTocItem } from './reader-utils';
import {
  AgentAnnotateMenu,
  AnnotationCard,
  AnnotationConnection,
  Composer,
  EmptyNotes,
  HighlightChoiceMenu,
  ReaderSettingsPanel,
  SelectionMenu,
  VirtualCursor,
  type ActiveConnection,
  type HighlightChoiceAction,
  type ReaderSettings,
  type VirtualCursorState,
} from './reader-components';

export type SelectionAction = {
  x: number;
  y: number;
  anchor: Annotation['anchor'];
};

export type PendingComposer = SelectionAction;
export type NoteFilter = 'all' | 'ai' | 'user';

export type HighlightChoice = HighlightChoiceAction & {
  annotationIds: string[];
};

type ReaderAppViewProps = {
  activeConnection: ActiveConnection | null;
  activeId: string | null;
  agentAnnotateOpen: boolean;
  agentTheaterBoxes: HighlightBox[];
  agents: PublicAgent[];
  annotatingAgents: string[];
  annotationTotals: { annotations: number; comments: number };
  annotations: Annotation[];
  articleRef: React.RefObject<HTMLElement | null>;
  boxes: HighlightBox[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  composer: PendingComposer | null;
  desktopConnected: boolean;
  extracted: ExtractedArticle;
  filteredAnnotations: Annotation[];
  hasSavedPairing: boolean;
  highlightChoice: HighlightChoice | null;
  notesOpen: boolean;
  noteFilter: NoteFilter;
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  notesRef: React.RefObject<HTMLElement | null>;
  pairingStatus: string;
  pairingId: string;
  pairingTokenDraft: string;
  readerSettings: ReaderSettings;
  selectionAction: SelectionAction | null;
  settingsOpen: boolean;
  shortcutModifier: string;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  temporaryBoxes: HighlightBox[];
  tocOpen: boolean;
  tocAnnotationStats: ReturnType<typeof buildTocAnnotationStats>;
  tocItems: TocItem[];
  userProfile: UserProfile;
  virtualCursors: VirtualCursorState[];
  onAddComment: (annotationId: string, content: string) => void | Promise<void>;
  onCancelAgentAnnotateMenu: () => void;
  onCancelComposer: () => void;
  onClose: () => void;
  onCreateAnnotation: (note: string, annotationType: AnnotationType) => void | Promise<void>;
  onDeleteAnnotation: (annotationId: string) => void | Promise<void>;
  onFocusAnnotation: (annotationId: string) => void;
  onHighlightClick: (annotationId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseUp: (event: React.MouseEvent<HTMLElement>) => void;
  onCloseHighlightChoice: () => void;
  onCloseResponsivePanels: () => void;
  onOpenComposer: (action: SelectionAction) => void;
  onRequestAgentAnnotations: (agent: PublicAgent) => void;
  onRequestSelectedAgentAnnotations: () => void;
  onSavePairingToken: () => void | Promise<void>;
  onScrollToHeading: (item: TocItem) => void;
  onScrollToHighlight: (annotationId: string) => void;
  onSetNoteFilter: (filter: NoteFilter) => void;
  onSetPairingTokenDraft: (token: string) => void;
  onToggleNotes: () => void;
  onToggleToc: () => void;
  onToggleAgentAnnotate: () => void;
  onToggleSettings: () => void;
  onDisconnectDesktop: () => void | Promise<void>;
  onUpdateReaderSettings: (settings: ReaderSettings) => void | Promise<void>;
};

export function ReaderAppView({
  activeConnection,
  activeId,
  agentAnnotateOpen,
  agentTheaterBoxes,
  agents,
  annotatingAgents,
  annotationTotals,
  annotations,
  articleRef,
  boxes,
  canvasRef,
  composer,
  desktopConnected,
  extracted,
  filteredAnnotations,
  hasSavedPairing,
  highlightChoice,
  notesOpen,
  noteFilter,
  noteRefs,
  notesRef,
  pairingStatus,
  pairingId,
  pairingTokenDraft,
  readerSettings,
  selectionAction,
  settingsOpen,
  shortcutModifier,
  surfaceRef,
  temporaryBoxes,
  tocOpen,
  tocAnnotationStats,
  tocItems,
  userProfile,
  virtualCursors,
  onAddComment,
  onCancelAgentAnnotateMenu,
  onCancelComposer,
  onClose,
  onCreateAnnotation,
  onDeleteAnnotation,
  onFocusAnnotation,
  onHighlightClick,
  onMouseUp,
  onCloseHighlightChoice,
  onCloseResponsivePanels,
  onOpenComposer,
  onRequestAgentAnnotations,
  onRequestSelectedAgentAnnotations,
  onSavePairingToken,
  onScrollToHeading,
  onScrollToHighlight,
  onSetNoteFilter,
  onSetPairingTokenDraft,
  onToggleNotes,
  onToggleToc,
  onToggleAgentAnnotate,
  onToggleSettings,
  onDisconnectDesktop,
  onUpdateReaderSettings,
}: ReaderAppViewProps) {
  const activeAnnotation = annotations.find((item) => item.id === activeId) || null;
  const highlightChoiceAnnotations = highlightChoice
    ? highlightChoice.annotationIds
        .map((id) => annotations.find((annotation) => annotation.id === id))
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
    <div
      className={['reader-app', tocOpen ? 'is-toc-open' : '', notesOpen ? 'is-notes-open' : '']
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--reader-font-size': `${readerSettings.fontSize}px`,
          '--reader-content-width': `${readerSettings.contentWidth}px`,
        } as React.CSSProperties
      }
    >
      <header className="reader-toolbar">
        <div>
          <div className="reader-eyebrow">Yomitomo</div>
          <h1>
            <span
              className={
                desktopConnected
                  ? 'reader-connection is-connected'
                  : 'reader-connection is-disconnected'
              }
            />
            {extracted.title}
          </h1>
          <p>{extracted.byline || extracted.canonicalUrl}</p>
        </div>
        <div className="reader-toolbar-actions">
          <button
            className={
              tocOpen
                ? 'reader-icon-button reader-toc-toggle is-active'
                : 'reader-icon-button reader-toc-toggle'
            }
            type="button"
            onClick={onToggleToc}
            aria-label="切换目录"
          >
            <List size={18} />
          </button>
          <button
            className={
              notesOpen
                ? 'reader-icon-button reader-notes-toggle is-active'
                : 'reader-icon-button reader-notes-toggle'
            }
            type="button"
            onClick={onToggleNotes}
            aria-label="切换批注"
          >
            <MessageSquare size={18} />
            <span>{annotations.length}</span>
          </button>
          <button
            className={
              agentAnnotateOpen ? 'reader-agent-annotate is-active' : 'reader-agent-annotate'
            }
            type="button"
            disabled={!desktopConnected || agents.length === 0}
            onClick={onToggleAgentAnnotate}
          >
            <Bot size={14} />
            {annotatingAgents.length > 0 ? '精读中' : '助手精读'}
          </button>
          <button
            className={settingsOpen ? 'reader-icon-button is-active' : 'reader-icon-button'}
            type="button"
            onClick={onToggleSettings}
            aria-label="阅读设置"
          >
            <Settings2 size={18} />
          </button>
          <button className="reader-close" type="button" onClick={onClose} aria-label="关闭阅读器">
            <X size={18} />
          </button>
        </div>
      </header>

      {agentAnnotateOpen ? (
        <div className="reader-agent-annotate-popover">
          <AgentAnnotateMenu
            agents={agents}
            annotatingAgents={annotatingAgents}
            onCancel={onCancelAgentAnnotateMenu}
            onStartAgent={onRequestAgentAnnotations}
            onStartAll={onRequestSelectedAgentAnnotations}
          />
        </div>
      ) : null}

      {settingsOpen ? (
        <ReaderSettingsPanel
          desktopConnected={desktopConnected}
          pairingId={pairingId}
          pairingStatus={pairingStatus}
          pairingTokenDraft={pairingTokenDraft}
          hasSavedPairing={hasSavedPairing}
          settings={readerSettings}
          onChange={onUpdateReaderSettings}
          onDisconnectDesktop={onDisconnectDesktop}
          onSavePairingToken={onSavePairingToken}
          onSetPairingTokenDraft={onSetPairingTokenDraft}
        />
      ) : null}

      <button
        className="reader-responsive-scrim"
        type="button"
        aria-label="关闭侧栏"
        onClick={onCloseResponsivePanels}
      />

      <main className="reader-main">
        <aside className={tocItems.length > 0 ? 'reader-toc' : 'reader-toc is-empty'}>
          <div className="reader-toc-title">目录</div>
          {tocItems.map((item) => {
            const stats = isPrimaryTocItem(item) ? tocAnnotationStats.get(item.index) : undefined;
            return (
              <button
                className="reader-toc-item"
                data-depth={Math.min(item.depth, 4)}
                key={`${item.index}-${item.text}`}
                type="button"
                onClick={() => onScrollToHeading(item)}
              >
                <span className="reader-toc-item-main">
                  <span>{item.text}</span>
                  <span className="reader-toc-meta">
                    {(stats?.colors.length || 0) > 0 ? (
                      <span className="reader-toc-markers">
                        {stats!.colors.slice(0, 5).map((color) => (
                          <i key={color} style={{ backgroundColor: color }} />
                        ))}
                      </span>
                    ) : null}
                    {(stats?.count || 0) > 0 ? <strong>{stats?.count}</strong> : null}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="reader-toc-summary">
            共 {annotationTotals.annotations} 条批注 · {annotationTotals.comments} 条评论
          </div>
        </aside>

        <section className="reader-surface" ref={surfaceRef} onMouseUp={onMouseUp}>
          <div className="reader-canvas" ref={canvasRef}>
            <article className="reader-article" ref={articleRef}>
              <header className="reader-article-header">
                <h1>{extracted.title}</h1>
                {extracted.byline || extracted.excerpt ? (
                  <p>{[extracted.byline, extracted.excerpt].filter(Boolean).join(' · ')}</p>
                ) : null}
              </header>
              <div
                className="reader-article-body"
                dangerouslySetInnerHTML={{ __html: extracted.content }}
              />
            </article>
            <div className="reader-highlight-layer">
              {boxes.map((box) => (
                <button
                  aria-label={highlightLabel(box.annotationId)}
                  className={
                    box.annotationId === activeId
                      ? 'reader-highlight is-active'
                      : 'reader-highlight'
                  }
                  key={box.id}
                  style={highlightStyle(box, box.annotationId === activeId)}
                  type="button"
                  onClick={(event) => onHighlightClick(box.annotationId, event)}
                />
              ))}
              {temporaryBoxes.map((box) => (
                <div
                  className="reader-highlight is-temporary"
                  key={box.id}
                  style={highlightStyle(box, false)}
                />
              ))}
              {agentTheaterBoxes.map((box) => (
                <div
                  className="reader-highlight is-agent-theater"
                  key={box.id}
                  style={highlightStyle(box, false)}
                />
              ))}
            </div>
            {selectionAction && !composer ? (
              <SelectionMenu
                action={selectionAction}
                onAnnotate={() => onOpenComposer(selectionAction)}
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
                composer={composer}
                shortcutModifier={shortcutModifier}
                onCancel={onCancelComposer}
                onSave={onCreateAnnotation}
              />
            ) : null}
          </div>
        </section>

        <aside className="reader-notes" ref={notesRef}>
          <div className="reader-notes-header">
            <Tabs
              className="reader-note-tabs"
              value={noteFilter}
              onValueChange={(value) => onSetNoteFilter(value as NoteFilter)}
            >
              <TabsList>
                <TabsTrigger value="all">全部批注</TabsTrigger>
                <TabsTrigger value="user">我的批注</TabsTrigger>
                <TabsTrigger value="ai">助手批注</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {annotations.length === 0 ? <EmptyNotes /> : null}
          {annotations.length > 0 && filteredAnnotations.length === 0 ? (
            <div className="reader-empty">
              <strong>没有匹配的批注</strong>
              <p>切换筛选项可以查看其他批注。</p>
            </div>
          ) : null}
          {filteredAnnotations.map((annotation) => (
            <AnnotationCard
              active={annotation.id === activeAnnotation?.id}
              agents={agents}
              annotation={annotation}
              desktopConnected={desktopConnected}
              key={annotation.id}
              noteRef={(element) => {
                if (element) noteRefs.current.set(annotation.id, element);
                else noteRefs.current.delete(annotation.id);
              }}
              shortcutModifier={shortcutModifier}
              userProfile={userProfile}
              onAddComment={onAddComment}
              onDelete={onDeleteAnnotation}
              onFocus={onScrollToHighlight}
            />
          ))}
        </aside>
      </main>

      {activeConnection ? <AnnotationConnection connection={activeConnection} /> : null}

      {virtualCursors.map((cursor) =>
        cursor.visible ? <VirtualCursor cursor={cursor} key={cursor.id} /> : null,
      )}
    </div>
  );
}
