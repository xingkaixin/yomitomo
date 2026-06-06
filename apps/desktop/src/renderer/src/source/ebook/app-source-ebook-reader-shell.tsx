import type React from 'react';
import { ChevronLeft } from 'lucide-react';
import { ReaderAppView, type ReaderAppViewProps } from '@yomitomo/reader-ui/reader-app-view';
import {
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
} from '@yomitomo/reader-ui/reader-styles';
import { sourceEbookReaderStyles } from './app-source-bookcase-ebook-utils';

type EbookReaderShellProps = {
  readerApp: ReaderAppViewProps;
  readerState: {
    status: 'loading' | 'ready' | 'error';
    message: string;
  };
  viewHostRef: React.RefObject<HTMLDivElement | null>;
  measureHostRef: React.RefObject<HTMLDivElement | null>;
  onReaderKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
};

export function EbookReaderShell({
  readerApp,
  readerState,
  viewHostRef,
  measureHostRef,
  onReaderKeyDown,
}: EbookReaderShellProps) {
  const readerSettings = readerApp.settings.readerSettings;

  return (
    <section className="source-bookcase source-ebook-reader-shell ebook-reader-shell">
      <button
        className="source-reader-back-button"
        type="button"
        onClick={readerApp.actions.shell.onClose}
      >
        <ChevronLeft size={16} />
        <span>返回阅读库</span>
      </button>
      <style>{`${readerStyles}\n${readerConversationStyles}\n${readerDesktopEmbeddedStyles}\n${sourceEbookReaderStyles}`}</style>
      <ReaderAppView
        {...readerApp}
        article={{
          ...readerApp.article,
          content: (
            <div
              className="ebook-reader-content"
              style={
                {
                  '--ebook-content-width': `${readerSettings.contentWidth}px`,
                } as React.CSSProperties
              }
            >
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
            </div>
          ),
        }}
      />
    </section>
  );
}
