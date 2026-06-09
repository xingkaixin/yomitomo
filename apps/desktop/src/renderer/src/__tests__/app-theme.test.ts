import { describe, expect, it } from 'vitest';
import { readerThemeVariableNames } from '@yomitomo/reader-ui/reader-theme';
import {
  applyAppTheme,
  beigePaperTheme,
  beigePaperThemeId,
  defaultThemeIdForTone,
  defaultTheme,
  defaultThemeId,
  duskIndigoTheme,
  duskIndigoThemeId,
  inkBlackTheme,
  inkBlackThemeId,
  inkPaperTheme,
  inkPaperThemeId,
  readCachedThemeId,
  readCachedThemeIdsByTone,
  resolveAppThemeId,
  resolveAppThemeIdForTone,
  themeRegistry,
  themeToCssVariables,
  visibleThemeIds,
  writeCachedThemeId,
  writeCachedThemeIdForTone,
} from '../theme/app-theme';

describe('app theme contract', () => {
  it('registers the default and validation themes as complete AppThemes', () => {
    expect(themeRegistry[defaultThemeId]).toBe(defaultTheme);
    expect(themeRegistry[inkPaperThemeId]).toBe(inkPaperTheme);
    expect(themeRegistry[inkBlackThemeId]).toBe(inkBlackTheme);
    expect(themeRegistry[duskIndigoThemeId]).toBe(duskIndigoTheme);
    expect(themeRegistry[beigePaperThemeId]).toBe(beigePaperTheme);
    expect(defaultTheme.reader.paper).toBeTruthy();
    expect(inkPaperTheme.reader.paper).toBeTruthy();
    expect(inkBlackTheme.reader.paper).toBe('#242019');
    expect(duskIndigoTheme.reader.paper).toBe('#171a21');
    expect(beigePaperTheme.reader.paper).toBeTruthy();
    expect(defaultTheme.palette.background).toBeTruthy();
    expect(inkPaperTheme.palette.background).toBeTruthy();
    expect(inkBlackTheme.palette.background).toBe('34 9% 9%');
    expect(duskIndigoTheme.palette.background).toBe('228 19% 9%');
    expect(beigePaperTheme.palette.background).toBeTruthy();
    expect(defaultTheme.effect.shellBackground).toBeTruthy();
    expect(inkPaperTheme.effect.shellBackground).toBeTruthy();
    expect(inkBlackTheme.effect.shellBackground).toBeTruthy();
    expect(duskIndigoTheme.effect.shellBackground).toBeTruthy();
    expect(beigePaperTheme.effect.shellBackground).toBeTruthy();
    expect(defaultTheme.meta.tone).toBe('light');
    expect(inkPaperTheme.meta.tone).toBe('light');
    expect(inkBlackTheme.meta.tone).toBe('dark');
    expect(duskIndigoTheme.meta.tone).toBe('dark');
    expect(inkBlackTheme.paperPattern.kind).toBe('dash-grid');
    expect(inkBlackTheme.paperPattern.opacity).not.toBe('0');
    expect(duskIndigoTheme.paperPattern.kind).toBe('dash-grid');
    expect(duskIndigoTheme.paperPattern.opacity).not.toBe('0');
  });

  it('exposes only user visible themes for the selector', () => {
    expect(visibleThemeIds).toEqual([
      defaultThemeId,
      inkPaperThemeId,
      inkBlackThemeId,
      duskIndigoThemeId,
    ]);
    expect(visibleThemeIds).not.toContain(beigePaperThemeId);
    expect(defaultThemeIdForTone('light')).toBe(defaultThemeId);
    expect(defaultThemeIdForTone('dark')).toBe(inkBlackThemeId);
  });

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
    expect(styleValues.get('--background')).toBe(beigePaperTheme.palette.background);
    expect(styleValues.get('--app-reader-paper')).toBe(beigePaperTheme.reader.paper);
    expect(styleValues.get('--app-z-modal')).toBe(beigePaperTheme.effect.zIndex.modal);
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
