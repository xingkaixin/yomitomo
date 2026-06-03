import React, { useEffect, useRef, useState } from 'react';
import {
  BookText,
  Check,
  CircleAlert,
  ExternalLink,
  FileText,
  FileUp,
  Globe2,
  LoaderCircle,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import type { ArticleRecord } from '@yomitomo/shared';
import { clampNumber } from '@yomitomo/reader-ui/reader-settings';
import { Button } from '../components/ui/button';
import type {
  EbookImportProgressCallback,
  PdfImportProgressCallback,
} from '../shell/app-reading-types';

const MAX_EBOOK_IMPORT_BYTES = 80 * 1024 * 1024;
const MAX_PDF_IMPORT_BYTES = 120 * 1024 * 1024;
const MAX_BATCH_IMPORT_FILES = 10;
const ARTICLE_IMPORT_CANCEL_DELAY_MS = 650;
const ARTICLE_IMPORT_CLOSE_DELAY_MS = 1200;
const FILE_IMPORT_CLOSE_DELAY_MS = 1800;
const EBOOK_IMPORT_CELEBRATION_CLOSE_DELAY_MS = 3200;
const EBOOK_IMPORT_CELEBRATION_MAX_VISIBLE = 7;
type ArticleImportState = 'idle' | 'submitting' | 'imported' | 'duplicate' | 'error';
export type ArticleImportResult =
  | { status: 'canceled' }
  | { status: 'imported' | 'duplicate'; article: ArticleRecord };

type FileImportProgressCallback = (progress: number) => void;
type FileImportItemStatus = 'pending' | 'importing' | 'imported' | 'duplicate' | 'error';
type FileImportItem = {
  id: string;
  fileName: string;
  progress: number;
  status: FileImportItemStatus;
  article?: ArticleRecord;
  message?: string;
};

type ImportedBookCelebrationItem = {
  id: string;
  title: string;
  coverUrl?: string;
  position: number;
  lift: number;
  order: number;
};

type FileImportDialogConfig = {
  kind: 'ebook' | 'pdf';
  titleId: string;
  title: string;
  closeLabel: string;
  idleMessage: string;
  batchIdleMessage: string;
  accept: string;
  inputId: string;
  isValidFileName: (name: string) => boolean;
  maxBytes: number;
  maxFileCount: number;
  invalidFileMessage: string;
  oversizeMessage: string;
  tooManyFilesMessage: string;
  duplicateMessage: string;
  errorFallbackMessage: string;
  idleDropTitle: string;
  draggingDropTitle: string;
  importedDropTitle: string;
  dropHint: string;
  footerHint: string;
  progressLabel: string;
  openDuplicateLabel: string;
  onImportFile: (
    file: File,
    onProgress?: FileImportProgressCallback,
  ) => Promise<ArticleImportResult>;
};

function advanceImportProgress(current: number) {
  if (current >= 94) return current;
  return Math.min(94, current + Math.max(0.8, (94 - current) * 0.08));
}

function articleImportErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : '';
  if (/网页地址/.test(message)) return message;
  return 'Error';
}

function fileImportItemId(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified || 0}-${index}`;
}

function fileImportErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : '';
  return message || fallback;
}

function articleImportMeta(article: ArticleRecord) {
  if (article.byline) return article.byline;
  if (article.sourceType === 'pdf') {
    const pageCount = article.pdf?.metadata.pageCount;
    return pageCount ? `${pageCount} 页` : article.pdf?.metadata.fileName;
  }
  return article.ebook?.metadata.fileName || article.siteName || '';
}

function articleImportRequestId(requestId: number) {
  return `article-import-${requestId}`;
}

function coverPlaceholderTitle(title: string) {
  const compactTitle = title.trim();
  return compactTitle.length > 4 ? `${compactTitle.slice(0, 4)}...` : compactTitle;
}

function fileImportItemStateLabel(item: FileImportItem) {
  if (item.status === 'pending') return '等待';
  if (item.status === 'importing') return `${Math.round(item.progress)}%`;
  if (item.status === 'duplicate') return '已存在';
  if (item.status === 'error') return '失败';
  return '完成';
}

function importedBookCelebrationItems(items: FileImportItem[]): ImportedBookCelebrationItem[] {
  const successItems = items.filter(
    (item) => (item.status === 'imported' || item.status === 'duplicate') && item.article,
  );
  const visibleItems = successItems.slice(0, EBOOK_IMPORT_CELEBRATION_MAX_VISIBLE);
  const center = (visibleItems.length - 1) / 2;
  const centerOrder = centerFirstOrder(visibleItems.length);

  return visibleItems.map((item, index) => ({
    id: item.id,
    title: item.article?.title || item.fileName,
    coverUrl: item.article?.leadImageUrl,
    position: index - center,
    lift: Math.abs(index - center) * 7,
    order: centerOrder.get(index) || 0,
  }));
}

function centerFirstOrder(count: number) {
  const indexes = Array.from({ length: count }, (_, index) => index);
  const center = (count - 1) / 2;
  indexes.sort((left, right) => {
    const leftDistance = Math.abs(left - center);
    const rightDistance = Math.abs(right - center);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return left - right;
  });
  return new Map(indexes.map((index, order) => [index, order]));
}

export function LibraryImportControls({
  defaultImportType,
  onImportEbookFile,
  onImportPdfFile,
  onImportArticleUrl,
  onCancelArticleImport,
  onOpenArticle,
}: {
  defaultImportType?: 'web' | 'ebook' | 'pdf';
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportPdfFile: (
    file: File,
    onProgress?: PdfImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportArticleUrl: (url: string, requestId?: string) => Promise<ArticleImportResult>;
  onCancelArticleImport?: (requestId: string) => Promise<boolean> | boolean;
  onOpenArticle: (article: ArticleRecord) => void;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [articleImportOpen, setArticleImportOpen] = useState(false);
  const [ebookImportOpen, setEbookImportOpen] = useState(false);
  const [pdfImportOpen, setPdfImportOpen] = useState(false);

  function openArticleImportDialog() {
    setAddMenuOpen(false);
    setEbookImportOpen(false);
    setPdfImportOpen(false);
    setArticleImportOpen(true);
  }

  function openEbookImportDialog() {
    setAddMenuOpen(false);
    setArticleImportOpen(false);
    setPdfImportOpen(false);
    setEbookImportOpen(true);
  }

  function openPdfImportDialog() {
    setAddMenuOpen(false);
    setArticleImportOpen(false);
    setEbookImportOpen(false);
    setPdfImportOpen(true);
  }

  return (
    <>
      <div
        className="library-add-control"
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setAddMenuOpen(false);
        }}
      >
        <Button
          aria-expanded={defaultImportType ? undefined : addMenuOpen}
          aria-haspopup={defaultImportType ? undefined : 'menu'}
          aria-label={
            defaultImportType === 'ebook'
              ? '添加电子书'
              : defaultImportType === 'pdf'
                ? '添加 PDF'
                : '添加网页文章'
          }
          className="library-add-trigger"
          type="button"
          variant="secondary"
          onClick={() => {
            if (defaultImportType === 'web') {
              openArticleImportDialog();
              return;
            }
            if (defaultImportType === 'ebook') {
              openEbookImportDialog();
              return;
            }
            if (defaultImportType === 'pdf') {
              openPdfImportDialog();
              return;
            }
            setAddMenuOpen((current) => !current);
          }}
        >
          <Plus size={16} />
          {defaultImportType === 'web' ? (
            <span>添加网页文章</span>
          ) : defaultImportType === 'ebook' ? (
            <span>添加电子书</span>
          ) : defaultImportType === 'pdf' ? (
            <span>添加 PDF</span>
          ) : null}
        </Button>
        {!defaultImportType && addMenuOpen ? (
          <div className="library-add-menu-popover" role="menu">
            <button type="button" role="menuitem" onClick={openArticleImportDialog}>
              <Globe2 size={15} />
              添加网页文章
            </button>
            <button type="button" role="menuitem" onClick={openEbookImportDialog}>
              <BookText size={15} />
              EPUB 电子书
            </button>
            <button type="button" role="menuitem" onClick={openPdfImportDialog}>
              <FileText size={15} />
              PDF 文档
            </button>
          </div>
        ) : null}
      </div>
      {articleImportOpen ? (
        <ArticleImportDialog
          onClose={() => setArticleImportOpen(false)}
          onImportArticleUrl={onImportArticleUrl}
          onCancelArticleImport={onCancelArticleImport}
          onOpenArticle={onOpenArticle}
        />
      ) : null}
      {ebookImportOpen ? (
        <EbookImportDialog
          onClose={() => setEbookImportOpen(false)}
          onImportEbookFile={onImportEbookFile}
          onOpenArticle={onOpenArticle}
        />
      ) : null}
      {pdfImportOpen ? (
        <PdfImportDialog
          onClose={() => setPdfImportOpen(false)}
          onImportPdfFile={onImportPdfFile}
          onOpenArticle={onOpenArticle}
        />
      ) : null}
    </>
  );
}

function ArticleImportDialog({
  onClose,
  onImportArticleUrl,
  onCancelArticleImport,
  onOpenArticle,
}: {
  onClose: () => void;
  onImportArticleUrl: (url: string, requestId?: string) => Promise<ArticleImportResult>;
  onCancelArticleImport?: (requestId: string) => Promise<boolean> | boolean;
  onOpenArticle: (article: ArticleRecord) => void;
}) {
  const [importUrl, setImportUrl] = useState('');
  const [importState, setImportState] = useState<ArticleImportState>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [importArticle, setImportArticle] = useState<ArticleRecord | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [cancelAvailable, setCancelAvailable] = useState(false);
  const [submittedUrl, setSubmittedUrl] = useState('');
  const cancelDelayTimerRef = useRef<number | null>(null);
  const importCloseTimerRef = useRef<number | null>(null);
  const importRequestIdRef = useRef(0);

  useEffect(
    () => () => {
      clearImportCloseTimer();
      clearCancelDelayTimer();
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

  async function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearImportCloseTimer();
    clearCancelDelayTimer();
    const url = importUrl.trim();
    if (!url) {
      setImportState('error');
      setImportMessage('请输入网页地址');
      setImportArticle(null);
      setImportProgress(0);
      setCancelAvailable(false);
      return;
    }

    const requestId = importRequestIdRef.current + 1;
    importRequestIdRef.current = requestId;
    setSubmittedUrl(url);

    try {
      setImportState('submitting');
      setImportMessage('正在解析网页');
      setImportArticle(null);
      setImportProgress(8);
      setCancelAvailable(false);
      cancelDelayTimerRef.current = window.setTimeout(() => {
        cancelDelayTimerRef.current = null;
        if (importRequestIdRef.current === requestId) setCancelAvailable(true);
      }, ARTICLE_IMPORT_CANCEL_DELAY_MS);
      const result = await onImportArticleUrl(url, articleImportRequestId(requestId));
      if (importRequestIdRef.current !== requestId) return;
      clearCancelDelayTimer();
      if (result.status === 'canceled') {
        setImportState('idle');
        setImportMessage('已取消解析');
        setImportArticle(null);
        setImportProgress(0);
        setCancelAvailable(false);
        return;
      }
      setImportArticle(result.article);
      if (result.status === 'duplicate') {
        setImportState('duplicate');
        setImportMessage('这篇文章已在阅读库');
        setImportProgress(100);
        setCancelAvailable(false);
        return;
      }

      setImportProgress(100);
      setImportState('imported');
      setImportMessage('已添加到阅读库');
      setCancelAvailable(false);
      setInputFocused(false);
      importCloseTimerRef.current = window.setTimeout(() => {
        importCloseTimerRef.current = null;
        onClose();
      }, ARTICLE_IMPORT_CLOSE_DELAY_MS);
    } catch (error) {
      if (importRequestIdRef.current !== requestId) return;
      clearCancelDelayTimer();
      setImportState('error');
      setImportMessage(articleImportErrorMessage(error));
      setImportArticle(null);
      setImportProgress(0);
      setCancelAvailable(false);
    }
  }

  function clearCancelDelayTimer() {
    if (cancelDelayTimerRef.current === null) return;
    window.clearTimeout(cancelDelayTimerRef.current);
    cancelDelayTimerRef.current = null;
  }

  function clearImportCloseTimer() {
    if (importCloseTimerRef.current === null) return;
    window.clearTimeout(importCloseTimerRef.current);
    importCloseTimerRef.current = null;
  }

  function cancelImport() {
    if (importState !== 'submitting') return;
    const requestId = importRequestIdRef.current;
    importRequestIdRef.current += 1;
    void onCancelArticleImport?.(articleImportRequestId(requestId));
    clearCancelDelayTimer();
    clearImportCloseTimer();
    setImportState('idle');
    setImportMessage('已取消解析');
    setImportArticle(null);
    setImportProgress(0);
    setCancelAvailable(false);
  }

  function closeImportDialog() {
    if (importState === 'submitting') return;
    clearImportCloseTimer();
    clearCancelDelayTimer();
    onClose();
  }

  const importProgressPercent = Math.round(importProgress);
  const parsedTitle = importArticle?.title.trim() || '';
  const showParsedTitle =
    Boolean(parsedTitle) &&
    !inputFocused &&
    (importState === 'imported' || importState === 'duplicate');
  const articleInputValue = showParsedTitle ? parsedTitle : importUrl;
  const articleInputTitle = showParsedTitle ? parsedTitle : submittedUrl || importUrl;
  const importHeaderMessage =
    importState === 'error'
      ? '解析失败'
      : importMessage || '输入文章链接，解析完成后会保存到阅读库。';
  const importFooterMessage =
    importState === 'error'
      ? 'Error'
      : importMessage || 'Yomitomo 会提取标题、来源、正文和可阅读内容。';

  return (
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
            <span>{importHeaderMessage}</span>
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
            showParsedTitle ? 'has-parsed-title' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <label className="library-article-import-url">
            <span>网页地址</span>
            <span className="library-article-import-input">
              {showParsedTitle && importState === 'imported' ? (
                <span className="library-article-import-result-check" aria-hidden="true">
                  <Check className="library-article-import-result-icon" size={16} />
                </span>
              ) : (
                <Globe2 size={16} />
              )}
              <input
                aria-label="网页地址"
                disabled={importState === 'submitting' || importState === 'imported'}
                inputMode="url"
                placeholder="粘贴网页链接，例如 https://example.com/article"
                title={articleInputTitle}
                type="text"
                value={articleInputValue}
                onBlur={() => setInputFocused(false)}
                onChange={(event) => {
                  setImportUrl(event.target.value);
                  if (importState !== 'submitting') {
                    clearImportCloseTimer();
                    clearCancelDelayTimer();
                    setImportState('idle');
                    setImportMessage('');
                    setImportArticle(null);
                    setImportProgress(0);
                    setCancelAvailable(false);
                  }
                }}
                onFocus={() => setInputFocused(true)}
              />
            </span>
          </label>
          <span className="library-article-import-actions">
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
            {importState === 'submitting' && cancelAvailable ? (
              <Button
                className="library-article-import-cancel"
                type="button"
                variant="secondary"
                onClick={cancelImport}
              >
                <X size={16} />
                取消解析
              </Button>
            ) : null}
          </span>
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
          <span>{importFooterMessage}</span>
          {importArticle && importState === 'duplicate' ? (
            <button
              type="button"
              onClick={() => {
                clearImportCloseTimer();
                onClose();
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
  );
}

function EbookImportDialog({
  onClose,
  onImportEbookFile,
  onOpenArticle,
}: {
  onClose: () => void;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onOpenArticle: (article: ArticleRecord) => void;
}) {
  return (
    <FileImportDialog
      config={{
        kind: 'ebook',
        titleId: 'library-ebook-import-title',
        title: '添加 EPUB 电子书',
        closeLabel: '关闭电子书导入',
        idleMessage: `可批量导入 · EPUB · 单本最高 80MB · 最多 ${MAX_BATCH_IMPORT_FILES} 本`,
        batchIdleMessage: `可批量导入 · EPUB · 单本最高 80MB · 最多 ${MAX_BATCH_IMPORT_FILES} 本`,
        accept: '.epub,application/epub+zip',
        inputId: 'library-ebook-file',
        isValidFileName: (name) => name.toLowerCase().endsWith('.epub'),
        maxBytes: MAX_EBOOK_IMPORT_BYTES,
        maxFileCount: MAX_BATCH_IMPORT_FILES,
        invalidFileMessage: '请选择 EPUB 文件',
        oversizeMessage: 'EPUB 文件不能超过 80MB',
        tooManyFilesMessage: `单次最多导入 ${MAX_BATCH_IMPORT_FILES} 本 EPUB`,
        duplicateMessage: '这本电子书已在阅读库',
        errorFallbackMessage: '添加电子书失败',
        idleDropTitle: '拖入 EPUB，或点击选择',
        draggingDropTitle: '松开开始解析',
        importedDropTitle: '导入完成',
        dropHint: '可多选或多拖，顺序导入',
        footerHint: '解析完成后会提取标题、作者、封面和章节正文。',
        progressLabel: '电子书导入进度',
        openDuplicateLabel: '打开已有电子书',
        onImportFile: onImportEbookFile,
      }}
      onClose={onClose}
      onOpenArticle={onOpenArticle}
    />
  );
}

function PdfImportDialog({
  onClose,
  onImportPdfFile,
  onOpenArticle,
}: {
  onClose: () => void;
  onImportPdfFile: (
    file: File,
    onProgress?: PdfImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onOpenArticle: (article: ArticleRecord) => void;
}) {
  return (
    <FileImportDialog
      config={{
        kind: 'pdf',
        titleId: 'library-pdf-import-title',
        title: '添加 PDF 文档',
        closeLabel: '关闭 PDF 导入',
        idleMessage: `可批量导入 · PDF · 单份最高 120MB · 最多 ${MAX_BATCH_IMPORT_FILES} 份`,
        batchIdleMessage: `可批量导入 · PDF · 单份最高 120MB · 最多 ${MAX_BATCH_IMPORT_FILES} 份`,
        accept: '.pdf,application/pdf',
        inputId: 'library-pdf-file',
        isValidFileName: (name) => name.toLowerCase().endsWith('.pdf'),
        maxBytes: MAX_PDF_IMPORT_BYTES,
        maxFileCount: MAX_BATCH_IMPORT_FILES,
        invalidFileMessage: '请选择 PDF 文件',
        oversizeMessage: 'PDF 文件不能超过 120MB',
        tooManyFilesMessage: `单次最多导入 ${MAX_BATCH_IMPORT_FILES} 份 PDF`,
        duplicateMessage: '这份 PDF 已在阅读库',
        errorFallbackMessage: '添加 PDF 失败',
        idleDropTitle: '拖入 PDF，或点击选择',
        draggingDropTitle: '松开开始解析',
        importedDropTitle: '导入完成',
        dropHint: '可多选或多拖，顺序导入',
        footerHint: '解析完成后会保存页数和基础元信息。',
        progressLabel: 'PDF 导入进度',
        openDuplicateLabel: '打开已有 PDF',
        onImportFile: onImportPdfFile,
      }}
      onClose={onClose}
      onOpenArticle={onOpenArticle}
    />
  );
}

function FileImportDialog({
  config,
  onClose,
  onOpenArticle,
}: {
  config: FileImportDialogConfig;
  onClose: () => void;
  onOpenArticle: (article: ArticleRecord) => void;
}) {
  const [importState, setImportState] = useState<ArticleImportState>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [importItems, setImportItems] = useState<FileImportItem[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const importCloseTimerRef = useRef<number | null>(null);

  useEffect(() => () => clearImportCloseTimer(), []);

  async function importFiles(fileList: FileList | File[] | undefined) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    clearImportCloseTimer();

    if (files.length > config.maxFileCount) {
      setImportState('error');
      setImportMessage(config.tooManyFilesMessage);
      setImportItems([]);
      setBatchProgress(0);
      resetInput();
      return;
    }

    const initialItems = files.map((file, index): FileImportItem => {
      if (!config.isValidFileName(file.name)) {
        return {
          id: fileImportItemId(file, index),
          fileName: file.name,
          progress: 0,
          status: 'error',
          message: config.invalidFileMessage,
        };
      }
      if (file.size > config.maxBytes) {
        return {
          id: fileImportItemId(file, index),
          fileName: file.name,
          progress: 0,
          status: 'error',
          message: config.oversizeMessage,
        };
      }
      return {
        id: fileImportItemId(file, index),
        fileName: file.name,
        progress: 0,
        status: 'pending',
      };
    });

    const validEntries = initialItems
      .map((item, index) => ({ item, file: files[index] }))
      .filter((entry) => entry.item.status === 'pending');

    setImportItems(initialItems);
    setBatchProgress(0);

    if (validEntries.length === 0) {
      setImportState('error');
      setImportMessage('没有可导入的文件');
      resetInput();
      return;
    }

    setImportState('submitting');
    setImportMessage(`正在导入 1/${validEntries.length}`);

    let currentItems = initialItems;
    function patchImportItem(itemId: string, patch: Partial<FileImportItem>) {
      currentItems = currentItems.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      );
      setImportItems(currentItems);
    }

    let completedCount = 0;
    for (const entry of validEntries) {
      const itemId = entry.item.id;
      const currentIndex = completedCount;
      setImportMessage(`正在导入 ${currentIndex + 1}/${validEntries.length}`);
      patchImportItem(itemId, { status: 'importing', progress: 4, message: undefined });

      try {
        const result = await config.onImportFile(entry.file, (nextProgress) => {
          const itemProgress = clampNumber(nextProgress, 0, 100, 4);
          patchImportItem(itemId, { progress: itemProgress });
          setBatchProgress(((currentIndex + itemProgress / 100) / validEntries.length) * 100);
        });

        if (result.status === 'canceled') {
          patchImportItem(itemId, { message: '已取消', progress: 100, status: 'error' });
          completedCount += 1;
          continue;
        }

        patchImportItem(itemId, {
          article: result.article,
          message:
            result.status === 'duplicate'
              ? config.duplicateMessage
              : articleImportMeta(result.article),
          progress: 100,
          status: result.status,
        });
      } catch (error) {
        patchImportItem(itemId, {
          message: fileImportErrorMessage(error, config.errorFallbackMessage),
          progress: 100,
          status: 'error',
        });
      }

      completedCount += 1;
      setBatchProgress((completedCount / validEntries.length) * 100);
    }

    resetInput();
    finishImportBatch(currentItems);
  }

  function clearImportCloseTimer() {
    if (importCloseTimerRef.current === null) return;
    window.clearTimeout(importCloseTimerRef.current);
    importCloseTimerRef.current = null;
  }

  function closeImportDialog() {
    if (importState === 'submitting') return;
    clearImportCloseTimer();
    setDragging(false);
    onClose();
  }

  function resetInput() {
    if (inputRef.current) inputRef.current.value = '';
  }

  function resetImport() {
    clearImportCloseTimer();
    setImportState('idle');
    setImportMessage('');
    setImportItems([]);
    setBatchProgress(0);
    setDragging(false);
    resetInput();
  }

  function finishImportBatch(items: FileImportItem[]) {
    const importedCount = items.filter((item) => item.status === 'imported').length;
    const duplicateCount = items.filter((item) => item.status === 'duplicate').length;
    const successCount = importedCount + duplicateCount;
    const failedCount = items.filter((item) => item.status === 'error').length;

    if (successCount === 0) {
      setImportState('error');
      setImportMessage('导入失败');
      return;
    }

    if (importedCount === 0) {
      setImportState(failedCount > 0 ? 'error' : 'duplicate');
      setImportMessage(
        failedCount > 0
          ? `${duplicateCount} 个已存在，${failedCount} 个失败`
          : duplicateCount === 1
            ? config.duplicateMessage
            : `${duplicateCount} 个文件已在阅读库`,
      );
      setBatchProgress(100);
      return;
    }

    setImportState(failedCount > 0 ? 'error' : 'imported');
    setImportMessage(
      failedCount > 0
        ? `已导入 ${successCount} 个，${failedCount} 个失败`
        : `已导入 ${successCount} 个文件`,
    );
    setBatchProgress(100);
    if (failedCount === 0) {
      importCloseTimerRef.current = window.setTimeout(
        () => {
          importCloseTimerRef.current = null;
          onClose();
          setDragging(false);
        },
        config.kind === 'ebook'
          ? EBOOK_IMPORT_CELEBRATION_CLOSE_DELAY_MS
          : FILE_IMPORT_CLOSE_DELAY_MS,
      );
    }
  }

  function importDropTitle() {
    if (importState === 'imported') return config.importedDropTitle;
    if (dragging) return config.draggingDropTitle;
    return config.idleDropTitle;
  }

  const duplicateArticle =
    importItems.find((item) => item.status === 'duplicate' && item.article)?.article || null;
  const celebrationItems = config.kind === 'ebook' ? importedBookCelebrationItems(importItems) : [];
  const hiddenCelebrationCount = Math.max(
    0,
    importItems.filter(
      (item) => (item.status === 'imported' || item.status === 'duplicate') && item.article,
    ).length - celebrationItems.length,
  );
  const showCelebration =
    config.kind === 'ebook' &&
    celebrationItems.length > 0 &&
    (importState === 'imported' || importState === 'error');
  const showProgress = importState !== 'idle' && importItems.length > 0;
  const showResults = importItems.length > 0;
  const importProgressPercent = Math.round(clampNumber(batchProgress, 0, 100, 0));

  return (
    <div
      className="library-import-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={config.titleId}
    >
      <button
        className="library-import-modal-scrim"
        type="button"
        aria-label={config.closeLabel}
        onClick={closeImportDialog}
      />
      <section className={`library-import-dialog is-${importState}`}>
        <header>
          <div>
            <strong id={config.titleId}>{config.title}</strong>
            <span>{importMessage || config.batchIdleMessage}</span>
          </div>
          <button type="button" aria-label={config.closeLabel} onClick={closeImportDialog}>
            <X size={17} />
          </button>
        </header>
        <label
          className={[
            'library-ebook-dropzone',
            dragging ? 'is-dragging' : '',
            importState === 'submitting' ? 'is-submitting' : '',
            importState === 'imported' ? 'is-imported' : '',
            importState === 'error' ? 'is-error' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          htmlFor={config.inputId}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragging(false);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (importState !== 'submitting') setDragging(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (importState === 'submitting') return;
            void importFiles(event.dataTransfer.files);
          }}
        >
          <input
            accept={config.accept}
            disabled={importState === 'submitting'}
            id={config.inputId}
            multiple
            ref={inputRef}
            type="file"
            onChange={(event) => void importFiles(event.target.files || undefined)}
          />
          <span
            className={[
              'library-ebook-dropzone-icon',
              importState === 'imported' ? 'is-success' : '',
              importState === 'error' ? 'is-error' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {importState === 'submitting' ? (
              <LoaderCircle className="is-spinning" size={22} />
            ) : importState === 'imported' ? (
              <Check className="library-import-success-icon" size={24} />
            ) : importState === 'error' ? (
              <X size={24} />
            ) : dragging ? (
              <FileUp size={24} />
            ) : (
              <Upload size={24} />
            )}
          </span>
          <span className="library-ebook-dropzone-copy">
            <strong>{importDropTitle()}</strong>
            <em>{config.dropHint}</em>
          </span>
          {showProgress ? (
            <span
              className="library-import-progress"
              role="progressbar"
              aria-label={config.progressLabel}
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
          ) : null}
        </label>
        {showCelebration ? (
          <div
            className="library-ebook-import-celebration"
            role="status"
            aria-label="已导入的电子书封面"
          >
            <div className="library-ebook-import-cover-stack" aria-hidden="true">
              {celebrationItems.map((item) => (
                <span
                  className={['library-ebook-import-cover-card', item.coverUrl ? 'has-cover' : '']
                    .filter(Boolean)
                    .join(' ')}
                  key={item.id}
                  style={
                    {
                      '--ebook-import-cover-position': item.position,
                      '--ebook-import-cover-lift': `${item.lift}px`,
                      '--ebook-import-cover-order': item.order,
                      '--ebook-import-cover-z': celebrationItems.length - item.order,
                    } as React.CSSProperties
                  }
                >
                  {item.coverUrl ? (
                    <img alt="" src={item.coverUrl} />
                  ) : (
                    <span className="library-ebook-import-cover-placeholder">
                      {coverPlaceholderTitle(item.title)}
                    </span>
                  )}
                </span>
              ))}
              {hiddenCelebrationCount > 0 ? (
                <span className="library-ebook-import-cover-more">+{hiddenCelebrationCount}</span>
              ) : null}
            </div>
          </div>
        ) : null}
        {showResults ? (
          <div className="library-file-import-results" role="status">
            {importItems.map((item) => (
              <article
                className={[
                  'library-file-import-result',
                  `is-${item.status}`,
                  item.article?.leadImageUrl ? 'has-cover' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={item.id}
              >
                <span className="library-file-import-cover" aria-hidden="true">
                  {item.article?.leadImageUrl ? (
                    <img alt="" src={item.article.leadImageUrl} />
                  ) : item.status === 'importing' ? (
                    <LoaderCircle className="is-spinning" size={18} />
                  ) : item.status === 'error' ? (
                    <X size={18} />
                  ) : config.kind === 'pdf' ? (
                    <FileText size={18} />
                  ) : (
                    <BookText size={18} />
                  )}
                </span>
                <span className="library-file-import-result-copy">
                  <strong>{item.article?.title || item.fileName}</strong>
                  <em>{item.message || item.fileName}</em>
                </span>
                <span className="library-file-import-result-state">
                  {fileImportItemStateLabel(item)}
                </span>
              </article>
            ))}
          </div>
        ) : null}
        <footer>
          <span>{importMessage || config.footerHint}</span>
          {duplicateArticle ? (
            <button
              type="button"
              onClick={() => {
                clearImportCloseTimer();
                onClose();
                onOpenArticle(duplicateArticle);
              }}
            >
              <ExternalLink size={14} />
              {config.openDuplicateLabel}
            </button>
          ) : importState === 'error' ? (
            <button type="button" onClick={resetImport}>
              重新选择
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
