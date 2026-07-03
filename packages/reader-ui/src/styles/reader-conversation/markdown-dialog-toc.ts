export const markdownDialogTocStyles = `.reader-composer-types {
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  margin-bottom:10px
}
.reader-composer-types button {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:4px;
  border:1px solid rgba(37,29,22,.12);
  border-radius:999px;
  background:var(--reader-paper);
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:850;
  line-height:1;
  padding:7px 9px
}
.reader-composer-types button:hover,.reader-composer-types button.is-active {
  border-color:rgba(159,91,80,.18);
  background:rgba(159,91,80,.07);
  color:var(--reader-red)
}
.reader-comment-body {
  min-width:0
}
.reader-comment-author {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  min-width:0;
  align-items:baseline;
  gap:8px;
  margin-bottom:3px;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-comment-author strong {
  display:inline-flex;
  min-width:0;
  align-items:center;
  gap:4px;
  font-size:12px;
  font-weight:850
}
.reader-comment-author strong time {
  margin-left:3px;
  color:var(--reader-muted);
  font-size:10px;
  font-weight:760;
  font-variant-numeric:tabular-nums;
  white-space:nowrap
}
.reader-comment .reader-comment-author>span {
  display:inline-flex;
  width:auto;
  height:auto;
  align-items:center;
  gap:3px;
  border-radius:999px;
  background:rgba(159,91,80,.07);
  color:var(--reader-red);
  font-size:10px;
  font-weight:850;
  line-height:1;
  padding:3px 6px
}
.reader-comment .reader-review-label {
  display:inline-flex;
  width:max-content;
  max-width:100%;
  height:auto;
  min-width:0;
  align-items:center;
  margin:0 0 5px;
  border:1px solid transparent;
  border-radius:999px;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:9px;
  font-weight:900;
  line-height:1;
  overflow-wrap:normal;
  padding:3px 6px;
  white-space:nowrap;
  word-break:normal
}
.reader-review-label.is-support {
  border-color:var(--reader-review-support-border);
  background:var(--reader-review-support-bg);
  color:var(--reader-review-support-fg)
}
.reader-review-label.is-challenge {
  border-color:var(--reader-review-challenge-border);
  background:var(--reader-review-challenge-bg);
  color:var(--reader-review-challenge-fg)
}
.reader-review-label.is-supplement {
  border-color:var(--reader-review-supplement-border);
  background:var(--reader-review-supplement-bg);
  color:var(--reader-review-supplement-fg)
}
.reader-markdown {
  min-width:0;
  color:var(--app-reader-note-quote-text);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:13px;
  line-height:1.66;
  overflow-wrap:anywhere;
  word-break:break-word
}
.reader-markdown-content>*:first-child {
  margin-top:0
}
.reader-markdown-content>*:last-child {
  margin-bottom:0
}
.reader-markdown p {
  margin:0 0 8px;
  color:inherit;
  font-size:13px;
  line-height:1.66
}
.reader-markdown h1,.reader-markdown h2,.reader-markdown h3,.reader-markdown h4,.reader-markdown h5,.reader-markdown h6 {
  margin:10px 0 6px;
  color:var(--reader-ink);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-weight:850;
  line-height:1.35;
  letter-spacing:0
}
.reader-markdown h1 {
  font-size:15px
}
.reader-markdown h2 {
  font-size:14px
}
.reader-markdown h3,.reader-markdown h4,.reader-markdown h5,.reader-markdown h6 {
  font-size:13px
}
.reader-markdown ul,.reader-markdown ol {
  margin:6px 0 8px;
  padding-left:18px
}
.reader-markdown li {
  margin:3px 0
}
.reader-markdown blockquote {
  margin:8px 0;
  padding-left:10px;
  border-left:3px solid color-mix(in srgb,var(--reader-red) 28%,transparent);
  color:var(--reader-ink)
}
.reader-markdown code {
  border-radius:5px;
  background:var(--reader-ink-hairline);
  font-family:var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  font-size:12px;
  padding:1px 4px
}
.reader-markdown pre {
  max-width:100%;
  overflow:auto;
  margin:8px 0;
  padding:10px;
  border-radius:10px;
  background:var(--reader-code-bg);
  color:var(--reader-code-fg)
}
.reader-markdown pre code {
  background:transparent;
  color:inherit;
  padding:0
}
.reader-markdown a {
  color:inherit;
  text-decoration:underline;
  text-decoration-color:rgba(37,29,22,.35);
  text-decoration-thickness:1px;
  text-underline-offset:.16em
}
.reader-markdown a:hover {
  color:var(--reader-red);
  text-decoration-color:currentColor
}
.reader-delete-note {
  display:inline-flex;
  align-items:center;
  gap:5px;
  justify-content:center;
  height:40px;
  border:0;
  border-radius:999px;
  background:transparent;
  color:var(--reader-red,var(--app-reader-danger,#8a3f32));
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-weight:850;
  padding:0 12px;
  line-height:1;
  white-space:nowrap
}
.reader-delete-note:hover {
  background:color-mix(in srgb,var(--reader-red,var(--app-reader-danger,#8a3f32)) 7%,transparent)
}
.reader-delete-note>span {
  display:inline;
  width:auto;
  height:auto;
  place-items:normal;
  border-radius:0;
  background:transparent;
  color:inherit;
  font-size:inherit;
  font-weight:inherit;
  line-height:1;
  padding:0
}
.reader-confirm-overlay {
  position:fixed;
  inset:0;
  z-index:var(--reader-z-modal,var(--app-z-modal,320));
  background:color-mix(in srgb,var(--reader-ink,var(--app-reader-ink,#251d16)) 38%,transparent)
}
.reader-confirm-dialog {
  position:fixed;
  left:50%;
  top:50%;
  z-index:calc(var(--reader-z-modal,var(--app-z-modal,320)) + 1);
  width:min(420px,calc(100vw - 48px));
  display:grid;
  gap:16px;
  padding:20px;
  border:1px solid var(--app-reader-note-border,color-mix(in srgb,var(--app-reader-ink,#251d16) 14%,transparent));
  border-radius:16px;
  background:var(--reader-paper,var(--app-reader-paper,#fffaf0));
  box-shadow:0 22px 70px color-mix(in srgb,var(--reader-ink,var(--app-reader-ink,#251d16)) 22%,transparent);
  color:var(--reader-ink,var(--app-reader-ink,#251d16));
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  transform:translate(-50%,-50%)
}
.reader-confirm-dialog header {
  display:grid;
  grid-template-columns:auto 1fr;
  gap:12px;
  align-items:start
}
.reader-confirm-icon {
  display:grid;
  width:36px;
  height:36px;
  place-items:center;
  border-radius:999px;
  background:color-mix(in srgb,var(--reader-red,var(--app-reader-danger,#8a3f32)) 14%,transparent);
  color:var(--reader-red,var(--app-reader-danger,#8a3f32))
}
.reader-confirm-dialog h2 {
  margin:0;
  color:var(--reader-ink,var(--app-reader-ink,#251d16));
  font-size:15px;
  font-weight:850;
  line-height:1.3
}
.reader-confirm-dialog p {
  margin:6px 0 0;
  color:var(--reader-muted,var(--app-reader-muted,#756a5d));
  font-size:13px;
  line-height:1.55
}
.reader-confirm-dialog footer {
  display:flex;
  justify-content:flex-end;
  gap:8px
}
.reader-confirm-dialog footer button {
  border:0;
  border-radius:999px;
  font-family:inherit;
  font-size:13px;
  font-weight:760;
  padding:9px 14px
}
.reader-confirm-cancel {
  background:var(--reader-paper-hover,color-mix(in srgb,var(--app-reader-ink,#251d16) 6%,var(--app-reader-paper,#fffaf0)));
  color:var(--reader-ink,var(--app-reader-ink,#251d16))
}
.reader-confirm-delete {
  background:var(--reader-red,var(--app-reader-danger,#8a3f32));
  color:var(--app-reader-paper,#fff)
}
.reader-agent-annotate-popover {
  position:fixed;
  inset:0;
  z-index:var(--reader-z-modal);
  display:grid;
  place-items:center;
  width:auto;
  padding:34px;
  pointer-events:none
}
.reader-agent-annotate-popover .reader-agent-annotate-menu {
  margin:0
}
.reader-toc-item-main {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  min-width:0;
  box-sizing:border-box;
  padding-right:var(--reader-toc-title-shift,0px);
  transform:translateX(var(--reader-toc-title-shift,0px));
  transition:padding-right var(--reader-toc-motion),transform var(--reader-toc-motion);
  will-change:transform
}
.reader-toc-label {
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-toc-item {
  position:relative;
  overflow:hidden;
  transform:translateX(var(--reader-toc-shift,0px));
  transition:background .16s ease,color .16s ease,transform var(--reader-toc-motion);
  will-change:transform
}
.reader-toc-item:hover,.reader-toc-item.is-active {
  --reader-toc-line-current-width:var(--reader-toc-line-active-width);
  --reader-toc-title-shift:var(--reader-toc-line-active-delta)
}
.reader-toc-line {
  display:block;
  width:var(--reader-toc-line-current-width);
  height:1px;
  border-radius:999px;
  background:color-mix(in srgb,var(--reader-ink) 22%,transparent);
  transform-origin:left center;
  transition:width var(--reader-toc-motion),background .16s ease;
  will-change:width
}
.reader-toc-item:hover .reader-toc-line,.reader-toc-item.is-active .reader-toc-line {
  background:var(--reader-green)
}
.reader-toc-item.is-active {
  background:color-mix(in srgb,var(--reader-green) 10%,var(--app-reader-toc-item-hover-bg));
  box-shadow:none;
  color:var(--reader-ink)
}
.reader-toc-count {
  display:grid;
  min-width:23px;
  height:23px;
  place-items:center;
  border:1px solid color-mix(in srgb,var(--reader-toc-count-color,var(--reader-green)) 42%,rgba(37,29,22,.14));
  border-radius:999px;
  background:color-mix(in srgb,var(--reader-toc-count-color,var(--reader-green)) 58%,var(--reader-paper));
  box-shadow:inset 0 1px 0 color-mix(in srgb,var(--reader-paper) 46%,transparent);
  color:var(--reader-ink);
  font-size:11px;
  font-weight:850;
  line-height:1;
  padding:0 6px
}
@media(prefers-reduced-motion:reduce) {
  .reader-toc-item,.reader-toc-line,.reader-toc-item-main {
    transition:none!important;
    will-change:auto
  }
  .reader-toc-item {
    transform:none!important
  }
}
.reader-toc-summary {
  display:inline-flex;
  align-items:center;
  gap:7px;
  margin-top:18px;
  padding:12px 10px;
  border:1px solid rgba(37,29,22,.12);
  border-radius:14px;
  background:var(--reader-paper-panel);
  color:var(--reader-muted);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:12px;
  font-weight:760;
  line-height:1.4;
  white-space:nowrap
}
.reader-toc-summary-stat {
  display:inline-flex;
  align-items:center;
  gap:4px;
  min-width:0
}
.reader-toc-summary-stat svg {
  width:14px;
  height:14px;
  flex:none;
  stroke-width:2.1
}
.reader-toc-summary-value {
  min-width:1ch;
  text-align:right
}
.reader-toc-summary-separator {
  color:var(--reader-muted)
}`;
