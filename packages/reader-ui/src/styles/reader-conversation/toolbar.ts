export const toolbarStyles = `.reader-main {
  grid-template-columns:minmax(0,1fr)
}
.reader-brand {
  min-width:0
}
.reader-toolbar {
  position:relative;
  display:grid;
  grid-template-columns:minmax(112px,1fr) minmax(0,2fr) minmax(112px,1fr);
  align-items:center;
  gap:18px;
  border-bottom:0;
  padding:14px 28px 17px;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  -webkit-app-region:drag
}
.reader-back {
  display:inline-flex;
  min-width:0;
  min-height:40px;
  align-items:center;
  justify-self:start;
  gap:6px;
  border:0;
  border-radius:6px;
  background:transparent;
  color:var(--reader-muted);
  font:inherit;
  font-size:14px;
  font-weight:820;
  padding:0 8px;
  transition:background-color .14s ease,color .14s ease,transform .14s ease
}
.reader-back span {
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-back:hover,.reader-back:focus-visible {
  background:var(--app-reader-toolbar-control-hover-bg);
  color:var(--reader-ink);
  outline:0
}
.reader-back:active {
  transform:scale(.96)
}
.reader-toolbar-article {
  display:flex;
  flex:1 1 auto;
  max-width:100%;
  align-items:center;
  gap:12px;
  min-width:0;
  overflow:hidden;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-toolbar>.reader-toolbar-article {
  grid-column:2;
  width:100%;
  justify-content:center;
  text-align:center
}
.reader-toolbar-article-visual {
  display:grid;
  flex:0 0 auto;
  place-items:center
}
.reader-toolbar-article-copy {
  display:grid;
  flex:0 1 auto;
  gap:5px;
  max-width:100%;
  min-width:0;
  overflow:hidden;
  justify-items:center;
  text-align:center
}
.reader-toolbar-article.has-cover .reader-toolbar-article-copy {
  justify-items:start;
  text-align:left
}
.reader-toolbar-article-title {
  max-width:100%;
  overflow:hidden;
  color:var(--reader-ink);
  font-size:15px;
  font-weight:920;
  line-height:1.18;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-toolbar-article-meta {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  min-width:0;
  margin:0;
  color:var(--reader-muted);
  font-size:12px;
  font-weight:760;
  line-height:1.25
}
.reader-toolbar-article.has-cover .reader-toolbar-article-meta {
  justify-content:flex-start
}
.reader-toolbar-article-meta span {
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-toolbar-article-meta span+span::before {
  content:"";
  display:inline-block;
  width:4px;
  height:4px;
  margin-right:8px;
  border-radius:999px;
  background:var(--reader-ink-weak);
  vertical-align:2px
}
.reader-toolbar-article-action {
  display:flex;
  flex:0 0 auto;
  align-items:center;
  gap:8px
}
.reader-toolbar>.reader-toolbar-actions {
  grid-column:3;
  display:flex;
  min-width:0;
  align-items:center;
  justify-content:flex-end;
  gap:8px
}
.reader-back,.reader-toolbar-actions,.reader-toolbar-article-action,.reader-toolbar button {
  -webkit-app-region:no-drag
}
.reader-toolbar-progress {
  position:absolute;
  left:0;
  right:0;
  bottom:0;
  height:3px;
  overflow:hidden;
  background:var(--app-reader-toolbar-progress-track);
  pointer-events:none
}
.reader-toolbar-progress span {
  display:block;
  width:100%;
  height:100%;
  border-radius:0 999px 999px 0;
  background:var(--app-reader-toolbar-progress-fill);
  transform-origin:left center;
  will-change:transform
}
.reader-floating-toolbar {
  position:fixed;
  left:50%;
  top:88px;
  z-index:var(--reader-z-toolbar);
  display:flex;
  max-width:min(820px,calc(100vw - 32px));
  align-items:center;
  gap:5px;
  overflow:visible;
  padding:3px 6px;
  border:1px solid var(--app-reader-toolbar-border);
  border-radius:6px;
  background:var(--app-reader-toolbar-bg);
  box-shadow:var(--reader-soft-shadow),inset 0 1px 0 color-mix(in srgb,var(--reader-paper) 58%,transparent);
  backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-variant-numeric:tabular-nums;
  scrollbar-width:none;
  transform:translateX(-50%);
  -webkit-app-region:no-drag
}
.reader-floating-toolbar::-webkit-scrollbar {
  display:none
}
.reader-floating-toolbar-group,.reader-floating-toolbar-controls {
  display:inline-flex;
  align-items:center;
  gap:4px;
  min-width:max-content
}
.reader-floating-toolbar-group+.reader-annotation-nav,.reader-annotation-nav+.reader-floating-toolbar-group,.reader-floating-toolbar-controls {
  position:relative;
  margin-left:5px;
  padding-left:9px
}
.reader-floating-toolbar-group+.reader-annotation-nav::before,.reader-annotation-nav+.reader-floating-toolbar-group::before,.reader-floating-toolbar-controls::before {
  content:"";
  position:absolute;
  left:0;
  top:6px;
  bottom:6px;
  width:1px;
  background:var(--reader-ink-subtle)
}
.reader-floating-toolbar-controls>*+* {
  position:relative;
  margin-left:5px;
  padding-left:9px
}
.reader-floating-toolbar-controls>*+*::before {
  content:"";
  position:absolute;
  left:0;
  top:6px;
  bottom:6px;
  width:1px;
  background:var(--reader-ink-subtle)
}
.reader-floating-toolbar .reader-icon-button,.reader-floating-toolbar .reader-close {
  width:30px;
  height:30px;
  min-height:30px;
  border-color:transparent;
  border-radius:6px;
  background:transparent;
  box-shadow:none;
  color:var(--reader-ink);
  transition:transform .14s ease
}
.reader-floating-toolbar .reader-icon-button:hover:not(:disabled),.reader-floating-toolbar .reader-icon-button.is-active,.reader-floating-toolbar .reader-close:hover:not(:disabled) {
  background:transparent;
  color:var(--reader-ink)
}
.reader-floating-toolbar .reader-icon-button:active:not(:disabled),.reader-floating-toolbar .reader-close:active:not(:disabled) {
  transform:scale(.96)
}
.reader-floating-toolbar .reader-icon-button.is-busy svg,.reader-translation-confirm-actions .is-primary svg {
  animation:reader-spin .8s linear infinite
}
.reader-translation-menu {
  display:grid;
  min-width:178px;
  gap:3px;
  padding:6px;
  border:1px solid var(--app-reader-toolbar-border);
  border-radius:8px;
  background:var(--app-reader-toolbar-bg);
  box-shadow:var(--reader-soft-shadow),inset 0 1px 0 color-mix(in srgb,var(--reader-paper) 58%,transparent);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)
}
.reader-translation-menu button {
  display:grid;
  grid-template-columns:20px minmax(0,1fr);
  align-items:center;
  gap:8px;
  height:34px;
  border:0;
  border-radius:6px;
  background:transparent;
  color:var(--reader-ink);
  font:inherit;
  font-size:12px;
  font-weight:820;
  padding:0 9px;
  text-align:left;
  transition:background .14s ease,color .14s ease,transform .14s ease
}
.reader-translation-menu button:hover:not(:disabled) {
  background:var(--app-reader-toolbar-control-hover-bg)
}
.reader-translation-menu button:active:not(:disabled) {
  transform:scale(.97)
}
.reader-translation-menu button:disabled {
  cursor:not-allowed;
  opacity:.45
}
.reader-translation-menu button.is-danger {
  color:var(--reader-red,var(--app-reader-danger,#8a3f32))
}
.reader-translation-menu span {
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.reader-translation-confirm-overlay {
  position:fixed;
  inset:0;
  z-index:var(--reader-z-modal);
  display:grid;
  place-items:center;
  padding:22px;
  background:color-mix(in srgb,var(--reader-ink) 18%,transparent);
  backdrop-filter:blur(4px);
  animation:reader-dialog-fade-in .16s ease
}
.reader-translation-confirm {
  display:grid;
  width:min(380px,calc(100vw - 44px));
  gap:11px;
  border:1px solid var(--app-reader-composer-border);
  border-radius:14px;
  background:var(--app-reader-composer-bg);
  box-shadow:var(--reader-elevated-shadow);
  color:var(--reader-ink);
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  padding:18px;
  animation:reader-dialog-pop-in .18s cubic-bezier(.22,1,.36,1)
}
.reader-translation-confirm h2 {
  margin:0;
  color:var(--reader-ink);
  font-size:16px;
  font-weight:920;
  line-height:1.25
}
.reader-translation-confirm p {
  margin:0;
  color:var(--reader-muted);
  font-size:13px;
  font-weight:650;
  line-height:1.58
}
.reader-translation-confirm-actions {
  display:flex;
  justify-content:flex-end;
  gap:8px;
  margin-top:6px
}
.reader-translation-confirm-actions button {
  display:inline-flex;
  min-width:72px;
  height:34px;
  align-items:center;
  justify-content:center;
  gap:6px;
  border:0;
  border-radius:8px;
  background:var(--app-reader-toolbar-control-hover-bg);
  color:var(--reader-ink);
  font:inherit;
  font-size:12px;
  font-weight:850;
  padding:0 12px;
  transition:background .14s ease,box-shadow .14s ease,transform .14s ease
}
.reader-translation-confirm-actions button:hover:not(:disabled) {
  box-shadow:0 6px 14px color-mix(in srgb,var(--reader-ink) 8%,transparent)
}
.reader-translation-confirm-actions button:active:not(:disabled) {
  transform:scale(.97)
}
.reader-translation-confirm-actions button:disabled {
  cursor:not-allowed;
  opacity:.5
}
.reader-translation-confirm-actions .is-primary {
  background:var(--reader-ink);
  color:var(--reader-paper)
}
.reader-translation-confirm-actions .is-danger {
  background:var(--reader-red,var(--app-reader-danger,#8a3f32));
  color:var(--app-reader-paper,#fff)
}
@keyframes reader-dialog-fade-in {
  from {
    opacity:0
  }
  to {
    opacity:1
  }
}
@keyframes reader-dialog-pop-in {
  from {
    opacity:0;
    transform:scale(.96) translateY(6px)
  }
  to {
    opacity:1;
    transform:scale(1) translateY(0)
  }
}
.reader-floating-toolbar .reader-annotation-nav {
  height:30px;
  gap:2px;
  border-color:transparent;
  border-radius:6px;
  background:transparent
}
.reader-annotation-nav-icon {
  color:var(--reader-muted)
}
.reader-floating-toolbar .reader-annotation-nav .reader-icon-button {
  width:24px;
  height:28px;
  min-height:28px;
  border-radius:6px
}
.reader-floating-toolbar.is-searching {
  gap:4px;
  max-width:min(560px,calc(100vw - 32px));
  padding-left:8px
}
.reader-search-box {
  display:inline-flex;
  width:min(280px,42vw);
  min-width:180px;
  height:30px;
  align-items:center;
  gap:7px;
  color:var(--reader-muted)
}
.reader-search-input-shell {
  --reader-search-clear-pad:26px;
  display:block;
  flex:1 1 auto;
  min-width:0;
  height:30px;
  color:var(--reader-ink)
}
.reader-search-box input {
  position:relative;
  z-index:1;
  width:100%;
  min-width:0;
  height:100%;
  border:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
  color:var(--reader-ink);
  font:inherit;
  font-size:12px;
  font-weight:760;
  line-height:1;
  outline:0;
  padding:0 var(--reader-search-clear-pad) 0 0;
  appearance:none;
  -webkit-appearance:none
}
.reader-search-box input:focus,.reader-search-box input:focus-visible {
  border:0;
  box-shadow:none;
  outline:0
}
.reader-search-box input::placeholder {
  color:var(--reader-muted)
}
.reader-search-box input::-webkit-search-cancel-button {
  display:none
}
.reader-search-input-shell input::placeholder {
  color:transparent
}
.reader-search-input-shell .t-clear-mirror,.reader-search-input-shell .t-clear-placeholder {
  inset:0 var(--reader-search-clear-pad) 0 0;
  color:var(--reader-ink);
  font:inherit;
  font-size:12px;
  font-weight:760;
  line-height:1
}
.reader-search-input-shell .t-clear-placeholder {
  color:var(--reader-muted)
}
.reader-search-clear-button {
  position:absolute;
  right:0;
  top:3px;
  z-index:4;
  display:grid;
  width:24px;
  height:24px;
  place-items:center;
  border:0;
  border-radius:6px;
  background:transparent;
  color:var(--reader-muted);
  opacity:1;
  padding:0;
  transition:color .14s ease,opacity .14s ease,transform .14s ease
}
.reader-search-clear-button:hover:not(:disabled) {
  color:var(--reader-ink)
}
.reader-search-clear-button:active:not(:disabled) {
  transform:scale(.92)
}
.reader-search-clear-button:disabled {
  opacity:0;
  pointer-events:none
}
@media (prefers-reduced-motion:reduce) {
  .t-clear-glow {
    opacity:0!important
  }
  .t-clear-mirror,.t-clear-placeholder {
    filter:none!important;
    transform:none!important
  }
  .reader-search-clear-button {
    transition:none
  }
}
.reader-floating-value.is-search-count {
  min-width:48px
}
.reader-floating-control-group {
  display:inline-flex;
  align-items:center;
  gap:2px;
  min-width:max-content;
  padding:0
}
.reader-floating-value {
  display:inline-flex;
  min-width:42px;
  height:30px;
  align-items:center;
  justify-content:center;
  color:var(--reader-muted);
  font-size:11px;
  font-weight:820;
  font-variant-numeric:tabular-nums;
  white-space:nowrap
}
.reader-floating-value.is-wide {
  min-width:58px
}
.reader-floating-value.is-annotation-progress {
  min-width:34px
}
.reader-floating-slider {
  width:92px;
  min-width:72px;
  max-width:13vw
}
.reader-toolbar-popover {
  width:190px;
  padding:9px;
  border:1px solid var(--app-reader-toolbar-border);
  border-radius:8px;
  background:var(--app-reader-toolbar-bg);
  box-shadow:var(--reader-soft-shadow),inset 0 1px 0 color-mix(in srgb,var(--reader-paper) 58%,transparent)
}
.reader-toolbar-popover-slider-row {
  display:grid;
  grid-template-columns:24px minmax(0,1fr) 24px auto;
  align-items:center;
  gap:7px
}
.reader-toolbar-popover-slider-row strong {
  min-width:38px;
  color:var(--reader-ink);
  font-size:12px;
  font-weight:850;
  text-align:right
}
.reader-toolbar-popover-step {
  display:grid;
  width:24px;
  height:24px;
  place-items:center;
  border:0;
  border-radius:6px;
  background:transparent;
  color:var(--reader-ink);
  font:inherit
}
.reader-toolbar-popover-slider {
  width:100%;
  accent-color:var(--reader-ink)
}
.reader-toolbar-popover-slider::-webkit-slider-runnable-track {
  height:4px;
  border-radius:999px;
  background:linear-gradient(to right,var(--reader-ink) 0 var(--reader-toolbar-slider-percent,0%),var(--reader-ink-subtle) var(--reader-toolbar-slider-percent,0%) 100%)
}
.reader-toolbar-popover-slider::-webkit-slider-thumb {
  width:15px;
  height:15px;
  margin-top:-5.5px;
  border:2px solid var(--reader-paper);
  border-radius:999px;
  background:var(--reader-ink);
  box-shadow:0 2px 7px color-mix(in srgb,var(--reader-ink) 16%,transparent);
  appearance:none
}`;
