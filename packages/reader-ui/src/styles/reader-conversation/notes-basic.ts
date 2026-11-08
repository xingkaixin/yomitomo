export const notesBasicStyles = `.reader-note {
  scroll-margin-top:86px;
  border:1px solid var(--reader-ink-subtle);
  border-radius:18px;
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
  background:var(--app-reader-accent-a16);
  box-shadow:inset 0 0 0 1px var(--app-reader-ink-a4);
  color:var(--reader-yellow-strong)
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
  box-shadow:0 0 0 1px var(--app-reader-ink-a6),0 8px 20px var(--app-reader-ink-a6)
}
.reader-empty-line {
  position:relative;
  display:block;
  height:7px;
  overflow:hidden;
  border-radius:999px;
  background:var(--app-reader-muted-a12)
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
  background:var(--reader-yellow-strong)
}
.reader-empty-gesture-arrow {
  width:9px;
  height:9px;
  border-right:2px solid var(--app-reader-muted-a48);
  border-bottom:2px solid var(--app-reader-muted-a48);
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
.reader-note-quote {
  margin-top:10px;
  border-radius:4px 10px 10px 4px;
  font-size:12px;
  font-style:italic;
  font-weight:600;
  line-height:1.45
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
.reader-comment .reader-avatar-badge,
.reader-agent-menu .reader-avatar-badge {
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
  box-shadow:0 3px 10px var(--app-reader-ink-a4);
  font-size:13px
}
.reader-selection-primary:hover {
  border-color:var(--app-reader-ink-a16);
  background:var(--reader-paper-hover);
  color:var(--reader-ink)
}
.reader-selection-primary.is-copied {
  border-color:var(--app-reader-primary-a32);
  background:var(--app-reader-primary-a8);
  color:var(--reader-green)
}`;
