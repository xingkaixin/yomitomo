import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Feather,
  LibraryBig,
  Search,
  X,
} from 'lucide-react';
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
  const isResolving = loadState.status === 'loading' && Boolean(result);

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
          <span className="distillation-library-search-underline" aria-hidden="true" />
        </div>

        <div className="sr-only" aria-live="polite">
          {loadState.status === 'loading'
            ? t('distillationLibrary.loading')
            : t('distillationLibrary.resultCount', { count: result?.totalCount || 0 })}
        </div>

        {loadState.status === 'error' && !result ? (
          <DistillationLibraryMessage
            icon={<LibraryBig aria-hidden="true" size={26} strokeWidth={1.6} />}
            title={t('distillationLibrary.loadFailed')}
            description={t('distillationLibrary.loadFailedDescription')}
            actionLabel={t('distillationLibrary.retry')}
            onAction={() => setRefreshVersion((version) => version + 1)}
          />
        ) : null}

        {loadState.status === 'loading' && !result ? <DistillationLibrarySkeleton /> : null}

        {result && result.totalCount === 0 ? (
          <DistillationLibraryMessage
            icon={<Feather aria-hidden="true" size={26} strokeWidth={1.6} />}
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
              key={`${result.query}|${result.page}`}
              className={`distillation-library-list${isResolving ? ' is-resolving' : ''}`}
            >
              {result.items.map((item, index) => (
                <DistillationCard
                  key={item.annotationId}
                  index={index}
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
                  aria-label={t('distillationLibrary.previousPage')}
                  disabled={page <= 1 || loadState.status === 'loading'}
                  onClick={() => changePage(page - 1)}
                >
                  <ChevronLeft aria-hidden="true" size={17} />
                </button>
                <span>{t('distillationLibrary.pageCount', { page, total: totalPages })}</span>
                <button
                  type="button"
                  aria-label={t('distillationLibrary.nextPage')}
                  disabled={page >= totalPages || loadState.status === 'loading'}
                  onClick={() => changePage(page + 1)}
                >
                  <ChevronRight aria-hidden="true" size={17} />
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
  index,
  item,
  formattedDate,
  sourceLabel,
  onOpenOriginal,
}: {
  index: number;
  item: DistillationLibraryItem;
  formattedDate: string;
  sourceLabel: string;
  onOpenOriginal: (articleId: string, annotationId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <article className="distillation-library-card" style={{ '--i': index } as CSSProperties}>
      <p className="distillation-library-card-content">{item.content}</p>
      {item.anchorText ? (
        <blockquote className="distillation-library-anchor">
          <span>{t('distillationLibrary.originalText')}</span>
          <p>{item.anchorText}</p>
        </blockquote>
      ) : null}
      <footer>
        <div className="distillation-library-source">
          <div className="distillation-library-card-meta">
            <span className="distillation-library-source-badge">{sourceLabel}</span>
            <time dateTime={item.updatedAt}>{formattedDate}</time>
          </div>
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
