import type React from 'react';
import { useCallback, useReducer, useRef } from 'react';
import type { ResolvedAppSettings } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { MAX_TEXT_IMPORT_BYTES } from '../../../ipc/article-import-boundary';
import type { TextImportCommitInput, TextImportCommitItem } from '../../../ipc-contract';
import { getDesktopApi } from '../shell/app-desktop-api';
import type {
  EbookImportProgressCallback,
  PdfImportProgressCallback,
} from '../shell/app-reading-types';
import { appToast } from '../shell/app-toast';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import type { ArticleImportResult } from './app-reading-library-imports';
import { classifyDroppedLibraryFiles, hasDraggedFiles } from './library-file-drop';
import { acceptTextImportFiles, readTextImportFiles } from './text-import-batch';

type UseLibraryFileDropOptions = {
  disabled: boolean;
  settings: ResolvedAppSettings;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportPdfFile: (
    file: File,
    onProgress?: PdfImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onCommitTextImport: (input: TextImportCommitInput) => Promise<unknown>;
};

function dragActiveReducer(_active: boolean, event: { type: 'entered' | 'left' }) {
  return event.type === 'entered';
}

export function useLibraryFileDrop({
  disabled,
  settings,
  onImportEbookFile,
  onImportPdfFile,
  onCommitTextImport,
}: UseLibraryFileDropOptions) {
  const { t } = useTranslation();
  const [dragging, dispatchDragging] = useReducer(dragActiveReducer, false);
  const dragDepthRef = useRef(0);
  const importingRef = useRef(false);

  const resetDrag = useCallback(() => {
    dragDepthRef.current = 0;
    dispatchDragging({ type: 'left' });
  }, []);

  const onDragEnter = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (disabled || !hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      if (dragDepthRef.current === 1) dispatchDragging({ type: 'entered' });
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (disabled || !hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [disabled],
  );

  const onDragLeave = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (disabled || !hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) dispatchDragging({ type: 'left' });
    },
    [disabled],
  );

  const importDroppedFiles = useCallback(
    async (fileList: FileList) => {
      if (importingRef.current) return;
      const grouped = classifyDroppedLibraryFiles(Array.from(fileList));
      const supportedCount = grouped.ebooks.length + grouped.pdfs.length + grouped.texts.length;

      if (supportedCount === 0) {
        appToast.error(t('library.import.dropUnsupported'));
        return;
      }

      importingRef.current = true;
      const noticeId = appToast.progress(
        t('library.import.dropImporting', { count: supportedCount }),
        { progress: { value: 0.05 } },
      );

      let completed = 0;
      let importedCount = 0;
      let duplicateCount = 0;
      let failedCount = 0;

      const advanceProgress = () => {
        completed += 1;
        appToast.updateProgress(noticeId, {
          progress: {
            value: Math.min(0.98, completed / Math.max(1, supportedCount)),
            label: `${completed}/${supportedCount}`,
          },
        });
      };

      try {
        for (const file of grouped.ebooks) {
          try {
            const result = await onImportEbookFile(file);
            if (result.status === 'imported') importedCount += 1;
            else if (result.status === 'duplicate') duplicateCount += 1;
          } catch {
            failedCount += 1;
          }
          advanceProgress();
        }

        for (const file of grouped.pdfs) {
          try {
            const result = await onImportPdfFile(file);
            if (result.status === 'imported') importedCount += 1;
            else if (result.status === 'duplicate') duplicateCount += 1;
          } catch {
            failedCount += 1;
          }
          advanceProgress();
        }

        if (grouped.texts.length > 0) {
          const accepted = acceptTextImportFiles(
            grouped.texts.filter((file) => file.size <= MAX_TEXT_IMPORT_BYTES),
          );
          failedCount += grouped.texts.length - accepted.length;
          if (accepted.length > 0) {
            try {
              const prepared = await getDesktopApi().article.text.prepareImport({
                kind: 'files',
                files: await readTextImportFiles(accepted),
              });
              const commitItems: TextImportCommitItem[] = [];
              for (const item of prepared.items) {
                if (item.ok) {
                  commitItems.push({
                    title: item.suggestedTitle,
                    author: item.suggestedAuthor || undefined,
                    format: item.format,
                    body: item.body,
                    frontMatter: item.frontMatter,
                  });
                } else {
                  failedCount += 1;
                }
              }
              if (commitItems.length > 0) {
                await onCommitTextImport({ items: commitItems });
                importedCount += commitItems.length;
              }
            } catch {
              failedCount += accepted.length;
            }
          }
          completed += grouped.texts.length;
          appToast.updateProgress(noticeId, {
            progress: { value: 0.98, label: `${completed}/${supportedCount}` },
          });
        }

        if (importedCount > 0) {
          playAppSoundEffect(
            importedCount > 1 ? 'library.import_success_multiple' : 'library.import_success_single',
            settings,
          );
        }

        const skippedCount = grouped.unsupported.length;
        if (importedCount > 0) {
          const details: string[] = [];
          if (duplicateCount > 0) {
            details.push(t('library.import.dropDuplicateCount', { count: duplicateCount }));
          }
          if (failedCount > 0) {
            details.push(t('library.import.dropFailedCount', { count: failedCount }));
          }
          if (skippedCount > 0) {
            details.push(t('library.import.dropSkippedCount', { count: skippedCount }));
          }
          appToast.complete(
            noticeId,
            failedCount > 0 || skippedCount > 0 ? 'warning' : 'success',
            t('library.import.dropSuccess', { count: importedCount }),
            details.length > 0 ? { description: details.join(' · ') } : undefined,
          );
        } else if (duplicateCount > 0 && failedCount === 0) {
          appToast.complete(
            noticeId,
            'info',
            t('library.import.dropAllDuplicate', { count: duplicateCount }),
          );
        } else {
          appToast.complete(
            noticeId,
            'error',
            t('library.import.dropFailed', { count: failedCount || supportedCount }),
          );
        }
      } finally {
        importingRef.current = false;
      }
    },
    [onCommitTextImport, onImportEbookFile, onImportPdfFile, settings, t],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (disabled || !hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      resetDrag();
      const files = event.dataTransfer.files;
      if (!files || files.length === 0) return;
      void importDroppedFiles(files);
    },
    [disabled, importDroppedFiles, resetDrag],
  );

  return {
    dragging: !disabled && dragging,
    handlers: {
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
    },
  };
}
