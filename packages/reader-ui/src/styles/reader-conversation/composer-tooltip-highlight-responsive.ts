export const composerTooltipHighlightResponsiveStyles = `.reader-composer textarea:focus,
.reader-composer textarea:focus-visible {
  outline:0;
  box-shadow:none
}
.reader-composer {
  --transform-origin:24px 18px;
  position:absolute;
  width:min(520px,calc(100vw - 24px));
  padding:0;
  overflow:visible;
  border-color:var(--app-reader-composer-border);
  border-radius:20px;
  background:var(--reader-paper);
  box-shadow:var(--app-reader-composer-shadow),0 0 0 1px var(--app-reader-paper-a56) inset
}
.reader-composer[data-placement="above"] {
  --transform-origin:24px calc(100% - 18px)
}
.reader-composer-header {
  display:grid;
  gap:8px;
  padding:12px 14px 10px;
  border-bottom:1px solid var(--app-reader-composer-border);
  border-radius:19px 19px 0 0;
  background:var(--reader-paper);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-composer-title-row {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px
}
.reader-composer-title-row strong {
  font-size:14px;
  font-weight:900;
  letter-spacing:0
}
.reader-composer-editor {
  position:relative;
  display:grid;
  grid-template-rows:minmax(0,auto) auto;
  gap:10px;
  min-width:0;
  border:0;
  border-radius:0;
  background:var(--reader-paper);
  box-shadow:none;
  padding:14px 15px 12px
}
.reader-composer textarea {
  display:block;
  min-height:88px;
  max-height:calc(1.55em * 8 + 28px);
  margin:0;
  border:0;
  border-radius:0;
  background:transparent;
  font-size:14px;
  line-height:1.55;
  padding:0;
  resize:none
}
.reader-composer .floating-composer-bar {
  display:flex;
  min-width:0;
  align-items:flex-end;
  justify-content:space-between;
  gap:12px
}
.reader-composer .floating-composer-actions {
  display:inline-flex;
  flex:0 0 auto;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  margin-left:auto
}
.reader-composer .floating-composer-actions button {
  display:inline-flex;
  height:32px;
  align-items:center;
  justify-content:center;
  gap:4px;
  border:0;
  border-radius:999px;
  padding:0 10px;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:12px;
  font-weight:760;
  transition:background .14s ease,color .14s ease,transform .14s ease
}
.reader-composer .floating-composer-submit {
  background:var(--reader-green);
  color:var(--reader-paper)
}
.reader-composer .floating-composer-submit:disabled {
  cursor:not-allowed;
  opacity:.55
}
.reader-composer .floating-composer-actions .reader-composer-cancel {
  background:var(--app-reader-ink-a8);
  color:var(--reader-ink)
}
.reader-composer .floating-composer-actions .reader-composer-cancel:hover {
  background:var(--app-reader-ink-a12)
}
.reader-composer .floating-composer-actions button:active {
  transform:scale(.96)
}
.reader-composer .reader-agent-menu {
  right:auto;
  bottom:calc(100% + 8px);
  width:190px;
  max-width:min(190px,calc(100% - 16px));
  border-color:var(--app-reader-composer-border);
  background:var(--reader-paper);
  box-shadow:var(--app-reader-composer-shadow)
}
.reader-selection-menu,.reader-composer {
  z-index:var(--reader-z-popover)
}
.reader-tooltip-content {
  z-index:var(--reader-z-tooltip,var(--app-z-tooltip,340));
  max-width:min(260px,calc(100vw - 24px));
  border:1px solid var(--app-reader-paper-a16);
  border-radius:8px;
  background:var(--app-reader-ink);
  box-shadow:0 12px 28px var(--app-reader-ink-a20);
  color:var(--app-reader-paper);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:760;
  line-height:1.35;
  padding:7px 9px;
  will-change:transform,opacity
}
.reader-tooltip-content[data-state="delayed-open"] {
  animation:reader-tooltip-in .12s ease-out
}
.reader-tooltip-content .reader-kbd {
  border-color:var(--app-reader-paper-a24);
  border-bottom-color:var(--app-reader-paper-a32);
  background:var(--app-reader-paper-a12);
  box-shadow:none;
  color:var(--app-reader-paper)
}
.reader-shortcut-tooltip {
  display:inline-flex;
  align-items:center;
  gap:7px;
  white-space:nowrap
}
.reader-shortcut-tooltip-keys {
  display:inline-flex;
  align-items:center;
  gap:3px
}
@keyframes reader-tooltip-in {
  from {
    opacity:0;
    transform:translateY(2px) scale(.98)
  }
  to {
    opacity:1;
    transform:translateY(0) scale(1)
  }
}
@keyframes reader-pending-agent-pulse {
  0%,100% {
    opacity:.52;
    box-shadow:0 0 0 0 var(--app-reader-primary-a24)
  }
  50% {
    opacity:1;
    box-shadow:0 0 0 5px transparent
  }
}
.reader-app :where(button,textarea,input,[tabindex]):focus-visible {
  outline:2px solid var(--reader-focus-ring);
  outline-offset:3px
}
.reader-app :where(.reader-composer textarea,.reader-note-comments-panel .reader-comment-box textarea):focus-visible {
  outline:0;
  box-shadow:none
}
.reader-highlight {
  overflow:visible;
  background:transparent;
  box-shadow:none;
  mix-blend-mode:normal;
  pointer-events:none;
  user-select:none;
  -webkit-user-select:none
}
.reader-highlight.is-active {
  background:transparent;
  box-shadow:none
}
.reader-highlight-layer {
  mix-blend-mode:multiply
}
.reader-app.is-reader-background-dark .reader-highlight-layer {
  mix-blend-mode:screen
}
.reader-footnote-layer {
  position:absolute;
  inset:0;
  z-index:4;
  pointer-events:none;
  user-select:none;
  -webkit-user-select:none
}
.reader-footnote {
  position:absolute;
  display:inline-flex;
  height:16px;
  margin-left:2px;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-paper);
  box-shadow:inset 0 0 0 1px var(--app-interactive-selected-border);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  pointer-events:auto;
  translate:0 -11px
}
.reader-footnote-mark {
  display:inline-grid;
  min-width:16px;
  height:16px;
  place-items:center;
  border:0;
  border-radius:0;
  background:transparent;
  color:var(--app-interactive-link);
  cursor:pointer;
  font-size:10px;
  font-variant-numeric:tabular-nums;
  font-weight:600;
  line-height:1;
  padding:0 4px
}
.reader-footnote-mark+.reader-footnote-mark {
  box-shadow:inset 1px 0 0 var(--app-interactive-selected-border)
}
.reader-footnote-mark[aria-current="true"] {
  background:var(--app-interactive-selected-bg)
}
.reader-footnote-mark.is-distilled {
  background:var(--app-interactive-link);
  color:var(--app-ink-fg)
}
.reader-footnote-mark:focus-visible {
  outline:2px solid var(--app-interactive-focus-ring);
  outline-offset:-2px
}
/* An uneven 120px stroke repeated along the line reads as drawn by hand rather than as a wave. */
.reader-highlight::after {
  content:"";
  position:absolute;
  z-index:1;
  left:min(var(--highlight-edge-size,0px),42%);
  right:min(var(--highlight-edge-size,0px),42%);
  bottom:calc(var(--highlight-offset,-2px) - var(--highlight-thickness,3px) / 2);
  height:calc(var(--highlight-thickness,3px) * 2);
  border-radius:999px;
  background:var(--highlight-line);
  opacity:var(--highlight-opacity,.62);
  -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 8' preserveAspectRatio='none'%3E%3Cpath d='M0 4.4C10 3.6 22 3.4 34 4.1S58 5.3 72 4.6 100 3.3 120 4.4' stroke='black' stroke-width='3.4' fill='none'/%3E%3C/svg%3E");
  mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 8' preserveAspectRatio='none'%3E%3Cpath d='M0 4.4C10 3.6 22 3.4 34 4.1S58 5.3 72 4.6 100 3.3 120 4.4' stroke='black' stroke-width='3.4' fill='none'/%3E%3C/svg%3E");
  -webkit-mask-repeat:repeat-x;
  mask-repeat:repeat-x;
  -webkit-mask-size:120px 100%;
  mask-size:120px 100%;
  transform-origin:left center;
  transition:opacity .16s ease,height .16s ease
}
.reader-highlight.is-new::after {
  animation:reader-highlight-grow .42s cubic-bezier(.22,1,.36,1) both;
  animation-delay:var(--highlight-grow-delay,0ms)
}
.reader-highlight.is-filter-dimmed {
  cursor:default
}
.reader-highlight.is-filter-dimmed .reader-highlight-dots {
  opacity:.42
}
.reader-highlight.is-temporary {
  box-shadow:none
}
.reader-highlight.is-temporary {
  border-radius:3px;
  background:var(--app-reader-selection)
}
.reader-highlight.is-temporary::after,.reader-highlight.is-temporary .reader-highlight-dots {
  display:none
}
.reader-highlight.is-search {
  border-radius:3px;
  background:var(--reader-search-highlight);
  box-shadow:0 0 0 1px var(--app-reader-primary-a32),0 0 0 3px var(--app-reader-paper-a56);
  mix-blend-mode:normal;
  pointer-events:none
}
.reader-highlight.is-search.is-active {
  background:var(--reader-search-highlight-active);
  box-shadow:0 0 0 1px var(--app-reader-primary-a48),0 0 0 3px var(--app-reader-primary-a8)
}
.reader-highlight.is-search::before,.reader-highlight.is-search::after {
  display:none
}
.reader-article ::selection,.reader-article::selection {
  background:var(--app-reader-selection)
}
.reader-highlight-dots {
  position:absolute;
  z-index:2;
  bottom:var(--highlight-dot-offset,-3px);
  display:flex;
  gap:2px;
  align-items:center;
  pointer-events:none
}
.reader-highlight.is-new .reader-highlight-dots {
  animation:reader-highlight-dots-in .18s ease-out both;
  animation-delay:calc(var(--highlight-grow-delay,0ms) + .24s)
}
.reader-highlight-dots.is-start {
  left:0
}
.reader-highlight-dots.is-end {
  right:0
}
.reader-highlight-dots i {
  display:block;
  width:5px;
  height:5px;
  border:1px solid var(--app-reader-ink-a12);
  border-radius:999px;
  box-shadow:0 1px 2px var(--app-shadow-a12)
}
.reader-highlight:focus-visible {
  outline:0;
  box-shadow:none
}
.reader-highlight:focus-visible::before {
  opacity:1
}
@keyframes reader-highlight-grow {
  from {
    transform:scaleX(0)
  }
}
@keyframes reader-highlight-dots-in {
  from {
    opacity:0;
    transform:scale(.65)
  }
  to {
    opacity:1;
    transform:scale(1)
  }
}
@media(prefers-reduced-motion:reduce) {
  .t-dropdown,.t-dropdown[data-closed],.t-dropdown[data-ending-style] {
    transform:none!important;
    transition:none!important
  }
  .reader-app * {
    animation-duration:.01ms!important;
    animation-iteration-count:1!important;
    scroll-behavior:auto!important;
    transition-duration:.01ms!important
  }
  .reader-tooltip-content {
    animation:none!important
  }
  .reader-pending-agent-avatar::after,
.reader-highlight.is-new::after,
.reader-highlight.is-new .reader-highlight-dots {
    animation:none!important
  }
  .reader-pending-agent-avatar::after {
    opacity:1;
    box-shadow:none
  }
}
@media(max-width:1320px) {
  .reader-main {
    grid-template-columns:minmax(0,1fr)
  }
  .reader-toc-toggle {
    display:grid
  }
}
.reader-app.is-annotation-right .reader-article {
  width:min(var(--reader-layout-article-width,var(--reader-content-width)),var(--reader-content-width),100%);
  margin:0
}
.reader-app.is-annotation-stacked .reader-annotation-rail {
  position:relative;
  inset:auto;
  width:min(var(--reader-content-width),100%);
  display:grid;
  gap:14px;
  margin:16px auto 0;
  pointer-events:auto
}
.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-empty,.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-note {
  position:relative;
  top:auto!important;
  left:auto!important;
  width:100%;
  pointer-events:auto;
  transform:none
}
.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-note {
  clip-path:none;
  transform:none
}
.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-note .reader-note-tab {
  translate:none
}
@media(max-width:940px) {
  .reader-surface {
    padding:32px 28px 64px
  }
  .reader-article {
    max-width:100%;
    font-size:min(var(--reader-font-size),22px)
  }
  .reader-app.is-annotation-stacked .reader-annotation-rail {
    width:100%;
    margin-top:16px
  }
  .reader-note-comments-panel .reader-comments {
    margin:0;
    padding:2px 0
  }
}
@media(max-width:760px) {
  .reader-toolbar {
    grid-template-columns:auto minmax(0,1fr) auto;
    gap:8px;
    min-height:72px;
    padding:12px 14px 15px
  }
  .reader-back {
    max-width:40px;
    padding:0 8px
  }
  .reader-back span {
    display:none
  }
  .reader-toolbar>.reader-toolbar-article {
    justify-content:start;
    text-align:left
  }
  .reader-toolbar-article-visual {
    display:none
  }
  .reader-toolbar-article-copy,.reader-toolbar-article.has-cover .reader-toolbar-article-copy {
    justify-items:start;
    text-align:left
  }
  .reader-toolbar-article-meta {
    justify-content:flex-start
  }
  .reader-floating-toolbar {
    top:78px;
    max-width:calc(100vw - 18px)
  }
  .reader-floating-slider {
    max-width:112px
  }
  .reader-toolbar-actions {
    gap:7px
  }
  .reader-surface {
    padding:20px 14px 46px
  }
  .reader-article {
    border-radius:18px;
    padding:28px 20px;
    font-size:min(var(--reader-font-size),20px);
    line-height:1.72
  }
  .reader-article-header h1 {
    font-size:28px
  }
  .reader-composer {
    left:8px!important;
    width:calc(100vw - 16px)
  }
  .reader-app.is-toc-open .reader-toc {
    top:72px
  }
  .reader-responsive-scrim {
    inset:72px 0 0
  }
}
.reader-app.has-toc .reader-main,.reader-app.has-toc.is-toc-open .reader-main {
  grid-template-columns:minmax(0,1fr)
}
.reader-toc.is-empty {
  display:none
}
.reader-app.has-toc .reader-toc {
  position:absolute;
  display:block;
  left:18px;
  top:84px;
  bottom:18px;
  z-index:var(--reader-z-panel);
  width:min(320px,calc(100% - 36px));
  overflow:auto;
  padding:18px;
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:8px;
  background:var(--app-reader-toc-bg);
  box-shadow:var(--reader-elevated-shadow);
  opacity:0;
  visibility:hidden;
  pointer-events:none;
  clip-path:inset(0 100% 0 0 round 8px);
  transform:translateX(-1px);
  transform-origin:left center;
  transition:clip-path .28s cubic-bezier(.22,1,.36,1),transform .28s cubic-bezier(.22,1,.36,1),opacity 0s .28s,visibility 0s .28s
}
.reader-app.has-toc.is-toc-open .reader-toc {
  opacity:1;
  visibility:visible;
  pointer-events:auto;
  clip-path:inset(0 0 0 0 round 8px);
  transform:translateX(0);
  transition:clip-path .32s cubic-bezier(.22,1,.36,1),transform .32s cubic-bezier(.22,1,.36,1),opacity .1s ease,visibility 0s
}
.reader-toc-toggle:disabled {
  cursor:not-allowed;
  opacity:.42
}
@media(max-width:760px) {
  .reader-app.has-toc.is-toc-open .reader-toc {
    left:0;
    top:72px;
    bottom:0;
    width:min(320px,calc(100% - 32px));
    border-radius:0;
    clip-path:inset(0 0 0 0 round 0)
  }
  .reader-app.has-toc.is-toc-open .reader-responsive-scrim {
    display:block
  }
}`;
