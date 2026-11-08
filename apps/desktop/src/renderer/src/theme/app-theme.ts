import { normalizeThemePreference, type ThemePreference } from '@yomitomo/shared';
import {
  readerThemeToCssVariables,
  type CssVariableMap,
  type ReaderTheme,
} from '@yomitomo/reader-ui/reader-theme';

export type AppTheme = {
  meta: {
    id: string;
    name: string;
    description: string;
    tone: AppThemeTone;
  };
  font: {
    ui: string;
    mono: string;
    readerSerif: string;
  };
  palette: {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    destructive: string;
    destructiveForeground: string;
    border: string;
    input: string;
    ring: string;
  };
  effect: {
    radius: string;
    resizeDuration: string;
    resizeEase: string;
    shellBackground: string;
    shellPanelShadow: string;
    subtlePanelShadow: string;
    cardShadow: string;
    overlayScrim: string;
    zIndex: AppThemeZIndex;
  };
  action: {
    primary: ThemeControlState;
    secondary: ThemeControlState;
    danger: ThemeControlState;
  };
  interactive: {
    link: string;
    linkHover: string;
    selectedBackground: string;
    selectedForeground: string;
    selectedBorder: string;
    currentBackground: string;
    hoverBackground: string;
    hoverBorder: string;
    focusRing: string;
    badgeBackground: string;
    badgeForeground: string;
    badgeBorder: string;
    successForeground: string;
    successBackground: string;
  };
  dataColor: {
    chart1: string;
    chart2: string;
    chart3: string;
    readerAgentFallback: string;
  };
  reader: ReaderTheme;
};

export type AppThemeTone = 'light' | 'dark';

export type ThemeControlState = {
  background: string;
  foreground: string;
  border: string;
  hoverBackground: string;
  activeBackground: string;
  disabledBackground: string;
  disabledForeground: string;
};

export type AppThemeZIndex = {
  sticky: string;
  floating: string;
  dropdown: string;
  popover: string;
  panel: string;
  overlay: string;
  modal: string;
  tooltip: string;
  topOverlay: string;
};

const appThemeZIndex: AppThemeZIndex = {
  sticky: '20',
  floating: '80',
  dropdown: '130',
  popover: '160',
  panel: '240',
  overlay: '260',
  modal: '320',
  tooltip: '340',
  topOverlay: '360',
};

const lightReaderTheme: ReaderTheme = {
  background: '#f6f2ea',
  paper: '#fffaf3',
  ink: '#2f2720',
  muted: '#766c61',
  line: '#ded5c9',
  primary: '#8f4037',
  accent: '#f1d8d1',
  accentStrong: '#9b463b',
  danger: '#a13e36',
  toolbar: {
    background: 'rgba(255,250,243,.92)',
    border: 'rgba(47,39,32,.12)',
    controlBackground: 'rgba(255,252,247,.88)',
    controlHoverBackground: '#f1e8de',
    progressTrack: 'rgba(47,39,32,.1)',
    progressFill: '#9b463b',
  },
  toc: {
    background: 'rgba(246,242,234,.72)',
    itemHoverBackground: 'rgba(255,250,243,.84)',
  },
  note: {
    annotationAccent: 'var(--app-reader-accent-strong)',
    annotationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 18%,var(--app-reader-note-border))',
    annotationMat: 'color-mix(in srgb,var(--app-reader-accent) 18%,var(--app-reader-paper))',
    annotationSurface: 'var(--app-reader-paper)',
    background: 'rgba(255,250,243,.92)',
    border: 'rgba(47,39,32,.12)',
    distillationAccent: 'var(--app-reader-accent-strong)',
    distillationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 46%,var(--app-reader-note-border))',
    distillationMat: 'color-mix(in srgb,var(--app-reader-accent) 42%,var(--app-reader-note-bg))',
    distillationSurface: 'var(--app-reader-paper)',
    distillationTabForeground: '#fffaf3',
    shadow: '0 10px 30px rgba(47,39,32,.09)',
    quoteBackground: 'rgba(225,191,105,.16)',
    quoteText: '#46392f',
  },
  selectionMenu: {
    background: 'rgba(47,39,32,.94)',
    foreground: '#fffaf3',
    border: 'rgba(47,39,32,.14)',
    shadow: '0 12px 34px rgba(47,39,32,.26)',
  },
  composer: {
    background: 'rgba(255,250,243,.98)',
    border: 'rgba(47,39,32,.14)',
    shadow: '0 22px 64px rgba(47,39,32,.16)',
  },
  chat: {
    panelBackground: 'rgba(255,250,243,.98)',
    panelBorder: 'rgba(47,39,32,.14)',
    panelShadow: '0 28px 88px rgba(47,39,32,.22),inset 0 1px 0 rgba(255,255,255,.58)',
    userBubbleBackground: '#2f2720',
    userBubbleForeground: '#fffaf3',
    assistantBubbleBackground: 'rgba(47,39,32,.055)',
    assistantBubbleForeground: '#2f2720',
    contextBackground: 'rgba(225,191,105,.18)',
    contextBorder: 'rgba(168,126,48,.2)',
    contextForeground: '#5b4d41',
    composerBackground: 'color-mix(in srgb,#fffaf3 78%,rgba(246,242,234,.9))',
    composerBorder: 'rgba(47,39,32,.1)',
    sendBackground: '#9b463b',
    sendForeground: '#fffaf3',
    sendDisabledBackground: 'rgba(47,39,32,.14)',
    sendDisabledForeground: 'rgba(47,39,32,.46)',
  },
  agentPanel: {
    background: 'rgba(250,244,235,.94)',
    border: 'rgba(47,39,32,.13)',
    hoverBackground: '#eee3d7',
  },
  overlay: {
    scrim: 'rgba(47,39,32,.14)',
    edgeBlurTop: 'linear-gradient(to bottom,rgba(246,242,234,.84),rgba(246,242,234,0))',
    edgeBlurBottom: 'linear-gradient(to top,rgba(246,242,234,.84),rgba(246,242,234,0))',
  },
};

export const lightTheme: AppTheme = {
  meta: {
    id: 'light',
    name: '亮色',
    description: '暖白面板和墨色主操作，品牌红只用于选中、链接和批注。',
    tone: 'light',
  },
  font: {
    // System CJK fonts first: the bundled Noto Sans SC is 4.2 MB and would load in every window.
    ui: "'PingFang SC', 'Microsoft YaHei UI', 'Noto Sans SC', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    readerSerif: "'Source Serif 4', 'Noto Serif SC', 'Songti SC', Georgia, serif",
  },
  palette: {
    background: '45 22% 96%',
    foreground: '36 10% 10%',
    card: '0 0% 100%',
    cardForeground: '36 10% 10%',
    popover: '0 0% 100%',
    popoverForeground: '36 10% 10%',
    primary: '36 10% 10%',
    primaryForeground: '0 0% 100%',
    secondary: '43 18% 92%',
    secondaryForeground: '37 9% 18%',
    muted: '43 18% 92%',
    mutedForeground: '37 7% 38%',
    accent: '16 38% 92%',
    accentForeground: '6 67% 42%',
    destructive: '4 63% 46%',
    destructiveForeground: '0 0% 100%',
    border: '40 18% 87%',
    input: '40 18% 87%',
    ring: '6 67% 42%',
  },
  effect: {
    radius: '0.85rem',
    resizeDuration: '300ms',
    resizeEase: 'cubic-bezier(0.22, 1, 0.36, 1)',
    shellBackground: '#f1efeb',
    shellPanelShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 2px rgba(28, 26, 23, 0.04)',
    subtlePanelShadow:
      'inset 0 1px 0 #ffffff, 0 1px 0 rgba(28, 26, 23, 0.04), 0 1px 3px rgba(28, 26, 23, 0.08)',
    cardShadow:
      'inset 0 1px 0 #ffffff, 0 1px 2px rgba(28, 26, 23, 0.05), 0 6px 16px -6px rgba(28, 26, 23, 0.1)',
    overlayScrim: 'rgba(28, 26, 23, 0.32)',
    zIndex: appThemeZIndex,
  },
  action: {
    primary: {
      background: '#1c1a17',
      foreground: '#ffffff',
      border: '#0f0e0c',
      hoverBackground: '#403b35',
      activeBackground: '#0f0e0c',
      disabledBackground: '#e4e0d8',
      disabledForeground: '#75706a',
    },
    secondary: {
      background: '#ffffff',
      foreground: '#1c1a17',
      border: 'rgba(28, 26, 23, 0.13)',
      hoverBackground: '#f7f6f2',
      activeBackground: '#efede8',
      disabledBackground: '#efede8',
      disabledForeground: '#75706a',
    },
    danger: {
      background: '#c0352b',
      foreground: '#ffffff',
      border: '#c0352b',
      hoverBackground: '#a72e25',
      activeBackground: '#8e2720',
      disabledBackground: '#e4e0d8',
      disabledForeground: '#75706a',
    },
  },
  interactive: {
    link: '#b23223',
    linkHover: '#8f2519',
    selectedBackground: 'rgba(178, 50, 35, 0.08)',
    selectedForeground: '#b23223',
    selectedBorder: 'rgba(178, 50, 35, 0.45)',
    currentBackground: '#efede8',
    hoverBackground: '#efede8',
    hoverBorder: 'rgba(178, 50, 35, 0.45)',
    focusRing: 'rgba(178, 50, 35, 0.38)',
    badgeBackground: 'rgba(178, 50, 35, 0.08)',
    badgeForeground: '#b23223',
    badgeBorder: 'rgba(178, 50, 35, 0.45)',
    successForeground: 'hsl(142 44% 30%)',
    successBackground: 'hsl(142 42% 92%)',
  },
  dataColor: {
    chart1: 'hsl(83 24% 35%)',
    chart2: 'hsl(8 45% 46%)',
    chart3: 'hsl(205 30% 38%)',
    readerAgentFallback: '#2f2720',
  },
  reader: lightReaderTheme,
};

const darkReaderTheme: ReaderTheme = {
  background: '#1a1815',
  paper: '#242019',
  ink: '#e0d9cc',
  muted: '#8c8576',
  line: '#464139',
  primary: '#e0844f',
  accent: '#3d241b',
  accentStrong: '#e0844f',
  danger: '#e56f65',
  toolbar: {
    background: 'rgba(26,24,21,.88)',
    border: 'rgba(224,217,204,.1)',
    controlBackground: 'rgba(36,32,25,.86)',
    controlHoverBackground: '#302a22',
    progressTrack: 'rgba(224,217,204,.12)',
    progressFill: '#e0844f',
  },
  toc: {
    background: 'rgba(36,32,25,.62)',
    itemHoverBackground: 'rgba(48,42,34,.82)',
  },
  note: {
    annotationAccent: 'var(--app-reader-accent-strong)',
    annotationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 24%,var(--app-reader-note-border))',
    annotationMat: 'color-mix(in srgb,var(--app-reader-accent-strong) 8%,var(--app-reader-bg))',
    annotationSurface: 'color-mix(in srgb,var(--app-reader-paper) 86%,var(--app-reader-ink) 14%)',
    background: 'rgba(36,32,25,.9)',
    border: 'rgba(224,217,204,.12)',
    distillationAccent: 'var(--app-reader-accent-strong)',
    distillationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 46%,var(--app-reader-note-border))',
    distillationMat: 'color-mix(in srgb,var(--app-reader-accent-strong) 13%,var(--app-reader-bg))',
    distillationSurface:
      'color-mix(in srgb,var(--app-reader-paper) 88%,var(--app-reader-accent-strong) 12%)',
    distillationTabForeground: '#1a1815',
    shadow: '0 18px 44px rgba(0,0,0,.42)',
    quoteBackground: 'rgba(224,132,79,.16)',
    quoteText: '#e0d9cc',
  },
  selectionMenu: {
    background: 'rgba(36,32,25,.94)',
    foreground: '#e0d9cc',
    border: 'rgba(224,217,204,.14)',
    shadow: '0 18px 48px rgba(0,0,0,.52)',
  },
  composer: {
    background: 'rgba(36,32,25,.98)',
    border: 'rgba(224,217,204,.16)',
    shadow: '0 24px 70px rgba(0,0,0,.58)',
  },
  chat: {
    panelBackground: 'rgba(26,24,21,.98)',
    panelBorder: 'rgba(224,217,204,.16)',
    panelShadow: '0 28px 88px rgba(0,0,0,.62),inset 0 1px 0 rgba(224,217,204,.08)',
    userBubbleBackground: '#3b332b',
    userBubbleForeground: '#f3eadb',
    assistantBubbleBackground: 'rgba(224,217,204,.08)',
    assistantBubbleForeground: '#e0d9cc',
    contextBackground: 'rgba(224,132,79,.16)',
    contextBorder: 'rgba(224,132,79,.28)',
    contextForeground: '#e0d9cc',
    composerBackground: 'rgba(27,25,21,.98)',
    composerBorder: 'rgba(224,217,204,.14)',
    sendBackground: '#9a5a40',
    sendForeground: '#fff6ee',
    sendDisabledBackground: 'rgba(224,217,204,.12)',
    sendDisabledForeground: 'rgba(224,217,204,.42)',
  },
  agentPanel: {
    background: 'rgba(36,32,25,.94)',
    border: 'rgba(224,217,204,.14)',
    hoverBackground: '#302a22',
  },
  overlay: {
    scrim: 'rgba(0,0,0,.42)',
    edgeBlurTop: 'linear-gradient(to bottom,rgba(26,24,21,.9),rgba(26,24,21,0))',
    edgeBlurBottom: 'linear-gradient(to top,rgba(26,24,21,.9),rgba(26,24,21,0))',
  },
};

export const darkTheme: AppTheme = {
  meta: {
    id: 'dark',
    name: '暗色',
    description: '暖调近黑面板，主操作翻成浅墨色，层级靠底色区分。',
    tone: 'dark',
  },
  font: lightTheme.font,
  palette: {
    background: '40 6% 10%',
    foreground: '38 22% 90%',
    card: '36 8% 12%',
    cardForeground: '38 22% 90%',
    popover: '36 8% 12%',
    popoverForeground: '38 22% 90%',
    primary: '39 16% 82%',
    primaryForeground: '40 6% 10%',
    secondary: '36 6% 15%',
    secondaryForeground: '39 15% 81%',
    muted: '36 6% 15%',
    mutedForeground: '38 8% 60%',
    accent: '13 23% 16%',
    accentForeground: '9 75% 64%',
    destructive: '4 62% 47%',
    destructiveForeground: '0 0% 100%',
    border: '37 9% 18%',
    input: '37 9% 18%',
    ring: '9 75% 64%',
  },
  effect: {
    radius: lightTheme.effect.radius,
    resizeDuration: lightTheme.effect.resizeDuration,
    resizeEase: lightTheme.effect.resizeEase,
    shellBackground: '#121110',
    shellPanelShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
    subtlePanelShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 1px 2px rgba(0, 0, 0, 0.45)',
    cardShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 2px 10px -2px rgba(0, 0, 0, 0.5)',
    overlayScrim: 'rgba(0, 0, 0, 0.5)',
    zIndex: appThemeZIndex,
  },
  action: {
    primary: {
      background: '#d9d4cb',
      foreground: '#1a1917',
      border: 'rgba(0, 0, 0, 0.6)',
      hoverBackground: '#f6f3ee',
      activeBackground: '#d6d1c8',
      disabledBackground: '#33302b',
      disabledForeground: '#8f897f',
    },
    secondary: {
      background: '#2e2b27',
      foreground: '#ece8e1',
      border: 'rgba(0, 0, 0, 0.55)',
      hoverBackground: '#2a2825',
      activeBackground: '#252320',
      disabledBackground: '#2a2825',
      disabledForeground: '#8f897f',
    },
    danger: {
      background: '#c4392e',
      foreground: '#ffffff',
      border: '#c4392e',
      hoverBackground: '#ab3228',
      activeBackground: '#922b22',
      disabledBackground: '#33302b',
      disabledForeground: '#8f897f',
    },
  },
  interactive: {
    link: '#e8735f',
    linkHover: '#f08b79',
    selectedBackground: 'rgba(232, 115, 95, 0.12)',
    selectedForeground: '#e8735f',
    selectedBorder: 'rgba(232, 115, 95, 0.5)',
    currentBackground: '#2a2825',
    hoverBackground: '#2a2825',
    hoverBorder: 'rgba(232, 115, 95, 0.5)',
    focusRing: 'rgba(232, 115, 95, 0.4)',
    badgeBackground: 'rgba(232, 115, 95, 0.12)',
    badgeForeground: '#e8735f',
    badgeBorder: 'rgba(232, 115, 95, 0.5)',
    successForeground: 'hsl(140 50% 72%)',
    successBackground: 'hsl(142 32% 18%)',
  },
  dataColor: {
    chart1: 'hsl(140 30% 52%)',
    chart2: 'hsl(8 56% 60%)',
    chart3: 'hsl(205 46% 60%)',
    readerAgentFallback: '#e0d9cc',
  },
  reader: darkReaderTheme,
};

export const themeRegistry = {
  light: lightTheme,
  dark: darkTheme,
} as const satisfies Record<AppThemeTone, AppTheme>;

export type AppThemeId = keyof typeof themeRegistry;

const cachedThemeStorageKey = 'yomitomo.themeId';
const systemDarkQuery = '(prefers-color-scheme: dark)';

export function themeToCssVariables(theme: AppTheme): CssVariableMap {
  return {
    '--font-ui': theme.font.ui,
    '--font-mono': theme.font.mono,
    '--font-reader-serif': theme.font.readerSerif,
    '--background': theme.palette.background,
    '--foreground': theme.palette.foreground,
    '--card': theme.palette.card,
    '--card-foreground': theme.palette.cardForeground,
    '--popover': theme.palette.popover,
    '--popover-foreground': theme.palette.popoverForeground,
    '--primary': theme.palette.primary,
    '--primary-foreground': theme.palette.primaryForeground,
    '--secondary': theme.palette.secondary,
    '--secondary-foreground': theme.palette.secondaryForeground,
    '--muted': theme.palette.muted,
    '--muted-foreground': theme.palette.mutedForeground,
    '--accent': theme.palette.accent,
    '--accent-foreground': theme.palette.accentForeground,
    '--destructive': theme.palette.destructive,
    '--destructive-foreground': theme.palette.destructiveForeground,
    '--border': theme.palette.border,
    '--input': theme.palette.input,
    '--ring': theme.palette.ring,
    '--radius': theme.effect.radius,
    '--resize-dur': theme.effect.resizeDuration,
    '--resize-ease': theme.effect.resizeEase,
    '--app-shell-background': theme.effect.shellBackground,
    '--app-shell-panel-shadow': theme.effect.shellPanelShadow,
    '--app-subtle-panel-shadow': theme.effect.subtlePanelShadow,
    '--app-card-shadow': theme.effect.cardShadow,
    '--app-overlay-scrim': theme.effect.overlayScrim,
    '--app-z-sticky': theme.effect.zIndex.sticky,
    '--app-z-floating': theme.effect.zIndex.floating,
    '--app-z-dropdown': theme.effect.zIndex.dropdown,
    '--app-z-popover': theme.effect.zIndex.popover,
    '--app-z-panel': theme.effect.zIndex.panel,
    '--app-z-overlay': theme.effect.zIndex.overlay,
    '--app-z-modal': theme.effect.zIndex.modal,
    '--app-z-tooltip': theme.effect.zIndex.tooltip,
    '--app-z-top-overlay': theme.effect.zIndex.topOverlay,
    '--app-action-primary-bg': theme.action.primary.background,
    '--app-action-primary-fg': theme.action.primary.foreground,
    '--app-action-primary-border': theme.action.primary.border,
    '--app-action-primary-hover-bg': theme.action.primary.hoverBackground,
    '--app-action-primary-active-bg': theme.action.primary.activeBackground,
    '--app-action-primary-disabled-bg': theme.action.primary.disabledBackground,
    '--app-action-primary-disabled-fg': theme.action.primary.disabledForeground,
    '--app-action-secondary-bg': theme.action.secondary.background,
    '--app-action-secondary-fg': theme.action.secondary.foreground,
    '--app-action-secondary-border': theme.action.secondary.border,
    '--app-action-secondary-hover-bg': theme.action.secondary.hoverBackground,
    '--app-action-secondary-active-bg': theme.action.secondary.activeBackground,
    '--app-action-secondary-disabled-bg': theme.action.secondary.disabledBackground,
    '--app-action-secondary-disabled-fg': theme.action.secondary.disabledForeground,
    '--app-action-danger-bg': theme.action.danger.background,
    '--app-action-danger-fg': theme.action.danger.foreground,
    '--app-action-danger-border': theme.action.danger.border,
    '--app-action-danger-hover-bg': theme.action.danger.hoverBackground,
    '--app-action-danger-active-bg': theme.action.danger.activeBackground,
    '--app-action-danger-disabled-bg': theme.action.danger.disabledBackground,
    '--app-action-danger-disabled-fg': theme.action.danger.disabledForeground,
    '--app-interactive-link': theme.interactive.link,
    '--app-interactive-link-hover': theme.interactive.linkHover,
    '--app-interactive-selected-bg': theme.interactive.selectedBackground,
    '--app-interactive-selected-fg': theme.interactive.selectedForeground,
    '--app-interactive-selected-border': theme.interactive.selectedBorder,
    '--app-interactive-current-bg': theme.interactive.currentBackground,
    '--app-interactive-hover-bg': theme.interactive.hoverBackground,
    '--app-interactive-hover-border': theme.interactive.hoverBorder,
    '--app-interactive-focus-ring': theme.interactive.focusRing,
    '--app-interactive-badge-bg': theme.interactive.badgeBackground,
    '--app-interactive-badge-fg': theme.interactive.badgeForeground,
    '--app-interactive-badge-border': theme.interactive.badgeBorder,
    '--app-interactive-success-fg': theme.interactive.successForeground,
    '--app-interactive-success-bg': theme.interactive.successBackground,
    '--chart-1': theme.dataColor.chart1,
    '--chart-2': theme.dataColor.chart2,
    '--chart-3': theme.dataColor.chart3,
    '--app-reader-agent-fallback': theme.dataColor.readerAgentFallback,
    ...readerThemeToCssVariables(theme.reader),
  };
}

export function applyAppTheme(theme: AppTheme, root: HTMLElement = document.documentElement) {
  root.dataset.theme = theme.meta.id;
  root.dataset.themeTone = theme.meta.tone;
  const variables = themeToCssVariables(theme);
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
}

export function themeIdForPreference(
  preference: ThemePreference,
  systemTone: AppThemeTone = systemThemeTone(),
): AppThemeId {
  return preference === 'system' ? systemTone : preference;
}

export function systemThemeTone(): AppThemeTone {
  const query = systemDarkMediaQuery();
  return query?.matches ? 'dark' : 'light';
}

export function watchSystemThemeTone(onChange: (tone: AppThemeTone) => void) {
  const query = systemDarkMediaQuery();
  if (!query) return () => undefined;
  const listener = () => onChange(query.matches ? 'dark' : 'light');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export function readCachedThemePreference(
  storage: Storage | undefined = browserLocalStorage(),
): ThemePreference {
  if (!storage) return 'system';

  try {
    return normalizeThemePreference(storage.getItem(cachedThemeStorageKey));
  } catch {
    return 'system';
  }
}

export function readCachedThemeId(): AppThemeId {
  return themeIdForPreference(readCachedThemePreference());
}

export function writeCachedThemePreference(
  preference: ThemePreference,
  storage: Storage | undefined = browserLocalStorage(),
) {
  if (!storage) return;

  try {
    storage.setItem(cachedThemeStorageKey, preference);
  } catch {
    // Theme cache is a startup optimization; settings remain the source of truth.
  }
}

function browserLocalStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function systemDarkMediaQuery() {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? undefined
    : window.matchMedia(systemDarkQuery);
}
