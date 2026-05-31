import React from 'react';
import { ChevronDown, ChevronUp, List, Settings2, X } from 'lucide-react';
import type {
  AnnotationNavigationDirection,
  AnnotationNavigationState,
  ReaderArticle,
} from './reader-app-view-types';
import { ReaderTooltip } from '../shared/reader-component-primitives';

export type ReaderToolbarProps = {
  annotationNavigation: AnnotationNavigationState;
  extracted: ReaderArticle;
  hasToc: boolean;
  settingsOpen: boolean;
  showAnnotationNavigation: boolean;
  showSettings: boolean;
  tocOpen: boolean;
  toolbarArticleAction?: React.ReactNode;
  onClose: () => void;
  onNavigateAnnotation: (direction: AnnotationNavigationDirection) => void;
  onToggleSettings: () => void;
  onToggleToc: () => void;
};

export function ReaderToolbar({
  annotationNavigation,
  extracted,
  hasToc,
  settingsOpen,
  showAnnotationNavigation,
  showSettings,
  tocOpen,
  toolbarArticleAction,
  onClose,
  onNavigateAnnotation,
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
        {showAnnotationNavigation ? (
          <div className="reader-annotation-nav" aria-label="批注快捷选择">
            <ReaderTooltip content="上一个批注" disabled={!annotationNavigation.previousId}>
              <button
                aria-label="上一个批注"
                className="reader-icon-button"
                disabled={!annotationNavigation.previousId}
                type="button"
                onClick={() => onNavigateAnnotation('previous')}
              >
                <ChevronUp size={17} />
              </button>
            </ReaderTooltip>
            <ReaderTooltip content="下一个批注" disabled={!annotationNavigation.nextId}>
              <button
                aria-label="下一个批注"
                className="reader-icon-button"
                disabled={!annotationNavigation.nextId}
                type="button"
                onClick={() => onNavigateAnnotation('next')}
              >
                <ChevronDown size={17} />
              </button>
            </ReaderTooltip>
          </div>
        ) : null}
        {showSettings ? (
          <button
            className={settingsOpen ? 'reader-icon-button is-active' : 'reader-icon-button'}
            data-reader-popover-anchor
            type="button"
            onClick={onToggleSettings}
            aria-label="阅读设置"
          >
            <Settings2 size={18} />
          </button>
        ) : null}
        <button className="reader-close" type="button" onClick={onClose} aria-label="关闭阅读器">
          <X size={18} />
        </button>
      </div>
    </header>
  );
}
