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
      <button
        aria-label="打开主题选择"
        className="app-nav-theme-button"
        data-tooltip="主题"
        type="button"
        onClick={(event) => {
          setSourceRect(elementDialogSourceRect(event.currentTarget));
          onOpenChange(true);
        }}
      >
        <Palette aria-hidden="true" size={18} strokeWidth={2.2} />
      </button>
      {open ? (
        <div
          className="theme-dialog-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
        >
          <section
            aria-labelledby="theme-dialog-title"
            aria-modal="true"
            className="theme-dialog source-aware-dialog"
            role="dialog"
            style={dialogStyle}
          >
            <header className="theme-dialog-header">
              <div>
                <span className="theme-dialog-icon">
                  <Palette aria-hidden="true" size={18} strokeWidth={2.2} />
                </span>
                <div>
                  <h2 id="theme-dialog-title">主题</h2>
                  <p>选择阅读环境的纸张、墨色和界面风格。</p>
                </div>
              </div>
              <button
                aria-label="关闭主题选择"
                className="theme-dialog-close"
                type="button"
                onClick={() => onOpenChange(false)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <div className="theme-tone-switch" role="group" aria-label="主题分类">
              {themeToneOptions.map((option) => (
                <button
                  aria-pressed={activeTone === option.tone}
                  className={activeTone === option.tone ? 'is-active' : undefined}
                  key={option.tone}
                  type="button"
                  onClick={() => selectTone(option.tone)}
                >
                  {option.label}
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
                    onClick={() => selectTheme(themeId)}
                  />
                );
              })}
            </div>
            <section aria-labelledby="reader-paper-title" className="theme-reader-paper">
              <div>
                <h3 id="reader-paper-title">阅读器纸张</h3>
                <p>只影响网页文章、电子书和 PDF 的正文阅读区域。</p>
              </div>
              <div className="theme-reader-paper-options">
                {visibleReaderBackgroundOptions.map((option) => (
                  <button
                    aria-label={`阅读器纸张：${option.label}`}
                    aria-pressed={readerBackgroundColor === option.value}
                    className={
                      readerBackgroundColor === option.value
                        ? 'theme-reader-paper-option is-active'
                        : 'theme-reader-paper-option'
                    }
                    key={option.value}
                    style={{ '--reader-paper-option': option.value } as CSSProperties}
                    title={option.label}
                    type="button"
                    onClick={() => selectReaderBackground(option.value)}
                  >
                    <span aria-hidden="true" className="theme-reader-paper-swatch" />
                    <strong>{option.label}</strong>
                    <span className="theme-reader-paper-check" aria-hidden="true">
                      {readerBackgroundColor === option.value ? (
                        <Check size={15} strokeWidth={2.4} />
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
              {activeTone === 'dark' ? (
                <p className="theme-reader-paper-note">PDF 将保留原始页面颜色</p>
              ) : null}
            </section>
          </section>
        </div>
      ) : null}
    </>
  );
}

const themeToneOptions: Array<{ label: string; tone: ReaderBackgroundTone }> = [
  { label: '亮色', tone: 'light' },
  { label: '暗色', tone: 'dark' },
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
  onClick,
}: {
  active: boolean;
  theme: AppTheme;
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
            <span className="theme-preview-brand">
              Yomitomo <em>伴读</em>
            </span>
            <span className="theme-preview-actions">
              <span />
              <span />
            </span>
          </span>
          <span className="theme-preview-nav">
            <span className="is-active">阅读库</span>
            <span>助手</span>
            <span>统计</span>
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
          <strong>{theme.meta.name}</strong>
          <small>{theme.meta.description}</small>
        </span>
        <span className="theme-card-check" aria-hidden="true">
          {active ? <Check size={15} strokeWidth={2.4} /> : null}
        </span>
      </span>
    </button>
  );
}
