import { useMemo, useReducer } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { ARTICLE_SOURCE_TYPES, type ContentRef } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import {
  libraryCatalogItemRef,
  readingLibrarySourceLimit,
  type LibraryCatalogItem,
  type LibraryCatalogListInput,
} from '../../../ipc-contract';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { contentRefKey, libraryItemTitle } from '../reading-library/app-reading-library-entities';
import { toggleCatalogSelection } from '../reading-library/library-catalog-selection';
import { useLibraryCatalog } from '../reading-library/use-library-catalog';

const PAGE_SIZE = 30;

export type ReadingMemorySourceSelection = {
  ref: ContentRef & { kind: 'article' };
  title: string;
};

type SourcePickerProps = {
  catalogRevision: unknown;
  selectedSources: ReadingMemorySourceSelection[];
  onConfirm: (sources: ReadingMemorySourceSelection[]) => void;
  onClose: () => void;
};

export function ReadingMemorySourcePicker({
  catalogRevision,
  selectedSources,
  onConfirm,
  onClose,
}: SourcePickerProps) {
  const { t } = useTranslation();
  const [{ page, query, retry, selection }, dispatch] = useReducer(
    sourcePickerReducer,
    selectedSources,
    initialSourcePickerState,
  );
  const input = useMemo<LibraryCatalogListInput>(
    () => ({
      scope: { kind: 'library' },
      types: [...ARTICLE_SOURCE_TYPES],
      query,
      page,
      pageSize: PAGE_SIZE,
    }),
    [query, page],
  );
  const revision = useMemo(() => [catalogRevision, retry], [catalogRevision, retry]);
  const catalog = useLibraryCatalog(input, revision);
  const items =
    catalog.result?.entities.filter(
      (item): item is Extract<LibraryCatalogItem, { source: 'article' }> =>
        item.kind === 'item' && item.source === 'article',
    ) ?? [];
  const pageCount = Math.max(1, Math.ceil((catalog.result?.totalCount ?? 0) / PAGE_SIZE));
  const limitReached = selection.size >= readingLibrarySourceLimit;

  function toggle(source: ReadingMemorySourceSelection) {
    dispatch({ type: 'sourceToggled', source });
  }

  function confirm() {
    if (selection.size > readingLibrarySourceLimit) return;
    onConfirm([...selection.values()]);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="library-collection-dialog-overlay">
          <DialogContent className="library-collection-picker-dialog">
            <header>
              <div>
                <DialogTitle>{t('readingMemory.library.sourcePicker.title')}</DialogTitle>
                <DialogDescription>
                  {t('readingMemory.library.sourcePicker.description')}
                </DialogDescription>
              </div>
            </header>
            <div className="library-collection-picker-toolbar">
              <div className="library-search library-search-combo">
                <HugeiconsIcon icon={Search01Icon} size={16} aria-hidden="true" />
                <Input
                  type="search"
                  value={query}
                  aria-label={t('readingMemory.library.sourcePicker.searchLabel')}
                  placeholder={t('readingMemory.library.sourcePicker.searchPlaceholder')}
                  onChange={(event) =>
                    dispatch({ type: 'queryChanged', query: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="library-collection-picker-body">
              <section
                className="library-collection-picker-list"
                aria-label={t('readingMemory.library.sourcePicker.available')}
                aria-busy={catalog.status === 'loading'}
              >
                {catalog.status === 'loading' ? (
                  <p role="status">{t('library.catalog.loading')}</p>
                ) : null}
                {catalog.status === 'error' ? (
                  <div className="space-y-2">
                    <p role="alert">{t('library.catalog.loadFailed')}</p>
                    <Button variant="secondary" onClick={() => dispatch({ type: 'retried' })}>
                      {t('readingMemory.library.sourcePicker.retry')}
                    </Button>
                  </div>
                ) : null}
                {items.map((item) => {
                  const ref = libraryCatalogItemRef(item);
                  const title = libraryItemTitle(item);
                  const selected = selection.has(contentRefKey(ref));
                  return (
                    <label
                      key={ref.id}
                      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
                    >
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-primary"
                        checked={selected}
                        disabled={catalog.status !== 'ready' || (limitReached && !selected)}
                        onChange={() => toggle({ ref: { kind: 'article', id: ref.id }, title })}
                        aria-label={title}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium break-words">{title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[
                            t(`library.sources.${item.article.sourceType}Short`),
                            item.article.byline,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {catalog.status === 'ready' && items.length === 0 ? (
                  <p>{t('readingMemory.library.sourcePicker.noResults')}</p>
                ) : null}
                {pageCount > 1 || page > 1 ? (
                  <nav className="library-pagination" aria-label={t('library.pagination.label')}>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t('library.pagination.previous')}
                      disabled={page <= 1 || catalog.status === 'loading'}
                      onClick={() => dispatch({ type: 'pageChanged', page: Math.max(1, page - 1) })}
                    >
                      <HugeiconsIcon icon={ArrowLeft01Icon} size={16} aria-hidden="true" />
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {page} / {pageCount}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t('library.pagination.next')}
                      disabled={page >= pageCount || catalog.status !== 'ready'}
                      onClick={() =>
                        dispatch({ type: 'pageChanged', page: Math.min(pageCount, page + 1) })
                      }
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} size={16} aria-hidden="true" />
                    </Button>
                  </nav>
                ) : null}
              </section>
              <section
                className="library-collection-picker-selection"
                aria-label={t('readingMemory.library.sourcePicker.selectedCount', {
                  count: selection.size,
                })}
              >
                <h3 className="m-0 text-sm font-semibold" aria-live="polite">
                  {t('readingMemory.library.sourcePicker.selectedCount', { count: selection.size })}
                </h3>
                <p>{t('readingMemory.library.sourcePicker.emptySelection')}</p>
                <ul className="m-0 mt-3 list-none space-y-1 p-0">
                  {[...selection.values()].map((source) => (
                    <li
                      key={contentRefKey(source.ref)}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1"
                    >
                      <span className="min-w-0 text-sm break-words">{source.title}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        aria-label={t('readingMemory.library.sourcePicker.remove', {
                          title: source.title,
                        })}
                        onClick={() => toggle(source)}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={16} aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
                {limitReached ? (
                  <p role="status">
                    {t('readingMemory.library.sourcePicker.limitReached', {
                      count: readingLibrarySourceLimit,
                    })}
                  </p>
                ) : null}
              </section>
            </div>
            <footer>
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={selection.size > readingLibrarySourceLimit}
                onClick={confirm}
              >
                {t('readingMemory.library.sourcePicker.confirm')}
              </Button>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

type SourcePickerState = {
  page: number;
  query: string;
  retry: number;
  selection: Map<string, ReadingMemorySourceSelection>;
};

type SourcePickerEvent =
  | { type: 'pageChanged'; page: number }
  | { type: 'queryChanged'; query: string }
  | { type: 'retried' }
  | { type: 'sourceToggled'; source: ReadingMemorySourceSelection };

function initialSourcePickerState(
  selectedSources: ReadingMemorySourceSelection[],
): SourcePickerState {
  return {
    page: 1,
    query: '',
    retry: 0,
    selection: new Map(selectedSources.map((source) => [contentRefKey(source.ref), source])),
  };
}

function sourcePickerReducer(
  state: SourcePickerState,
  event: SourcePickerEvent,
): SourcePickerState {
  switch (event.type) {
    case 'pageChanged':
      return { ...state, page: event.page };
    case 'queryChanged':
      return { ...state, page: 1, query: event.query };
    case 'retried':
      return { ...state, retry: state.retry + 1 };
    case 'sourceToggled': {
      const { selection } = state;
      if (
        !selection.has(contentRefKey(event.source.ref)) &&
        selection.size >= readingLibrarySourceLimit
      )
        return state;
      return {
        ...state,
        selection: toggleCatalogSelection(selection, event.source.ref, event.source),
      };
    }
  }
}
