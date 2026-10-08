import { HugeiconsIcon } from '@hugeicons/react';
import { ColorPickerIcon } from '@hugeicons/core-free-icons';
import { lazy, Suspense, useState } from 'react';
import type { ReaderBackgroundTone } from '@yomitomo/reader-ui/reader-settings';
import type { AppThemeTone, AppThemeId } from './app-theme';
import {
  elementDialogSourceRect,
  useSourceAwareDialogTransition,
  type DialogSourceRect,
} from '../shell/app-dialog-transition';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../components/ui/icon-button';
import type { ResolvedAppSettings } from '@yomitomo/shared';

// The dialog renders full appearance previews with reader CSS; load it when it first opens.
const ThemeDialog = lazy(() =>
  import('./app-theme-dialog').then((module) => ({ default: module.ThemeDialog })),
);

export type ThemeSelectorProps = {
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
      {props.open ? (
        <Suspense fallback={null}>
          <ThemeDialog {...props} dialogStyle={dialogStyle} />
        </Suspense>
      ) : null}
    </>
  );
}
