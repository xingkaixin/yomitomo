import { useEffect, useState } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Clock3, Layers2, MoreHorizontal, PencilLine } from 'lucide-react';
import type { ArticleSummaryRecord } from '@yomitomo/shared';
import { formatDate, urlHost } from '../shell/app-utils';
import { ArticleBook, formatPdfAuthors, useArticleSiteIcon } from '../shell/app-article-book';
import { ArticleDeleteMenuItem, useArticleDeleteConfirm } from './app-reading-library-delete';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  articleAnnotationCount,
  articleDistillationCount,
  articleDisplayTitle,
  articleReadingMinutes,
  formatLibraryRelativeTime,
  libraryArticleStatus,
} from './app-reading-library-utils';

export function ArticleLibraryCard({
  article,
  onDelete,
  onOpen,
}: {
  article: ArticleSummaryRecord;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [siteIconFailed, setSiteIconFailed] = useState(false);
  const annotations = articleAnnotationCount(article);
  const distillations = articleDistillationCount(article);
  const statsLabel = t('library.stats.label', { annotations, distillations });
  const isEbook = article.sourceType === 'ebook';
  const isPdf = article.sourceType === 'pdf';
  const status = libraryArticleStatus(article);
  const readingMinutes = articleReadingMinutes(article);
  const siteIconUrl = useArticleSiteIcon(article.id, !isEbook && !isPdf) || '';
  const authorLabel = libraryArticleAuthorLabel(article);
  const title = articleDisplayTitle(article);
  const { dialog: deleteDialog, requestDelete } = useArticleDeleteConfirm(title, onDelete);

  useEffect(() => {
    setSiteIconFailed(false);
  }, [siteIconUrl]);

  return (
    <article className="library-card">
      <button
        className="library-card-open-surface"
        type="button"
        aria-label={t('library.actions.openArticle', { title })}
        onClick={onOpen}
      />
      <div className="library-card-top-actions">
        <button
          className="library-card-open-icon"
          type="button"
          aria-label={t('library.actions.openArticle', { title })}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <ArrowUpRight size={16} />
        </button>
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
      <div className="library-card-main">
        <ArticleBook article={article} />
        <div className="library-card-copy">
          <div>
            <div className="library-card-status-row">
              <span className={`library-status-badge is-${status.tone}`}>{status.label}</span>
              <span>
                <Clock3 size={13} />
                {t('library.meta.readingMinutes', { count: readingMinutes })}
              </span>
            </div>
            <h3 title={title}>{title}</h3>
            {authorLabel ? (
              <p className="library-card-author">
                {isEbook || isPdf ? null : (
                  <span className="library-site-icon-slot" aria-hidden="true">
                    {siteIconUrl && !siteIconFailed ? (
                      <img
                        alt=""
                        className="library-site-icon"
                        loading="lazy"
                        src={siteIconUrl}
                        onError={() => setSiteIconFailed(true)}
                      />
                    ) : null}
                  </span>
                )}
                <span>{authorLabel}</span>
              </p>
            ) : null}
            <time dateTime={article.createdAt}>
              {t('library.meta.addedAt', { date: formatDate(article.createdAt) })}
            </time>
            <div className="library-card-reading-meta">
              {t('library.meta.recentReading', {
                time: formatLibraryRelativeTime(article.updatedAt),
              })}
            </div>
          </div>
        </div>
      </div>
      <footer className="library-card-footer">
        <div className="library-card-meta" aria-label={statsLabel} data-tooltip={statsLabel}>
          <span>
            <PencilLine size={13} />
            {t('library.meta.annotations', { count: annotations })}
          </span>
          <span>
            <Layers2 size={13} />
            {t('library.meta.distillations', { count: distillations })}
          </span>
        </div>
        <span className="library-source-badge">
          {isEbook ? 'EPUB' : isPdf ? 'PDF' : t('library.sources.webShort')}
        </span>
      </footer>
    </article>
  );
}

function libraryArticleAuthorLabel(article: ArticleSummaryRecord) {
  if (article.sourceType === 'pdf')
    return formatPdfAuthors(article.pdf?.metadata.author || '', { maxAuthors: 3, maxLength: 42 });
  if (article.sourceType === 'ebook')
    return article.byline || article.ebook?.metadata.fileName || '';
  return (
    article.byline ||
    article.siteName ||
    urlHost(article.canonicalUrl || article.url) ||
    i18next.t('library.meta.unknownAuthor')
  );
}
