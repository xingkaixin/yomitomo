import { normalizeThemePreference, type ThemePreference } from '@yomitomo/shared';
import {
  alphaVariables,
  mixColors,
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
    overlayScrim: string;
    zIndex: AppThemeZIndex;
  };
  surface: {
    edge: string;
    edgeSoft: string;
    panel: SurfaceMaterial;
    raised: SurfaceMaterial;
    card: SurfaceMaterial;
    well: SurfaceMaterial;
    field: SurfaceMaterial;
    ink: SurfaceMaterial & { edge: string; foreground: string };
    shadowColor: string;
    floatShadow: string;
    dialogShadow: string;
    distill: { top: string; bottom: string; edge: string };
    bubbleMe: BubbleMaterial;
    bubbleThem: BubbleMaterial;
  };
  action: {
    primary: PrimaryControlState;
    danger: ThemeControlState;
  };
  interactive: {
    link: string;
    linkHover: string;
    selectedBackground: string;
    selectedForeground: string;
    selectedBorder: string;
    hoverBackground: string;
    hoverBorder: string;
    focusRing: string;
    badgeBackground: string;
    badgeForeground: string;
    badgeBorder: string;
    successForeground: string;
    successBackground: string;
    warningForeground: string;
  };
  dataColor: {
    chart1: string;
    chart2: string;
    chart3: string;
  };
  reader: ReaderTheme;
};

export type AppThemeTone = 'light' | 'dark';

// Skeuomorphic surfaces are a faint two-stop vertical gradient; the 1px top highlight lives in the shadow.
export type SurfaceMaterial = {
  top: string;
  bottom: string;
  shadow: string;
};

type BubbleMaterial = SurfaceMaterial & {
  edge: string;
  foreground: string;
  textShadow: string;
  chip: string;
};

export type ThemeControlState = {
  background: string;
  foreground: string;
  border: string;
};

type PrimaryControlState = ThemeControlState & {
  hoverBackground: string;
  disabledBackground: string;
  disabledForeground: string;
};

export type AppThemeZIndex = {
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
  floating: '80',
  dropdown: '130',
  popover: '160',
  panel: '240',
  overlay: '260',
  modal: '320',
  tooltip: '340',
  topOverlay: '360',
};

const lightReader = {
  paper: '#fffaf3',
  ink: '#2f2720',
  primary: '#8f4037',
  accent: '#f1d8d1',
  accentStrong: '#9b463b',
  noteBorder: 'rgba(47,39,32,.12)',
};

const lightReaderTheme: ReaderTheme = {
  background: '#f6f2ea',
  paper: lightReader.paper,
  ink: lightReader.ink,
  muted: '#766c61',
  line: '#ded5c9',
  primary: lightReader.primary,
  accent: lightReader.accent,
  accentStrong: lightReader.accentStrong,
  danger: '#a13e36',
  paperEdge: 'rgba(28, 26, 23, 0.07)',
  paperShadow:
    'inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 1px 2px rgba(28, 26, 23, 0.06), 0 10px 28px -10px rgba(28, 26, 23, 0.18), 0 28px 56px -28px rgba(28, 26, 23, 0.2)',
  paperHover: mixColors(lightReader.ink, 0.06, lightReader.paper),
  codeBackground: mixColors(lightReader.ink, 0.92, lightReader.paper),
  codeForeground: lightReader.paper,
  focusRing: '#b23223',
  selection: 'rgba(77, 155, 114, 0.18)',
  ribbon: 'linear-gradient(90deg, #8f2519, #b23223 45%, #c64636)',
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
    itemActiveBackground: mixColors(lightReader.primary, 0.1, 'rgba(255,250,243,.84)'),
  },
  note: {
    annotationAccent: lightReader.accentStrong,
    annotationBorder: mixColors(lightReader.accentStrong, 0.18, lightReader.noteBorder),
    annotationMat: mixColors(lightReader.accent, 0.18, lightReader.paper),
    annotationSurface: lightReader.paper,
    background: 'rgba(255,250,243,.92)',
    border: lightReader.noteBorder,
    distillationAccent: lightReader.accentStrong,
    distillationBorder: mixColors(lightReader.accentStrong, 0.46, lightReader.noteBorder),
    distillationSurface: lightReader.paper,
    shadow: '0 10px 30px rgba(47,39,32,.09)',
    quoteBackground: 'rgba(225,191,105,.16)',
    quoteText: '#46392f',
  },
  selectionMenu: {
    foreground: '#fffaf3',
    border: 'rgba(47,39,32,.14)',
    shadow: '0 12px 34px rgba(47,39,32,.26)',
  },
  composer: {
    background: 'rgba(255,250,243,.98)',
    border: 'rgba(47,39,32,.14)',
    shadow: '0 22px 64px rgba(47,39,32,.16)',
  },
  agentPanel: {
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
    overlayScrim: 'rgba(28, 26, 23, 0.32)',
    zIndex: appThemeZIndex,
  },
  surface: {
    edge: 'rgba(28, 26, 23, 0.13)',
    edgeSoft: 'rgba(28, 26, 23, 0.07)',
    panel: {
      top: '#fbfaf8',
      bottom: '#f6f5f1',
      shadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 2px rgba(28, 26, 23, 0.04)',
    },
    raised: {
      top: '#ffffff',
      bottom: '#f7f6f2',
      shadow:
        'inset 0 1px 0 #ffffff, 0 1px 0 rgba(28, 26, 23, 0.04), 0 1px 3px rgba(28, 26, 23, 0.08)',
    },
    card: {
      top: '#ffffff',
      bottom: '#fbfaf7',
      shadow:
        'inset 0 1px 0 #ffffff, 0 1px 2px rgba(28, 26, 23, 0.05), 0 6px 16px -6px rgba(28, 26, 23, 0.1)',
    },
    well: {
      top: '#e8e5df',
      bottom: '#efede8',
      shadow: 'inset 0 1px 2px rgba(28, 26, 23, 0.12), 0 1px 0 rgba(255, 255, 255, 0.85)',
    },
    field: {
      top: '#f9f8f5',
      bottom: '#ffffff',
      shadow: 'inset 0 1px 2px rgba(28, 26, 23, 0.08), 0 1px 0 rgba(255, 255, 255, 0.85)',
    },
    ink: {
      top: '#403b35',
      bottom: '#1c1a17',
      edge: '#0f0e0c',
      foreground: '#ffffff',
      shadow:
        'inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 1px 2px rgba(28, 26, 23, 0.24), 0 3px 8px -3px rgba(28, 26, 23, 0.35)',
    },
    shadowColor: '#1c1a17',
    floatShadow:
      'inset 0 1px 0 #ffffff, 0 2px 6px rgba(28, 26, 23, 0.08), 0 12px 28px -8px rgba(28, 26, 23, 0.2)',
    dialogShadow:
      'inset 0 1px 0 #ffffff, 0 4px 16px rgba(28, 26, 23, 0.12), 0 24px 48px -12px rgba(28, 26, 23, 0.2)',
    distill: { top: '#fffaf2', bottom: '#fbf1e4', edge: 'rgba(178, 50, 35, 0.24)' },
    bubbleMe: {
      top: '#4a453e',
      bottom: '#282521',
      edge: '#12100e',
      foreground: '#ffffff',
      textShadow: '0 -1px 0 rgba(0, 0, 0, 0.28)',
      chip: 'rgba(255, 255, 255, 0.14)',
      shadow:
        'inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 1px 5px rgba(255, 255, 255, 0.07), inset 0 -1px 0 rgba(0, 0, 0, 0.22), 0 1px 3px rgba(28, 26, 23, 0.18), 0 8px 18px -8px rgba(28, 26, 23, 0.36)',
    },
    bubbleThem: {
      top: '#ffffff',
      bottom: '#f3f1ec',
      edge: 'rgba(28, 26, 23, 0.14)',
      foreground: '#1c1a17',
      textShadow: '0 1px 0 #ffffff',
      chip: '#efede8',
      shadow:
        'inset 0 1px 0 #ffffff, inset 0 -1px 0 rgba(28, 26, 23, 0.05), 0 1px 3px rgba(28, 26, 23, 0.06), 0 6px 14px -6px rgba(28, 26, 23, 0.16)',
    },
  },
  action: {
    primary: {
      background: '#1c1a17',
      foreground: '#ffffff',
      border: '#0f0e0c',
      hoverBackground: '#403b35',
      disabledBackground: '#e4e0d8',
      disabledForeground: '#75706a',
    },
    danger: {
      background: '#c0352b',
      foreground: '#ffffff',
      border: '#c0352b',
    },
  },
  interactive: {
    link: '#b23223',
    linkHover: '#8f2519',
    selectedBackground: 'rgba(178, 50, 35, 0.08)',
    selectedForeground: '#b23223',
    selectedBorder: 'rgba(178, 50, 35, 0.45)',
    hoverBackground: '#efede8',
    hoverBorder: 'rgba(178, 50, 35, 0.45)',
    focusRing: '#b23223',
    badgeBackground: 'rgba(178, 50, 35, 0.08)',
    badgeForeground: '#b23223',
    badgeBorder: 'rgba(178, 50, 35, 0.45)',
    successForeground: 'hsl(142 44% 30%)',
    successBackground: 'hsl(142 42% 92%)',
    warningForeground: 'hsl(36 87% 52%)',
  },
  dataColor: {
    chart1: 'hsl(83 24% 35%)',
    chart2: 'hsl(8 45% 46%)',
    chart3: 'hsl(205 30% 38%)',
  },
  reader: lightReaderTheme,
};

const darkReader = {
  background: '#1a1815',
  paper: '#242019',
  ink: '#e0d9cc',
  primary: '#e0844f',
  accentStrong: '#e0844f',
  noteBorder: 'rgba(224,217,204,.12)',
};

const darkReaderTheme: ReaderTheme = {
  background: darkReader.background,
  paper: darkReader.paper,
  ink: darkReader.ink,
  muted: '#8c8576',
  line: '#464139',
  primary: darkReader.primary,
  accent: '#3d241b',
  accentStrong: darkReader.accentStrong,
  danger: '#e56f65',
  paperEdge: 'rgba(0, 0, 0, 0.4)',
  paperShadow:
    'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.3), 0 12px 32px -10px rgba(0, 0, 0, 0.65)',
  paperHover: mixColors(darkReader.ink, 0.06, darkReader.paper),
  codeBackground: mixColors(darkReader.paper, 0.84, darkReader.ink),
  codeForeground: darkReader.ink,
  focusRing: mixColors(darkReader.paper, 0.18, darkReader.ink),
  selection: 'rgba(77, 155, 114, 0.18)',
  ribbon: 'linear-gradient(90deg, #c9584a, #e8735f 45%, #f08b79)',
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
    itemActiveBackground: mixColors(darkReader.primary, 0.1, 'rgba(48,42,34,.82)'),
  },
  note: {
    annotationAccent: darkReader.accentStrong,
    annotationBorder: mixColors(darkReader.accentStrong, 0.24, darkReader.noteBorder),
    annotationMat: mixColors(darkReader.accentStrong, 0.08, darkReader.background),
    annotationSurface: mixColors(darkReader.paper, 0.86, darkReader.ink),
    background: 'rgba(36,32,25,.9)',
    border: darkReader.noteBorder,
    distillationAccent: darkReader.accentStrong,
    distillationBorder: mixColors(darkReader.accentStrong, 0.46, darkReader.noteBorder),
    distillationSurface: mixColors(darkReader.paper, 0.88, darkReader.accentStrong),
    shadow: '0 18px 44px rgba(0,0,0,.42)',
    quoteBackground: 'rgba(224,132,79,.16)',
    quoteText: '#e0d9cc',
  },
  selectionMenu: {
    foreground: '#e0d9cc',
    border: 'rgba(224,217,204,.14)',
    shadow: '0 18px 48px rgba(0,0,0,.52)',
  },
  composer: {
    background: 'rgba(36,32,25,.98)',
    border: 'rgba(224,217,204,.16)',
    shadow: '0 24px 70px rgba(0,0,0,.58)',
  },
  agentPanel: {
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
    overlayScrim: 'rgba(0, 0, 0, 0.5)',
    zIndex: appThemeZIndex,
  },
  surface: {
    edge: 'rgba(0, 0, 0, 0.55)',
    edgeSoft: 'rgba(0, 0, 0, 0.4)',
    panel: {
      top: '#1e1d1b',
      bottom: '#191816',
      shadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
    },
    raised: {
      top: '#2e2b27',
      bottom: '#252320',
      shadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 1px 2px rgba(0, 0, 0, 0.45)',
    },
    card: {
      top: '#272522',
      bottom: '#211f1c',
      shadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 2px 10px -2px rgba(0, 0, 0, 0.5)',
    },
    well: {
      top: '#131211',
      bottom: '#1a1917',
      shadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.55), 0 1px 0 rgba(255, 255, 255, 0.05)',
    },
    field: {
      top: '#181715',
      bottom: '#1e1c1a',
      shadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.05)',
    },
    ink: {
      top: '#f6f3ee',
      bottom: '#d9d4cb',
      edge: 'rgba(0, 0, 0, 0.6)',
      foreground: '#1a1917',
      shadow:
        'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 2px rgba(0, 0, 0, 0.5), 0 3px 8px -3px rgba(0, 0, 0, 0.6)',
    },
    shadowColor: '#000000',
    floatShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 2px 6px rgba(0, 0, 0, 0.4), 0 14px 32px -8px rgba(0, 0, 0, 0.65)',
    dialogShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 24px 56px -12px rgba(0, 0, 0, 0.6)',
    distill: { top: '#2c2622', bottom: '#241f1b', edge: 'rgba(232, 115, 95, 0.32)' },
    bubbleMe: {
      top: '#f3efe8',
      bottom: '#d9d3c9',
      edge: 'rgba(0, 0, 0, 0.6)',
      foreground: '#1a1917',
      textShadow: '0 1px 0 rgba(255, 255, 255, 0.5)',
      chip: 'rgba(0, 0, 0, 0.08)',
      shadow:
        'inset 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 -1px 0 rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.5), 0 8px 18px -8px rgba(0, 0, 0, 0.6)',
    },
    bubbleThem: {
      top: '#2f2c28',
      bottom: '#262320',
      edge: 'rgba(0, 0, 0, 0.55)',
      foreground: '#ece8e1',
      textShadow: '0 -1px 0 rgba(0, 0, 0, 0.4)',
      chip: '#2a2825',
      shadow:
        'inset 0 1px 0 rgba(255, 255, 255, 0.07), inset 0 -1px 0 rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.4), 0 8px 18px -8px rgba(0, 0, 0, 0.6)',
    },
  },
  action: {
    primary: {
      background: '#d9d4cb',
      foreground: '#1a1917',
      border: 'rgba(0, 0, 0, 0.6)',
      hoverBackground: '#f6f3ee',
      disabledBackground: '#33302b',
      disabledForeground: '#8f897f',
    },
    danger: {
      background: '#c4392e',
      foreground: '#ffffff',
      border: '#c4392e',
    },
  },
  interactive: {
    link: '#e8735f',
    linkHover: '#f08b79',
    selectedBackground: 'rgba(232, 115, 95, 0.12)',
    selectedForeground: '#e8735f',
    selectedBorder: 'rgba(232, 115, 95, 0.5)',
    hoverBackground: '#2a2825',
    hoverBorder: 'rgba(232, 115, 95, 0.5)',
    focusRing: '#e8735f',
    badgeBackground: 'rgba(232, 115, 95, 0.12)',
    badgeForeground: '#e8735f',
    badgeBorder: 'rgba(232, 115, 95, 0.5)',
    successForeground: 'hsl(140 50% 72%)',
    successBackground: 'hsl(142 32% 18%)',
    warningForeground: 'hsl(36 87% 52%)',
  },
  dataColor: {
    chart1: 'hsl(140 30% 52%)',
    chart2: 'hsl(8 56% 60%)',
    chart3: 'hsl(205 46% 60%)',
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
    '--app-overlay-scrim': theme.effect.overlayScrim,
    '--app-edge': theme.surface.edge,
    '--app-edge-soft': theme.surface.edgeSoft,
    '--app-panel': surfaceGradient(theme.surface.panel),
    '--app-panel-shadow': theme.surface.panel.shadow,
    '--app-raised': surfaceGradient(theme.surface.raised),
    '--app-raised-shadow': theme.surface.raised.shadow,
    '--app-card-surface': surfaceGradient(theme.surface.card),
    '--app-card-shadow': theme.surface.card.shadow,
    '--app-well': surfaceGradient(theme.surface.well),
    '--app-well-shadow': theme.surface.well.shadow,
    '--app-field': surfaceGradient(theme.surface.field),
    '--app-field-shadow': theme.surface.field.shadow,
    '--app-ink': surfaceGradient(theme.surface.ink),
    '--app-ink-edge': theme.surface.ink.edge,
    '--app-ink-fg': theme.surface.ink.foreground,
    '--app-ink-shadow': theme.surface.ink.shadow,
    '--app-float-shadow': theme.surface.floatShadow,
    '--app-dialog-shadow': theme.surface.dialogShadow,
    '--app-distill': surfaceGradient(theme.surface.distill),
    '--app-distill-edge': theme.surface.distill.edge,
    ...bubbleVariables('me', theme.surface.bubbleMe),
    ...bubbleVariables('them', theme.surface.bubbleThem),
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
    '--app-action-primary-disabled-bg': theme.action.primary.disabledBackground,
    '--app-action-primary-disabled-fg': theme.action.primary.disabledForeground,
    '--app-action-danger-bg': theme.action.danger.background,
    '--app-action-danger-fg': theme.action.danger.foreground,
    '--app-action-danger-border': theme.action.danger.border,
    '--app-interactive-link': theme.interactive.link,
    '--app-interactive-link-hover': theme.interactive.linkHover,
    '--app-interactive-selected-bg': theme.interactive.selectedBackground,
    '--app-interactive-selected-fg': theme.interactive.selectedForeground,
    '--app-interactive-selected-border': theme.interactive.selectedBorder,
    '--app-interactive-hover-bg': theme.interactive.hoverBackground,
    '--app-interactive-hover-border': theme.interactive.hoverBorder,
    '--app-interactive-focus-ring': theme.interactive.focusRing,
    '--app-interactive-badge-bg': theme.interactive.badgeBackground,
    '--app-interactive-badge-fg': theme.interactive.badgeForeground,
    '--app-interactive-badge-border': theme.interactive.badgeBorder,
    '--app-interactive-success-fg': theme.interactive.successForeground,
    '--app-interactive-success-bg': theme.interactive.successBackground,
    '--app-interactive-warning-fg': theme.interactive.warningForeground,
    ...alphaVariables('--app-ink', theme.action.primary.background, [4, 6, 8, 16]),
    ...alphaVariables('--app-shadow', theme.surface.shadowColor, [6, 12, 16, 24]),
    ...alphaVariables('--app-danger', theme.action.danger.background, [8, 12]),
    ...alphaVariables('--app-brand', theme.interactive.link, [8, 24]),
    '--app-brand-surface': mixColors(theme.interactive.link, 0.06, theme.palette.card),
    '--app-danger-line': mixColors(theme.action.danger.background, 0.5, theme.palette.border),
    '--app-danger-surface': mixColors(theme.action.danger.background, 0.06, theme.palette.card),
    ...alphaVariables('--app-success', theme.interactive.successForeground, [16, 32]),
    '--chart-1': theme.dataColor.chart1,
    '--chart-2': theme.dataColor.chart2,
    '--chart-3': theme.dataColor.chart3,
    ...readerThemeToCssVariables(theme.reader),
  };
}

function bubbleVariables(side: 'me' | 'them', bubble: BubbleMaterial) {
  return {
    [`--app-bubble-${side}`]: surfaceGradient(bubble),
    [`--app-bubble-${side}-edge`]: bubble.edge,
    [`--app-bubble-${side}-fg`]: bubble.foreground,
    [`--app-bubble-${side}-shadow`]: bubble.shadow,
    [`--app-bubble-${side}-text-shadow`]: bubble.textShadow,
    [`--app-bubble-${side}-chip`]: bubble.chip,
  };
}

function surfaceGradient(material: Pick<SurfaceMaterial, 'top' | 'bottom'>) {
  return `linear-gradient(to bottom, ${material.top}, ${material.bottom})`;
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
