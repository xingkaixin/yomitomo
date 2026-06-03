import type React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ReaderAppView, type ReaderAppViewProps } from '@yomitomo/reader-ui/reader-app-view';
import {
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
} from '@yomitomo/reader-ui/reader-styles';
import { sourceEbookReaderStyles } from './app-source-bookcase-ebook-utils';

type EbookReaderShellProps = Omit<ReaderAppViewProps, 'articleContent'> & {
  readerState: {
    status: 'loading' | 'ready' | 'error';
    message: string;
  };
  paginationReady: boolean;
  pageLabel: string;
  sectionFractions: number[];
  progressTickId: string;
  progressPercent: number;
  progress: number;
  viewHostRef: React.RefObject<HTMLDivElement | null>;
  measureHostRef: React.RefObject<HTMLDivElement | null>;
  onGoLeft: () => void;
  onGoRight: () => void;
  onGoToProgress: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onReaderKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
};

export function EbookReaderShell({
  readerState,
  readerSettings,
  paginationReady,
  pageLabel,
  sectionFractions,
  progressTickId,
  progressPercent,
  progress,
  viewHostRef,
  measureHostRef,
  onGoLeft,
  onGoRight,
  onGoToProgress,
  onReaderKeyDown,
  ...readerAppProps
}: EbookReaderShellProps) {
  return (
    <section className="source-bookcase source-ebook-reader-shell ebook-reader-shell">
      <button className="source-reader-back-button" type="button" onClick={readerAppProps.onClose}>
        <ChevronLeft size={16} />
        <span>返回阅读库</span>
      </button>
      <style>{`${readerStyles}\n${readerConversationStyles}\n${readerDesktopEmbeddedStyles}\n${sourceEbookReaderStyles}`}</style>
      <ReaderAppView
        {...readerAppProps}
        articleContent={
          <div
            className="ebook-reader-content"
            style={
              { '--ebook-content-width': `${readerSettings.contentWidth}px` } as React.CSSProperties
            }
          >
            <div className="ebook-page-control-row">
              <div
                className={
                  paginationReady
                    ? 'ebook-page-control-actions'
                    : 'ebook-page-control-actions is-paginating'
                }
              >
                <button
                  className="ebook-icon-button"
                  type="button"
                  aria-label="上一页"
                  disabled={readerState.status !== 'ready' || !paginationReady}
                  onClick={onGoLeft}
                >
                  <ChevronLeft size={17} />
                </button>
                <span className="ebook-location-label">{pageLabel}</span>
                <button
                  className="ebook-icon-button"
                  type="button"
                  aria-label="下一页"
                  disabled={readerState.status !== 'ready' || !paginationReady}
                  onClick={onGoRight}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
            <div
              className={`ebook-page-stage is-${readerState.status}`}
              tabIndex={0}
              onKeyDown={onReaderKeyDown}
              style={
                {
                  '--ebook-font-size': `${readerSettings.fontSize}px`,
                  '--ebook-content-width': `${readerSettings.contentWidth}px`,
                } as React.CSSProperties
              }
            >
              <div className="ebook-foliate-frame" ref={viewHostRef} />
              {readerState.status !== 'ready' ? (
                <div className="ebook-reader-status" role="status">
                  {readerState.message}
                </div>
              ) : null}
              <div className="ebook-foliate-measurer" ref={measureHostRef} aria-hidden="true" />
            </div>
            <div className="ebook-reader-progress">
              <input
                aria-label="快速跳转阅读进度"
                className="ebook-progress-slider"
                disabled={readerState.status !== 'ready'}
                list={sectionFractions.length > 0 ? progressTickId : undefined}
                max="1"
                min="0"
                step="any"
                style={{ '--ebook-progress-percent': `${progressPercent}%` } as React.CSSProperties}
                type="range"
                value={progress}
                onChange={onGoToProgress}
              />
              {sectionFractions.length > 0 ? (
                <datalist id={progressTickId}>
                  {sectionFractions.map((fraction, index) => (
                    <option value={fraction} key={`${index}-${fraction}`} />
                  ))}
                </datalist>
              ) : null}
            </div>
          </div>
        }
        readerSettings={readerSettings}
      />
    </section>
  );
}
