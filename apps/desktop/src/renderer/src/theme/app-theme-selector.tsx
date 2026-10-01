import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, ColorPickerIcon, Tick01Icon } from '@hugeicons/core-free-icons';
import { useState, type CSSProperties } from 'react';
import {
  defaultReaderBackgroundForTone,
  readerBackgroundOptions,
  readerBackgroundTone,
  type ReaderBackgroundTone,
} from '@yomitomo/reader-ui/reader-settings';
import {
  defaultThemeIdForTone,
  themeRegistry,
  visibleThemeIds,
  type AppThemeTone,
  type AppThemeId,
} from './app-theme';
import { AppearancePreview, type AppearancePreviewScene } from './app-appearance-preview';
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
import { Button } from '../components/ui/button';
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
  const [draft, setDraft] = useState<{ themeId: AppThemeId; paper: string }>({
    themeId: activeThemeId,
    paper: readerBackgroundColor,
  });
  const [browsingTone, setBrowsingTone] = useState(themeRegistry[activeThemeId].meta.tone);
  const [scene, setScene] = useState<AppearancePreviewScene>('library');
  const [choicesByTone, setChoicesByTone] = useState<
    Record<AppThemeTone, { themeId: AppThemeId; paper: string }>
  >({
    light: { themeId: themeIdsByTone.light, paper: readerBackgroundsByTone.light },
    dark: { themeId: themeIdsByTone.dark, paper: readerBackgroundsByTone.dark },
    [themeRegistry[activeThemeId].meta.tone]: {
      themeId: activeThemeId,
      paper: readerBackgroundColor,
    },
  });
  const changed = draft.themeId !== activeThemeId || draft.paper !== readerBackgroundColor;

  function selectTheme(themeId: AppThemeId) {
    const tone = themeRegistry[themeId].meta.tone;
    const next: { themeId: AppThemeId; paper: string } = { ...choicesByTone[tone], themeId };
    setDraft(next);
    setChoicesByTone({ ...choicesByTone, [tone]: next });
    setScene('library');
  }

  function selectPaper(paper: string) {
    const tone = readerBackgroundTone(paper);
    const next: { themeId: AppThemeId; paper: string } = { ...choicesByTone[tone], paper };
    setDraft(next);
    setChoicesByTone({ ...choicesByTone, [tone]: next });
    setScene('reader');
  }

  function apply() {
    if (draft.themeId !== activeThemeId) onSelectTheme(draft.themeId, draft.paper);
    if (draft.paper !== readerBackgroundColor) {
      onSelectReaderBackground(draft.paper);
      playAppSoundEffect('theme.paper_switch', soundSettings);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="theme-dialog-overlay">
          <DialogContent className="theme-dialog source-aware-dialog" style={dialogStyle}>
            <header className="theme-dialog-header">
              <div>
                <span className="theme-dialog-icon">
                  <HugeiconsIcon icon={ColorPickerIcon} aria-hidden="true" size={18} />
                </span>
                <div>
                  <DialogTitle>{t('theme.title')}</DialogTitle>
                  <DialogDescription>{t('theme.description')}</DialogDescription>
                </div>
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
              <div className="theme-dialog-choices">
                <section aria-labelledby="theme-interface-title">
                  <h3 id="theme-interface-title">{t('theme.interfaceTitle')}</h3>
                  <div className="theme-tone-switch" role="group" aria-label={t('theme.category')}>
                    {(['light', 'dark'] as const).map((tone) => (
                      <button
                        key={tone}
                        className={
                          browsingTone === tone
                            ? 'theme-tone-option is-active'
                            : 'theme-tone-option'
                        }
                        aria-pressed={browsingTone === tone}
                        type="button"
                        onClick={() => setBrowsingTone(tone)}
                      >
                        {t(`theme.${tone}`)}
                      </button>
                    ))}
                  </div>
                  <div className="theme-card-grid">
                    {visibleThemeIds
                      .filter((id) => themeRegistry[id].meta.tone === browsingTone)
                      .map((id) => (
                        <button
                          key={id}
                          className={draft.themeId === id ? 'theme-card is-active' : 'theme-card'}
                          aria-pressed={draft.themeId === id}
                          type="button"
                          onClick={() => selectTheme(id)}
                        >
                          <AppearancePreview
                            themeId={id}
                            paper={choicesByTone[browsingTone].paper}
                            thumbnail
                          />
                          <span className="theme-card-body">
                            <strong>{themeDisplayName(id)}</strong>
                            <small>
                              {themeDisplayDescription(id, themeRegistry[id].meta.description)}
                            </small>
                          </span>
                          {draft.themeId === id ? (
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
                      .filter((option) => option.tone === browsingTone)
                      .map((option) => {
                        const label = readerPaperDisplayName(option.label);
                        return (
                          <button
                            key={option.value}
                            className={
                              draft.paper === option.value
                                ? 'theme-reader-paper-option is-active'
                                : 'theme-reader-paper-option'
                            }
                            aria-label={t('theme.readerPaperOption', { label })}
                            aria-pressed={draft.paper === option.value}
                            type="button"
                            onClick={() => selectPaper(option.value)}
                          >
                            <span
                              className="theme-reader-paper-sheet"
                              aria-hidden="true"
                              style={
                                {
                                  '--reader-paper-option': option.value,
                                  '--reader-paper-ink':
                                    themeRegistry[choicesByTone[browsingTone].themeId].reader.ink,
                                } as CSSProperties
                              }
                            >
                              <b>Aa</b>
                              <span>{t('theme.sample.paperLine')}</span>
                              <i />
                            </span>
                            <strong>{label}</strong>
                          </button>
                        );
                      })}
                  </div>
                </section>
              </div>
              <section className="theme-dialog-preview" aria-label={t('theme.previewTitle')}>
                <div className="theme-preview-heading">
                  <h3>{t('theme.previewTitle')}</h3>
                  <span>{t(changed ? 'theme.pending' : 'theme.current')}</span>
                </div>
                <div
                  className="theme-preview-scenes"
                  role="group"
                  aria-label={t('theme.previewScene')}
                >
                  {(['library', 'reader', 'pdf'] as const).map((item) => (
                    <button
                      key={item}
                      aria-pressed={scene === item}
                      className={scene === item ? 'is-active' : ''}
                      type="button"
                      onClick={() => setScene(item)}
                    >
                      {t(`theme.preview.${item}`)}
                    </button>
                  ))}
                </div>
                <AppearancePreview themeId={draft.themeId} paper={draft.paper} scene={scene} />
                <div className="theme-preview-caption">
                  <strong>
                    {themeDisplayName(draft.themeId)} ·{' '}
                    {readerPaperDisplayName(
                      readerBackgroundOptions.find((option) => option.value === draft.paper)
                        ?.label || draft.paper,
                    )}
                  </strong>
                  <p>
                    {t(
                      scene === 'pdf' && readerBackgroundTone(draft.paper) === 'dark'
                        ? 'theme.pdfKeepsOriginalColor'
                        : 'theme.previewDescription',
                    )}
                  </p>
                </div>
              </section>
            </div>
            <footer className="theme-dialog-footer">
              <p>{t('theme.applyHint')}</p>
              <div>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {t('common.cancel')}
                </Button>
                <Button disabled={!changed} onClick={apply}>
                  {t('theme.apply')}
                </Button>
              </div>
            </footer>
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
