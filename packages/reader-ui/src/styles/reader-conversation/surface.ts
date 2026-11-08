export const surfaceStyles = `.reader-article {
  padding:clamp(34px,4vw,56px) clamp(28px,4.6vw,64px)
}
.reader-toc-toggle {
  display:grid;
  position:relative;
  overflow:hidden;
  --reader-toc-motion:cubic-bezier(.22,1,.36,1)
}
.reader-toc-toggle::before {
  content:"";
  position:absolute;
  inset:4px;
  border-radius:5px;
  background:var(--app-reader-ink-a8);
  opacity:0;
  transform:scale(.74);
  transition:opacity .18s ease,transform .2s var(--reader-toc-motion)
}
.reader-toc-toggle.is-active::before {
  opacity:1;
  transform:scale(1)
}
.reader-toc-toggle-icon {
  position:relative;
  z-index:1;
  display:block;
  color:currentColor
}
.reader-toc-toggle-frame {
  fill:none;
  stroke:currentColor;
  stroke-width:1.8;
  transition:stroke-width .18s ease,transform .22s var(--reader-toc-motion);
  transform-box:fill-box;
  transform-origin:center
}
.reader-toc-toggle-rail {
  fill:currentColor;
  transform-box:fill-box;
  transform-origin:left center;
  transition:opacity .18s ease,transform .24s var(--reader-toc-motion)
}
.reader-toc-toggle.is-active .reader-toc-toggle-frame {
  stroke-width:1.65
}
.reader-toc-toggle.is-active .reader-toc-toggle-rail {
  transform:scaleX(2.08)
}
.reader-annotation-nav {
  display:inline-flex;
  align-items:center;
  gap:4px;
  padding:3px;
  border:1px solid var(--reader-ink-subtle);
  border-radius:999px;
  background:var(--reader-paper)
}
.reader-annotation-nav .reader-icon-button {
  width:30px;
  height:30px;
  border-color:transparent;
  background:transparent
}
.reader-annotation-nav .reader-icon-button:hover:not(:disabled) {
  background:var(--app-reader-toolbar-control-hover-bg)
}
.reader-annotation-nav .reader-icon-button:disabled {
  cursor:not-allowed;
  opacity:.34
}
.reader-responsive-scrim {
  display:none;
  position:fixed;
  inset:76px 0 0;
  z-index:5;
  border:0;
  background:var(--app-reader-scrim);
  backdrop-filter:blur(2px);
  padding:0
}
.reader-surface-frame {
  position:relative;
  min-width:0;
  min-height:0;
  overflow:hidden;
  container:reader-surface / inline-size
}
.reader-surface {
  height:100%;
  padding:42px clamp(28px,4vw,56px) 84px;
  overflow:auto
}
.reader-edge-blur {
  position:absolute;
  left:0;
  right:0;
  z-index:120;
  height:38px;
  overflow:hidden;
  pointer-events:none
}
.reader-edge-blur.is-top {
  top:0
}
.reader-edge-blur.is-bottom {
  bottom:0
}
.reader-edge-blur::before,.reader-edge-blur span {
  position:absolute;
  inset:0
}
.reader-edge-blur::before {
  content:"";
  z-index:1;
  background:var(--app-reader-edge-blur-top)
}
.reader-edge-blur.is-bottom::before {
  background:var(--app-reader-edge-blur-bottom)
}
.reader-edge-blur span {
  z-index:2;
  backdrop-filter:blur(var(--reader-edge-blur-radius));
  -webkit-backdrop-filter:blur(var(--reader-edge-blur-radius));
  -webkit-mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%);
  mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%)
}
.reader-edge-blur.is-bottom span {
  -webkit-mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%);
  mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%)
}
.reader-edge-blur span:nth-child(1) {
  --reader-edge-blur-radius:1px;
  opacity:.82
}
.reader-edge-blur span:nth-child(2) {
  --reader-edge-blur-radius:3px;
  opacity:.58
}
.reader-edge-blur span:nth-child(3) {
  --reader-edge-blur-radius:6px;
  opacity:.36
}
.reader-edge-blur span:nth-child(4) {
  --reader-edge-blur-radius:10px;
  opacity:.2
}
.reader-app {
  --reader-annotation-rail-width:360px}
.reader-canvas {
  position:relative;
  width:100%;
  max-width:none;
  margin:0 auto
}
.reader-article {
  width:min(var(--reader-content-width),100%);
  max-width:100%;
  margin:0 auto
}
.reader-annotation-rail {
  position:absolute;
  inset:0;
  min-height:100%;
  font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  pointer-events:none
}
.reader-annotation-rail>.reader-empty {
  position:absolute;
  left:var(--reader-empty-left,0);
  top:var(--reader-empty-top,50vh);
  width:var(--reader-note-width,var(--reader-annotation-rail-width));
  pointer-events:auto;
  transform:translateY(-50%)
}
.reader-annotation-rail>.reader-note {
  position:absolute;
  width:var(--reader-note-width,var(--reader-annotation-rail-width));
  margin:0;
  pointer-events:auto;
  transition:opacity .18s ease,filter .2s ease,transform var(--reader-note-move-duration,.22s) cubic-bezier(.22,1,.36,1),clip-path .24s cubic-bezier(.22,1,.36,1),box-shadow .22s ease,border-color .16s ease
}
.reader-annotation-rail>.reader-note.is-filtering-out {
  opacity:0;
  filter:blur(2px);
  pointer-events:none
}
.reader-annotation-rail>.reader-note.is-stacked {
  clip-path:inset(-36px -80px var(--stack-clip-bottom,-80px) -80px);
  transform:rotate(var(--stack-rotate,0deg));
  transform-origin:100% 0
}
.reader-annotation-rail>.reader-note.is-stacked .reader-note-tab {
  translate:var(--stack-tab-x,0px) 0;
  transition:translate .24s cubic-bezier(.22,1,.36,1)
}
.reader-annotation-rail>.reader-note[data-rail-side="left"].is-stacked {
  transform:rotate(calc(var(--stack-rotate,0deg) * -1));
  transform-origin:0 0
}
.reader-annotation-rail>.reader-note.is-stack-front {
  --reader-note-move-duration:.28s;
  box-shadow:var(--app-float-shadow)
}
.reader-annotation-rail>.reader-note.is-stack-front.is-active {
  box-shadow:var(--app-float-shadow),0 0 0 3px var(--app-interactive-selected-bg)
}
.reader-annotation-rail>.reader-note.is-stacked:not(.is-stack-front) {
  box-shadow:var(--app-card-shadow);
  filter:brightness(.985)
}
.reader-annotation-rail>.reader-note.has-discussion.is-stacked:not(.is-stack-front) .reader-note-tab {
  color:var(--reader-muted)
}
.reader-annotation-rail>.reader-note.is-stacked:not(.is-stack-front)[data-rail-offscreen] {
  visibility:hidden
}
.reader-annotation-rail>.reader-note.is-stacked:not(.is-stack-front) .reader-note-toolbar {
  pointer-events:none
}
@media (prefers-reduced-motion:reduce) {
  .reader-annotation-rail>.reader-note.is-stacked {
    transition-property:opacity,filter,box-shadow,border-color
  }
  .reader-annotation-rail>.reader-note.is-stacked .reader-note-tab {
    transition:none
  }
}`;
