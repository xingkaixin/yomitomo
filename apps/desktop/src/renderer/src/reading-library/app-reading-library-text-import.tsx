import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  ClipboardTypeIcon,
  FileUploadIcon,
  Loading03Icon,
  Upload01Icon,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextImportCommitItem, TextImportPreparedItem } from '../../../ipc-contract';
import {
  MAX_TEXT_IMPORT_BATCH_BYTES,
  MAX_TEXT_IMPORT_BATCH_CHARS,
  MAX_TEXT_IMPORT_FILES,
  withinImportBudget,
} from '../../../ipc/article-import-boundary';
import { acceptTextImportFiles, readTextImportFiles } from './text-import-batch';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '../components/ui/dialog';
import { getDesktopApi } from '../shell/app-desktop-api';

type TextImportMode = 'paste' | 'upload';
type TextFormat = 'plain' | 'markdown';

type ConfirmRow = {
  title: string;
  author: string;
  format: TextFormat;
  body: string;
  fileName?: string;
  frontMatter?: Record<string, string>;
};

const TEXT_IMPORT_ACCEPT = '.txt,.md,.markdown,text/plain,text/markdown';

export function TextImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TextImportMode>('paste');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteAsMarkdown, setPasteAsMarkdown] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<ConfirmRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function reasonLabel(item: Extract<TextImportPreparedItem, { ok: false }>) {
    return t(`library.import.text.reason.${item.reason}`, { fileName: item.fileName || '' });
  }

  function applyPrepared(items: TextImportPreparedItem[]) {
    const prepared: ConfirmRow[] = [];
    const failures: string[] = [];
    for (const item of items) {
      if (item.ok) {
        prepared.push({
          title: item.suggestedTitle,
          author: item.suggestedAuthor || '',
          format: item.format,
          body: item.body,
          fileName: item.fileName,
          frontMatter: item.frontMatter,
        });
      } else {
        failures.push(reasonLabel(item));
      }
    }
    setErrors(failures);
    setRows(prepared.length > 0 ? prepared : null);
  }

  async function handlePrepare() {
    setBusy(true);
    setErrors([]);
    try {
      if (mode === 'paste') {
        const result = await getDesktopApi().article.text.prepareImport({
          kind: 'paste',
          content: pasteContent,
          format: pasteAsMarkdown ? 'markdown' : 'plain',
        });
        applyPrepared(result.items);
      } else {
        const result = await getDesktopApi().article.text.prepareImport({
          kind: 'files',
          files: await readTextImportFiles(files),
        });
        applyPrepared(result.items);
      }
    } catch {
      setErrors([t('library.import.text.prepareFailed')]);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!rows) return;
    if (
      !withinImportBudget(
        rows.map((row) => row.body.length),
        MAX_TEXT_IMPORT_BATCH_CHARS,
      )
    ) {
      setErrors([
        t('library.import.text.batchTooLarge', {
          count: MAX_TEXT_IMPORT_FILES,
          megabytes: Math.floor(MAX_TEXT_IMPORT_BATCH_BYTES / (1024 * 1024)),
        }),
      ]);
      return;
    }

    setBusy(true);
    try {
      const items: TextImportCommitItem[] = rows.map((row) => ({
        title: row.title.trim(),
        author: row.author.trim() || undefined,
        format: row.format,
        body: row.body,
        frontMatter: row.frontMatter,
      }));
      await getDesktopApi().article.text.commitImport({ items });
      onClose();
    } catch {
      setErrors([t('library.import.text.commitFailed')]);
      setBusy(false);
    }
  }

  function selectFiles(fileList: FileList | null | undefined) {
    if (!fileList || fileList.length === 0) return;

    const selection = Array.from(fileList);
    const accepted = acceptTextImportFiles(selection);

    setFiles(accepted);
    setErrors(
      accepted.length === selection.length
        ? []
        : [
            t('library.import.text.batchTooLarge', {
              count: MAX_TEXT_IMPORT_FILES,
              megabytes: Math.floor(MAX_TEXT_IMPORT_BATCH_BYTES / (1024 * 1024)),
            }),
          ],
    );
  }

  function updateRow(index: number, patch: Partial<ConfirmRow>) {
    setRows((current) =>
      current
        ? current.map((row, position) => (position === index ? { ...row, ...patch } : row))
        : current,
    );
  }

  const canPrepare = mode === 'paste' ? pasteContent.trim().length > 0 : files.length > 0;
  const canCommit = Boolean(rows && rows.every((row) => row.title.trim().length > 0));
  const inConfirm = rows !== null;

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogPortal>
        <DialogOverlay className="library-import-modal">
          <button
            className="library-import-modal-scrim"
            type="button"
            aria-label={t('library.import.text.close')}
            onClick={onClose}
          />
          <DialogContent
            aria-labelledby="library-text-import-title"
            render={(props) => (
              <section {...props} className="library-import-dialog library-text-import" />
            )}
          >
            <header>
              <div>
                <strong id="library-text-import-title">{t('library.import.text.title')}</strong>
                <span>
                  {inConfirm ? t('library.import.text.confirmHint') : t('library.import.text.hint')}
                </span>
                <span>{t('library.import.localOnlyNotice')}</span>
              </div>
              <button type="button" aria-label={t('library.import.text.close')} onClick={onClose}>
                <HugeiconsIcon icon={Cancel01Icon} size={17} />
              </button>
            </header>

            {inConfirm ? (
              <div className="library-text-import-confirm">
                {rows?.map((row, index) => (
                  <div className="library-text-import-row" key={row.fileName ?? `paste-${index}`}>
                    {row.fileName ? (
                      <span className="library-text-import-filename">{row.fileName}</span>
                    ) : null}
                    <label className="library-text-import-field">
                      <span>{t('library.import.text.titleLabel')}</span>
                      <input
                        type="text"
                        value={row.title}
                        placeholder={t('library.import.text.titlePlaceholder')}
                        onChange={(event) => updateRow(index, { title: event.target.value })}
                      />
                    </label>
                    <label className="library-text-import-field">
                      <span>{t('library.import.text.authorLabel')}</span>
                      <input
                        type="text"
                        value={row.author}
                        placeholder={t('library.import.text.authorPlaceholder')}
                        onChange={(event) => updateRow(index, { author: event.target.value })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <div className="library-text-import-input">
                <div className="library-text-import-modes" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'paste'}
                    className={mode === 'paste' ? 'is-active' : ''}
                    onClick={() => setMode('paste')}
                  >
                    <HugeiconsIcon icon={ClipboardTypeIcon} size={15} />
                    {t('library.import.text.modePaste')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'upload'}
                    className={mode === 'upload' ? 'is-active' : ''}
                    onClick={() => setMode('upload')}
                  >
                    <HugeiconsIcon icon={Upload01Icon} size={15} />
                    {t('library.import.text.modeUpload')}
                  </button>
                </div>

                {mode === 'paste' ? (
                  <>
                    <textarea
                      className="library-text-import-textarea"
                      value={pasteContent}
                      placeholder={t('library.import.text.pastePlaceholder')}
                      onChange={(event) => setPasteContent(event.target.value)}
                    />
                    <label className="library-text-import-toggle">
                      <input
                        type="checkbox"
                        checked={pasteAsMarkdown}
                        onChange={(event) => setPasteAsMarkdown(event.target.checked)}
                      />
                      {t('library.import.text.asMarkdown')}
                    </label>
                  </>
                ) : (
                  <label
                    className={['library-ebook-dropzone', dragging ? 'is-dragging' : '']
                      .filter(Boolean)
                      .join(' ')}
                    htmlFor="library-text-import-file"
                    onDragLeave={(event) => {
                      event.preventDefault();
                      setDragging(false);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      selectFiles(event.dataTransfer.files);
                    }}
                  >
                    <input
                      accept={TEXT_IMPORT_ACCEPT}
                      id="library-text-import-file"
                      multiple
                      type="file"
                      onChange={(event) => selectFiles(event.target.files)}
                    />
                    <span className="library-ebook-dropzone-icon">
                      {dragging ? (
                        <HugeiconsIcon icon={FileUploadIcon} size={24} />
                      ) : (
                        <HugeiconsIcon icon={Upload01Icon} size={24} />
                      )}
                    </span>
                    <span className="library-ebook-dropzone-copy">
                      <strong>
                        {files.length > 0
                          ? t('library.import.text.filesSelected', { count: files.length })
                          : t('library.import.text.dropTitle')}
                      </strong>
                      <em>{t('library.import.text.dropHint')}</em>
                    </span>
                  </label>
                )}
              </div>
            )}

            {errors.length > 0 ? (
              <ul className="library-text-import-errors">
                {errors.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            ) : null}

            <footer className="library-text-import-actions">
              {inConfirm ? (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setRows(null)}>
                  {t('library.import.text.back')}
                </Button>
              ) : (
                <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                  {t('library.import.text.cancel')}
                </Button>
              )}
              {inConfirm ? (
                <Button type="button" disabled={!canCommit || busy} onClick={handleCommit}>
                  {busy ? (
                    <HugeiconsIcon icon={Loading03Icon} className="is-spinning" size={16} />
                  ) : null}
                  {t('library.import.text.import')}
                </Button>
              ) : (
                <Button type="button" disabled={!canPrepare || busy} onClick={handlePrepare}>
                  {busy ? (
                    <HugeiconsIcon icon={Loading03Icon} className="is-spinning" size={16} />
                  ) : null}
                  {t('library.import.text.next')}
                </Button>
              )}
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
