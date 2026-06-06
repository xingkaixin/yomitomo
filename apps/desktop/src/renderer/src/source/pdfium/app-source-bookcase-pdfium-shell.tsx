import { ChevronLeft } from 'lucide-react';

export function PdfiumBookcaseToolbar({
  author,
  title,
  onClose,
}: {
  author?: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <header className="pdf-reader-toolbar">
      <button className="source-reader-back-button" type="button" onClick={onClose}>
        <ChevronLeft size={16} />
        <span>返回阅读库</span>
      </button>
      <div className="pdf-reader-title">
        <strong title={title}>{title}</strong>
        {author ? <span>{author}</span> : null}
      </div>
    </header>
  );
}
