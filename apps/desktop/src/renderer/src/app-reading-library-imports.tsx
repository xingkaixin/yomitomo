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
import { Button } from './components/ui/button';
import type { EbookImportProgressCallback, PdfImportProgressCallback } from './app-reading-types';

const MAX_EBOOK_IMPORT_BYTES = 80 * 1024 * 1024;
const MAX_PDF_IMPORT_BYTES = 120 * 1024 * 1024;
const ARTICLE_IMPORT_CANCEL_DELAY_MS = 650;
const ARTICLE_IMPORT_CLOSE_DELAY_MS = 1200;
type ArticleImportState = 'idle' | 'submitting' | 'imported' | 'duplicate' | 'error';
export type ArticleImportResult = {
  status: 'imported' | 'duplicate';
  article: ArticleRecord;
};

type FileImportProgressCallback = (progress: number) => void;

type FileImportDialogConfig = {
  titleId: string;
  title: string;
  closeLabel: string;
  idleMessage: string;
  accept: string;
  inputId: string;
  isValidFileName: (name: string) => boolean;
  maxBytes: number;
  invalidFileMessage: string;
  oversizeMessage: string;
  duplicateMessage: string;
  errorFallbackMessage: string;
  idleDropTitle: string;
  draggingDropTitle: string;
  importedDropTitle: string;
  dropHint: string;
  footerHint: string;
  progressLabel: string;
  openImportedLabel: string;
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

export function LibraryImportControls({
  defaultImportType,
  onImportEbookFile,
  onImportPdfFile,
  onImportArticleUrl,
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
  onImportArticleUrl: (url: string) => Promise<ArticleImportResult>;
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
              ePub 电子书
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
  onOpenArticle,
}: {
  onClose: () => void;
  onImportArticleUrl: (url: string) => Promise<ArticleImportResult>;
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
      const result = await onImportArticleUrl(url);
      if (importRequestIdRef.current !== requestId) return;
      clearCancelDelayTimer();
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
    importRequestIdRef.current += 1;
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
        titleId: 'library-ebook-import-title',
        title: '添加 ePub 电子书',
        closeLabel: '关闭电子书导入',
        idleMessage: '拖入一本 EPUB，或点击选择本地文件。',
        accept: '.epub,application/epub+zip',
        inputId: 'library-ebook-file',
        isValidFileName: (name) => name.toLowerCase().endsWith('.epub'),
        maxBytes: MAX_EBOOK_IMPORT_BYTES,
        invalidFileMessage: '请选择 EPUB 文件',
        oversizeMessage: 'EPUB 文件不能超过 80MB',
        duplicateMessage: '这本电子书已在阅读库',
        errorFallbackMessage: '添加电子书失败',
        idleDropTitle: '拖入 EPUB，或点击选择',
        draggingDropTitle: '松开开始解析',
        importedDropTitle: '导入完成',
        dropHint: '单次导入一本书 · EPUB · 最高 80MB',
        footerHint: '解析完成后会提取标题、作者、封面和章节正文。',
        progressLabel: '电子书导入进度',
        openImportedLabel: '打开电子书',
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
        titleId: 'library-pdf-import-title',
        title: '添加 PDF 文档',
        closeLabel: '关闭 PDF 导入',
        idleMessage: '拖入一份 PDF，或点击选择本地文件。',
        accept: '.pdf,application/pdf',
        inputId: 'library-pdf-file',
        isValidFileName: (name) => name.toLowerCase().endsWith('.pdf'),
        maxBytes: MAX_PDF_IMPORT_BYTES,
        invalidFileMessage: '请选择 PDF 文件',
        oversizeMessage: 'PDF 文件不能超过 120MB',
        duplicateMessage: '这份 PDF 已在阅读库',
        errorFallbackMessage: '添加 PDF 失败',
        idleDropTitle: '拖入 PDF，或点击选择',
        draggingDropTitle: '松开开始解析',
        importedDropTitle: '导入完成',
        dropHint: '单次导入一份文档 · PDF · 最高 120MB',
        footerHint: '解析完成后会保存页数和基础元信息。',
        progressLabel: 'PDF 导入进度',
        openImportedLabel: '打开 PDF',
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
  const [importArticle, setImportArticle] = useState<ArticleRecord | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const importCloseTimerRef = useRef<number | null>(null);

  useEffect(() => () => clearImportCloseTimer(), []);

  useEffect(() => {
    if (importState !== 'submitting') return;

    const timer = window.setInterval(() => {
      setImportProgress(advanceImportProgress);
    }, 180);

    return () => window.clearInterval(timer);
  }, [importState]);

  async function importFile(file: File | undefined) {
    if (!file) return;
    clearImportCloseTimer();
    if (!config.isValidFileName(file.name)) {
      setImportState('error');
      setImportMessage(config.invalidFileMessage);
      setImportArticle(null);
      setImportProgress(0);
      return;
    }
    if (file.size > config.maxBytes) {
      setImportState('error');
      setImportMessage(config.oversizeMessage);
      setImportArticle(null);
      setImportProgress(0);
      return;
    }

    try {
      setImportState('submitting');
      setImportMessage(`正在解析 ${file.name}`);
      setImportArticle(null);
      setImportProgress(4);
      const result = await config.onImportFile(file, (nextProgress) => {
        setImportProgress(clampNumber(nextProgress, 0, 100, 4));
      });
      setImportArticle(result.article);
      if (inputRef.current) inputRef.current.value = '';
      if (result.status === 'duplicate') {
        setImportState('duplicate');
        setImportMessage(config.duplicateMessage);
        setImportProgress(100);
        return;
      }

      setImportProgress(100);
      setImportState('imported');
      setImportMessage('已添加到阅读库');
      importCloseTimerRef.current = window.setTimeout(() => {
        importCloseTimerRef.current = null;
        onClose();
        setDragging(false);
      }, 850);
    } catch (error) {
      setImportState('error');
      setImportMessage(error instanceof Error ? error.message : config.errorFallbackMessage);
      setImportArticle(null);
      setImportProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
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

  const importProgressPercent = Math.round(importProgress);

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
            <span>{importMessage || config.idleMessage}</span>
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
            void importFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            accept={config.accept}
            disabled={importState === 'submitting'}
            id={config.inputId}
            ref={inputRef}
            type="file"
            onChange={(event) => void importFile(event.target.files?.[0])}
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
            <strong>
              {importState === 'imported'
                ? config.importedDropTitle
                : dragging
                  ? config.draggingDropTitle
                  : config.idleDropTitle}
            </strong>
            <em>{config.dropHint}</em>
          </span>
          {importState === 'idle' ? null : (
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
          )}
        </label>
        <footer>
          <span>{importMessage || config.footerHint}</span>
          {importArticle ? (
            <button
              type="button"
              onClick={() => {
                clearImportCloseTimer();
                onClose();
                onOpenArticle(importArticle);
              }}
            >
              <ExternalLink size={14} />
              {importState === 'duplicate' ? config.openDuplicateLabel : config.openImportedLabel}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
