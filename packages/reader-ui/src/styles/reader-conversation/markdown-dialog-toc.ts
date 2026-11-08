export const markdownDialogTocStyles = `.reader-comment-body {
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
  background:var(--app-reader-accent-strong-a8);
  color:var(--reader-red);
  font-size:10px;
  font-weight:850;
  line-height:1;
  padding:3px 6px
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
  border-left:3px solid var(--app-reader-danger-a24);
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
  text-decoration-color:var(--app-reader-ink-a32);
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
  color:var(--app-reader-danger);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-weight:850;
  padding:0 12px;
  line-height:1;
  white-space:nowrap
}
.reader-delete-note:hover {
  background:var(--app-reader-danger-a6)
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
  background:var(--app-reader-ink-a40)
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
  border:1px solid var(--app-reader-note-border,var(--app-reader-ink-a12));
  border-radius:16px;
  background:var(--app-reader-paper);
  box-shadow:0 22px 70px var(--app-reader-ink-a20);
  color:var(--app-reader-ink);
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
  background:var(--app-reader-danger-a12);
  color:var(--app-reader-danger)
}
.reader-confirm-dialog h2 {
  margin:0;
  color:var(--app-reader-ink);
  font-size:15px;
  font-weight:850;
  line-height:1.3
}
.reader-confirm-dialog p {
  margin:6px 0 0;
  color:var(--app-reader-muted);
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
  background:var(--app-reader-paper-hover);
  color:var(--app-reader-ink)
}
.reader-confirm-delete {
  background:var(--app-reader-danger);
  color:var(--app-reader-paper)
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
  background:var(--app-reader-ink-a20);
  transform-origin:left center;
  transition:width var(--reader-toc-motion),background .16s ease;
  will-change:width
}
.reader-toc-item:hover .reader-toc-line,.reader-toc-item.is-active .reader-toc-line {
  background:var(--reader-green)
}
.reader-toc-item.is-active {
  background:var(--app-reader-toc-item-active-bg);
  box-shadow:none;
  color:var(--reader-ink)
}
.reader-toc-count {
  display:grid;
  min-width:23px;
  height:23px;
  place-items:center;
  border:1px solid color-mix(in srgb,var(--reader-toc-count-color,var(--reader-green)) 42%,var(--app-reader-ink-a12));
  border-radius:999px;
  background:color-mix(in srgb,var(--reader-toc-count-color,var(--reader-green)) 58%,var(--reader-paper));
  box-shadow:inset 0 1px 0 var(--app-reader-paper-a48);
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
  border:1px solid var(--app-reader-ink-a12);
  border-radius:14px;
  background:var(--app-reader-paper);
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
