import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  FeatherIcon,
  LibraryIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { useMemo, useReducer, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReadingEvidenceCard } from '@yomitomo/reader-ui/reading-evidence-card';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { getDesktopApi } from '../shell/app-desktop-api';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';
import { useDesktopEvent } from '../shell/use-desktop-event';

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 180;

const distillationLibraryQueryKey = ['distillations', 'library'] as const;

function distillationLibraryQuery(page: number, query: string) {
  return queryOptions({
    queryKey: [...distillationLibraryQueryKey, { page, query }],
    queryFn: () => getDesktopApi().library.distillations.list({ page, pageSize: PAGE_SIZE, query }),
    placeholderData: keepPreviousData,
  });
}

export function DistillationLibrary({
  onOpenEvidenceSource,
}: {
  onOpenEvidenceSource: (target: ReadingEvidenceSourceTarget) => void;
}) {
  const { i18n, t } = useTranslation();
  const queryClient = useQueryClient();
  const [{ page, query, searchQuery }, dispatch] = useReducer(distillationLibraryReducer, {
    page: 1,
    query: '',
    searchQuery: '',
  });
  const searchTimerRef = useRef<number | undefined>(undefined);
  const scrollRef = useRef<HTMLElement>(null);
  const listQuery = useQuery(distillationLibraryQuery(page, searchQuery));
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [i18n.language, i18n.resolvedLanguage],
  );

  useMountEffect(() => () => window.clearTimeout(searchTimerRef.current));

  useDesktopEvent(getDesktopApi().annotations.onDistillationCommitted, () => {
    void queryClient.invalidateQueries({ queryKey: distillationLibraryQueryKey });
  });

  const result = listQuery.data ?? null;
  const status = listQuery.isFetching ? 'loading' : listQuery.isError ? 'error' : 'ready';
  const totalPages = result ? Math.max(1, Math.ceil(result.totalCount / result.pageSize)) : 1;
  const isResolving = status === 'loading' && Boolean(result);

  function editQuery(nextQuery: string) {
    dispatch({ type: 'queryEdited', query: nextQuery });
    window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(
      () => dispatch({ type: 'searchSettled', searchQuery: nextQuery.trim() }),
      SEARCH_DEBOUNCE_MS,
    );
  }

  function retry() {
    void listQuery.refetch();
  }

  function changePage(nextPage: number) {
    dispatch({ type: 'pageChanged', page: nextPage });
    scrollRef.current?.scrollTo({ top: 0 });
  }

  return (
    <section
      ref={scrollRef}
      className="distillation-library"
      aria-busy={status === 'loading'}
      aria-labelledby="distillation-library-title"
    >
      <div className="distillation-library-inner">
        <header className="distillation-library-header">
          <div className="distillation-library-heading">
            <h1 id="distillation-library-title">{t('distillationLibrary.title')}</h1>
            <p>{t('distillationLibrary.description')}</p>
          </div>
          {result?.unfilteredCount ? (
            <p className="distillation-library-total">
              <span className="distillation-library-total-number">{result.unfilteredCount}</span>
              <span className="distillation-library-total-label">
                {t('distillationLibrary.totalLabel')}
              </span>
            </p>
          ) : null}
        </header>

        <div className="distillation-library-search">
          <HugeiconsIcon icon={Search01Icon} aria-hidden="true" size={18} />
          <label className="sr-only" htmlFor="distillation-library-query">
            {t('distillationLibrary.searchLabel')}
          </label>
          <input
            id="distillation-library-query"
            name="distillation-library-query"
            type="search"
            value={query}
            placeholder={t('distillationLibrary.searchPlaceholder')}
            autoComplete="off"
            onChange={(event) => editQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              aria-label={t('distillationLibrary.clearSearch')}
              onClick={() => editQuery('')}
            >
              <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" size={16} />
            </button>
          ) : null}
          <span className="distillation-library-search-underline" aria-hidden="true" />
        </div>

        <div className="sr-only" aria-live="polite">
          {status === 'loading'
            ? t('distillationLibrary.loading')
            : t('distillationLibrary.resultCount', { count: result?.totalCount || 0 })}
        </div>

        {status === 'error' && !result ? (
          <DistillationLibraryMessage
            icon={
              <HugeiconsIcon icon={LibraryIcon} aria-hidden="true" size={26} strokeWidth={1.6} />
            }
            title={t('distillationLibrary.loadFailed')}
            description={t('distillationLibrary.loadFailedDescription')}
            actionLabel={t('distillationLibrary.retry')}
            onAction={retry}
          />
        ) : null}

        {status === 'loading' && !result ? <DistillationLibrarySkeleton /> : null}

        {result && result.totalCount === 0 ? (
          <DistillationLibraryMessage
            icon={
              <HugeiconsIcon icon={FeatherIcon} aria-hidden="true" size={26} strokeWidth={1.6} />
            }
            title={
              result.unfilteredCount === 0
                ? t('distillationLibrary.emptyTitle')
                : t('distillationLibrary.noResultsTitle', { query: result.query })
            }
            description={
              result.unfilteredCount === 0
                ? t('distillationLibrary.emptyDescription')
                : t('distillationLibrary.noResultsDescription')
            }
          />
        ) : null}

        {result && result.items.length > 0 ? (
          <>
            {status === 'error' ? (
              <div className="distillation-library-inline-error" role="status">
                <span>{t('distillationLibrary.refreshFailed')}</span>
                <button type="button" onClick={retry}>
                  {t('distillationLibrary.retry')}
                </button>
              </div>
            ) : null}
            <div
              key={`${result.query}|${result.page}`}
              className={`distillation-library-list${isResolving ? ' is-resolving' : ''}`}
            >
              {result.items.map((item) => (
                <ReadingEvidenceCard
                  key={item.annotationId}
                  evidence={{
                    content: item.content,
                    excerpt: item.anchorText,
                    assetLabel: t('readingEvidence.assetTypes.distillation'),
                    authorLabel: t('readingEvidence.authors.aiAssisted'),
                    sourceTitle: item.articleTitle,
                    sourceDetail: [t(`library.sources.${item.sourceType}Short`), item.articleByline]
                      .filter(Boolean)
                      .join(' · '),
                    date: {
                      dateTime: item.updatedAt,
                      label: dateFormatter.format(new Date(item.updatedAt)),
                    },
                  }}
                  labels={{
                    excerpt: t('readingEvidence.excerpt'),
                    openSource: t('readingEvidence.openSource'),
                    openDiscussion: t('readingEvidence.openDiscussion'),
                    locationUnavailable: t('readingEvidence.locationUnavailable'),
                  }}
                  onOpenSource={() =>
                    onOpenEvidenceSource({
                      articleId: item.articleId,
                      annotationId: item.annotationId,
                    })
                  }
                  onOpenDiscussion={() =>
                    onOpenEvidenceSource({
                      articleId: item.articleId,
                      annotationId: item.annotationId,
                      view: 'discussion',
                    })
                  }
                />
              ))}
            </div>
            {totalPages > 1 ? (
              <nav
                className="distillation-library-pagination"
                aria-label={t('distillationLibrary.pagination')}
              >
                <button
                  type="button"
                  aria-label={t('distillationLibrary.previousPage')}
                  disabled={page <= 1 || status === 'loading'}
                  onClick={() => changePage(page - 1)}
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" size={17} />
                </button>
                <span>{t('distillationLibrary.pageCount', { page, total: totalPages })}</span>
                <button
                  type="button"
                  aria-label={t('distillationLibrary.nextPage')}
                  disabled={page >= totalPages || status === 'loading'}
                  onClick={() => changePage(page + 1)}
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" size={17} />
                </button>
              </nav>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

type DistillationLibraryState = { page: number; query: string; searchQuery: string };

type DistillationLibraryEvent =
  | { type: 'pageChanged'; page: number }
  | { type: 'queryEdited'; query: string }
  | { type: 'searchSettled'; searchQuery: string };

function distillationLibraryReducer(
  state: DistillationLibraryState,
  event: DistillationLibraryEvent,
): DistillationLibraryState {
  switch (event.type) {
    case 'pageChanged':
      return { ...state, page: event.page };
    case 'queryEdited':
      return { ...state, query: event.query };
    case 'searchSettled':
      return { ...state, page: 1, searchQuery: event.searchQuery };
  }
}

function DistillationLibraryMessage({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="distillation-library-message">
      {icon}
      <h2>{title}</h2>
      <p>{description}</p>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function DistillationLibrarySkeleton() {
  return (
    <div className="distillation-library-skeleton" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="distillation-library-skeleton-card">
          <span className="distillation-library-skeleton-line" />
          <span className="distillation-library-skeleton-line" />
          <span className="distillation-library-skeleton-line" />
          <span className="distillation-library-skeleton-line" />
          <span className="distillation-library-skeleton-line" />
          <span className="distillation-library-skeleton-line distillation-library-skeleton-meta" />
        </div>
      ))}
    </div>
  );
}
