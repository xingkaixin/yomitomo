export const thoughtsCommentsStyles = `.reader-thought-author-stack {
  display:inline-flex;
  min-width:0;
  align-items:center
}
.reader-thought-author-avatar {
  display:grid;
  width:25px;
  height:25px;
  place-items:center;
  border-radius:999px;
  background:transparent
}
.reader-thought-author-avatar+.reader-thought-author-avatar {
  margin-left:-8px
}
.reader-thought-author-avatar .reader-avatar-badge {
  width:23px;
  height:23px;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-avatar-color,var(--reader-green));
  font-size:10px
}
.reader-thought-author-avatar .reader-avatar-badge.is-image {
  background:transparent
}
.reader-thought-author-more {
  display:grid;
  min-width:25px;
  height:25px;
  place-items:center;
  margin-left:-8px;
  border:2px solid var(--reader-paper);
  border-radius:999px;
  background:var(--app-reader-agent-panel-hover-bg);
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:10px;
  font-weight:900;
  font-variant-numeric:tabular-nums
}
.reader-pending-agent-stack {
  display:inline-flex;
  min-width:0;
  align-items:center
}
.reader-pending-agent-avatar {
  position:relative;
  display:grid;
  width:25px;
  height:25px;
  place-items:center;
  border-radius:999px;
  background:transparent
}
.reader-pending-agent-avatar+.reader-pending-agent-avatar {
  margin-left:-8px
}
.reader-pending-agent-avatar::after {
  content:"";
  position:absolute;
  right:1px;
  bottom:1px;
  width:7px;
  height:7px;
  border:2px solid var(--reader-paper);
  border-radius:999px;
  background:var(--reader-avatar-color,var(--reader-green));
  box-shadow:0 0 0 0 var(--app-reader-primary-a24);
  animation:reader-pending-agent-pulse 1.24s ease-in-out infinite
}
.reader-pending-agent-avatar .reader-avatar-badge {
  width:23px;
  height:23px;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-avatar-color,var(--reader-green));
  font-size:10px;
  filter:saturate(.82);
  opacity:.78
}
.reader-pending-agent-avatar .reader-avatar-badge.is-image {
  background:transparent
}
.reader-pending-agent-more {
  display:grid;
  min-width:25px;
  height:25px;
  place-items:center;
  margin-left:-8px;
  border:2px solid var(--reader-paper);
  border-radius:999px;
  background:var(--app-reader-agent-panel-hover-bg);
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:10px;
  font-weight:900;
  font-variant-numeric:tabular-nums
}
.reader-note-distillation-footer {
  position:relative;
  z-index:1;
  display:flex;
  justify-content:flex-end;
  margin:0;
  padding:4px 12px 7px;
  border-top:0;
  background:transparent
}
.reader-note-distillation-time {
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:760;
  font-variant-numeric:tabular-nums
}
.reader-note-comments-region {
  width:100%;
  margin-top:0;
  overflow:visible
}
.reader-note-comments-panel {
  display:grid;
  grid-template-rows:auto auto;
  min-height:0;
  overflow:visible;
  gap:0;
  border-top:1px solid var(--app-reader-note-border);
  background:var(--reader-paper);
  padding:12px
}
.reader-note-comments-panel>header {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding-bottom:8px;
  border-bottom:1px dashed var(--app-reader-ink-a12);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-note-comments-panel>header>div {
  display:flex;
  align-items:baseline;
  gap:7px;
  min-width:0
}
.reader-note-comments-panel>header strong {
  font-size:13px;
  font-weight:900
}
.reader-note-comments-panel>header span {
  color:var(--reader-muted);
  font-size:11px;
  font-weight:800
}
.reader-note-comments-panel>header button {
  display:inline-flex;
  align-items:center;
  gap:4px;
  height:26px;
  border:0;
  border-radius:999px;
  background:transparent;
  color:var(--reader-muted);
  font:inherit;
  font-size:11px;
  font-weight:850;
  padding:0 8px;
  transition:background .14s ease,color .14s ease,transform .14s ease
}
.reader-note-comments-panel>header button:hover {
  background:var(--app-reader-agent-panel-hover-bg);
  color:var(--reader-ink)
}
.reader-note-comments-panel>header button:active {
  transform:scale(.96)
}
.reader-note-comments-panel .reader-comments {
  display:grid;
  gap:8px;
  min-height:0;
  overflow:visible;
  margin:0 -4px 0 0;
  padding:0 4px 0 0
}
.reader-note-comments-panel .reader-comment {
  grid-template-columns:32px minmax(0,1fr);
  width:100%;
  min-width:0
}
.reader-note-comments-panel .reader-comments:has(.reader-agent-menu),
.reader-note-comments-panel .reader-comments:has(.reader-agent-avatar-stack),
.reader-note-comments-panel .reader-comments:has(.reader-comment-agent-more-menu),
.reader-note-comments-panel .reader-comments:has(.reader-action-menu-panel),
.reader-composer .floating-composer-actions:has(.reader-agent-avatar-stack) {
  overflow:visible
}
.reader-comment.is-reply {
  grid-template-columns:28px minmax(0,1fr)
}
.reader-comment.is-reply .reader-avatar-badge {
  width:26px;
  height:26px
}
.reader-note-comments-panel .reader-markdown-content,.reader-note-comments-panel .reader-markdown-content * {
  max-width:100%;
  min-width:0;
  overflow-wrap:anywhere;
  word-break:break-word
}
.reader-comment-markdown {
  position:relative
}
.reader-comment-markdown.is-collapsed .reader-markdown-content {
  max-height:calc(1.66em * 4);
  overflow:hidden
}
.reader-comment-markdown.is-collapsed::after {
  content:"";
  position:absolute;
  left:0;
  right:0;
  bottom:28px;
  height:34px;
  background:linear-gradient(to bottom,transparent,var(--app-reader-paper-a88));
  pointer-events:none
}
.reader-comment-author time {
  color:var(--reader-muted);
  font-size:10px;
  font-weight:760;
  font-variant-numeric:tabular-nums;
  white-space:nowrap
}`;
