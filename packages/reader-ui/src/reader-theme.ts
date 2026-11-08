export type CssVariableMap = Record<`--${string}`, string>;

export type ReaderTheme = {
  background: string;
  paper: string;
  ink: string;
  muted: string;
  line: string;
  primary: string;
  accent: string;
  accentStrong: string;
  danger: string;
  paperEdge: string;
  paperShadow: string;
  paperHover: string;
  codeBackground: string;
  codeForeground: string;
  focusRing: string;
  selection: string;
  ribbon: string;
  toolbar: {
    background: string;
    border: string;
    controlBackground: string;
    controlHoverBackground: string;
    progressTrack: string;
    progressFill: string;
  };
  toc: {
    background: string;
    itemHoverBackground: string;
    itemActiveBackground: string;
  };
  note: {
    annotationAccent: string;
    annotationBorder: string;
    annotationMat: string;
    annotationSurface: string;
    background: string;
    border: string;
    distillationAccent: string;
    distillationBorder: string;
    distillationSurface: string;
    shadow: string;
    quoteBackground: string;
    quoteText: string;
  };
  selectionMenu: {
    foreground: string;
    border: string;
    shadow: string;
  };
  composer: {
    background: string;
    border: string;
    shadow: string;
  };
  chat: {
    panelBackground: string;
    panelBorder: string;
    panelShadow: string;
    userBubbleBackground: string;
    userBubbleForeground: string;
    assistantBubbleBackground: string;
    assistantBubbleForeground: string;
    contextBackground: string;
    contextBorder: string;
    contextForeground: string;
    composerBackground: string;
    composerBorder: string;
    sendBackground: string;
    sendForeground: string;
    sendDisabledBackground: string;
    sendDisabledForeground: string;
  };
  agentPanel: {
    border: string;
    hoverBackground: string;
  };
  overlay: {
    scrim: string;
    edgeBlurTop: string;
    edgeBlurBottom: string;
  };
};

export function readerThemeToCssVariables(theme: ReaderTheme): CssVariableMap {
  return {
    ...alphaVariables('--app-reader-ink', theme.ink, [4, 6, 8, 12, 16, 20, 24, 32, 40, 48]),
    ...alphaVariables('--app-reader-paper', theme.paper, [12, 16, 24, 32, 48, 56, 72, 88, 94]),
    ...alphaVariables('--app-reader-primary', theme.primary, [8, 16, 20, 24, 32, 48]),
    ...alphaVariables('--app-reader-danger', theme.danger, [6, 12, 24]),
    ...alphaVariables('--app-reader-muted', theme.muted, [12, 48, 88]),
    ...alphaVariables('--app-reader-accent', theme.accent, [16, 20, 24]),
    ...alphaVariables('--app-reader-accent-strong', theme.accentStrong, [8, 12, 32, 72]),
    '--app-reader-bg': theme.background,
    '--app-reader-paper': theme.paper,
    '--app-reader-ink': theme.ink,
    '--app-reader-muted': theme.muted,
    '--app-reader-line': theme.line,
    '--app-reader-primary': theme.primary,
    '--app-reader-accent': theme.accent,
    '--app-reader-accent-strong': theme.accentStrong,
    '--app-reader-danger': theme.danger,
    '--app-reader-paper-edge': theme.paperEdge,
    '--app-reader-paper-shadow': theme.paperShadow,
    '--app-reader-paper-hover': theme.paperHover,
    '--app-reader-code-bg': theme.codeBackground,
    '--app-reader-code-fg': theme.codeForeground,
    '--app-reader-focus-ring': theme.focusRing,
    '--app-reader-selection': theme.selection,
    '--app-reader-ribbon': theme.ribbon,
    '--app-reader-toolbar-bg': theme.toolbar.background,
    '--app-reader-toolbar-border': theme.toolbar.border,
    '--app-reader-toolbar-control-bg': theme.toolbar.controlBackground,
    '--app-reader-toolbar-control-hover-bg': theme.toolbar.controlHoverBackground,
    '--app-reader-toolbar-progress-track': theme.toolbar.progressTrack,
    '--app-reader-toolbar-progress-fill': theme.toolbar.progressFill,
    '--app-reader-toc-bg': theme.toc.background,
    '--app-reader-toc-item-hover-bg': theme.toc.itemHoverBackground,
    '--app-reader-toc-item-active-bg': theme.toc.itemActiveBackground,
    '--app-reader-note-bg': theme.note.background,
    '--app-reader-note-border': theme.note.border,
    '--app-reader-note-annotation-accent': theme.note.annotationAccent,
    '--app-reader-note-annotation-border': theme.note.annotationBorder,
    '--app-reader-note-annotation-mat': theme.note.annotationMat,
    '--app-reader-note-annotation-surface': theme.note.annotationSurface,
    '--app-reader-note-distillation-accent': theme.note.distillationAccent,
    '--app-reader-note-distillation-border': theme.note.distillationBorder,
    '--app-reader-note-distillation-surface': theme.note.distillationSurface,
    '--app-reader-note-shadow': theme.note.shadow,
    '--app-reader-note-quote-bg': theme.note.quoteBackground,
    '--app-reader-note-quote-text': theme.note.quoteText,
    '--app-reader-selection-menu-fg': theme.selectionMenu.foreground,
    '--app-reader-selection-menu-border': theme.selectionMenu.border,
    '--app-reader-selection-menu-shadow': theme.selectionMenu.shadow,
    '--app-reader-composer-bg': theme.composer.background,
    '--app-reader-composer-border': theme.composer.border,
    '--app-reader-composer-shadow': theme.composer.shadow,
    '--app-reader-chat-panel-bg': theme.chat.panelBackground,
    '--app-reader-chat-panel-border': theme.chat.panelBorder,
    '--app-reader-chat-panel-shadow': theme.chat.panelShadow,
    '--app-reader-chat-user-bubble-bg': theme.chat.userBubbleBackground,
    '--app-reader-chat-user-bubble-fg': theme.chat.userBubbleForeground,
    '--app-reader-chat-assistant-bubble-bg': theme.chat.assistantBubbleBackground,
    '--app-reader-chat-assistant-bubble-fg': theme.chat.assistantBubbleForeground,
    '--app-reader-chat-context-bg': theme.chat.contextBackground,
    '--app-reader-chat-context-border': theme.chat.contextBorder,
    '--app-reader-chat-context-fg': theme.chat.contextForeground,
    '--app-reader-chat-composer-bg': theme.chat.composerBackground,
    '--app-reader-chat-composer-border': theme.chat.composerBorder,
    '--app-reader-chat-send-bg': theme.chat.sendBackground,
    '--app-reader-chat-send-fg': theme.chat.sendForeground,
    '--app-reader-chat-send-disabled-bg': theme.chat.sendDisabledBackground,
    '--app-reader-chat-send-disabled-fg': theme.chat.sendDisabledForeground,
    '--app-reader-agent-panel-border': theme.agentPanel.border,
    '--app-reader-agent-panel-hover-bg': theme.agentPanel.hoverBackground,
    '--app-reader-scrim': theme.overlay.scrim,
    '--app-reader-edge-blur-top': theme.overlay.edgeBlurTop,
    '--app-reader-edge-blur-bottom': theme.overlay.edgeBlurBottom,
  };
}

type Rgba = readonly [number, number, number, number];

/** Emits `${name}-a${step}` for each step, the base color at step% opacity. */
export function alphaVariables(
  name: `--${string}`,
  color: string,
  steps: readonly number[],
): CssVariableMap {
  return Object.fromEntries(
    steps.map((step) => [`${name}-a${step}`, withAlpha(color, step / 100)]),
  );
}

export function withAlpha(color: string, alpha: number): string {
  const [r, g, b, a] = parseColor(color);
  return formatColor([r, g, b, a * alpha]);
}

/** Same result as CSS `color-mix(in srgb, color weight, base)`, resolved to a literal. */
export function mixColors(color: string, weight: number, base: string): string {
  const top = parseColor(color);
  const bottom = parseColor(base);
  const alpha = top[3] * weight + bottom[3] * (1 - weight);
  if (alpha === 0) return formatColor([0, 0, 0, 0]);
  const channel = (index: 0 | 1 | 2) =>
    (top[index] * top[3] * weight + bottom[index] * bottom[3] * (1 - weight)) / alpha;
  return formatColor([channel(0), channel(1), channel(2), alpha]);
}

function parseColor(value: string): Rgba {
  const color = value.trim();
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length <= 4 ? hex.replace(/./g, '$&$&') : hex;
    const channels = full.match(/../g)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
    const [r = 0, g = 0, b = 0, a = 255] = channels;
    return [r, g, b, a / 255];
  }
  const fn = color.match(/^(rgba?|hsla?)\((.*)\)$/);
  const parts = (fn ? fn[2] : color).split(/[\s,/]+/).filter(Boolean);
  const alpha = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]);
  if (fn?.[1].startsWith('rgb')) {
    const [r = 0, g = 0, b = 0] = parts.map(Number.parseFloat);
    return [r, g, b, alpha];
  }
  const [h = 0, s = 0, l = 0] = parts.map(Number.parseFloat);
  return [...hslToRgb(h, s / 100, l / 100), alpha];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function formatColor([r, g, b, a]: Rgba): string {
  const [red, green, blue] = [r, g, b].map((channel) => Math.round(channel));
  if (a >= 1)
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  return `rgba(${red}, ${green}, ${blue}, ${Number(a.toFixed(3))})`;
}
