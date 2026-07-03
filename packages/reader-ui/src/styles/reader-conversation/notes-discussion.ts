export const notesDiscussionStyles = `.reader-notes-header {
  display:grid;
  gap:10px;
  margin:0 -16px 14px;
  padding:14px 16px;
  border-bottom:1px solid rgba(40,35,29,.08);
  background:var(--app-reader-toc-bg);
  box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 5%,transparent)
}
.reader-notes-title-row {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px
}
.reader-notes-title-row strong {
  font-size:22px;
  font-weight:900;
  letter-spacing:0
}
.reader-notes-title-row span {
  display:inline-flex;
  align-items:center;
  height:28px;
  border:1px solid var(--reader-ink-subtle);
  border-radius:999px;
  background:rgba(255,250,240,.76);
  color:var(--reader-muted);
  font-size:12px;
  font-weight:820;
  padding:0 10px
}
.reader-note-tabs [data-slot="tabs-list"] {
  display:grid;
  width:100%;
  height:38px;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:3px;
  padding:3px;
  border:1px solid rgba(37,29,22,.12);
  border-radius:999px;
  background:var(--app-reader-agent-panel-bg);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.72)
}
.reader-note-tabs [data-slot="tabs-trigger"] {
  height:30px;
  border:0;
  border-radius:999px;
  background:transparent;
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:12px;
  font-weight:850;
  letter-spacing:0;
  padding:0 8px
}
.reader-note-tabs [data-slot="tabs-trigger"][data-state="active"] {
  background:var(--reader-paper);
  color:var(--reader-ink);
  box-shadow:0 5px 14px rgba(40,35,29,.08)
}
.reader-note-tabs [data-slot="tabs-trigger"]:focus-visible {
  outline:2px solid var(--reader-focus-ring);
  outline-offset:2px
}
.reader-note {
  overflow:hidden;
  padding:0;
  --reader-note-accent:var(--app-reader-note-annotation-accent)
}
.reader-note:has(.reader-agent-menu),.reader-note:has(.reader-comment-agent-more-menu),.reader-note:has(.reader-action-menu-panel) {
  z-index:26;
  overflow:visible
}
.reader-note.has-review-menu {
  z-index:24;
  overflow:visible
}
.reader-note.has-review-burst {
  overflow:visible
}
.reader-note.has-discussion,.reader-note.has-distillation {
  position:relative;
  overflow:visible;
  padding:11px;
  border:1px solid var(--app-reader-note-annotation-border);
  border-radius:14px 0 14px 0;
  background:var(--app-reader-note-annotation-mat);
  box-shadow:var(--app-reader-note-shadow);
  --reader-note-accent:var(--app-reader-note-annotation-accent);
  --reader-note-border:var(--app-reader-note-annotation-border);
  --reader-note-surface:var(--app-reader-note-annotation-surface)
}
.reader-note.has-distillation {
  padding-bottom:0;
  border-color:var(--app-reader-note-distillation-border);
  background:var(--app-reader-note-distillation-mat);
  --reader-note-accent:var(--app-reader-note-distillation-accent);
  --reader-note-border:var(--app-reader-note-distillation-border);
  --reader-note-surface:var(--app-reader-note-distillation-surface)
}
.reader-annotation-rail>.reader-note.has-discussion,.reader-annotation-rail>.reader-note.has-distillation {
  position:absolute
}
.reader-note.has-discussion.is-active,.reader-note.has-distillation.is-active {
  border-color:var(--reader-note-accent);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--reader-note-accent) 18%,transparent),var(--app-reader-note-shadow)
}
.reader-note-tab {
  position:absolute;
  left:20px;
  top:-13px;
  z-index:3;
  display:inline-flex;
  height:26px;
  align-items:center;
  gap:6px;
  border-radius:7px 7px 0 0;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:10.5px;
  font-weight:850;
  letter-spacing:.1em;
  line-height:1;
  padding:0 13px;
  white-space:nowrap;
  text-transform:uppercase
}
.reader-note.has-discussion .reader-note-tab {
  border:1px solid var(--app-reader-note-annotation-border);
  border-bottom:0;
  background:var(--reader-note-surface);
  color:color-mix(in srgb,var(--reader-note-accent) 76%,var(--reader-ink))
}
.reader-note.has-discussion .reader-note-tab::after {
  content:"";
  position:absolute;
  left:11px;
  right:11px;
  bottom:-1px;
  height:2px;
  border-radius:999px;
  background:var(--reader-note-accent)
}
.reader-note.has-distillation .reader-note-tab {
  top:-14px;
  border:1px solid var(--reader-note-accent);
  background:var(--reader-note-accent);
  color:var(--app-reader-note-distillation-tab-fg)
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
.reader-note.has-discussion .reader-note-body,.reader-note.has-distillation .reader-note-body {
  position:relative;
  min-width:0;
  overflow:visible;
  border-radius:10px 0 10px 0;
  background:var(--reader-note-surface);
  box-shadow:0 2px 5px color-mix(in srgb,var(--reader-ink) 7%,transparent)
}
.reader-note.has-discussion .reader-note-body {
  padding:18px 19px 12px
}
.reader-note.has-distillation .reader-note-body {
  display:block;
  padding:22px 22px 18px
}
.reader-note-toolbar {
  position:relative;
  display:flex;
  align-items:stretch;
  margin:14px -16px 0;
  border-top:1px solid rgba(40,35,29,.12);
  background:var(--reader-paper-panel)
}
.reader-note.has-discussion .reader-note-toolbar {
  align-items:center;
  gap:8px;
  margin:8px 0 0;
  padding:0;
  border-top:0;
  background:transparent
}
.reader-note-thread-toggle {
  display:flex;
  width:100%;
  min-width:0;
  min-height:44px;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  border:0;
  background:transparent;
  color:var(--reader-muted);
  font:inherit;
  padding:0 14px 0 16px;
  text-align:left;
  transition:background .14s ease,color .14s ease
}
.reader-note-thread-toggle:hover {
  background:var(--app-reader-agent-panel-hover-bg);
  color:var(--reader-ink)
}
.reader-note-thread-toggle:active {
  background:color-mix(in srgb,var(--reader-note-accent) 14%,var(--reader-paper))
}
.reader-note-thread-toggle-main {
  display:inline-flex;
  min-width:0;
  align-items:center;
  gap:10px
}
.reader-note-thread-toggle-side {
  display:inline-flex;
  min-width:0;
  align-items:center;
  justify-content:flex-end;
  color:var(--reader-muted)
}
.reader-note-toolbar.has-review-action .reader-note-thread-toggle {
  width:auto;
  flex:1 1 auto
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
.reader-note-assistant-summary {
  display:block;
  min-width:0;
  overflow:hidden;
  color:var(--reader-muted);
  font-size:11px;
  font-weight:760;
  line-height:1.25;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-note-discussion-summary.is-busy .reader-note-assistant-summary {
  color:var(--reader-ink)
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
.reader-review-invite-wrap {
  position:relative;
  display:flex;
  flex:0 0 auto;
  align-items:stretch;
  border-left:1px solid var(--reader-ink-subtle)
}
.reader-review-invite {
  display:inline-flex;
  min-width:78px;
  align-items:center;
  justify-content:center;
  gap:5px;
  border:0;
  background:var(--reader-paper);
  color:var(--reader-muted);
  font:inherit;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:860;
  padding:0 11px;
  transition:background .14s ease,color .14s ease
}
.reader-review-invite:hover,.reader-review-invite.is-active {
  background:var(--reader-paper-hover);
  color:var(--reader-ink)
}
.reader-review-invite:disabled {
  cursor:not-allowed;
  opacity:.58
}
.reader-review-invite.is-reviewing svg {
  animation:reader-review-scale 1.05s ease-in-out infinite
}
.reader-review-active-avatars {
  display:inline-flex;
  align-items:center;
  margin-left:1px
}
.reader-review-active-avatars>span {
  display:grid;
  width:20px;
  height:20px;
  place-items:center;
  border-radius:999px;
  animation:reader-review-avatar-float .9s ease-in-out infinite
}
.reader-review-active-avatars .reader-avatar-badge {
  width:18px;
  height:18px;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-avatar-color,var(--reader-green));
  font-size:8px
}
.reader-review-active-avatars .reader-avatar-badge.is-image {
  background:transparent
}
.reader-review-menu {
  position:absolute;
  right:8px;
  bottom:calc(100% + 8px);
  z-index:30;
  display:grid;
  gap:4px;
  width:238px;
  padding:8px;
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:14px;
  background:var(--reader-paper);
  box-shadow:var(--reader-elevated-shadow);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  transform-origin:bottom right
}
.reader-review-menu>button {
  display:grid;
  width:100%;
  grid-template-columns:20px 30px minmax(0,1fr);
  align-items:center;
  gap:8px;
  border:0;
  border-radius:10px;
  background:transparent;
  color:var(--reader-ink);
  padding:8px;
  text-align:left
}
.reader-review-menu>button:hover,.reader-review-menu>button.is-selected {
  background:var(--app-reader-toolbar-control-hover-bg)
}
.reader-review-menu button:disabled {
  cursor:not-allowed;
  opacity:.54
}
.reader-review-menu-check {
  display:grid;
  width:18px;
  height:18px;
  place-items:center;
  border:1px solid rgba(40,35,29,.16);
  border-radius:999px;
  color:var(--reader-red)
}
.reader-review-menu .reader-avatar-badge {
  width:28px;
  height:28px;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-green);
  font-size:10px
}
.reader-review-menu>button>span:last-child {
  display:grid;
  min-width:0;
  gap:2px
}
.reader-review-menu strong {
  overflow:hidden;
  font-size:12px;
  font-weight:900;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-review-menu em {
  overflow:hidden;
  color:var(--reader-muted);
  font-size:11px;
  font-style:normal;
  font-weight:760;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-review-menu footer {
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:7px;
  margin:4px -2px -2px;
  padding:8px 2px 0;
  border-top:1px solid rgba(40,35,29,.1)
}
.reader-review-menu footer button {
  display:inline-flex;
  width:auto;
  height:30px;
  align-items:center;
  justify-content:center;
  border:0;
  border-radius:999px;
  background:#e7dac9;
  color:var(--reader-ink);
  font:inherit;
  font-size:11px;
  font-weight:860;
  padding:0 11px
}
.reader-review-menu footer button:last-child {
  background:var(--reader-ink);
  color:#fffaf0
}
.reader-review-menu footer button:disabled {
  cursor:not-allowed;
  opacity:.48
}
.reader-note-review-burst {
  position:absolute;
  inset:0;
  z-index:6;
  overflow:visible;
  pointer-events:none
}
.reader-note-review-burst .reader-completion-burst {
  position:absolute;
  inset:0;
  overflow:visible
}
.reader-note-review-burst .reader-completion-burst-center {
  left:50%;
  top:44%;
  transform:scale(.58)
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
  border:1px solid var(--app-reader-selection-menu-border,color-mix(in srgb,var(--app-reader-ink,#251d16) 12%,transparent));
  border-radius:10px;
  background:var(--reader-paper,var(--app-reader-paper,#fffaf0));
  box-shadow:var(--reader-soft-shadow,0 8px 20px color-mix(in srgb,var(--app-reader-ink,#251d16) 10%,transparent));
  color:var(--reader-ink,var(--app-reader-ink,#251d16));
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
  color:var(--reader-ink,var(--app-reader-ink,#251d16));
  font:inherit;
  font-size:12px;
  font-weight:760;
  padding:0 9px
}
.reader-action-menu-item:hover {
  background:var(--reader-paper-hover,color-mix(in srgb,var(--app-reader-ink,#251d16) 6%,var(--app-reader-paper,#fffaf0)))
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
  background:var(--reader-paper-hover,color-mix(in srgb,var(--app-reader-ink,#251d16) 6%,var(--app-reader-paper,#fffaf0)))
}
.reader-annotation-connection {
  position:fixed;
  inset:0;
  z-index:4;
  width:100vw;
  height:var(--app-viewport-height);
  overflow:visible;
  pointer-events:none
}
.reader-annotation-connection-line {
  fill:none;
  stroke-width:2.15;
  stroke-linecap:round;
  stroke-linejoin:round;
  filter:drop-shadow(0 4px 8px rgba(55,42,24,.18));
  opacity:.9
}
.reader-annotation-arrowhead {
  fill:none;
  stroke-width:2.15;
  stroke-linecap:round;
  stroke-linejoin:round;
  opacity:.94
}
.reader-note-anchor>span {
  padding:0;
  margin:0;
  background:transparent;
  border-radius:0
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
  align-items:center;
  gap:8px;
  margin-top:15px;
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
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
  font-weight:820;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-note-meta time {
  flex:0 0 auto;
  color:var(--reader-muted);
  font-size:11px;
  font-weight:760;
  font-variant-numeric:tabular-nums;
  white-space:nowrap
}
.reader-note-meta-copy time {
  margin-left:auto
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
.reader-note-type,.reader-note-intent {
  display:inline-flex;
  width:fit-content;
  align-items:center;
  gap:4px;
  border:1px solid rgba(159,91,80,.16);
  border-radius:999px;
  background:rgba(159,91,80,.07);
  color:var(--reader-red);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:850;
  line-height:1;
  padding:4px 7px;
  white-space:nowrap
}
.reader-note-intent {
  border-color:color-mix(in srgb,var(--reader-ink) 12%,transparent);
  background:color-mix(in srgb,var(--reader-ink) 6%,transparent);
  color:var(--reader-muted)
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
.reader-note-quote-mark {
  display:block;
  color:var(--reader-note-accent);
  font-family:var(--font-reader-serif, Georgia, Cambria, "Times New Roman", serif);
  font-size:28px;
  font-style:normal;
  font-weight:900;
  line-height:.78
}
.reader-note.has-discussion .reader-note-quote-mark {
  display:none
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
.reader-note.has-distillation .reader-note-quote {
  align-items:center;
  padding-right:22px
}
.reader-note.has-distillation .reader-note-quote-text {
  font-size:15px;
  font-weight:600;
  letter-spacing:0;
  line-height:1.75
}
.reader-note.has-discussion .reader-note-action-menu,.reader-note-distillation-menu {
  position:absolute;
  right:12px;
  top:12px;
  z-index:5
}
.reader-note.has-discussion .reader-action-menu-button,.reader-note-distillation-menu .reader-action-menu-button {
  width:32px;
  height:32px;
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
.reader-note.is-distillation-dual-morph {
  overflow:visible;
  padding:0;
  border:0;
  background:transparent;
  box-shadow:none;
  transition:height .55s cubic-bezier(.22,1,.36,1),opacity .18s ease,filter .2s ease,transform .22s cubic-bezier(.22,1,.36,1)
}
.reader-note-dual-morph-stage {
  position:relative;
  width:100%;
  transform-style:preserve-3d;
  transition:height .55s cubic-bezier(.22,1,.36,1)
}
.reader-note-dual-face {
  position:absolute;
  top:0;
  left:0;
  right:0;
  opacity:0;
  pointer-events:none;
  will-change:opacity,clip-path,transform;
  transition:opacity .3s ease
}
.reader-note-dual-face-annotation {
  z-index:1;
  padding:11px;
  border:1px solid var(--app-reader-note-annotation-border);
  border-radius:14px 0 14px 0;
  background:var(--app-reader-note-annotation-mat);
  box-shadow:var(--app-reader-note-shadow);
  --reader-note-accent:var(--app-reader-note-annotation-accent);
  --reader-note-border:var(--app-reader-note-annotation-border);
  --reader-note-surface:var(--app-reader-note-annotation-surface);
  transition:opacity .12s ease
}
.reader-note-dual-face-distillation {
  z-index:3;
  padding:11px 11px 0;
  border:1px solid var(--app-reader-note-distillation-border);
  border-radius:14px 0 14px 0;
  background:var(--app-reader-note-distillation-mat);
  box-shadow:var(--app-reader-note-shadow);
  clip-path:circle(0% at 13% 0%);
  --reader-note-accent:var(--app-reader-note-distillation-accent);
  --reader-note-border:var(--app-reader-note-distillation-border);
  --reader-note-surface:var(--app-reader-note-distillation-surface);
  transition:clip-path .62s cubic-bezier(.22,1,.36,1),opacity .62s step-end
}
.reader-note.is-dual-show-anno .reader-note-dual-face-annotation {
  opacity:1;
  pointer-events:auto
}
.reader-note.is-dual-show-dist .reader-note-dual-face-distillation {
  opacity:1;
  pointer-events:auto;
  clip-path:circle(160% at 13% 0%)
}
.reader-note.is-dual-stamp-in .reader-note-dual-face-distillation {
  animation:reader-distillation-stamp-in .62s cubic-bezier(.22,1,.36,1) both
}
.reader-note.is-dual-stamp-in .reader-note-dual-face-distillation::after {
  content:"";
  position:absolute;
  inset:0;
  z-index:6;
  border-radius:14px 0 14px 0;
  background:linear-gradient(105deg,transparent 42%,color-mix(in srgb,var(--reader-note-surface,var(--reader-paper)) 60%,transparent) 50%,transparent 58%);
  pointer-events:none;
  animation:reader-distillation-shimmer .6s cubic-bezier(.22,1,.36,1) .12s both
}
.reader-note-dual-face-annotation .reader-note-tab {
  border:1px solid var(--app-reader-note-annotation-border);
  border-bottom:0;
  background:var(--reader-note-surface);
  color:color-mix(in srgb,var(--reader-note-accent) 76%,var(--reader-ink))
}
.reader-note-dual-face-annotation .reader-note-tab::after {
  content:"";
  position:absolute;
  left:11px;
  right:11px;
  bottom:-1px;
  height:2px;
  border-radius:999px;
  background:var(--reader-note-accent)
}
.reader-note-dual-face-distillation .reader-note-tab {
  top:-14px;
  border:1px solid var(--reader-note-accent);
  background:var(--reader-note-accent);
  color:var(--app-reader-note-distillation-tab-fg)
}
.reader-note-dual-face-distillation .reader-note-tab svg {
  width:13px;
  height:13px
}
.reader-note-dual-face-annotation .reader-note-body,.reader-note-dual-face-distillation .reader-note-body {
  position:relative;
  min-width:0;
  overflow:visible;
  border-radius:10px 0 10px 0;
  background:var(--reader-note-surface);
  box-shadow:0 2px 5px color-mix(in srgb,var(--reader-ink) 7%,transparent)
}
.reader-note-dual-face-annotation .reader-note-body {
  padding:18px 19px 12px
}
.reader-note-dual-face-distillation .reader-note-body {
  display:block;
  padding:22px 22px 18px
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
.reader-note-dual-face-annotation .reader-note-quote,.reader-note-dual-face-distillation .reader-note-quote {
  padding-right:22px
}
.reader-note-dual-face-distillation .reader-note-quote {
  align-items:center
}
.reader-note-dual-face-distillation .reader-note-quote-text {
  font-size:15px;
  font-weight:600;
  letter-spacing:0;
  line-height:1.75
}
.reader-note-dual-face-annotation .reader-note-action-menu,.reader-note-dual-face-distillation .reader-note-distillation-menu {
  position:absolute;
  right:12px;
  top:12px;
  z-index:5
}
.reader-note-dual-face-annotation .reader-action-menu-button,.reader-note-dual-face-distillation .reader-action-menu-button {
  width:32px;
  height:32px;
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
.reader-note.is-distillation-update .reader-note-quote-text {
  animation:reader-distillation-fade .82s cubic-bezier(.22,1,.36,1)
}
.reader-note.is-distillation-update::after {
  content:"";
  position:absolute;
  inset:0;
  z-index:6;
  border-radius:14px 0 14px 0;
  background:linear-gradient(105deg,transparent 42%,color-mix(in srgb,var(--reader-note-surface,var(--reader-paper)) 60%,transparent) 50%,transparent 58%);
  pointer-events:none;
  animation:reader-distillation-shimmer 800ms cubic-bezier(.22,1,.36,1) both
}
@keyframes reader-distillation-stamp-in {
  0% {
    transform:scale(1.45) rotate(-7deg);
    opacity:0
  }
  55% {
    transform:scale(.93) rotate(1.5deg);
    opacity:1
  }
  75% {
    transform:scale(1.03) rotate(-.6deg)
  }
  100% {
    transform:scale(1) rotate(0);
    opacity:1
  }
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
  .reader-note-dual-morph-stage,
  .reader-note-dual-face,
  .reader-note.is-dual-stamp-in .reader-note-dual-face-distillation,
  .reader-note.is-dual-stamp-in .reader-note-dual-face-distillation::after,
  .reader-note.is-distillation-update .reader-note-body,
  .reader-note.is-distillation-update .reader-note-quote-text,
  .reader-note.is-distillation-update::after {
    animation:none;
    clip-path:none;
    filter:none;
    transition:none;
    will-change:auto
  }
}`;
