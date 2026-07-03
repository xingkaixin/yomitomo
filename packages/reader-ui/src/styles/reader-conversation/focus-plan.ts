export const focusPlanStyles = `.reader-focus-toolbar {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:12px;
  margin:8px 0 14px;
  padding:10px 12px;
  border-radius:14px;
  background:var(--reader-paper-panel);
  box-shadow:inset 0 0 0 1px var(--reader-ink-hairline)
}
.reader-focus-agent-picker {
  display:flex;
  min-width:0;
  flex-wrap:wrap;
  align-items:center;
  gap:7px
}
.reader-agent-annotate-menu .reader-focus-agent-chip,.reader-agent-annotate-menu .reader-focus-assigned-chip {
  display:inline-flex;
  width:auto;
  height:34px;
  grid-template-columns:none;
  align-items:center;
  justify-content:center;
  gap:7px;
  border:1px solid var(--reader-ink-subtle);
  border-radius:999px;
  background:var(--reader-paper);
  color:var(--reader-ink);
  font:inherit;
  font-size:12px;
  font-weight:860;
  padding:0 10px 0 4px;
  transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease
}
.reader-agent-annotate-menu .reader-focus-agent-chip:hover,.reader-agent-annotate-menu .reader-focus-assigned-chip:hover {
  border-color:color-mix(in srgb,var(--reader-ink) 18%,transparent);
  background:var(--reader-paper-panel);
  box-shadow:0 5px 14px color-mix(in srgb,var(--reader-ink) 5%,transparent)
}
.reader-agent-annotate-menu .reader-focus-agent-chip:active,.reader-agent-annotate-menu .reader-focus-assigned-chip:active {
  transform:scale(.97)
}
.reader-focus-agent-chip .reader-avatar-badge,.reader-focus-assigned-chip .reader-avatar-badge {
  width:26px;
  height:26px
}
.reader-focus-agent-chip strong,.reader-focus-assigned-chip strong {
  max-width:96px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-focus-agent-chip svg,.reader-focus-assigned-chip svg {
  color:#75695d
}
.reader-focus-add-wrap {
  position:relative;
  display:inline-flex;
  flex:0 0 auto
}
.reader-agent-annotate-menu .reader-focus-add {
  display:inline-flex;
  width:auto;
  height:34px;
  grid-template-columns:none;
  align-items:center;
  justify-content:center;
  gap:7px;
  border:1px dashed rgba(40,35,29,.24);
  border-radius:999px;
  background:var(--reader-paper);
  color:var(--reader-ink);
  font:inherit;
  font-size:12px;
  font-weight:860;
  padding:0 12px;
  white-space:nowrap;
  transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease
}
.reader-agent-annotate-menu .reader-focus-add:hover {
  border-color:rgba(40,35,29,.34);
  background:var(--reader-paper-panel);
  box-shadow:0 5px 14px color-mix(in srgb,var(--reader-ink) 6%,transparent)
}
.reader-agent-annotate-menu .reader-focus-add:active {
  transform:scale(.97)
}
.reader-focus-add svg {
  color:#6f665d
}
.reader-focus-add-menu {
  position:absolute;
  left:0;
  top:calc(100% + 8px);
  z-index:8;
  display:grid;
  gap:4px;
  width:220px;
  max-height:260px;
  overflow:auto;
  padding:8px;
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:14px;
  background:var(--reader-paper);
  box-shadow:var(--reader-elevated-shadow)
}
.reader-agent-annotate-menu .reader-focus-add-menu button {
  display:grid;
  width:100%;
  height:38px;
  grid-template-columns:28px minmax(0,1fr);
  align-items:center;
  gap:8px;
  border:0;
  border-radius:10px;
  background:transparent;
  color:var(--reader-ink);
  font:inherit;
  padding:0 8px;
  text-align:left;
  transition:background .14s ease
}
.reader-agent-annotate-menu .reader-focus-add-menu button:hover {
  background:var(--reader-paper-hover)
}
.reader-focus-add-menu .reader-avatar-badge {
  width:26px;
  height:26px
}
.reader-focus-add-menu strong {
  overflow:hidden;
  font-size:12px;
  font-weight:860;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-focus-add-menu>em {
  padding:8px;
  color:var(--reader-muted);
  font-size:12px;
  font-style:normal;
  font-weight:780
}
.reader-focus-actions {
  display:inline-flex;
  align-items:center;
  justify-content:flex-end;
  gap:8px
}
.reader-agent-annotate-menu .reader-focus-clear {
  display:inline-flex;
  width:auto;
  height:38px;
  grid-template-columns:none;
  align-items:center;
  justify-content:center;
  gap:6px;
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:999px;
  background:var(--reader-paper);
  color:var(--reader-muted);
  font:inherit;
  font-size:12px;
  font-weight:860;
  padding:0 12px;
  white-space:nowrap;
  transition:background .14s ease,border-color .14s ease,color .14s ease,transform .14s ease
}
.reader-agent-annotate-menu .reader-focus-clear:hover:not(:disabled) {
  border-color:rgba(159,91,80,.22);
  background:color-mix(in srgb,var(--reader-red) 8%,var(--reader-paper));
  color:var(--reader-red)
}
.reader-agent-annotate-menu .reader-focus-clear:active:not(:disabled) {
  transform:scale(.96)
}
.reader-agent-annotate-menu .reader-focus-clear:disabled {
  cursor:not-allowed;
  opacity:.42
}
.reader-agent-annotate-menu .reader-focus-plan {
  display:inline-flex;
  width:auto;
  height:38px;
  grid-template-columns:none;
  align-items:center;
  justify-content:center;
  gap:7px;
  border:0;
  border-radius:999px;
  background:var(--reader-ink);
  color:#fff;
  font:inherit;
  font-size:12px;
  font-weight:900;
  padding:0 14px;
  white-space:nowrap;
  transition:background .14s ease,box-shadow .14s ease,transform .14s ease
}
.reader-agent-annotate-menu .reader-focus-plan:hover:not(:disabled) {
  background:color-mix(in srgb,var(--reader-ink) 88%,var(--reader-paper));
  box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 16%,transparent)
}
.reader-agent-annotate-menu .reader-focus-plan:active:not(:disabled) {
  transform:scale(.96)
}
.reader-agent-annotate-menu .reader-focus-plan:disabled {
  background:var(--reader-paper-hover);
  color:#8a8a85;
  cursor:not-allowed;
  box-shadow:none;
  opacity:1
}
.reader-focus-progress {
  display:grid;
  gap:8px;
  margin:-4px 0 14px;
  padding:10px 12px;
  border:1px solid var(--reader-ink-subtle);
  border-radius:14px;
  background:var(--reader-paper)
}
.reader-focus-progress>div {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  color:var(--reader-muted);
  font-size:12px;
  font-weight:850
}
.reader-focus-progress strong {
  color:var(--reader-ink);
  font-size:12px
}
.reader-focus-progress>i {
  display:block;
  height:7px;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-paper-hover)
}
.reader-focus-progress>i>b {
  display:block;
  height:100%;
  border-radius:inherit;
  background:linear-gradient(90deg,var(--reader-ink),var(--reader-review-challenge-fg),var(--reader-yellow-strong));
  transition:width .34s cubic-bezier(.22,1,.36,1)
}
.reader-focus-card-list {
  display:grid;
  align-content:start;
  gap:10px;
  min-height:0;
  overflow:auto;
  padding:2px 4px 4px
}
.reader-agent-annotate-menu:has(.reader-focus-agent-menu),.reader-focus-card-list:has(.reader-focus-agent-menu),.reader-focus-section-card:has(.reader-focus-agent-menu) {
  overflow:visible
}
.reader-focus-section-card:has(.reader-focus-agent-menu) {
  position:relative;
  z-index:12
}
.reader-focus-section-card {
  border:1px solid var(--reader-ink-subtle);
  border-radius:16px;
  background:var(--reader-paper);
  box-shadow:0 8px 24px color-mix(in srgb,var(--reader-ink) 5%,transparent);
  overflow:visible
}
.reader-focus-section-card.is-open {
  border-color:rgba(40,35,29,.16);
  box-shadow:0 12px 30px color-mix(in srgb,var(--reader-ink) 8%,transparent)
}
.reader-agent-annotate-menu .reader-focus-card-summary {
  display:grid;
  width:100%;
  min-height:64px;
  grid-template-columns:42px minmax(0,1fr) minmax(120px,auto) 24px;
  align-items:center;
  gap:10px;
  border:0;
  border-radius:16px;
  background:transparent;
  color:var(--reader-ink);
  font:inherit;
  padding:11px 14px;
  text-align:left;
  transition:background .14s ease
}
.reader-agent-annotate-menu .reader-focus-card-summary:hover {
  background:var(--reader-focus-card-hover-bg)
}
.reader-focus-card-summary>b {
  display:grid;
  width:32px;
  height:32px;
  place-items:center;
  border-radius:999px;
  background:var(--reader-focus-card-icon-bg);
  color:var(--reader-focus-card-icon-fg);
  font-size:12px;
  font-weight:950
}
.reader-focus-section-card.is-open .reader-focus-card-summary>b {
  background:var(--reader-ink);
  color:var(--reader-focus-card-active-icon-fg)
}
.reader-focus-card-copy {
  display:grid;
  gap:4px;
  min-width:0
}
.reader-focus-card-title {
  display:flex;
  min-width:0;
  align-items:center;
  gap:8px
}
.reader-focus-card-copy strong {
  overflow:hidden;
  font-size:15px;
  font-weight:920;
  line-height:1.2;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-focus-card-title>em {
  max-width:92px;
  overflow:hidden;
  border-radius:999px;
  background:rgba(159,91,80,.08);
  color:var(--reader-red);
  flex:0 0 auto;
  font-size:11px;
  font-style:normal;
  font-weight:850;
  padding:4px 8px;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-focus-card-copy small {
  overflow:hidden;
  color:var(--reader-muted);
  font-size:12px;
  font-weight:720;
  line-height:1.35;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-focus-card-agents {
  display:flex;
  min-width:0;
  max-width:220px;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  overflow:visible
}
.reader-agent-avatar-stack {
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
  box-shadow:0 2px 7px rgba(40,35,29,.12);
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
  box-shadow:0 8px 18px rgba(40,35,29,.16)
}
.reader-agent-avatar-stack-item:focus-visible,.reader-agent-avatar-stack-item.is-revealed {
  transform:translateY(-4px) scale(1.12)
}
.reader-agent-avatar-stack-item.is-active {
  box-shadow:0 0 0 2px rgba(37,29,22,.16),0 2px 7px rgba(40,35,29,.12)
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
}
.reader-focus-avatar-stack {
  justify-content:flex-end
}
.reader-focus-avatar-stack-item {
  width:28px;
  height:28px
}
.reader-focus-avatar-stack-item .reader-avatar-badge {
  width:24px;
  height:24px
}
.reader-focus-card-agents small {
  color:var(--reader-muted);
  font-size:12px;
  font-weight:780;
  white-space:nowrap
}
.reader-focus-card-agents .reader-focus-message-count {
  border-radius:999px;
  background:var(--reader-paper-hover);
  color:var(--reader-muted);
  padding:6px 8px
}
.reader-focus-card-summary>svg {
  justify-self:end;
  color:#75695d
}
.reader-focus-card-body {
  display:grid;
  gap:13px;
  padding:0 18px 17px 66px
}
.reader-focus-card-section {
  display:grid;
  gap:8px;
  padding-top:13px;
  border-top:1px solid rgba(40,35,29,.08)
}
.reader-focus-card-section>strong {
  color:#5a5148;
  font-size:12px;
  font-weight:900
}
.reader-focus-assigned-list {
  display:flex;
  min-width:0;
  flex-wrap:wrap;
  align-items:center;
  gap:9px
}
.reader-focus-messages {
  display:grid;
  align-content:start;
  gap:8px;
  min-height:0
}
.reader-focus-message {
  display:grid;
  grid-template-columns:18px minmax(0,1fr) 28px;
  align-items:start;
  gap:8px;
  padding:10px 9px;
  border-radius:12px;
  background:var(--reader-paper-panel);
  color:var(--reader-ink)
}
.reader-focus-message>svg {
  margin-top:2px;
  color:var(--reader-red)
}
.reader-focus-message-body {
  display:grid;
  gap:7px;
  min-width:0
}
.reader-focus-message p {
  margin:0;
  color:var(--app-reader-chat-context-fg);
  font-size:13px;
  font-weight:720;
  line-height:1.5;
  overflow-wrap:anywhere
}
.reader-focus-message-targets {
  display:flex;
  min-width:0;
  flex-wrap:wrap;
  gap:5px
}
.reader-focus-message-targets>em {
  border-radius:999px;
  background:rgba(159,91,80,.08);
  color:var(--reader-red);
  font-size:11px;
  font-style:normal;
  font-weight:850;
  padding:4px 7px;
  white-space:nowrap
}
.reader-agent-annotate-menu .reader-focus-message button {
  display:grid;
  width:28px;
  height:28px;
  grid-template-columns:none;
  place-items:center;
  border:0;
  border-radius:999px;
  background:transparent;
  color:var(--reader-muted);
  padding:0
}
.reader-agent-annotate-menu .reader-focus-message button:hover {
  background:var(--reader-ink-hairline);
  color:var(--reader-ink)
}
.reader-focus-message-input {
  display:grid;
  gap:8px
}
.reader-focus-message-input:has(.reader-focus-agent-menu) {
  position:relative;
  z-index:30;
  overflow:visible
}
.reader-focus-message-box {
  position:relative
}
.reader-focus-message-box:has(.reader-focus-agent-menu) {
  z-index:1
}
.reader-focus-message-input textarea {
  width:100%;
  min-height:72px;
  resize:vertical;
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:14px;
  background:var(--reader-paper);
  color:var(--reader-ink);
  font:inherit;
  font-size:13px;
  line-height:1.55;
  padding:11px 12px
}
.reader-focus-message-input textarea:focus,.reader-focus-message-input textarea:focus-visible {
  outline:0;
  border-color:rgba(40,35,29,.24);
  box-shadow:none
}
.reader-focus-message-footer {
  display:flex;
  min-width:0;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  overflow:visible
}
.reader-agent-annotate-menu .reader-focus-message-footer>button {
  display:inline-flex;
  width:auto;
  height:40px;
  grid-template-columns:none;
  align-items:center;
  justify-content:center;
  gap:7px;
  border:0;
  border-radius:999px;
  background:var(--reader-paper-hover);
  color:var(--reader-ink);
  font:inherit;
  font-size:12px;
  font-weight:850;
  padding:0 13px;
  white-space:nowrap
}
.reader-agent-annotate-menu .reader-focus-message-footer>button:hover:not(:disabled) {
  background:#dededb
}
.reader-focus-message-agents {
  position:relative;
  display:flex;
  min-width:0;
  flex:1 1 auto;
  align-items:center;
  gap:7px;
  overflow:visible;
  color:var(--reader-muted);
  font-size:11px;
  font-weight:780
}
.reader-focus-message-agents small {
  font-size:11px;
  font-weight:780
}
.reader-agent-annotate-menu .reader-focus-message-agents .reader-agent-avatar-stack-item {
  width:30px;
  height:30px;
  border-color:var(--reader-paper);
  background:var(--reader-paper)
}
.reader-agent-annotate-menu .reader-focus-message-agents .reader-agent-avatar-stack-item:hover {
  background:var(--reader-paper)
}
.reader-focus-message-agents .reader-avatar-badge {
  width:26px;
  height:26px
}
.reader-focus-agent-menu {
  right:auto;
  bottom:calc(100% + 8px);
  z-index:24;
  width:176px;
  max-width:min(176px,calc(100% - 16px));
  border-color:rgba(40,35,29,.16);
  background:var(--reader-paper);
  box-shadow:0 18px 44px rgba(40,35,29,.18),0 3px 10px rgba(40,35,29,.08)
}
.reader-agent-annotate-menu .reader-focus-agent-menu button {
  min-height:36px
}
.reader-focus-empty {
  display:grid;
  min-height:220px;
  place-items:center;
  border:1px dashed color-mix(in srgb,var(--reader-ink) 14%,transparent);
  border-radius:16px;
  color:var(--reader-muted);
  font-size:13px;
  font-weight:760
}
.reader-plan-footer {
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:14px;
  padding-top:14px
}
.reader-plan-add {
  position:relative
}
.reader-agent-annotate-menu .reader-plan-add>button {
  display:inline-flex;
  width:auto;
  height:40px;
  grid-template-columns:none;
  align-items:center;
  justify-content:center;
  gap:7px;
  border:1px dashed rgba(40,35,29,.2);
  border-radius:999px;
  background:var(--reader-paper);
  color:var(--reader-ink);
  font:inherit;
  font-size:12px;
  font-weight:850;
  padding:0 14px;
  transition:background .14s ease,border-color .14s ease,transform .14s ease
}
.reader-agent-annotate-menu .reader-plan-add>button:hover {
  border-color:rgba(40,35,29,.28);
  background:var(--reader-paper-hover)
}
.reader-agent-annotate-menu .reader-plan-add>button:active:not(:disabled) {
  transform:scale(.96)
}
.reader-agent-annotate-menu .reader-plan-add>button:disabled {
  cursor:not-allowed;
  opacity:.44
}
.reader-plan-add-menu {
  position:absolute;
  left:0;
  bottom:calc(100% + 8px);
  z-index:3;
  display:grid;
  gap:4px;
  width:220px;
  padding:8px;
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:14px;
  background:var(--reader-paper);
  box-shadow:var(--reader-elevated-shadow)
}
.reader-agent-annotate-menu .reader-plan-add-menu button {
  display:grid;
  width:100%;
  height:38px;
  grid-template-columns:28px minmax(0,1fr);
  align-items:center;
  gap:8px;
  border:0;
  border-radius:10px;
  background:transparent;
  color:var(--reader-ink);
  font:inherit;
  padding:0 8px;
  text-align:left
}
.reader-agent-annotate-menu .reader-plan-add-menu button:hover {
  background:var(--app-reader-toolbar-control-hover-bg)
}
.reader-plan-add-menu .reader-avatar-badge {
  width:26px;
  height:26px
}
.reader-agent-annotate-menu .reader-plan-add-menu button>span:not(.reader-avatar-badge) {
  display:block;
  width:auto;
  height:auto;
  min-width:0;
  margin:0;
  overflow:hidden;
  border-radius:0;
  background:transparent;
  color:var(--reader-ink);
  font-size:12px;
  font-weight:850;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-plan-help {
  margin:0;
  color:var(--reader-muted);
  font-size:12px;
  font-weight:760;
  line-height:1.45;
  text-align:center
}
.reader-plan-footer .reader-agent-annotate-actions {
  margin:0;
  padding:0;
  border:0
}
@media(max-width:860px) {
  .reader-focus-toolbar {
    grid-template-columns:1fr
  }
  .reader-focus-plan {
    justify-self:end
  }
  .reader-agent-annotate-menu .reader-focus-card-summary {
    grid-template-columns:38px minmax(0,1fr) 24px
  }
  .reader-focus-card-agents {
    grid-column:2/-1;
    justify-content:flex-start
  }
  .reader-focus-card-body {
    padding-left:16px
  }
  .reader-focus-message-footer {
    align-items:flex-start;
    flex-direction:column
  }
  .reader-plan-footer {
    grid-template-columns:1fr
  }
  .reader-plan-footer .reader-agent-annotate-actions {
    justify-content:flex-end
  }
}`;
