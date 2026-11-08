import { readerBodyLineHeight } from '../reader-settings';
import { readerBilingualTranslationStyles } from '../reader-bilingual-translation-styles';

export const readerBaseStyles = `
:host {
  all: initial;
  color-scheme: light;
  --app-viewport-height: 100vh;
  --reader-bg: var(--app-reader-bg);
  --reader-paper: var(--app-reader-paper);
  --reader-ink: var(--app-reader-ink);
  --reader-muted: var(--app-reader-muted);
  --reader-green: var(--app-reader-primary);
  --reader-red: var(--app-reader-danger);
  --reader-yellow: var(--app-reader-accent);
  --reader-yellow-strong: var(--app-reader-accent-strong);
  --reader-ink-weak: var(--app-reader-ink-a32);
  --reader-ink-subtle: var(--app-reader-ink-a12);
  --reader-ink-hairline: var(--app-reader-ink-a8);
  --reader-paper-hover: var(--app-reader-paper-hover);
  --reader-focus-ring: var(--app-reader-focus-ring);
  --reader-code-bg: var(--app-reader-code-bg);
  --reader-code-fg: var(--app-reader-code-fg);
  --reader-elevated-shadow: 0 18px 48px var(--app-reader-ink-a16);
  --reader-soft-shadow: 0 8px 20px var(--app-reader-ink-a6);
  font-family: var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif);
}

@supports (height:100dvh) {
  :host {
    --app-viewport-height: 100dvh;
  }
}

* {
  box-sizing: border-box;
}

.reader-app {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  grid-template-rows: auto 1fr;
  background: var(--reader-bg);
  color: var(--reader-ink);
}

.reader-toolbar {
  justify-content: space-between;
  min-height: 76px;
  background: var(--app-reader-toolbar-bg);
  backdrop-filter: blur(14px);
}

.reader-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.reader-icon-button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--app-reader-toolbar-border);
  border-radius: 999px;
  background: var(--app-reader-toolbar-control-bg);
  color: var(--reader-ink);
}

.reader-icon-button:hover,
.reader-icon-button.is-active {
  background: var(--app-reader-toolbar-control-hover-bg);
}

.reader-settings-panel {
  position: fixed;
  right: 28px;
  top: 88px;
  z-index: 6;
  width: 280px;
  padding: 14px;
  border: 1px solid var(--app-reader-composer-border);
  border-radius: 18px;
  background: var(--app-reader-composer-bg);
  box-shadow: var(--app-reader-composer-shadow);
  backdrop-filter: blur(16px);
  font-family: var(--font-ui, ui-sans-serif, system-ui, sans-serif);
}

.reader-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}

.reader-setting-row+.reader-setting-row {
  border-top: 1px solid var(--reader-ink-subtle);
}

.reader-setting-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--reader-muted);
  font-size: 13px;
  font-weight: 720;
}

.reader-stepper {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border: 1px solid var(--app-reader-ink-a12);
  border-radius: 999px;
  background: var(--reader-paper);
}

.reader-stepper button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--reader-muted);
}

.reader-stepper button:hover {
  background: var(--reader-paper-hover);
  color: var(--reader-green);
}

.reader-stepper strong {
  min-width: 58px;
  color: var(--reader-ink);
  font-size: 12px;
  text-align: center;
}

.reader-main {
  min-height: 0;
  display: grid;
}

.reader-toc {
  --reader-toc-line-width: 10px;
  --reader-toc-line-active-width: 24px;
  --reader-toc-line-active-delta: calc(var(--reader-toc-line-active-width) - var(--reader-toc-line-width));
  --reader-toc-line-current-width: var(--reader-toc-line-width);
  --reader-toc-title-shift: 0px;
  --reader-toc-dur: 260ms;
  --reader-toc-motion: var(--reader-toc-dur) var(--reader-toc-ease,cubic-bezier(.22,1,.36,1));
  min-width: 0;
  overflow: auto;
  padding: 42px 18px 48px 22px;
  border-right: 1px solid var(--reader-ink-hairline);
  background: var(--app-reader-toc-bg);
  font-family: var(--font-ui, ui-sans-serif, system-ui, sans-serif);
}

.reader-toc.is-empty {
  visibility: hidden;
}

.reader-toc-title {
  margin: 0 0 12px;
  color: var(--reader-green);
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.reader-toc-item {
  display: grid;
  grid-template-columns: var(--reader-toc-line-width) minmax(0,1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 2px 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--reader-muted);
  font: inherit;
  font-size: 13px;
  line-height: 1.35;
  padding: 7px 8px;
  text-align: left;
}

.reader-toc-item:hover,.reader-toc-item.is-active {
  background: var(--app-reader-toc-item-hover-bg);
  color: var(--reader-ink);
}

.reader-toc-item.is-active {
  font-weight: 820;
}

.reader-toc-item[data-depth="2"] {
  padding-left: 20px;
}

.reader-toc-item[data-depth="3"] {
  padding-left: 32px;
}

.reader-toc-item[data-depth="4"] {
  padding-left: 44px;
}

@media(prefers-reduced-motion: reduce) {
  .reader-toc-item,.reader-toc-line,.reader-toc-item-main {
    transition: none !important;
    will-change: auto;
  }

  .reader-toc-item {
    transform: none !important;
  }
}

.reader-surface {
  min-width: 0;
}

.reader-article {
  position: relative;
  z-index: 1;
  border: 1px solid var(--app-reader-note-border);
  border-radius: 22px;
  box-shadow: var(--app-reader-note-shadow);
  font-size: var(--reader-font-size);
  line-height: ${readerBodyLineHeight};
  overflow-wrap: anywhere;
  word-break: break-word;
}

.reader-article-header {
  margin-bottom: 42px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--reader-ink-subtle);
}

.reader-article-header h1 {
  margin: 0;
  color: var(--reader-ink);
  font-size: 36px;
  letter-spacing: 0;
  line-height: 1.18;
}

.reader-article-header p {
  margin: 14px 0 0;
  color: var(--reader-muted);
  font-family: var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size: 15px;
  line-height: 1.5;
}

.reader-article * {
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
}

.reader-article-body {
  color: var(--reader-ink);
  text-wrap: pretty;
}

.reader-article-body>:first-child {
  margin-top: 0;
}

.reader-article-body>:last-child {
  margin-bottom: 0;
}

.reader-article-body p {
  margin: 0 0 1.05em;
}

${readerBilingualTranslationStyles}

.reader-article-body h1,
.reader-article-body h2,
.reader-article-body h3,
.reader-article-body h4,
.reader-article-body h5,
.reader-article-body h6 {
  margin: 1.65em 0 .65em;
  color: var(--reader-ink);
  font-family: var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-weight: 860;
  letter-spacing: 0;
  line-height: 1.28;
  text-wrap: balance;
}

.reader-article-body h1 {
  font-size: 1.52em;
}

.reader-article-body h2 {
  font-size: 1.28em;
}

.reader-article-body h3 {
  font-size: 1.14em;
}

.reader-article-body h4,.reader-article-body h5,.reader-article-body h6 {
  font-size: 1em;
}

.reader-article-body strong,.reader-article-body b {
  color: var(--reader-ink);
  font-weight: 850;
}

.reader-article-body hr {
  height: 1px;
  margin: 1.35em 0 .8em;
  border: 0;
  background: var(--app-reader-ink-a48);
}

.reader-article-body ul,.reader-article-body ol {
  margin: 1em 0 1em 1.35em;
  padding: 0;
}

.reader-article-body li {
  margin: .35em 0;
}

.reader-article-body figure {
  margin: 1em 0;
}

.reader-article-body figcaption {
  margin: .45em 0 0;
  color: var(--reader-muted);
  font-family: var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size: .72em;
  line-height: 1.4;
}

.reader-article img,.reader-article video,.reader-article iframe {
  max-width: 100%;
  height: auto;
  border-radius: 14px;
}

.reader-article code {
  font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
}

.reader-article pre {
  overflow: auto;
  padding: 18px;
  border-radius: 16px;
  background: var(--reader-code-bg);
  color: var(--reader-code-fg);
  font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
}

.reader-article table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

.reader-article blockquote {
  margin-left: 0;
  padding-left: 22px;
  border-left: 4px solid var(--reader-yellow);
  color: var(--reader-ink);
}

.reader-article a,.reader-markdown a {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--app-reader-ink-a32);
  text-decoration-thickness: 1px;
  text-underline-offset: .16em;
}

.reader-article a:hover,.reader-markdown a:hover {
  color: var(--reader-red);
  text-decoration-color: currentColor;
}

.reader-highlight-layer {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.reader-highlight {
  position: absolute;
  border: 0;
  border-radius: 4px;
  padding: 0;
}

.reader-highlight.is-temporary {
  pointer-events: none;
}

.reader-selection-handle {
  position: absolute;
  z-index: 4;
  width: 28px;
  height: calc(var(--reader-selection-handle-height) + 24px);
  border: 0;
  background: transparent;
  cursor: ew-resize;
  padding: 0;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transform: translate(-50%,-12px);
}

.reader-selection-handle::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 12px;
  width: 2px;
  height: var(--reader-selection-handle-height);
  border-radius: 999px;
  background: var(--reader-green);
  box-shadow: 0 0 0 1px var(--app-reader-paper-a72);
  transform: translateX(-50%);
}

.reader-selection-handle::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 4px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--reader-paper);
  border-radius: 999px;
  background: var(--reader-green);
  box-shadow: 0 1px 4px var(--app-shadow-a24);
  transform: translateX(-50%);
}

.reader-selection-handle:hover::after,
.reader-selection-handle:focus-visible::after {
  box-shadow: 0 0 0 3px var(--app-reader-primary-a20),0 1px 4px var(--app-shadow-a24);
}

.reader-selection-handle:focus-visible {
  outline: 0;
}

.reader-selection-menu {
  position: absolute;
}

.reader-selection-menu button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--app-reader-selection-menu-fg);
  font-family: var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size: 13px;
  font-weight: 750;
  padding: 0 12px;
}

.reader-note {
  margin-bottom: 14px;
}

.reader-muted {
  margin: 8px 0 0;
  color: var(--reader-muted);
  font-family: var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size: 13px;
  line-height: 1.6;
}

.reader-note.is-active {
  border-color: var(--app-reader-ink-a32);
  box-shadow: 0 0 0 3px var(--app-reader-ink-a8),var(--app-reader-note-shadow);
}

.reader-comment {
  display: grid;
  font-family: var(--font-ui, ui-sans-serif, system-ui, sans-serif);
}

.reader-comment span {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 999px;
  background: var(--reader-green);
  color: var(--reader-paper);
  font-size: 11px;
}

.reader-comment p {
  margin: 0;
  color: var(--app-reader-note-quote-text);
  font-size: 13px;
  line-height: 1.55;
}

@keyframes reader-spin {
  to {
    transform: rotate(360deg);
  }
}

.reader-note textarea,.reader-composer textarea {
  width: 100%;
  min-height: 74px;
  resize: vertical;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--app-reader-composer-border);
  border-radius: 12px;
  background: var(--reader-paper);
  color: var(--reader-ink);
  font-family: var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size: 13px;
  line-height: 1.5;
  outline: none;
}

.reader-agent-menu {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% - 8px);
  display: grid;
  border: 1px solid var(--app-reader-agent-panel-border);
  background: var(--reader-paper);
  box-shadow: var(--reader-elevated-shadow);
}

.reader-agent-menu button {
  display: grid;
  align-items: center;
  border: 0;
  background: transparent;
  text-align: left;
}

.reader-agent-menu button:hover {
  background: var(--app-reader-agent-panel-hover-bg);
}

.reader-agent-menu em {
  color: var(--reader-muted);
}

.reader-delete-note {
  margin-right: auto;
  font-size: 12px;
}

.reader-kbd {
  align-items: center;
  justify-content: center;
  border: 1px solid var(--app-reader-ink-a16);
  border-bottom-color: var(--app-reader-ink-a24);
  border-radius: 6px;
  background: var(--reader-paper);
  box-shadow: 0 1px 0 var(--app-reader-ink-a12);
  color: var(--reader-ink);
}

.reader-composer {
  border: 1px solid var(--app-reader-composer-border);
}

@media(max-width:940px) {

  .reader-toc {
    display: none;
  }
}

.reader-article {
  background: var(--reader-content-bg,var(--reader-paper));
}

.reader-article-body.is-translation-select-disabled {
  user-select: none;
  -webkit-user-select: none;
}

.reader-selection-copy-icon.t-icon-swap {
  position: relative;
  display: inline-grid;
  width: 15px;
  height: 15px;
  place-items: center;
  flex: 0 0 auto;
  --reader-icon-swap-dur: 250ms;
  --reader-icon-swap-blur: 2px;
  --reader-icon-swap-start-scale: .25;
  --reader-icon-swap-ease: ease-in-out;
  --icon-swap-dur: var(--reader-icon-swap-dur);
  --icon-swap-blur: var(--reader-icon-swap-blur);
  --icon-swap-start-scale: var(--reader-icon-swap-start-scale);
  --icon-swap-ease: var(--reader-icon-swap-ease);
}

.reader-selection-copy-icon .t-icon {
  grid-area: 1/1;
  display: grid;
  place-items: center;
  transition: opacity var(--icon-swap-dur) var(--icon-swap-ease),filter var(--icon-swap-dur) var(--icon-swap-ease),transform var(--icon-swap-dur) var(--icon-swap-ease);
  will-change: opacity,filter,transform;
}

.reader-selection-copy-icon[data-state="a"] .t-icon[data-icon="a"],
.reader-selection-copy-icon[data-state="b"] .t-icon[data-icon="b"] {
  opacity: 1;
  filter: blur(0);
  transform: scale(1);
}

.reader-selection-copy-icon[data-state="a"] .t-icon[data-icon="b"],
.reader-selection-copy-icon[data-state="b"] .t-icon[data-icon="a"] {
  opacity: 0;
  filter: blur(var(--icon-swap-blur));
  transform: scale(var(--icon-swap-start-scale));
}

@media(prefers-reduced-motion:reduce) {
  .reader-selection-copy-icon .t-icon {
    transition: none!important;
    will-change: auto;
  }
}

.reader-surface-frame>.reader-surface {
  height: 100%;
}

`;
