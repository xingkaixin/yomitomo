import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  ClipboardTypeIcon,
  FileUploadIcon,
  Loading03Icon,
  Upload01Icon,
} from '@hugeicons/core-free-icons';
import { useReducer } from 'react';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
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

type TextImportDialogState = {
  mode: TextImportMode;
  pasteContent: string;
  pasteAsMarkdown: boolean;
  files: File[];
  dragging: boolean;
  rows: ConfirmRow[] | null;
  errors: string[];
  busy: boolean;
};

type TextImportDialogEvent =
  | { type: 'modeSelected'; mode: TextImportMode }
  | { type: 'pasteEdited'; content: string }
  | { type: 'markdownToggled'; checked: boolean }
  | { type: 'filesSelected'; files: File[]; errors: string[] }
  | { type: 'dragEntered' }
  | { type: 'dragEnded' }
  | { type: 'prepareStarted' }
  | { type: 'prepared'; rows: ConfirmRow[] | null; errors: string[] }
  | { type: 'prepareFailed'; message: string }
  | { type: 'commitRejected'; message: string }
  | { type: 'commitStarted' }
  | { type: 'commitFailed'; message: string }
  | { type: 'committed' }
  | { type: 'rowEdited'; index: number; patch: Partial<ConfirmRow> }
  | { type: 'confirmLeft' };

const TEXT_IMPORT_ACCEPT = '.txt,.md,.markdown,text/plain,text/markdown';

const initialTextImportDialogState: TextImportDialogState = {
  mode: 'paste',
  pasteContent: '',
  pasteAsMarkdown: false,
  files: [],
  dragging: false,
  rows: null,
  errors: [],
  busy: false,
};

function textImportDialogReducer(
  state: TextImportDialogState,
  event: TextImportDialogEvent,
): TextImportDialogState {
  switch (event.type) {
    case 'modeSelected':
      return { ...state, mode: event.mode };
    case 'pasteEdited':
      return { ...state, pasteContent: event.content };
    case 'markdownToggled':
      return { ...state, pasteAsMarkdown: event.checked };
    case 'filesSelected':
      return { ...state, files: event.files, errors: event.errors };
    case 'dragEntered':
      return state.dragging ? state : { ...state, dragging: true };
    case 'dragEnded':
      return state.dragging ? { ...state, dragging: false } : state;
    case 'prepareStarted':
      return { ...state, busy: true, errors: [] };
    case 'prepared':
      return { ...state, busy: false, rows: event.rows, errors: event.errors };
    case 'prepareFailed':
    case 'commitFailed':
      return { ...state, busy: false, errors: [event.message] };
    case 'commitRejected':
      return { ...state, errors: [event.message] };
    case 'commitStarted':
      return { ...state, busy: true };
    case 'committed':
      return { ...state, busy: false };
    case 'rowEdited':
      return state.rows
        ? {
            ...state,
            rows: state.rows.map((row, position) =>
              position === event.index ? { ...row, ...event.patch } : row,
            ),
          }
        : state;
    case 'confirmLeft':
      return { ...state, rows: null };
  }
}

export function TextImportDialog({
  onBusyChange,
  onClose,
  onCommit,
}: {
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onCommit: (input: { items: TextImportCommitItem[] }) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(textImportDialogReducer, initialTextImportDialogState);
  const { mode, pasteContent, pasteAsMarkdown, files, dragging, rows, errors, busy } = state;

  useMountEffect(() => () => onBusyChange(false));

  function reasonLabel(item: Extract<TextImportPreparedItem, { ok: false }>) {
    return t(`library.import.text.reason.${item.reason}`, { fileName: item.fileName || '' });
  }

  function preparedEvent(
    items: TextImportPreparedItem[],
  ): Extract<TextImportDialogEvent, { type: 'prepared' }> {
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
    return { type: 'prepared', rows: prepared.length > 0 ? prepared : null, errors: failures };
  }

  async function handlePrepare() {
    dispatch({ type: 'prepareStarted' });
    onBusyChange(true);
    try {
      if (mode === 'paste') {
        const result = await getDesktopApi().article.text.prepareImport({
          kind: 'paste',
          content: pasteContent,
          format: pasteAsMarkdown ? 'markdown' : 'plain',
        });
        dispatch(preparedEvent(result.items));
      } else {
        const result = await getDesktopApi().article.text.prepareImport({
          kind: 'files',
          files: await readTextImportFiles(files),
        });
        dispatch(preparedEvent(result.items));
      }
    } catch {
      dispatch({ type: 'prepareFailed', message: t('library.import.text.prepareFailed') });
    }
    onBusyChange(false);
  }

  async function handleCommit() {
    if (!rows) return;
    if (
      !withinImportBudget(
        rows.map((row) => row.body.length),
        MAX_TEXT_IMPORT_BATCH_CHARS,
      )
    ) {
      dispatch({
        type: 'commitRejected',
        message: t('library.import.text.batchTooLarge', {
          count: MAX_TEXT_IMPORT_FILES,
          megabytes: Math.floor(MAX_TEXT_IMPORT_BATCH_BYTES / (1024 * 1024)),
        }),
      });
      return;
    }

    dispatch({ type: 'commitStarted' });
    onBusyChange(true);
    try {
      const items: TextImportCommitItem[] = rows.map((row) => ({
        title: row.title.trim(),
        author: row.author.trim() || undefined,
        format: row.format,
        body: row.body,
        frontMatter: row.frontMatter,
      }));
      await onCommit({ items });
      dispatch({ type: 'committed' });
      onBusyChange(false);
      onClose();
    } catch {
      dispatch({ type: 'commitFailed', message: t('library.import.text.commitFailed') });
      onBusyChange(false);
    }
  }

  function selectFiles(fileList: FileList | null | undefined) {
    if (!fileList || fileList.length === 0) return;

    const selection = Array.from(fileList);
    const accepted = acceptTextImportFiles(selection);

    dispatch({
      type: 'filesSelected',
      files: accepted,
      errors:
        accepted.length === selection.length
          ? []
          : [
              t('library.import.text.batchTooLarge', {
                count: MAX_TEXT_IMPORT_FILES,
                megabytes: Math.floor(MAX_TEXT_IMPORT_BATCH_BYTES / (1024 * 1024)),
              }),
            ],
    });
  }

  function updateRow(index: number, patch: Partial<ConfirmRow>) {
    dispatch({ type: 'rowEdited', index, patch });
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
                    onClick={() => dispatch({ type: 'modeSelected', mode: 'paste' })}
                  >
                    <HugeiconsIcon icon={ClipboardTypeIcon} size={15} />
                    {t('library.import.text.modePaste')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'upload'}
                    className={mode === 'upload' ? 'is-active' : ''}
                    onClick={() => dispatch({ type: 'modeSelected', mode: 'upload' })}
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
                      onChange={(event) =>
                        dispatch({ type: 'pasteEdited', content: event.target.value })
                      }
                    />
                    <label className="library-text-import-toggle">
                      <input
                        type="checkbox"
                        checked={pasteAsMarkdown}
                        onChange={(event) =>
                          dispatch({ type: 'markdownToggled', checked: event.target.checked })
                        }
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
                      dispatch({ type: 'dragEnded' });
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      dispatch({ type: 'dragEntered' });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      dispatch({ type: 'dragEnded' });
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
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => dispatch({ type: 'confirmLeft' })}
                >
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
