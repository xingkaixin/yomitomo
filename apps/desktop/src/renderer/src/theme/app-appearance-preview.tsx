import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  ColorPickerIcon,
  PlusSignIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import type { ArticleSummaryRecord } from '@yomitomo/shared';
import { readerDesktopEmbeddedBundleStyles } from '@yomitomo/reader-ui/reader-styles';
import { readerBackgroundTone } from '@yomitomo/reader-ui/reader-settings';
import { applyAppTheme, themeRegistry, type AppThemeId } from './app-theme';
import { AppMasthead, desktopPlatform } from '../shell/app-shell-chrome';
import { SettingsNavButton } from '../settings/app-settings-nav-button';
import { ArticleLibraryCard } from '../reading-library/app-reading-library-card';
import { Input } from '../components/ui/input';

export type AppearancePreviewScene = 'library' | 'reader' | 'pdf';

export function AppearancePreview({
  themeId,
  paper,
  scene = 'library',
  thumbnail = false,
}: {
  themeId: AppThemeId;
  paper: string;
  scene?: AppearancePreviewScene;
  thumbnail?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1000));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!frameDocument) return;
    applyAppTheme(themeRegistry[themeId], frameDocument.documentElement);
    frameDocument.documentElement.lang = i18n.resolvedLanguage || 'zh-CN';
  }, [frameDocument, themeId, i18n.resolvedLanguage]);

  return (
    <div className="appearance-preview" ref={containerRef} aria-hidden={thumbnail || undefined}>
      <iframe
        title={t(`theme.preview.${scene}`)}
        tabIndex={-1}
        sandbox="allow-same-origin"
        srcDoc="<!doctype html><html><head></head><body inert><div id='root'></div></body></html>"
        style={{ transform: `scale(${scale})` }}
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
          setFrameDocument(doc);
        }}
      />
      {frameDocument
        ? createPortal(
            scene === 'library' ? (
              <LibraryPreview />
            ) : (
              <ReaderPreview paper={paper} pdf={scene === 'pdf'} />
            ),
            frameDocument.getElementById('root')!,
          )
        : null}
    </div>
  );
}

function LibraryPreview() {
  const { t } = useTranslation();
  const articles: ArticleSummaryRecord[] = [0, 1, 2, 3].map((index) => ({
    id: `appearance-preview-${index}`,
    title: t(`theme.sample.book${index + 1}`),
    byline: t('theme.sample.author'),
    url: '',
    canonicalUrl: '',
    contentHash: '',
    sourceType: 'text',
    text: { format: 'plain' },
    createdAt: '2026-06-22T08:00:00Z',
    updatedAt: '2026-06-22T08:00:00Z',
    readingProgress: {
      kind: 'scroll',
      progress: [0.35, 0.68, 0.12, 0][index],
      updatedAt: '2026-06-22T08:00:00Z',
    },
    counts: {
      annotationCount: 3 + index,
      thoughtCount: 0,
      discussionCommentCount: 0,
      aiCommentCount: 0,
      distillationCount: 1,
    },
  }));

  return (
    <main className={`app-shell is-${desktopPlatform()}`}>
      <AppMasthead>
        <nav className="app-section-nav">
          <div className="app-section-links">
            {['library', 'readingMemory', 'agents', 'stats', 'settings'].map((item) => (
              <SettingsNavButton
                key={item}
                active={item === 'library'}
                label={t(`nav.${item}`)}
                onClick={() => undefined}
              />
            ))}
          </div>
          <div className="app-section-actions">
            <button className="app-nav-theme-button" type="button">
              <HugeiconsIcon icon={ColorPickerIcon} size={18} />
            </button>
          </div>
        </nav>
      </AppMasthead>
      <section className="settings-content">
        <section className="library-home is-mixed">
          <header className="library-home-header">
            <div className="library-home-header-main">
              <div className="library-search-typed">
                <HugeiconsIcon icon={Search01Icon} size={19} />
                <button className="library-type-filter-button" type="button">
                  {t('library.typeFilter.allShort')}
                </button>
                <div className="library-search-field">
                  <Input placeholder={t('library.searchLabel')} readOnly />
                </div>
              </div>
              <div className="library-home-actions">
                <button className="library-add-trigger" type="button">
                  <HugeiconsIcon icon={PlusSignIcon} size={20} />
                </button>
              </div>
            </div>
          </header>
          <div className="library-home-body">
            <div className="library-source-panel">
              <div className="library-page-panel">
                <div className="library-entity-scroll">
                  <div className="library-entity-grid">
                    {articles.map((article) => (
                      <ArticleLibraryCard
                        key={article.id}
                        article={article}
                        pinned={article === articles[0]}
                        onOpen={() => undefined}
                        onDelete={() => undefined}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function ReaderPreview({ paper, pdf }: { paper: string; pdf: boolean }) {
  const { t } = useTranslation();
  const tone = readerBackgroundTone(paper);
  return (
    <main className={`app-shell is-${desktopPlatform()} is-reader-open`}>
      <div
        className={`source-bookcase source-reader-shell${pdf ? ' source-pdf-reader-shell' : ''}`}
      >
        <div
          className={`reader-app is-embedded is-reader-background-${tone}`}
          style={
            {
              '--reader-font-size': '20px',
              '--reader-content-width': '680px',
              '--reader-content-bg': paper,
            } as CSSProperties
          }
        >
          <header className="reader-toolbar">
            <button className="reader-back" type="button">
              <HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
              <span>{t('nav.library')}</span>
            </button>
            <div className="reader-toolbar-article">
              <div className="reader-toolbar-article-copy">
                <div className="reader-toolbar-article-title">{t('theme.sample.book1')}</div>
                <p className="reader-toolbar-article-meta">
                  <span>{t('theme.sample.author')}</span>
                  <span>{pdf ? 'PDF' : t('theme.preview.reader')}</span>
                </p>
              </div>
            </div>
            <div className="reader-toolbar-actions">
              <span>35%</span>
            </div>
          </header>
          <div className="appearance-reader-layout">
            <article className={pdf ? 'appearance-pdf-page' : 'reader-article'}>
              <header className="reader-article-header">
                <h1>{t('theme.sample.book1')}</h1>
                <p>{t('theme.sample.author')}</p>
              </header>
              <div className="reader-article-body">
                <p>{t('theme.sample.paragraph1')}</p>
                <p>
                  <mark className="reader-highlight">{t('theme.sample.highlight')}</mark>
                </p>
                <p>{t('theme.sample.paragraph2')}</p>
                <h2>{t('theme.sample.section')}</h2>
                <p>{t('theme.sample.paragraph3')}</p>
              </div>
            </article>
            <aside className="appearance-reader-notes">
              <div className="reader-note">
                <div className="reader-note-body">
                  <strong>{t('theme.sample.noteTitle')}</strong>
                  <blockquote>{t('theme.sample.highlight')}</blockquote>
                  <p>{t('theme.sample.note')}</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
