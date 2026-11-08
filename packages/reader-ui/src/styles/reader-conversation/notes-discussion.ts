export const notesDiscussionStyles = `.reader-note {
  overflow:hidden;
  padding:0;
  --reader-note-accent:var(--app-reader-note-annotation-accent)
}
.reader-note:has(.reader-agent-menu),.reader-note:has(.reader-comment-agent-more-menu),.reader-note:has(.reader-action-menu-panel) {
  z-index:26;
  overflow:visible
}
.reader-note.has-discussion,.reader-note.has-distillation {
  position:relative;
  overflow:visible;
  padding:0;
  border:1px solid var(--app-edge);
  border-radius:12px;
  background:var(--app-card-surface);
  box-shadow:var(--app-card-shadow);
  --reader-note-accent:var(--app-reader-note-annotation-accent);
  --reader-note-border:var(--app-reader-note-annotation-border);
  --reader-note-surface:var(--app-reader-note-annotation-surface)
}
.reader-note.has-distillation {
  border-color:var(--app-distill-edge);
  background:var(--app-distill);
  --reader-note-accent:var(--app-reader-note-distillation-accent);
  --reader-note-border:var(--app-reader-note-distillation-border);
  --reader-note-surface:var(--app-reader-note-distillation-surface)
}
.reader-annotation-rail>.reader-note.has-discussion,.reader-annotation-rail>.reader-note.has-distillation {
  position:absolute
}
.reader-note.has-discussion.is-active,.reader-note.has-distillation.is-active {
  border-color:var(--app-interactive-selected-border);
  box-shadow:var(--app-card-shadow),0 0 0 3px var(--app-interactive-selected-bg)
}
.reader-note-tab {
  position:absolute;
  left:14px;
  top:-21px;
  z-index:3;
  display:inline-flex;
  min-width:32px;
  height:22px;
  align-items:center;
  justify-content:center;
  gap:4px;
  border-radius:7px 7px 0 0;
  font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif);
  font-size:13px;
  font-weight:600;
  font-variant-numeric:tabular-nums;
  line-height:1;
  padding:0 8px;
  white-space:nowrap
}
.reader-note.has-discussion .reader-note-tab {
  border:1px solid var(--app-edge);
  border-bottom:0;
  background:var(--app-card-surface);
  color:var(--app-interactive-link)
}
.reader-note.has-distillation .reader-note-tab {
  border:1px solid var(--app-interactive-link);
  border-bottom:0;
  background:var(--app-interactive-link);
  color:var(--app-ink-fg)
}
.reader-note.has-distillation .reader-note-tab svg {
  width:13px;
  height:13px
}
.reader-note-body {
  position:relative;
  min-width:0;
  padding:16px 16px 0;
  background:var(--reader-paper)
}
/* A literal radius instead of inherit: inherit keeps Chromium from reusing matched styles and doubled style recalc for long annotation lists. */
.reader-note.has-discussion .reader-note-body,.reader-note.has-distillation .reader-note-body {
  position:relative;
  min-width:0;
  overflow:visible;
  border-radius:11px;
  background:transparent;
  box-shadow:none
}
.reader-note.has-discussion .reader-note-body {
  padding:14px 14px 12px
}
.reader-note.has-distillation .reader-note-body {
  display:block;
  padding:14px 14px 12px
}
.reader-note-toolbar {
  position:relative;
  display:flex;
  align-items:stretch;
  margin:14px -16px 0;
  border-top:1px solid var(--app-reader-ink-a12);
  background:var(--app-reader-paper)
}
.reader-note.has-discussion .reader-note-toolbar {
  align-items:center;
  gap:8px;
  margin:8px 0 0;
  padding:0;
  border-top:0;
  background:transparent
}
.reader-note-thread-toggle-main {
  display:inline-flex;
  min-width:0;
  align-items:center;
  gap:10px
}
.reader-note-summary-toolbar {
  min-width:0
}
.reader-note-discussion-summary {
  display:grid;
  flex:1 1 auto;
  min-width:0;
  min-height:32px;
  align-content:center;
  gap:3px;
  padding:0;
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-note-discussion-summary .reader-note-thread-toggle-main {
  gap:9px
}
.reader-note-discussion-entry {
  position:relative;
  display:inline-flex;
  flex:0 0 auto;
  min-width:86px;
  min-height:30px;
  align-items:center;
  justify-content:center;
  gap:5px;
  margin:0 -2px 0 auto;
  border:0;
  border-radius:8px;
  background:transparent;
  color:var(--reader-green);
  font:inherit;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11.5px;
  font-weight:820;
  padding:0 2px 0 8px;
  transition:background-color .14s ease,color .14s ease,transform .14s ease
}
.reader-note-discussion-entry::after {
  content:"";
  position:absolute;
  inset:-5px 0
}
.reader-note-discussion-entry:hover {
  background:var(--reader-paper-hover);
  color:var(--reader-ink)
}
.reader-note-discussion-entry:active {
  transform:scale(.96)
}
.reader-note-discussion-entry[aria-disabled="true"] {
  cursor:default;
  opacity:.72
}
.reader-note-discussion-entry[aria-disabled="true"]:hover {
  background:transparent;
  color:var(--reader-muted)
}
.reader-note-toolbar .reader-delete-note {
  height:26px;
  margin-right:0;
  padding:0 8px;
  font-size:11px
}
.reader-action-menu {
  position:relative;
  display:flex;
  align-items:center;
  justify-content:flex-end;
  overflow:visible
}
.reader-action-menu-button {
  display:grid;
  width:32px;
  height:32px;
  place-items:center;
  border:0;
  border-radius:999px;
  background:transparent;
  color:var(--reader-muted);
  padding:0;
  transition:background .14s ease,color .14s ease,transform .14s ease
}
.reader-action-menu-button:hover,.reader-action-menu.is-open .reader-action-menu-button {
  background:var(--reader-paper-hover);
  color:var(--reader-ink)
}
.reader-action-menu-button:active {
  transform:scale(.96)
}
.reader-action-menu-button:focus-visible {
  outline:2px solid var(--reader-focus-ring);
  outline-offset:2px
}
.reader-action-menu-panel {
  display:grid;
  min-width:132px;
  padding:4px;
  border:1px solid var(--app-reader-selection-menu-border,var(--app-reader-ink-a12));
  border-radius:10px;
  background:var(--app-reader-paper);
  box-shadow:var(--reader-soft-shadow,0 8px 20px var(--app-reader-ink-a8));
  color:var(--app-reader-ink);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  transform-origin:top right
}
.reader-action-menu-item {
  display:inline-flex;
  width:100%;
  height:32px;
  align-items:center;
  justify-content:flex-start;
  gap:7px;
  border:0;
  border-radius:7px;
  background:transparent;
  color:var(--app-reader-ink);
  font:inherit;
  font-size:12px;
  font-weight:760;
  padding:0 9px
}
.reader-action-menu-item:hover {
  background:var(--app-reader-paper-hover)
}
.reader-action-delete {
  width:100%;
  height:32px;
  justify-content:flex-start;
  border-radius:7px;
  background:transparent;
  box-shadow:none;
  font-size:12px;
  padding:0 9px
}
.reader-action-delete:hover {
  background:var(--app-reader-paper-hover)
}
.reader-note-card-header {
  position:relative;
  display:block;
  min-width:0
}
.reader-note-card-header .reader-note-quote {
  margin-top:0
}
.reader-note-owner {
  display:grid;
  width:23px;
  height:23px;
  place-items:center;
  flex:0 0 auto;
  border:0;
  border-radius:999px;
  background:transparent;
  color:inherit;
  padding:0
}
.reader-note-owner .reader-avatar-badge {
  width:23px;
  height:23px;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-avatar-color,var(--reader-green));
  font-size:10px
}
.reader-note-owner .reader-avatar-badge.is-image {
  background:transparent
}
.reader-note-meta {
  display:flex;
  min-width:0;
  min-height:20px;
  align-items:center;
  gap:8px;
  padding-right:28px;
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-note-num {
  flex:0 0 auto;
  color:var(--app-interactive-link);
  font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif);
  font-size:16px;
  font-weight:600;
  font-variant-numeric:tabular-nums;
  line-height:20px
}
.reader-note.is-stacked .reader-note-num,.reader-note:not(.is-stacked) .reader-note-tab {
  display:none
}
.reader-note-distillation-tag {
  display:inline-flex;
  height:20px;
  align-items:center;
  gap:4px;
  border-radius:6px;
  background:var(--app-interactive-link);
  color:var(--app-ink-fg);
  font-size:11px;
  font-weight:500;
  line-height:16px;
  padding:0 7px;
  white-space:nowrap
}
.reader-note-text {
  display:-webkit-box;
  margin:8px 0 0;
  overflow:hidden;
  overflow-wrap:anywhere;
  color:var(--reader-ink);
  font-size:15px;
  line-height:26px;
  text-wrap:pretty;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:6
}
.reader-note.has-distillation .reader-note-text,.reader-note-dual-face-distillation .reader-note-text {
  font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif)
}
.reader-note.has-discussion .reader-note-meta {
  padding-left:0
}
.reader-note-meta-copy {
  display:flex;
  flex:1 1 auto;
  min-width:0;
  align-items:baseline;
  gap:7px
}
.reader-note-meta strong {
  overflow:hidden;
  color:var(--reader-ink);
  font-size:12px;
  font-weight:500;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-note-meta time {
  flex:0 0 auto;
  color:var(--reader-muted);
  font-size:12px;
  font-weight:400;
  font-variant-numeric:tabular-nums;
  white-space:nowrap
}
.reader-comment-count {
  display:inline-flex;
  align-items:center;
  gap:6px;
  min-width:0;
  color:inherit;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:12px;
  font-weight:820;
  font-variant-numeric:tabular-nums;
  white-space:nowrap
}
.reader-comment-count svg {
  color:var(--reader-note-accent)
}
.reader-note-quote {
  position:relative;
  z-index:1;
  display:grid;
  width:100%;
  min-width:0;
  gap:5px;
  padding:0;
  border:0;
  background:transparent;
  color:var(--reader-ink);
  font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif);
  text-align:left;
  text-decoration:none
}
.reader-note.has-discussion .reader-note-quote {
  padding-right:22px
}
.reader-note-quote-text {
  display:block;
  min-width:0;
  max-width:100%;
  overflow-wrap:anywhere;
  color:var(--reader-ink);
  font-size:14.5px;
  font-style:normal;
  font-weight:600;
  line-height:1.72;
  text-wrap:pretty;
  word-break:break-word
}
.reader-note.has-discussion .reader-note-action-menu,.reader-note-distillation-menu {
  position:absolute;
  right:12px;
  top:12px;
  z-index:5
}
.reader-note.has-discussion .reader-action-menu-button,.reader-note-distillation-menu .reader-action-menu-button {
  width:24px;
  height:24px;
  background:transparent;
  color:var(--reader-muted)
}
.reader-note.has-discussion .reader-action-menu-button:hover,
.reader-note.has-discussion .reader-action-menu.is-open .reader-action-menu-button,
.reader-note-distillation-menu .reader-action-menu-button:hover,
.reader-note-distillation-menu.is-open .reader-action-menu-button {
  background:var(--reader-paper-hover);
  color:var(--reader-ink)
}
.reader-note.is-distillation-dual-morph,.reader-note.is-distillation-dual-morph.is-active {
  overflow:visible;
  border-color:transparent;
  background:transparent;
  box-shadow:none
}
.reader-annotation-rail>.reader-note.is-distillation-dual-morph {
  z-index:91!important;
  transition:none
}
.reader-note-dual-morph-stage {
  position:relative;
  margin:-12px;
  perspective:1500px;
  perspective-origin:50% 110px
}
.reader-note.has-distillation>.reader-note-dual-morph-stage {
  margin-bottom:-1px
}
.reader-note-dual-flipper {
  position:absolute;
  inset:0;
  transform-style:preserve-3d;
  transition:transform .42s cubic-bezier(.77,0,.175,1)
}
.reader-note.is-dual-show-dist .reader-note-dual-flipper {
  transform:rotateY(180deg)
}
.reader-note-dual-face {
  position:absolute;
  top:0;
  left:0;
  right:0;
  pointer-events:none;
  backface-visibility:hidden
}
.reader-note-dual-face-annotation {
  padding:0;
  border:1px solid var(--app-edge);
  border-radius:12px;
  background:var(--app-card-surface);
  box-shadow:var(--app-card-shadow);
  --reader-note-accent:var(--app-reader-note-annotation-accent);
  --reader-note-border:var(--app-reader-note-annotation-border);
  --reader-note-surface:var(--app-reader-note-annotation-surface)
}
.reader-note-dual-face-distillation {
  padding:0;
  border:1px solid var(--app-distill-edge);
  border-radius:12px;
  background:var(--app-distill);
  box-shadow:var(--app-card-shadow);
  transform:rotateY(180deg);
  --reader-note-accent:var(--app-reader-note-distillation-accent);
  --reader-note-border:var(--app-reader-note-distillation-border);
  --reader-note-surface:var(--app-reader-note-distillation-surface)
}
.reader-note.is-active .reader-note-dual-face {
  border-color:var(--app-interactive-selected-border);
  box-shadow:var(--app-card-shadow),0 0 0 3px var(--app-interactive-selected-bg)
}
.reader-note.is-dual-show-anno .reader-note-dual-face-annotation,.reader-note.is-dual-show-dist .reader-note-dual-face-distillation {
  pointer-events:auto
}
.reader-note-dual-face-annotation .reader-note-tab {
  border:1px solid var(--app-edge);
  border-bottom:0;
  background:var(--app-card-surface);
  color:var(--app-interactive-link)
}
.reader-note-dual-face-distillation .reader-note-tab {
  border:1px solid var(--app-interactive-link);
  border-bottom:0;
  background:var(--app-interactive-link);
  color:var(--app-ink-fg)
}
.reader-note-dual-face-distillation .reader-note-tab svg {
  width:13px;
  height:13px
}
.reader-note-dual-face-annotation .reader-note-body,.reader-note-dual-face-distillation .reader-note-body {
  position:relative;
  min-width:0;
  overflow:visible;
  border-radius:11px;
  background:transparent;
  box-shadow:none
}
.reader-note-dual-face-annotation .reader-note-body {
  padding:14px 14px 12px
}
.reader-note-dual-face-distillation .reader-note-body {
  display:block;
  padding:14px 14px 12px
}
.reader-note-dual-face-annotation .reader-note-toolbar {
  align-items:center;
  gap:8px;
  margin:8px 0 0;
  padding:0;
  border-top:0;
  background:transparent
}
.reader-note-dual-face-annotation .reader-note-meta {
  padding-left:0
}
.reader-note-dual-face-annotation .reader-note-action-menu,.reader-note-dual-face-distillation .reader-note-distillation-menu {
  position:absolute;
  right:12px;
  top:12px;
  z-index:5
}
.reader-note-dual-face-annotation .reader-action-menu-button,.reader-note-dual-face-distillation .reader-action-menu-button {
  width:24px;
  height:24px;
  background:transparent;
  color:var(--reader-muted)
}
.reader-note-dual-face-annotation .reader-action-menu-button:hover,
.reader-note-dual-face-annotation .reader-action-menu.is-open .reader-action-menu-button,
.reader-note-dual-face-distillation .reader-action-menu-button:hover,
.reader-note-dual-face-distillation .reader-action-menu.is-open .reader-action-menu-button {
  background:var(--reader-paper-hover);
  color:var(--reader-ink)
}
.reader-note.is-distillation-update .reader-note-body {
  transform-origin:center center;
  will-change:transform;
  animation:reader-distillation-update-breathe 400ms cubic-bezier(.22,1,.36,1) both
}
.reader-note.is-distillation-update .reader-note-text {
  animation:reader-distillation-fade .82s cubic-bezier(.22,1,.36,1)
}
.reader-note.is-distillation-update::after {
  content:"";
  position:absolute;
  inset:0;
  z-index:6;
  border-radius:14px 0 14px 0;
  background:linear-gradient(105deg,transparent 42%,var(--app-reader-paper-a56) 50%,transparent 58%);
  pointer-events:none;
  animation:reader-distillation-shimmer 800ms cubic-bezier(.22,1,.36,1) both
}
@keyframes reader-distillation-update-breathe {
  0% {
    transform:scale(1)
  }
  50% {
    transform:scale(1.01)
  }
  100% {
    transform:scale(1)
  }
}
@keyframes reader-distillation-fade {
  0% {
    opacity:.16;
    transform:translateY(7px);
    filter:blur(3px)
  }
  42% {
    opacity:.5;
    filter:blur(1.6px)
  }
  100% {
    opacity:1;
    transform:translateY(0);
    filter:blur(0)
  }
}
@keyframes reader-distillation-shimmer {
  0% {
    opacity:0;
    transform:translateX(-66%)
  }
  12% {
    opacity:1
  }
  100% {
    opacity:0;
    transform:translateX(66%)
  }
}
@media (prefers-reduced-motion: reduce) {
  .reader-note.is-distillation-update .reader-note-body,
  .reader-note.is-distillation-update .reader-note-text,
  .reader-note.is-distillation-update::after {
    animation:none;
    filter:none;
    transition:none;
    will-change:auto
  }
  .reader-note .reader-note-dual-flipper,.reader-note.is-dual-show-dist .reader-note-dual-flipper {
    transform:none;
    transition:none
  }
  .reader-note-dual-face {
    opacity:0;
    backface-visibility:visible;
    transform:none
  }
  .reader-note.is-dual-show-anno .reader-note-dual-face-annotation,.reader-note.is-dual-show-dist .reader-note-dual-face-distillation {
    opacity:1
  }
}`;
