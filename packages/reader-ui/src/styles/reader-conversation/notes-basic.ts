export const notesBasicStyles = `.reader-notes {
  padding:0 16px 32px;
  scroll-padding-top:80px
}
.reader-notes-header {
  margin:0 -16px 14px;
  padding:14px 16px;
  background:var(--app-reader-toc-bg);
  box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 5%,transparent)
}
.reader-note {
  scroll-margin-top:86px;
  border:1px solid var(--reader-ink-subtle);
  border-radius:18px;
  padding:14px;
  background:var(--reader-paper);
  box-shadow:var(--reader-soft-shadow)
}
.reader-empty {
  display:grid;
  justify-items:center;
  gap:14px;
  margin:0;
  padding:18px 4px;
  border:0!important;
  border-radius:0;
  background:transparent!important;
  box-shadow:none!important;
  color:var(--reader-ink);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  text-align:center
}
.reader-empty-icon {
  display:grid;
  width:56px;
  height:56px;
  place-items:center;
  border-radius:16px;
  background:color-mix(in srgb,var(--reader-yellow) 12%,var(--reader-paper));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--reader-ink) 5%,transparent);
  color:color-mix(in srgb,var(--reader-yellow-strong) 78%,var(--reader-ink))
}
.reader-empty strong {
  max-width:260px;
  color:var(--reader-ink);
  font-size:20px;
  font-weight:900;
  line-height:1.25;
  text-wrap:balance
}
.reader-empty p {
  max-width:270px;
  margin:0;
  color:var(--reader-muted);
  font-size:13px;
  font-weight:650;
  line-height:1.65;
  text-wrap:pretty
}
.reader-empty-gesture {
  display:grid;
  width:min(260px,100%);
  justify-items:center;
  gap:9px;
  margin-top:8px
}
.reader-empty-gesture-card {
  display:grid;
  width:100%;
  gap:8px;
  padding:11px 14px;
  border-radius:8px;
  background:var(--reader-paper);
  box-shadow:0 0 0 1px color-mix(in srgb,var(--reader-ink) 7%,transparent),0 8px 20px color-mix(in srgb,var(--reader-ink) 6%,transparent)
}
.reader-empty-line {
  position:relative;
  display:block;
  height:7px;
  overflow:hidden;
  border-radius:999px;
  background:color-mix(in srgb,var(--reader-muted) 14%,transparent)
}
.reader-empty-line.is-short {
  width:68%;
  justify-self:center
}
.reader-empty-line.is-medium {
  width:72%
}
.reader-empty-line.has-highlight i {
  position:absolute;
  left:36%;
  top:0;
  bottom:0;
  width:44%;
  border-radius:inherit;
  background:color-mix(in srgb,var(--reader-yellow-strong) 58%,var(--reader-yellow))
}
.reader-empty-gesture-arrow {
  width:9px;
  height:9px;
  border-right:2px solid color-mix(in srgb,var(--reader-muted) 46%,transparent);
  border-bottom:2px solid color-mix(in srgb,var(--reader-muted) 46%,transparent);
  transform:rotate(45deg)
}
.reader-empty-gesture-card.is-note {
  grid-template-columns:18px minmax(0,1fr);
  align-items:center
}
.reader-empty-gesture-card.is-note .reader-empty-line {
  grid-column:2
}
.reader-empty-quote-mark {
  grid-row:1/3;
  align-self:start;
  color:var(--reader-yellow-strong);
  font-size:20px;
  font-weight:900;
  line-height:1
}
.reader-empty-quote-mark::before {
  content:"“"
}
.reader-note-action-row {
  display:flex;
  align-items:center;
  gap:6px;
  margin-bottom:10px;
  min-width:0
}
.reader-note-action-row time {
  margin-left:auto;
  color:var(--reader-muted);
  font-size:11px;
  font-weight:760;
  white-space:nowrap
}
.reader-note-anchor {
  display:grid;
  gap:8px
}
.reader-note-anchor .reader-note-persona {
  display:grid;
  grid-template-columns:28px minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
  margin:0;
  color:var(--reader-ink);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-note-persona .reader-avatar-badge {
  width:28px;
  height:28px
}
.reader-note-persona strong {
  overflow:hidden;
  font-size:13px;
  font-weight:850;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-note-persona em {
  color:var(--reader-muted);
  font-size:12px;
  font-style:normal;
  font-weight:700
}
.reader-note-quote {
  display:block;
  width:100%;
  margin-top:10px;
  padding:9px 11px;
  border:0;
  border-left:3px solid rgba(199,164,94,.72);
  border-radius:4px 10px 10px 4px;
  background:var(--app-reader-note-quote-bg);
  color:var(--app-reader-note-quote-text);
  font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif);
  font-size:12px;
  font-style:italic;
  font-weight:600;
  line-height:1.45;
  text-align:left;
  text-decoration:none
}
.reader-note-primary-comment {
  margin-top:11px;
  color:var(--app-reader-note-quote-text);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-note-primary-comment .reader-markdown,.reader-note-primary-comment .reader-markdown p {
  font-size:13px;
  font-weight:760;
  line-height:1.62
}
.reader-comments {
  display:grid;
  gap:12px;
  margin-top:14px
}
.reader-comment {
  grid-template-columns:32px minmax(0,1fr);
  gap:10px;
  margin-top:0
}
.reader-comment .reader-avatar-badge {
  width:30px;
  height:30px
}
.reader-note-anchor .reader-avatar-badge,.reader-comment .reader-avatar-badge,.reader-agent-menu .reader-avatar-badge,.reader-agent-annotate-menu .reader-avatar-badge,.reader-virtual-label .reader-avatar-badge {
  display:grid;
  place-items:center;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-green);
  color:white;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:800;
  padding:0;
  margin:0
}
.reader-avatar-badge.is-image {
  background:transparent;
  color:inherit
}
.reader-avatar-badge img {
  width:100%;
  height:100%;
  object-fit:cover;
  border-radius:999px
}
.reader-avatar-badge.is-svg img {
  object-fit:contain
}
.reader-agent-menu {
  z-index:12;
  gap:3px;
  max-height:min(320px,calc(var(--app-viewport-height) - 40px));
  overflow:auto;
  padding:6px;
  border-radius:12px;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:12px;
  line-height:1.2
}
.reader-agent-menu button {
  grid-template-columns:24px minmax(0,1fr);
  min-height:34px;
  gap:7px;
  border-radius:9px;
  color:var(--reader-ink);
  font:inherit;
  padding:5px 6px
}
.reader-agent-menu button.is-active {
  background:var(--reader-paper-hover)
}
.reader-agent-menu .reader-avatar-badge {
  width:24px;
  height:24px
}
.reader-agent-menu strong {
  overflow:hidden;
  font-size:12px;
  font-weight:850;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-agent-menu em {
  overflow:hidden;
  font-size:11px;
  font-style:normal;
  font-weight:700;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-highlight.is-temporary {
  background:rgba(77,155,114,.14);
  box-shadow:0 0 0 1px rgba(77,155,114,.2)
}
.reader-highlight.is-agent-theater {
  background:rgba(77,155,114,.18);
  box-shadow:0 0 0 1px rgba(77,155,114,.22)
}
.reader-highlight.is-search {
  background:var(--reader-search-highlight);
  box-shadow:0 0 0 1px color-mix(in srgb,var(--reader-green) 30%,transparent);
  pointer-events:none
}
.reader-selection-menu {
  display:inline-flex;
  align-items:center;
  gap:5px;
  width:max-content;
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:999px;
  background:var(--reader-paper);
  box-shadow:var(--app-reader-selection-menu-shadow);
  backdrop-filter:blur(18px);
  padding:6px;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-selection-menu>button {
  justify-content:flex-start;
  color:var(--reader-ink);
  gap:6px
}
.reader-selection-primary {
  height:36px;
  border:1px solid var(--reader-ink-hairline);
  background:var(--reader-paper);
  box-shadow:0 3px 10px color-mix(in srgb,var(--reader-ink) 5%,transparent);
  font-size:13px
}
.reader-selection-primary:hover {
  border-color:color-mix(in srgb,var(--reader-ink) 18%,transparent);
  background:var(--reader-paper-hover);
  color:var(--reader-ink)
}
.reader-selection-primary.is-copied {
  border-color:color-mix(in srgb,var(--reader-green) 34%,transparent);
  background:color-mix(in srgb,var(--reader-green) 10%,var(--reader-paper));
  color:var(--reader-green)
}
.reader-selection-copy-shortcut.is-hidden {
  opacity:0
}
.reader-selection-agent-actions {
  display:grid;
  gap:8px;
  min-width:0;
  border-top:1px solid var(--reader-ink-subtle);
  padding-top:10px
}
.reader-selection-heading {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  color:var(--reader-muted);
  font-size:11px;
  font-weight:850;
  line-height:1
}
.reader-selection-heading span {
  letter-spacing:.04em
}
.reader-selection-heading em {
  color:var(--reader-muted);
  font-style:normal;
  font-weight:760
}
.reader-selection-action-grid {
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:6px
}
.reader-selection-action-grid button {
  width:100%;
  min-width:0;
  height:36px;
  border:1px solid var(--reader-ink-subtle);
  border-radius:12px;
  background:var(--reader-paper);
  color:var(--reader-muted);
  padding:0 8px;
  transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,color .14s ease,transform .14s ease
}
.reader-selection-action-grid button strong {
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-size:12px;
  font-weight:900
}
.reader-selection-action-grid button:hover,.reader-selection-action-grid button.is-active {
  border-color:rgba(159,91,80,.18);
  background:rgba(159,91,80,.07);
  box-shadow:0 4px 12px color-mix(in srgb,var(--reader-ink) 5%,transparent);
  color:var(--reader-red)
}
.reader-selection-action-grid button:active {
  transform:scale(.96)
}
.reader-selection-action-grid button:disabled {
  cursor:not-allowed;
  opacity:.42
}
.reader-selection-agent-list {
  display:grid;
  gap:5px;
  padding:8px;
  border-radius:14px;
  background:var(--reader-paper-panel);
  color:var(--reader-ink)
}
.reader-selection-agent-list strong {
  font-size:12px;
  font-weight:900
}
.reader-selection-agent-list button {
  display:grid;
  grid-template-columns:24px minmax(0,1fr);
  justify-content:initial;
  width:100%;
  height:34px;
  color:var(--reader-ink);
  padding:0 8px;
  text-align:left
}
.reader-selection-agent-list button:hover {
  background:var(--reader-paper-hover)
}
.reader-selection-agent-list .reader-avatar-badge {
  width:24px;
  height:24px
}`;
