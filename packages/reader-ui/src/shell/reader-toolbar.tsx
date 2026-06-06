import React from 'react';
import { ChevronDown, ChevronUp, List, PencilLine, Search, X } from 'lucide-react';
import type {
  AnnotationNavigationDirection,
  AnnotationNavigationState,
  ReaderSearchToolbarState,
  ReaderArticle,
  ReaderUiLabels,
} from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';
import { ReaderTooltip } from '../shared/reader-component-primitives';

export type ReaderToolbarProps = {
  extracted: ReaderArticle;
  labels?: ReaderUiLabels;
  toolbarArticleAction?: React.ReactNode;
  onClose: () => void;
};

export type ReaderFloatingToolbarProps = {
  annotationNavigation: AnnotationNavigationState;
  controls?: React.ReactNode;
  hasToc: boolean;
  search?: ReaderSearchToolbarState;
  labels?: ReaderUiLabels;
  showAnnotationNavigation: boolean;
  tocOpen: boolean;
  onNavigateAnnotation: (direction: AnnotationNavigationDirection) => void;
  onToggleToc: () => void;
};

export function ReaderToolbar({
  extracted,
  labels = defaultReaderUiLabels,
  toolbarArticleAction,
  onClose,
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
          className="reader-close"
          type="button"
          onClick={onClose}
          aria-label={labels.closeReader}
        >
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
  labels = defaultReaderUiLabels,
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
    return <ReaderFloatingSearchToolbar labels={labels} search={search} />;
  }

  return (
    <div className="reader-floating-toolbar" aria-label={labels.readerControls}>
      <div className="reader-floating-toolbar-group">
        <ReaderTooltip content={labels.toc} disabled={!hasToc} side="bottom">
          <button
            className={
              hasToc && tocOpen
                ? 'reader-icon-button reader-toc-toggle is-active'
                : 'reader-icon-button reader-toc-toggle'
            }
            type="button"
            disabled={!hasToc}
            onClick={onToggleToc}
            aria-label={labels.toggleToc}
            aria-pressed={hasToc && tocOpen}
          >
            <List size={18} />
          </button>
        </ReaderTooltip>
      </div>
      {showAnnotationNavigation ? (
        <div className="reader-annotation-nav" aria-label={labels.annotationNavigation}>
          <PencilLine className="reader-annotation-nav-icon" size={16} aria-hidden="true" />
          <ReaderTooltip
            content={labels.previousHighlight}
            disabled={!annotationNavigation.previousId}
            side="bottom"
          >
            <button
              aria-label={labels.previousHighlight}
              className="reader-icon-button"
              disabled={!annotationNavigation.previousId}
              type="button"
              onClick={() => onNavigateAnnotation('previous')}
            >
              <ChevronUp size={17} />
            </button>
          </ReaderTooltip>
          <span className="reader-floating-value is-annotation-progress">{annotationProgress}</span>
          <ReaderTooltip
            content={labels.nextHighlight}
            disabled={!annotationNavigation.nextId}
            side="bottom"
          >
            <button
              aria-label={labels.nextHighlight}
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
          <ReaderTooltip content={labels.searchBody} side="bottom">
            <button
              className="reader-icon-button"
              type="button"
              onClick={search.onOpen}
              aria-label={labels.searchBody}
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

function ReaderFloatingSearchToolbar({
  labels = defaultReaderUiLabels,
  search,
}: {
  labels?: ReaderUiLabels;
  search: ReaderSearchToolbarState;
}) {
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
      aria-label={labels.searchToolbar}
      onKeyDown={handleKeyDown}
    >
      <div className="reader-search-box">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          aria-label={labels.searchBody}
          value={search.query}
          onChange={(event) => search.onQueryChange(event.currentTarget.value)}
          placeholder={labels.searchBodyPlaceholder}
          type="search"
        />
      </div>
      <span className="reader-floating-value is-search-count" aria-live="polite">
        {countLabel}
      </span>
      <ReaderTooltip content={labels.previousSearchResult} disabled={!hasMatches} side="bottom">
        <button
          aria-label={labels.previousSearchResult}
          className="reader-icon-button"
          disabled={!hasMatches}
          type="button"
          onClick={search.onPreviousMatch}
        >
          <ChevronUp size={17} />
        </button>
      </ReaderTooltip>
      <ReaderTooltip content={labels.nextSearchResult} disabled={!hasMatches} side="bottom">
        <button
          aria-label={labels.nextSearchResult}
          className="reader-icon-button"
          disabled={!hasMatches}
          type="button"
          onClick={search.onNextMatch}
        >
          <ChevronDown size={17} />
        </button>
      </ReaderTooltip>
      <ReaderTooltip content={labels.closeSearch} side="bottom">
        <button
          aria-label={labels.closeSearch}
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
