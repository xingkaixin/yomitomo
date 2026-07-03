export const foundationStyles = `.reader-app {
  --app-viewport-height:100vh;
  --reader-z-toolbar:var(--app-z-dropdown,140);
  --reader-z-popover:var(--app-z-popover,160);
  --reader-z-panel:var(--app-z-panel,190);
  --reader-z-modal:var(--app-z-modal,320);
  --reader-z-tooltip:var(--app-z-tooltip,340);
  --dropdown-open-dur:190ms;
  --dropdown-close-dur:120ms;
  --dropdown-pre-scale:.97;
  --dropdown-closing-scale:.99;
  --dropdown-ease:cubic-bezier(.22,1,.36,1);
  --reader-ink-weak:color-mix(in srgb,var(--reader-ink) 34%,transparent);
  --reader-ink-subtle:color-mix(in srgb,var(--reader-ink) 12%,transparent);
  --reader-ink-hairline:color-mix(in srgb,var(--reader-ink) 8%,transparent);
  --reader-paper-hover:color-mix(in srgb,var(--reader-ink) 6%,var(--reader-paper));
  --reader-paper-panel:color-mix(in srgb,var(--app-reader-note-bg) 74%,var(--reader-paper));
  --reader-focus-ring:var(--app-interactive-focus-ring,color-mix(in srgb,var(--reader-ink) 42%,transparent));
  --reader-code-bg:color-mix(in srgb,var(--reader-ink) 92%,var(--reader-paper));
  --reader-code-fg:var(--reader-paper);
  --reader-review-support-fg:var(--app-interactive-success-fg,#356f51);
  --reader-review-support-bg:var(--app-interactive-success-bg,color-mix(in srgb,var(--reader-review-support-fg) 12%,transparent));
  --reader-review-support-border:color-mix(in srgb,var(--reader-review-support-fg) 22%,transparent);
  --reader-review-challenge-fg:var(--reader-red,var(--app-reader-danger,#8a3f32));
  --reader-review-challenge-bg:color-mix(in srgb,var(--reader-review-challenge-fg) 11%,transparent);
  --reader-review-challenge-border:color-mix(in srgb,var(--reader-review-challenge-fg) 22%,transparent);
  --reader-review-supplement-fg:#3f6d8b;
  --reader-review-supplement-bg:color-mix(in srgb,var(--reader-review-supplement-fg) 11%,transparent);
  --reader-review-supplement-border:color-mix(in srgb,var(--reader-review-supplement-fg) 22%,transparent);
  --reader-focus-card-hover-bg:var(--reader-paper-hover);
  --reader-focus-card-icon-bg:var(--reader-ink-hairline);
  --reader-focus-card-icon-fg:var(--reader-muted);
  --reader-focus-card-active-icon-fg:var(--reader-paper);
  --reader-search-highlight:color-mix(in srgb,var(--reader-green) 20%,transparent);
  --reader-search-highlight-active:color-mix(in srgb,var(--reader-green) 34%,transparent);
  --reader-elevated-shadow:0 18px 48px color-mix(in srgb,var(--reader-ink) 16%,transparent);
  --reader-soft-shadow:0 8px 20px color-mix(in srgb,var(--reader-ink) 6%,transparent)
}
@supports (height:100dvh) {
  .reader-app {
    --app-viewport-height:100dvh
  }
}
.reader-app {
  --clear-dur:1000ms;
  --clear-out-dur:400ms;
  --clear-in-dur:400ms;
  --clear-out-fly:12px;
  --clear-in-fly:12px;
  --clear-out-ease:cubic-bezier(.22,1,.36,1);
  --clear-in-ease:cubic-bezier(.22,1,.36,1);
  --clear-blur:2px;
  --glow-delay:50ms;
  --glow-peak-at:.15;
  --glow-opacity:.42;
  --glow-spread:1.5
}
.reader-app.is-reader-background-dark {
  --glow-opacity:.85;
  --reader-focus-ring:color-mix(in srgb,var(--reader-paper) 18%,var(--reader-ink));
  --reader-code-bg:color-mix(in srgb,var(--reader-paper) 84%,var(--reader-ink));
  --reader-code-fg:var(--reader-ink);
  --reader-review-supplement-fg:#8fc4df;
  --reader-focus-card-hover-bg:color-mix(in srgb,var(--reader-ink) 8%,var(--reader-paper));
  --reader-focus-card-icon-bg:color-mix(in srgb,var(--reader-ink) 9%,var(--reader-paper));
  --reader-focus-card-active-icon-fg:var(--reader-paper)
}
.t-clear {
  position:relative;
  overflow:hidden
}
.t-clear-mirror,.t-clear-placeholder {
  position:absolute;
  inset:0;
  display:flex;
  align-items:center;
  pointer-events:none;
  white-space:nowrap;
  overflow:hidden;
  z-index:2
}
.t-clear-mirror {
  opacity:0
}
.t-clear.has-value .t-clear-mirror,.t-clear.is-clearing .t-clear-mirror {
  opacity:1
}
.t-clear.has-value>input,.t-clear.is-clearing>input {
  -webkit-text-fill-color:transparent
}
.t-clear.has-value .t-clear-placeholder {
  opacity:0
}
.t-clear-glow {
  position:absolute;
  inset:0;
  pointer-events:none;
  opacity:0;
  z-index:3;
  mix-blend-mode:multiply
}
.reader-app.is-reader-background-dark .t-clear-glow {
  mix-blend-mode:screen
}
.reader-kbd {
  display:inline-grid;
  min-width:18px;
  height:18px;
  place-items:center;
  font-family:var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  font-size:9px;
  font-weight:780;
  line-height:1;
  padding:0 5px
}
.reader-kbd-symbol {
  font-size:11px;
  padding:0
}
.reader-add-comment span,.reader-composer .floating-composer-actions button>span {
  font-size:10px;
  font-weight:730
}
.t-dropdown {
  transform-origin:var(--transform-origin,var(--popup-transform-origin,top left));
  transform:scale(var(--dropdown-pre-scale));
  opacity:0;
  pointer-events:none;
  transition:transform var(--dropdown-open-dur) var(--dropdown-ease),opacity var(--dropdown-open-dur) var(--dropdown-ease);
  will-change:transform,opacity
}
.t-dropdown[data-side="bottom"] {
  --popup-transform-origin:top center
}
.t-dropdown[data-side="bottom"][data-align="start"] {
  --popup-transform-origin:top left
}
.t-dropdown[data-side="bottom"][data-align="end"] {
  --popup-transform-origin:top right
}
.t-dropdown[data-side="top"] {
  --popup-transform-origin:bottom center
}
.t-dropdown[data-side="top"][data-align="start"] {
  --popup-transform-origin:bottom left
}
.t-dropdown[data-side="top"][data-align="end"] {
  --popup-transform-origin:bottom right
}
.t-dropdown[data-side="right"],.t-dropdown[data-side="inline-end"] {
  --popup-transform-origin:left center
}
.t-dropdown[data-side="right"][data-align="start"],.t-dropdown[data-side="inline-end"][data-align="start"] {
  --popup-transform-origin:left top
}
.t-dropdown[data-side="right"][data-align="end"],.t-dropdown[data-side="inline-end"][data-align="end"] {
  --popup-transform-origin:left bottom
}
.t-dropdown[data-side="left"],.t-dropdown[data-side="inline-start"] {
  --popup-transform-origin:right center
}
.t-dropdown[data-side="left"][data-align="start"],.t-dropdown[data-side="inline-start"][data-align="start"] {
  --popup-transform-origin:right top
}
.t-dropdown[data-side="left"][data-align="end"],.t-dropdown[data-side="inline-start"][data-align="end"] {
  --popup-transform-origin:right bottom
}
.t-dropdown[data-side="none"] {
  --popup-transform-origin:center
}
.t-dropdown[data-open],.t-dropdown.is-open {
  transform:scale(1);
  opacity:1;
  pointer-events:auto
}
.t-dropdown[data-starting-style] {
  transform:scale(var(--dropdown-pre-scale));
  opacity:0
}
.t-dropdown[data-closed],.t-dropdown[data-ending-style],.t-dropdown.is-closing {
  transform:scale(var(--dropdown-closing-scale));
  opacity:0;
  pointer-events:none;
  transition:transform var(--dropdown-close-dur) var(--dropdown-ease),opacity var(--dropdown-close-dur) var(--dropdown-ease)
}`;
