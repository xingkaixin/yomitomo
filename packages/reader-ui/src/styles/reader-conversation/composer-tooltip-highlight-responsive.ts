export const composerTooltipHighlightResponsiveStyles = `.reader-note-comments-panel .reader-comment-box textarea {
  min-height:68px;
  max-height:96px;
  margin-top:0
}
.reader-composer textarea:focus,.reader-composer textarea:focus-visible,.reader-note-comments-panel .reader-comment-box textarea:focus,.reader-note-comments-panel .reader-comment-box textarea:focus-visible {
  outline:0;
  box-shadow:none
}
.reader-note-footer .reader-shortcut-hint {
  flex:0 0 auto;
  margin-right:0
}
.reader-note-footer .reader-add-comment {
  display:inline-flex;
  flex:0 0 auto;
  align-items:center;
  justify-content:center;
  gap:4px;
  padding:7px 10px
}
.reader-composer {
  --transform-origin:24px 18px;
  position:absolute;
  z-index:var(--reader-z-popover);
  width:min(520px,calc(100vw - 24px));
  padding:0;
  overflow:visible;
  border-color:var(--app-reader-composer-border);
  border-radius:20px;
  background:var(--reader-paper);
  box-shadow:var(--app-reader-composer-shadow),0 0 0 1px color-mix(in srgb,var(--reader-paper) 58%,transparent) inset
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
.reader-composer-title-row .reader-shortcut-hint {
  margin-right:0
}
.reader-composer-types {
  display:grid;
  grid-template-columns:72px repeat(5,minmax(58px,1fr));
  align-items:center;
  gap:6px;
  margin:0
}
.reader-composer-group-label {
  color:var(--reader-muted);
  font-size:10px;
  font-weight:900;
  line-height:1;
  white-space:nowrap
}
.reader-composer-types button {
  height:28px;
  min-width:0;
  overflow:hidden;
  padding:0 6px;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-size:11px;
  transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease
}
.reader-reading-intent-icon {
  flex:0 0 auto
}
.reader-annotation-type-icon {
  flex:0 0 auto
}
.reader-composer-types button:active {
  transform:scale(.96)
}
.reader-composer-editor {
  position:relative;
  display:grid;
  grid-template-rows:minmax(0,auto) auto;
  gap:10px;
  min-width:0;
  border:0;
  border-radius:0;
  background:color-mix(in srgb,var(--reader-paper) 74%,var(--app-reader-note-bg));
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
  color:white
}
.reader-composer .floating-composer-submit:disabled {
  cursor:not-allowed;
  opacity:.55
}
.reader-composer .floating-composer-actions .reader-composer-cancel {
  background:color-mix(in srgb,var(--reader-ink) 8%,transparent);
  color:var(--reader-ink)
}
.reader-composer .floating-composer-actions .reader-composer-cancel:hover {
  background:color-mix(in srgb,var(--reader-ink) 12%,transparent)
}
.reader-composer .floating-composer-actions button:active {
  transform:scale(.96)
}
.reader-composer-agent-tray {
  display:flex;
  min-width:0;
  align-items:center;
  gap:6px;
  margin-right:auto;
  overflow:visible
}
.reader-composer-agent-tray>span {
  color:var(--reader-muted);
  font-size:16px;
  font-weight:900;
  line-height:1
}
.reader-composer-agent-tray .reader-agent-avatar-stack,.reader-composer-agent-tray .reader-agent-avatar-stack-item {
  overflow:visible
}
.reader-composer-actions .reader-composer-agent-tray .reader-agent-avatar-stack-item {
  width:28px;
  height:28px;
  border-color:var(--reader-paper);
  background:var(--reader-paper);
  color:inherit
}
.reader-composer-actions .reader-composer-agent-tray .reader-agent-avatar-stack-item:hover {
  background:var(--reader-paper)
}
.reader-composer-agent-tray .reader-avatar-badge {
  width:24px;
  height:24px
}
.reader-composer .reader-agent-menu,.reader-comment-box .reader-agent-menu {
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
  border:1px solid color-mix(in srgb,var(--reader-paper,var(--app-reader-paper,#fffaf0)) 16%,transparent);
  border-radius:8px;
  background:var(--reader-ink,var(--app-reader-ink,#251d16));
  box-shadow:0 12px 28px color-mix(in srgb,var(--reader-ink,var(--app-reader-ink,#251d16)) 20%,transparent);
  color:var(--reader-paper,var(--app-reader-paper,#fffaf0));
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
  border-color:color-mix(in srgb,var(--reader-paper,var(--app-reader-paper,#fffaf0)) 24%,transparent);
  border-bottom-color:color-mix(in srgb,var(--reader-paper,var(--app-reader-paper,#fffaf0)) 34%,transparent);
  background:color-mix(in srgb,var(--reader-paper,var(--app-reader-paper,#fffaf0)) 12%,transparent);
  box-shadow:none;
  color:var(--reader-paper,var(--app-reader-paper,#fffaf0))
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
@keyframes reader-review-scale {
  0%,100% {
    transform:rotate(0deg) scale(1)
  }
  45% {
    transform:rotate(-8deg) scale(1.08)
  }
  70% {
    transform:rotate(5deg) scale(.98)
  }
}
@keyframes reader-review-avatar-float {
  0%,100% {
    transform:translateY(0) scale(1)
  }
  50% {
    transform:translateY(-2px) scale(1.04)
  }
}
@keyframes reader-review-avatar-travel {
  0%,100% {
    transform:translateX(-3px) translateY(0) scale(1)
  }
  50% {
    transform:translateX(4px) translateY(-2px) scale(1.04)
  }
}
@keyframes reader-pending-agent-pulse {
  0%,100% {
    opacity:.52;
    box-shadow:0 0 0 0 color-mix(in srgb,var(--reader-avatar-color,var(--reader-green)) 28%,transparent)
  }
  50% {
    opacity:1;
    box-shadow:0 0 0 5px transparent
  }
}
@keyframes reader-pending-thought-progress {
  0% {
    transform:translateX(-105%)
  }
  100% {
    transform:translateX(245%)
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
.reader-highlight::before {
  content:"";
  position:absolute;
  z-index:1;
  left:min(var(--highlight-edge-size,0px),42%);
  right:min(var(--highlight-edge-size,0px),42%);
  bottom:var(--highlight-offset,-2px);
  height:var(--highlight-thickness,4px);
  border-radius:999px;
  background:var(--highlight-line,#f4c95d);
  opacity:var(--highlight-opacity,.78);
  -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 6' preserveAspectRatio='none'%3E%3Cpath d='M0 3 C4 0 8 6 12 3 S20 0 24 3' stroke='black' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 6' preserveAspectRatio='none'%3E%3Cpath d='M0 3 C4 0 8 6 12 3 S20 0 24 3' stroke='black' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  -webkit-mask-repeat:repeat-x;
  mask-repeat:repeat-x;
  -webkit-mask-size:24px 100%;
  mask-size:24px 100%;
  filter:drop-shadow(0 1px 0 var(--reader-paper))
}
.reader-highlight.is-new::before {
  transform-origin:left center;
  animation:reader-highlight-grow .42s cubic-bezier(.22,1,.36,1) both;
  animation-delay:var(--highlight-grow-delay,0ms)
}
.reader-highlight.is-active::before {
  opacity:1;
  filter:drop-shadow(0 1px 0 var(--reader-paper)) drop-shadow(0 0 5px rgba(37,29,22,.2))
}
.reader-highlight.is-filter-dimmed {
  cursor:default
}
.reader-highlight.is-filter-dimmed .reader-highlight-dots {
  opacity:.42
}
.reader-highlight.is-temporary,.reader-highlight.is-agent-theater {
  background:transparent;
  box-shadow:none
}
.reader-highlight.is-temporary {
  border-radius:3px;
  background:rgba(77,155,114,.18)
}
.reader-highlight.is-temporary::before,.reader-highlight.is-temporary .reader-highlight-dots {
  display:none
}
.reader-highlight.is-search {
  border-radius:3px;
  background:var(--reader-search-highlight);
  box-shadow:0 0 0 1px color-mix(in srgb,var(--reader-green) 30%,transparent),0 0 0 3px color-mix(in srgb,var(--reader-paper) 58%,transparent);
  mix-blend-mode:normal;
  pointer-events:none
}
.reader-highlight.is-search.is-active {
  background:var(--reader-search-highlight-active);
  box-shadow:0 0 0 1px color-mix(in srgb,var(--reader-green) 46%,transparent),0 0 0 3px color-mix(in srgb,var(--reader-green) 10%,transparent)
}
.reader-highlight.is-search::before {
  display:none
}
.reader-article ::selection,.reader-article::selection {
  background:rgba(77,155,114,.18)
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
  border:1px solid rgba(37,29,22,.14);
  border-radius:999px;
  box-shadow:0 1px 2px rgba(37,29,22,.14)
}
.reader-highlight:focus-visible {
  outline:0;
  box-shadow:none
}
.reader-highlight:focus-visible::before {
  opacity:1;
  filter:drop-shadow(0 1px 0 var(--reader-paper)) drop-shadow(0 0 6px var(--reader-focus-ring))
}
@keyframes reader-highlight-grow {
  from {
    opacity:.35;
    transform:scaleX(0)
  }
  to {
    opacity:var(--highlight-opacity,.78);
    transform:scaleX(1)
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
  .reader-virtual-cursor {
    transition:none!important
  }
  .reader-virtual-cursor.is-leaving {
    animation:none!important;
    opacity:0
  }
  .reader-completion-burst {
    display:none!important
  }
  .reader-agent-dock.is-completing,
  .reader-agent-dock-item.is-active,
  .reader-review-invite.is-reviewing svg,
  .reader-review-active-avatars>span,
  .reader-thought-review-motion>span,
  .reader-pending-agent-avatar::after,
  .reader-pending-thought-progress i,
  .reader-highlight.is-new::before,
  .reader-highlight.is-new .reader-highlight-dots {
    animation:none!important
  }
  .reader-agent-dock.is-completing {
    opacity:0;
    filter:none;
    transform:translateX(-50%)
  }
  .reader-agent-dock-item.is-active {
    transform:none
  }
  .reader-pending-agent-avatar::after {
    opacity:1;
    box-shadow:none
  }
  .reader-pending-thought-progress i {
    transform:none
  }
  .reader-spinner {
    animation:none!important;
    border-top-color:rgba(23,63,44,.22)
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
  transform:none
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
  .reader-app.is-annotation-stacked .reader-annotation-connection {
    display:none
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
  .reader-brand-mark {
    width:34px;
    height:34px;
    border-radius:9px;
    font-size:16px
  }
  .reader-brand-title {
    font-size:12px
  }
  .reader-brand-copy p {
    font-size:11px
  }
  .reader-toolbar-actions {
    gap:7px
  }
  .reader-agent-annotate {
    width:38px;
    padding:0;
    justify-content:center
  }
  .reader-agent-annotate {
    font-size:0
  }
  .reader-agent-annotate svg {
    width:18px;
    height:18px
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
  .reader-composer-types {
    grid-template-columns:1fr repeat(5,minmax(0,1fr))
  }
  .reader-composer-group-label {
    grid-column:1/-1
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
  transition:clip-path .28s cubic-bezier(.4,0,.2,1),transform .28s cubic-bezier(.4,0,.2,1),opacity .12s ease .16s,visibility .28s
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
  .reader-toolbar-article-action {
    display:none
  }
  .reader-toolbar-article-title {
    font-size:13px
  }
  .reader-toolbar-article-meta {
    font-size:11px
  }
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
