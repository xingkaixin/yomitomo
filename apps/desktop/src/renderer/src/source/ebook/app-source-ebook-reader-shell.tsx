import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import type React from 'react';
import {
  ReaderAppView,
  type ReaderAppViewProps,
  type ReaderSurfaceHandle,
} from '@yomitomo/reader-ui/reader-app-view';
import { readerDesktopEmbeddedBundleStyles } from '@yomitomo/reader-ui/reader-styles';
import { sourceEbookReaderStyles } from './app-source-bookcase-ebook-utils';

type EbookReaderShellProps = {
  readerApp: ReaderAppViewProps;
  readerSurfaceRef: React.RefObject<ReaderSurfaceHandle | null>;
  readerState: {
    status: 'loading' | 'ready' | 'error';
    message: string;
  };
  isSpread: boolean;
  viewHostRef: React.RefObject<HTMLDivElement | null>;
  measureHostRef: React.RefObject<HTMLDivElement | null>;
  onReaderKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
};

export function EbookReaderShell({
  readerApp,
  readerSurfaceRef,
  readerState,
  isSpread,
  viewHostRef,
  measureHostRef,
  onReaderKeyDown,
}: EbookReaderShellProps) {
  const readerSettings = readerApp.settings.readerSettings;

  return (
    <section
      className={`source-bookcase source-ebook-reader-shell ebook-reader-shell${
        isSpread ? ' is-ebook-spread' : ''
      }`}
    >
      <style>{`${readerDesktopEmbeddedBundleStyles}\n${sourceEbookReaderStyles}`}</style>
      <ReaderAppView
        {...readerApp}
        ref={readerSurfaceRef}
        article={{
          ...readerApp.article,
          content: (
            <div
              className="ebook-reader-content"
              style={
                {
                  '--ebook-content-width': `${readerSettings.contentWidth * (isSpread ? 2 : 1)}px`,
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
                    '--ebook-content-width': `${readerSettings.contentWidth * (isSpread ? 2 : 1)}px`,
                  } as React.CSSProperties
                }
              >
                <div className="ebook-foliate-frame" ref={viewHostRef} />
                <div className="ebook-click-paging-hints" aria-hidden="true">
                  <span className="ebook-click-paging-hint is-left">
                    <HugeiconsIcon icon={ArrowLeft01Icon} size={24} strokeWidth={2.2} />
                  </span>
                  <span className="ebook-click-paging-hint is-right">
                    <HugeiconsIcon icon={ArrowRight01Icon} size={24} strokeWidth={2.2} />
                  </span>
                </div>
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
