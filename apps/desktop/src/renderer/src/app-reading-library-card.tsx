import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Clock3,
  MessageSquareText,
  MoreHorizontal,
  PencilLine,
  Trash2,
} from 'lucide-react';
import type { ArticleRecord } from '@yomitomo/shared';
import { formatDate, urlHost } from './app-utils';
import { ArticleBook } from './app-article-book';
import { isEbookArticle } from './app-source-bookcase';
import {
  articleAnnotationCount,
  articleReadingMinutes,
  articleSiteIconUrl,
  articleThoughtCount,
  formatLibraryRelativeTime,
  libraryArticleStatus,
} from './app-reading-library-utils';

const ARTICLE_DELETE_HOLD_MS = 1400;

export function ArticleLibraryCard({
  article,
  onDelete,
  onOpen,
}: {
  article: ArticleRecord;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const [deleteHolding, setDeleteHolding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [siteIconFailed, setSiteIconFailed] = useState(false);
  const deleteTimerRef = useRef<number | null>(null);
  const annotations = articleAnnotationCount(article);
  const thoughts = articleThoughtCount(article);
  const isEbook = isEbookArticle(article);
  const isPdf = article.sourceType === 'pdf';
  const status = libraryArticleStatus(article);
  const readingMinutes = articleReadingMinutes(article);
  const siteIconUrl = isEbook || isPdf ? '' : articleSiteIconUrl(article);
  const authorLabel =
    article.byline ||
    article.pdf?.metadata.fileName ||
    article.siteName ||
    urlHost(article.canonicalUrl || article.url) ||
    '未知作者';

  useEffect(
    () => () => {
      if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    setSiteIconFailed(false);
  }, [siteIconUrl]);

  function stopDeleteHold() {
    if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
    setDeleteHolding(false);
  }

  function openCardWithKeyboard(event: React.KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen();
  }

  function startDeleteHold(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (deleteTimerRef.current !== null) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDeleteHolding(true);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      onDelete();
    }, ARTICLE_DELETE_HOLD_MS);
  }

  return (
    <article
      className="library-card"
      role="button"
      tabIndex={0}
      aria-label={`打开文章：${article.title}`}
      onClick={onOpen}
      onKeyDown={openCardWithKeyboard}
    >
      <div className="library-card-top-actions">
        <button
          className="library-card-open-icon"
          type="button"
          aria-label={`打开文章：${article.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <ArrowUpRight size={16} />
        </button>
        <div
          className="library-card-menu"
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setMenuOpen(false);
            stopDeleteHold();
          }}
        >
          <button
            className={menuOpen ? 'library-card-more is-active' : 'library-card-more'}
            type="button"
            aria-label={`更多操作：${article.title}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((current) => !current);
            }}
          >
            <MoreHorizontal size={17} />
          </button>
          {menuOpen ? (
            <div
              className="library-card-menu-popover"
              role="menu"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className={deleteHolding ? 'library-item-delete is-holding' : 'library-item-delete'}
                style={{ '--delete-hold-ms': `${ARTICLE_DELETE_HOLD_MS}ms` } as React.CSSProperties}
                type="button"
                role="menuitem"
                aria-label={`长按删除文章：${article.title}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onPointerCancel={stopDeleteHold}
                onPointerDown={startDeleteHold}
                onPointerLeave={stopDeleteHold}
                onPointerUp={stopDeleteHold}
              >
                <Trash2 size={14} />
                <span>长按删除</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="library-card-main">
        <ArticleBook article={article} />
        <div className="library-card-copy">
          <div>
            <div className="library-card-status-row">
              <span className={`library-status-badge is-${status.tone}`}>{status.label}</span>
              <span>
                <Clock3 size={13} />约 {readingMinutes} 分钟
              </span>
            </div>
            <h3 title={article.title}>{article.title}</h3>
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
            <time dateTime={article.createdAt}>添加于 {formatDate(article.createdAt)}</time>
            <div className="library-card-reading-meta">
              最近阅读 {formatLibraryRelativeTime(article.updatedAt)}
            </div>
          </div>
        </div>
      </div>
      <footer className="library-card-footer">
        <div className="library-card-meta">
          <span>
            <PencilLine size={13} />
            {annotations} 批注
          </span>
          <span>
            <MessageSquareText size={13} />
            {thoughts} 讨论
          </span>
        </div>
        <span className="library-source-badge">
          {isEbookArticle(article) ? 'ePub' : isPdf ? 'PDF' : '网页'}
        </span>
      </footer>
    </article>
  );
}
