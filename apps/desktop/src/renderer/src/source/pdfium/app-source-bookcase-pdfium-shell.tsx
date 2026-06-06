import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PdfiumBookcaseToolbar({
  author,
  title,
  onClose,
}: {
  author?: string;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="pdf-reader-toolbar">
      <button className="source-reader-back-button" type="button" onClick={onClose}>
        <ChevronLeft size={16} />
        <span>{t('common.backToLibrary')}</span>
      </button>
      <div className="pdf-reader-title">
        <strong title={title}>{title}</strong>
        {author ? <span>{author}</span> : null}
      </div>
    </header>
  );
}
