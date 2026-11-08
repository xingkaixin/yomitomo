export const focusPlanStyles = `.reader-agent-avatar-stack {
  display:inline-flex;
  min-width:0;
  align-items:center;
  justify-content:flex-end;
  overflow:visible;
  padding:6px 0
}
.reader-agent-avatar-stack-item {
  position:relative;
  display:grid;
  flex:0 0 auto;
  width:28px;
  min-width:28px;
  max-width:28px;
  height:28px;
  place-items:center;
  margin-left:-8px;
  appearance:none;
  border:2px solid var(--reader-paper);
  border-radius:999px;
  background:var(--reader-paper);
  box-shadow:0 2px 7px var(--app-shadow-a12);
  color:inherit;
  line-height:1;
  padding:0;
  overflow:visible;
  transform:translateY(var(--avatar-shift,0px)) scale(var(--avatar-scale-active,1));
  transform-origin:center;
  transition:transform var(--avatar-dur,320ms) var(--avatar-ease-in,cubic-bezier(.22,1,.36,1)),box-shadow .16s ease,z-index .16s ease;
  will-change:transform
}
.reader-agent-avatar-stack-item:first-child {
  margin-left:0
}
.reader-agent-avatar-stack-item:hover,.reader-agent-avatar-stack-item:focus-visible,.reader-agent-avatar-stack-item.is-revealed {
  z-index:2;
  box-shadow:0 8px 18px var(--app-shadow-a16)
}
.reader-agent-avatar-stack-item:focus-visible,.reader-agent-avatar-stack-item.is-revealed {
  transform:translateY(-4px) scale(1.12)
}
.reader-agent-avatar-stack-item.is-active {
  box-shadow:0 0 0 2px var(--app-reader-ink-a16),0 2px 7px var(--app-shadow-a12)
}
.reader-agent-avatar-stack-item .reader-avatar-badge {
  width:24px;
  height:24px
}
.reader-agent-avatar-stack-label {
  position:absolute;
  left:50%;
  bottom:calc(100% + 8px);
  z-index:3;
  display:block;
  max-width:132px;
  overflow:hidden;
  transform:translateX(-50%);
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:10px;
  background:var(--reader-paper);
  box-shadow:var(--reader-soft-shadow);
  color:var(--reader-ink);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size:11px;
  font-weight:850;
  line-height:1.25;
  padding:7px 8px;
  text-align:center;
  text-overflow:ellipsis;
  white-space:nowrap
}
@media (prefers-reduced-motion:reduce) {
  .reader-agent-avatar-stack-item {
    transition:none!important;
    transform:none!important;
    will-change:auto
  }
}`;
