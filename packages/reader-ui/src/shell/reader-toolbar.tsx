import React from 'react';
import { ChevronDown, ChevronLeft, ChevronUp, PencilLine, Search, X } from 'lucide-react';
import type {
  AnnotationNavigationDirection,
  AnnotationNavigationState,
  ReaderSearchToolbarState,
  ReaderArticle,
  ReaderHeaderArticleMeta,
  ReaderUiLabels,
} from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';
import { useSearchClearDissolve } from './reader-search-clear-dissolve';
import { ReaderTooltip } from '../shared/reader-component-primitives';

export type ReaderToolbarProps = {
  extracted: ReaderArticle;
  articleLeadingVisual?: React.ReactNode;
  headerMeta?: ReaderHeaderArticleMeta;
  labels?: ReaderUiLabels;
  readingProgress?: number;
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
  articleLeadingVisual,
  headerMeta,
  labels = defaultReaderUiLabels,
  readingProgress,
  toolbarArticleAction,
  onClose,
}: ReaderToolbarProps) {
  const articleMeta: ReaderHeaderArticleMeta = {
    title: headerMeta?.title ?? extracted.title,
    byline: headerMeta?.byline ?? extracted.byline,
    dateLabel: headerMeta?.dateLabel ?? extracted.excerpt,
    hasCover: headerMeta?.hasCover ?? false,
  };
  const metaItems = [articleMeta.byline, articleMeta.dateLabel].filter((item): item is string =>
    Boolean(item),
  );
  const progress = clampReaderProgress(readingProgress);
  const progressNow = Math.round(progress * 100);

  return (
    <header className="reader-toolbar">
      <button
        className="reader-back"
        type="button"
        onClick={onClose}
        aria-label={labels.backToLibrary}
      >
        <ChevronLeft size={18} />
        <span>{labels.readerLibrary}</span>
      </button>
      <div
        className={[
          'reader-toolbar-article',
          articleMeta.hasCover ? 'has-cover' : '',
          toolbarArticleAction ? 'has-action' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {articleLeadingVisual ? (
          <div className="reader-toolbar-article-visual">{articleLeadingVisual}</div>
        ) : null}
        <div className="reader-toolbar-article-copy">
          <div className="reader-toolbar-article-title">{articleMeta.title}</div>
          {metaItems.length > 0 ? (
            <p className="reader-toolbar-article-meta">
              {metaItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </p>
          ) : null}
        </div>
      </div>
      <div className="reader-toolbar-actions">
        {toolbarArticleAction ? (
          <div className="reader-toolbar-article-action">{toolbarArticleAction}</div>
        ) : null}
      </div>
      <div
        className="reader-toolbar-progress"
        role="progressbar"
        aria-label={labels.readingProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressNow}
      >
        <span style={{ width: `${progressNow}%` }} />
      </div>
    </header>
  );
}

function clampReaderProgress(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
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
            <ReaderTocToggleIcon open={hasToc && tocOpen} />
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

function ReaderTocToggleIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="reader-toc-toggle-icon"
      data-state={open ? 'open' : 'closed'}
      focusable="false"
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <rect
        className="reader-toc-toggle-frame"
        x="3.25"
        y="3.25"
        width="11.5"
        height="11.5"
        rx="2.75"
      />
      <rect
        className="reader-toc-toggle-rail"
        x="5.25"
        y="5.25"
        width="2.4"
        height="7.5"
        rx="1.2"
      />
    </svg>
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
  const clear = useSearchClearDissolve({
    inputRef,
    query: search.query,
    onQueryChange: search.onQueryChange,
  });
  const total = search.matches.length;
  const hasMatches = total > 0;
  const hasQuery = Boolean(search.query.trim());
  const hasSearchText = search.query.length > 0;
  const countLabel =
    search.preparing && hasQuery
      ? labels.searchPreparing
      : hasMatches
        ? `${Math.min(search.activeMatchIndex + 1, total)}/${total}${search.limited ? '+' : ''}`
        : hasQuery
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
        <div
          ref={clear.wrapRef}
          className={[
            'reader-search-input-shell t-clear',
            hasSearchText ? 'has-value' : '',
            clear.clearing ? 'is-clearing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <input
            ref={inputRef}
            aria-label={labels.searchBody}
            value={search.query}
            onChange={(event) => search.onQueryChange(event.currentTarget.value)}
            placeholder={labels.searchBodyPlaceholder}
            type="search"
          />
          <div ref={clear.mirrorRef} className="t-clear-mirror" aria-hidden="true">
            {clear.mirrorText}
          </div>
          <div ref={clear.placeholderRef} className="t-clear-placeholder" aria-hidden="true">
            {labels.searchBodyPlaceholder}
          </div>
          <div ref={clear.glowRef} className="t-clear-glow" aria-hidden="true" />
          <ReaderTooltip content={labels.clearSearch} disabled={!hasSearchText} side="bottom">
            <button
              aria-label={labels.clearSearch}
              className="reader-search-clear-button t-clear-btn"
              disabled={!hasSearchText || clear.clearing}
              type="button"
              onClick={clear.clearWithDissolve}
              onMouseDown={clear.preserveFocus}
              onPointerDown={clear.preserveFocus}
            >
              <X size={13} />
            </button>
          </ReaderTooltip>
        </div>
      </div>
      <span
        className="reader-floating-value is-search-count"
        aria-busy={search.preparing && hasQuery ? true : undefined}
        aria-live="polite"
      >
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
