import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, LibraryBig, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DistillationLibraryItem, DistillationLibraryListResult } from '../../../ipc-contract';

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 180;

type LoadState =
  | { status: 'loading'; result: DistillationLibraryListResult | null }
  | { status: 'ready'; result: DistillationLibraryListResult }
  | { status: 'error'; result: DistillationLibraryListResult | null };

export function DistillationLibrary({
  onOpenOriginal,
}: {
  onOpenOriginal: (articleId: string, annotationId: string) => void;
}) {
  const { i18n, t } = useTranslation();
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading', result: null });
  const requestIdRef = useRef(0);
  const scrollRef = useRef<HTMLElement>(null);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [i18n.language, i18n.resolvedLanguage],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearchQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const desktop = window.yomitomoDesktop;
    if (!desktop?.onAnnotationDistillationCommitted) return;
    return desktop.onAnnotationDistillationCommitted(() => {
      setRefreshVersion((version) => version + 1);
    });
  }, []);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoadState((current) => ({ status: 'loading', result: current.result }));
    void window.yomitomoDesktop
      .listDistillationLibrary({ page, pageSize: PAGE_SIZE, query: searchQuery })
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setLoadState({ status: 'ready', result });
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setLoadState((current) => ({ status: 'error', result: current.result }));
      });
  }, [page, refreshVersion, searchQuery]);

  const result = loadState.result;
  const totalPages = result ? Math.max(1, Math.ceil(result.totalCount / result.pageSize)) : 1;

  function changePage(nextPage: number) {
    setPage(nextPage);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  return (
    <section
      ref={scrollRef}
      className="distillation-library"
      aria-busy={loadState.status === 'loading'}
      aria-labelledby="distillation-library-title"
    >
      <div className="distillation-library-inner">
        <header className="distillation-library-header">
          <div>
            <h1 id="distillation-library-title">{t('distillationLibrary.title')}</h1>
            <p>{t('distillationLibrary.description')}</p>
          </div>
          {result?.unfilteredCount ? (
            <span className="distillation-library-total">
              {t('distillationLibrary.totalCount', { count: result.unfilteredCount })}
            </span>
          ) : null}
        </header>

        <div className="distillation-library-search">
          <Search aria-hidden="true" size={18} />
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
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              aria-label={t('distillationLibrary.clearSearch')}
              onClick={() => setQuery('')}
            >
              <X aria-hidden="true" size={16} />
            </button>
          ) : null}
        </div>

        <div className="sr-only" aria-live="polite">
          {loadState.status === 'loading'
            ? t('distillationLibrary.loading')
            : t('distillationLibrary.resultCount', { count: result?.totalCount || 0 })}
        </div>

        {loadState.status === 'error' && !result ? (
          <DistillationLibraryMessage
            title={t('distillationLibrary.loadFailed')}
            description={t('distillationLibrary.loadFailedDescription')}
            actionLabel={t('distillationLibrary.retry')}
            onAction={() => setRefreshVersion((version) => version + 1)}
          />
        ) : null}

        {loadState.status === 'loading' && !result ? <DistillationLibrarySkeleton /> : null}

        {result && result.totalCount === 0 ? (
          <DistillationLibraryMessage
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
            {loadState.status === 'error' ? (
              <div className="distillation-library-inline-error" role="status">
                <span>{t('distillationLibrary.refreshFailed')}</span>
                <button type="button" onClick={() => setRefreshVersion((version) => version + 1)}>
                  {t('distillationLibrary.retry')}
                </button>
              </div>
            ) : null}
            <div
              className={`distillation-library-list${loadState.status === 'loading' ? ' is-refreshing' : ''}`}
            >
              {result.items.map((item) => (
                <DistillationCard
                  key={item.annotationId}
                  item={item}
                  formattedDate={dateFormatter.format(new Date(item.updatedAt))}
                  sourceLabel={t(`library.sources.${item.sourceType}Short`)}
                  onOpenOriginal={onOpenOriginal}
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
                  disabled={page <= 1 || loadState.status === 'loading'}
                  onClick={() => changePage(page - 1)}
                >
                  {t('distillationLibrary.previousPage')}
                </button>
                <span>{t('distillationLibrary.pageCount', { page, total: totalPages })}</span>
                <button
                  type="button"
                  disabled={page >= totalPages || loadState.status === 'loading'}
                  onClick={() => changePage(page + 1)}
                >
                  {t('distillationLibrary.nextPage')}
                </button>
              </nav>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function DistillationCard({
  item,
  formattedDate,
  sourceLabel,
  onOpenOriginal,
}: {
  item: DistillationLibraryItem;
  formattedDate: string;
  sourceLabel: string;
  onOpenOriginal: (articleId: string, annotationId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <article className="distillation-library-card">
      <div className="distillation-library-card-meta">
        <span>{sourceLabel}</span>
        <time dateTime={item.updatedAt}>{formattedDate}</time>
      </div>
      <p className="distillation-library-card-content">{item.content}</p>
      {item.anchorText ? (
        <blockquote>
          <span>{t('distillationLibrary.originalText')}</span>
          <p>{item.anchorText}</p>
        </blockquote>
      ) : null}
      <footer>
        <div className="distillation-library-source">
          <strong>{item.articleTitle}</strong>
          {item.articleByline ? <span>{item.articleByline}</span> : null}
        </div>
        <button type="button" onClick={() => onOpenOriginal(item.articleId, item.annotationId)}>
          {t('distillationLibrary.openOriginal')}
          <ArrowRight aria-hidden="true" size={15} />
        </button>
      </footer>
    </article>
  );
}

function DistillationLibraryMessage({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="distillation-library-message">
      <LibraryBig aria-hidden="true" size={25} strokeWidth={1.6} />
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
        <span key={index} />
      ))}
    </div>
  );
}
