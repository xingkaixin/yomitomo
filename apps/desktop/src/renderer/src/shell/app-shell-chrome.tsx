import { HugeiconsIcon } from '@hugeicons/react';
import { VolumeHighIcon } from '@hugeicons/core-free-icons';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings } from '@yomitomo/shared';
import { getDesktopApi } from './app-desktop-api';
import { playAppSoundEffect } from '../sound/app-sound-effects';

export function desktopPlatform() {
  return getDesktopApi().platform;
}

export function AppMasthead({
  children,
  settings,
}: {
  children: ReactNode;
  settings?: AppSettings;
}) {
  return (
    <header className="app-masthead">
      <BrandTitle settings={settings} />
      {children}
    </header>
  );
}

export function StartupShell() {
  return (
    <main className={`app-shell is-${desktopPlatform()}`}>
      <AppMasthead>
        <StartupNav />
      </AppMasthead>
      <section className="settings-content">
        <LibrarySkeleton />
      </section>
    </main>
  );
}

export function LibrarySkeleton() {
  return (
    <div className="library-skeleton" aria-busy="true">
      <header className="library-skeleton-header">
        <span className="library-skeleton-title" />
        <span className="library-skeleton-action" />
      </header>
      <div className="library-skeleton-toolbar">
        <span />
        <span />
      </div>
      <div className="library-skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <span className="library-skeleton-card" key={index}>
            <i />
            <b />
            <em />
          </span>
        ))}
      </div>
    </div>
  );
}

function BrandTitle({ settings }: { settings?: AppSettings }) {
  const { t } = useTranslation();
  return (
    <div className="app-masthead-title">
      <h1>
        <button
          aria-label={`Yomitomo · ${t('brandPronounce')}`}
          className="app-masthead-wordmark"
          type="button"
          onClick={() => playAppSoundEffect('brand.pronunciation', settings || {})}
        >
          <span>Yomitomo</span>
          <HugeiconsIcon icon={VolumeHighIcon} aria-hidden="true" size={14} />
        </button>
      </h1>
    </div>
  );
}

function StartupNav() {
  const { t } = useTranslation();
  return (
    <nav className="app-section-nav" aria-label={t('nav.main')}>
      <div className="app-section-links">
        <button className="settings-nav-item is-active" disabled type="button">
          <span>{t('startup.library')}</span>
        </button>
        <button className="settings-nav-item" disabled type="button">
          <span>{t('startup.agents')}</span>
        </button>
        <button className="settings-nav-item" disabled type="button">
          <span>{t('startup.stats')}</span>
        </button>
        <button className="settings-nav-item" disabled type="button">
          <span>{t('startup.settings')}</span>
        </button>
      </div>
    </nav>
  );
}
