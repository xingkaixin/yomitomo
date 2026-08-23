import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  AlertCircleIcon,
  Book02Icon,
  Cancel01Icon,
  FileUploadIcon,
  FolderAddIcon,
  FolderOpenIcon,
  Globe02Icon,
  LinkSquare01Icon,
  Loading03Icon,
  Pdf01Icon,
  Refresh01Icon,
  TextIcon,
  Upload01Icon,
} from '@hugeicons/core-free-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ResolvedAppSettings, ArticleRecord } from '@yomitomo/shared';
import { clampNumber } from '@yomitomo/reader-ui/reader-settings';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import type {
  EbookImportProgressCallback,
  PdfImportProgressCallback,
} from '../shell/app-reading-types';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import { TextImportDialog } from './app-reading-library-text-import';
import rabbitWalkSprite from '../assets/reading-library/rabbit-walk.webp';
import {
  MAX_EBOOK_IMPORT_BYTES,
  MAX_PDF_IMPORT_BYTES,
  type ArticleImportResult,
  type TextImportCommitItem,
} from '../../../ipc-contract';

const MAX_BATCH_IMPORT_FILES = 10;
const ARTICLE_IMPORT_CANCEL_DELAY_MS = 650;
const ARTICLE_IMPORT_CLOSE_DELAY_MS = 900;
const FILE_IMPORT_CLOSE_DELAY_MS = 900;
const EBOOK_IMPORT_CELEBRATION_CLOSE_DELAY_MS = 900;
const EBOOK_IMPORT_CELEBRATION_MAX_VISIBLE = 7;
type ArticleImportState =
  | { type: 'idle'; message: string }
  | {
      type: 'submitting';
      message: string;
      progress: number;
      cancelAvailable: boolean;
      submittedUrl: string;
    }
  | {
      type: 'imported' | 'duplicate';
      message: string;
      article: ArticleRecord;
      submittedUrl: string;
    }
  | { type: 'error'; message: string; submittedUrl: string };
export type { ArticleImportResult } from '../../../ipc-contract';

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

type FileImportState =
  | { type: 'idle' }
  | {
      type: 'submitting' | 'imported' | 'duplicate' | 'error';
      message: string;
      items: FileImportItem[];
      progress: number;
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

function LibraryImportProgressBar({ percent, ariaLabel }: { percent: number; ariaLabel: string }) {
  return (
    <span
      className="library-import-progress"
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      style={
        {
          '--library-import-progress': `${percent}%`,
          '--library-import-walker-sprite': `url(${rabbitWalkSprite})`,
        } as React.CSSProperties
      }
    >
      <span className="library-import-progress-track">
        <span />
      </span>
      <i
        className={`library-import-progress-walker${percent >= 100 ? ' is-done' : ''}`}
        aria-hidden="true"
      />
      <em>{percent}%</em>
    </span>
  );
}

function LibraryImportSuccessCheck({ className, size }: { className: string; size: number }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M20 6 9 17l-5-5" pathLength={1} />
    </svg>
  );
}

type AppT = ReturnType<typeof useTranslation>['t'];

export function articleImportErrorMessage(error: unknown, t: AppT) {
  const key = articleImportErrorKey(error instanceof Error ? error.message.trim() : '');
  return t(key || 'library.import.article.errorTitle');
}

export function articleImportErrorKey(code: string) {
  if (code === 'ARTICLE_IMPORT_REQUEST_FAILED') return 'library.import.article.requestFailed';
  if (code === 'ARTICLE_IMPORT_UNSUPPORTED_CONTENT_TYPE')
    return 'library.import.article.unsupportedContentType';
  if (code === 'ARTICLE_IMPORT_RESPONSE_TOO_LARGE')
    return 'library.import.article.responseTooLarge';
  if (code === 'ARTICLE_IMPORT_TIMEOUT') return 'library.import.article.timeout';
  if (code === 'ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET')
    return 'library.import.article.blockedNetworkTarget';
  return '';
}

function isValidArticleImportUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function fileImportItemId(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified || 0}-${index}`;
}

export function fileImportErrorMessage(error: unknown, fallback: string, t: AppT) {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message) return fallback;
  const key = fileImportErrorKey(message);
  return key ? t(key) : message;
}

export function fileImportErrorKey(code: string) {
  if (code === 'EBOOK_IMPORT_INVALID_FILE') return 'library.import.ebook.invalidFile';
  if (code === 'EBOOK_IMPORT_FILE_TOO_LARGE') return 'library.import.ebook.oversize';
  if (code === 'EBOOK_IMPORT_ENTRY_TOO_LARGE') return 'library.import.ebook.entryTooLarge';
  if (code === 'EBOOK_IMPORT_NO_READABLE_CHAPTERS')
    return 'library.import.ebook.noReadableChapters';
  if (code === 'EBOOK_IMPORT_MISSING_CONTAINER') return 'library.import.ebook.missingContainer';
  if (code === 'EBOOK_IMPORT_MISSING_OPF') return 'library.import.ebook.missingOpf';
  if (code === 'EBOOK_IMPORT_OPF_UNREADABLE') return 'library.import.ebook.opfUnreadable';
  if (code === 'PDF_IMPORT_INVALID_FILE') return 'library.import.pdf.invalidFile';
  if (code === 'PDF_IMPORT_FILE_TOO_LARGE') return 'library.import.pdf.oversize';
  return '';
}

function articleImportMeta(article: ArticleRecord, t: AppT) {
  if (article.byline) return article.byline;
  if (article.sourceType === 'pdf') {
    const pageCount = article.pdf?.metadata.pageCount;
    return pageCount
      ? t('library.import.meta.pages', { count: pageCount })
      : article.pdf?.metadata.fileName;
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

function fileImportItemStateLabel(item: FileImportItem, t: AppT) {
  if (item.status === 'pending') return t('library.import.itemState.pending');
  if (item.status === 'importing') return `${Math.round(item.progress)}%`;
  if (item.status === 'duplicate') return t('library.import.itemState.duplicate');
  if (item.status === 'error') return t('library.import.itemState.error');
  return t('library.import.itemState.imported');
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

function playImportSuccessSound(importedCount: number, settings: ResolvedAppSettings) {
  if (importedCount <= 0) return;
  playAppSoundEffect(
    importedCount > 1 ? 'library.import_success_multiple' : 'library.import_success_single',
    settings,
  );
}

export type LibraryImportDialogs = {
  openArticleImport: () => void;
  openEbookImport: () => void;
  openPdfImport: () => void;
  openTextImport: () => void;
  dialogs: React.ReactNode;
};

export function useLibraryImportDialogs({
  settings,
  onImportArticleUrl,
  onImportEbookFile,
  onImportPdfFile,
  onCancelArticleImport,
  onCommitTextImport,
  onOpenArticle,
}: {
  settings: ResolvedAppSettings;
  onImportArticleUrl: (url: string, requestId?: string) => Promise<ArticleImportResult>;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportPdfFile: (
    file: File,
    onProgress?: PdfImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onCancelArticleImport?: (requestId: string) => Promise<boolean> | boolean;
  onCommitTextImport: (input: { items: TextImportCommitItem[] }) => Promise<unknown>;
  onOpenArticle: (article: ArticleRecord) => void;
}): LibraryImportDialogs {
  const [articleImportOpen, setArticleImportOpen] = useState(false);
  const [ebookImportOpen, setEbookImportOpen] = useState(false);
  const [pdfImportOpen, setPdfImportOpen] = useState(false);
  const [textImportOpen, setTextImportOpen] = useState(false);

  const openArticleImport = useCallback(() => {
    setEbookImportOpen(false);
    setPdfImportOpen(false);
    setTextImportOpen(false);
    setArticleImportOpen(true);
  }, []);
  const openEbookImport = useCallback(() => {
    setArticleImportOpen(false);
    setPdfImportOpen(false);
    setTextImportOpen(false);
    setEbookImportOpen(true);
  }, []);
  const openPdfImport = useCallback(() => {
    setArticleImportOpen(false);
    setEbookImportOpen(false);
    setTextImportOpen(false);
    setPdfImportOpen(true);
  }, []);
  const openTextImport = useCallback(() => {
    setArticleImportOpen(false);
    setEbookImportOpen(false);
    setPdfImportOpen(false);
    setTextImportOpen(true);
  }, []);

  const dialogs = (
    <>
      {articleImportOpen ? (
        <ArticleImportDialog
          settings={settings}
          onClose={() => setArticleImportOpen(false)}
          onImportArticleUrl={onImportArticleUrl}
          onCancelArticleImport={onCancelArticleImport}
          onOpenArticle={onOpenArticle}
        />
      ) : null}
      {ebookImportOpen ? (
        <EbookImportDialog
          settings={settings}
          onClose={() => setEbookImportOpen(false)}
          onImportEbookFile={onImportEbookFile}
          onOpenArticle={onOpenArticle}
        />
      ) : null}
      {pdfImportOpen ? (
        <PdfImportDialog
          settings={settings}
          onClose={() => setPdfImportOpen(false)}
          onImportPdfFile={onImportPdfFile}
          onOpenArticle={onOpenArticle}
        />
      ) : null}
      {textImportOpen ? (
        <TextImportDialog onClose={() => setTextImportOpen(false)} onCommit={onCommitTextImport} />
      ) : null}
    </>
  );

  return { openArticleImport, openEbookImport, openPdfImport, openTextImport, dialogs };
}

export function LibraryImportControls({
  defaultImportType,
  onAddWebArticle,
  onAddEbook,
  onAddPdf,
  onAddText,
  onCreateCollection,
  onOpenCollectionPicker,
  onSyncWeRead,
  weReadSyncDisabled = false,
  weReadSyncVisible = false,
  weReadSyncing = false,
}: {
  defaultImportType?: 'web' | 'ebook' | 'pdf';
  onAddWebArticle: () => void;
  onAddEbook: () => void;
  onAddPdf: () => void;
  onAddText: () => void;
  onCreateCollection?: () => void;
  onOpenCollectionPicker?: () => void;
  onSyncWeRead?: () => void;
  weReadSyncDisabled?: boolean;
  weReadSyncVisible?: boolean;
  weReadSyncing?: boolean;
}) {
  const { t } = useTranslation();
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  function openArticleImportDialog() {
    setAddMenuOpen(false);
    onAddWebArticle();
  }

  function openEbookImportDialog() {
    setAddMenuOpen(false);
    onAddEbook();
  }

  function openPdfImportDialog() {
    setAddMenuOpen(false);
    onAddPdf();
  }

  function openTextImportDialog() {
    setAddMenuOpen(false);
    onAddText();
  }

  function syncWeRead() {
    setAddMenuOpen(false);
    onSyncWeRead?.();
  }

  function createCollection() {
    setAddMenuOpen(false);
    onCreateCollection?.();
  }

  function openCollectionPicker() {
    setAddMenuOpen(false);
    onOpenCollectionPicker?.();
  }

  return (
    <DropdownMenu open={addMenuOpen} onOpenChange={setAddMenuOpen}>
      <div className="library-add-control">
        {defaultImportType ? (
          <Button
            aria-label={
              defaultImportType === 'ebook'
                ? t('library.import.addEbook')
                : defaultImportType === 'pdf'
                  ? t('library.import.addPdf')
                  : t('library.import.addWebArticle')
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
              openPdfImportDialog();
            }}
          >
            <HugeiconsIcon icon={Add01Icon} size={16} />
            {defaultImportType === 'web' ? (
              <span>{t('library.import.addWebArticle')}</span>
            ) : defaultImportType === 'ebook' ? (
              <span>{t('library.import.addEbook')}</span>
            ) : (
              <span>{t('library.import.addPdf')}</span>
            )}
          </Button>
        ) : (
          <>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t('library.import.addContent')}
                className="library-add-trigger"
                type="button"
                variant="secondary"
              >
                <HugeiconsIcon icon={Add01Icon} size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="library-add-menu-popover">
              <DropdownMenuItem asChild>
                <button type="button" onClick={openArticleImportDialog}>
                  <HugeiconsIcon icon={Globe02Icon} size={15} />
                  {t('library.import.addWebArticle')}
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button type="button" onClick={openEbookImportDialog}>
                  <HugeiconsIcon icon={Book02Icon} size={15} />
                  {t('library.import.epubEbook')}
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button type="button" onClick={openPdfImportDialog}>
                  <HugeiconsIcon icon={Pdf01Icon} size={15} />
                  {t('library.import.pdfDocument')}
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button type="button" onClick={openTextImportDialog}>
                  <HugeiconsIcon icon={TextIcon} size={15} />
                  {t('library.import.text.menuEntry')}
                </button>
              </DropdownMenuItem>
              {onOpenCollectionPicker ? (
                <DropdownMenuItem asChild>
                  <button type="button" onClick={openCollectionPicker}>
                    <HugeiconsIcon icon={FolderOpenIcon} size={15} />
                    {t('library.collection.addExisting')}
                  </button>
                </DropdownMenuItem>
              ) : null}
              {onCreateCollection ? (
                <DropdownMenuItem asChild>
                  <button type="button" onClick={createCollection}>
                    <HugeiconsIcon icon={FolderAddIcon} size={15} />
                    {t('library.collection.create')}
                  </button>
                </DropdownMenuItem>
              ) : null}
              {weReadSyncVisible ? (
                <DropdownMenuItem asChild>
                  <button type="button" disabled={weReadSyncDisabled} onClick={syncWeRead}>
                    <HugeiconsIcon icon={Refresh01Icon} size={15} />
                    {weReadSyncing ? t('library.syncing') : t('library.sync')}
                  </button>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </>
        )}
      </div>
    </DropdownMenu>
  );
}

function ArticleImportDialog({
  settings,
  onClose,
  onImportArticleUrl,
  onCancelArticleImport,
  onOpenArticle,
}: {
  settings: ResolvedAppSettings;
  onClose: () => void;
  onImportArticleUrl: (url: string, requestId?: string) => Promise<ArticleImportResult>;
  onCancelArticleImport?: (requestId: string) => Promise<boolean> | boolean;
  onOpenArticle: (article: ArticleRecord) => void;
}) {
  const { t } = useTranslation();
  const [importUrl, setImportUrl] = useState('');
  const [importState, setImportState] = useState<ArticleImportState>({
    type: 'idle',
    message: '',
  });
  const [inputFocused, setInputFocused] = useState(false);
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
    if (importState.type !== 'submitting') return;

    const timer = window.setInterval(() => {
      setImportState((current) =>
        current.type === 'submitting'
          ? { ...current, progress: advanceImportProgress(current.progress) }
          : current,
      );
    }, 180);

    return () => window.clearInterval(timer);
  }, [importState.type]);

  async function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearImportCloseTimer();
    clearCancelDelayTimer();
    const url = importUrl.trim();
    if (!isValidArticleImportUrl(url)) {
      setImportState({
        type: 'error',
        message: t('library.import.article.invalidUrl'),
        submittedUrl: url,
      });
      return;
    }

    const requestId = importRequestIdRef.current + 1;
    importRequestIdRef.current = requestId;
    try {
      setImportState({
        type: 'submitting',
        message: t('library.import.article.parsing'),
        progress: 8,
        cancelAvailable: false,
        submittedUrl: url,
      });
      cancelDelayTimerRef.current = window.setTimeout(() => {
        cancelDelayTimerRef.current = null;
        if (importRequestIdRef.current !== requestId) return;
        setImportState((current) =>
          current.type === 'submitting' ? { ...current, cancelAvailable: true } : current,
        );
      }, ARTICLE_IMPORT_CANCEL_DELAY_MS);
      const result = await onImportArticleUrl(url, articleImportRequestId(requestId));
      if (importRequestIdRef.current !== requestId) return;
      clearCancelDelayTimer();
      if (result.status === 'canceled') {
        setImportState({ type: 'idle', message: t('library.import.article.canceled') });
        return;
      }
      if (result.status === 'duplicate') {
        setImportState({
          type: 'duplicate',
          message: t('library.import.article.duplicate'),
          article: result.article,
          submittedUrl: url,
        });
        return;
      }

      setImportState({
        type: 'imported',
        message: t('library.import.article.imported'),
        article: result.article,
        submittedUrl: url,
      });
      playImportSuccessSound(1, settings);
      setInputFocused(false);
      importCloseTimerRef.current = window.setTimeout(() => {
        importCloseTimerRef.current = null;
        onClose();
      }, ARTICLE_IMPORT_CLOSE_DELAY_MS);
    } catch (error) {
      if (importRequestIdRef.current !== requestId) return;
      clearCancelDelayTimer();
      setImportState({
        type: 'error',
        message: articleImportErrorMessage(error, t),
        submittedUrl: url,
      });
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
    if (importState.type !== 'submitting') return;
    const requestId = importRequestIdRef.current;
    importRequestIdRef.current += 1;
    void onCancelArticleImport?.(articleImportRequestId(requestId));
    clearCancelDelayTimer();
    clearImportCloseTimer();
    setImportState({ type: 'idle', message: t('library.import.article.canceled') });
  }

  function closeImportDialog() {
    if (importState.type === 'submitting') return;
    clearImportCloseTimer();
    clearCancelDelayTimer();
    onClose();
  }

  const importArticle =
    importState.type === 'imported' || importState.type === 'duplicate'
      ? importState.article
      : null;
  const importProgress =
    importState.type === 'submitting'
      ? importState.progress
      : importState.type === 'imported' || importState.type === 'duplicate'
        ? 100
        : 0;
  const importProgressPercent = Math.round(importProgress);
  const parsedTitle = importArticle?.title.trim() || '';
  const showParsedTitle =
    Boolean(parsedTitle) &&
    !inputFocused &&
    (importState.type === 'imported' || importState.type === 'duplicate');
  const articleInputValue = showParsedTitle ? parsedTitle : importUrl;
  const articleInputTitle = showParsedTitle
    ? parsedTitle
    : 'submittedUrl' in importState
      ? importState.submittedUrl || importUrl
      : importUrl;
  const importHeaderMessage =
    importState.type === 'error'
      ? t('library.import.article.errorTitle')
      : importState.message || t('library.import.article.idleHeader');
  const importFooterMessage = importState.message || t('library.import.article.idleFooter');

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && closeImportDialog()}>
      <DialogPortal>
        <DialogOverlay className="library-import-modal">
          <button
            className="library-import-modal-scrim"
            type="button"
            aria-label={t('library.import.article.close')}
            onClick={closeImportDialog}
          />
          <DialogContent
            aria-labelledby="library-article-import-title"
            render={(props) => (
              <form
                {...props}
                className={`library-import-dialog library-article-import-dialog is-${importState.type}`}
                onSubmit={submitImport}
              />
            )}
          >
            <header>
              <div>
                <strong id="library-article-import-title">
                  {t('library.import.article.title')}
                </strong>
                <span>{importHeaderMessage}</span>
              </div>
              <button
                type="button"
                aria-label={t('library.import.article.close')}
                onClick={closeImportDialog}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={17} />
              </button>
            </header>
            <div
              className={[
                'library-article-import-box',
                importState.type === 'submitting' ? 'is-submitting' : '',
                importState.type === 'imported' ? 'is-imported' : '',
                importState.type === 'duplicate' ? 'is-duplicate' : '',
                importState.type === 'error' ? 'is-error' : '',
                showParsedTitle ? 'has-parsed-title' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <label className="library-article-import-url">
                <span>{t('library.import.article.urlLabel')}</span>
                <span className="library-article-import-input">
                  {showParsedTitle && importState.type === 'imported' ? (
                    <span className="library-article-import-result-check" aria-hidden="true">
                      <LibraryImportSuccessCheck
                        className="library-article-import-result-icon"
                        size={16}
                      />
                    </span>
                  ) : (
                    <HugeiconsIcon icon={Globe02Icon} size={16} />
                  )}
                  <input
                    aria-label={t('library.import.article.urlLabel')}
                    disabled={importState.type === 'submitting' || importState.type === 'imported'}
                    inputMode="url"
                    placeholder={t('library.import.article.placeholder')}
                    title={articleInputTitle}
                    type="text"
                    value={articleInputValue}
                    onBlur={() => setInputFocused(false)}
                    onChange={(event) => {
                      setImportUrl(event.target.value);
                      if (importState.type !== 'submitting') {
                        clearImportCloseTimer();
                        clearCancelDelayTimer();
                        setImportState({ type: 'idle', message: '' });
                      }
                    }}
                    onFocus={() => setInputFocused(true)}
                  />
                </span>
              </label>
              <span className="library-article-import-actions">
                <Button
                  className="library-article-import-submit"
                  disabled={importState.type === 'submitting'}
                  type="submit"
                >
                  {importState.type === 'submitting' ? (
                    <HugeiconsIcon icon={Loading03Icon} className="is-spinning" size={16} />
                  ) : (
                    <HugeiconsIcon icon={Globe02Icon} size={16} />
                  )}
                  {importState.type === 'submitting'
                    ? t('library.import.article.parsingButton')
                    : t('library.import.article.parse')}
                </Button>
                {importState.type === 'submitting' && importState.cancelAvailable ? (
                  <Button
                    className="library-article-import-cancel"
                    type="button"
                    variant="secondary"
                    onClick={cancelImport}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={16} />
                    {t('library.import.article.cancel')}
                  </Button>
                ) : null}
              </span>
              {importState.type === 'idle' ? null : (
                <LibraryImportProgressBar
                  percent={importProgressPercent}
                  ariaLabel={t('library.import.article.progress')}
                />
              )}
              {importState.type === 'duplicate' ? (
                <span className="library-article-duplicate-callout" role="status">
                  <HugeiconsIcon icon={AlertCircleIcon} size={16} />
                  <span>
                    <strong>{t('library.import.article.duplicateTitle')}</strong>
                    <em>{t('library.import.article.duplicateDescription')}</em>
                  </span>
                </span>
              ) : null}
            </div>
            <footer>
              <span>{importFooterMessage}</span>
              {importArticle && importState.type === 'duplicate' ? (
                <button
                  type="button"
                  onClick={() => {
                    clearImportCloseTimer();
                    onClose();
                    onOpenArticle(importArticle);
                  }}
                >
                  <HugeiconsIcon icon={LinkSquare01Icon} size={14} />
                  {t('library.import.article.openDuplicate')}
                </button>
              ) : null}
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function EbookImportDialog({
  settings,
  onClose,
  onImportEbookFile,
  onOpenArticle,
}: {
  settings: ResolvedAppSettings;
  onClose: () => void;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onOpenArticle: (article: ArticleRecord) => void;
}) {
  const { t } = useTranslation();
  return (
    <FileImportDialog
      config={{
        kind: 'ebook',
        titleId: 'library-ebook-import-title',
        title: t('library.import.ebook.title'),
        closeLabel: t('library.import.ebook.close'),
        idleMessage: t('library.import.ebook.idle', { count: MAX_BATCH_IMPORT_FILES }),
        batchIdleMessage: t('library.import.ebook.idle', { count: MAX_BATCH_IMPORT_FILES }),
        accept:
          '.epub,.azw3,.mobi,application/epub+zip,application/vnd.amazon.ebook,application/x-mobipocket-ebook',
        inputId: 'library-ebook-file',
        isValidFileName: (name) => /\.(?:epub|azw3|mobi)$/i.test(name),
        maxBytes: MAX_EBOOK_IMPORT_BYTES,
        maxFileCount: MAX_BATCH_IMPORT_FILES,
        invalidFileMessage: t('library.import.ebook.invalidFile'),
        oversizeMessage: t('library.import.ebook.oversize'),
        tooManyFilesMessage: t('library.import.ebook.tooManyFiles', {
          count: MAX_BATCH_IMPORT_FILES,
        }),
        duplicateMessage: t('library.import.ebook.duplicate'),
        errorFallbackMessage: t('library.import.ebook.errorFallback'),
        idleDropTitle: t('library.import.ebook.idleDropTitle'),
        draggingDropTitle: t('library.import.ebook.draggingDropTitle'),
        importedDropTitle: t('library.import.ebook.importedDropTitle'),
        dropHint: t('library.import.ebook.dropHint'),
        footerHint: t('library.import.ebook.footerHint'),
        progressLabel: t('library.import.ebook.progress'),
        openDuplicateLabel: t('library.import.ebook.openDuplicate'),
        onImportFile: onImportEbookFile,
      }}
      settings={settings}
      onClose={onClose}
      onOpenArticle={onOpenArticle}
    />
  );
}

function PdfImportDialog({
  settings,
  onClose,
  onImportPdfFile,
  onOpenArticle,
}: {
  settings: ResolvedAppSettings;
  onClose: () => void;
  onImportPdfFile: (
    file: File,
    onProgress?: PdfImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onOpenArticle: (article: ArticleRecord) => void;
}) {
  const { t } = useTranslation();
  return (
    <FileImportDialog
      config={{
        kind: 'pdf',
        titleId: 'library-pdf-import-title',
        title: t('library.import.pdf.title'),
        closeLabel: t('library.import.pdf.close'),
        idleMessage: t('library.import.pdf.idle', { count: MAX_BATCH_IMPORT_FILES }),
        batchIdleMessage: t('library.import.pdf.idle', { count: MAX_BATCH_IMPORT_FILES }),
        accept: '.pdf,application/pdf',
        inputId: 'library-pdf-file',
        isValidFileName: (name) => name.toLowerCase().endsWith('.pdf'),
        maxBytes: MAX_PDF_IMPORT_BYTES,
        maxFileCount: MAX_BATCH_IMPORT_FILES,
        invalidFileMessage: t('library.import.pdf.invalidFile'),
        oversizeMessage: t('library.import.pdf.oversize'),
        tooManyFilesMessage: t('library.import.pdf.tooManyFiles', {
          count: MAX_BATCH_IMPORT_FILES,
        }),
        duplicateMessage: t('library.import.pdf.duplicate'),
        errorFallbackMessage: t('library.import.pdf.errorFallback'),
        idleDropTitle: t('library.import.pdf.idleDropTitle'),
        draggingDropTitle: t('library.import.pdf.draggingDropTitle'),
        importedDropTitle: t('library.import.pdf.importedDropTitle'),
        dropHint: t('library.import.pdf.dropHint'),
        footerHint: t('library.import.pdf.footerHint'),
        progressLabel: t('library.import.pdf.progress'),
        openDuplicateLabel: t('library.import.pdf.openDuplicate'),
        onImportFile: onImportPdfFile,
      }}
      settings={settings}
      onClose={onClose}
      onOpenArticle={onOpenArticle}
    />
  );
}

function FileImportDialog({
  config,
  settings,
  onClose,
  onOpenArticle,
}: {
  config: FileImportDialogConfig;
  settings: ResolvedAppSettings;
  onClose: () => void;
  onOpenArticle: (article: ArticleRecord) => void;
}) {
  const { t } = useTranslation();
  const [importState, setImportState] = useState<FileImportState>({ type: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const importCloseTimerRef = useRef<number | null>(null);

  useEffect(() => () => clearImportCloseTimer(), []);

  async function importFiles(fileList: FileList | File[] | undefined) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    clearImportCloseTimer();

    if (files.length > config.maxFileCount) {
      setImportState({
        type: 'error',
        message: config.tooManyFilesMessage,
        items: [],
        progress: 0,
      });
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

    if (validEntries.length === 0) {
      setImportState({
        type: 'error',
        message: t('library.import.noFiles'),
        items: initialItems,
        progress: 0,
      });
      resetInput();
      return;
    }

    setImportState({
      type: 'submitting',
      message: t('library.import.importing', { current: 1, total: validEntries.length }),
      items: initialItems,
      progress: 0,
    });

    let currentItems = initialItems;
    function patchImportItem(itemId: string, patch: Partial<FileImportItem>) {
      currentItems = currentItems.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      );
      setImportState((current) =>
        current.type === 'submitting' ? { ...current, items: currentItems } : current,
      );
    }

    let completedCount = 0;
    for (const entry of validEntries) {
      const itemId = entry.item.id;
      const currentIndex = completedCount;
      setImportState((current) =>
        current.type === 'submitting'
          ? {
              ...current,
              message: t('library.import.importing', {
                current: currentIndex + 1,
                total: validEntries.length,
              }),
            }
          : current,
      );
      patchImportItem(itemId, { status: 'importing', progress: 4, message: undefined });

      try {
        const result = await config.onImportFile(entry.file, (nextProgress) => {
          const itemProgress = clampNumber(nextProgress, 0, 100, 4);
          patchImportItem(itemId, { progress: itemProgress });
          setImportState((current) =>
            current.type === 'submitting'
              ? {
                  ...current,
                  progress: ((currentIndex + itemProgress / 100) / validEntries.length) * 100,
                }
              : current,
          );
        });

        if (result.status === 'canceled') {
          patchImportItem(itemId, {
            message: t('library.import.canceled'),
            progress: 100,
            status: 'error',
          });
          completedCount += 1;
          continue;
        }

        patchImportItem(itemId, {
          article: result.article,
          message:
            result.status === 'duplicate'
              ? config.duplicateMessage
              : articleImportMeta(result.article, t),
          progress: 100,
          status: result.status,
        });
      } catch (error) {
        patchImportItem(itemId, {
          message: fileImportErrorMessage(error, config.errorFallbackMessage, t),
          progress: 100,
          status: 'error',
        });
      }

      completedCount += 1;
      setImportState((current) =>
        current.type === 'submitting'
          ? { ...current, progress: (completedCount / validEntries.length) * 100 }
          : current,
      );
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
    if (importState.type === 'submitting') return;
    clearImportCloseTimer();
    setDragging(false);
    onClose();
  }

  function resetInput() {
    if (inputRef.current) inputRef.current.value = '';
  }

  function resetImport() {
    clearImportCloseTimer();
    setImportState({ type: 'idle' });
    setDragging(false);
    resetInput();
  }

  function finishImportBatch(items: FileImportItem[]) {
    const importedCount = items.filter((item) => item.status === 'imported').length;
    const duplicateCount = items.filter((item) => item.status === 'duplicate').length;
    const successCount = importedCount + duplicateCount;
    const failedCount = items.filter((item) => item.status === 'error').length;

    if (successCount === 0) {
      setImportState({
        type: 'error',
        message: t('library.import.failed'),
        items,
        progress: 100,
      });
      return;
    }

    if (importedCount === 0) {
      setImportState({
        type: failedCount > 0 ? 'error' : 'duplicate',
        message:
          failedCount > 0
            ? t('library.import.duplicateAndFailed', {
                duplicates: duplicateCount,
                failed: failedCount,
              })
            : duplicateCount === 1
              ? config.duplicateMessage
              : t('library.import.duplicateFiles', { count: duplicateCount }),
        items,
        progress: 100,
      });
      return;
    }

    setImportState({
      type: failedCount > 0 ? 'error' : 'imported',
      message:
        failedCount > 0
          ? t('library.import.importedAndFailed', {
              failed: failedCount,
              imported: successCount,
            })
          : t('library.import.importedFiles', { count: successCount }),
      items,
      progress: 100,
    });
    playImportSuccessSound(importedCount, settings);
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
    if (importState.type === 'imported') return config.importedDropTitle;
    if (dragging) return config.draggingDropTitle;
    return config.idleDropTitle;
  }

  const importItems = importState.type === 'idle' ? [] : importState.items;
  const importMessage = importState.type === 'idle' ? '' : importState.message;
  const batchProgress = importState.type === 'idle' ? 0 : importState.progress;
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
    (importState.type === 'imported' || importState.type === 'error');
  const showProgress = importState.type !== 'idle' && importItems.length > 0;
  const showResults = importItems.length > 0;
  const importProgressPercent = Math.round(clampNumber(batchProgress, 0, 100, 0));

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && closeImportDialog()}>
      <DialogPortal>
        <DialogOverlay className="library-import-modal">
          <button
            className="library-import-modal-scrim"
            type="button"
            aria-label={config.closeLabel}
            onClick={closeImportDialog}
          />
          <DialogContent
            aria-labelledby={config.titleId}
            render={(props) => (
              <section {...props} className={`library-import-dialog is-${importState.type}`} />
            )}
          >
            <header>
              <div>
                <strong id={config.titleId}>{config.title}</strong>
                <span>{importMessage || config.batchIdleMessage}</span>
                {importState.type === 'idle' ? (
                  <span>{t('library.import.localOnlyNotice')}</span>
                ) : null}
              </div>
              <button type="button" aria-label={config.closeLabel} onClick={closeImportDialog}>
                <HugeiconsIcon icon={Cancel01Icon} size={17} />
              </button>
            </header>
            <label
              className={[
                'library-ebook-dropzone',
                dragging ? 'is-dragging' : '',
                importState.type === 'submitting' ? 'is-submitting' : '',
                importState.type === 'imported' ? 'is-imported' : '',
                importState.type === 'error' ? 'is-error' : '',
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
                if (importState.type !== 'submitting') setDragging(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (importState.type === 'submitting') return;
                void importFiles(event.dataTransfer.files);
              }}
            >
              <input
                accept={config.accept}
                disabled={importState.type === 'submitting'}
                id={config.inputId}
                multiple
                ref={inputRef}
                type="file"
                onChange={(event) => void importFiles(event.target.files || undefined)}
              />
              <span
                className={[
                  'library-ebook-dropzone-icon',
                  importState.type === 'imported' ? 'is-success' : '',
                  importState.type === 'error' ? 'is-error' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {importState.type === 'submitting' ? (
                  <HugeiconsIcon icon={Loading03Icon} className="is-spinning" size={22} />
                ) : importState.type === 'imported' ? (
                  <LibraryImportSuccessCheck className="library-import-success-icon" size={24} />
                ) : importState.type === 'error' ? (
                  <HugeiconsIcon icon={Cancel01Icon} size={24} />
                ) : dragging ? (
                  <HugeiconsIcon icon={FileUploadIcon} size={24} />
                ) : (
                  <HugeiconsIcon icon={Upload01Icon} size={24} />
                )}
              </span>
              <span className="library-ebook-dropzone-copy">
                <strong>{importDropTitle()}</strong>
                <em>{config.dropHint}</em>
              </span>
              {showProgress ? (
                <LibraryImportProgressBar
                  percent={importProgressPercent}
                  ariaLabel={config.progressLabel}
                />
              ) : null}
            </label>
            {showCelebration ? (
              <div
                className="library-ebook-import-celebration"
                role="status"
                aria-label={t('library.import.ebook.celebration')}
              >
                <div className="library-ebook-import-cover-stack" aria-hidden="true">
                  {celebrationItems.map((item) => (
                    <span
                      className={[
                        'library-ebook-import-cover-card',
                        item.coverUrl ? 'has-cover' : '',
                      ]
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
                    <span className="library-ebook-import-cover-more">
                      +{hiddenCelebrationCount}
                    </span>
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
                        <HugeiconsIcon icon={Loading03Icon} className="is-spinning" size={18} />
                      ) : item.status === 'error' ? (
                        <HugeiconsIcon icon={Cancel01Icon} size={18} />
                      ) : config.kind === 'pdf' ? (
                        <HugeiconsIcon icon={Pdf01Icon} size={18} />
                      ) : (
                        <HugeiconsIcon icon={Book02Icon} size={18} />
                      )}
                    </span>
                    <span className="library-file-import-result-copy">
                      <strong>{item.article?.title || item.fileName}</strong>
                      <em>{item.message || item.fileName}</em>
                    </span>
                    <span className="library-file-import-result-state">
                      {fileImportItemStateLabel(item, t)}
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
                  <HugeiconsIcon icon={LinkSquare01Icon} size={14} />
                  {config.openDuplicateLabel}
                </button>
              ) : importState.type === 'error' ? (
                <button type="button" onClick={resetImport}>
                  {config.kind === 'pdf'
                    ? t('library.import.pdf.reselect')
                    : t('library.import.ebook.reselect')}
                </button>
              ) : null}
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
