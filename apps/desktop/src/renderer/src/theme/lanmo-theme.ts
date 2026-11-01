import type { AppTheme } from './app-theme';

const palette: AppTheme['palette'] = {
  background: '220 17.65% 96.67%',
  foreground: '220 39.13% 18.04%',
  card: '240 20% 99.02%',
  cardForeground: '220 39.13% 18.04%',
  popover: '240 20% 99.02%',
  popoverForeground: '220 39.13% 18.04%',
  primary: '220.59 59.13% 45.10%',
  primaryForeground: '240 20% 99.02%',
  secondary: '217.50 26.67% 94.12%',
  secondaryForeground: '220 39.13% 18.04%',
  muted: '217.50 26.67% 94.12%',
  mutedForeground: '220 23.64% 32.35%',
  accent: '220.85 72.31% 87.25%',
  accentForeground: '221.67 64.29% 32.94%',
  destructive: '8.32 68.84% 39.02%',
  destructiveForeground: '240 20% 99.02%',
  border: '217.89 21.35% 82.55%',
  input: '219.47 17.12% 56.47%',
  ring: '220.59 59.13% 45.10%',
};

const paper = '#f5f6f8';
const surface = '#fcfcfd';
const surfaceMuted = '#eceff4';
const ink = '#1c2840';
const inkMuted = '#3f4c66';
const inkSubtle = '#5a6680';
const line = '#7d8aa3';
const lineFaint = '#c9d0dc';
const accent = '#2f5bb7';
const accentStrong = '#1e3f8a';
const mark = '#c7d6f6';
const danger = '#a8321f';
const overlayShadow = '0 3px 12px #1c284033';
const overlayScrim = '#1c284033';

const fineGrain =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .11 0 0 0 0 .16 0 0 0 0 .25 0 0 0 .11 -.02'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const softBlotch =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .2 0 0 0 0 .3 0 0 0 0 .5 0 0 0 .09 -.03'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E\")";

export const paperGrainImage = fineGrain;

export function createLanmoTheme(base: AppTheme): AppTheme {
  return {
    meta: {
      id: 'lanmo',
      name: '蓝墨',
      description: '冷白纸面、钢笔蓝墨和铅笔手绘线条的阅读主题。',
      tone: 'light',
      visible: true,
    },
    font: base.font,
    palette,
    effect: {
      ...base.effect,
      radius: '0.5rem',
      shellBackground: `${fineGrain}, ${softBlotch}, ${paper}`,
      shellPanelShadow: overlayShadow,
      subtlePanelShadow: '0 1px 3px #1c284014',
      cardShadow: '0 1px 4px #1c28401f',
      overlayScrim,
    },
    action: {
      primary: {
        background: accent,
        foreground: surface,
        border: accent,
        hoverBackground: accentStrong,
        activeBackground: accentStrong,
        disabledBackground: surfaceMuted,
        disabledForeground: inkSubtle,
      },
      secondary: {
        background: surface,
        foreground: ink,
        border: line,
        hoverBackground: surfaceMuted,
        activeBackground: lineFaint,
        disabledBackground: surfaceMuted,
        disabledForeground: inkSubtle,
      },
      danger: {
        background: danger,
        foreground: surface,
        border: danger,
        hoverBackground: `color-mix(in srgb, ${danger} 88%, ${ink})`,
        activeBackground: `color-mix(in srgb, ${danger} 76%, ${ink})`,
        disabledBackground: surfaceMuted,
        disabledForeground: inkSubtle,
      },
    },
    interactive: {
      link: accent,
      linkHover: accentStrong,
      selectedBackground: mark,
      selectedForeground: accentStrong,
      selectedBorder: accent,
      currentBackground: surfaceMuted,
      hoverBackground: surfaceMuted,
      hoverBorder: accent,
      focusRing: `${accent}99`,
      badgeBackground: mark,
      badgeForeground: accentStrong,
      badgeBorder: line,
      successForeground: '#1f6b45',
      successBackground: '#d8efe2',
    },
    paperPattern: {
      kind: 'grain',
      background: paper,
      color: ink,
      opacity: '1',
      size: '260px',
    },
    dataColor: {
      chart1: accent,
      chart2: '#b8402c',
      chart3: '#1f6b45',
      readerAgentFallback: accentStrong,
    },
    reader: {
      background: paper,
      paper: surface,
      ink,
      muted: inkMuted,
      line: lineFaint,
      primary: accent,
      accent: mark,
      accentStrong: accent,
      danger,
      toolbar: {
        background: surface,
        border: line,
        controlBackground: surface,
        controlHoverBackground: surfaceMuted,
        progressTrack: lineFaint,
        progressFill: accent,
      },
      toc: {
        background: paper,
        itemHoverBackground: surfaceMuted,
      },
      note: {
        annotationAccent: 'var(--app-reader-accent-strong)',
        annotationBorder:
          'color-mix(in srgb, var(--app-reader-accent-strong) 24%, var(--app-reader-note-border))',
        annotationMat: 'color-mix(in srgb, var(--app-reader-accent) 18%, var(--app-reader-paper))',
        annotationSurface: 'var(--app-reader-paper)',
        background: surface,
        border: line,
        distillationAccent: 'var(--app-reader-accent-strong)',
        distillationBorder:
          'color-mix(in srgb, var(--app-reader-accent-strong) 46%, var(--app-reader-note-border))',
        distillationMat:
          'color-mix(in srgb, var(--app-reader-accent) 34%, var(--app-reader-note-bg))',
        distillationSurface: 'var(--app-reader-paper)',
        distillationTabForeground: surface,
        shadow: '0 1px 3px #1c284014',
        quoteBackground: mark,
        quoteText: ink,
      },
      selectionMenu: {
        background: surface,
        foreground: ink,
        border: line,
        shadow: overlayShadow,
      },
      composer: { background: surface, border: line, shadow: overlayShadow },
      chat: {
        panelBackground: surface,
        panelBorder: line,
        panelShadow: overlayShadow,
        userBubbleBackground: surfaceMuted,
        userBubbleForeground: ink,
        assistantBubbleBackground: paper,
        assistantBubbleForeground: ink,
        contextBackground: mark,
        contextBorder: lineFaint,
        contextForeground: ink,
        composerBackground: surface,
        composerBorder: line,
        sendBackground: accent,
        sendForeground: surface,
        sendDisabledBackground: surfaceMuted,
        sendDisabledForeground: inkSubtle,
      },
      agentPanel: { background: surface, border: line, hoverBackground: surfaceMuted },
      overlay: {
        scrim: overlayScrim,
        edgeBlurTop: `linear-gradient(to bottom, ${paper}, ${paper}00)`,
        edgeBlurBottom: `linear-gradient(to top, ${paper}, ${paper}00)`,
      },
    },
  };
}
