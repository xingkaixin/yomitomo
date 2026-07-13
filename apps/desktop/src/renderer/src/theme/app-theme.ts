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
    visible: boolean;
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
  paperPattern: PaperPatternTheme;
  dataColor: {
    chart1: string;
    chart2: string;
    chart3: string;
    userAnnotationDefault: string;
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

export type PaperPatternKind = 'plain' | 'grid' | 'dot' | 'ruled' | 'dash-grid';

export type PaperPatternTheme = {
  kind: PaperPatternKind;
  background: string;
  color: string;
  secondaryColor?: string;
  opacity: string;
  size: string;
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

export const defaultThemeId = 'default';
export const beigePaperThemeId = 'beige-paper';
export const inkBlackThemeId = 'ink-black';
export const duskIndigoThemeId = 'dusk-indigo';
export const inkPaperThemeId = 'ink-paper';
const cachedThemeStorageKey = 'yomitomo.themeId';
const cachedThemeIdsByToneStorageKey = 'yomitomo.themeIdsByTone';

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

const defaultReaderTheme: ReaderTheme = {
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

export const defaultTheme: AppTheme = {
  meta: {
    id: defaultThemeId,
    name: '纸白',
    description: '当前 Yomitomo 桌面端默认视觉，提炼为主题契约的基准主题。',
    tone: 'light',
    visible: true,
  },
  font: {
    ui: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    readerSerif: "'Source Serif 4', 'Noto Serif SC', 'Songti SC', Georgia, serif",
  },
  palette: {
    background: '40 33% 97%',
    foreground: '28 21% 13%',
    card: '42 50% 99%',
    cardForeground: '28 21% 13%',
    popover: '42 50% 99%',
    popoverForeground: '28 21% 13%',
    primary: '28 21% 13%',
    primaryForeground: '42 50% 98%',
    secondary: '38 24% 92%',
    secondaryForeground: '28 18% 16%',
    muted: '38 24% 92%',
    mutedForeground: '30 11% 42%',
    accent: '6 42% 93%',
    accentForeground: '4 45% 38%',
    destructive: '3 64% 42%',
    destructiveForeground: '42 50% 98%',
    border: '34 18% 78%',
    input: '34 18% 78%',
    ring: '4 45% 42%',
  },
  effect: {
    radius: '0.85rem',
    resizeDuration: '300ms',
    resizeEase: 'cubic-bezier(0.22, 1, 0.36, 1)',
    shellBackground:
      'radial-gradient(circle at 14% 18%, hsl(50 36% 84% / 0.42), transparent 30%), linear-gradient(135deg, hsl(45 38% 93%), hsl(36 32% 88%))',
    shellPanelShadow: '0 24px 80px hsl(31 34% 24% / 0.12)',
    subtlePanelShadow: '0 12px 36px hsl(31 34% 24% / 0.05)',
    cardShadow: '0 7px 18px hsl(31 28% 24% / 0.11)',
    overlayScrim: 'rgba(47,39,32,.14)',
    zIndex: appThemeZIndex,
  },
  action: {
    primary: {
      background: 'hsl(28 21% 13%)',
      foreground: 'hsl(42 50% 98%)',
      border: 'hsl(28 21% 13%)',
      hoverBackground: 'hsl(28 21% 18%)',
      activeBackground: 'hsl(28 21% 9%)',
      disabledBackground: 'hsl(36 18% 84%)',
      disabledForeground: 'hsl(30 10% 46%)',
    },
    secondary: {
      background: 'hsl(42 50% 99% / 0.84)',
      foreground: 'hsl(28 21% 13%)',
      border: 'hsl(34 18% 78% / 0.86)',
      hoverBackground: 'hsl(40 30% 92%)',
      activeBackground: 'hsl(40 24% 86%)',
      disabledBackground: 'hsl(38 24% 92% / 0.72)',
      disabledForeground: 'hsl(30 10% 50%)',
    },
    danger: {
      background: 'hsl(3 64% 42%)',
      foreground: 'hsl(0 0% 98%)',
      border: 'hsl(3 64% 42%)',
      hoverBackground: 'hsl(3 64% 36%)',
      activeBackground: 'hsl(3 64% 30%)',
      disabledBackground: 'hsl(3 24% 84%)',
      disabledForeground: 'hsl(3 20% 44%)',
    },
  },
  interactive: {
    link: 'hsl(3 62% 39%)',
    linkHover: 'hsl(3 62% 32%)',
    selectedBackground: 'hsl(4 68% 94%)',
    selectedForeground: 'hsl(3 62% 36%)',
    selectedBorder: 'hsl(3 62% 39% / 0.52)',
    currentBackground: 'hsl(40 30% 94% / 0.82)',
    hoverBackground: 'hsl(40 34% 94% / 0.74)',
    hoverBorder: 'hsl(3 62% 39% / 0.4)',
    focusRing: 'hsl(3 62% 42% / 0.38)',
    badgeBackground: 'hsl(4 68% 94%)',
    badgeForeground: 'hsl(3 62% 36%)',
    badgeBorder: 'hsl(3 62% 42% / 0.22)',
    successForeground: 'hsl(142 44% 30%)',
    successBackground: 'hsl(142 42% 92%)',
  },
  paperPattern: {
    kind: 'grid',
    background: 'hsl(42 50% 99%)',
    color: 'hsl(28 21% 13%)',
    secondaryColor: 'hsl(28 21% 13%)',
    opacity: '0.016',
    size: '16px',
  },
  dataColor: {
    chart1: 'hsl(83 24% 35%)',
    chart2: 'hsl(8 45% 46%)',
    chart3: 'hsl(205 30% 38%)',
    userAnnotationDefault: '#f4c95d',
    readerAgentFallback: '#2f2720',
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
    progressTrack: 'rgba(74,50,27,.12)',
    progressFill: '#b9873d',
  },
  toc: {
    background: 'rgba(235,217,184,.58)',
    itemHoverBackground: 'rgba(255,244,223,.78)',
  },
  note: {
    annotationAccent: 'var(--app-reader-accent-strong)',
    annotationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 24%,var(--app-reader-note-border))',
    annotationMat: 'color-mix(in srgb,var(--app-reader-accent) 20%,var(--app-reader-paper))',
    annotationSurface: 'var(--app-reader-paper)',
    background: 'rgba(255,246,229,.9)',
    border: 'rgba(74,50,27,.14)',
    distillationAccent: 'var(--app-reader-accent-strong)',
    distillationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 46%,var(--app-reader-note-border))',
    distillationMat: 'color-mix(in srgb,var(--app-reader-accent) 34%,var(--app-reader-note-bg))',
    distillationSurface: 'var(--app-reader-paper)',
    distillationTabForeground: '#fff4df',
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
  chat: {
    panelBackground: 'rgba(255,246,229,.98)',
    panelBorder: 'rgba(74,50,27,.16)',
    panelShadow: '0 28px 88px rgba(74,50,27,.24),inset 0 1px 0 rgba(255,255,255,.5)',
    userBubbleBackground: '#302416',
    userBubbleForeground: '#fff4df',
    assistantBubbleBackground: 'rgba(74,50,27,.08)',
    assistantBubbleForeground: '#302416',
    contextBackground: 'rgba(225,194,125,.22)',
    contextBorder: 'rgba(185,135,61,.24)',
    contextForeground: '#4d3924',
    composerBackground: 'color-mix(in srgb,#fff4df 74%,rgba(255,246,229,.9))',
    composerBorder: 'rgba(74,50,27,.12)',
    sendBackground: '#4a321b',
    sendForeground: '#fff4df',
    sendDisabledBackground: 'rgba(74,50,27,.16)',
    sendDisabledForeground: 'rgba(74,50,27,.48)',
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
    tone: 'light',
    visible: false,
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
    zIndex: appThemeZIndex,
  },
  action: {
    primary: {
      background: 'hsl(31 45% 20%)',
      foreground: 'hsl(39 68% 96%)',
      border: 'hsl(31 45% 20%)',
      hoverBackground: 'hsl(31 45% 16%)',
      activeBackground: 'hsl(31 45% 12%)',
      disabledBackground: 'hsl(38 34% 76%)',
      disabledForeground: 'hsl(33 22% 42%)',
    },
    secondary: {
      background: 'hsl(39 69% 96% / 0.86)',
      foreground: 'hsl(31 39% 14%)',
      border: 'hsl(36 34% 70% / 0.9)',
      hoverBackground: 'hsl(38 44% 86%)',
      activeBackground: 'hsl(37 42% 80%)',
      disabledBackground: 'hsl(38 36% 84% / 0.7)',
      disabledForeground: 'hsl(33 20% 46%)',
    },
    danger: {
      background: 'hsl(7 43% 43%)',
      foreground: 'hsl(39 68% 96%)',
      border: 'hsl(7 43% 43%)',
      hoverBackground: 'hsl(7 43% 36%)',
      activeBackground: 'hsl(7 43% 30%)',
      disabledBackground: 'hsl(12 28% 78%)',
      disabledForeground: 'hsl(9 22% 42%)',
    },
  },
  interactive: {
    link: 'hsl(29 55% 29%)',
    linkHover: 'hsl(29 55% 23%)',
    selectedBackground: 'hsl(40 63% 82%)',
    selectedForeground: 'hsl(29 55% 29%)',
    selectedBorder: 'hsl(29 55% 29% / 0.52)',
    currentBackground: 'hsl(39 60% 92% / 0.82)',
    hoverBackground: 'hsl(38 44% 86% / 0.72)',
    hoverBorder: 'hsl(29 55% 29% / 0.4)',
    focusRing: 'hsl(29 55% 35% / 0.36)',
    badgeBackground: 'hsl(40 63% 82% / 0.64)',
    badgeForeground: 'hsl(29 55% 29%)',
    badgeBorder: 'hsl(29 55% 35% / 0.22)',
    successForeground: 'hsl(140 42% 28%)',
    successBackground: 'hsl(132 40% 88%)',
  },
  paperPattern: {
    kind: 'dash-grid',
    background: 'hsl(39 69% 96%)',
    color: 'hsl(31 45% 20%)',
    secondaryColor: 'hsl(31 45% 20%)',
    opacity: '0.028',
    size: '18px',
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

const inkBlackReaderTheme: ReaderTheme = {
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

export const inkBlackTheme: AppTheme = {
  meta: {
    id: inkBlackThemeId,
    name: '墨黑',
    description: '暖调近黑、松烟纸面和余烬赤陶强调的夜间阅读主题。',
    tone: 'dark',
    visible: true,
  },
  font: defaultTheme.font,
  palette: {
    background: '34 9% 9%',
    foreground: '40 16% 87%',
    card: '33 8% 14%',
    cardForeground: '40 16% 87%',
    popover: '33 8% 14%',
    popoverForeground: '40 16% 87%',
    primary: '8 76% 63%',
    primaryForeground: '30 14% 10%',
    secondary: '33 8% 17%',
    secondaryForeground: '40 16% 87%',
    muted: '33 8% 17%',
    mutedForeground: '38 9% 60%',
    accent: '8 40% 20%',
    accentForeground: '8 76% 63%',
    destructive: '6 72% 62%',
    destructiveForeground: '30 14% 10%',
    border: '36 7% 27%',
    input: '36 7% 27%',
    ring: '8 76% 63%',
  },
  effect: {
    radius: '0.75rem',
    resizeDuration: defaultTheme.effect.resizeDuration,
    resizeEase: defaultTheme.effect.resizeEase,
    shellBackground:
      'radial-gradient(circle at 16% 18%, hsl(8 76% 63% / 0.14), transparent 28%), linear-gradient(135deg, hsl(34 9% 9%), hsl(30 10% 7%))',
    shellPanelShadow: '0 26px 70px hsl(0 0% 0% / 0.58)',
    subtlePanelShadow: '0 12px 30px hsl(0 0% 0% / 0.5)',
    cardShadow: '0 8px 18px hsl(0 0% 0% / 0.45)',
    overlayScrim: 'rgba(0,0,0,.42)',
    zIndex: appThemeZIndex,
  },
  action: {
    primary: {
      background: 'hsl(8 76% 63%)',
      foreground: 'hsl(30 14% 10%)',
      border: 'hsl(8 76% 63%)',
      hoverBackground: 'hsl(8 76% 68%)',
      activeBackground: 'hsl(8 70% 56%)',
      disabledBackground: 'hsl(36 7% 27%)',
      disabledForeground: 'hsl(36 8% 45%)',
    },
    secondary: {
      background: 'hsl(33 8% 17% / 0.86)',
      foreground: 'hsl(40 16% 87%)',
      border: 'hsl(36 7% 30% / 0.7)',
      hoverBackground: 'hsl(33 8% 22%)',
      activeBackground: 'hsl(33 8% 26%)',
      disabledBackground: 'hsl(33 8% 17% / 0.56)',
      disabledForeground: 'hsl(36 8% 45%)',
    },
    danger: {
      background: 'hsl(6 72% 62%)',
      foreground: 'hsl(30 14% 10%)',
      border: 'hsl(6 72% 62%)',
      hoverBackground: 'hsl(6 72% 67%)',
      activeBackground: 'hsl(6 64% 55%)',
      disabledBackground: 'hsl(6 24% 25%)',
      disabledForeground: 'hsl(36 8% 45%)',
    },
  },
  interactive: {
    link: 'hsl(8 76% 63%)',
    linkHover: 'hsl(8 76% 70%)',
    selectedBackground: 'hsl(8 40% 20%)',
    selectedForeground: 'hsl(8 76% 63%)',
    selectedBorder: 'hsl(8 76% 63% / 0.48)',
    currentBackground: 'hsl(33 8% 17% / 0.82)',
    hoverBackground: 'hsl(33 8% 17% / 0.72)',
    hoverBorder: 'hsl(8 76% 63% / 0.38)',
    focusRing: 'hsl(8 76% 63% / 0.4)',
    badgeBackground: 'hsl(8 40% 20%)',
    badgeForeground: 'hsl(8 76% 63%)',
    badgeBorder: 'hsl(8 76% 63% / 0.24)',
    successForeground: 'hsl(140 50% 72%)',
    successBackground: 'hsl(142 32% 18%)',
  },
  paperPattern: {
    kind: 'dash-grid',
    background: 'hsl(34 9% 9%)',
    color: 'hsl(40 16% 87%)',
    secondaryColor: 'hsl(8 76% 63%)',
    opacity: '0.035',
    size: '18px',
  },
  dataColor: {
    chart1: 'hsl(140 30% 52%)',
    chart2: 'hsl(8 56% 60%)',
    chart3: 'hsl(205 46% 60%)',
    userAnnotationDefault: '#e0844f',
    readerAgentFallback: '#e0d9cc',
  },
  reader: inkBlackReaderTheme,
};

const duskIndigoReaderTheme: ReaderTheme = {
  background: '#12141b',
  paper: '#171a21',
  ink: '#dbe2eb',
  muted: '#94a0ad',
  line: '#3c404e',
  primary: '#ef7e58',
  accent: '#36211f',
  accentStrong: '#ef7e58',
  danger: '#f06d5d',
  toolbar: {
    background: 'hsl(228 19% 9% / 0.88)',
    border: 'hsl(222 13% 27% / 0.82)',
    controlBackground: 'hsl(223 15% 15% / 0.86)',
    controlHoverBackground: 'hsl(221 15% 19%)',
    progressTrack: 'hsl(222 13% 35% / 0.45)',
    progressFill: '#ef7e58',
  },
  toc: {
    background: 'hsl(223 15% 15% / 0.62)',
    itemHoverBackground: 'hsl(221 15% 19% / 0.82)',
  },
  note: {
    annotationAccent: 'var(--app-reader-accent-strong)',
    annotationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 24%,var(--app-reader-note-border))',
    annotationMat: 'color-mix(in srgb,var(--app-reader-accent-strong) 8%,var(--app-reader-bg))',
    annotationSurface: 'color-mix(in srgb,var(--app-reader-paper) 86%,var(--app-reader-ink) 14%)',
    background: 'hsl(223 15% 15% / 0.9)',
    border: 'hsl(222 13% 27% / 0.86)',
    distillationAccent: 'var(--app-reader-accent-strong)',
    distillationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 46%,var(--app-reader-note-border))',
    distillationMat: 'color-mix(in srgb,var(--app-reader-accent-strong) 14%,var(--app-reader-bg))',
    distillationSurface:
      'color-mix(in srgb,var(--app-reader-paper) 88%,var(--app-reader-accent-strong) 12%)',
    distillationTabForeground: '#12141b',
    shadow: '0 18px 44px hsl(228 40% 3% / 0.52)',
    quoteBackground: 'hsl(8 32% 16% / 0.72)',
    quoteText: '#dbe2eb',
  },
  selectionMenu: {
    background: 'hsl(223 15% 15% / 0.94)',
    foreground: '#dbe2eb',
    border: 'hsl(222 13% 31% / 0.78)',
    shadow: '0 18px 48px hsl(228 40% 3% / 0.58)',
  },
  composer: {
    background: 'hsl(223 15% 15% / 0.98)',
    border: 'hsl(222 13% 31% / 0.84)',
    shadow: '0 24px 70px hsl(228 45% 3% / 0.62)',
  },
  chat: {
    panelBackground: 'hsl(223 15% 15% / 0.98)',
    panelBorder: 'hsl(222 13% 31% / 0.84)',
    panelShadow: '0 28px 88px hsl(228 45% 3% / 0.68),inset 0 1px 0 hsl(214 24% 89% / 0.08)',
    userBubbleBackground: 'hsl(221 15% 24%)',
    userBubbleForeground: '#eef3f8',
    assistantBubbleBackground: 'hsl(214 24% 89% / 0.08)',
    assistantBubbleForeground: '#dbe2eb',
    contextBackground: 'hsl(13 46% 32% / 0.24)',
    contextBorder: 'hsl(13 68% 64% / 0.26)',
    contextForeground: '#dbe2eb',
    composerBackground: 'hsl(223 15% 15% / 0.98)',
    composerBorder: 'hsl(222 13% 31% / 0.84)',
    sendBackground: 'hsl(13 43% 45%)',
    sendForeground: '#fff7f3',
    sendDisabledBackground: 'hsl(214 24% 89% / 0.12)',
    sendDisabledForeground: 'hsl(214 24% 89% / 0.42)',
  },
  agentPanel: {
    background: 'hsl(221 15% 19% / 0.9)',
    border: 'hsl(222 13% 31% / 0.78)',
    hoverBackground: 'hsl(221 15% 23%)',
  },
  overlay: {
    scrim: 'hsl(228 40% 3% / 0.5)',
    edgeBlurTop: 'linear-gradient(to bottom,hsl(228 19% 9% / 0.9),hsl(228 19% 9% / 0))',
    edgeBlurBottom: 'linear-gradient(to top,hsl(228 19% 9% / 0.9),hsl(228 19% 9% / 0))',
  },
};

export const duskIndigoTheme: AppTheme = {
  meta: {
    id: duskIndigoThemeId,
    name: '黛蓝',
    description: '冷调靛青夜色、月白正文和赤陶余烬强调的暗色阅读主题。',
    tone: 'dark',
    visible: true,
  },
  font: defaultTheme.font,
  palette: {
    background: '228 19% 9%',
    foreground: '214 24% 89%',
    card: '223 15% 15%',
    cardForeground: '214 24% 89%',
    popover: '223 15% 15%',
    popoverForeground: '214 24% 89%',
    primary: '10 78% 64%',
    primaryForeground: '225 20% 11%',
    secondary: '221 15% 19%',
    secondaryForeground: '214 24% 89%',
    muted: '221 15% 19%',
    mutedForeground: '216 13% 63%',
    accent: '8 38% 21%',
    accentForeground: '10 78% 64%',
    destructive: '6 74% 64%',
    destructiveForeground: '225 20% 11%',
    border: '222 13% 27%',
    input: '222 13% 27%',
    ring: '10 78% 64%',
  },
  effect: {
    radius: '0.75rem',
    resizeDuration: defaultTheme.effect.resizeDuration,
    resizeEase: defaultTheme.effect.resizeEase,
    shellBackground:
      'radial-gradient(circle at 16% 18%, hsl(10 78% 64% / 0.12), transparent 28%), linear-gradient(135deg, hsl(228 19% 9%), hsl(230 22% 7%))',
    shellPanelShadow: '0 32px 70px hsl(228 45% 2% / 0.68), 0 1px 0 hsl(220 40% 100% / 0.06) inset',
    subtlePanelShadow: '0 12px 30px hsl(228 40% 3% / 0.55)',
    cardShadow: '0 1px 0 hsl(220 40% 100% / 0.05) inset, 0 8px 18px hsl(228 40% 3% / 0.5)',
    overlayScrim: 'hsl(228 40% 3% / 0.5)',
    zIndex: appThemeZIndex,
  },
  action: {
    primary: {
      background: 'hsl(10 78% 64%)',
      foreground: 'hsl(225 20% 11%)',
      border: 'hsl(10 78% 64%)',
      hoverBackground: 'hsl(10 78% 69%)',
      activeBackground: 'hsl(10 70% 57%)',
      disabledBackground: 'hsl(222 13% 27%)',
      disabledForeground: 'hsl(219 11% 47%)',
    },
    secondary: {
      background: 'hsl(221 15% 19% / 0.86)',
      foreground: 'hsl(214 24% 89%)',
      border: 'hsl(222 13% 31% / 0.7)',
      hoverBackground: 'hsl(221 15% 23%)',
      activeBackground: 'hsl(221 15% 27%)',
      disabledBackground: 'hsl(221 15% 19% / 0.56)',
      disabledForeground: 'hsl(219 11% 47%)',
    },
    danger: {
      background: 'hsl(6 74% 64%)',
      foreground: 'hsl(225 20% 11%)',
      border: 'hsl(6 74% 64%)',
      hoverBackground: 'hsl(6 74% 69%)',
      activeBackground: 'hsl(6 66% 57%)',
      disabledBackground: 'hsl(6 24% 26%)',
      disabledForeground: 'hsl(219 11% 47%)',
    },
  },
  interactive: {
    link: 'hsl(10 78% 64%)',
    linkHover: 'hsl(10 78% 71%)',
    selectedBackground: 'hsl(8 38% 21%)',
    selectedForeground: 'hsl(10 78% 64%)',
    selectedBorder: 'hsl(10 78% 64% / 0.48)',
    currentBackground: 'hsl(221 15% 19% / 0.82)',
    hoverBackground: 'hsl(221 15% 19% / 0.72)',
    hoverBorder: 'hsl(10 78% 64% / 0.38)',
    focusRing: 'hsl(10 78% 64% / 0.4)',
    badgeBackground: 'hsl(8 38% 21%)',
    badgeForeground: 'hsl(10 78% 64%)',
    badgeBorder: 'hsl(10 78% 64% / 0.24)',
    successForeground: 'hsl(140 50% 72%)',
    successBackground: 'hsl(142 30% 19%)',
  },
  paperPattern: {
    kind: 'dash-grid',
    background: 'hsl(228 19% 9%)',
    color: 'hsl(214 24% 89%)',
    secondaryColor: 'hsl(10 78% 64%)',
    opacity: '0.032',
    size: '18px',
  },
  dataColor: {
    chart1: 'hsl(190 40% 56%)',
    chart2: 'hsl(10 58% 62%)',
    chart3: 'hsl(225 50% 66%)',
    userAnnotationDefault: '#f5aa5c',
    readerAgentFallback: '#dbe2eb',
  },
  reader: duskIndigoReaderTheme,
};

const inkPaperReaderTheme: ReaderTheme = {
  background: '#f5f4ed',
  paper: '#faf9f5',
  ink: '#141413',
  muted: '#6b6a64',
  line: '#d6d1c4',
  primary: '#1b365d',
  accent: '#d6e1ee',
  accentStrong: '#1b365d',
  danger: '#b53333',
  toolbar: {
    background: 'rgba(250,249,245,.9)',
    border: 'rgba(27,54,93,.12)',
    controlBackground: 'rgba(250,249,245,.84)',
    controlHoverBackground: '#e8e6dc',
    progressTrack: 'rgba(27,54,93,.12)',
    progressFill: '#1b365d',
  },
  toc: {
    background: 'rgba(232,230,220,.58)',
    itemHoverBackground: 'rgba(250,249,245,.82)',
  },
  note: {
    annotationAccent: 'var(--app-reader-accent-strong)',
    annotationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 24%,var(--app-reader-note-border))',
    annotationMat: 'color-mix(in srgb,var(--app-reader-accent) 20%,var(--app-reader-paper))',
    annotationSurface: 'var(--app-reader-paper)',
    background: 'rgba(250,249,245,.9)',
    border: 'rgba(27,54,93,.12)',
    distillationAccent: 'var(--app-reader-accent-strong)',
    distillationBorder:
      'color-mix(in srgb,var(--app-reader-accent-strong) 46%,var(--app-reader-note-border))',
    distillationMat: 'color-mix(in srgb,var(--app-reader-accent) 34%,var(--app-reader-note-bg))',
    distillationSurface: 'var(--app-reader-paper)',
    distillationTabForeground: '#faf9f5',
    shadow: '0 10px 28px rgba(20,20,19,.08)',
    quoteBackground: 'rgba(214,225,238,.34)',
    quoteText: '#1b365d',
  },
  selectionMenu: {
    background: 'rgba(20,20,19,.92)',
    foreground: '#faf9f5',
    border: 'rgba(27,54,93,.18)',
    shadow: '0 14px 36px rgba(20,20,19,.24)',
  },
  composer: {
    background: 'rgba(250,249,245,.98)',
    border: 'rgba(27,54,93,.16)',
    shadow: '0 24px 64px rgba(20,20,19,.16)',
  },
  chat: {
    panelBackground: 'rgba(250,249,245,.98)',
    panelBorder: 'rgba(27,54,93,.16)',
    panelShadow: '0 28px 88px rgba(20,20,19,.22),inset 0 1px 0 rgba(255,255,255,.64)',
    userBubbleBackground: '#141413',
    userBubbleForeground: '#faf9f5',
    assistantBubbleBackground: 'rgba(20,20,19,.06)',
    assistantBubbleForeground: '#141413',
    contextBackground: 'rgba(214,225,238,.34)',
    contextBorder: 'rgba(27,54,93,.16)',
    contextForeground: '#1b365d',
    composerBackground: 'color-mix(in srgb,#faf9f5 74%,rgba(250,249,245,.9))',
    composerBorder: 'rgba(27,54,93,.12)',
    sendBackground: '#1b365d',
    sendForeground: '#faf9f5',
    sendDisabledBackground: 'rgba(27,54,93,.14)',
    sendDisabledForeground: 'rgba(27,54,93,.46)',
  },
  agentPanel: {
    background: 'rgba(245,244,237,.94)',
    border: 'rgba(27,54,93,.14)',
    hoverBackground: '#e8e6dc',
  },
  overlay: {
    scrim: 'rgba(20,20,19,.16)',
    edgeBlurTop: 'linear-gradient(to bottom,rgba(245,244,237,.86),rgba(245,244,237,0))',
    edgeBlurBottom: 'linear-gradient(to top,rgba(245,244,237,.86),rgba(245,244,237,0))',
  },
};

export const inkPaperTheme: AppTheme = {
  meta: {
    id: inkPaperThemeId,
    name: '墨纸',
    description: '暖纸底、淡点阵和墨蓝强调的沉静阅读主题。',
    tone: 'light',
    visible: true,
  },
  font: defaultTheme.font,
  palette: {
    background: '48 29% 95%',
    foreground: '60 3% 8%',
    card: '48 33% 97%',
    cardForeground: '60 3% 8%',
    popover: '48 33% 97%',
    popoverForeground: '60 3% 8%',
    primary: '215 55% 24%',
    primaryForeground: '48 33% 97%',
    secondary: '48 17% 89%',
    secondaryForeground: '60 3% 8%',
    muted: '48 15% 87%',
    mutedForeground: '50 3% 41%',
    accent: '213 32% 88%',
    accentForeground: '215 55% 24%',
    destructive: '0 55% 45%',
    destructiveForeground: '48 33% 97%',
    border: '44 16% 80%',
    input: '44 16% 80%',
    ring: '215 55% 24%',
  },
  effect: {
    radius: '0.7rem',
    resizeDuration: defaultTheme.effect.resizeDuration,
    resizeEase: defaultTheme.effect.resizeEase,
    shellBackground:
      'radial-gradient(circle at 16% 18%, hsl(213 32% 88% / 0.36), transparent 28%), linear-gradient(135deg, hsl(48 29% 95%), hsl(44 23% 90%))',
    shellPanelShadow: '0 22px 70px hsl(60 3% 8% / 0.1)',
    subtlePanelShadow: '0 10px 30px hsl(60 3% 8% / 0.055)',
    cardShadow: '0 7px 18px hsl(60 3% 8% / 0.1)',
    overlayScrim: 'rgba(20,20,19,.16)',
    zIndex: appThemeZIndex,
  },
  action: {
    primary: {
      background: 'hsl(215 55% 24%)',
      foreground: 'hsl(48 33% 97%)',
      border: 'hsl(215 55% 24%)',
      hoverBackground: 'hsl(215 55% 20%)',
      activeBackground: 'hsl(215 55% 16%)',
      disabledBackground: 'hsl(48 14% 82%)',
      disabledForeground: 'hsl(50 3% 42%)',
    },
    secondary: {
      background: 'hsl(48 17% 89% / 0.88)',
      foreground: 'hsl(60 3% 8%)',
      border: 'hsl(44 16% 76%)',
      hoverBackground: 'hsl(48 17% 84%)',
      activeBackground: 'hsl(48 16% 79%)',
      disabledBackground: 'hsl(48 15% 87% / 0.7)',
      disabledForeground: 'hsl(50 3% 46%)',
    },
    danger: {
      background: 'hsl(0 55% 45%)',
      foreground: 'hsl(48 33% 97%)',
      border: 'hsl(0 55% 45%)',
      hoverBackground: 'hsl(0 55% 38%)',
      activeBackground: 'hsl(0 55% 32%)',
      disabledBackground: 'hsl(0 22% 82%)',
      disabledForeground: 'hsl(0 20% 44%)',
    },
  },
  interactive: {
    link: 'hsl(215 55% 24%)',
    linkHover: 'hsl(215 55% 18%)',
    selectedBackground: 'hsl(213 32% 88%)',
    selectedForeground: 'hsl(215 55% 24%)',
    selectedBorder: 'hsl(215 55% 24% / 0.52)',
    currentBackground: 'hsl(48 33% 97% / 0.82)',
    hoverBackground: 'hsl(48 17% 89% / 0.72)',
    hoverBorder: 'hsl(215 55% 24% / 0.4)',
    focusRing: 'hsl(215 55% 24% / 0.34)',
    badgeBackground: 'hsl(213 32% 88% / 0.72)',
    badgeForeground: 'hsl(215 55% 24%)',
    badgeBorder: 'hsl(215 55% 24% / 0.18)',
    successForeground: 'hsl(150 46% 30%)',
    successBackground: 'hsl(146 40% 90%)',
  },
  paperPattern: {
    kind: 'dot',
    background: 'hsl(48 29% 95%)',
    color: 'hsl(215 55% 24%)',
    opacity: '0.12',
    size: '14px',
  },
  dataColor: {
    chart1: 'hsl(215 32% 34%)',
    chart2: 'hsl(0 48% 44%)',
    chart3: 'hsl(92 18% 36%)',
    userAnnotationDefault: '#d6e1ee',
    readerAgentFallback: '#1b365d',
  },
  reader: inkPaperReaderTheme,
};

export const themeRegistry = {
  [defaultThemeId]: defaultTheme,
  [inkPaperThemeId]: inkPaperTheme,
  [inkBlackThemeId]: inkBlackTheme,
  [duskIndigoThemeId]: duskIndigoTheme,
  [beigePaperThemeId]: beigePaperTheme,
} as const satisfies Record<string, AppTheme>;

export type AppThemeId = keyof typeof themeRegistry;

export const visibleThemeIds = (Object.keys(themeRegistry) as AppThemeId[]).filter(
  (themeId) => themeRegistry[themeId].meta.visible,
);

export function defaultThemeIdForTone(tone: AppThemeTone): AppThemeId {
  return (
    visibleThemeIds.find((themeId) => themeRegistry[themeId].meta.tone === tone) || defaultThemeId
  );
}

export function resolveAppThemeIdForTone(value: unknown, tone: AppThemeTone): AppThemeId {
  const themeId = resolveAppThemeId(value);
  return themeRegistry[themeId].meta.tone === tone ? themeId : defaultThemeIdForTone(tone);
}

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
    '--app-paper-pattern-bg': theme.paperPattern.background,
    '--app-paper-pattern-color': theme.paperPattern.color,
    '--app-paper-pattern-secondary-color':
      theme.paperPattern.secondaryColor || theme.paperPattern.color,
    '--app-paper-pattern-opacity': theme.paperPattern.opacity,
    '--app-paper-pattern-size': theme.paperPattern.size,
    '--app-paper-pattern-image': paperPatternImage(theme.paperPattern),
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
  root.dataset.themeTone = theme.meta.tone;
  const variables = themeToCssVariables(theme);
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
}

export function resolveAppThemeId(value: unknown): AppThemeId {
  return typeof value === 'string' && value in themeRegistry
    ? (value as AppThemeId)
    : defaultThemeId;
}

export function readCachedThemeId(
  storage: Storage | undefined = browserLocalStorage(),
): AppThemeId {
  if (!storage) return defaultThemeId;

  try {
    return resolveAppThemeId(storage.getItem(cachedThemeStorageKey));
  } catch {
    return defaultThemeId;
  }
}

export function writeCachedThemeId(
  themeId: AppThemeId,
  storage: Storage | undefined = browserLocalStorage(),
) {
  if (!storage) return;

  try {
    storage.setItem(cachedThemeStorageKey, themeId);
    writeCachedThemeIdForTone(themeId, storage);
  } catch {
    // Theme cache is a startup optimization; settings remain the source of truth.
  }
}

export function readCachedThemeIdsByTone(
  storage: Storage | undefined = browserLocalStorage(),
): Record<AppThemeTone, AppThemeId> {
  if (!storage) return defaultThemeIdsByTone();

  try {
    return normalizeThemeIdsByTone(
      JSON.parse(storage.getItem(cachedThemeIdsByToneStorageKey) || '{}'),
    );
  } catch {
    return defaultThemeIdsByTone();
  }
}

export function readCachedThemeIdForTone(
  tone: AppThemeTone,
  storage: Storage | undefined = browserLocalStorage(),
): AppThemeId {
  return readCachedThemeIdsByTone(storage)[tone];
}

export function writeCachedThemeIdForTone(
  themeId: AppThemeId,
  storage: Storage | undefined = browserLocalStorage(),
) {
  if (!storage) return;

  try {
    const tone = themeRegistry[themeId].meta.tone;
    const nextThemeIds = { ...readCachedThemeIdsByTone(storage), [tone]: themeId };
    storage.setItem(cachedThemeIdsByToneStorageKey, JSON.stringify(nextThemeIds));
  } catch {
    // Theme cache is a startup optimization; settings remain the source of truth.
  }
}

function defaultThemeIdsByTone(): Record<AppThemeTone, AppThemeId> {
  return {
    light: defaultThemeIdForTone('light'),
    dark: defaultThemeIdForTone('dark'),
  };
}

function normalizeThemeIdsByTone(value: unknown): Record<AppThemeTone, AppThemeId> {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    light: resolveAppThemeIdForTone(input.light, 'light'),
    dark: resolveAppThemeIdForTone(input.dark, 'dark'),
  };
}

function paperPatternImage(pattern: PaperPatternTheme) {
  const color = colorWithOpacity(pattern.color, pattern.opacity);
  const secondaryColor = colorWithOpacity(pattern.secondaryColor || pattern.color, pattern.opacity);

  switch (pattern.kind) {
    case 'plain':
      return 'none';
    case 'dot':
      return `radial-gradient(circle, ${color} 0 1px, transparent 1.35px)`;
    case 'ruled':
      return `linear-gradient(180deg, transparent calc(100% - 1px), ${color} 100%)`;
    case 'dash-grid':
      return `repeating-linear-gradient(90deg, ${color} 0 1px, transparent 1px 6px, transparent 6px 18px), repeating-linear-gradient(180deg, ${secondaryColor} 0 1px, transparent 1px 6px, transparent 6px 18px)`;
    case 'grid':
      return `linear-gradient(90deg, ${color} 1px, transparent 1px), linear-gradient(180deg, ${secondaryColor} 1px, transparent 1px)`;
  }
}

function colorWithOpacity(color: string, opacity: string) {
  if (color.startsWith('hsl(')) {
    return color.replace(/\)$/, ` / ${opacity})`);
  }
  return color;
}

function browserLocalStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
