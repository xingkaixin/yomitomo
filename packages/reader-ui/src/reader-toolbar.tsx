import React from 'react';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Funnel,
  List,
  MessageSquare,
  Settings2,
  X,
} from 'lucide-react';
import type {
  AnnotationNavigationDirection,
  AnnotationNavigationState,
  ReaderArticle,
} from './reader-app-view-types';

export type ReaderToolbarProps = {
  agentAnnotateOpen: boolean;
  annotatingAgentsCount: number;
  annotationFilterOpen: boolean;
  annotationFilterPanelId: string;
  annotationNavigation: AnnotationNavigationState;
  canFilterAnnotations: boolean;
  extracted: ReaderArticle;
  filterActive: boolean;
  filterActiveCount: number;
  hasAgents: boolean;
  hasToc: boolean;
  notesOpen: boolean;
  questionCount: number;
  settingsOpen: boolean;
  showAnnotationNavigation: boolean;
  tocOpen: boolean;
  toolbarArticleAction?: React.ReactNode;
  onClose: () => void;
  onNavigateAnnotation: (direction: AnnotationNavigationDirection) => void;
  onToggleAgentAnnotate: () => void;
  onToggleAnnotationFilter: () => void;
  onToggleNotes: () => void;
  onToggleSettings: () => void;
  onToggleToc: () => void;
};

export function ReaderToolbar({
  agentAnnotateOpen,
  annotatingAgentsCount,
  annotationFilterOpen,
  annotationFilterPanelId,
  annotationNavigation,
  canFilterAnnotations,
  extracted,
  filterActive,
  filterActiveCount,
  hasAgents,
  hasToc,
  notesOpen,
  questionCount,
  settingsOpen,
  showAnnotationNavigation,
  tocOpen,
  toolbarArticleAction,
  onClose,
  onNavigateAnnotation,
  onToggleAgentAnnotate,
  onToggleAnnotationFilter,
  onToggleNotes,
  onToggleSettings,
  onToggleToc,
}: ReaderToolbarProps) {
  return (
    <header className="reader-toolbar">
      <div className="reader-toolbar-article">
        <div className="reader-toolbar-article-copy">
          <div className="reader-toolbar-article-title">{extracted.title}</div>
          {extracted.byline || extracted.excerpt ? (
            <p className="reader-toolbar-article-meta">
              {extracted.byline ? <span>{extracted.byline}</span> : null}
              {extracted.excerpt ? <span>{extracted.excerpt}</span> : null}
            </p>
          ) : null}
        </div>
        {toolbarArticleAction ? (
          <div className="reader-toolbar-article-action">{toolbarArticleAction}</div>
        ) : null}
      </div>
      <div className="reader-toolbar-actions">
        <button
          className={
            hasToc && tocOpen
              ? 'reader-icon-button reader-toc-toggle is-active'
              : 'reader-icon-button reader-toc-toggle'
          }
          type="button"
          disabled={!hasToc}
          onClick={onToggleToc}
          aria-label="切换目录"
          aria-pressed={hasToc && tocOpen}
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
          aria-label="切换未决问题"
          title="未决问题"
        >
          <MessageSquare size={18} />
          <span>{questionCount}</span>
        </button>
        {showAnnotationNavigation ? (
          <div className="reader-annotation-nav" aria-label="批注快捷选择">
            <button
              aria-label="上一个批注"
              className="reader-icon-button"
              disabled={!annotationNavigation.previousId}
              title="上一个批注"
              type="button"
              onClick={() => onNavigateAnnotation('previous')}
            >
              <ChevronUp size={17} />
            </button>
            <button
              aria-label="下一个批注"
              className="reader-icon-button"
              disabled={!annotationNavigation.nextId}
              title="下一个批注"
              type="button"
              onClick={() => onNavigateAnnotation('next')}
            >
              <ChevronDown size={17} />
            </button>
          </div>
        ) : null}
        <button
          className={
            filterActive || annotationFilterOpen
              ? 'reader-filter-toggle is-active'
              : 'reader-filter-toggle'
          }
          data-reader-popover-anchor
          type="button"
          disabled={!canFilterAnnotations}
          onClick={onToggleAnnotationFilter}
          aria-controls={annotationFilterPanelId}
          aria-expanded={annotationFilterOpen}
          aria-label="过滤筛选"
          aria-pressed={filterActive}
          title="过滤筛选"
        >
          <Funnel size={16} />
          <span>过滤筛选</span>
          {filterActive ? <b>{filterActiveCount}</b> : null}
        </button>
        <button
          className={
            agentAnnotateOpen ? 'reader-agent-annotate is-active' : 'reader-agent-annotate'
          }
          data-reader-popover-anchor
          type="button"
          disabled={!hasAgents}
          onClick={onToggleAgentAnnotate}
        >
          <Bot size={18} />
          {annotatingAgentsCount > 0 ? '共读中' : '聚焦共读'}
        </button>
        <button
          className={settingsOpen ? 'reader-icon-button is-active' : 'reader-icon-button'}
          data-reader-popover-anchor
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
  );
}
