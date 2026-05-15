import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookText,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileUp,
  Globe2,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  Agent,
  Annotation,
  ArticleReadingProgress,
  ArticleRecord,
  MessageSendShortcut,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import { annotationThreadComments, sortAnnotations, sortArticles } from '@yomitomo/core';
import { clampNumber } from '@yomitomo/reader-ui';
import { formatDate, urlHost } from './app-utils';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { ReadingCard } from './app-reading-card-panel';
import { ArticleBook } from './app-article-book';
import { SourceBookcase, isEbookArticle } from './app-source-bookcase';
import type { ArticleUpdater, EbookImportProgressCallback } from './app-reading-types';
import {
  LIBRARY_FILTER_OPTIONS,
  LIBRARY_SORT_OPTIONS,
  articleMatchesLibraryFilter,
  articleMatchesLibrarySearch,
  articleReadingMinutes,
  articleSiteIconUrl,
  compareLibraryArticles,
  formatLibraryRelativeTime,
  groupLibraryArticles,
  libraryArticleStatus,
  type LibraryFilter,
  type LibrarySort,
} from './app-reading-library-utils';

export { groupLibraryArticles };
export type { LibrarySort };

const ARTICLE_DELETE_HOLD_MS = 1400;
const MAX_EBOOK_IMPORT_BYTES = 80 * 1024 * 1024;
const LIBRARY_PAGE_SIZE_OPTIONS = [8, 12, 16, 24] as const;
type ArticleImportState = 'idle' | 'submitting' | 'imported' | 'duplicate' | 'error';
type ArticleImportResult = {
  status: 'imported' | 'duplicate';
  article: ArticleRecord;
};

function advanceImportProgress(current: number) {
  if (current >= 94) return current;
  return Math.min(94, current + Math.max(0.8, (94 - current) * 0.08));
}

function articleImportErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message) return '添加网页失败，请稍后重试';
  if (/网页地址|网页请求|文章保存失败/.test(message)) return message;
  if (/fetch failed|network|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return '无法访问这个网页，请确认链接可打开后再试';
  }
  return '添加网页失败，请确认链接内容可公开访问后再试';
}

export function ReadingLibrary({
  agents,
  articles,
  messageSendShortcut,
  selectionActionShortcuts,
  openArticleId,
  userProfile,
  onArticleOpened,
  onDeleteArticle,
  onImportEbookFile,
  onImportArticleUrl,
  onRefresh,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onUpdateArticle,
}: {
  agents: Agent[];
  articles: ArticleRecord[];
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  openArticleId?: string | null;
  userProfile: UserProfile;
  onArticleOpened?: (articleId: string) => void;
  onDeleteArticle: (articleId: string) => Promise<void> | void;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportArticleUrl: (url: string) => Promise<ArticleImportResult>;
  onRefresh: () => void;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  onSaveArticleReadingProgress: (
    articleId: string,
    progress: ArticleReadingProgress,
  ) => Promise<void> | void;
  onUpdateArticle: (articleId: string, update: ArticleUpdater) => Promise<void> | void;
}) {
  const [activeShelf, setActiveShelf] = useState<'library' | 'source' | 'card'>('library');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [sourceFocusAnnotationId, setSourceFocusAnnotationId] = useState<string | null>(null);
  const sortedArticles = useMemo<ArticleRecord[]>(() => sortArticles(articles), [articles]);
  const selectedArticle =
    sortedArticles.find((article) => article.id === selectedArticleId) || null;
  const annotations = useMemo<Annotation[]>(
    () => (selectedArticle ? sortAnnotations(selectedArticle.annotations) : []),
    [selectedArticle],
  );
  const reviewAgents = useMemo(
    () => agents.filter((agent) => agent.kind === 'review' && agent.enabled),
    [agents],
  );
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  const stats = articles.reduce(
    (result, article) => ({
      annotations: result.annotations + article.annotations.length,
      comments:
        result.comments +
        article.annotations.reduce(
          (count, annotation) => count + annotationThreadComments(annotation).length,
          0,
        ),
    }),
    { annotations: 0, comments: 0 },
  );

  useEffect(() => {
    if (!selectedArticle) {
      setSelectedAnnotationId(null);
      return;
    }
    setSelectedAnnotationId(null);
  }, [selectedArticle?.id]);

  useEffect(() => {
    if (selectedArticleId && !sortedArticles.some((article) => article.id === selectedArticleId)) {
      setSelectedArticleId(null);
    }
  }, [selectedArticleId, sortedArticles]);

  useEffect(() => {
    if (!openArticleId) return;
    const article = sortedArticles.find((item) => item.id === openArticleId);
    if (!article) return;
    openArticle(article);
    onArticleOpened?.(article.id);
  }, [openArticleId, onArticleOpened, sortedArticles]);

  async function deleteLibraryArticle(articleId: string) {
    await onDeleteArticle(articleId);
    if (selectedArticleId === articleId) {
      openLibraryShelf();
    }
  }

  function openArticle(article: ArticleRecord) {
    setSelectedArticleId(article.id);
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setActiveShelf('source');
  }

  function openLibraryShelf() {
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setActiveShelf('library');
  }

  function openSourceShelf() {
    if (!selectedArticle) return;
    setSourceFocusAnnotationId(selectedAnnotation?.id || null);
    setActiveShelf('source');
  }

  function openCardShelf() {
    if (!selectedArticle) return;
    setSourceFocusAnnotationId(null);
    setActiveShelf('card');
  }

  if (!selectedArticle) {
    return (
      <LibraryHome
        articles={articles}
        sortedArticles={sortedArticles}
        stats={stats}
        onDeleteArticle={deleteLibraryArticle}
        onImportEbookFile={onImportEbookFile}
        onImportArticleUrl={onImportArticleUrl}
        onOpenArticle={openArticle}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <div className={`library-bookcase-screen is-${activeShelf}-expanded`}>
      <div
        className={
          activeShelf === 'library'
            ? 'library-shelf is-expanded is-library-bookcase'
            : 'library-shelf is-collapsed is-library-bookcase'
        }
      >
        <ShelfTab
          actionLabel="返回阅读库"
          icon={<ChevronLeft size={18} />}
          label="阅读库"
          variant="library"
          onClick={openLibraryShelf}
        />
        <div className="library-shelf-content">
          {activeShelf === 'library' ? (
            <LibraryHome
              articles={articles}
              sortedArticles={sortedArticles}
              stats={stats}
              onDeleteArticle={deleteLibraryArticle}
              onImportEbookFile={onImportEbookFile}
              onImportArticleUrl={onImportArticleUrl}
              onOpenArticle={openArticle}
              onRefresh={onRefresh}
            />
          ) : null}
        </div>
      </div>

      {activeShelf === 'library' ? null : (
        <>
          <div
            className={
              activeShelf === 'source' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
            }
          >
            <ShelfTab
              actionLabel="返回原文"
              count={annotations.length}
              icon={<BookOpen size={18} />}
              label="原文"
              variant="view"
              onClick={openSourceShelf}
            />
            <div className="library-shelf-content">
              {activeShelf === 'source' ? (
                <SourceBookcase
                  agents={agents}
                  annotations={annotations}
                  article={selectedArticle}
                  focusAnnotationId={sourceFocusAnnotationId}
                  messageSendShortcut={messageSendShortcut}
                  selectionActionShortcuts={selectionActionShortcuts}
                  selectedAnnotationId={selectedAnnotation?.id || null}
                  userProfile={userProfile}
                  onFocusedAnnotation={() => setSourceFocusAnnotationId(null)}
                  onClose={openLibraryShelf}
                  onOpenAnnotation={setSelectedAnnotationId}
                  onSaveArticle={onSaveArticle}
                  onSaveArticleReadingProgress={onSaveArticleReadingProgress}
                  onUpdateArticle={onUpdateArticle}
                />
              ) : null}
            </div>
          </div>

          <div
            className={
              activeShelf === 'card' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
            }
          >
            <ShelfTab
              actionLabel="打开读后笔记"
              count={selectedArticle?.readingCard?.sections.length ?? 0}
              icon={<PencilLine size={18} />}
              label="笔记"
              variant="view"
              onClick={openCardShelf}
            />
            <div className="library-shelf-content">
              {activeShelf === 'card' ? (
                <ReadingCard
                  article={selectedArticle}
                  reviewAgents={reviewAgents}
                  onGenerated={onRefresh}
                  onOpenEvidence={(annotationId) => {
                    setSelectedAnnotationId(annotationId);
                    setSourceFocusAnnotationId(annotationId);
                    setActiveShelf('source');
                  }}
                />
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LibraryHome({
  articles,
  sortedArticles,
  stats,
  onDeleteArticle,
  onImportEbookFile,
  onImportArticleUrl,
  onOpenArticle,
  onRefresh,
}: {
  articles: ArticleRecord[];
  sortedArticles: ArticleRecord[];
  stats: { annotations: number; comments: number };
  onDeleteArticle: (articleId: string) => Promise<void>;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportArticleUrl: (url: string) => Promise<ArticleImportResult>;
  onOpenArticle: (article: ArticleRecord) => void;
  onRefresh: () => void;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importState, setImportState] = useState<ArticleImportState>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [importArticle, setImportArticle] = useState<ArticleRecord | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [ebookImportOpen, setEbookImportOpen] = useState(false);
  const [ebookImportState, setEbookImportState] = useState<ArticleImportState>('idle');
  const [ebookImportMessage, setEbookImportMessage] = useState('');
  const [ebookImportArticle, setEbookImportArticle] = useState<ArticleRecord | null>(null);
  const [ebookImportProgress, setEbookImportProgress] = useState(0);
  const [ebookDragging, setEbookDragging] = useState(false);
  const ebookInputRef = useRef<HTMLInputElement | null>(null);
  const importCloseTimerRef = useRef<number | null>(null);
  const ebookImportCloseTimerRef = useRef<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>('all');
  const [activeSort, setActiveSort] = useState<LibrarySort>('recentReading');
  const filteredArticles = useMemo(
    () =>
      sortedArticles
        .filter(
          (article) =>
            articleMatchesLibrarySearch(article, searchQuery) &&
            articleMatchesLibraryFilter(article, activeFilter),
        )
        .toSorted((left, right) => compareLibraryArticles(left, right, activeSort)),
    [activeFilter, activeSort, searchQuery, sortedArticles],
  );
  const pageCount = Math.max(1, Math.ceil(filteredArticles.length / pageSize));
  const pageArticles = filteredArticles.slice((page - 1) * pageSize, page * pageSize);
  const groupedPageArticles = useMemo(
    () => groupLibraryArticles(pageArticles, activeSort),
    [activeSort, pageArticles],
  );
  const pageNumbers = useMemo(() => {
    const visibleCount = Math.min(5, pageCount);
    const start = Math.min(
      Math.max(1, page - Math.floor(visibleCount / 2)),
      pageCount - visibleCount + 1,
    );
    return Array.from({ length: visibleCount }, (_, index) => start + index);
  }, [page, pageCount]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, activeSort, pageSize, searchQuery]);

  useEffect(
    () => () => {
      clearImportCloseTimer();
      clearEbookImportCloseTimer();
    },
    [],
  );

  useEffect(() => {
    if (importState !== 'submitting') return;

    const timer = window.setInterval(() => {
      setImportProgress(advanceImportProgress);
    }, 180);

    return () => window.clearInterval(timer);
  }, [importState]);

  useEffect(() => {
    if (ebookImportState !== 'submitting') return;

    const timer = window.setInterval(() => {
      setEbookImportProgress(advanceImportProgress);
    }, 180);

    return () => window.clearInterval(timer);
  }, [ebookImportState]);

  async function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearImportCloseTimer();
    const url = importUrl.trim();
    if (!url) {
      setImportState('error');
      setImportMessage('请输入网页地址');
      setImportArticle(null);
      setImportProgress(0);
      return;
    }

    try {
      setImportState('submitting');
      setImportMessage('正在解析网页');
      setImportArticle(null);
      setImportProgress(8);
      const result = await onImportArticleUrl(url);
      setImportArticle(result.article);
      if (result.status === 'duplicate') {
        setImportState('duplicate');
        setImportMessage('这篇文章已在阅读库');
        setImportProgress(100);
        return;
      }

      setImportProgress(100);
      setImportState('imported');
      setImportMessage('已添加到阅读库');
      setImportUrl('');
      importCloseTimerRef.current = window.setTimeout(() => {
        importCloseTimerRef.current = null;
        setImportOpen(false);
      }, 850);
    } catch (error) {
      setImportState('error');
      setImportMessage(articleImportErrorMessage(error));
      setImportArticle(null);
      setImportProgress(0);
    }
  }

  async function importEbook(file: File | undefined) {
    if (!file) return;
    clearEbookImportCloseTimer();
    if (!file.name.toLowerCase().endsWith('.epub')) {
      setEbookImportState('error');
      setEbookImportMessage('请选择 EPUB 文件');
      setEbookImportArticle(null);
      setEbookImportProgress(0);
      return;
    }
    if (file.size > MAX_EBOOK_IMPORT_BYTES) {
      setEbookImportState('error');
      setEbookImportMessage('EPUB 文件不能超过 80MB');
      setEbookImportArticle(null);
      setEbookImportProgress(0);
      return;
    }

    try {
      setEbookImportState('submitting');
      setEbookImportMessage(`正在解析 ${file.name}`);
      setEbookImportArticle(null);
      setEbookImportProgress(4);
      const result = await onImportEbookFile(file, (nextProgress) => {
        setEbookImportProgress(clampNumber(nextProgress, 0, 100, 4));
      });
      setEbookImportArticle(result.article);
      if (ebookInputRef.current) ebookInputRef.current.value = '';
      if (result.status === 'duplicate') {
        setEbookImportState('duplicate');
        setEbookImportMessage('这本电子书已在阅读库');
        setEbookImportProgress(100);
        return;
      }

      setEbookImportProgress(100);
      setEbookImportState('imported');
      setEbookImportMessage('已添加到阅读库');
      ebookImportCloseTimerRef.current = window.setTimeout(() => {
        ebookImportCloseTimerRef.current = null;
        setEbookImportOpen(false);
        setEbookDragging(false);
      }, 850);
    } catch (error) {
      setEbookImportState('error');
      setEbookImportMessage(error instanceof Error ? error.message : '添加电子书失败');
      setEbookImportArticle(null);
      setEbookImportProgress(0);
      if (ebookInputRef.current) ebookInputRef.current.value = '';
    }
  }

  function clearEbookImportCloseTimer() {
    if (ebookImportCloseTimerRef.current === null) return;
    window.clearTimeout(ebookImportCloseTimerRef.current);
    ebookImportCloseTimerRef.current = null;
  }

  function clearImportCloseTimer() {
    if (importCloseTimerRef.current === null) return;
    window.clearTimeout(importCloseTimerRef.current);
    importCloseTimerRef.current = null;
  }

  function openImportDialog() {
    clearImportCloseTimer();
    clearEbookImportCloseTimer();
    setAddMenuOpen(false);
    setEbookImportOpen(false);
    setImportOpen(true);
    setImportState('idle');
    setImportMessage('');
    setImportArticle(null);
    setImportProgress(0);
  }

  function openEbookImportDialog() {
    clearImportCloseTimer();
    clearEbookImportCloseTimer();
    setAddMenuOpen(false);
    setImportOpen(false);
    setEbookImportOpen(true);
    setEbookImportState('idle');
    setEbookImportMessage('');
    setEbookImportArticle(null);
    setEbookImportProgress(0);
    setEbookDragging(false);
  }

  function closeEbookImportDialog() {
    if (ebookImportState === 'submitting') return;
    clearEbookImportCloseTimer();
    setEbookImportOpen(false);
    setEbookDragging(false);
  }

  function closeImportDialog() {
    if (importState === 'submitting') return;
    clearImportCloseTimer();
    setImportOpen(false);
  }

  const importProgressPercent = Math.round(importProgress);
  const ebookImportProgressPercent = Math.round(ebookImportProgress);

  return (
    <section className="library-home">
      <header className="library-home-header">
        <div className="library-home-header-main">
          <div className="library-home-heading">
            <h2>阅读库</h2>
            <p>
              {articles.length} 项内容 · {stats.annotations} 条批注 · {stats.comments} 条讨论
            </p>
          </div>
          <div className="library-home-actions">
            <label className="library-search">
              <Search size={16} />
              <Input
                type="search"
                value={searchQuery}
                placeholder="搜索文章 / 作者 / 来源"
                aria-label="搜索文章、作者或来源"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <div
              className="library-add-control"
              onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setAddMenuOpen(false);
              }}
            >
              <Button
                aria-expanded={addMenuOpen}
                aria-haspopup="menu"
                aria-label="添加文章"
                className="library-add-trigger"
                type="button"
                variant="secondary"
                onClick={() => setAddMenuOpen((current) => !current)}
              >
                <Plus size={16} />
              </Button>
              {addMenuOpen ? (
                <div className="library-add-menu-popover" role="menu">
                  <button type="button" role="menuitem" onClick={openImportDialog}>
                    <Globe2 size={15} />
                    添加网页
                  </button>
                  <button type="button" role="menuitem" onClick={openEbookImportDialog}>
                    <BookText size={15} />
                    ePub 电子书
                  </button>
                </div>
              ) : null}
            </div>
            <Button type="button" variant="secondary" onClick={onRefresh}>
              <RefreshCcw size={16} />
              刷新
            </Button>
          </div>
        </div>
      </header>
      {importOpen ? (
        <div
          className="library-import-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-article-import-title"
        >
          <button
            className="library-import-modal-scrim"
            type="button"
            aria-label="关闭网页文章导入"
            onClick={closeImportDialog}
          />
          <form
            className={`library-import-dialog library-article-import-dialog is-${importState}`}
            onSubmit={submitImport}
          >
            <header>
              <div>
                <strong id="library-article-import-title">添加网页文章</strong>
                <span>{importMessage || '输入文章链接，解析完成后会保存到阅读库。'}</span>
              </div>
              <button type="button" aria-label="关闭网页文章导入" onClick={closeImportDialog}>
                <X size={17} />
              </button>
            </header>
            <div
              className={[
                'library-article-import-box',
                importState === 'submitting' ? 'is-submitting' : '',
                importState === 'imported' ? 'is-imported' : '',
                importState === 'duplicate' ? 'is-duplicate' : '',
                importState === 'error' ? 'is-error' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={[
                  'library-import-status-icon',
                  importState === 'imported' ? 'is-success' : '',
                  importState === 'duplicate' ? 'is-duplicate' : '',
                  importState === 'error' ? 'is-error' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {importState === 'submitting' ? (
                  <LoaderCircle className="is-spinning" size={22} />
                ) : importState === 'imported' ? (
                  <Check className="library-import-success-icon" size={24} />
                ) : importState === 'duplicate' ? (
                  <CircleAlert size={24} />
                ) : importState === 'error' ? (
                  <X size={24} />
                ) : (
                  <Globe2 size={24} />
                )}
              </span>
              <label className="library-article-import-url">
                <span>网页地址</span>
                <span className="library-article-import-input">
                  <Globe2 size={16} />
                  <textarea
                    aria-label="网页地址"
                    disabled={importState === 'submitting'}
                    inputMode="url"
                    placeholder="https://example.com/article"
                    rows={4}
                    value={importUrl}
                    wrap="soft"
                    onChange={(event) => {
                      setImportUrl(event.target.value);
                      if (importState !== 'submitting') {
                        clearImportCloseTimer();
                        setImportState('idle');
                        setImportMessage('');
                        setImportArticle(null);
                        setImportProgress(0);
                      }
                    }}
                  />
                </span>
              </label>
              <Button
                className="library-article-import-submit"
                disabled={importState === 'submitting'}
                type="submit"
              >
                {importState === 'submitting' ? (
                  <LoaderCircle className="is-spinning" size={16} />
                ) : (
                  <Globe2 size={16} />
                )}
                {importState === 'submitting' ? '解析中' : '解析添加'}
              </Button>
              {importState === 'idle' ? null : (
                <span
                  className="library-import-progress"
                  role="progressbar"
                  aria-label="网页文章导入进度"
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={importProgressPercent}
                  style={
                    {
                      '--library-import-progress': `${importProgressPercent}%`,
                    } as React.CSSProperties
                  }
                >
                  <span className="library-import-progress-track">
                    <span />
                  </span>
                  <em>{importProgressPercent}%</em>
                </span>
              )}
              {importState === 'duplicate' ? (
                <span className="library-article-duplicate-callout" role="status">
                  <CircleAlert size={16} />
                  <span>
                    <strong>已在阅读库中找到这篇文章</strong>
                    <em>无需重复导入，可以直接打开已有文章。</em>
                  </span>
                </span>
              ) : null}
            </div>
            <footer>
              <span>{importMessage || 'Yomitomo 会提取标题、来源、正文和可阅读内容。'}</span>
              {importArticle ? (
                <button
                  type="button"
                  onClick={() => {
                    clearImportCloseTimer();
                    setImportOpen(false);
                    onOpenArticle(importArticle);
                  }}
                >
                  <ExternalLink size={14} />
                  {importState === 'duplicate' ? '打开已有文章' : '打开文章'}
                </button>
              ) : null}
            </footer>
          </form>
        </div>
      ) : null}
      {ebookImportOpen ? (
        <div
          className="library-import-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-ebook-import-title"
        >
          <button
            className="library-import-modal-scrim"
            type="button"
            aria-label="关闭电子书导入"
            onClick={closeEbookImportDialog}
          />
          <section className={`library-import-dialog is-${ebookImportState}`}>
            <header>
              <div>
                <strong id="library-ebook-import-title">添加 ePub 电子书</strong>
                <span>{ebookImportMessage || '拖入一本 EPUB，或点击选择本地文件。'}</span>
              </div>
              <button type="button" aria-label="关闭电子书导入" onClick={closeEbookImportDialog}>
                <X size={17} />
              </button>
            </header>
            <label
              className={[
                'library-ebook-dropzone',
                ebookDragging ? 'is-dragging' : '',
                ebookImportState === 'submitting' ? 'is-submitting' : '',
                ebookImportState === 'imported' ? 'is-imported' : '',
                ebookImportState === 'error' ? 'is-error' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              htmlFor="library-ebook-file"
              onDragLeave={(event) => {
                event.preventDefault();
                setEbookDragging(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (ebookImportState !== 'submitting') setEbookDragging(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setEbookDragging(false);
                if (ebookImportState === 'submitting') return;
                void importEbook(event.dataTransfer.files[0]);
              }}
            >
              <input
                accept=".epub,application/epub+zip"
                disabled={ebookImportState === 'submitting'}
                id="library-ebook-file"
                ref={ebookInputRef}
                type="file"
                onChange={(event) => void importEbook(event.target.files?.[0])}
              />
              <span
                className={[
                  'library-ebook-dropzone-icon',
                  ebookImportState === 'imported' ? 'is-success' : '',
                  ebookImportState === 'error' ? 'is-error' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {ebookImportState === 'submitting' ? (
                  <LoaderCircle className="is-spinning" size={22} />
                ) : ebookImportState === 'imported' ? (
                  <Check className="library-import-success-icon" size={24} />
                ) : ebookImportState === 'error' ? (
                  <X size={24} />
                ) : ebookDragging ? (
                  <FileUp size={24} />
                ) : (
                  <Upload size={24} />
                )}
              </span>
              <span className="library-ebook-dropzone-copy">
                <strong>
                  {ebookImportState === 'imported'
                    ? '导入完成'
                    : ebookDragging
                      ? '松开开始解析'
                      : '拖入 EPUB，或点击选择'}
                </strong>
                <em>单次导入一本书 · EPUB · 最高 80MB</em>
              </span>
              {ebookImportState === 'idle' ? null : (
                <span
                  className="library-import-progress"
                  role="progressbar"
                  aria-label="电子书导入进度"
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={ebookImportProgressPercent}
                  style={
                    {
                      '--library-import-progress': `${ebookImportProgressPercent}%`,
                    } as React.CSSProperties
                  }
                >
                  <span className="library-import-progress-track">
                    <span />
                  </span>
                  <em>{ebookImportProgressPercent}%</em>
                </span>
              )}
            </label>
            <footer>
              <span>{ebookImportMessage || '解析完成后会提取标题、作者、封面和章节正文。'}</span>
              {ebookImportArticle ? (
                <button
                  type="button"
                  onClick={() => {
                    clearEbookImportCloseTimer();
                    setEbookImportOpen(false);
                    onOpenArticle(ebookImportArticle);
                  }}
                >
                  <ExternalLink size={14} />
                  {ebookImportState === 'duplicate' ? '打开已有电子书' : '打开电子书'}
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
      <div className="library-toolbar" aria-label="阅读库工具栏">
        <div className="library-filter-group" aria-label="阅读状态筛选">
          {LIBRARY_FILTER_OPTIONS.map((option) => (
            <button
              className={activeFilter === option.value ? 'is-active' : undefined}
              type="button"
              aria-pressed={activeFilter === option.value}
              key={option.value}
              onClick={() => setActiveFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Select value={activeSort} onValueChange={(value) => setActiveSort(value as LibrarySort)}>
          <SelectTrigger className="library-sort-trigger" aria-label="阅读库排序">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="theme-select-content">
            <SelectGroup>
              {LIBRARY_SORT_OPTIONS.map((option) => (
                <SelectItem value={option.value} key={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="library-home-body">
        {filteredArticles.length > 0 ? (
          <div className="library-card-scroll">
            {groupedPageArticles.map((group) => (
              <section className="library-card-group" key={group.label}>
                <h3 className="library-card-group-title">
                  {group.label} · {group.articles.length} 篇
                </h3>
                <div className="library-card-grid">
                  {group.articles.map((article) => (
                    <ArticleLibraryCard
                      article={article}
                      key={article.id}
                      onDelete={() => void onDeleteArticle(article.id)}
                      onOpen={() => onOpenArticle(article)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : articles.length > 0 ? (
          <section className="library-empty">
            <Search size={32} />
            <h3>暂无匹配文章</h3>
            <p>调整搜索词、阅读状态或排序后继续浏览。</p>
          </section>
        ) : (
          <section className="library-empty">
            <BookOpen size={32} />
            <h3>还没有同步文章</h3>
            <p>点击加号添加网页或 ePub 电子书，也可以通过浏览器阅读器同步文章。</p>
          </section>
        )}
      </div>
      {sortedArticles.length > 0 ? (
        <footer
          className={pageCount > 1 ? 'library-home-footer' : 'library-home-footer is-compact'}
        >
          <span>共 {filteredArticles.length} 项</span>
          {pageCount > 1 ? (
            <div className="library-pagination" aria-label="阅读库分页">
              <button
                type="button"
                aria-label="上一页"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              {pageNumbers.map((pageNumber) => (
                <button
                  className={pageNumber === page ? 'is-active' : undefined}
                  type="button"
                  aria-current={pageNumber === page ? 'page' : undefined}
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                aria-label="下一页"
                disabled={page === pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="library-page-size-trigger" aria-label="每页显示数量">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="theme-select-content">
              <SelectGroup>
                {LIBRARY_PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem value={String(option)} key={option}>
                    每页 {option} 项
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </footer>
      ) : null}
    </section>
  );
}

function ShelfTab({
  actionLabel,
  count,
  icon,
  label,
  variant,
  onClick,
}: {
  actionLabel: string;
  count?: number;
  icon: React.ReactNode;
  label: string;
  variant: 'library' | 'view';
  onClick: () => void;
}) {
  const className = [
    'library-shelf-tab',
    `is-${variant}-rail`,
    count === undefined ? 'is-title-only' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      aria-label={actionLabel}
      className={className}
      title={actionLabel}
      type="button"
      onClick={onClick}
    >
      <span className="library-shelf-tab-icon">{icon}</span>
      <span className="library-shelf-tab-label">{label}</span>
      {count === undefined ? null : <span className="library-shelf-tab-count">{count}</span>}
    </button>
  );
}

function ArticleLibraryCard({
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
  const comments = article.annotations.reduce(
    (count, annotation) => count + annotationThreadComments(annotation).length,
    0,
  );
  const isEbook = isEbookArticle(article);
  const status = libraryArticleStatus(article);
  const readingMinutes = articleReadingMinutes(article);
  const siteIconUrl = isEbook ? '' : articleSiteIconUrl(article);
  const authorLabel =
    article.byline ||
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
              {isEbook ? null : (
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
            {article.annotations.length} 批注
          </span>
          <span>
            <MessageSquareText size={13} />
            {comments} 讨论
          </span>
        </div>
        <span className="library-source-badge">{isEbookArticle(article) ? 'ePub' : '网页'}</span>
      </footer>
    </article>
  );
}
