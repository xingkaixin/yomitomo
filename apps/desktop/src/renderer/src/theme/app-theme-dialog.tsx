import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemePreference } from '@yomitomo/shared';
import { readerBackgroundOptions } from '@yomitomo/reader-ui/reader-settings';
import { themeRegistry } from './app-theme';
import { AppearancePreview } from './app-appearance-preview';
import type { ThemeSelectorProps } from './app-theme-selector';
import { readerPaperDisplayName } from '../i18n/app-i18n-labels';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { IconButton } from '../components/ui/icon-button';
import { playAppSoundEffect } from '../sound/app-sound-effects';

const themePreferences: ThemePreference[] = ['light', 'dark', 'system'];

export function ThemeDialog({
  activeThemeId,
  themePreference,
  readerBackgroundColor,
  soundSettings = {},
  onOpenChange,
  onSelectReaderBackground,
  onSelectThemePreference,
  dialogStyle,
}: ThemeSelectorProps & { dialogStyle: CSSProperties }) {
  const { t } = useTranslation();
  const activeTone = themeRegistry[activeThemeId].meta.tone;

  function selectPreference(preference: ThemePreference) {
    if (preference === themePreference) return;
    onSelectThemePreference(preference);
    playAppSoundEffect('theme.appearance_switch', soundSettings);
  }

  function selectPaper(paper: string) {
    if (paper === readerBackgroundColor) return;
    onSelectReaderBackground(paper);
    playAppSoundEffect('theme.appearance_switch', soundSettings);
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
                  {themePreferences.map((preference) => (
                    <button
                      key={preference}
                      className={
                        themePreference === preference
                          ? 'theme-tone-option is-active'
                          : 'theme-tone-option'
                      }
                      aria-pressed={themePreference === preference}
                      type="button"
                      onClick={() => selectPreference(preference)}
                    >
                      {t(`theme.${preference}`)}
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
                          <AppearancePreview themeId={activeThemeId} paper={option.value} />
                          <strong>
                            {label}
                            <SelectionCircle />
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

function SelectionCircle() {
  return (
    <svg
      aria-hidden="true"
      className="theme-choice-scribble"
      preserveAspectRatio="none"
      viewBox="0 0 70 78"
    >
      <path
        d="M48 8 C34 0 10 8 6 26 C2 46 12 68 33 70 C54 72 68 56 65 36 C62 16 46 2 27 7 C17 10 10 17 8 27 C6 36 9 45 15 52"
        pathLength={1}
      />
    </svg>
  );
}
