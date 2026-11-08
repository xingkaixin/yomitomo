export const chatAgentStyles = `.reader-chat-fab {
  position:fixed;
  right:22px;
  bottom:22px;
  z-index:var(--reader-z-popover);
  --reader-chat-fab-return-dur:250ms;
  display:grid;
  width:46px;
  height:46px;
  place-items:center;
  border:1px solid var(--app-reader-chat-panel-border);
  border-radius:14px;
  background:var(--app-reader-chat-panel-bg);
  box-shadow:var(--app-reader-chat-panel-shadow);
  color:var(--reader-ink);
  transform-origin:center;
  transition:background .16s ease,border-color .16s ease,box-shadow .16s ease,transform .14s ease
}
.reader-chat-fab:hover {
  border-color:var(--app-reader-composer-border);
  background:var(--app-reader-composer-bg);
  box-shadow:var(--app-reader-chat-panel-shadow)
}
.reader-chat-fab:active {
  transform:scale(.96)
}
.reader-chat-fab.is-returning {
  animation:reader-chat-fab-return var(--reader-chat-fab-return-dur) cubic-bezier(.22,1,.36,1) both
}
.reader-chat-fab-shortcut {
  position:absolute;
  right:-5px;
  top:-6px;
  display:grid;
  min-width:19px;
  height:19px;
  place-items:center;
  border-radius:999px;
  background:var(--reader-ink);
  box-shadow:0 6px 14px var(--app-reader-ink-a20),0 0 0 2px var(--app-reader-chat-panel-bg);
  color:var(--reader-paper);
  font-family:var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  font-size:9px;
  font-weight:850;
  line-height:1;
  padding:0 5px
}
.reader-chat-panel {
  position:fixed;
  right:22px;
  bottom:22px;
  z-index:var(--reader-z-panel);
  --reader-chat-open-dur:250ms;
  --reader-chat-close-dur:150ms;
  --reader-chat-motion-ease:cubic-bezier(.22,1,.36,1);
  --reader-chat-motion-slide:16px;
  --reader-chat-motion-scale:.98;
  display:grid;
  grid-template-rows:auto minmax(0,1fr) auto;
  width:var(--reader-chat-panel-width,min(410px,calc(100vw - 32px)));
  height:var(--reader-chat-panel-height,min(640px,calc(var(--app-viewport-height) - 112px)));
  max-width:calc(100vw - 32px);
  max-height:calc(var(--app-viewport-height) - 112px);
  overflow:hidden;
  border:1px solid var(--app-reader-chat-panel-border);
  border-radius:18px;
  background:var(--app-reader-chat-panel-bg);
  box-shadow:var(--app-reader-chat-panel-shadow);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  color:var(--reader-ink);
  opacity:1;
  transform:translateX(0) scale(var(--reader-chat-resize-scale-x,1),var(--reader-chat-resize-scale-y,1));
  transform-origin:100% 100%;
  transition:opacity var(--reader-chat-open-dur) var(--reader-chat-motion-ease),
    transform var(--reader-chat-open-dur) var(--reader-chat-motion-ease)
}
.reader-chat-panel.is-opening,.reader-chat-panel.is-closing {
  opacity:0;
  transform:translateX(var(--reader-chat-motion-slide)) scale(var(--reader-chat-motion-scale));
  pointer-events:none
}
.reader-chat-panel.is-closing {
  z-index:calc(var(--reader-z-popover) - 1);
  transition-duration:var(--reader-chat-close-dur),var(--reader-chat-close-dur)
}
.reader-chat-panel[data-activation-source="keyboard"] {
  transition:none
}
.reader-chat-panel.is-resizing {
  box-shadow:0 22px 58px var(--app-reader-ink-a16),0 8px 18px var(--app-reader-ink-a8);
  transition:box-shadow 140ms ease
}
@keyframes reader-chat-fab-return {
  0% {
    transform:scale(.92,1.08)
  }
  46% {
    transform:scale(1.08,.94)
  }
  72% {
    transform:scale(.98,1.03)
  }
  100% {
    transform:scale(1)
  }
}
@media (prefers-reduced-motion:reduce) {
  .reader-chat-fab.is-returning {
    animation:none!important;
    transform:none!important
  }
  .reader-chat-panel {
    transform:none!important;
    transition:none!important
  }
}
.reader-chat-resize-handle {
  position:absolute;
  z-index:2;
  background:transparent;
  touch-action:none
}
.reader-chat-resize-handle.is-left {
  left:0;
  top:18px;
  bottom:18px;
  width:8px;
  cursor:ew-resize
}
.reader-chat-resize-handle.is-top {
  top:0;
  left:18px;
  right:18px;
  height:8px;
  cursor:ns-resize
}
.reader-chat-resize-handle.is-top-left {
  top:0;
  left:0;
  width:24px;
  height:24px;
  cursor:nwse-resize
}
.reader-chat-header {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  padding:14px 14px 10px
}
.reader-chat-header>div {
  display:grid;
  gap:3px;
  min-width:0
}
.reader-chat-header strong {
  font-size:14px;
  font-weight:930;
  line-height:1.15
}
.reader-chat-header-actions {
  display:inline-flex;
  align-items:center;
  gap:4px
}
.reader-chat-header button {
  display:grid;
  width:34px;
  height:34px;
  place-items:center;
  border:0;
  border-radius:10px;
  background:transparent;
  color:var(--reader-muted);
  padding:0;
  transition:background .14s ease,color .14s ease,transform .14s ease
}
.reader-chat-header button:hover {
  background:var(--app-reader-toolbar-control-hover-bg);
  color:var(--reader-ink)
}
.reader-chat-header button:active {
  transform:scale(.96)
}
.reader-chat-context {
  display:grid;
  gap:7px;
  margin:0 0 9px;
  padding:10px;
  border-radius:12px;
  background:var(--app-reader-chat-context-bg);
  box-shadow:inset 0 0 0 1px var(--app-reader-chat-context-border)
}
.reader-chat-context-jump {
  justify-self:start;
  max-width:100%;
  overflow:hidden;
  border:0;
  background:transparent;
  color:var(--app-reader-chat-context-fg);
  font:inherit;
  font-size:11px;
  font-weight:850;
  padding:0;
  text-align:left;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-chat-context-jump:not(:disabled) {
  cursor:pointer
}
.reader-chat-context-jump:not(:disabled):hover {
  color:var(--reader-ink);
  text-decoration:underline;
  text-underline-offset:2px
}
.reader-chat-context-jump:disabled {
  cursor:default
}
.reader-chat-context blockquote {
  max-height:84px;
  overflow:auto;
  margin:0;
  color:var(--app-reader-chat-context-fg);
  font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif);
  font-size:13px;
  font-weight:650;
  line-height:1.48
}
.reader-chat-context button {
  justify-self:start;
  border:0;
  border-radius:999px;
  background:var(--app-reader-toolbar-control-bg);
  color:var(--reader-muted);
  font:inherit;
  font-size:11px;
  font-weight:820;
  padding:5px 9px;
  transition:background .14s ease,color .14s ease,transform .14s ease
}
.reader-chat-context button:hover {
  background:var(--app-reader-toolbar-control-hover-bg);
  color:var(--reader-ink)
}
.reader-chat-context button:active {
  transform:scale(.96)
}
.reader-chat-messages {
  display:grid;
  align-content:start;
  gap:11px;
  min-height:180px;
  overflow:auto;
  padding:4px 14px 12px
}
.reader-chat-message {
  display:grid;
  grid-template-columns:28px minmax(0,1fr);
  gap:8px;
  max-width:94%;
  min-width:0;
  align-items:start;
  font-size:13px;
  line-height:1.55
}
.reader-chat-message>.reader-avatar-badge {
  width:28px;
  height:28px;
  box-shadow:0 2px 7px var(--app-reader-ink-a12)
}
.reader-chat-message p {
  margin:0;
  white-space:pre-wrap
}
.reader-chat-message.is-user {
  display:block;
  justify-self:end
}
.reader-chat-message.is-user .reader-chat-message-bubble {
  border-bottom-right-radius:6px;
  background:var(--app-reader-chat-user-bubble-bg);
  color:var(--app-reader-chat-user-bubble-fg)
}
.reader-chat-message.is-assistant {
  justify-self:start
}
.reader-chat-message.is-assistant .reader-chat-message-bubble {
  max-width:100%;
  border-bottom-left-radius:6px;
  background:var(--app-reader-chat-assistant-bubble-bg);
  color:var(--app-reader-chat-assistant-bubble-fg)
}
.reader-chat-message-bubble {
  display:grid;
  gap:6px;
  min-width:0;
  max-width:100%;
  overflow:hidden;
  overflow-wrap:anywhere;
  word-break:break-word;
  padding:9px 11px;
  border-radius:14px
}
.reader-chat-message-bubble header {
  display:flex;
  min-width:0;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  color:inherit;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-chat-message-bubble strong {
  min-width:0;
  overflow:hidden;
  font-size:11px;
  font-weight:900;
  line-height:1.2;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-chat-message-bubble time {
  flex:0 0 auto;
  color:inherit;
  font-size:10px;
  font-weight:760;
  font-variant-numeric:tabular-nums;
  opacity:.58
}
.reader-chat-message-context {
  display:block;
  max-height:42px;
  overflow:hidden;
  border:0;
  border-left:3px solid currentColor;
  background:transparent;
  color:inherit;
  font:inherit;
  font-size:11px;
  font-weight:760;
  line-height:1.35;
  opacity:.62;
  padding:0 0 0 7px;
  text-align:left
}
.reader-chat-message-context:not(:disabled) {
  cursor:pointer
}
.reader-chat-message-context:not(:disabled):hover {
  opacity:.82;
  text-decoration:underline;
  text-underline-offset:2px
}
.reader-chat-message-context:disabled {
  cursor:default
}
.reader-chat-message-steps {
  display:flex;
  flex-wrap:wrap;
  gap:4px;
  margin:0;
  padding:0;
  list-style:none;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-chat-message-steps li {
  display:inline-flex;
  min-width:0;
  max-width:100%;
  align-items:center;
  gap:3px;
  border:1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius:999px;
  padding:1px 6px;
  font-size:10px;
  font-weight:700;
  line-height:1.4;
  opacity:.68
}
.reader-chat-message-steps li span {
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-chat-message-steps svg {
  flex:0 0 auto
}
.reader-chat-markdown {
  min-width:0;
  max-width:100%;
  overflow:hidden;
  overflow-wrap:anywhere;
  word-break:break-word;
  color:inherit;
  font-size:13px;
  line-height:1.58
}
.reader-chat-markdown * {
  max-width:100%;
  overflow-wrap:anywhere;
  word-break:break-word
}
.reader-chat-markdown>:first-child {
  margin-top:0
}
.reader-chat-markdown>:last-child {
  margin-bottom:0
}
.reader-chat-markdown p {
  margin:0 0 .65em;
  white-space:normal
}
.reader-chat-markdown a {
  color:inherit;
  cursor:pointer;
  text-decoration:underline;
  text-decoration-color:var(--app-reader-ink-a32);
  text-decoration-thickness:1px;
  text-underline-offset:.16em
}
.reader-chat-markdown a:hover {
  color:var(--reader-red);
  text-decoration-color:currentColor
}
.reader-chat-empty {
  display:grid;
  min-height:128px;
  place-items:center;
  border:1px dashed var(--app-reader-chat-panel-border);
  border-radius:14px;
  color:var(--reader-muted);
  font-size:13px;
  font-weight:760
}
.reader-chat-error {
  border-radius:12px;
  background:var(--app-reader-danger-a12);
  color:var(--reader-red);
  font-size:12px;
  font-weight:760;
  line-height:1.45;
  padding:9px 10px
}
.reader-chat-composer {
  position:relative;
  display:grid;
  grid-template-rows:minmax(0,auto) auto;
  gap:9px;
  min-width:0;
  overflow:visible;
  padding:12px 14px 14px;
  border-top:1px solid var(--app-reader-chat-composer-border);
  border-radius:0 0 17px 17px;
  background:var(--app-reader-chat-composer-bg)
}
.reader-chat-composer textarea {
  display:block;
  width:100%;
  min-height:54px;
  max-height:calc(1.55em * 8 + 18px);
  margin:0;
  border:0;
  border-radius:0;
  background:transparent;
  color:var(--reader-ink);
  font:inherit;
  font-size:13px;
  line-height:1.55;
  outline:0;
  padding:0;
  resize:none
}
.reader-chat-composer textarea:focus,.reader-chat-composer textarea:focus-visible {
  outline:0;
  box-shadow:none
}
.reader-chat-composer .floating-composer-bar {
  display:flex;
  min-width:0;
  align-items:flex-end;
  justify-content:space-between;
  gap:10px
}
.reader-chat-composer .floating-composer-actions {
  display:inline-flex;
  flex:0 0 auto;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  margin-left:auto
}
.reader-chat-composer .floating-composer-submit {
  display:inline-flex;
  height:32px;
  align-items:center;
  justify-content:center;
  gap:5px;
  border:0;
  border-radius:999px;
  background:var(--app-reader-chat-send-bg);
  color:var(--app-reader-chat-send-fg);
  font:inherit;
  font-size:12px;
  font-weight:850;
  padding:0 11px;
  transition:opacity .14s ease,transform .14s ease
}
.reader-chat-composer .floating-composer-submit:active:not(:disabled) {
  transform:scale(.96)
}
.reader-chat-composer .floating-composer-submit:disabled {
  background:var(--app-reader-chat-send-disabled-bg);
  color:var(--app-reader-chat-send-disabled-fg);
  cursor:not-allowed;
  opacity:1
}
.reader-chat-agent-tray {
  display:flex;
  min-width:0;
  align-items:center;
  gap:8px;
  margin-right:auto;
  overflow:visible;
  color:var(--reader-muted);
  font-size:11px;
  font-weight:850
}
.reader-chat-agent-tray .reader-agent-avatar-stack,.reader-chat-agent-tray .reader-agent-avatar-stack-item {
  overflow:visible
}
.reader-chat-agent-tray .reader-agent-avatar-stack-item {
  width:30px;
  height:30px;
  border-color:var(--app-reader-chat-composer-bg);
  background:var(--app-reader-chat-composer-bg)
}
.reader-chat-agent-tray .reader-agent-avatar-stack-item.is-active {
  z-index:2;
  box-shadow:0 8px 18px var(--app-reader-ink-a16);
  transform:translateY(-6px) scale(1.12)
}
.reader-chat-agent-tray .reader-avatar-badge {
  width:24px;
  height:24px
}
.reader-highlight-choice-menu {
  position:absolute;
  z-index:var(--reader-z-popover);
  width:240px;
  display:grid;
  gap:6px;
  padding:10px;
  border:1px solid var(--app-reader-composer-border);
  border-radius:16px;
  background:var(--reader-paper);
  box-shadow:var(--reader-elevated-shadow);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-highlight-choice-menu header {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding:0 2px 4px
}
.reader-highlight-choice-menu header strong {
  font-size:13px;
  font-weight:900
}
.reader-highlight-choice-menu header button {
  display:grid;
  width:26px;
  height:26px;
  place-items:center;
  border:0;
  border-radius:999px;
  background:transparent;
  color:var(--reader-muted);
  padding:0
}
.reader-highlight-choice-menu header button:hover {
  background:var(--app-reader-agent-panel-hover-bg);
  color:var(--reader-ink)
}
.reader-highlight-choice-menu>button {
  display:grid;
  grid-template-columns:28px minmax(0,1fr) auto;
  align-items:center;
  gap:7px;
  border:0;
  border-radius:10px;
  background:transparent;
  color:var(--reader-ink);
  padding:7px;
  text-align:left
}
.reader-highlight-choice-menu>button:hover {
  background:var(--app-reader-agent-panel-hover-bg)
}
.reader-highlight-choice-menu .reader-avatar-badge {
  display:grid;
  width:28px;
  height:28px;
  place-items:center;
  overflow:hidden;
  border-radius:999px;
  background:var(--reader-green);
  color:white;
  font-size:10px;
  font-weight:800
}
.reader-highlight-choice-menu span {
  display:grid;
  gap:2px;
  min-width:0
}
.reader-highlight-choice-menu span strong {
  overflow:hidden;
  font-size:12px;
  font-weight:850;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-highlight-choice-menu span em {
  overflow:hidden;
  color:var(--reader-muted);
  font-size:11px;
  font-style:normal;
  font-weight:700;
  text-overflow:ellipsis;
  white-space:nowrap
}`;
