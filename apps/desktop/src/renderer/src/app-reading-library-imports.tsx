import React, { useEffect, useRef, useState } from 'react';
import {
  BookText,
  Check,
  CircleAlert,
  ExternalLink,
  FileUp,
  Globe2,
  LoaderCircle,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import type { ArticleRecord } from '@yomitomo/shared';
import { clampNumber } from '@yomitomo/reader-ui';
import { Button } from './components/ui/button';
import type { EbookImportProgressCallback } from './app-reading-types';

const MAX_EBOOK_IMPORT_BYTES = 80 * 1024 * 1024;
type ArticleImportState = 'idle' | 'submitting' | 'imported' | 'duplicate' | 'error';
export type ArticleImportResult = {
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

export function LibraryImportControls({
  onImportEbookFile,
  onImportArticleUrl,
  onOpenArticle,
}: {
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportArticleUrl: (url: string) => Promise<ArticleImportResult>;
  onOpenArticle: (article: ArticleRecord) => void;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [articleImportOpen, setArticleImportOpen] = useState(false);
  const [ebookImportOpen, setEbookImportOpen] = useState(false);

  function openArticleImportDialog() {
    setAddMenuOpen(false);
    setEbookImportOpen(false);
    setArticleImportOpen(true);
  }

  function openEbookImportDialog() {
    setAddMenuOpen(false);
    setArticleImportOpen(false);
    setEbookImportOpen(true);
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
            <button type="button" role="menuitem" onClick={openArticleImportDialog}>
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
  const importCloseTimerRef = useRef<number | null>(null);

  useEffect(() => () => clearImportCloseTimer(), []);

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
        onClose();
      }, 850);
    } catch (error) {
      setImportState('error');
      setImportMessage(articleImportErrorMessage(error));
      setImportArticle(null);
      setImportProgress(0);
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
    onClose();
  }

  const importProgressPercent = Math.round(importProgress);

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
  const [ebookImportState, setEbookImportState] = useState<ArticleImportState>('idle');
  const [ebookImportMessage, setEbookImportMessage] = useState('');
  const [ebookImportArticle, setEbookImportArticle] = useState<ArticleRecord | null>(null);
  const [ebookImportProgress, setEbookImportProgress] = useState(0);
  const [ebookDragging, setEbookDragging] = useState(false);
  const ebookInputRef = useRef<HTMLInputElement | null>(null);
  const ebookImportCloseTimerRef = useRef<number | null>(null);

  useEffect(() => () => clearEbookImportCloseTimer(), []);

  useEffect(() => {
    if (ebookImportState !== 'submitting') return;

    const timer = window.setInterval(() => {
      setEbookImportProgress(advanceImportProgress);
    }, 180);

    return () => window.clearInterval(timer);
  }, [ebookImportState]);

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
        onClose();
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

  function closeEbookImportDialog() {
    if (ebookImportState === 'submitting') return;
    clearEbookImportCloseTimer();
    setEbookDragging(false);
    onClose();
  }

  const ebookImportProgressPercent = Math.round(ebookImportProgress);

  return (
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
                onClose();
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
  );
}
