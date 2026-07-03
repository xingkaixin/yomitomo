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
  box-shadow:0 6px 14px color-mix(in srgb,var(--reader-ink) 20%,transparent),0 0 0 2px var(--app-reader-chat-panel-bg);
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
  --reader-chat-morph-closed-size:46px;
  --reader-chat-morph-closed-radius:14px;
  --reader-chat-morph-open-radius:18px;
  --reader-chat-morph-open-dur:350ms;
  --reader-chat-morph-close-dur:250ms;
  --reader-chat-morph-fade-dur:200ms;
  --reader-chat-morph-ease:cubic-bezier(.34,1.25,.64,1);
  --reader-chat-morph-close-ease:cubic-bezier(.22,1,.36,1);
  --reader-chat-morph-slide:40px;
  --reader-chat-morph-scale:.97;
  --reader-chat-morph-blur:2px;
  display:grid;
  grid-template-rows:auto minmax(0,1fr) auto;
  width:var(--reader-chat-panel-width,min(410px,calc(100vw - 32px)));
  height:var(--reader-chat-panel-height,min(640px,calc(var(--app-viewport-height) - 112px)));
  max-width:calc(100vw - 32px);
  max-height:calc(var(--app-viewport-height) - 112px);
  overflow:hidden;
  border:1px solid var(--app-reader-chat-panel-border);
  border-radius:var(--reader-chat-morph-open-radius);
  background:var(--app-reader-chat-panel-bg);
  box-shadow:var(--app-reader-chat-panel-shadow);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  color:var(--reader-ink);
  opacity:1;
  filter:blur(0);
  transform:scale(var(--reader-chat-resize-scale-x,1),var(--reader-chat-resize-scale-y,1));
  transform-origin:100% 100%;
  transition:width var(--reader-chat-morph-open-dur) var(--reader-chat-morph-ease),
    height var(--reader-chat-morph-open-dur) var(--reader-chat-morph-ease),
    border-radius var(--reader-chat-morph-open-dur) var(--reader-chat-morph-ease),
    transform 160ms var(--reader-chat-morph-close-ease),
    box-shadow 160ms ease
}
.reader-chat-panel.is-opening,.reader-chat-panel.is-closing {
  width:var(--reader-chat-morph-closed-size);
  height:var(--reader-chat-morph-closed-size);
  border-radius:var(--reader-chat-morph-closed-radius);
  pointer-events:none
}
.reader-chat-panel.is-closing {
  z-index:calc(var(--reader-z-popover) - 1);
  transition:width var(--reader-chat-morph-close-dur) var(--reader-chat-morph-close-ease),
    height var(--reader-chat-morph-close-dur) var(--reader-chat-morph-close-ease),
    border-radius var(--reader-chat-morph-close-dur) var(--reader-chat-morph-close-ease),
    transform 120ms var(--reader-chat-morph-close-ease),
    box-shadow 120ms ease
}
.reader-chat-panel>.reader-chat-header,.reader-chat-panel>.reader-chat-messages,.reader-chat-panel>.reader-chat-composer {
  opacity:1;
  filter:blur(0);
  transform:translateX(0) scale(1);
  transition:opacity var(--reader-chat-morph-fade-dur) var(--reader-chat-morph-close-ease),
    filter var(--reader-chat-morph-fade-dur) var(--reader-chat-morph-close-ease),
    transform var(--reader-chat-morph-open-dur) var(--reader-chat-morph-close-ease)
}
.reader-chat-panel.is-opening>.reader-chat-header,
.reader-chat-panel.is-opening>.reader-chat-messages,
.reader-chat-panel.is-opening>.reader-chat-composer,
.reader-chat-panel.is-closing>.reader-chat-header,
.reader-chat-panel.is-closing>.reader-chat-messages,
.reader-chat-panel.is-closing>.reader-chat-composer {
  opacity:0;
  filter:blur(var(--reader-chat-morph-blur));
  transform:translateX(var(--reader-chat-morph-slide)) scale(var(--reader-chat-morph-scale));
  pointer-events:none
}
.reader-chat-panel.is-opening>.reader-chat-resize-handle,.reader-chat-panel.is-closing>.reader-chat-resize-handle {
  opacity:0;
  pointer-events:none
}
.reader-chat-panel.is-resizing {
  box-shadow:0 22px 58px color-mix(in srgb,var(--reader-ink) 18%,transparent),0 8px 18px color-mix(in srgb,var(--reader-ink) 8%,transparent);
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
  .reader-chat-panel,.reader-chat-panel>.reader-chat-header,.reader-chat-panel>.reader-chat-messages,.reader-chat-panel>.reader-chat-composer {
    filter:none!important;
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
  box-shadow:0 2px 7px color-mix(in srgb,var(--reader-ink) 12%,transparent)
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
  background:color-mix(in srgb,var(--reader-red) 12%,transparent);
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
  box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 16%,transparent);
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
}
.reader-virtual-cursor {
  left:0;
  top:0;
  gap:3px;
  transform:translate3d(var(--reader-cursor-x,0px),var(--reader-cursor-y,0px),0) translate(-10px,-10px);
  transition:transform .34s cubic-bezier(.22,1,.36,1);
  will-change:transform
}
.reader-virtual-pointer {
  width:48px;
  height:48px;
  flex:0 0 auto;
  overflow:visible;
  border:0;
  background:transparent;
  clip-path:none;
  filter:drop-shadow(0 5px 8px color-mix(in srgb,var(--reader-ink) 18%,transparent));
  transform:none
}
.reader-virtual-bloom {
  opacity:.95
}
.reader-virtual-pointer-shape {
  stroke:#fff;
  stroke-width:2;
  stroke-linejoin:round
}
.reader-virtual-cursor.is-offscreen .reader-virtual-pointer {
  opacity:.62
}
.reader-virtual-cursor.is-offscreen .reader-virtual-bloom {
  opacity:.42
}
.reader-virtual-label {
  border-color:color-mix(in srgb,var(--cursor-color,var(--reader-red)) 24%,transparent);
  color:var(--cursor-color,var(--reader-red))
}
.reader-virtual-label .reader-avatar-badge {
  background:var(--cursor-color,var(--reader-red))
}
@keyframes reader-cursor-leave {
  to {
    opacity:0;
    filter:blur(2px)
  }
}
.reader-completion-burst {
  position:fixed;
  inset:0;
  z-index:9;
  overflow:hidden;
  pointer-events:none
}
.reader-completion-burst-center {
  position:absolute;
  left:50%;
  top:50%;
  width:1px;
  height:1px;
  transform:scale(1.28);
  transform-origin:center
}
.reader-completion-burst-ring {
  position:absolute;
  left:0;
  top:0;
  width:148px;
  height:148px;
  border:1px solid rgba(199,164,94,.3);
  border-radius:999px;
  opacity:0;
  transform:translate(-50%,-50%) scale(.18);
  animation:reader-completion-ring 1.18s cubic-bezier(.22,1,.36,1) forwards
}
.reader-completion-burst-ring.is-wide {
  width:236px;
  height:236px;
  border-color:rgba(94,192,232,.22);
  animation-delay:.12s
}
.reader-completion-particle {
  position:absolute;
  left:0;
  top:0;
  width:8px;
  height:13px;
  border-radius:2px;
  background:var(--reader-confetti-color);
  box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 12%,transparent);
  opacity:0;
  transform:translate(-50%,-50%) scale(.2) rotate(var(--reader-confetti-rotate));
  animation:reader-completion-pop 1.52s cubic-bezier(.16,1,.3,1) forwards;
  animation-delay:var(--reader-confetti-delay);
  will-change:transform,opacity,filter
}
.reader-completion-particle.is-dot {
  width:7px;
  height:7px;
  border-radius:999px
}
.reader-completion-particle.is-spark {
  width:4px;
  height:16px;
  border-radius:999px
}
@keyframes reader-completion-ring {
  12% {
    opacity:.7
  }
  to {
    opacity:0;
    transform:translate(-50%,-50%) scale(1.2)
  }
}
@keyframes reader-completion-pop {
  0% {
    opacity:0;
    filter:blur(3px);
    transform:translate(-50%,-50%) scale(.2) rotate(var(--reader-confetti-rotate))
  }
  16% {
    opacity:1;
    filter:blur(0)
  }
  76% {
    opacity:1;
    transform:translate(-50%,-50%) translate(var(--reader-confetti-x),var(--reader-confetti-y)) scale(1) rotate(calc(var(--reader-confetti-rotate) + 110deg))
  }
  100% {
    opacity:0;
    filter:blur(1px);
    transform:translate(-50%,-50%) translate(var(--reader-confetti-x),calc(var(--reader-confetti-y) + 42px)) scale(.86) rotate(calc(var(--reader-confetti-rotate) + 180deg))
  }
}
.reader-agent-dock {
  position:fixed;
  left:50%;
  bottom:18px;
  z-index:135;
  display:flex;
  align-items:flex-end;
  justify-content:center;
  min-height:58px;
  max-width:calc(100vw - 36px);
  padding:8px 10px;
  border:1px solid var(--reader-ink-subtle);
  border-radius:19px;
  background:var(--reader-paper);
  box-shadow:var(--reader-elevated-shadow),inset 0 1px 0 rgba(255,255,255,.68);
  backdrop-filter:blur(18px);
  -webkit-backdrop-filter:blur(18px);
  pointer-events:none;
  transform:translateX(-50%);
  transform-origin:bottom center;
  transition:opacity .18s ease,filter .18s ease
}
.reader-agent-dock.is-completing {
  animation:reader-agent-dock-leave .78s cubic-bezier(.22,1,.36,1) .82s forwards
}
.reader-agent-dock-list {
  display:flex;
  align-items:flex-end;
  gap:8px;
  min-width:0
}
.reader-agent-dock-item {
  position:relative;
  display:grid;
  width:44px;
  height:44px;
  place-items:center;
  border-radius:12px;
  background:transparent;
  box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 14%,transparent),0 0 0 1px color-mix(in srgb,var(--agent-color) 18%,transparent);
  transform:translateY(0);
  transition:filter .18s ease,opacity .18s ease,transform .18s ease
}
.reader-agent-dock-item .reader-avatar-badge {
  width:40px;
  height:40px;
  border-radius:10px;
  background:var(--agent-color);
  box-shadow:0 0 0 1px var(--reader-paper);
  font-size:12px
}
.reader-agent-dock-item .reader-avatar-badge img {
  border-radius:10px
}
.reader-agent-dock-item.is-active {
  animation:reader-agent-dock-hop .86s cubic-bezier(.34,1.56,.64,1) infinite;
  animation-delay:var(--reader-dock-delay)
}
.reader-agent-dock-item.is-active::after {
  content:"";
  position:absolute;
  left:50%;
  bottom:-7px;
  width:5px;
  height:5px;
  border-radius:999px;
  background:var(--agent-color);
  box-shadow:0 0 0 4px color-mix(in srgb,var(--agent-color) 14%,transparent);
  transform:translateX(-50%);
  opacity:.9
}
.reader-agent-dock-item.is-done {
  filter:saturate(.9);
  opacity:.86
}
.reader-agent-dock .reader-completion-burst {
  position:absolute;
  inset:auto;
  left:50%;
  bottom:32px;
  z-index:1;
  width:1px;
  height:1px;
  overflow:visible
}
.reader-agent-dock .reader-completion-burst-center {
  left:0;
  top:0;
  transform:scale(.82);
  transform-origin:center
}
@keyframes reader-agent-dock-hop {
  0%,100% {
    transform:translateY(0) scale(1)
  }
  45% {
    transform:translateY(-10px) scale(1.04)
  }
  70% {
    transform:translateY(0) scale(.99)
  }
}
@keyframes reader-agent-dock-leave {
  to {
    opacity:0;
    filter:blur(8px);
    transform:translateX(-50%) translateY(12px) scale(.92)
  }
}
.reader-agent-annotate {
  height:38px;
  border-color:var(--app-reader-composer-border);
  background:var(--reader-paper);
  color:var(--reader-ink);
  padding:0 12px
}
.reader-agent-annotate:hover,.reader-agent-annotate.is-active {
  background:var(--app-reader-toolbar-control-hover-bg);
  color:var(--reader-ink)
}
.reader-notes-actions span {
  background:var(--reader-ink)
}
.reader-agent-annotate-menu {
  gap:8px;
  margin:8px 0 18px;
  padding:14px;
  border-color:var(--reader-ink-subtle);
  border-radius:18px;
  background:var(--reader-paper);
  overflow:auto;
  max-height:calc(var(--app-viewport-height) - 112px)
}
.reader-agent-annotate-menu>header {
  display:grid;
  gap:3px;
  padding:2px 4px 8px
}
.reader-agent-annotate-menu>header strong {
  font-size:14px;
  font-weight:900
}
.reader-agent-annotate-menu>header span {
  color:var(--reader-muted);
  font-size:12px;
  font-weight:720
}
.reader-agent-option {
  position:relative;
  display:grid;
  grid-template-columns:minmax(0,1fr);
  align-items:center;
  gap:8px;
  border:1px solid transparent;
  border-radius:14px;
  padding:6px
}
.reader-agent-option:hover,.reader-agent-option.is-running,.reader-agent-option.is-selected {
  border-color:var(--reader-ink-subtle);
  background:var(--reader-paper-panel)
}
.reader-agent-select {
  display:grid;
  grid-template-columns:38px minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  border:0;
  border-radius:12px;
  background:transparent;
  color:var(--reader-ink);
  font:inherit;
  padding:6px;
  text-align:left
}
.reader-agent-select:disabled {
  cursor:not-allowed;
  opacity:.65
}
.reader-agent-action-picker {
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:6px;
  margin:2px 6px 6px 54px;
  padding:7px;
  border-radius:14px;
  background:var(--reader-paper);
  box-shadow:inset 0 0 0 1px var(--reader-ink-hairline),var(--reader-soft-shadow)
}
.reader-agent-annotate-menu .reader-agent-action-picker button {
  display:grid;
  grid-template-columns:1fr;
  align-content:start;
  align-items:start;
  gap:5px;
  min-height:64px;
  border:1px solid var(--reader-ink-subtle);
  border-radius:11px;
  background:var(--reader-paper);
  color:var(--reader-ink);
  font:inherit;
  padding:9px 10px;
  text-align:left;
  transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease
}
.reader-agent-annotate-menu .reader-agent-action-picker button:hover,.reader-agent-annotate-menu .reader-agent-action-picker button.is-active {
  border-color:rgba(159,91,80,.18);
  background:rgba(159,91,80,.06);
  box-shadow:0 4px 12px color-mix(in srgb,var(--reader-ink) 5%,transparent);
  color:var(--reader-red)
}
.reader-agent-annotate-menu .reader-agent-action-picker button:active {
  transform:scale(.96)
}
.reader-agent-annotate-menu .reader-agent-action-picker button>strong {
  font-size:12px;
  font-weight:900;
  line-height:1.15
}
.reader-agent-annotate-menu .reader-agent-action-picker button>span {
  display:block;
  width:auto;
  height:auto;
  min-width:0;
  margin:0;
  padding:0;
  border-radius:0;
  background:transparent;
  color:var(--reader-muted);
  font-size:10px;
  font-weight:720;
  line-height:1.35;
  place-items:initial
}
.reader-agent-avatar {
  position:relative;
  display:grid;
  width:38px;
  height:44px;
  place-items:end center
}
.reader-agent-avatar i {
  position:absolute;
  top:0;
  left:50%;
  width:9px;
  height:9px;
  border:1px solid rgba(37,29,22,.16);
  border-radius:999px;
  box-shadow:0 1px 3px color-mix(in srgb,var(--reader-ink) 20%,transparent);
  transform:translateX(-50%)
}
.reader-agent-avatar .reader-avatar-badge {
  width:30px;
  height:30px
}
.reader-agent-select>span:not(.reader-avatar-badge) {
  display:grid;
  width:auto;
  height:auto;
  gap:2px;
  min-width:0;
  place-items:initial;
  border-radius:0;
  background:transparent;
  color:inherit;
  font-size:inherit;
  font-weight:inherit
}
.reader-agent-select>span:not(.reader-avatar-badge) strong {
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-agent-select>span:not(.reader-avatar-badge) small {
  overflow:hidden;
  color:#5d5147;
  font-size:11px;
  font-weight:760;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-agent-select b {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius:999px;
  background:var(--reader-ink-hairline);
  color:var(--reader-muted);
  font-size:11px;
  font-weight:850;
  line-height:1;
  padding:6px 8px
}
.reader-agent-option:hover .reader-agent-select b {
  background:var(--reader-ink);
  color:var(--reader-paper)
}
.reader-agent-option.is-running .reader-agent-select b {
  background:rgba(159,91,80,.1);
  color:var(--reader-red)
}
.reader-agent-option.is-selected .reader-agent-select b {
  background:var(--reader-ink);
  color:var(--reader-paper)
}
.reader-agent-annotate-actions {
  display:flex;
  justify-content:flex-end;
  gap:8px;
  margin-top:4px;
  padding-top:10px;
  border-top:1px solid var(--reader-ink-subtle)
}
.reader-agent-annotate-actions button {
  display:inline-flex;
  height:40px;
  width:auto;
  grid-template-columns:none;
  align-items:center;
  justify-content:center;
  border:0;
  border-radius:999px;
  background:var(--reader-paper-hover);
  color:var(--reader-ink);
  font:inherit;
  font-size:12px;
  font-weight:820;
  padding:0 14px;
  transition:background .14s ease,color .14s ease,transform .14s ease
}
.reader-agent-annotate-actions button:active:not(:disabled) {
  transform:scale(.96)
}
.reader-agent-annotate-actions button:last-child {
  background:var(--reader-ink);
  color:#fff
}
.reader-agent-annotate-actions button:disabled {
  cursor:not-allowed;
  opacity:.48
}
.reader-agent-empty {
  display:grid;
  min-height:220px;
  place-items:center;
  border:1px dashed color-mix(in srgb,var(--reader-ink) 14%,transparent);
  border-radius:16px;
  color:var(--reader-muted);
  font-size:13px;
  font-weight:760
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
.reader-agent-annotate-scrim {
  position:fixed;
  inset:0;
  border:0;
  background:rgba(40,35,29,.2);
  backdrop-filter:blur(10px);
  pointer-events:auto
}
.reader-agent-annotate-popover .reader-agent-annotate-menu {
  position:relative;
  z-index:1;
  display:grid;
  grid-template-rows:auto auto minmax(0,1fr) auto;
  width:min(1180px,calc(100vw - 56px));
  height:min(860px,calc(var(--app-viewport-height) - 48px));
  max-height:min(860px,calc(var(--app-viewport-height) - 48px));
  margin:0;
  padding:18px;
  border:1px solid var(--app-reader-selection-menu-border);
  border-radius:20px;
  background:var(--reader-paper);
  box-shadow:0 28px 90px color-mix(in srgb,var(--reader-ink) 24%,transparent);
  overflow:hidden;
  pointer-events:auto
}
.reader-agent-annotate-popover .reader-agent-annotate-menu:has(.reader-focus-progress) {
  grid-template-rows:auto auto auto minmax(0,1fr) auto
}
.reader-plan-header {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:end;
  gap:24px;
  padding:2px 2px 8px
}
.reader-plan-header>div {
  display:grid;
  gap:6px;
  min-width:0
}
.reader-plan-header strong {
  font-size:22px;
  font-weight:900;
  line-height:1.16;
  text-wrap:balance
}
.reader-plan-header span {
  color:var(--reader-muted);
  font-size:13px;
  font-weight:760;
  line-height:1.45;
  text-wrap:pretty
}
.reader-plan-header p {
  display:flex;
  align-items:center;
  gap:8px;
  margin:0 0 1px;
  color:var(--reader-muted);
  font-size:13px;
  font-weight:820;
  white-space:nowrap
}
.reader-plan-header b {
  color:var(--reader-ink);
  font-variant-numeric:tabular-nums
}
.reader-plan-action-bar {
  position:relative;
  display:flex;
  align-items:center;
  gap:10px;
  min-height:56px;
  margin:8px 0 14px;
  padding:10px 14px;
  border-radius:14px;
  background:var(--reader-paper-panel);
  box-shadow:inset 0 0 0 1px var(--reader-ink-hairline);
  overflow:visible
}
.reader-plan-action-bar>span {
  margin-right:6px;
  color:#8b8175;
  font-size:11px;
  font-weight:900;
  letter-spacing:.16em;
  text-transform:uppercase
}
.reader-agent-annotate-menu .reader-plan-action {
  position:relative;
  display:inline-flex;
  width:auto;
  min-width:58px;
  height:34px;
  grid-template-columns:none;
  align-items:center;
  justify-content:center;
  gap:5px;
  border:1px solid var(--reader-ink-subtle);
  border-radius:999px;
  background:var(--reader-paper);
  color:var(--reader-ink);
  cursor:grab;
  font:inherit;
  font-size:12px;
  font-weight:900;
  padding:0 14px;
  text-align:center;
  transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease
}
.reader-agent-annotate-menu .reader-plan-action:hover {
  border-color:color-mix(in srgb,var(--reader-ink) 18%,transparent);
  background:var(--reader-paper-hover);
  box-shadow:0 6px 16px color-mix(in srgb,var(--reader-ink) 8%,transparent)
}
.reader-agent-annotate-menu .reader-plan-action:active {
  cursor:grabbing;
  transform:scale(.96)
}
.reader-agent-annotate-menu .reader-plan-action:hover::after {
  content:attr(data-description);
  position:absolute;
  left:50%;
  bottom:calc(100% + 9px);
  z-index:4;
  width:max-content;
  max-width:240px;
  transform:translateX(-50%);
  border-radius:10px;
  background:var(--reader-ink);
  color:var(--reader-paper);
  box-shadow:0 12px 28px color-mix(in srgb,var(--reader-ink) 20%,transparent);
  font-size:11px;
  font-weight:760;
  line-height:1.45;
  padding:8px 10px;
  white-space:normal
}
.reader-plan-grid-wrap {
  min-height:0;
  overflow:auto;
  padding:2px 2px 4px
}
.reader-plan-grid {
  display:grid;
  gap:6px;
  min-width:max-content;
  align-items:stretch
}
.reader-plan-corner {
  position:sticky;
  left:0;
  z-index:2;
  border-radius:12px;
  background:var(--reader-paper)
}
.reader-plan-section {
  display:grid;
  align-content:end;
  gap:3px;
  min-height:44px;
  padding:0 4px 8px;
  border-bottom:1px dashed color-mix(in srgb,var(--reader-ink) 18%,transparent);
  color:var(--reader-muted);
  text-align:center
}
.reader-plan-section span {
  font-size:11px;
  font-weight:850;
  line-height:1
}
.reader-plan-section strong {
  overflow:hidden;
  color:#6f665d;
  font-size:12px;
  font-weight:900;
  line-height:1.25;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-plan-agent {
  position:sticky;
  left:0;
  z-index:2;
  display:grid;
  grid-template-columns:8px 32px minmax(0,1fr) 30px;
  align-items:center;
  gap:10px;
  min-height:54px;
  padding:8px 8px 8px 0;
  background:var(--reader-paper)
}
.reader-plan-agent-color {
  width:8px;
  height:34px;
  border-radius:999px;
  box-shadow:inset 0 0 0 1px rgba(37,29,22,.14)
}
.reader-plan-agent .reader-avatar-badge {
  width:30px;
  height:30px
}
.reader-plan-agent strong {
  overflow:hidden;
  font-size:13px;
  font-weight:900;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-agent-annotate-menu .reader-plan-agent button {
  display:grid;
  width:30px;
  height:30px;
  grid-template-columns:none;
  place-items:center;
  border:0;
  border-radius:999px;
  background:transparent;
  color:var(--reader-muted);
  padding:0;
  transition:background .14s ease,color .14s ease,transform .14s ease
}
.reader-agent-annotate-menu .reader-plan-agent button:hover {
  background:var(--reader-ink-hairline);
  color:var(--reader-ink)
}
.reader-agent-annotate-menu .reader-plan-agent button:active {
  transform:scale(.96)
}
.reader-plan-cell {
  display:grid;
  min-height:54px;
  place-items:center;
  border:1px dashed rgba(199,164,94,.36);
  border-radius:9px;
  background:rgba(255,250,240,.45);
  color:#b0a394;
  font-size:14px;
  font-weight:820
}
.reader-plan-cell.is-filled {
  border-style:solid;
  border-color:color-mix(in srgb,var(--agent-color) 34%,transparent);
  background:color-mix(in srgb,var(--agent-color) 10%,var(--reader-paper))
}
.reader-agent-annotate-menu .reader-plan-cell-action {
  display:grid;
  width:100%;
  height:100%;
  grid-template-columns:1fr;
  place-items:center;
  border:0;
  border-radius:8px;
  background:transparent;
  color:var(--reader-ink);
  font:inherit;
  padding:0 8px;
  text-align:center;
  transition:background .14s ease,transform .14s ease
}
.reader-agent-annotate-menu .reader-plan-cell-action:hover {
  background:color-mix(in srgb,var(--agent-color) 10%,transparent)
}
.reader-agent-annotate-menu .reader-plan-cell-action:active {
  transform:scale(.96)
}
.reader-plan-cell-action strong {
  display:inline-flex;
  max-width:100%;
  align-items:center;
  justify-content:center;
  gap:4px;
  overflow:hidden;
  font-size:13px;
  font-weight:950;
  line-height:1.2;
  text-overflow:ellipsis;
  white-space:nowrap
}`;
