import { HugeiconsIcon } from '@hugeicons/react';
import { Book02Icon, Globe02Icon, Pdf01Icon, SmartPhone01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';

type LibraryLocalImportEntryHandlers = {
  disabled?: boolean;
  onAddWebArticle: () => void;
  onAddEbook: () => void;
  onAddPdf: () => void;
};

export type LibraryImportEntryHandlers = Omit<LibraryLocalImportEntryHandlers, 'disabled'> & {
  weReadConfigured: boolean;
  weReadSyncing: boolean;
  onSyncWeRead: () => void;
  onConnectWeRead?: () => void;
};

function LocalImportEntries({
  disabled = false,
  onAddWebArticle,
  onAddEbook,
  onAddPdf,
}: LibraryLocalImportEntryHandlers) {
  const { t } = useTranslation();
  return (
    <>
      <button
        className="library-empty-entry"
        disabled={disabled}
        type="button"
        onClick={onAddWebArticle}
      >
        <span className="library-empty-entry-icon">
          <HugeiconsIcon icon={Globe02Icon} size={18} />
        </span>
        <span className="library-empty-entry-copy">
          <strong>{t('library.empty.entry.webTitle')}</strong>
          <em>{t('library.empty.entry.webHint')}</em>
        </span>
      </button>
      <button
        className="library-empty-entry"
        disabled={disabled}
        type="button"
        onClick={onAddEbook}
      >
        <span className="library-empty-entry-icon">
          <HugeiconsIcon icon={Book02Icon} size={18} />
        </span>
        <span className="library-empty-entry-copy">
          <strong>{t('library.empty.entry.ebookTitle')}</strong>
          <em>{t('library.empty.entry.ebookHint')}</em>
        </span>
      </button>
      <button className="library-empty-entry" disabled={disabled} type="button" onClick={onAddPdf}>
        <span className="library-empty-entry-icon">
          <HugeiconsIcon icon={Pdf01Icon} size={18} />
        </span>
        <span className="library-empty-entry-copy">
          <strong>{t('library.empty.entry.pdfTitle')}</strong>
          <em>{t('library.empty.entry.pdfHint')}</em>
        </span>
      </button>
    </>
  );
}

export function LibraryLocalImportEntryGrid(handlers: LibraryLocalImportEntryHandlers) {
  return (
    <div className="library-empty-entries">
      <LocalImportEntries {...handlers} />
    </div>
  );
}

export function LibraryImportEntryGrid({
  weReadConfigured,
  weReadSyncing,
  onAddWebArticle,
  onAddEbook,
  onAddPdf,
  onSyncWeRead,
  onConnectWeRead,
}: LibraryImportEntryHandlers) {
  const { t } = useTranslation();
  return (
    <div className="library-empty-entries">
      <LocalImportEntries
        onAddEbook={onAddEbook}
        onAddPdf={onAddPdf}
        onAddWebArticle={onAddWebArticle}
      />
      <button
        className="library-empty-entry"
        type="button"
        disabled={weReadConfigured && weReadSyncing}
        onClick={weReadConfigured ? onSyncWeRead : onConnectWeRead}
      >
        <span className="library-empty-entry-icon">
          <HugeiconsIcon icon={SmartPhone01Icon} size={18} />
        </span>
        <span className="library-empty-entry-copy">
          <strong>{t('library.empty.entry.wereadTitle')}</strong>
          <em>
            {weReadConfigured
              ? t('library.empty.entry.wereadHintReady')
              : t('library.empty.entry.wereadHint')}
          </em>
        </span>
      </button>
    </div>
  );
}
