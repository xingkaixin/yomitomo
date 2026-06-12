import { useState, type CSSProperties } from 'react';
import { Check, Palette, X } from 'lucide-react';
import {
  defaultReaderBackgroundForTone,
  readerBackgroundOptions,
  readerBackgroundTone,
  type ReaderBackgroundTone,
} from '@yomitomo/reader-ui/reader-settings';
import {
  defaultThemeIdForTone,
  themeRegistry,
  themeToCssVariables,
  visibleThemeIds,
  type AppThemeTone,
  type AppTheme,
  type AppThemeId,
} from './app-theme';
import {
  elementDialogSourceRect,
  useSourceAwareDialogTransition,
  type DialogSourceRect,
} from '../shell/app-dialog-transition';
import { useTranslation } from 'react-i18next';
import {
  readerPaperDisplayName,
  themeDisplayDescription,
  themeDisplayName,
} from '../i18n/app-i18n-labels';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { IconButton } from '../components/ui/icon-button';

type ThemeSelectorProps = {
  activeThemeId: AppThemeId;
  open: boolean;
  readerBackgroundColor: string;
  readerBackgroundsByTone?: Record<ReaderBackgroundTone, string>;
  themeIdsByTone?: Record<AppThemeTone, AppThemeId>;
  onOpenChange: (open: boolean) => void;
  onSelectReaderBackground: (backgroundColor: string) => void;
  onSelectTheme: (themeId: AppThemeId, readerBackgroundColor?: string) => void;
};

export function ThemeSelector({
  activeThemeId,
  open,
  readerBackgroundColor,
  readerBackgroundsByTone = defaultReaderBackgroundsByTone,
  themeIdsByTone = defaultThemeIdsByTone,
  onOpenChange,
  onSelectReaderBackground,
  onSelectTheme,
}: ThemeSelectorProps) {
  const { t } = useTranslation();
  const [sourceRect, setSourceRect] = useState<DialogSourceRect | null>(null);
  const dialogStyle = useSourceAwareDialogTransition(sourceRect);
  const activeTone = themeRegistry[activeThemeId].meta.tone;
  const visibleToneThemeIds = visibleThemeIds.filter(
    (themeId) => themeRegistry[themeId].meta.tone === activeTone,
  );
  const visibleReaderBackgroundOptions = readerBackgroundOptions.filter(
    (option) => option.tone === activeTone,
  );

  function selectTone(tone: AppThemeTone) {
    onSelectTheme(themeIdsByTone[tone], readerBackgroundsByTone[tone]);
    onSelectReaderBackground(readerBackgroundsByTone[tone]);
  }

  function selectTheme(themeId: AppThemeId) {
    const tone = themeRegistry[themeId].meta.tone;
    onSelectTheme(themeId);
    if (readerBackgroundTone(readerBackgroundColor) !== tone) {
      onSelectReaderBackground(defaultReaderBackgroundForTone(tone));
    }
  }

  function selectReaderBackground(backgroundColor: string) {
    const tone = readerBackgroundTone(backgroundColor);
    if (tone !== activeTone) {
      onSelectTheme(themeIdsByTone[tone], backgroundColor);
    }
    onSelectReaderBackground(backgroundColor);
  }

  return (
    <>
      <IconButton
        aria-label={t('theme.open')}
        className="app-nav-theme-button"
        data-tooltip={t('theme.title')}
        onClick={(event) => {
          setSourceRect(elementDialogSourceRect(event.currentTarget));
          onOpenChange(true);
        }}
      >
        <Palette aria-hidden="true" size={18} strokeWidth={2.2} />
      </IconButton>
      {open ? (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogPortal>
            <DialogOverlay className="theme-dialog-overlay">
              <DialogContent className="theme-dialog source-aware-dialog" style={dialogStyle}>
                <header className="theme-dialog-header">
                  <div>
                    <span className="theme-dialog-icon">
                      <Palette aria-hidden="true" size={18} strokeWidth={2.2} />
                    </span>
                    <div>
                      <DialogTitle id="theme-dialog-title">{t('theme.title')}</DialogTitle>
                      <DialogDescription>{t('theme.description')}</DialogDescription>
                    </div>
                  </div>
                  <IconButton
                    aria-label={t('theme.close')}
                    className="theme-dialog-close"
                    onClick={() => onOpenChange(false)}
                  >
                    <X aria-hidden="true" size={18} />
                  </IconButton>
                </header>
                <div className="theme-tone-switch" role="group" aria-label={t('theme.category')}>
                  {themeToneOptions.map((option) => (
                    <button
                      aria-pressed={activeTone === option.tone}
                      className={activeTone === option.tone ? 'is-active' : undefined}
                      key={option.tone}
                      type="button"
                      onClick={() => selectTone(option.tone)}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
                <div className="theme-card-grid">
                  {visibleToneThemeIds.map((themeId) => {
                    const theme = themeRegistry[themeId];
                    return (
                      <ThemeCard
                        active={activeThemeId === themeId}
                        key={themeId}
                        theme={theme}
                        t={t}
                        onClick={() => selectTheme(themeId)}
                      />
                    );
                  })}
                </div>
                <section aria-labelledby="reader-paper-title" className="theme-reader-paper">
                  <div>
                    <h3 id="reader-paper-title">{t('theme.readerPaperTitle')}</h3>
                    <p>{t('theme.readerPaperDescription')}</p>
                  </div>
                  <div className="theme-reader-paper-options">
                    {visibleReaderBackgroundOptions.map((option) => {
                      const label = readerPaperDisplayName(option.label);
                      return (
                        <button
                          aria-label={t('theme.readerPaperOption', { label })}
                          aria-pressed={readerBackgroundColor === option.value}
                          className={
                            readerBackgroundColor === option.value
                              ? 'theme-reader-paper-option is-active'
                              : 'theme-reader-paper-option'
                          }
                          key={option.value}
                          style={{ '--reader-paper-option': option.value } as CSSProperties}
                          title={label}
                          type="button"
                          onClick={() => selectReaderBackground(option.value)}
                        >
                          <span aria-hidden="true" className="theme-reader-paper-sheet">
                            <svg className="theme-reader-paper-scribble" viewBox="0 0 70 78">
                              <path
                                d="M48 8 C34 0 10 8 6 26 C2 46 12 68 33 70 C54 72 68 56 65 36 C62 16 46 2 27 7 C17 10 10 17 8 27 C6 36 9 45 15 52"
                                pathLength={1}
                              />
                            </svg>
                          </span>
                          <strong>{label}</strong>
                        </button>
                      );
                    })}
                  </div>
                  {activeTone === 'dark' ? (
                    <p className="theme-reader-paper-note">{t('theme.pdfKeepsOriginalColor')}</p>
                  ) : null}
                </section>
              </DialogContent>
            </DialogOverlay>
          </DialogPortal>
        </Dialog>
      ) : null}
    </>
  );
}

const themeToneOptions: Array<{
  labelKey: 'theme.light' | 'theme.dark';
  tone: ReaderBackgroundTone;
}> = [
  { labelKey: 'theme.light', tone: 'light' },
  { labelKey: 'theme.dark', tone: 'dark' },
];

const defaultThemeIdsByTone: Record<AppThemeTone, AppThemeId> = {
  light: defaultThemeIdForTone('light'),
  dark: defaultThemeIdForTone('dark'),
};

const defaultReaderBackgroundsByTone: Record<ReaderBackgroundTone, string> = {
  light: defaultReaderBackgroundForTone('light'),
  dark: defaultReaderBackgroundForTone('dark'),
};

function ThemeCard({
  active,
  theme,
  t,
  onClick,
}: {
  active: boolean;
  theme: AppTheme;
  t: ReturnType<typeof useTranslation>['t'];
  onClick: () => void;
}) {
  const previewStyle = themeToCssVariables(theme) as CSSProperties;

  return (
    <button
      aria-pressed={active}
      className={active ? 'theme-card is-active' : 'theme-card'}
      type="button"
      onClick={onClick}
    >
      <span className="theme-preview-frame" style={previewStyle}>
        <span className="theme-preview-shell">
          <span className="theme-preview-masthead">
            <span className="theme-preview-brand">Yomitomo</span>
            <span className="theme-preview-actions">
              <span />
              <span />
            </span>
          </span>
          <span className="theme-preview-nav">
            <span className="is-active">{t('nav.library')}</span>
            <span>{t('nav.agents')}</span>
            <span>{t('nav.stats')}</span>
          </span>
          <span className="theme-preview-library">
            <span className="theme-preview-book">
              <span className="theme-preview-cover" />
              <span className="theme-preview-lines">
                <span />
                <span />
              </span>
            </span>
            <span className="theme-preview-book">
              <span className="theme-preview-cover is-muted" />
              <span className="theme-preview-lines">
                <span />
                <span />
              </span>
            </span>
          </span>
        </span>
      </span>
      <span className="theme-card-body">
        <span>
          <strong>{themeDisplayName(theme.meta.id)}</strong>
          <small>{themeDisplayDescription(theme.meta.id, theme.meta.description)}</small>
        </span>
        <span className="theme-card-check" aria-hidden="true">
          {active ? <Check size={15} strokeWidth={2.4} /> : null}
        </span>
      </span>
    </button>
  );
}
