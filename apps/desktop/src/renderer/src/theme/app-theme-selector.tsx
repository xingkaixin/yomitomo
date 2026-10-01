import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, ColorPickerIcon, Tick01Icon } from '@hugeicons/core-free-icons';
import { useState, type CSSProperties } from 'react';
import {
  defaultReaderBackgroundForTone,
  readerBackgroundOptions,
  type ReaderBackgroundTone,
} from '@yomitomo/reader-ui/reader-settings';
import {
  defaultThemeIdForTone,
  themeRegistry,
  visibleThemeIds,
  type AppThemeTone,
  type AppThemeId,
} from './app-theme';
import { AppearancePreview } from './app-appearance-preview';
import {
  elementDialogSourceRect,
  useSourceAwareDialogTransition,
  type DialogSourceRect,
} from '../shell/app-dialog-transition';
import { useTranslation } from 'react-i18next';
import { readerPaperDisplayName, themeDisplayName } from '../i18n/app-i18n-labels';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { IconButton } from '../components/ui/icon-button';
import type { ResolvedAppSettings } from '@yomitomo/shared';
import { playAppSoundEffect } from '../sound/app-sound-effects';

type ThemeSelectorProps = {
  activeThemeId: AppThemeId;
  open: boolean;
  readerBackgroundColor: string;
  soundSettings?: Partial<Pick<ResolvedAppSettings, 'soundEffectsEnabled' | 'soundEffectsVolume'>>;
  readerBackgroundsByTone?: Record<ReaderBackgroundTone, string>;
  themeIdsByTone?: Record<AppThemeTone, AppThemeId>;
  onOpenChange: (open: boolean) => void;
  onSelectReaderBackground: (backgroundColor: string) => void;
  onSelectTheme: (themeId: AppThemeId, readerBackgroundColor?: string) => void;
};

export function ThemeSelector(props: ThemeSelectorProps) {
  const { t } = useTranslation();
  const [sourceRect, setSourceRect] = useState<DialogSourceRect | null>(null);
  const dialogStyle = useSourceAwareDialogTransition(sourceRect);
  return (
    <>
      <IconButton
        aria-label={t('theme.open')}
        className="app-nav-theme-button"
        data-tooltip={t('theme.title')}
        onClick={(event) => {
          setSourceRect(elementDialogSourceRect(event.currentTarget));
          props.onOpenChange(true);
        }}
      >
        <HugeiconsIcon icon={ColorPickerIcon} aria-hidden="true" size={18} strokeWidth={2.2} />
      </IconButton>
      {props.open ? <ThemeDialog {...props} dialogStyle={dialogStyle} /> : null}
    </>
  );
}

function ThemeDialog({
  activeThemeId,
  readerBackgroundColor,
  soundSettings = {},
  readerBackgroundsByTone = defaultReaderBackgroundsByTone,
  themeIdsByTone = defaultThemeIdsByTone,
  onOpenChange,
  onSelectReaderBackground,
  onSelectTheme,
  dialogStyle,
}: ThemeSelectorProps & { dialogStyle: CSSProperties }) {
  const { t } = useTranslation();
  const activeTone = themeRegistry[activeThemeId].meta.tone;

  function selectTone(tone: AppThemeTone) {
    if (tone === activeTone) return;
    onSelectTheme(themeIdsByTone[tone], readerBackgroundsByTone[tone]);
    onSelectReaderBackground(readerBackgroundsByTone[tone]);
  }

  function selectPaper(paper: string) {
    if (paper === readerBackgroundColor) return;
    onSelectReaderBackground(paper);
    playAppSoundEffect('theme.paper_switch', soundSettings);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="theme-dialog-overlay">
          <DialogContent className="theme-dialog source-aware-dialog" style={dialogStyle}>
            <header className="theme-dialog-header">
              <div>
                <DialogTitle>{t('theme.title')}</DialogTitle>
                <DialogDescription>{t('theme.description')}</DialogDescription>
              </div>
              <IconButton
                aria-label={t('theme.close')}
                className="theme-dialog-close"
                onClick={() => onOpenChange(false)}
              >
                <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" size={18} />
              </IconButton>
            </header>
            <div className="theme-dialog-body">
              <section aria-label={t('theme.title')}>
                <div className="theme-tone-switch" role="group" aria-label={t('theme.category')}>
                  {(['light', 'dark'] as const).map((tone) => (
                    <button
                      key={tone}
                      className={
                        activeTone === tone ? 'theme-tone-option is-active' : 'theme-tone-option'
                      }
                      aria-pressed={activeTone === tone}
                      type="button"
                      onClick={() => selectTone(tone)}
                    >
                      {t(`theme.${tone}`)}
                    </button>
                  ))}
                </div>
                <div className="theme-card-grid">
                  {visibleThemeIds
                    .filter((id) => themeRegistry[id].meta.tone === activeTone)
                    .map((id) => (
                      <button
                        key={id}
                        className={activeThemeId === id ? 'theme-card is-active' : 'theme-card'}
                        aria-label={themeDisplayName(id)}
                        aria-pressed={activeThemeId === id}
                        type="button"
                        onClick={() => {
                          if (id !== activeThemeId) onSelectTheme(id);
                        }}
                      >
                        <AppearancePreview themeId={id} />
                        <strong>{themeDisplayName(id)}</strong>
                        {activeThemeId === id ? (
                          <HugeiconsIcon
                            className="theme-card-check"
                            icon={Tick01Icon}
                            size={16}
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    ))}
                </div>
              </section>
              <section aria-labelledby="reader-paper-title" className="theme-reader-paper">
                <h3 id="reader-paper-title">{t('theme.readerPaperTitle')}</h3>
                <p>{t('theme.readerPaperDescription')}</p>
                <div className="theme-reader-paper-options">
                  {readerBackgroundOptions
                    .filter((option) => option.tone === activeTone)
                    .map((option) => {
                      const label = readerPaperDisplayName(option.label);
                      return (
                        <button
                          key={option.value}
                          className={
                            readerBackgroundColor === option.value
                              ? 'theme-reader-paper-option is-active'
                              : 'theme-reader-paper-option'
                          }
                          aria-label={t('theme.readerPaperOption', { label })}
                          aria-pressed={readerBackgroundColor === option.value}
                          type="button"
                          onClick={() => selectPaper(option.value)}
                        >
                          <AppearancePreview
                            themeId={activeThemeId}
                            paper={option.value}
                            scene="reader"
                          />
                          <strong>
                            {label}
                            <svg
                              aria-hidden="true"
                              className="theme-paper-scribble"
                              preserveAspectRatio="none"
                              viewBox="0 0 70 78"
                            >
                              <path
                                d="M48 8 C34 0 10 8 6 26 C2 46 12 68 33 70 C54 72 68 56 65 36 C62 16 46 2 27 7 C17 10 10 17 8 27 C6 36 9 45 15 52"
                                pathLength={1}
                              />
                            </svg>
                          </strong>
                        </button>
                      );
                    })}
                </div>
                {activeTone === 'dark' ? (
                  <p className="theme-reader-paper-note">{t('theme.pdfKeepsOriginalColor')}</p>
                ) : null}
              </section>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

const defaultThemeIdsByTone: Record<AppThemeTone, AppThemeId> = {
  light: defaultThemeIdForTone('light'),
  dark: defaultThemeIdForTone('dark'),
};
const defaultReaderBackgroundsByTone: Record<ReaderBackgroundTone, string> = {
  light: defaultReaderBackgroundForTone('light'),
  dark: defaultReaderBackgroundForTone('dark'),
};
