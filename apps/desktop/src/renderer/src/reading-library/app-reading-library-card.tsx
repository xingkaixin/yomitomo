import { useState, type CSSProperties, type DragEvent } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { Layers2, MoreHorizontal, PencilLine, Pin, PinOff } from 'lucide-react';
import type { ArticleSummaryRecord } from '@yomitomo/shared';
import { urlHost } from '../shell/app-utils';
import { ArticleBook, formatPdfAuthors } from '../shell/app-article-book';
import { ArticleDeleteMenuItem, useArticleDeleteConfirm } from './app-reading-library-delete';
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
  draggable = false,
  onDelete,
  onDragEnd,
  onDragStart,
  onOpen,
  onRemoveFromCollection,
  onSetPinned,
  pinned = false,
}: {
  article: ArticleSummaryRecord;
  draggable?: boolean;
  onDelete: () => void;
  onDragEnd?: () => void;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onOpen: () => void;
  onRemoveFromCollection?: () => Promise<void> | void;
  onSetPinned?: (pinned: boolean) => Promise<void> | void;
  pinned?: boolean;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const annotations = articleAnnotationCount(article);
  const distillations = articleDistillationCount(article);
  const statsLabel = t('library.stats.label', { annotations, distillations });
  const isEbook = article.sourceType === 'ebook';
  const isPdf = article.sourceType === 'pdf';
  const isText = article.sourceType === 'text';
  const authorLabel = libraryArticleAuthorLabel(article);
  const title = articleDisplayTitle(article);
  const { dialog: deleteDialog, requestDelete } = useArticleDeleteConfirm(title, onDelete);
  const sourceLabel = isEbook
    ? t('library.sources.ebookShort')
    : isPdf
      ? t('library.sources.pdfShort')
      : isText
        ? t('library.sources.textShort')
        : t('library.sources.webShort');
  const itemClassName = isEbook || isPdf ? 'library-ebook-list-item' : 'library-web-item';
  const coverClassName = isEbook || isPdf ? 'library-ebook-cover-column' : 'library-web-item-cover';
  const openLabel =
    isEbook || isPdf
      ? t('library.actions.openDocument', {
          title,
          type: isPdf ? 'PDF' : t('library.fallback.ebook'),
        })
      : t('library.actions.openArticle', { title });

  return (
    <article
      className={`library-list-item library-article-list-item ${itemClassName}`}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
      <button
        className="library-list-item-open"
        type="button"
        aria-label={openLabel}
        onClick={onOpen}
      />
      <div className="library-item-actions">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <div className="library-card-menu">
            <DropdownMenuTrigger asChild>
              <button
                className={menuOpen ? 'library-card-more is-active' : 'library-card-more'}
                type="button"
                aria-label={t('library.actions.more', { title })}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal size={17} />
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
                      setMenuOpen(false);
                      void onSetPinned(!pinned);
                    }}
                  >
                    {pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    <span>{pinned ? t('library.actions.unpin') : t('library.actions.pin')}</span>
                  </button>
                </DropdownMenuItem>
              ) : null}
              {onRemoveFromCollection ? (
                <DropdownMenuItem asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void onRemoveFromCollection();
                    }}
                  >
                    <Layers2 size={14} />
                    <span>{t('library.collection.removeMember')}</span>
                  </button>
                </DropdownMenuItem>
              ) : null}
              <ArticleDeleteMenuItem
                title={title}
                onSelect={() => {
                  setMenuOpen(false);
                  requestDelete();
                }}
              />
            </DropdownMenuContent>
          </div>
        </DropdownMenu>
      </div>
      {deleteDialog}
      <div className={coverClassName} aria-hidden="true">
        <ArticleBook article={article} />
        <LibraryCardCoverProgress progress={article.readingProgress?.progress ?? 0} />
      </div>
      <div className={isEbook || isPdf ? 'library-ebook-list-copy' : 'library-article-list-copy'}>
        <p className="library-card-author" aria-hidden={authorLabel ? undefined : true}>
          <span>{authorLabel || ' '}</span>
        </p>
        <div className={isEbook || isPdf ? 'library-ebook-list-main' : 'library-web-item-main'}>
          <h3 title={title}>{title}</h3>
        </div>
        <div className={isEbook || isPdf ? 'library-ebook-list-meta' : 'library-web-item-meta'}>
          <span className="library-item-date-source">
            <time dateTime={article.createdAt}>{formatLibraryShortDate(article.createdAt)}</time>
            <span className="library-source-badge">{sourceLabel}</span>
            {pinned ? (
              <span
                className="library-card-pin-indicator"
                aria-label={t('library.actions.pinned')}
                data-tooltip={t('library.actions.pinned')}
              >
                <Pin size={15} />
              </span>
            ) : null}
          </span>
          <div className="library-count-stats" aria-label={statsLabel} data-tooltip={statsLabel}>
            <span className="library-count-stat">
              <PencilLine size={13} />
              <span className="library-count-value">{annotations}</span>
            </span>
            <span className="library-count-stat">
              <Layers2 size={13} />
              <span className="library-count-value">{distillations}</span>
            </span>
          </div>
        </div>
      </div>
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

function LibraryCardCoverProgress({ progress }: { progress: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="library-cover-progress library-ebook-progress"
      style={coverProgressStyle(progress)}
      aria-label={t('library.actions.progress')}
    />
  );
}

function coverProgressStyle(value: number) {
  const progress = Math.min(1, Math.max(0, value));
  return { '--ebook-progress': `${Math.round(progress * 100)}%` } as CSSProperties;
}
