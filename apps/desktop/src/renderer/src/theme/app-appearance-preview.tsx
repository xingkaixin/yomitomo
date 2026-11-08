import { useCallback, useReducer, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, PencilEdit01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { readerDesktopEmbeddedBundleStyles } from '@yomitomo/reader-ui/reader-styles';
import { readerBackgroundTone } from '@yomitomo/reader-ui/reader-settings';
import { applyAppTheme, themeRegistry, type AppThemeId } from './app-theme';
import { desktopPlatform } from '../shell/app-shell-chrome';

const viewport = { width: 400, height: 280 };

export function AppearancePreview({ themeId, paper }: { themeId: AppThemeId; paper: string }) {
  const { t, i18n } = useTranslation();
  const [{ frameDocument, scale }, dispatch] = useReducer(appearancePreviewReducer, {
    frameDocument: null,
    scale: 1,
  });
  const language = i18n.resolvedLanguage || 'zh-CN';

  const observeWidth = useCallback((container: HTMLSpanElement) => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) =>
      dispatch({ type: 'resized', scale: entry.contentRect.width / viewport.width }),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Reattaches whenever the loaded document, theme or language changes.
  const syncFrameTheme = useCallback(() => {
    if (!frameDocument) return;
    applyAppTheme(themeRegistry[themeId], frameDocument.documentElement);
    frameDocument.documentElement.lang = language;
  }, [frameDocument, language, themeId]);

  return (
    <span
      className="appearance-preview"
      ref={observeWidth}
      aria-hidden="true"
      style={{ aspectRatio: `${viewport.width} / ${viewport.height}` }}
    >
      <iframe
        ref={syncFrameTheme}
        title={t('theme.preview.reader')}
        tabIndex={-1}
        sandbox="allow-same-origin"
        srcDoc="<!doctype html><html><head></head><body inert><div id='root'></div></body></html>"
        style={{ width: viewport.width, height: viewport.height, transform: `scale(${scale})` }}
        onLoad={(event) => {
          const doc = event.currentTarget.contentDocument;
          if (!doc) return;
          const base = doc.createElement('base');
          base.href = document.baseURI;
          doc.head.append(base);
          // Theme overrides target :root, so each preview needs its own document.
          document.querySelectorAll('style, link[rel="stylesheet"]').forEach((element) => {
            doc.head.append(element.cloneNode(true));
          });
          const readerStyle = doc.createElement('style');
          readerStyle.textContent = readerDesktopEmbeddedBundleStyles;
          doc.head.append(readerStyle);
          applyAppTheme(themeRegistry[themeId], doc.documentElement);
          dispatch({ type: 'frameLoaded', frameDocument: doc });
        }}
      />
      {frameDocument
        ? createPortal(<ReaderPreview paper={paper} />, frameDocument.getElementById('root')!)
        : null}
    </span>
  );
}

type AppearancePreviewState = { frameDocument: Document | null; scale: number };

type AppearancePreviewEvent =
  | { type: 'frameLoaded'; frameDocument: Document }
  | { type: 'resized'; scale: number };

function appearancePreviewReducer(
  state: AppearancePreviewState,
  event: AppearancePreviewEvent,
): AppearancePreviewState {
  switch (event.type) {
    case 'frameLoaded':
      return { ...state, frameDocument: event.frameDocument };
    case 'resized':
      return { ...state, scale: event.scale };
  }
}

function ReaderPreview({ paper }: { paper: string }) {
  const { t } = useTranslation();
  const tone = readerBackgroundTone(paper);
  return (
    <main className={`app-shell is-${desktopPlatform()} is-reader-open appearance-paper-scene`}>
      <div className="source-bookcase source-reader-shell">
        <div
          className={`reader-app is-embedded is-reader-background-${tone}`}
          style={{ '--reader-font-size': '20px', '--reader-content-bg': paper } as CSSProperties}
        >
          <header className="reader-toolbar">
            <button className="reader-back" type="button">
              <HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
              <span>{t('nav.library')}</span>
            </button>
            <div className="reader-toolbar-actions">
              <HugeiconsIcon icon={Search01Icon} size={18} />
              <HugeiconsIcon icon={PencilEdit01Icon} size={18} />
            </div>
          </header>
          <article className="reader-article">
            <header className="reader-article-header">
              <h1>{t('theme.sample.book1')}</h1>
              <p>{t('theme.sample.author')}</p>
            </header>
            <div className="reader-article-body">
              <p>{t('theme.sample.paperLine')}</p>
              <p>
                <mark className="reader-highlight">{t('theme.sample.highlight')}</mark>
              </p>
              <p>{t('theme.sample.readingLine')}</p>
            </div>
            <span className="appearance-paper-note" aria-hidden="true">
              <HugeiconsIcon icon={PencilEdit01Icon} size={18} />
            </span>
          </article>
        </div>
      </div>
    </main>
  );
}
