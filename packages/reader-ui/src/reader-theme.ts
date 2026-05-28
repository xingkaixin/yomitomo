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
  toolbar: {
    background: string;
    border: string;
    controlBackground: string;
    controlHoverBackground: string;
  };
  toc: {
    background: string;
    itemHoverBackground: string;
  };
  note: {
    background: string;
    border: string;
    shadow: string;
    quoteBackground: string;
    quoteText: string;
  };
  selectionMenu: {
    background: string;
    foreground: string;
    border: string;
    shadow: string;
  };
  composer: {
    background: string;
    border: string;
    shadow: string;
  };
  agentPanel: {
    background: string;
    border: string;
    hoverBackground: string;
  };
  overlay: {
    scrim: string;
    edgeBlurTop: string;
    edgeBlurBottom: string;
  };
};

export const readerThemeVariableNames = [
  '--app-reader-bg',
  '--app-reader-paper',
  '--app-reader-ink',
  '--app-reader-muted',
  '--app-reader-line',
  '--app-reader-primary',
  '--app-reader-accent',
  '--app-reader-accent-strong',
  '--app-reader-danger',
  '--app-reader-toolbar-bg',
  '--app-reader-toolbar-border',
  '--app-reader-toolbar-control-bg',
  '--app-reader-toolbar-control-hover-bg',
  '--app-reader-toc-bg',
  '--app-reader-toc-item-hover-bg',
  '--app-reader-note-bg',
  '--app-reader-note-border',
  '--app-reader-note-shadow',
  '--app-reader-note-quote-bg',
  '--app-reader-note-quote-text',
  '--app-reader-selection-menu-bg',
  '--app-reader-selection-menu-fg',
  '--app-reader-selection-menu-border',
  '--app-reader-selection-menu-shadow',
  '--app-reader-composer-bg',
  '--app-reader-composer-border',
  '--app-reader-composer-shadow',
  '--app-reader-agent-panel-bg',
  '--app-reader-agent-panel-border',
  '--app-reader-agent-panel-hover-bg',
  '--app-reader-scrim',
  '--app-reader-edge-blur-top',
  '--app-reader-edge-blur-bottom',
] as const;

export function readerThemeToCssVariables(theme: ReaderTheme): CssVariableMap {
  return {
    '--app-reader-bg': theme.background,
    '--app-reader-paper': theme.paper,
    '--app-reader-ink': theme.ink,
    '--app-reader-muted': theme.muted,
    '--app-reader-line': theme.line,
    '--app-reader-primary': theme.primary,
    '--app-reader-accent': theme.accent,
    '--app-reader-accent-strong': theme.accentStrong,
    '--app-reader-danger': theme.danger,
    '--app-reader-toolbar-bg': theme.toolbar.background,
    '--app-reader-toolbar-border': theme.toolbar.border,
    '--app-reader-toolbar-control-bg': theme.toolbar.controlBackground,
    '--app-reader-toolbar-control-hover-bg': theme.toolbar.controlHoverBackground,
    '--app-reader-toc-bg': theme.toc.background,
    '--app-reader-toc-item-hover-bg': theme.toc.itemHoverBackground,
    '--app-reader-note-bg': theme.note.background,
    '--app-reader-note-border': theme.note.border,
    '--app-reader-note-shadow': theme.note.shadow,
    '--app-reader-note-quote-bg': theme.note.quoteBackground,
    '--app-reader-note-quote-text': theme.note.quoteText,
    '--app-reader-selection-menu-bg': theme.selectionMenu.background,
    '--app-reader-selection-menu-fg': theme.selectionMenu.foreground,
    '--app-reader-selection-menu-border': theme.selectionMenu.border,
    '--app-reader-selection-menu-shadow': theme.selectionMenu.shadow,
    '--app-reader-composer-bg': theme.composer.background,
    '--app-reader-composer-border': theme.composer.border,
    '--app-reader-composer-shadow': theme.composer.shadow,
    '--app-reader-agent-panel-bg': theme.agentPanel.background,
    '--app-reader-agent-panel-border': theme.agentPanel.border,
    '--app-reader-agent-panel-hover-bg': theme.agentPanel.hoverBackground,
    '--app-reader-scrim': theme.overlay.scrim,
    '--app-reader-edge-blur-top': theme.overlay.edgeBlurTop,
    '--app-reader-edge-blur-bottom': theme.overlay.edgeBlurBottom,
  };
}
