import React from 'react';
import { ChevronDown, ChevronUp, List, PencilLine, Search, X } from 'lucide-react';
import type {
  AnnotationNavigationDirection,
  AnnotationNavigationState,
  ReaderSearchToolbarState,
  ReaderArticle,
} from './reader-app-view-types';
import { ReaderTooltip } from '../shared/reader-component-primitives';

export type ReaderToolbarProps = {
  extracted: ReaderArticle;
  toolbarArticleAction?: React.ReactNode;
  onClose: () => void;
};

export type ReaderFloatingToolbarProps = {
  annotationNavigation: AnnotationNavigationState;
  controls?: React.ReactNode;
  hasToc: boolean;
  search?: ReaderSearchToolbarState;
  showAnnotationNavigation: boolean;
  tocOpen: boolean;
  onNavigateAnnotation: (direction: AnnotationNavigationDirection) => void;
  onToggleToc: () => void;
};

export function ReaderToolbar({ extracted, toolbarArticleAction, onClose }: ReaderToolbarProps) {
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
        <button className="reader-close" type="button" onClick={onClose} aria-label="关闭阅读器">
          <X size={18} />
        </button>
      </div>
    </header>
  );
}

export function ReaderFloatingToolbar({
  annotationNavigation,
  controls,
  hasToc,
  search,
  showAnnotationNavigation,
  tocOpen,
  onNavigateAnnotation,
  onToggleToc,
}: ReaderFloatingToolbarProps) {
  const annotationProgress =
    annotationNavigation.totalCount && annotationNavigation.totalCount > 0
      ? `${annotationNavigation.currentIndex || 1}/${annotationNavigation.totalCount}`
      : '0/0';

  if (search?.open) {
    return <ReaderFloatingSearchToolbar search={search} />;
  }

  return (
    <div className="reader-floating-toolbar" aria-label="阅读控制">
      <div className="reader-floating-toolbar-group">
        <ReaderTooltip content="目录" disabled={!hasToc} side="bottom">
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
        </ReaderTooltip>
      </div>
      {showAnnotationNavigation ? (
        <div className="reader-annotation-nav" aria-label="划线快捷选择">
          <PencilLine className="reader-annotation-nav-icon" size={16} aria-hidden="true" />
          <ReaderTooltip
            content="上一个划线"
            disabled={!annotationNavigation.previousId}
            side="bottom"
          >
            <button
              aria-label="上一个划线"
              className="reader-icon-button"
              disabled={!annotationNavigation.previousId}
              type="button"
              onClick={() => onNavigateAnnotation('previous')}
            >
              <ChevronUp size={17} />
            </button>
          </ReaderTooltip>
          <span className="reader-floating-value is-annotation-progress">{annotationProgress}</span>
          <ReaderTooltip content="下一个划线" disabled={!annotationNavigation.nextId} side="bottom">
            <button
              aria-label="下一个划线"
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
      {search ? (
        <div className="reader-floating-toolbar-group">
          <ReaderTooltip content="搜索" side="bottom">
            <button
              className="reader-icon-button"
              type="button"
              onClick={search.onOpen}
              aria-label="搜索正文"
            >
              <Search size={17} />
            </button>
          </ReaderTooltip>
        </div>
      ) : null}
      {controls ? <div className="reader-floating-toolbar-controls">{controls}</div> : null}
    </div>
  );
}

function ReaderFloatingSearchToolbar({ search }: { search: ReaderSearchToolbarState }) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const total = search.matches.length;
  const hasMatches = total > 0;
  const countLabel = hasMatches
    ? `${Math.min(search.activeMatchIndex + 1, total)}/${total}${search.limited ? '+' : ''}`
    : search.query.trim()
      ? '0/0'
      : '';

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      search.onClose();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) search.onPreviousMatch();
      else search.onNextMatch();
    }
  }

  return (
    <div
      className="reader-floating-toolbar is-searching"
      aria-label="正文搜索"
      onKeyDown={handleKeyDown}
    >
      <div className="reader-search-box">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          aria-label="搜索正文"
          value={search.query}
          onChange={(event) => search.onQueryChange(event.currentTarget.value)}
          placeholder="搜索正文"
          type="search"
        />
      </div>
      <span className="reader-floating-value is-search-count" aria-live="polite">
        {countLabel}
      </span>
      <ReaderTooltip content="上一个结果" disabled={!hasMatches} side="bottom">
        <button
          aria-label="上一个搜索结果"
          className="reader-icon-button"
          disabled={!hasMatches}
          type="button"
          onClick={search.onPreviousMatch}
        >
          <ChevronUp size={17} />
        </button>
      </ReaderTooltip>
      <ReaderTooltip content="下一个结果" disabled={!hasMatches} side="bottom">
        <button
          aria-label="下一个搜索结果"
          className="reader-icon-button"
          disabled={!hasMatches}
          type="button"
          onClick={search.onNextMatch}
        >
          <ChevronDown size={17} />
        </button>
      </ReaderTooltip>
      <ReaderTooltip content="关闭搜索" side="bottom">
        <button
          aria-label="关闭搜索"
          className="reader-icon-button"
          type="button"
          onClick={search.onClose}
        >
          <X size={17} />
        </button>
      </ReaderTooltip>
    </div>
  );
}
