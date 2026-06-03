import { ChevronDown, ChevronLeft, ChevronUp, List } from 'lucide-react';
import { ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import type React from 'react';
import { Button } from '../../components/ui/button';
import {
  pdfPageProgressPercent,
  type PdfAnnotationNavigationState,
} from './app-source-bookcase-pdfium-utils';

export function PdfiumBookcaseToolbar({
  author,
  navigation,
  title,
  tocCount,
  tocOpen,
  onClose,
  onNavigateAnnotation,
  onToggleToc,
}: {
  author?: string;
  navigation: PdfAnnotationNavigationState;
  title: string;
  tocCount: number;
  tocOpen: boolean;
  onClose: () => void;
  onNavigateAnnotation: (annotationId: string) => void;
  onToggleToc: () => void;
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
      <div className="pdf-reader-controls" aria-label="PDF 阅读控制">
        <button
          aria-label="切换目录"
          aria-pressed={tocCount > 0 && tocOpen}
          className={
            tocCount > 0 && tocOpen
              ? 'reader-icon-button reader-toc-toggle is-active'
              : 'reader-icon-button reader-toc-toggle'
          }
          disabled={tocCount === 0}
          type="button"
          onClick={onToggleToc}
        >
          <List size={18} />
        </button>
        <div className="reader-annotation-nav" aria-label="划线快捷选择">
          <button
            aria-label="上一个划线"
            className="reader-icon-button"
            disabled={!navigation.previousId}
            title="上一个划线"
            type="button"
            onClick={() => {
              if (navigation.previousId) onNavigateAnnotation(navigation.previousId);
            }}
          >
            <ChevronUp size={17} />
          </button>
          <button
            aria-label="下一个划线"
            className="reader-icon-button"
            disabled={!navigation.nextId}
            title="下一个划线"
            type="button"
            onClick={() => {
              if (navigation.nextId) onNavigateAnnotation(navigation.nextId);
            }}
          >
            <ChevronDown size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}

export function PdfiumDocumentFloatingToolbar({
  currentPage,
  pageCount,
  zoom,
  onNextPage,
  onPageChange,
  onPreviousPage,
  onZoomIn,
  onZoomOut,
}: {
  currentPage: number;
  pageCount: number;
  zoom: number;
  onNextPage: () => void;
  onPageChange: (pageNumber: number) => void;
  onPreviousPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="pdfium-spike-floating-toolbar">
      <Button
        aria-label="上一页"
        disabled={currentPage <= 1}
        size="icon"
        type="button"
        variant="ghost"
        onClick={onPreviousPage}
      >
        <ChevronLeft size={16} />
      </Button>
      <span>
        {currentPage} / {pageCount}
      </span>
      <input
        aria-label="快速跳转 PDF 页码"
        className="ebook-progress-slider pdfium-page-slider"
        max={pageCount}
        min="1"
        step="1"
        style={
          {
            '--ebook-progress-percent': `${pdfPageProgressPercent(currentPage, pageCount)}%`,
          } as React.CSSProperties
        }
        type="range"
        value={currentPage}
        onChange={(event) => onPageChange(Number(event.currentTarget.value))}
      />
      <Button
        aria-label="下一页"
        disabled={currentPage >= pageCount}
        size="icon"
        type="button"
        variant="ghost"
        onClick={onNextPage}
      >
        <ChevronRight size={16} />
      </Button>
      <Button aria-label="缩小" size="icon" type="button" variant="ghost" onClick={onZoomOut}>
        <ZoomOut size={16} />
      </Button>
      <span>{Math.round(zoom * 100)}%</span>
      <Button aria-label="放大" size="icon" type="button" variant="ghost" onClick={onZoomIn}>
        <ZoomIn size={16} />
      </Button>
    </div>
  );
}
