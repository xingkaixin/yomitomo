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
  };
  dataColor: {
    chart1: string;
    chart2: string;
    chart3: string;
    userAnnotationDefault: string;
    readerAgentFallback: string;
  };
  reader: ReaderTheme;
};

export const defaultThemeId = 'default';
export const beigePaperThemeId = 'beige-paper';

const defaultReaderTheme: ReaderTheme = {
  background: '#f5f1e8',
  paper: '#fffdf8',
  ink: '#28231d',
  muted: '#746d63',
  line: '#e3dccf',
  primary: '#28231d',
  accent: '#ead89d',
  accentStrong: '#c7a45e',
  danger: '#9f5b50',
  toolbar: {
    background: 'rgba(255,253,248,.9)',
    border: 'rgba(40,35,29,.1)',
    controlBackground: 'rgba(255,253,248,.84)',
    controlHoverBackground: '#f0eadf',
  },
  toc: {
    background: 'rgba(250,247,240,.62)',
    itemHoverBackground: 'rgba(255,253,248,.82)',
  },
  note: {
    background: 'rgba(255,253,248,.88)',
    border: 'rgba(40,35,29,.1)',
    shadow: '0 8px 24px rgba(40,35,29,.07)',
    quoteBackground: 'rgba(234,216,157,.18)',
    quoteText: '#3f352c',
  },
  selectionMenu: {
    background: 'rgba(39,36,32,.92)',
    foreground: '#fff8e8',
    border: 'rgba(40,35,29,.12)',
    shadow: '0 12px 34px rgba(37,29,22,.28)',
  },
  composer: {
    background: 'rgba(255,253,248,.98)',
    border: 'rgba(40,35,29,.14)',
    shadow: '0 22px 64px rgba(40,35,29,.18)',
  },
  agentPanel: {
    background: 'rgba(255,250,240,.92)',
    border: 'rgba(37,29,22,.12)',
    hoverBackground: '#f0e3cd',
  },
  overlay: {
    scrim: 'rgba(40,35,29,.14)',
    edgeBlurTop: 'linear-gradient(to bottom,rgba(245,241,232,.82),rgba(245,241,232,0))',
    edgeBlurBottom: 'linear-gradient(to top,rgba(245,241,232,.82),rgba(245,241,232,0))',
  },
};

export const defaultTheme: AppTheme = {
  meta: {
    id: defaultThemeId,
    name: '报纸风',
    description: '当前 Yomitomo 桌面端默认视觉，提炼为主题契约的基准主题。',
  },
  font: {
    ui: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    readerSerif: "'Source Serif 4', 'Noto Serif SC', 'Songti SC', Georgia, serif",
  },
  palette: {
    background: '0 0% 98%',
    foreground: '0 0% 8%',
    card: '0 0% 100%',
    cardForeground: '0 0% 8%',
    popover: '0 0% 100%',
    popoverForeground: '0 0% 8%',
    primary: '0 0% 8%',
    primaryForeground: '0 0% 98%',
    secondary: '0 0% 94%',
    secondaryForeground: '0 0% 11%',
    muted: '0 0% 94%',
    mutedForeground: '0 0% 42%',
    accent: '4 68% 94%',
    accentForeground: '3 62% 36%',
    destructive: '3 64% 42%',
    destructiveForeground: '0 0% 98%',
    border: '0 0% 78%',
    input: '0 0% 78%',
    ring: '3 62% 42%',
  },
  effect: {
    radius: '0.85rem',
    resizeDuration: '300ms',
    resizeEase: 'cubic-bezier(0.22, 1, 0.36, 1)',
    shellBackground:
      'radial-gradient(circle at 14% 18%, hsl(50 36% 84% / 0.42), transparent 30%), linear-gradient(135deg, hsl(45 38% 93%), hsl(36 32% 88%))',
    shellPanelShadow: '0 24px 80px hsl(31 34% 24% / 0.12)',
    subtlePanelShadow: '0 12px 36px hsl(31 34% 24% / 0.05)',
    cardShadow: '0 7px 18px hsl(31 34% 24% / 0.13)',
    overlayScrim: 'rgba(40,35,29,.14)',
  },
  dataColor: {
    chart1: 'hsl(83 24% 35%)',
    chart2: 'hsl(8 45% 46%)',
    chart3: 'hsl(205 30% 38%)',
    userAnnotationDefault: '#f4c95d',
    readerAgentFallback: '#28231d',
  },
  reader: defaultReaderTheme,
};

const beigePaperReaderTheme: ReaderTheme = {
  background: '#efe2c9',
  paper: '#fff4df',
  ink: '#302416',
  muted: '#7c6a54',
  line: '#dbc8aa',
  primary: '#4a321b',
  accent: '#e1c27d',
  accentStrong: '#b9873d',
  danger: '#9d4d3f',
  toolbar: {
    background: 'rgba(255,244,223,.9)',
    border: 'rgba(74,50,27,.14)',
    controlBackground: 'rgba(255,248,234,.84)',
    controlHoverBackground: '#ead7b8',
  },
  toc: {
    background: 'rgba(235,217,184,.58)',
    itemHoverBackground: 'rgba(255,244,223,.78)',
  },
  note: {
    background: 'rgba(255,246,229,.9)',
    border: 'rgba(74,50,27,.14)',
    shadow: '0 10px 28px rgba(74,50,27,.1)',
    quoteBackground: 'rgba(225,194,125,.2)',
    quoteText: '#4d3924',
  },
  selectionMenu: {
    background: 'rgba(61,42,24,.94)',
    foreground: '#fff4df',
    border: 'rgba(74,50,27,.16)',
    shadow: '0 14px 36px rgba(61,42,24,.32)',
  },
  composer: {
    background: 'rgba(255,246,229,.98)',
    border: 'rgba(74,50,27,.18)',
    shadow: '0 24px 68px rgba(74,50,27,.2)',
  },
  agentPanel: {
    background: 'rgba(252,237,209,.94)',
    border: 'rgba(74,50,27,.16)',
    hoverBackground: '#ead2a7',
  },
  overlay: {
    scrim: 'rgba(74,50,27,.18)',
    edgeBlurTop: 'linear-gradient(to bottom,rgba(239,226,201,.88),rgba(239,226,201,0))',
    edgeBlurBottom: 'linear-gradient(to top,rgba(239,226,201,.88),rgba(239,226,201,0))',
  },
};

export const beigePaperTheme: AppTheme = {
  meta: {
    id: beigePaperThemeId,
    name: '米色纸',
    description: '用于验证主题契约覆盖范围的米色纸质感主题。',
  },
  font: defaultTheme.font,
  palette: {
    background: '39 52% 91%',
    foreground: '31 39% 14%',
    card: '39 69% 96%',
    cardForeground: '31 39% 14%',
    popover: '39 69% 96%',
    popoverForeground: '31 39% 14%',
    primary: '31 45% 20%',
    primaryForeground: '39 68% 96%',
    secondary: '38 44% 86%',
    secondaryForeground: '31 39% 16%',
    muted: '38 36% 84%',
    mutedForeground: '33 23% 39%',
    accent: '40 63% 82%',
    accentForeground: '29 55% 29%',
    destructive: '7 43% 43%',
    destructiveForeground: '39 68% 96%',
    border: '36 34% 70%',
    input: '36 34% 70%',
    ring: '29 55% 35%',
  },
  effect: {
    radius: '0.8rem',
    resizeDuration: defaultTheme.effect.resizeDuration,
    resizeEase: defaultTheme.effect.resizeEase,
    shellBackground:
      'radial-gradient(circle at 18% 16%, hsl(42 68% 83% / 0.5), transparent 28%), linear-gradient(135deg, hsl(39 56% 90%), hsl(34 45% 82%))',
    shellPanelShadow: '0 24px 82px hsl(31 45% 20% / 0.16)',
    subtlePanelShadow: '0 12px 38px hsl(31 45% 20% / 0.08)',
    cardShadow: '0 8px 22px hsl(31 45% 20% / 0.15)',
    overlayScrim: 'rgba(74,50,27,.18)',
  },
  dataColor: {
    chart1: 'hsl(94 25% 34%)',
    chart2: 'hsl(11 45% 45%)',
    chart3: 'hsl(207 27% 36%)',
    userAnnotationDefault: '#e1c27d',
    readerAgentFallback: '#4a321b',
  },
  reader: beigePaperReaderTheme,
};

export const themeRegistry = {
  [defaultThemeId]: defaultTheme,
  [beigePaperThemeId]: beigePaperTheme,
} as const satisfies Record<string, AppTheme>;

export type AppThemeId = keyof typeof themeRegistry;

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
    '--chart-1': theme.dataColor.chart1,
    '--chart-2': theme.dataColor.chart2,
    '--chart-3': theme.dataColor.chart3,
    '--app-user-annotation-default': theme.dataColor.userAnnotationDefault,
    '--app-reader-agent-fallback': theme.dataColor.readerAgentFallback,
    ...readerThemeToCssVariables(theme.reader),
  };
}

export function applyAppTheme(theme: AppTheme, root: HTMLElement = document.documentElement) {
  root.dataset.theme = theme.meta.id;
  const variables = themeToCssVariables(theme);
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
}
