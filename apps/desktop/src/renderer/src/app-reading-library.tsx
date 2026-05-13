import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookText,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileUp,
  Globe2,
  List,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  Agent,
  AgentReadingPlanItem,
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  ArticleReadingProgress,
  ArticleRecord,
  Comment as AnnotationComment,
  FocusCoReadingPlan,
  MessageSendShortcut,
  PublicAgent,
  QuestionStatus,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import {
  agentPersonalities,
  agentPersonalityName,
  createTextAnchor,
  makeId,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  resolveTextAnchor,
} from '@yomitomo/shared';
import {
  appendAnnotationComment,
  annotationColor,
  annotationPrimaryComment,
  annotationThreadComments,
  annotationIdsAtHighlightPoint,
  articleTitleTocItems,
  createEpubTextAnchor,
  extractTocItems,
  findMentionedAgents,
  findCurrentTocTarget,
  getArticleSelection,
  isRangeInsideArticle,
  offsetFromArticleStart,
  rangeFromOffsets,
  rangeHighlightBoxes,
  selectionActionPosition,
  sortAnnotations,
  sortArticles,
  createUserAnnotation,
  createUserComment,
  type ExtractTocOptions,
  type HighlightBox,
  type TocItem,
  updateAnnotationComment,
} from '@yomitomo/core';
import {
  buildTocAnnotationStats,
  clampNumber,
  defaultReaderSettings,
  useAgentAnnotationQueue,
  getShortcutModifier,
  ReaderAppView,
  buildReaderReadingSections,
  readerAnnotationScrollTop,
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
  ReaderSettingsPanel,
  type ActiveConnection,
  type HighlightChoice,
  type ReaderSettings,
  type SelectionAction,
} from '@yomitomo/reader-ui';
import { articleIdentityLine, articlePlainText, formatDate, urlHost } from './app-utils';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { OpenArticleButton } from './app-ui';
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

const ARTICLE_DELETE_HOLD_MS = 1400;
const MAX_EBOOK_IMPORT_BYTES = 80 * 1024 * 1024;
const LIBRARY_PAGE_SIZE_OPTIONS = [8, 12, 16, 24] as const;
const DESKTOP_READER_SETTINGS_KEY = 'yomitomo.desktop.readerSettings';

type LibraryFilter = 'all' | 'new' | 'progress' | 'done';
type LibrarySort = 'recentReading' | 'recentAdded' | 'annotations' | 'discussions';
type ArticleImportState = 'idle' | 'submitting' | 'imported' | 'duplicate' | 'error';
type ArticleImportResult = {
  status: 'imported' | 'duplicate';
  article: ArticleRecord;
};
type EbookImportProgressCallback = (progress: number) => void;
type PromptArticle = {
  title: string;
  url: string;
  byline?: string;
  text: string;
  ebookIndex?: NonNullable<ArticleRecord['ebook']>['index'];
  ebookMetadata?: NonNullable<ArticleRecord['ebook']>['metadata'];
};
type ArticleUpdater = (article: ArticleRecord) => ArticleRecord | null;

type FoliateTocSourceItem = {
  label?: unknown;
  href?: string;
  subitems?: FoliateTocSourceItem[];
};

type FoliateTocItem = {
  label: string;
  href: string;
  depth: number;
};

type FoliateSectionSource = {
  linear?: string;
};

type FoliatePageInfo = {
  sectionIndex: number;
  pageIndex: number;
  pageCount: number;
};

type FoliateContent = {
  doc?: Document;
};

type FoliateRelocateDetail = {
  fraction?: number;
  location?: {
    current?: number;
    total?: number;
  };
  section?: {
    current?: number;
  };
  tocItem?: {
    label?: unknown;
    href?: string;
  };
};

type FoliateViewElement = HTMLElement & {
  book?: {
    toc?: FoliateTocSourceItem[];
    dir?: string;
    sections?: FoliateSectionSource[];
  };
  renderer?:
    | (HTMLElement & {
        getContents?: () => FoliateContent[];
        setStyles?: (styles: string | string[]) => void;
      })
    | null;
  close?: () => void;
  getPageInfo?: () => FoliatePageInfo | null;
  getSectionFractions?: () => number[];
  goLeft: () => Promise<void>;
  goRight: () => Promise<void>;
  goTo: (target: string | number) => Promise<unknown>;
  goToFraction: (fraction: number) => Promise<void>;
  next: () => Promise<void>;
  open: (file: File | Blob | string) => Promise<void>;
  prev: () => Promise<void>;
};

const LIBRARY_FILTER_OPTIONS: Array<{ value: LibraryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'new', label: '新收录' },
  { value: 'progress', label: '进行中' },
  { value: 'done', label: '已读完' },
];

const LIBRARY_SORT_OPTIONS: Array<{ value: LibrarySort; label: string }> = [
  { value: 'recentAdded', label: '最近添加' },
  { value: 'recentReading', label: '最近阅读' },
  { value: 'annotations', label: '批注最多' },
  { value: 'discussions', label: '讨论最多' },
];

type SourceSelectionAction = SelectionAction;

function defaultTocOpen() {
  return typeof window !== 'undefined' && window.innerWidth > 1320;
}

function usesOverlayToc() {
  return typeof window !== 'undefined' && window.innerWidth <= 1320;
}

function buildAnnotationConnectionPath(startX: number, startY: number, endX: number, endY: number) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 1) {
    return `M ${formatPathNumber(startX)} ${formatPathNumber(startY)} L ${formatPathNumber(endX)} ${formatPathNumber(endY)}`;
  }

  const normalX = -deltaY / length;
  const normalY = deltaX / length;
  const segmentCount = Math.max(3, Math.min(6, Math.round(length / 74)));
  const amplitude = Math.min(18, Math.max(7, length * 0.035));
  const points = Array.from({ length: segmentCount + 1 }, (_, index) => {
    const progress = index / segmentCount;
    const endpoint = index === 0 || index === segmentCount;
    const direction = index % 2 === 0 ? -1 : 1;
    const offset = endpoint ? 0 : Math.sin(Math.PI * progress) * amplitude * direction;
    return {
      x: startX + deltaX * progress + normalX * offset,
      y: startY + deltaY * progress + normalY * offset,
    };
  });

  return smoothPathThroughPoints(points);
}

function smoothPathThroughPoints(points: Array<{ x: number; y: number }>) {
  const first = points[0]!;
  let path = `M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const afterNext = points[Math.min(points.length - 1, index + 2)]!;
    const control1X = current.x + (next.x - previous.x) / 6;
    const control1Y = current.y + (next.y - previous.y) / 6;
    const control2X = next.x - (afterNext.x - current.x) / 6;
    const control2Y = next.y - (afterNext.y - current.y) / 6;

    path += ` C ${formatPathNumber(control1X)} ${formatPathNumber(control1Y)}, ${formatPathNumber(control2X)} ${formatPathNumber(control2Y)}, ${formatPathNumber(next.x)} ${formatPathNumber(next.y)}`;
  }

  return path;
}

function formatPathNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function readDesktopReaderSettings(): ReaderSettings {
  if (typeof window === 'undefined') return defaultReaderSettings;

  try {
    const raw = window.localStorage.getItem(DESKTOP_READER_SETTINGS_KEY);
    if (!raw) return defaultReaderSettings;
    return normalizeDesktopReaderSettings(JSON.parse(raw) as Partial<ReaderSettings>);
  } catch {
    return defaultReaderSettings;
  }
}

function normalizeDesktopReaderSettings(settings: Partial<ReaderSettings> | undefined) {
  return {
    fontSize: clampNumber(settings?.fontSize, 16, 28, defaultReaderSettings.fontSize),
    contentWidth: clampNumber(
      settings?.contentWidth,
      680,
      1080,
      defaultReaderSettings.contentWidth,
    ),
  };
}

function writeDesktopReaderSettings(settings: ReaderSettings) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(DESKTOP_READER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
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
    const nextAnnotation = sortAnnotations(selectedArticle.annotations)[0] || null;
    setSelectedAnnotationId(nextAnnotation?.id || null);
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
    setSelectedAnnotationId(sortAnnotations(article.annotations)[0]?.id || null);
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
  const [ebookImportOpen, setEbookImportOpen] = useState(false);
  const [ebookImportState, setEbookImportState] = useState<ArticleImportState>('idle');
  const [ebookImportMessage, setEbookImportMessage] = useState('');
  const [ebookImportArticle, setEbookImportArticle] = useState<ArticleRecord | null>(null);
  const [ebookImportProgress, setEbookImportProgress] = useState(0);
  const [ebookDragging, setEbookDragging] = useState(false);
  const ebookInputRef = useRef<HTMLInputElement | null>(null);
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
  const groupedPageArticles = useMemo(() => groupLibraryArticles(pageArticles), [pageArticles]);
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
      clearEbookImportCloseTimer();
    },
    [],
  );

  useEffect(() => {
    if (ebookImportState !== 'submitting') return;

    const timer = window.setInterval(() => {
      setEbookImportProgress((current) => {
        if (current >= 94) return current;
        return Math.min(94, current + Math.max(0.8, (94 - current) * 0.08));
      });
    }, 180);

    return () => window.clearInterval(timer);
  }, [ebookImportState]);

  async function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = importUrl.trim();
    if (!url) {
      setImportState('error');
      setImportMessage('请输入网页地址');
      setImportArticle(null);
      return;
    }

    try {
      setImportState('submitting');
      setImportMessage('正在解析网页');
      setImportArticle(null);
      const result = await onImportArticleUrl(url);
      setImportArticle(result.article);
      if (result.status === 'duplicate') {
        setImportState('duplicate');
        setImportMessage('这篇文章已在阅读库');
        return;
      }

      setImportState('imported');
      setImportMessage('已添加到阅读库');
      setImportUrl('');
    } catch (error) {
      setImportState('error');
      setImportMessage(error instanceof Error ? error.message : '添加网页失败');
      setImportArticle(null);
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

  function openImportPanel() {
    setAddMenuOpen(false);
    setEbookImportOpen(false);
    setImportOpen(true);
    setImportState('idle');
    setImportMessage('');
    setImportArticle(null);
  }

  function openEbookImportDialog() {
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
                  <button type="button" role="menuitem" onClick={openImportPanel}>
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
        {importOpen ? (
          <form className={`library-import-panel is-${importState}`} onSubmit={submitImport}>
            <div className="library-import-copy">
              <strong>添加网页</strong>
              <span>
                {importMessage || '输入公开文章地址，Yomitomo 会解析正文和元数据并保存到阅读库。'}
              </span>
            </div>
            <div className="library-import-row">
              <label className="library-import-url">
                <Globe2 size={16} />
                <Input
                  aria-label="网页地址"
                  disabled={importState === 'submitting'}
                  inputMode="url"
                  placeholder="https://example.com/article"
                  type="text"
                  value={importUrl}
                  onChange={(event) => {
                    setImportUrl(event.target.value);
                    if (importState !== 'submitting') {
                      setImportState('idle');
                      setImportMessage('');
                      setImportArticle(null);
                    }
                  }}
                />
              </label>
              <Button
                className="library-import-submit"
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
              {importArticle ? (
                <button
                  className="library-import-open"
                  type="button"
                  onClick={() => onOpenArticle(importArticle)}
                >
                  <ExternalLink size={14} />
                  {importState === 'duplicate' ? '打开已有文章' : '打开文章'}
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </header>
      {ebookImportOpen ? (
        <div className="library-ebook-modal" role="dialog" aria-modal="true">
          <button
            className="library-ebook-modal-scrim"
            type="button"
            aria-label="关闭电子书导入"
            onClick={closeEbookImportDialog}
          />
          <section className={`library-ebook-dialog is-${ebookImportState}`}>
            <header>
              <div>
                <strong>添加 ePub 电子书</strong>
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
                  <Check className="library-ebook-success-icon" size={24} />
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
                  className="library-ebook-progress"
                  role="progressbar"
                  aria-label="电子书导入进度"
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={ebookImportProgressPercent}
                  style={
                    {
                      '--ebook-import-progress': `${ebookImportProgressPercent}%`,
                    } as React.CSSProperties
                  }
                >
                  <span className="library-ebook-progress-track">
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

function articleMatchesLibrarySearch(article: ArticleRecord, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalizedQuery) return true;

  return [
    article.title,
    article.byline,
    article.siteName,
    article.excerpt,
    article.ebook?.metadata.fileName,
    urlHost(article.canonicalUrl || article.url),
    article.canonicalUrl,
    article.url,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('zh-CN')
    .includes(normalizedQuery);
}

function articleMatchesLibraryFilter(article: ArticleRecord, filter: LibraryFilter) {
  const status = libraryArticleStatus(article);
  if (filter === 'new') return status.tone === 'new';
  if (filter === 'progress') return status.tone === 'progress';
  if (filter === 'done') return status.tone === 'done';
  return true;
}

function articleSiteIconUrl(article: ArticleRecord) {
  const iconUrl = safeLibraryImageUrl(article.siteIconUrl);
  if (iconUrl) return withFaviconThrowErrorParam(iconUrl);

  const host = articleHost(article);
  return host ? faviconServiceUrl(host) : '';
}

function articleHost(article: ArticleRecord) {
  try {
    const url = new URL(article.canonicalUrl || article.url);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function safeLibraryImageUrl(value: string | undefined) {
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function faviconServiceUrl(host: string) {
  const url = new URL(`https://favicon.im/${encodeURIComponent(host)}`);
  url.searchParams.set('throw-error-on-404', 'true');
  return url.href;
}

function withFaviconThrowErrorParam(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'favicon.im') return value;
    url.searchParams.set('throw-error-on-404', 'true');
    return url.href;
  } catch {
    return value;
  }
}

function compareLibraryArticles(left: ArticleRecord, right: ArticleRecord, sort: LibrarySort) {
  if (sort === 'recentAdded') {
    return (
      compareTimestampDesc(left.createdAt, right.createdAt) ||
      compareTimestampDesc(left.updatedAt, right.updatedAt) ||
      left.title.localeCompare(right.title, 'zh-CN')
    );
  }

  if (sort === 'annotations') {
    return (
      right.annotations.length - left.annotations.length ||
      compareTimestampDesc(left.updatedAt, right.updatedAt) ||
      left.title.localeCompare(right.title, 'zh-CN')
    );
  }

  if (sort === 'discussions') {
    return (
      articleCommentCount(right) - articleCommentCount(left) ||
      compareTimestampDesc(left.updatedAt, right.updatedAt) ||
      left.title.localeCompare(right.title, 'zh-CN')
    );
  }

  return (
    compareTimestampDesc(left.updatedAt, right.updatedAt) ||
    compareTimestampDesc(left.createdAt, right.createdAt) ||
    left.title.localeCompare(right.title, 'zh-CN')
  );
}

function groupLibraryArticles(articles: ArticleRecord[]) {
  const groups = new Map<string, ArticleRecord[]>();
  for (const article of articles) {
    const label = formatLibraryDateGroup(article.createdAt);
    groups.set(label, [...(groups.get(label) || []), article]);
  }
  return Array.from(groups, ([label, groupArticles]) => ({ label, articles: groupArticles }));
}

function libraryArticleStatus(article: ArticleRecord) {
  if (article.annotations.length === 0) return { label: '新收录', tone: 'new' };
  if (articleReadingWorkflowDone(article)) return { label: '已读完', tone: 'done' };
  return { label: '进行中', tone: 'progress' };
}

function articleReadingWorkflowDone(article: ArticleRecord) {
  const deliberation = article.readingDeliberation;
  const card = article.readingCard;
  const review = card?.review;

  return Boolean(
    article.annotations.length > 0 &&
    deliberation &&
    card &&
    review &&
    review.reviewerResults.length > 0 &&
    review.reviewerResults.every((result) => result.status !== 'error') &&
    timestampValue(card.updatedAt) >= timestampValue(deliberation.updatedAt) &&
    timestampValue(review.updatedAt) >= timestampValue(card.updatedAt),
  );
}

function articleCommentCount(article: ArticleRecord) {
  return article.annotations.reduce(
    (count, annotation) => count + annotationThreadComments(annotation).length,
    0,
  );
}

function articleReadingMinutes(article: ArticleRecord) {
  const text =
    (typeof document === 'undefined' ? article.excerpt : articlePlainText(article)) ||
    article.title;
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const wordCount = text
    .replace(/[\u3400-\u9fff]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(cjkCount / 450 + wordCount / 220));
}

function formatLibraryDateGroup(value: string) {
  const days = localDayDistance(value);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return '本周早些时候';
  return '更早';
}

function formatLibraryRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);

  const time = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  const days = localDayDistance(value);
  if (days <= 0) return `今天 ${time}`;
  if (days === 1) return `昨天 ${time}`;
  if (days < 7) return `${weekdayLabel(date)} ${time}`;
  return formatDate(value);
}

function weekdayLabel(date: Date) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()] || '';
}

function localDayDistance(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.floor((todayStart - dateStart) / 86_400_000);
}

function compareTimestampDesc(
  left: string | number | undefined,
  right: string | number | undefined,
) {
  return timestampValue(right) - timestampValue(left);
}

function timestampValue(value: string | number | undefined) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

const sourceTocOptions: ExtractTocOptions = {
  headingSelector:
    '.reader-article-body h1, .reader-article-body h2, .reader-article-body h3, .reader-article-body h4',
  inferredSelector:
    '.reader-article-body p, .reader-article-body div, .reader-article-body section',
};

const sourceReaderTocStyles = `
@media(min-width:1321px){
  .source-reader-shell .reader-app.has-toc.is-toc-open .reader-main{
    grid-template-columns:minmax(180px,260px) minmax(0,1fr);
  }
  .source-reader-shell .reader-app.has-toc .reader-surface{
    padding:18px 14px 64px;
  }
  .source-reader-shell .reader-app.has-toc.is-toc-open .reader-canvas{
    margin:0;
  }
}
.reader-app.has-toc.is-toc-open .reader-toc{
  margin:18px 0 18px 18px;
  padding:14px;
  border:1px solid rgba(150,123,84,.28);
  border-radius:8px;
  background:rgba(255,253,248,.72);
}
.reader-toc-title{
  margin:0 0 10px;
  color:#746d63;
  font-size:11px;
  font-weight:900;
  letter-spacing:.12em;
  text-transform:none;
}
.reader-toc-item{
  display:grid;
  width:100%;
  margin:0;
  border:0;
  border-radius:8px;
  background:transparent;
  color:#746d63;
  font-size:12px;
  font-weight:820;
  line-height:1.3;
  padding:9px 8px;
}
.reader-toc-item:hover{
  background:rgba(245,239,226,.9);
  color:#28231d;
}
.reader-toc-item-main{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
}
.reader-toc-item-main>span:first-child{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.reader-toc-summary{
  margin-top:12px;
  border-radius:8px;
}
@media(max-width:1320px){
  .reader-app.has-toc.is-toc-open .reader-toc{
    margin:0;
    border-radius:0;
  }
}
`;

function promptArticle(currentArticle: ArticleRecord | null, articleText: string): PromptArticle {
  return {
    title: currentArticle?.title || '',
    url: currentArticle?.canonicalUrl || currentArticle?.url || '',
    byline: currentArticle?.byline,
    text: articleText,
    ebookIndex: currentArticle?.ebook?.index,
    ebookMetadata: currentArticle?.ebook?.metadata,
  };
}

function articleWithAnnotations(article: ArticleRecord, annotations: Annotation[]) {
  return {
    ...article,
    annotations: sortAnnotations(annotations),
    updatedAt: new Date().toISOString(),
  };
}

type SourceBookcaseProps = {
  agents: Agent[];
  annotations: Annotation[];
  article: ArticleRecord | null;
  focusAnnotationId: string | null;
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  selectedAnnotationId: string | null;
  userProfile: UserProfile;
  onFocusedAnnotation: () => void;
  onClose: () => void;
  onOpenAnnotation: (annotationId: string | null) => void;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  onSaveArticleReadingProgress: (
    articleId: string,
    progress: ArticleReadingProgress,
  ) => Promise<void> | void;
  onUpdateArticle: (articleId: string, update: ArticleUpdater) => Promise<void> | void;
};

function SourceBookcase(props: SourceBookcaseProps) {
  if (!props.article) {
    return (
      <section className="source-bookcase is-empty">
        <div className="source-empty">选择一篇文章查看原文</div>
      </section>
    );
  }

  if (isEbookArticle(props.article)) {
    return (
      <EbookBookcase
        article={props.article}
        onClose={props.onClose}
        onSaveArticleReadingProgress={props.onSaveArticleReadingProgress}
      />
    );
  }

  return <WebSourceBookcase {...props} />;
}

function WebSourceBookcase({
  agents,
  annotations: articleAnnotations,
  article,
  focusAnnotationId,
  messageSendShortcut,
  selectionActionShortcuts,
  selectedAnnotationId,
  userProfile,
  onFocusedAnnotation,
  onClose,
  onOpenAnnotation,
  onSaveArticle,
  onUpdateArticle,
}: SourceBookcaseProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const [annotations, setLocalAnnotations] = useState<Annotation[]>(() =>
    sortAnnotations(articleAnnotations),
  );
  const latestArticleRef = useRef<ArticleRecord | null>(article);
  const annotationsRef = useRef<Annotation[]>(annotations);
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);
  const [temporaryBoxes, setTemporaryBoxes] = useState<HighlightBox[]>([]);
  const [activeConnection, setActiveConnection] = useState<ActiveConnection | null>(null);
  const [highlightChoice, setHighlightChoice] = useState<HighlightChoice | null>(null);
  const [selectionAction, setSelectionAction] = useState<SourceSelectionAction | null>(null);
  const [composer, setComposer] = useState<SourceSelectionAction | null>(null);
  const [agentAnnotateOpen, setAgentAnnotateOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(() => defaultTocOpen());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commentsCloseKey, setCommentsCloseKey] = useState(0);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() =>
    readDesktopReaderSettings(),
  );
  const [replyRequest, setReplyRequest] = useState<{ annotationId: string; key: number } | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState('');
  const annotationAgents = useMemo(() => publicAnnotationAgents(agents), [agents]);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const contentHtml = useMemo(() => (article ? sourceArticleBodyHtml(article) : ''), [article]);
  const tocStats = useMemo(
    () => buildTocAnnotationStats(tocItems, annotations, userProfile, annotationAgents),
    [annotationAgents, annotations, tocItems, userProfile],
  );
  const readingSections = useMemo(
    () =>
      articleRef.current && article
        ? buildReaderReadingSections(articleRef.current, tocItems, article.title)
        : [],
    [article, tocItems],
  );
  const annotationTotals = useMemo(
    () => ({
      annotations: annotations.length,
      comments: annotations.reduce(
        (count, annotation) => count + annotationThreadComments(annotation).length,
        0,
      ),
    }),
    [annotations],
  );
  const {
    agentDockCompleting,
    agentDockItems,
    agentTheaterBoxes,
    annotatingAgents: annotatingAgentIds,
    completionBurstKey,
    virtualCursors,
    cleanupVirtualReadingSessions,
    enqueueAgentAnnotation,
    finishVirtualReading,
    finishVirtualReadingIfIdle,
    markAgentAnnotating,
    markVirtualReadingDone,
    processAgentAnnotationQueue,
    startVirtualReading,
  } = useAgentAnnotationQueue({
    agents: annotationAgents,
    articleRef,
    canvasRef,
    surfaceRef: scrollRef,
    articleBodySelector: '.reader-article-body',
    annotationsRef,
    saveAnnotations,
    setActiveId: openAnnotation,
    readerLog: () => {},
  });
  useEffect(() => {
    latestArticleRef.current = article;
  }, [article]);

  useEffect(() => {
    const nextAnnotations = sortAnnotations(articleAnnotations);
    setLocalAnnotations(nextAnnotations);
    annotationsRef.current = nextAnnotations;
  }, [article?.id, articleAnnotations]);

  useEffect(() => cleanupVirtualReadingSessions, []);

  useEffect(() => {
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    if (!article || !articleElement || !canvasElement) {
      setBoxes([]);
      setTocItems([]);
      return;
    }

    let frame = 0;
    const updateBoxes = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const text = articleElement.textContent || '';
        const canvasRect = canvasElement.getBoundingClientRect();
        const extractedTocItems = extractTocItems(articleElement, sourceTocOptions);
        const nextTocItems =
          extractedTocItems.length > 0
            ? extractedTocItems
            : articleTitleTocItems(articleElement, article.title);
        const nextBoxes = annotations.flatMap((annotation) => {
          const position = resolveTextAnchor(text, annotation.anchor);
          if (!position) return [];
          const range = rangeFromOffsets(articleElement, position.start, position.end);
          if (!range) return [];
          return rangeHighlightBoxes(range, canvasRect, annotation.id).map((box) =>
            Object.assign(box, {
              annotationId: annotation.id,
              contributorId:
                annotation.agentId ||
                annotation.agentUsername ||
                annotation.userId ||
                annotation.userUsername ||
                annotation.author,
              color: annotationColor(annotation, userProfile, annotationAgents),
            }),
          );
        });
        setTocItems(nextTocItems);
        setBoxes(nextBoxes);
      });
    };

    updateBoxes();
    const resizeObserver = new ResizeObserver(updateBoxes);
    resizeObserver.observe(articleElement);
    resizeObserver.observe(canvasElement);
    window.addEventListener('resize', updateBoxes);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBoxes);
    };
  }, [annotationAgents, annotations, article, contentHtml, userProfile]);

  useEffect(() => {
    setHighlightChoice(null);
    setSelectionAction(null);
    setComposer(null);
    setTemporaryBoxes([]);
  }, [article?.id, annotations]);

  useEffect(() => {
    setNotesOpen(false);
    setTocOpen(defaultTocOpen());
    setSettingsOpen(false);
    setAgentAnnotateOpen(false);
    setReplyRequest(null);
    setStatusMessage('');
  }, [article?.id]);

  const recalculateActiveConnection = useCallback(() => {
    if (!selectedAnnotationId) {
      setActiveConnection(null);
      return;
    }

    const canvasElement = canvasRef.current;
    const scrollElement = scrollRef.current;
    const noteElement = noteRefs.current.get(selectedAnnotationId);
    const annotation = annotations.find((item) => item.id === selectedAnnotationId);
    const activeBoxes = boxes.filter((box) => box.annotationId === selectedAnnotationId);
    const readerElement = canvasElement?.closest('.reader-app');
    if (
      !canvasElement ||
      !scrollElement ||
      !noteElement ||
      !annotation ||
      !readerElement ||
      activeBoxes.length === 0
    ) {
      setActiveConnection(null);
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const readerRect = readerElement.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    const noteRect = noteElement.getBoundingClientRect();
    const noteY = noteRect.top - readerRect.top + Math.min(72, noteRect.height / 2);
    const box = activeBoxes.toSorted((left, right) => {
      const leftY = canvasRect.top - readerRect.top + left.top + left.height / 2;
      const rightY = canvasRect.top - readerRect.top + right.top + right.height / 2;
      return Math.abs(leftY - noteY) - Math.abs(rightY - noteY);
    })[0];
    if (!box) {
      setActiveConnection(null);
      return;
    }

    const startX = canvasRect.left - readerRect.left + box.left + box.width + 6;
    const startY = canvasRect.top - readerRect.top + box.top + box.height / 2;
    const endX = noteRect.left - readerRect.left - 8;
    const endY = noteY;
    const highlightViewportY = readerRect.top + startY;
    const highlightVisible =
      highlightViewportY >= scrollRect.top - 24 && highlightViewportY <= scrollRect.bottom + 24;
    const noteVisible =
      noteRect.bottom >= scrollRect.top + 24 && noteRect.top <= scrollRect.bottom - 24;
    if (!highlightVisible || !noteVisible) {
      setActiveConnection(null);
      return;
    }

    const path = buildAnnotationConnectionPath(startX, startY, endX, endY);
    const color = annotationColor(annotation, userProfile, annotationAgents);
    setActiveConnection((current) =>
      current?.path === path && current.color === color ? current : { path, color },
    );
  }, [annotationAgents, annotations, boxes, selectedAnnotationId, userProfile]);

  useLayoutEffect(() => {
    recalculateActiveConnection();
  }, [annotations, boxes, recalculateActiveConnection]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(recalculateActiveConnection);
    };

    scrollElement?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      scrollElement?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [recalculateActiveConnection]);

  const scrollToAnnotation = useCallback(
    (annotationId: string) => {
      const scrollElement = scrollRef.current;
      const canvasElement = canvasRef.current;
      if (!scrollElement || !canvasElement) return false;

      const top = readerAnnotationScrollTop({
        annotationId,
        boxes,
        canvasOffsetTop: canvasElement.offsetTop,
        scrollHeight: scrollElement.scrollHeight,
        viewportHeight: scrollElement.clientHeight,
      });
      if (top === null) return false;

      scrollElement.scrollTo({ top, behavior: 'smooth' });
      return true;
    },
    [boxes],
  );

  useEffect(() => {
    if (!focusAnnotationId) return;
    if (!annotations.some((annotation) => annotation.id === focusAnnotationId)) {
      onFocusedAnnotation();
      return;
    }
    if (scrollToAnnotation(focusAnnotationId)) onFocusedAnnotation();
  }, [annotations, focusAnnotationId, onFocusedAnnotation, scrollToAnnotation]);

  function openAnnotation(annotationId: string) {
    setHighlightChoice(null);
    setSelectionAction(null);
    setComposer(null);
    setTemporaryBoxes([]);
    onOpenAnnotation(annotationId);
  }

  async function saveAnnotations(nextAnnotations: Annotation[]) {
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return;
    const nextArticle = articleWithAnnotations(currentArticle, nextAnnotations);
    const sortedAnnotations = nextArticle.annotations;
    latestArticleRef.current = nextArticle;
    annotationsRef.current = sortedAnnotations;
    setLocalAnnotations(sortedAnnotations);
    await onSaveArticle(nextArticle);
  }

  function applyAnnotations(nextAnnotations: Annotation[]) {
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return null;
    const sortedAnnotations = sortAnnotations(nextAnnotations);
    const nextArticle = {
      ...currentArticle,
      annotations: sortedAnnotations,
      updatedAt: new Date().toISOString(),
    };
    latestArticleRef.current = nextArticle;
    annotationsRef.current = sortedAnnotations;
    setLocalAnnotations(sortedAnnotations);
    return nextArticle;
  }

  function currentArticleText() {
    return articleRef.current?.textContent || '';
  }

  function isCurrentArticle(articleId: string) {
    return latestArticleRef.current?.id === articleId;
  }

  function handleArticleMouseUp() {
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    if (!articleElement || !canvasElement) return;

    const selection = getArticleSelection(articleElement);
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectionAction(null);
      setTemporaryBoxes([]);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!isRangeInsideArticle(range, articleElement)) return;
    const articleText = currentArticleText();
    const start = offsetFromArticleStart(articleElement, range.startContainer, range.startOffset);
    const end = offsetFromArticleStart(articleElement, range.endContainer, range.endOffset);
    const anchor = article.ebook?.index
      ? createEpubTextAnchor(article.ebook.index, articleText, start, end)
      : createTextAnchor(articleText, start, end);
    if (!anchor.exact.trim()) return;

    const rects = range.getClientRects();
    const lastRect = rects[rects.length - 1];
    if (!lastRect) return;

    const canvasRect = canvasElement.getBoundingClientRect();
    const position = selectionActionPosition(lastRect, canvasRect);
    setSelectionAction({ x: position.x, y: position.y, anchor });
    setComposer(null);
    setTemporaryBoxes(
      rangeHighlightBoxes(range, canvasRect, 'source-selection').map((box) =>
        Object.assign(box, {
          annotationId: '__selection__',
          contributorId: userProfile.id,
          color: userProfile.annotationColor,
        }),
      ),
    );
    selection.removeAllRanges();
  }

  function cancelComposer() {
    setComposer(null);
    setSelectionAction(null);
    setTemporaryBoxes([]);
  }

  async function copySelection(action: SourceSelectionAction) {
    await navigator.clipboard.writeText(action.anchor.exact);
    setSelectionAction(null);
    setTemporaryBoxes([]);
  }

  async function createAnnotation(note: string) {
    if (!composer) return;
    const currentComposer = composer;
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return;
    const articleContext = promptArticle(currentArticle, currentArticleText());

    const mentionedAgents = findMentionedAgents(note, annotationAgents);
    if (mentionedAgents.length > 0) {
      cancelComposer();
      const instructions = await resolveAgentMentionInstructions(
        note,
        mentionedAgents,
        currentComposer.anchor,
        currentArticle.id,
        articleContext,
      );
      for (const item of instructions) {
        void requestAgentAnnotations(item.agent, {
          readingIntent: item.readingIntent,
          instruction: item.instruction,
          targetAnchor: currentComposer.anchor,
          article: articleContext,
          articleId: currentArticle.id,
        });
      }
      return;
    }

    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, note);
    await saveAnnotations([...currentArticle.annotations, annotation]);
    openAnnotation(annotation.id);
    void inferAnnotationMetadataForAnnotation(currentArticle.id, annotation, articleContext);
  }

  async function resolveAgentMentionInstructions(
    note: string,
    mentionedAgents: PublicAgent[],
    anchor: Annotation['anchor'],
    articleId: string,
    articleContext: PromptArticle,
  ) {
    const commonInstruction = agentInstructionFromNote(note, mentionedAgents) || undefined;
    const baseInstructions = mentionedAgents.map((agent) => ({
      agent,
      instruction: commonInstruction,
      readingIntent: undefined as AgentReadingIntent | undefined,
    }));
    const desktop = window.yomitomoDesktop;
    if (!desktop) return baseInstructions;

    try {
      if (isCurrentArticle(articleId)) setStatusMessage('正在拆解助手任务');
      const instructions = await desktop.planAgentMentionInstructions({
        article: articleContext,
        targetAnchor: anchor,
        agents: mentionedAgents,
        note,
      });
      if (isCurrentArticle(articleId)) setStatusMessage('');
      return mentionedAgents.map((agent) => {
        const instruction = instructions.find(
          (item) => item.agentId === agent.id || item.agentUsername === agent.username,
        );
        return {
          agent,
          instruction: instruction?.instruction || commonInstruction,
          readingIntent: instruction?.readingIntent,
        };
      });
    } catch (error) {
      if (isCurrentArticle(articleId)) {
        setStatusMessage(error instanceof Error ? error.message : '助手任务拆解失败');
        window.setTimeout(() => setStatusMessage(''), 1800);
      }
      return baseInstructions;
    }
  }

  async function inferAnnotationMetadataForAnnotation(
    articleId: string,
    annotation: Annotation,
    articleContext: PromptArticle,
  ) {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;
    try {
      const metadata = await desktop.inferAnnotationMetadata({
        article: articleContext,
        anchor: annotation.anchor,
        note: annotationPrimaryComment(annotation)?.content || '',
      });
      await onUpdateArticle(articleId, (targetArticle) => {
        let found = false;
        const nextAnnotations = targetArticle.annotations.map((item) => {
          if (item.id !== annotation.id) return item;
          found = true;
          const primaryCommentId = annotationPrimaryComment(item)?.id;
          return {
            ...item,
            annotationType: metadata.annotationType,
            readingIntent: metadata.readingIntent,
            comments: item.comments.map((comment) =>
              comment.id === primaryCommentId
                ? { ...comment, readingIntent: metadata.readingIntent }
                : comment,
            ),
            updatedAt: new Date().toISOString(),
          };
        });
        return found ? articleWithAnnotations(targetArticle, nextAnnotations) : null;
      });
    } catch (error) {
      if (!isCurrentArticle(articleId)) return;
      setStatusMessage(error instanceof Error ? error.message : '批注标签生成失败');
      window.setTimeout(() => setStatusMessage(''), 1800);
    }
  }

  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    await onUpdateArticle(articleId, (targetArticle) =>
      articleWithAnnotations(targetArticle, [...targetArticle.annotations, annotation]),
    );
  }

  async function addComment(annotationId: string, content: string) {
    const trimmed = content.trim();
    const currentArticle = latestArticleRef.current;
    if (!trimmed || !currentArticle) return;
    const userComment = createUserComment(userProfile, trimmed);
    const isFollowUpQuestion = /[?？]/.test(trimmed);
    const comment = isFollowUpQuestion
      ? { ...userComment, questionStatus: 'open' as const }
      : userComment;
    const currentAnnotations = isFollowUpQuestion
      ? currentArticle.annotations
      : currentArticle.annotations.map((annotation) =>
          annotation.id !== annotationId
            ? annotation
            : Object.assign({}, annotation, {
                questionStatus:
                  annotation.questionStatus === 'open' ||
                  (annotation.annotationType === 'question' && !annotation.questionStatus)
                    ? 'answered'
                    : annotation.questionStatus,
                comments: annotation.comments.map((item) =>
                  item.questionStatus === 'open' ||
                  (!item.questionStatus && /[?？]/.test(item.content))
                    ? { ...item, questionStatus: 'answered' as const }
                    : item,
                ),
              }),
        );
    const nextAnnotations = appendAnnotationComment(
      currentAnnotations,
      annotationId,
      comment,
      userComment.createdAt,
    );
    const nextAnnotation = nextAnnotations?.find((annotation) => annotation.id === annotationId);
    if (!nextAnnotations || !nextAnnotation) return;

    await saveAnnotations(nextAnnotations);
    openAnnotation(annotationId);

    const mentionedAgents = findMentionedAgents(trimmed, annotationAgents);
    for (const agent of mentionedAgents) {
      void requestAgentComment(agent, nextAnnotation, comment);
    }
  }

  async function setAnnotationQuestionStatus(annotationId: string, status: QuestionStatus) {
    const now = new Date().toISOString();
    const nextAnnotations = annotationsRef.current.map((annotation) =>
      annotation.id === annotationId
        ? { ...annotation, questionStatus: status, updatedAt: now }
        : annotation,
    );
    await saveAnnotations(nextAnnotations);
    openAnnotation(annotationId);
  }

  async function setCommentQuestionStatus(
    annotationId: string,
    commentId: string,
    status: QuestionStatus,
  ) {
    const now = new Date().toISOString();
    const nextAnnotations = annotationsRef.current.map((annotation) =>
      annotation.id === annotationId
        ? {
            ...annotation,
            updatedAt: now,
            comments: annotation.comments.map((comment) =>
              comment.id === commentId ? { ...comment, questionStatus: status } : comment,
            ),
          }
        : annotation,
    );
    await saveAnnotations(nextAnnotations);
    openAnnotation(annotationId);
  }

  function focusQuestionAnnotation(annotationId: string) {
    setNotesOpen(false);
    openAnnotation(annotationId);
    scrollToAnnotation(annotationId);
  }

  function answerQuestion(annotationId: string) {
    focusQuestionAnnotation(annotationId);
    setReplyRequest({ annotationId, key: Date.now() });
  }

  async function deleteAnnotation(annotationId: string) {
    const nextAnnotations = annotationsRef.current.filter(
      (annotation) => annotation.id !== annotationId,
    );
    noteRefs.current.delete(annotationId);
    await saveAnnotations(nextAnnotations);
  }

  async function requestAgentComment(
    agent: PublicAgent,
    annotation: Annotation,
    userComment: AnnotationComment,
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    if (!desktop || !currentArticle) return;

    setStatusMessage(`${agent.nickname} 正在回复`);
    let pendingCommentId = '';
    let pendingDelta = '';
    let pendingFrame = 0;
    const flushDelta = () => {
      pendingFrame = 0;
      if (!pendingDelta || !pendingCommentId) return;
      const delta = pendingDelta;
      pendingDelta = '';
      const nextAnnotations = updateAnnotationComment(
        annotationsRef.current,
        annotation.id,
        pendingCommentId,
        (comment) => Object.assign({}, comment, { content: comment.content + delta }),
      );
      if (nextAnnotations) applyAnnotations(nextAnnotations);
    };
    const scheduleDeltaFlush = () => {
      if (pendingFrame) return;
      pendingFrame = window.requestAnimationFrame(flushDelta);
    };
    try {
      await desktop.requestAgentCommentStream(
        {
          agentId: agent.id,
          agentUsername: agent.username,
          readingIntent: annotation.readingIntent || userComment.readingIntent,
          article: promptArticle(currentArticle, currentArticleText()),
          annotation,
          userComment,
        },
        (event) => {
          if (event.type === 'start') {
            pendingCommentId = event.comment.id;
            const nextAnnotations = appendAnnotationComment(
              annotationsRef.current,
              annotation.id,
              event.comment,
              event.comment.createdAt,
            );
            if (nextAnnotations) applyAnnotations(nextAnnotations);
            return;
          }

          pendingDelta += event.delta;
          scheduleDeltaFlush();
        },
      );
      if (pendingFrame) {
        window.cancelAnimationFrame(pendingFrame);
        flushDelta();
      }
      const current = annotationsRef.current.find((item) => item.id === annotation.id);
      const agentComment = current?.comments.find(
        (comment) =>
          comment.author === 'ai' &&
          comment.agentId === agent.id &&
          comment.id === pendingCommentId &&
          comment.pending,
      );
      if (agentComment) {
        const nextAnnotations = updateAnnotationComment(
          annotationsRef.current,
          annotation.id,
          agentComment.id,
          (comment) => Object.assign({}, comment, { pending: false }),
        );
        if (nextAnnotations) await saveAnnotations(nextAnnotations);
      }
    } finally {
      if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
      setStatusMessage('');
    }
  }

  function constrainAgentPlanAnnotation(
    annotation: Annotation,
    readingPlan: AgentReadingPlanItem[] | undefined,
    articleText = currentArticleText(),
  ) {
    if (!readingPlan?.length) return annotation;

    const position = resolveTextAnchor(articleText, annotation.anchor);
    if (!position) return null;

    const planItem = readingPlan.find(
      (item) => position.start >= item.sectionStart && position.end <= item.sectionEnd,
    );
    if (!planItem) return null;
    if (!planItem.readingIntent) return annotation;
    if (annotation.readingIntent === planItem.readingIntent) return annotation;

    return {
      ...annotation,
      readingIntent: planItem.readingIntent,
      comments: annotation.comments.map((comment) => ({
        ...comment,
        readingIntent: comment.readingIntent || planItem.readingIntent,
      })),
    };
  }

  async function saveFocusCoReadingPlan(plan: FocusCoReadingPlan) {
    await onUpdateArticle(plan.articleId, (targetArticle) => {
      const nextArticle = {
        ...targetArticle,
        focusCoReadingPlan: plan,
        updatedAt: new Date().toISOString(),
      };
      if (isCurrentArticle(plan.articleId)) latestArticleRef.current = nextArticle;
      return nextArticle;
    });
  }

  async function planFocusCoReading(selectedAgentIds: string[]) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    if (!desktop || !currentArticle) throw new Error('无法规划聚焦共读');

    setStatusMessage('正在规划聚焦共读');
    try {
      const route = await desktop.planFocusCoReadingRoute({
        selectedAgentIds,
        sections: readingSections.map((section) => ({
          sectionId: section.id,
          sectionTitle: section.title,
          sectionStart: section.start,
          sectionEnd: section.end,
        })),
        chapterSummaries: currentArticle.focusCoReadingPlan?.sections.flatMap((section) =>
          section.summary || section.tag
            ? [
                {
                  sectionId: section.sectionId,
                  summary: section.summary,
                  tag: section.tag,
                },
              ]
            : [],
        ),
        article: promptArticle(currentArticle, currentArticleText()),
      });
      const now = new Date().toISOString();
      const routeBySection = new Map(route.sections.map((section) => [section.sectionId, section]));
      const previousSections = new Map(
        currentArticle.focusCoReadingPlan?.sections.map((section) => [section.sectionId, section]),
      );
      const sections = readingSections.flatMap((section) => {
        const routed = routeBySection.get(section.id);
        const previous = previousSections.get(section.id);
        const agentIds = (routed?.agentIds || []).filter((agentId) =>
          selectedAgentIds.includes(agentId),
        );
        const messages = previous?.messages || [];
        if (agentIds.length === 0 && messages.length === 0 && !routed?.summary && !routed?.tag) {
          return [];
        }
        return [
          {
            sectionId: section.id,
            sectionTitle: section.title,
            sectionStart: section.start,
            sectionEnd: section.end,
            summary: routed?.summary,
            tag: routed?.tag,
            targetDensity: routed?.targetDensity,
            needsFurtherPlanning: routed?.needsFurtherPlanning,
            agentIds,
            messages,
          },
        ];
      });
      const plan: FocusCoReadingPlan = {
        id: currentArticle.focusCoReadingPlan?.id || makeId('focus_co_reading'),
        articleId: currentArticle.id,
        selectedAgentIds,
        sections,
        createdAt: currentArticle.focusCoReadingPlan?.createdAt || now,
        updatedAt: now,
      };
      await saveFocusCoReadingPlan(plan);
      return plan;
    } finally {
      setStatusMessage('');
    }
  }

  async function requestAgentAnnotations(
    agent: PublicAgent,
    options: {
      annotationType?: AnnotationType;
      readingIntent?: AgentReadingIntent;
      instruction?: string;
      targetAnchor?: Annotation['anchor'];
      readingPlan?: AgentReadingPlanItem[];
      article?: PromptArticle;
      articleId?: string;
    } = {},
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    const articleId = options.articleId || currentArticle?.id;
    const articleContext =
      options.article ||
      (currentArticle ? promptArticle(currentArticle, currentArticleText()) : null);
    if (!desktop || !articleId || !articleContext) return;
    const articleScopedWrite = Boolean(options.articleId);
    if (!articleScopedWrite && annotatingAgentIds.includes(agent.id)) return;
    const visibleArticle = isCurrentArticle(articleId);
    const showProgress = !articleScopedWrite || visibleArticle;

    if (showProgress) {
      markAgentAnnotating(agent.id, true);
      setStatusMessage(`${agent.nickname} 正在批注`);
    }
    const readingPlan =
      options.readingPlan || targetAnchorReadingPlan(options.targetAnchor, options.readingIntent);
    if (showProgress) {
      startVirtualReading(
        agent,
        readingPlan,
        options.targetAnchor ? 'target' : readingPlan.length > 0 ? 'careful' : 'article',
      );
    }
    let annotationCount = 0;
    try {
      await desktop.requestAgentAnnotationsStream(
        {
          agentId: agent.id,
          agentUsername: agent.username,
          annotationType: options.annotationType,
          readingIntent: options.readingIntent,
          instruction: options.instruction,
          annotations: options.targetAnchor ? annotationsRef.current : undefined,
          targetAnchor: options.targetAnchor,
          readingPlan: options.readingPlan,
          article: articleContext,
        },
        (event) => {
          if (event.type !== 'item') return;
          const annotation = constrainAgentPlanAnnotation(
            event.annotation,
            options.readingPlan,
            articleScopedWrite ? articleContext.text : currentArticleText(),
          );
          if (!annotation) return;
          annotationCount += 1;
          if (articleScopedWrite) {
            void appendAgentAnnotationToArticle(articleId, annotation);
            return;
          }
          if (!isCurrentArticle(articleId)) return;
          enqueueAgentAnnotation(annotation);
          void processAgentAnnotationQueue();
        },
      );
      if (showProgress && isCurrentArticle(articleId)) markVirtualReadingDone(agent.id);
      if (annotationCount === 0) {
        if (showProgress && isCurrentArticle(articleId)) {
          finishVirtualReading(agent.id, '没有批注');
          setStatusMessage(`${agent.nickname} 暂无新批注`);
          window.setTimeout(() => setStatusMessage(''), 1400);
        }
        return;
      }
      if (showProgress && isCurrentArticle(articleId)) finishVirtualReadingIfIdle(agent.id);
    } finally {
      if (showProgress) {
        markAgentAnnotating(agent.id, false);
        setStatusMessage((message) => (message.includes('暂无新批注') ? message : ''));
      }
    }
  }

  function handleHighlightClick(
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    visibleAnnotationIds: string[],
  ) {
    const canvasElement = canvasRef.current;
    if (!canvasElement) {
      openAnnotation(annotationId);
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const annotationIds =
      visibleAnnotationIds.length > 0
        ? visibleAnnotationIds
        : annotationIdsAtHighlightPoint(
            boxes,
            {
              x: event.clientX - canvasRect.left,
              y: event.clientY - canvasRect.top,
            },
            1,
          );

    if (annotationIds.length <= 1) {
      openAnnotation(annotationIds[0] || annotationId);
      return;
    }

    const x = event.clientX - canvasRect.left + 8;
    setHighlightChoice({
      x: Math.max(8, Math.min(Math.max(8, canvasRect.width - 236), x)),
      y: Math.max(8, event.clientY - canvasRect.top + 8),
      annotationIds,
    });
  }

  function scrollToTocItem(item: TocItem) {
    if (usesOverlayToc()) setTocOpen(false);
    const articleElement = articleRef.current;
    const scrollElement = scrollRef.current;
    if (!articleElement || !scrollElement) return;
    if (item.index < 0) {
      scrollElement.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const target = findCurrentTocTarget(articleElement, item, sourceTocOptions);
    if (!target) return;
    const targetRect = target.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    scrollElement.scrollTo({
      top: Math.max(0, scrollElement.scrollTop + targetRect.top - scrollRect.top - 18),
      behavior: 'smooth',
    });
  }

  function updateReaderSettings(nextSettings: ReaderSettings) {
    const normalizedSettings = normalizeDesktopReaderSettings(nextSettings);
    setReaderSettings(normalizedSettings);
    writeDesktopReaderSettings(normalizedSettings);
  }

  if (!article) {
    return (
      <section className="source-bookcase is-empty">
        <div className="source-empty">选择一篇文章查看原文</div>
      </section>
    );
  }

  const readerArticle = {
    title: article.title,
    byline: articleIdentityLine(article),
    excerpt: statusMessage,
    content: contentHtml,
  };
  const shortcutModifier = getShortcutModifier();
  const sendShortcut = normalizeMessageSendShortcut(messageSendShortcut);
  const actionShortcuts = useMemo(
    () => normalizeSelectionActionShortcuts(selectionActionShortcuts),
    [selectionActionShortcuts],
  );

  return (
    <section className="source-bookcase source-reader-shell">
      <style>
        {`${readerStyles}\n${readerConversationStyles}\n${readerDesktopEmbeddedStyles}\n${sourceReaderTocStyles}`}
      </style>
      <ReaderAppView
        activeConnection={activeConnection}
        activeId={selectedAnnotationId}
        agentAnnotateOpen={agentAnnotateOpen}
        agentDockCompleting={agentDockCompleting}
        agentDockItems={agentDockItems}
        agentTheaterBoxes={agentTheaterBoxes}
        agents={annotationAgents}
        annotatingAgents={annotatingAgentIds}
        annotationTotals={annotationTotals}
        annotations={annotations}
        articleId={article.id}
        articleRef={articleRef}
        boxes={boxes}
        canvasRef={canvasRef}
        commentsCloseKey={commentsCloseKey}
        composer={composer}
        completionBurstKey={completionBurstKey}
        embedded
        extracted={readerArticle}
        filteredAnnotations={annotations}
        focusCoReadingPlan={article.focusCoReadingPlan}
        highlightChoice={highlightChoice}
        notesOpen={notesOpen}
        noteRefs={noteRefs}
        notesRef={railRef}
        readerSettings={readerSettings}
        readingSections={readingSections}
        replyRequest={replyRequest}
        selectionAction={selectionAction}
        settingsOpen={settingsOpen}
        messageSendShortcut={sendShortcut}
        selectionActionShortcuts={actionShortcuts}
        shortcutModifier={shortcutModifier}
        surfaceRef={scrollRef}
        temporaryBoxes={temporaryBoxes}
        toolbarArticleAction={
          <>
            <span className="reader-toolbar-current-view">当前：原文阅读</span>
            <OpenArticleButton article={article} iconOnly />
          </>
        }
        tocAnnotationStats={tocStats}
        tocItems={tocItems}
        tocOpen={tocOpen}
        userProfile={userProfile}
        virtualCursors={virtualCursors}
        onAddComment={addComment}
        onAnnotationLayoutChange={recalculateActiveConnection}
        onAnswerQuestion={answerQuestion}
        onCancelAgentAnnotateMenu={() => setAgentAnnotateOpen(false)}
        onCancelComposer={cancelComposer}
        onClearActiveAnnotation={() => onOpenAnnotation(null)}
        onClose={onClose}
        onCloseFloatingPanels={() => {
          setSettingsOpen(false);
          setAgentAnnotateOpen(false);
        }}
        onCloseHighlightChoice={() => setHighlightChoice(null)}
        onCloseResponsivePanels={() => {
          setTocOpen(false);
          setNotesOpen(false);
        }}
        onCopySelection={copySelection}
        onCreateAnnotation={createAnnotation}
        onDeleteAnnotation={deleteAnnotation}
        onFocusAnnotation={openAnnotation}
        onHighlightClick={handleHighlightClick}
        onMouseUp={handleArticleMouseUp}
        onOpenComposer={(action) => {
          const canvasWidth = canvasRef.current?.clientWidth || 360;
          setCommentsCloseKey((key) => key + 1);
          setComposer({
            x: Math.min(action.x, Math.max(4, canvasWidth - 364)),
            y: action.y,
            anchor: action.anchor,
          });
          setSelectionAction(null);
        }}
        onPlanFocusCoReading={planFocusCoReading}
        onSaveFocusCoReadingPlan={saveFocusCoReadingPlan}
        onScrollToHeading={scrollToTocItem}
        onScrollToHighlight={(annotationId) => {
          openAnnotation(annotationId);
          scrollToAnnotation(annotationId);
        }}
        onSetAnnotationQuestionStatus={setAnnotationQuestionStatus}
        onSetCommentQuestionStatus={setCommentQuestionStatus}
        onStartAgentReadingPlan={(agent, readingPlan) => {
          setAgentAnnotateOpen(false);
          void requestAgentAnnotations(agent, { readingPlan });
        }}
        onToggleAgentAnnotate={() => {
          setSettingsOpen(false);
          setAgentAnnotateOpen((open) => !open);
        }}
        onToggleNotes={() => {
          if (!notesOpen) setCommentsCloseKey((key) => key + 1);
          setNotesOpen((open) => !open);
        }}
        onToggleSettings={() => {
          setAgentAnnotateOpen(false);
          setSettingsOpen((open) => !open);
        }}
        onToggleToc={() => setTocOpen((open) => !open)}
        onUpdateReaderSettings={updateReaderSettings}
      />
    </section>
  );
}

function EbookBookcase({
  article,
  onClose,
  onSaveArticleReadingProgress,
}: {
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> };
  onClose: () => void;
  onSaveArticleReadingProgress: (
    articleId: string,
    progress: ArticleReadingProgress,
  ) => Promise<void> | void;
}) {
  const viewHostRef = useRef<HTMLDivElement | null>(null);
  const measureHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<FoliateViewElement | null>(null);
  const ebookFileRef = useRef<File | null>(null);
  const onSaveArticleReadingProgressRef = useRef(onSaveArticleReadingProgress);
  const [tocOpen, setTocOpen] = useState(() => defaultTocOpen());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() =>
    readDesktopReaderSettings(),
  );
  const readerSettingsRef = useRef<ReaderSettings>(readerSettings);
  const [tocItems, setTocItems] = useState<FoliateTocItem[]>([]);
  const [sectionFractions, setSectionFractions] = useState<number[]>([]);
  const [activeTocHref, setActiveTocHref] = useState('');
  const [pageInfo, setPageInfo] = useState<FoliatePageInfo | null>(null);
  const [sectionPageCounts, setSectionPageCounts] = useState<Array<number | null>>([]);
  const [paginationLayoutKey, setPaginationLayoutKey] = useState('');
  const [progress, setProgress] = useState(() => article.readingProgress?.progress ?? 0);
  const [readerState, setReaderState] = useState<{
    status: 'loading' | 'ready' | 'error';
    message: string;
  }>({ status: 'loading', message: '正在打开 EPUB。' });

  useEffect(() => {
    onSaveArticleReadingProgressRef.current = onSaveArticleReadingProgress;
  }, [onSaveArticleReadingProgress]);

  useLayoutEffect(() => {
    setSettingsOpen(false);
    setTocOpen(defaultTocOpen());
    setTocItems([]);
    setSectionFractions([]);
    setActiveTocHref('');
    setPageInfo(null);
    setSectionPageCounts([]);
    setPaginationLayoutKey('');
    setProgress(article.readingProgress?.progress ?? 0);
    setReaderState({ status: 'loading', message: '正在打开 EPUB。' });
  }, [article.id]);

  useEffect(() => {
    readerSettingsRef.current = readerSettings;
    configureFoliateView(viewRef.current, readerSettings);
  }, [readerSettings]);

  useEffect(() => {
    const host = viewHostRef.current;
    if (!host) return;

    let cancelled = false;
    let view: FoliateViewElement | null = null;

    const handleRelocate = (event: Event) => {
      const detail = (event as CustomEvent<FoliateRelocateDetail>).detail;
      const nextProgress = clampNumber(detail.fraction, 0, 1, 0);
      const pageIndex = Math.max(0, detail.location?.current ?? Math.round(nextProgress * 1000));
      const pageCount = Math.max(1, detail.location?.total ?? 1000);
      const nextPageInfo =
        (event.currentTarget as FoliateViewElement | null)?.getPageInfo?.() ?? null;

      setProgress(nextProgress);
      setActiveTocHref(detail.tocItem?.href ?? '');
      setPageInfo(nextPageInfo);
      if (nextPageInfo) {
        setSectionPageCounts((counts) => updateKnownSectionPageCount(counts, nextPageInfo));
      }
      void onSaveArticleReadingProgressRef.current(article.id, {
        pageIndex,
        pageCount,
        chapterIndex: detail.section?.current,
        progress: nextProgress,
        updatedAt: new Date().toISOString(),
      });
    };

    const handleExternalLink = (event: Event) => {
      const customEvent = event as CustomEvent<Record<string, string | undefined>>;
      const href = customEvent.detail['href_'] || customEvent.detail.href;
      if (!href) return;
      event.preventDefault();
      void window.yomitomoDesktop.openUrl(href);
    };

    async function openEbook() {
      try {
        await import('./vendor/foliate-js/view.js');
        const data = await window.yomitomoDesktop.readEbookFile(article.id);
        if (cancelled) return;

        const file = new File([data], article.ebook.metadata.fileName || `${article.title}.epub`, {
          type: 'application/epub+zip',
        });
        ebookFileRef.current = file;
        view = document.createElement('foliate-view') as FoliateViewElement;
        view.className = 'ebook-foliate-view';
        view.addEventListener('relocate', handleRelocate);
        view.addEventListener('external-link', handleExternalLink);
        host.replaceChildren(view);
        await view.open(file);
        if (cancelled) return;

        viewRef.current = view;
        configureFoliateView(view, readerSettingsRef.current);
        setTocItems(flattenFoliateToc(view.book?.toc ?? []));
        setSectionFractions(view.getSectionFractions?.() ?? []);
        setReaderState({ status: 'ready', message: '' });

        const restoredProgress = article.readingProgress?.progress;
        if (typeof restoredProgress === 'number' && restoredProgress > 0) {
          await view.goToFraction(Math.min(1, restoredProgress));
        } else {
          await view.next();
        }
      } catch (error) {
        if (cancelled) return;
        setReaderState({
          status: 'error',
          message: error instanceof Error ? error.message : 'EPUB 打开失败',
        });
      }
    }

    void openEbook();

    return () => {
      cancelled = true;
      view?.removeEventListener('relocate', handleRelocate);
      view?.removeEventListener('external-link', handleExternalLink);
      closeFoliateView(view);
      view?.remove();
      if (viewRef.current === view) viewRef.current = null;
      if (viewRef.current === null) ebookFileRef.current = null;
      host.replaceChildren();
    };
  }, [article.id, article.ebook.metadata.fileName, article.title]);

  useLayoutEffect(() => {
    const host = viewHostRef.current;
    if (!host) return;

    const updateLayoutKey = () => {
      const rect = host.getBoundingClientRect();
      setPaginationLayoutKey(`${Math.round(rect.width)}x${Math.round(rect.height)}`);
    };

    updateLayoutKey();
    const observer = new ResizeObserver(updateLayoutKey);
    observer.observe(host);
    return () => observer.disconnect();
  }, [article.id]);

  useEffect(() => {
    const measureHost = measureHostRef.current;
    const sourceFile = ebookFileRef.current;
    const visibleView = viewRef.current;
    const sections = visibleView?.book?.sections ?? [];
    const [layoutWidth, layoutHeight] = paginationLayoutKey.split('x').map(Number);
    if (
      readerState.status !== 'ready' ||
      !measureHost ||
      !sourceFile ||
      sections.length === 0 ||
      !layoutWidth ||
      !layoutHeight
    ) {
      return;
    }

    let cancelled = false;
    let measureView: FoliateViewElement | null = null;
    const counts: Array<number | null> = sections.map((section) =>
      section.linear === 'no' ? 0 : null,
    );
    const currentPageInfo = visibleView.getPageInfo?.();
    setPageInfo(currentPageInfo ?? null);
    setSectionPageCounts(
      currentPageInfo ? updateKnownSectionPageCount(counts, currentPageInfo) : counts,
    );

    const timer = window.setTimeout(() => {
      void measureEbookPages();
    }, 360);

    async function measureEbookPages() {
      try {
        await waitForFoliateIdle();
        if (cancelled) return;

        await import('./vendor/foliate-js/view.js');
        measureView = document.createElement('foliate-view') as FoliateViewElement;
        measureView.className = 'ebook-foliate-view';
        measureHost.replaceChildren(measureView);
        await measureView.open(sourceFile);
        configureFoliateView(measureView, readerSettingsRef.current);

        for (const [index, section] of sections.entries()) {
          if (cancelled) return;
          if (section.linear === 'no') continue;

          await waitForFoliateIdle();
          if (cancelled) return;

          await measureView.goTo(index);
          const nextPageInfo = await waitForFoliatePageInfo(measureView, index);
          if (cancelled) return;

          counts[index] = Math.max(1, nextPageInfo?.pageCount ?? 1);
        }

        if (!cancelled) setSectionPageCounts(counts);
      } catch (error) {
        console.warn(error);
      } finally {
        closeFoliateView(measureView);
        measureView?.remove();
        if (measureHost.firstChild === measureView) measureHost.replaceChildren();
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      closeFoliateView(measureView);
      measureView?.remove();
      if (measureHost.firstChild === measureView) measureHost.replaceChildren();
    };
  }, [
    article.id,
    paginationLayoutKey,
    readerSettings.contentWidth,
    readerSettings.fontSize,
    readerState.status,
  ]);

  function goLeft() {
    void viewRef.current?.goLeft();
  }

  function goRight() {
    void viewRef.current?.goRight();
  }

  function goToTocItem(item: FoliateTocItem) {
    if (usesOverlayToc()) setTocOpen(false);
    void viewRef.current?.goTo(item.href);
  }

  function goToProgress(event: React.ChangeEvent<HTMLInputElement>) {
    const nextProgress = clampNumber(Number(event.currentTarget.value), 0, 1, progress);
    setProgress(nextProgress);
    void viewRef.current?.goToFraction(nextProgress);
  }

  function updateEbookReaderSettings(nextSettings: ReaderSettings) {
    const normalizedSettings = normalizeDesktopReaderSettings(nextSettings);
    setReaderSettings(normalizedSettings);
    writeDesktopReaderSettings(normalizedSettings);
  }

  function handleReaderKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      goRight();
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      goLeft();
    }
  }

  const progressPercent = Math.round(progress * 100);
  const paginationReady = isEbookPaginationReady(pageInfo, sectionPageCounts);
  const pageLabel = paginationReady ? formatEbookPageLabel(pageInfo, sectionPageCounts) : '';
  const progressTickId = `ebook-progress-ticks-${article.id}`;

  return (
    <section className="source-bookcase ebook-reader-shell">
      <style>{readerStyles}</style>
      <header className="ebook-reader-toolbar">
        <div className="ebook-reader-title">
          <strong>{article.title}</strong>
          <span>{article.byline || article.ebook.metadata.fileName}</span>
        </div>
        <div className="ebook-reader-actions">
          <button
            className={tocOpen ? 'ebook-icon-button is-active' : 'ebook-icon-button'}
            type="button"
            aria-label="切换目录"
            aria-pressed={tocOpen}
            onClick={() => setTocOpen((open) => !open)}
          >
            <List size={17} />
          </button>
          <button
            className={settingsOpen ? 'ebook-icon-button is-active' : 'ebook-icon-button'}
            type="button"
            aria-label="阅读设置"
            aria-pressed={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings2 size={17} />
          </button>
          <button
            className="ebook-close-button"
            type="button"
            onClick={onClose}
            aria-label="关闭阅读器"
          >
            <X size={17} />
          </button>
        </div>
        {settingsOpen ? (
          <ReaderSettingsPanel
            panelProps={
              {
                className: 'reader-settings-panel ebook-reader-settings-panel',
              } as React.HTMLAttributes<HTMLDivElement>
            }
            settings={readerSettings}
            onChange={updateEbookReaderSettings}
          />
        ) : null}
      </header>
      <div className={tocOpen ? 'ebook-reader-layout is-toc-open' : 'ebook-reader-layout'}>
        <button
          className="ebook-responsive-scrim"
          type="button"
          aria-label="关闭目录"
          onClick={() => setTocOpen(false)}
        />
        <aside className="ebook-reader-toc" aria-hidden={!tocOpen} aria-label="电子书目录">
          <div className="ebook-reader-toc-title">目录</div>
          {tocItems.map((item) => (
            <button
              className={activeTocHref === item.href ? 'is-active' : undefined}
              data-depth={Math.min(item.depth, 4)}
              type="button"
              key={`${item.depth}-${item.href}-${item.label}`}
              onClick={() => goToTocItem(item)}
            >
              <span>{item.label}</span>
            </button>
          ))}
          {tocItems.length === 0 ? (
            <p className="ebook-reader-toc-empty">这本书没有目录。</p>
          ) : null}
        </aside>
        <main
          className="ebook-reader-main"
          style={
            { '--ebook-content-width': `${readerSettings.contentWidth}px` } as React.CSSProperties
          }
        >
          <div
            className="ebook-page-control-row"
            style={
              { '--ebook-content-width': `${readerSettings.contentWidth}px` } as React.CSSProperties
            }
          >
            <div
              className={
                paginationReady
                  ? 'ebook-page-control-actions'
                  : 'ebook-page-control-actions is-paginating'
              }
            >
              <button
                className="ebook-icon-button"
                type="button"
                aria-label="上一页"
                disabled={readerState.status !== 'ready' || !paginationReady}
                onClick={goLeft}
              >
                <ChevronLeft size={17} />
              </button>
              <span className="ebook-location-label">{pageLabel}</span>
              <button
                className="ebook-icon-button"
                type="button"
                aria-label="下一页"
                disabled={readerState.status !== 'ready' || !paginationReady}
                onClick={goRight}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
          <div
            className={`ebook-page-stage is-${readerState.status}`}
            tabIndex={0}
            onKeyDown={handleReaderKeyDown}
            style={
              {
                '--ebook-font-size': `${readerSettings.fontSize}px`,
                '--ebook-content-width': `${readerSettings.contentWidth}px`,
              } as React.CSSProperties
            }
          >
            <div className="ebook-foliate-frame" ref={viewHostRef} />
            {readerState.status !== 'ready' ? (
              <div className="ebook-reader-status" role="status">
                {readerState.message}
              </div>
            ) : null}
            <div className="ebook-foliate-measurer" ref={measureHostRef} aria-hidden="true" />
          </div>
          <div className="ebook-reader-progress">
            <input
              aria-label="快速跳转阅读进度"
              className="ebook-progress-slider"
              disabled={readerState.status !== 'ready'}
              list={sectionFractions.length > 0 ? progressTickId : undefined}
              max="1"
              min="0"
              step="any"
              style={{ '--ebook-progress-percent': `${progressPercent}%` } as React.CSSProperties}
              type="range"
              value={progress}
              onChange={goToProgress}
            />
            {sectionFractions.length > 0 ? (
              <datalist id={progressTickId}>
                {sectionFractions.map((fraction, index) => (
                  <option value={fraction} key={`${index}-${fraction}`} />
                ))}
              </datalist>
            ) : null}
          </div>
        </main>
      </div>
    </section>
  );
}

function configureFoliateView(view: FoliateViewElement | null, settings: ReaderSettings) {
  if (!view?.renderer) return;
  view.renderer.setAttribute('animated', '');
  view.renderer.setAttribute('flow', 'paginated');
  view.renderer.setAttribute('gap', '8%');
  view.renderer.setAttribute('margin', '44px');
  view.renderer.setAttribute('max-inline-size', `${settings.contentWidth}px`);
  view.renderer.setAttribute('max-block-size', '1200px');
  view.renderer.setAttribute('max-column-count', '1');
  view.renderer.setStyles?.(foliateReaderCss(settings));
}

function closeFoliateView(view: FoliateViewElement | null) {
  try {
    view?.close?.();
  } catch (error) {
    console.warn(error);
  }
}

function foliateReaderCss(settings: ReaderSettings) {
  return `
    @namespace epub "http://www.idpf.org/2007/ops";

    html {
      color-scheme: light;
      font-size: ${settings.fontSize}px;
    }

    body {
      overflow-wrap: break-word;
    }

    p, li, blockquote, dd {
      line-height: 1.4;
      hanging-punctuation: allow-end last;
      widows: 2;
    }

    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    [align="justify"] { text-align: justify; }

    img, svg, video {
      max-width: 100%;
      height: auto;
    }

    pre {
      white-space: pre-wrap !important;
    }

    a {
      color: inherit;
      text-decoration-color: rgba(40, 35, 29, .36);
      text-underline-offset: .16em;
    }

    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
      display: none;
    }
  `;
}

function updateKnownSectionPageCount(
  counts: Array<number | null>,
  pageInfo: FoliatePageInfo,
): Array<number | null> {
  if (counts.length <= pageInfo.sectionIndex) return counts;
  const pageCount = Math.max(1, pageInfo.pageCount);
  if (counts[pageInfo.sectionIndex] === pageCount) return counts;

  const nextCounts = [...counts];
  nextCounts[pageInfo.sectionIndex] = pageCount;
  return nextCounts;
}

function isEbookPaginationReady(
  pageInfo: FoliatePageInfo | null,
  counts: Array<number | null>,
): pageInfo is FoliatePageInfo {
  return Boolean(
    pageInfo && counts.length > pageInfo.sectionIndex && counts.every((count) => count !== null),
  );
}

function formatEbookPageLabel(pageInfo: FoliatePageInfo, counts: Array<number | null>) {
  if (counts.length <= pageInfo.sectionIndex) return '';

  const precedingCounts = counts.slice(0, pageInfo.sectionIndex);
  if (precedingCounts.some((count) => count === null)) return '';

  const currentSectionPageCount = counts[pageInfo.sectionIndex] ?? pageInfo.pageCount;
  const currentPage =
    sumKnownPageCounts(precedingCounts) +
    Math.min(pageInfo.pageIndex, Math.max(0, currentSectionPageCount - 1)) +
    1;
  if (counts.some((count) => count === null)) return '';

  return `${currentPage} / ${sumKnownPageCounts(counts)}`;
}

function sumKnownPageCounts(counts: Array<number | null>) {
  return counts.reduce((sum, count) => sum + (count ?? 0), 0);
}

function waitForFoliateIdle() {
  return new Promise<void>((resolve) => {
    const idleWindow = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      };
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(() => resolve(), { timeout: 250 });
      return;
    }

    window.setTimeout(resolve, 16);
  });
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function waitForTimeout(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForFoliatePageInfo(view: FoliateViewElement, sectionIndex?: number) {
  await waitForFoliateAssets(view);

  let pageInfo: FoliatePageInfo | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await waitForAnimationFrame();
    pageInfo = view.getPageInfo?.() ?? null;
    if (pageInfo && (sectionIndex === undefined || pageInfo.sectionIndex === sectionIndex)) {
      return pageInfo;
    }
  }
  return sectionIndex === undefined || pageInfo?.sectionIndex === sectionIndex ? pageInfo : null;
}

async function waitForFoliateAssets(view: FoliateViewElement) {
  const doc = view.renderer?.getContents?.()[0]?.doc;
  if (!doc) return;

  await Promise.race([doc.fonts.ready.then(() => undefined), waitForTimeout(800)]).catch(() => {
    return undefined;
  });

  const pendingImages = Array.from(doc.images).filter((image) => !image.complete);
  if (pendingImages.length === 0) return;

  await Promise.race([
    Promise.allSettled(pendingImages.map(waitForImage)).then(() => undefined),
    waitForTimeout(800),
  ]);
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete) return Promise.resolve();
  return image.decode().catch(() => undefined);
}

function flattenFoliateToc(items: FoliateTocSourceItem[], depth = 1): FoliateTocItem[] {
  return items.flatMap((item) => {
    const label = foliateLabelText(item.label);
    const current =
      item.href && label
        ? [
            {
              label,
              href: item.href,
              depth,
            },
          ]
        : [];
    return [...current, ...flattenFoliateToc(item.subitems ?? [], depth + 1)];
  });
}

function foliateLabelText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const first = Object.values(value as Record<string, unknown>)[0];
  return typeof first === 'string' ? first : '';
}

function isEbookArticle(
  article: ArticleRecord | null,
): article is ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> } {
  return article?.sourceType === 'ebook' && Boolean(article.ebook?.chapters.length);
}

function publicAnnotationAgents(agents: Agent[]): PublicAgent[] {
  return agents
    .filter((agent) => agent.kind === 'annotation' && agent.enabled)
    .map((agent) => {
      const personality = agentPersonalities.find(
        (item) => item.id === agent.presetId || item.soul === agent.soul,
      );
      return {
        id: agent.id,
        kind: agent.kind,
        enabled: agent.enabled,
        presetId: agent.presetId,
        nickname: agent.nickname,
        username: agent.username,
        avatar: agent.avatar,
        annotationColor: agent.annotationColor,
        annotationDensity: agent.annotationDensity,
        personalityName: agentPersonalityName(agent),
        pinyin: personality?.pinyin,
        temperature: agent.temperature,
      };
    });
}

function targetAnchorReadingPlan(
  anchor: Annotation['anchor'] | undefined,
  readingIntent: AgentReadingIntent | undefined,
): AgentReadingPlanItem[] {
  if (!anchor || !readingIntent) return [];
  return [
    {
      sectionId: 'target-selection',
      sectionTitle: '选区',
      sectionStart: anchor.start,
      sectionEnd: anchor.end,
      readingIntent,
    },
  ];
}

function agentInstructionFromNote(note: string, mentionedAgents: PublicAgent[]) {
  let instruction = note.trim();
  for (const agent of mentionedAgents) {
    const handles = [agent.username, agent.nickname].filter(Boolean);
    for (const handle of handles) {
      instruction = instruction.replace(
        new RegExp(`(^|\\s)@${escapeRegExp(handle)}(?=[\\s，。,.!?！？、;；:]|$)`, 'gu'),
        ' ',
      );
    }
  }
  return instruction.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sourceArticleBodyHtml(article: ArticleRecord) {
  const container = document.createElement('div');
  container.innerHTML =
    article.contentHtml || `<p>${escapeHtml(article.excerpt || '暂无原文内容')}</p>`;
  container.querySelectorAll('script, style, link, iframe, object, embed').forEach((element) => {
    element.remove();
  });
  container.querySelectorAll<HTMLElement>('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trimStart().slice(0, 32).toLowerCase();
      if (
        name.startsWith('on') ||
        ((name === 'href' || name === 'src') && value.startsWith('javascript:'))
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return container.innerHTML;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
