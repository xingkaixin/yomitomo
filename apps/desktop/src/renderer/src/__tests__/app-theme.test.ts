import { describe, expect, it } from 'vitest';
import { readerThemeVariableNames } from '@yomitomo/reader-ui/reader-theme';
import {
  applyAppTheme,
  beigePaperTheme,
  beigePaperThemeId,
  defaultThemeId,
  duskIndigoThemeId,
  inkBlackTheme,
  inkBlackThemeId,
  inkPaperThemeId,
  readCachedThemeId,
  readCachedThemeIdsByTone,
  resolveAppThemeId,
  resolveAppThemeIdForTone,
  themeRegistry,
  themeToCssVariables,
  writeCachedThemeId,
  writeCachedThemeIdForTone,
} from '../theme/app-theme';

describe('app theme contract', () => {
  it('exports app and reader css variables from each registered theme', () => {
    for (const theme of Object.values(themeRegistry)) {
      const variables = themeToCssVariables(theme);

      expect(variables['--background']).toBe(theme.palette.background);
      expect(variables['--app-shell-background']).toBe(theme.effect.shellBackground);
      expect(variables['--app-z-modal']).toBe(theme.effect.zIndex.modal);
      expect(variables['--app-z-tooltip']).toBe(theme.effect.zIndex.tooltip);
      expect(variables['--font-reader-serif']).toBe(theme.font.readerSerif);
      expect(variables['--app-action-primary-bg']).toBe(theme.action.primary.background);
      expect(variables['--app-interactive-link']).toBe(theme.interactive.link);
      expect(variables['--app-interactive-selected-border']).toBe(theme.interactive.selectedBorder);
      expect(variables['--app-interactive-hover-border']).toBe(theme.interactive.hoverBorder);
      expect(variables['--app-paper-pattern-bg']).toBe(theme.paperPattern.background);
      expect(variables['--app-paper-pattern-image']).toBeTruthy();

      for (const name of readerThemeVariableNames) {
        expect(variables[name]).toBeTruthy();
      }
    }
  });

  it('applies the selected theme variables to a root element', () => {
    const styleValues = new Map<string, string>();
    const root = {
      dataset: {} as Record<string, string>,
      style: {
        setProperty: (name: string, value: string) => {
          styleValues.set(name, value);
        },
      },
    } as unknown as HTMLElement;

    applyAppTheme(beigePaperTheme, root);

    expect(root.dataset.theme).toBe(beigePaperThemeId);
    expect(root.dataset.themeTone).toBe('light');
    expect(styleValues.get('--background')).toBe(beigePaperTheme.palette.background);
    expect(styleValues.get('--app-reader-paper')).toBe(beigePaperTheme.reader.paper);
    expect(styleValues.get('--app-z-modal')).toBe(beigePaperTheme.effect.zIndex.modal);

    applyAppTheme(inkBlackTheme, root);

    expect(root.dataset.theme).toBe(inkBlackThemeId);
    expect(root.dataset.themeTone).toBe('dark');
  });

  it('normalizes and caches startup theme ids', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    } as Storage;

    expect(resolveAppThemeId('missing')).toBe(defaultThemeId);
    writeCachedThemeId(inkPaperThemeId, storage);
    expect(readCachedThemeId(storage)).toBe(inkPaperThemeId);
  });

  it('remembers the last selected theme for each tone', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    } as Storage;

    writeCachedThemeIdForTone(inkPaperThemeId, storage);
    writeCachedThemeIdForTone(duskIndigoThemeId, storage);

    expect(readCachedThemeIdsByTone(storage)).toEqual({
      light: inkPaperThemeId,
      dark: duskIndigoThemeId,
    });
  });

  it('falls back to tone defaults for invalid theme history', () => {
    expect(resolveAppThemeIdForTone(duskIndigoThemeId, 'light')).toBe(defaultThemeId);
    expect(resolveAppThemeIdForTone(inkPaperThemeId, 'dark')).toBe(inkBlackThemeId);
  });
});
