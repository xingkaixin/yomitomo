import { HugeiconsIcon } from '@hugeicons/react';
import {
  Layers02Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  PinIcon,
  PinOffIcon,
} from '@hugeicons/core-free-icons';
import { useReducer, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { readingProgressRatio } from '@yomitomo/core';
import type { ArticleSummaryRecord } from '@yomitomo/shared';
import { urlHost } from '../shell/app-article-presentation';
import { ArticleBook, formatPdfAuthors } from '../shell/app-article-book';
import { ArticleDeleteMenuItem, useArticleDeleteConfirm } from './app-reading-library-delete';
import { CollectionRemoveIcon } from './collection-icon';
import { libraryMenuReducer } from './library-menu-state';
import { removeShelfItem } from './library-shelf-removal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  articleAnnotationCount,
  articleDistillationCount,
  articleDisplayTitle,
  formatLibraryShortDate,
} from './app-reading-library-utils';

export function ArticleLibraryCard({
  article,
  onDelete,
  onOpen,
  onRemoveFromCollection,
  onSetPinned,
  pinned = false,
}: {
  article: ArticleSummaryRecord;
  onDelete: () => Promise<boolean>;
  onOpen: () => void;
  onRemoveFromCollection?: () => Promise<void> | void;
  onSetPinned?: (pinned: boolean) => Promise<void> | void;
  pinned?: boolean;
}) {
  const { t } = useTranslation();
  const [menuOpen, dispatchMenu] = useReducer(libraryMenuReducer, false);
  const annotations = articleAnnotationCount(article);
  const distillations = articleDistillationCount(article);
  const statsLabel = t('library.stats.label', { annotations, distillations });
  const isEbook = article.sourceType === 'ebook';
  const isPdf = article.sourceType === 'pdf';
  const isText = article.sourceType === 'text';
  const authorLabel = libraryArticleAuthorLabel(article);
  const title = articleDisplayTitle(article);
  const itemRef = useRef<HTMLElement>(null);
  const { dialog: deleteDialog, requestDelete } = useArticleDeleteConfirm(title, () => {
    void removeShelfItem(itemRef.current, onDelete);
  });
  const sourceLabel = isEbook
    ? t('library.sources.ebookShort')
    : isPdf
      ? t('library.sources.pdfShort')
      : isText
        ? t('library.sources.textShort')
        : t('library.sources.webShort');
  const openLabel =
    isEbook || isPdf
      ? t('library.actions.openDocument', {
          title,
          type: isPdf ? 'PDF' : t('library.fallback.ebook'),
        })
      : t('library.actions.openArticle', { title });

  return (
    <LibraryShelfItem
      actions={
        <>
          <div className={menuOpen ? 'library-item-actions is-active' : 'library-item-actions'}>
            <DropdownMenu
              open={menuOpen}
              onOpenChange={(open) => dispatchMenu({ type: 'openChanged', open })}
            >
              <div className="library-card-menu">
                <DropdownMenuTrigger asChild>
                  <button
                    className={menuOpen ? 'library-card-more is-active' : 'library-card-more'}
                    type="button"
                    aria-label={t('library.actions.more', { title })}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} size={17} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="library-card-menu-popover"
                  onClick={(event) => event.stopPropagation()}
                >
                  {onSetPinned ? (
                    <DropdownMenuItem asChild>
                      <button
                        type="button"
                        onClick={() => {
                          dispatchMenu({ type: 'itemChosen' });
                          void onSetPinned(!pinned);
                        }}
                      >
                        {pinned ? (
                          <HugeiconsIcon icon={PinOffIcon} size={14} />
                        ) : (
                          <HugeiconsIcon icon={PinIcon} size={14} />
                        )}
                        <span>
                          {pinned ? t('library.actions.unpin') : t('library.actions.pin')}
                        </span>
                      </button>
                    </DropdownMenuItem>
                  ) : null}
                  {onRemoveFromCollection ? (
                    <DropdownMenuItem asChild>
                      <button
                        type="button"
                        onClick={() => {
                          dispatchMenu({ type: 'itemChosen' });
                          void onRemoveFromCollection();
                        }}
                      >
                        <HugeiconsIcon icon={CollectionRemoveIcon} size={14} />
                        <span>{t('library.collection.removeMember')}</span>
                      </button>
                    </DropdownMenuItem>
                  ) : null}
                  <ArticleDeleteMenuItem
                    title={title}
                    onSelect={() => {
                      dispatchMenu({ type: 'itemChosen' });
                      requestDelete();
                    }}
                  />
                </DropdownMenuContent>
              </div>
            </DropdownMenu>
          </div>
          {deleteDialog}
        </>
      }
      cover={<ArticleBook article={article} />}
      itemRef={itemRef}
      openLabel={openLabel}
      progress={<LibraryCoverProgress progress={readingProgressRatio(article.readingProgress)} />}
      onOpen={onOpen}
    >
      <p className="library-card-author" aria-hidden={authorLabel ? undefined : true}>
        <span>{authorLabel || ' '}</span>
      </p>
      <h3 title={title}>{title}</h3>
      <div className="library-shelf-item-meta">
        <span className="library-item-date-source">
          <time dateTime={article.createdAt}>{formatLibraryShortDate(article.createdAt)}</time>
          <span className="library-source-badge">{sourceLabel}</span>
          {pinned ? (
            <span
              className="library-card-pin-indicator"
              aria-label={t('library.actions.pinned')}
              data-tooltip={t('library.actions.pinned')}
            >
              <HugeiconsIcon icon={PinIcon} size={15} />
            </span>
          ) : null}
        </span>
        <div className="library-count-stats" aria-label={statsLabel} data-tooltip={statsLabel}>
          <span className="library-count-stat">
            <HugeiconsIcon icon={PencilEdit01Icon} size={13} />
            <span className="library-count-value">{annotations}</span>
          </span>
          <span className="library-count-stat">
            <HugeiconsIcon icon={Layers02Icon} size={13} />
            <span className="library-count-value">{distillations}</span>
          </span>
        </div>
      </div>
    </LibraryShelfItem>
  );
}

export function LibraryShelfItem({
  actions,
  children,
  cover,
  itemRef,
  label,
  onOpen,
  openLabel,
  progress,
}: {
  actions: ReactNode;
  children: ReactNode;
  cover: ReactNode;
  itemRef?: Ref<HTMLElement>;
  label?: string;
  onOpen: () => void;
  openLabel: string;
  progress?: ReactNode;
}) {
  return (
    <article className="library-shelf-item" aria-label={label} ref={itemRef}>
      <button
        className="library-shelf-item-open"
        type="button"
        aria-label={openLabel}
        onClick={onOpen}
      />
      {actions}
      <div className="library-shelf-item-cover" aria-hidden="true">
        {cover}
      </div>
      {progress}
      <div className="library-shelf-item-copy">{children}</div>
    </article>
  );
}

function libraryArticleAuthorLabel(article: ArticleSummaryRecord) {
  if (article.sourceType === 'pdf')
    return formatPdfAuthors(article.pdf?.metadata.author || '', { maxAuthors: 3, maxLength: 42 });
  if (article.sourceType === 'ebook')
    return article.byline || article.ebook?.metadata.fileName || '';
  if (article.sourceType === 'text') return article.byline || '';
  return (
    urlHost(article.canonicalUrl || article.url) ||
    article.siteName ||
    i18next.t('library.meta.unknownAuthor')
  );
}

export function LibraryCoverProgress({ progress }: { progress: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="library-cover-progress"
      style={coverProgressStyle(progress)}
      aria-label={t('library.actions.progress')}
    />
  );
}

function coverProgressStyle(value: number) {
  const progress = Math.min(1, Math.max(0, value));
  return { '--ebook-progress': `${Math.round(progress * 100)}%` } as CSSProperties;
}
