import type { AppTheme, AppThemeTone } from './app-theme';

// Adapted from https://manager.shadcndesign.com/s/-tyen4Cd8Ztcw0QBdMP9uQ/color.
const lightPalette: AppTheme['palette'] = {
  background: '0 0% 100%',
  foreground: '201.03 92.90% 16.27%',
  card: '0 0% 100%',
  cardForeground: '201.03 92.90% 16.27%',
  popover: '0 0% 100%',
  popoverForeground: '201.03 92.90% 16.27%',
  // Lower OKLCH lightness from 0.585 to 0.55 so small white labels meet 4.5:1.
  primary: '101.32 100% 26.71%',
  primaryForeground: '0 0% 100%',
  secondary: '195.61 100% 94.07%',
  secondaryForeground: '201.03 92.90% 16.27%',
  muted: '205.22 79.49% 95.58%',
  mutedForeground: '204.29 29.75% 34.20%',
  accent: '90.91 94.60% 88.25%',
  accentForeground: '110.14 79.02% 20.39%',
  destructive: '358.62 72% 43%',
  destructiveForeground: '0 0% 100%',
  border: '205.14 28.04% 82.08%',
  input: '205.14 28.04% 82.08%',
  ring: '202.31 83.60% 45%',
};

const darkPalette: AppTheme['palette'] = {
  background: '208.08 100% 7.24%',
  foreground: '205.17 61.03% 92.36%',
  card: '202.39 95.21% 9.97%',
  cardForeground: '205.17 61.03% 92.36%',
  popover: '202.39 95.21% 9.97%',
  popoverForeground: '205.17 61.03% 92.36%',
  primary: '89.62 77.87% 41.83%',
  primaryForeground: '224.94 56.32% 9.98%',
  secondary: '201.96 77.66% 14.32%',
  secondaryForeground: '204.99 72.87% 87.24%',
  muted: '202.74 66.13% 13.98%',
  mutedForeground: '205.02 20.17% 67.11%',
  accent: '108.60 54.96% 15.24%',
  accentForeground: '93.51 79.29% 69.60%',
  destructive: '0.64 88.49% 63.43%',
  destructiveForeground: '208.08 100% 7.24%',
  border: '204.25 32.36% 23.70%',
  input: '204.25 32.36% 23.70%',
  ring: '202.31 83.60% 59.43%',
};

export function createShadLingoTheme(base: AppTheme, tone: AppThemeTone): AppTheme {
  const dark = tone === 'dark';
  const palette = dark ? darkPalette : lightPalette;
  const background = `hsl(${palette.background})`;
  const foreground = `hsl(${palette.foreground})`;
  const card = `hsl(${palette.card})`;
  const primary = `hsl(${palette.primary})`;
  const primaryForeground = `hsl(${palette.primaryForeground})`;
  const secondary = `hsl(${palette.secondary})`;
  const muted = `hsl(${palette.muted})`;
  const mutedForeground = `hsl(${palette.mutedForeground})`;
  const accent = `hsl(${palette.accent})`;
  const accentForeground = `hsl(${palette.accentForeground})`;
  const border = `hsl(${palette.border})`;
  const danger = `hsl(${palette.destructive})`;
  const dangerForeground = `hsl(${palette.destructiveForeground})`;
  const primaryHover = `color-mix(in srgb, ${primary} 92%, ${foreground})`;
  const primaryActive = `color-mix(in srgb, ${primary} 84%, ${foreground})`;
  const secondaryHover = `color-mix(in srgb, ${secondary} 80%, ${border})`;
  const disabledBackground = `color-mix(in srgb, ${muted} 80%, ${border})`;
  const shadow = `0 4px 0 ${border}`;
  const panelShadow = `0 6px 0 ${border}`;
  const scrim = `hsl(${darkPalette.background} / ${dark ? '0.65' : '0.25'})`;
  const paper = dark ? '#012032' : '#ffffff';

  return {
    meta: {
      id: dark ? 'shadlingo-dark' : 'shadlingo',
      name: dark ? '青芽·夜' : '青芽',
      description: dark
        ? '深蓝夜色、浅蓝正文和青绿强调的 ShadLingo 阅读主题。'
        : '白色纸面、深蓝文字和青绿强调的 ShadLingo 阅读主题。',
      tone,
      visible: true,
    },
    font: base.font,
    palette,
    effect: {
      ...base.effect,
      radius: '0.625rem',
      shellBackground: dark ? background : muted,
      shellPanelShadow: panelShadow,
      subtlePanelShadow: `0 2px 0 hsl(${palette.border} / 0.5)`,
      cardShadow: shadow,
      overlayScrim: scrim,
    },
    action: {
      primary: {
        background: primary,
        foreground: primaryForeground,
        border: primary,
        hoverBackground: primaryHover,
        activeBackground: primaryActive,
        disabledBackground,
        disabledForeground: mutedForeground,
      },
      secondary: {
        background: secondary,
        foreground,
        border,
        hoverBackground: secondaryHover,
        activeBackground: `color-mix(in srgb, ${secondary} 60%, ${border})`,
        disabledBackground: muted,
        disabledForeground: mutedForeground,
      },
      danger: {
        background: danger,
        foreground: dangerForeground,
        border: danger,
        hoverBackground: `color-mix(in srgb, ${danger} 92%, ${foreground})`,
        activeBackground: `color-mix(in srgb, ${danger} 84%, ${foreground})`,
        disabledBackground,
        disabledForeground: mutedForeground,
      },
    },
    interactive: {
      link: dark ? primary : accentForeground,
      linkHover: dark ? accentForeground : primary,
      selectedBackground: accent,
      selectedForeground: accentForeground,
      selectedBorder: primary,
      currentBackground: secondary,
      hoverBackground: secondary,
      hoverBorder: `hsl(${palette.ring})`,
      focusRing: `hsl(${palette.ring} / 0.65)`,
      badgeBackground: accent,
      badgeForeground: accentForeground,
      badgeBorder: `color-mix(in srgb, ${primary} 35%, ${border})`,
      successForeground: accentForeground,
      successBackground: accent,
    },
    paperPattern: {
      kind: 'plain',
      background: card,
      color: foreground,
      opacity: '0',
      size: '16px',
    },
    dataColor: {
      chart1: primary,
      chart2: `hsl(${palette.ring})`,
      chart3: 'hsl(32.84 97.13% 53.86%)',
      readerAgentFallback: foreground,
    },
    reader: {
      background: dark ? background : muted,
      paper,
      ink: foreground,
      muted: mutedForeground,
      line: border,
      primary,
      accent,
      accentStrong: dark ? primary : accentForeground,
      danger,
      toolbar: {
        background: card,
        border,
        controlBackground: secondary,
        controlHoverBackground: secondaryHover,
        progressTrack: muted,
        progressFill: primary,
      },
      toc: {
        background: dark ? background : muted,
        itemHoverBackground: secondary,
      },
      note: {
        annotationAccent: 'var(--app-reader-accent-strong)',
        annotationBorder:
          'color-mix(in srgb, var(--app-reader-accent-strong) 24%, var(--app-reader-note-border))',
        annotationMat: 'color-mix(in srgb, var(--app-reader-accent) 18%, var(--app-reader-paper))',
        annotationSurface: 'var(--app-reader-paper)',
        background: card,
        border,
        distillationAccent: 'var(--app-reader-accent-strong)',
        distillationBorder:
          'color-mix(in srgb, var(--app-reader-accent-strong) 46%, var(--app-reader-note-border))',
        distillationMat:
          'color-mix(in srgb, var(--app-reader-accent) 34%, var(--app-reader-note-bg))',
        distillationSurface: 'var(--app-reader-paper)',
        distillationTabForeground: dark ? background : card,
        shadow: `0 2px 0 ${border}`,
        quoteBackground: accent,
        quoteText: accentForeground,
      },
      selectionMenu: {
        background: card,
        foreground,
        border,
        shadow,
      },
      composer: { background: card, border, shadow: panelShadow },
      chat: {
        panelBackground: card,
        panelBorder: border,
        panelShadow,
        userBubbleBackground: secondary,
        userBubbleForeground: foreground,
        assistantBubbleBackground: muted,
        assistantBubbleForeground: foreground,
        contextBackground: accent,
        contextBorder: border,
        contextForeground: accentForeground,
        composerBackground: card,
        composerBorder: border,
        sendBackground: primary,
        sendForeground: primaryForeground,
        sendDisabledBackground: disabledBackground,
        sendDisabledForeground: mutedForeground,
      },
      agentPanel: { background: card, border, hoverBackground: secondary },
      overlay: {
        scrim,
        edgeBlurTop: `linear-gradient(to bottom, ${background}, hsl(${palette.background} / 0))`,
        edgeBlurBottom: `linear-gradient(to top, ${background}, hsl(${palette.background} / 0))`,
      },
    },
  };
}
