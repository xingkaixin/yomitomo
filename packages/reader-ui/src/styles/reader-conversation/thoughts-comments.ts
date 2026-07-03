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
  box-shadow:0 0 0 0 color-mix(in srgb,var(--reader-avatar-color,var(--reader-green)) 28%,transparent);
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
  background:color-mix(in srgb,var(--app-reader-note-bg) 86%,var(--reader-paper));
  padding:12px
}
.reader-note-comments-panel>header {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding-bottom:8px;
  border-bottom:1px dashed color-mix(in srgb,var(--reader-ink) 14%,transparent);
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
.reader-discussion-thread {
  position:relative;
  z-index:0;
  display:grid;
  width:100%;
  overflow:visible;
  border:1px solid var(--app-reader-note-border);
  border-radius:8px;
  background:var(--reader-paper);
  box-shadow:0 1px 3px color-mix(in srgb,var(--reader-ink) 4%,transparent)
}
.reader-note-comments-panel .reader-comments:has(.reader-agent-menu),
.reader-note-comments-panel .reader-comments:has(.reader-agent-avatar-stack),
.reader-note-comments-panel .reader-comments:has(.reader-comment-agent-more-menu),
.reader-note-comments-panel .reader-comments:has(.reader-action-menu-panel),
.reader-discussion-thread:has(.reader-agent-menu),
.reader-discussion-thread:has(.reader-agent-avatar-stack),
.reader-discussion-thread:has(.reader-comment-agent-more-menu),
.reader-discussion-thread:has(.reader-action-menu-panel),
.reader-thread-detail:has(.reader-agent-menu),
.reader-thread-detail:has(.reader-agent-avatar-stack),
.reader-thread-detail:has(.reader-comment-agent-more-menu),
.reader-thread-detail:has(.reader-action-menu-panel),
.reader-thought-footer:has(.reader-agent-avatar-stack),
.reader-thought-footer:has(.reader-comment-agent-more-menu),
.reader-thought-footer-actions:has(.reader-agent-avatar-stack),
.reader-thought-footer-actions:has(.reader-comment-agent-more-menu),
.reader-thread-reply-composer:has(.reader-agent-avatar-stack),
.reader-thread-reply-composer:has(.reader-comment-agent-more-menu),
.reader-inline-composer-panel:has(.reader-agent-avatar-stack),
.reader-inline-composer-panel:has(.reader-comment-agent-more-menu),
.reader-new-thought-composer:has(.reader-agent-avatar-stack),
.reader-note-footer:has(.reader-agent-avatar-stack),
.reader-composer .floating-composer-actions:has(.reader-agent-avatar-stack) {
  overflow:visible
}
.reader-discussion-thread:has(.reader-agent-menu),.reader-discussion-thread:has(.reader-comment-agent-more-menu),.reader-discussion-thread:has(.reader-action-menu-panel) {
  z-index:20
}
.reader-discussion-thread.is-open {
  grid-template-rows:auto auto auto;
  margin-bottom:14px;
  border:1px solid var(--app-reader-note-border);
  outline:0;
  background:var(--reader-paper);
  box-shadow:none
}
.reader-thought-summary-wrap {
  position:relative;
  min-width:0
}
.reader-thought-summary {
  display:grid;
  width:100%;
  min-height:0;
  grid-template-columns:34px minmax(0,1fr);
  align-items:start;
  gap:10px;
  border:0;
  background:transparent;
  color:inherit;
  font:inherit;
  padding:13px 14px 12px;
  text-align:left
}
.reader-thought-summary:focus-visible {
  outline:2px solid var(--reader-focus-ring);
  outline-offset:-2px
}
.reader-thought-owner {
  display:grid;
  width:34px;
  height:34px;
  place-items:center;
  border-radius:999px;
  background:transparent
}
.reader-thought-owner .reader-avatar-badge,.reader-thought-summary .reader-avatar-badge {
  width:30px;
  height:30px;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-avatar-color,var(--reader-green))
}
.reader-thought-owner .reader-avatar-badge.is-image,.reader-thought-summary .reader-avatar-badge.is-image {
  background:transparent
}
.reader-thought-summary-copy {
  display:grid;
  min-width:0;
  gap:8px
}
.reader-thought-summary-meta {
  display:flex;
  min-width:0;
  align-items:baseline;
  gap:7px
}
.reader-thought-summary-meta strong {
  display:block;
  overflow:hidden;
  color:var(--reader-ink);
  font-size:13px;
  font-weight:880;
  line-height:1.18;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-thought-time {
  color:var(--reader-muted);
  font-size:11px;
  font-weight:760;
  font-variant-numeric:tabular-nums;
  line-height:1.1;
  white-space:nowrap
}
.reader-thought-summary .reader-comment-markdown {
  color:var(--app-reader-note-quote-text)
}
.reader-thought-summary .reader-markdown-content,.reader-thought-summary .reader-markdown-content p {
  font-size:13px;
  font-weight:520;
  line-height:1.68
}
.reader-thought-footer {
  position:relative;
  z-index:1;
  display:flex;
  min-height:44px;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  overflow:visible;
  padding:8px 14px;
  border-top:1px solid var(--app-reader-note-border);
  background:color-mix(in srgb,var(--app-reader-note-bg) 76%,var(--reader-paper))
}
.reader-replies-toggle,.reader-replies-label {
  display:inline-flex;
  align-items:center;
  gap:6px;
  height:28px;
  border:0;
  background:transparent;
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:12px;
  font-weight:820;
  font-variant-numeric:tabular-nums;
  padding:0
}
.reader-replies-toggle {
  transition:color .14s ease
}
.reader-replies-toggle:hover {
  color:var(--reader-red)
}
.reader-replies-label {
  cursor:default
}
.reader-thought-footer-actions {
  display:inline-flex;
  min-width:0;
  align-items:center;
  justify-content:flex-end;
  gap:10px;
  margin-left:auto
}
.reader-thought-review-status {
  display:inline-flex;
  min-width:0;
  align-items:center;
  gap:6px;
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:850
}
.reader-replies-toggle .reader-thought-review-status,.reader-replies-label .reader-thought-review-status {
  margin-left:3px
}
.reader-thought-reviewer-stack,.reader-thought-review-motion {
  display:inline-flex;
  min-width:0;
  align-items:center
}
.reader-thought-reviewer-stack>span,.reader-thought-review-motion>span {
  display:grid;
  width:22px;
  height:22px;
  place-items:center;
  border-radius:999px;
  background:transparent
}
.reader-thought-reviewer-stack>span+span {
  margin-left:-7px
}
.reader-thought-reviewer-stack .reader-avatar-badge,.reader-thought-review-motion .reader-avatar-badge {
  width:20px;
  height:20px;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-avatar-color,var(--reader-green));
  font-size:8px
}
.reader-thought-reviewer-stack .reader-avatar-badge.is-image,.reader-thought-review-motion .reader-avatar-badge.is-image {
  background:transparent
}
.reader-thought-review-motion {
  gap:4px
}
.reader-thought-review-motion>span {
  animation:reader-review-avatar-travel var(--reviewer-duration) ease-in-out infinite;
  animation-delay:calc(var(--reviewer-index) * 120ms)
}
.reader-thought-action-menu {
  position:absolute;
  right:10px;
  top:10px;
  z-index:2
}
.reader-thread-detail::-webkit-scrollbar {
  width:7px
}
.reader-thread-detail::-webkit-scrollbar-track {
  background:transparent
}
.reader-thread-detail::-webkit-scrollbar-thumb {
  border:2px solid rgba(255,252,246,.9);
  border-radius:999px;
  background:rgba(154,143,131,.32)
}
.reader-thread-detail {
  display:grid;
  max-height:min(calc(var(--app-viewport-height) * 0.46),420px);
  min-height:0;
  overflow:auto;
  overscroll-behavior:contain;
  scrollbar-gutter:stable;
  gap:0;
  padding:0 14px 18px
}
.reader-thread-detail:hover::-webkit-scrollbar-thumb {
  background:rgba(154,143,131,.48)
}
.reader-thread-replies {
  position:relative;
  display:grid;
  gap:0;
  margin-left:0;
  padding-left:0
}
.reader-thread-replies .reader-comment {
  position:relative;
  padding:11px 0;
  border-top:1px solid var(--app-reader-note-border);
  border-radius:0;
  background:transparent
}
.reader-thread-replies .reader-comment:first-child {
  border-top-color:color-mix(in srgb,var(--reader-ink) 8%,transparent)
}
.reader-comment.is-reply {
  grid-template-columns:28px minmax(0,1fr)
}
.reader-comment.is-reply .reader-avatar-badge {
  width:26px;
  height:26px
}
.reader-comment-action-menu {
  opacity:0;
  pointer-events:none;
  transition:opacity .14s ease
}
.reader-comment:hover .reader-comment-action-menu,.reader-comment:focus-within .reader-comment-action-menu,.reader-comment-action-menu.is-open {
  opacity:1;
  pointer-events:auto
}
.reader-comment-action-menu .reader-action-menu-button {
  width:28px;
  height:28px
}
.reader-thread-reply-composer {
  display:flex;
  min-width:0;
  overflow:visible;
  justify-content:flex-end
}
.reader-thought-footer-actions:has(.reader-inline-composer-panel) {
  flex:1 0 100%;
  width:100%;
  align-items:flex-start;
  justify-content:stretch;
  margin-left:0
}
.reader-thread-reply-composer:has(.reader-inline-composer-panel) {
  flex:1 0 100%;
  justify-content:stretch;
  margin-top:8px
}
.reader-thread-reply-composer .reader-inline-composer-panel {
  width:100%
}
.reader-pending-thoughts {
  position:relative;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:10px;
  margin:8px 0 0;
  padding:11px 12px 13px;
  overflow:hidden;
  border:1px solid var(--app-reader-note-border);
  border-radius:8px;
  background:var(--reader-paper);
  box-shadow:0 1px 3px color-mix(in srgb,var(--reader-ink) 4%,transparent);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-pending-thoughts .reader-pending-agent-stack {
  align-self:start;
  padding-top:2px
}
.reader-pending-thought-copy {
  display:grid;
  min-width:0;
  gap:3px
}
.reader-pending-thought-copy strong {
  overflow:hidden;
  color:var(--reader-ink);
  font-size:13px;
  font-weight:880;
  line-height:1.2;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-pending-thought-copy em {
  color:var(--reader-muted);
  font-size:12px;
  font-style:normal;
  font-weight:720;
  line-height:1.4;
  text-wrap:pretty
}
.reader-pending-thought-progress {
  position:absolute;
  left:0;
  right:0;
  bottom:0;
  height:3px;
  overflow:hidden;
  background:color-mix(in srgb,var(--reader-ink) 8%,transparent)
}
.reader-pending-thought-progress i {
  display:block;
  width:42%;
  height:100%;
  border-radius:999px;
  background:linear-gradient(90deg,transparent,var(--reader-note-accent,var(--reader-green)),transparent);
  animation:reader-pending-thought-progress 1.38s cubic-bezier(.22,1,.36,1) infinite
}
.reader-new-thought-composer {
  margin:10px -12px -12px;
  padding:12px;
  border-top:1px solid var(--app-reader-note-border);
  background:color-mix(in srgb,var(--app-reader-note-bg) 84%,var(--reader-paper))
}
.reader-new-thought-composer.is-empty {
  margin-top:0
}
.reader-inline-composer-trigger {
  display:inline-flex;
  width:fit-content;
  justify-self:center;
  align-items:center;
  justify-content:center;
  gap:6px;
  height:32px;
  border:1px solid var(--app-reader-composer-border);
  border-radius:999px;
  background:var(--reader-paper);
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:850;
  padding:0 12px;
  box-shadow:0 4px 12px color-mix(in srgb,var(--reader-ink) 5%,transparent);
  transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,color .14s ease,transform .14s ease
}
.reader-inline-composer-trigger:hover {
  border-color:color-mix(in srgb,var(--reader-ink) 22%,transparent);
  background:var(--app-reader-agent-panel-hover-bg);
  box-shadow:0 6px 16px color-mix(in srgb,var(--reader-ink) 8%,transparent);
  color:var(--reader-ink)
}
.reader-inline-composer-trigger:active {
  transform:scale(.96)
}
.reader-inline-composer-trigger:focus-visible {
  outline:2px solid var(--reader-focus-ring);
  outline-offset:2px
}
.reader-new-thought-composer .reader-inline-composer-trigger {
  width:100%;
  min-width:0;
  height:40px;
  border:1px dashed color-mix(in srgb,var(--reader-ink) 18%,transparent);
  border-radius:8px;
  background:var(--reader-paper)
}
.reader-new-thought-composer .reader-inline-composer-trigger:hover {
  border-color:color-mix(in srgb,var(--reader-red) 18%,transparent);
  background:var(--app-reader-agent-panel-hover-bg);
  color:var(--reader-red)
}
.reader-inline-composer-panel {
  position:relative;
  overflow:visible;
  transform-origin:top left
}
.reader-inline-composer-panel.t-dropdown {
  transform:scale(.98);
  transition:transform .18s cubic-bezier(.22,1,.36,1),opacity .18s cubic-bezier(.22,1,.36,1)
}
.reader-inline-composer-panel.t-dropdown.is-open {
  transform:scale(1)
}
.reader-note-comments-panel .reader-markdown-content,.reader-note-comments-panel .reader-markdown-content * {
  max-width:100%;
  min-width:0;
  overflow-wrap:anywhere;
  word-break:break-word
}
.reader-comments-empty {
  border:1px dashed color-mix(in srgb,var(--reader-ink) 14%,transparent);
  border-radius:12px;
  background:var(--reader-paper);
  color:var(--reader-muted);
  font-size:12px;
  font-weight:760;
  line-height:1.4;
  padding:12px;
  text-align:center
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
  background:linear-gradient(to bottom,transparent,color-mix(in srgb,var(--app-reader-note-bg) 96%,transparent));
  pointer-events:none
}
.reader-note-primary-comment .reader-comment-markdown.is-collapsed::after {
  background:linear-gradient(to bottom,transparent,var(--reader-paper))
}
.reader-comment-expand {
  position:relative;
  z-index:1;
  width:fit-content;
  height:26px;
  margin-top:4px;
  border:0;
  border-radius:999px;
  background:color-mix(in srgb,var(--reader-ink) 6%,transparent);
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:850;
  padding:0 9px;
  transition:background .14s ease,color .14s ease,transform .14s ease
}
.reader-comment-expand:hover {
  background:var(--app-reader-agent-panel-hover-bg);
  color:var(--reader-ink)
}
.reader-comment-expand:active {
  transform:scale(.96)
}
.reader-comment-author time {
  color:var(--reader-muted);
  font-size:10px;
  font-weight:760;
  font-variant-numeric:tabular-nums;
  white-space:nowrap
}
.reader-comment-agent-tray {
  position:relative;
  display:flex;
  flex:0 1 auto;
  align-items:center;
  gap:8px;
  margin-right:auto;
  min-width:0;
  overflow:visible;
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:780
}
.reader-comment-agent-tray>button {
  display:grid;
  width:30px;
  height:30px;
  place-items:center;
  border:1px solid color-mix(in srgb,var(--reader-ink) 12%,transparent);
  border-radius:999px;
  background:var(--reader-paper);
  color:var(--reader-muted);
  padding:0
}
.reader-comment-agent-tray>button:hover {
  background:var(--app-reader-agent-panel-hover-bg);
  color:var(--reader-ink)
}
.reader-comment-agent-tray button:disabled {
  cursor:not-allowed;
  opacity:.45
}
.reader-comment-agent-tray span {
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-comment-agent-tray .reader-agent-avatar-stack,.reader-comment-agent-tray .reader-agent-avatar-stack-item {
  overflow:visible
}
.reader-comment-agent-tray .reader-comment-mention-label {
  display:grid;
  width:30px;
  height:30px;
  place-items:center;
  border:1px solid color-mix(in srgb,var(--reader-ink) 12%,transparent);
  border-radius:999px;
  background:var(--reader-paper);
  color:var(--reader-muted);
  font-size:15px;
  font-weight:850
}
.reader-comment-agent-tray .reader-agent-avatar-stack {
  padding:0
}
.reader-comment-agent-tray .reader-agent-avatar-stack-item {
  width:30px;
  height:30px;
  border-color:var(--reader-paper);
  background:var(--reader-paper)
}
.reader-comment-agent-tray .reader-agent-avatar-stack-item:hover {
  background:var(--reader-paper)
}
.reader-comment-agent-tray .reader-avatar-badge {
  width:24px;
  height:24px
}
.reader-comment-agent-more {
  position:relative;
  z-index:40
}
.reader-comment-agent-more-menu {
  position:absolute;
  right:0;
  bottom:calc(100% + 8px);
  z-index:60;
  display:grid;
  gap:4px;
  width:190px;
  padding:8px;
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:14px;
  background:var(--reader-paper);
  box-shadow:var(--app-reader-composer-shadow)
}
.reader-comment-agent-more-menu button {
  display:grid;
  width:100%;
  height:36px;
  grid-template-columns:28px minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
  border:0;
  border-radius:10px;
  background:transparent;
  color:var(--reader-ink);
  padding:0 8px;
  text-align:left
}
.reader-comment-agent-more-menu button:hover {
  background:var(--app-reader-agent-panel-hover-bg)
}
.reader-comment-agent-more-menu strong {
  overflow:hidden;
  font-size:12px;
  font-weight:900;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-comment-agent-more-menu em {
  color:var(--reader-muted);
  font-size:11px;
  font-style:normal;
  font-weight:760
}`;
