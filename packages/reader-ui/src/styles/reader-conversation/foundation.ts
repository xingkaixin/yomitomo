export const foundationStyles = `.reader-app {
  --app-viewport-height:100vh;
  --dropdown-open-dur:190ms;
  --dropdown-close-dur:120ms;
  --dropdown-pre-scale:.97;
  --dropdown-closing-scale:.99;
  --dropdown-ease:cubic-bezier(.22,1,.36,1);
  --reader-focus-ring:var(--app-reader-focus-ring);
  --reader-code-bg:var(--app-reader-code-bg);
  --reader-code-fg:var(--app-reader-code-fg);
  --reader-search-highlight:var(--app-reader-primary-a20);
  --reader-search-highlight-active:var(--app-reader-primary-a32)}
@supports (height:100dvh) {
  .reader-app {
    --app-viewport-height:100dvh
  }
}
.reader-app {
  --clear-out-ease:cubic-bezier(.22,1,.36,1);
  --clear-in-ease:cubic-bezier(.22,1,.36,1)}
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
.reader-composer .floating-composer-actions button>span {
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
