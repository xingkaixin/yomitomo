import { readerBodyLineHeight } from './reader-settings';

export const readerConversationStyles = `
.reader-app{--app-viewport-height:100vh;--reader-z-toolbar:var(--app-z-dropdown,140);--reader-z-popover:var(--app-z-popover,160);--reader-z-panel:var(--app-z-panel,190);--reader-z-modal:var(--app-z-modal,320);--reader-z-tooltip:var(--app-z-tooltip,340);--dropdown-open-dur:250ms;--dropdown-close-dur:150ms;--dropdown-pre-scale:.97;--dropdown-closing-scale:.99;--dropdown-ease:cubic-bezier(.22,1,.36,1);--reader-ink-weak:color-mix(in srgb,var(--reader-ink) 34%,transparent);--reader-ink-subtle:color-mix(in srgb,var(--reader-ink) 12%,transparent);--reader-ink-hairline:color-mix(in srgb,var(--reader-ink) 8%,transparent);--reader-paper-hover:color-mix(in srgb,var(--reader-ink) 6%,var(--reader-paper));--reader-paper-panel:color-mix(in srgb,var(--app-reader-note-bg) 74%,var(--reader-paper));--reader-elevated-shadow:0 18px 48px color-mix(in srgb,var(--reader-ink) 16%,transparent);--reader-soft-shadow:0 8px 20px color-mix(in srgb,var(--reader-ink) 6%,transparent)}
@supports (height:100dvh){.reader-app{--app-viewport-height:100dvh}}
.reader-kbd{display:inline-grid;min-width:18px;height:18px;place-items:center;font-family:var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);font-size:9px;font-weight:780;line-height:1;padding:0 5px}.reader-kbd-symbol{font-size:11px;padding:0}.reader-add-comment span,.reader-composer .floating-composer-actions button>span{font-size:10px;font-weight:730}
.t-dropdown{transform-origin:top left;transform:scale(var(--dropdown-pre-scale));opacity:0;pointer-events:none;transition:transform var(--dropdown-open-dur) var(--dropdown-ease),opacity var(--dropdown-open-dur) var(--dropdown-ease);will-change:transform,opacity}
.t-dropdown[data-origin="top-right"]{transform-origin:top right}.t-dropdown[data-origin="top-center"]{transform-origin:top center}.t-dropdown[data-origin="bottom-left"]{transform-origin:bottom left}.t-dropdown[data-origin="bottom-center"]{transform-origin:bottom center}.t-dropdown[data-origin="bottom-right"]{transform-origin:bottom right}
.t-dropdown.is-open{transform:scale(1);opacity:1;pointer-events:auto}.t-dropdown.is-closing{transform:scale(var(--dropdown-closing-scale));opacity:0;pointer-events:none;transition:transform var(--dropdown-close-dur) var(--dropdown-ease),opacity var(--dropdown-close-dur) var(--dropdown-ease)}
.reader-main{grid-template-columns:minmax(0,1fr)}
.reader-brand{min-width:0}
.reader-toolbar{position:relative;display:grid;grid-template-columns:minmax(112px,1fr) minmax(0,2fr) minmax(112px,1fr);align-items:center;gap:18px;border-bottom:0;padding:14px 28px 17px;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);-webkit-app-region:drag}
.reader-back{display:inline-flex;min-width:0;min-height:40px;align-items:center;justify-self:start;gap:6px;border:0;border-radius:6px;background:transparent;color:var(--reader-muted);font:inherit;font-size:14px;font-weight:820;padding:0 8px;transition:background-color .14s ease,color .14s ease,transform .14s ease}
.reader-back span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-back:hover,.reader-back:focus-visible{background:var(--app-reader-toolbar-control-hover-bg);color:var(--reader-ink);outline:0}
.reader-back:active{transform:scale(.96)}
.reader-toolbar-article{display:flex;flex:1 1 auto;align-items:center;gap:12px;min-width:0;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-toolbar>.reader-toolbar-article{grid-column:2;justify-content:center;text-align:center}
.reader-toolbar-article-visual{display:grid;flex:0 0 auto;place-items:center}
.reader-toolbar-article-copy{display:grid;gap:5px;min-width:0;justify-items:center;text-align:center}
.reader-toolbar-article.has-cover .reader-toolbar-article-copy{justify-items:center}
.reader-toolbar-article-title{overflow:hidden;color:var(--reader-ink);font-size:15px;font-weight:920;line-height:1.18;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;margin:0;color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.25}
.reader-toolbar-article-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta span+span::before{content:"";display:inline-block;width:4px;height:4px;margin-right:8px;border-radius:999px;background:var(--reader-ink-weak);vertical-align:2px}
.reader-toolbar-article-action{display:flex;flex:0 0 auto;align-items:center;gap:8px}
.reader-toolbar>.reader-toolbar-actions{grid-column:3;display:flex;min-width:0;align-items:center;justify-content:flex-end;gap:8px}
.reader-back,.reader-toolbar-actions,.reader-toolbar-article-action,.reader-toolbar button{-webkit-app-region:no-drag}
.reader-toolbar-progress{position:absolute;left:0;right:0;bottom:0;height:3px;overflow:hidden;background:var(--app-reader-toolbar-progress-track);pointer-events:none}
.reader-toolbar-progress span{display:block;height:100%;border-radius:0 999px 999px 0;background:var(--app-reader-toolbar-progress-fill);transition:width .18s ease}
.reader-floating-toolbar{position:fixed;left:50%;top:88px;z-index:var(--reader-z-toolbar);display:flex;max-width:min(820px,calc(100vw - 32px));align-items:center;gap:5px;overflow:visible;padding:3px 6px;border:1px solid var(--app-reader-toolbar-border);border-radius:6px;background:var(--app-reader-toolbar-bg);box-shadow:var(--reader-soft-shadow),inset 0 1px 0 color-mix(in srgb,var(--reader-paper) 58%,transparent);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-variant-numeric:tabular-nums;scrollbar-width:none;transform:translateX(-50%);-webkit-app-region:no-drag}
.reader-floating-toolbar::-webkit-scrollbar{display:none}
.reader-floating-toolbar-group,.reader-floating-toolbar-controls{display:inline-flex;align-items:center;gap:4px;min-width:max-content}
.reader-floating-toolbar-group+.reader-annotation-nav,.reader-annotation-nav+.reader-floating-toolbar-group,.reader-floating-toolbar-controls{position:relative;margin-left:5px;padding-left:9px}
.reader-floating-toolbar-group+.reader-annotation-nav::before,.reader-annotation-nav+.reader-floating-toolbar-group::before,.reader-floating-toolbar-controls::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:1px;background:var(--reader-ink-subtle)}
.reader-floating-toolbar-controls>*+*{position:relative;margin-left:5px;padding-left:9px}
.reader-floating-toolbar-controls>*+*::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:1px;background:var(--reader-ink-subtle)}
.reader-floating-toolbar .reader-icon-button,.reader-floating-toolbar .reader-close{width:30px;height:30px;min-height:30px;border-color:transparent;border-radius:6px;background:transparent;box-shadow:none;color:var(--reader-ink);transition:transform .14s ease}
.reader-floating-toolbar .reader-icon-button:hover:not(:disabled),.reader-floating-toolbar .reader-icon-button.is-active,.reader-floating-toolbar .reader-close:hover:not(:disabled){background:transparent;color:var(--reader-ink)}
.reader-floating-toolbar .reader-icon-button:active:not(:disabled),.reader-floating-toolbar .reader-close:active:not(:disabled){transform:scale(.96)}
.reader-floating-toolbar .reader-icon-button.is-busy svg,.reader-translation-confirm-actions .is-primary svg{animation:reader-spin .8s linear infinite}
.reader-translation-menu{display:grid;min-width:178px;gap:3px;padding:6px;border:1px solid var(--app-reader-toolbar-border);border-radius:8px;background:var(--app-reader-toolbar-bg);box-shadow:var(--reader-soft-shadow),inset 0 1px 0 color-mix(in srgb,var(--reader-paper) 58%,transparent);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-translation-menu button{display:grid;grid-template-columns:20px minmax(0,1fr);align-items:center;gap:8px;height:34px;border:0;border-radius:6px;background:transparent;color:var(--reader-ink);font:inherit;font-size:12px;font-weight:820;padding:0 9px;text-align:left;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-translation-menu button:hover:not(:disabled){background:var(--app-reader-toolbar-control-hover-bg)}
.reader-translation-menu button:active:not(:disabled){transform:scale(.97)}
.reader-translation-menu button:disabled{cursor:not-allowed;opacity:.45}
.reader-translation-menu button.is-danger{color:var(--reader-red,var(--app-reader-danger,#8a3f32))}
.reader-translation-menu span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-translation-confirm-overlay{position:fixed;inset:0;z-index:var(--reader-z-modal);display:grid;place-items:center;padding:22px;background:color-mix(in srgb,var(--reader-ink) 18%,transparent);backdrop-filter:blur(4px);animation:reader-dialog-fade-in .16s ease}
.reader-translation-confirm{display:grid;width:min(380px,calc(100vw - 44px));gap:11px;border:1px solid var(--app-reader-composer-border);border-radius:14px;background:var(--app-reader-composer-bg);box-shadow:var(--reader-elevated-shadow);color:var(--reader-ink);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);padding:18px;animation:reader-dialog-pop-in .18s cubic-bezier(.22,1,.36,1)}
.reader-translation-confirm h2{margin:0;color:var(--reader-ink);font-size:16px;font-weight:920;line-height:1.25}
.reader-translation-confirm p{margin:0;color:var(--reader-muted);font-size:13px;font-weight:650;line-height:1.58}
.reader-translation-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
.reader-translation-confirm-actions button{display:inline-flex;min-width:72px;height:34px;align-items:center;justify-content:center;gap:6px;border:0;border-radius:8px;background:var(--app-reader-toolbar-control-hover-bg);color:var(--reader-ink);font:inherit;font-size:12px;font-weight:850;padding:0 12px;transition:background .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-translation-confirm-actions button:hover:not(:disabled){box-shadow:0 6px 14px color-mix(in srgb,var(--reader-ink) 8%,transparent)}
.reader-translation-confirm-actions button:active:not(:disabled){transform:scale(.97)}
.reader-translation-confirm-actions button:disabled{cursor:not-allowed;opacity:.5}
.reader-translation-confirm-actions .is-primary{background:var(--reader-ink);color:var(--reader-paper)}
.reader-translation-confirm-actions .is-danger{background:var(--reader-red,var(--app-reader-danger,#8a3f32));color:var(--app-reader-paper,#fff)}
@keyframes reader-dialog-fade-in{from{opacity:0}to{opacity:1}}
@keyframes reader-dialog-pop-in{from{opacity:0;transform:scale(.96) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
.reader-floating-toolbar .reader-annotation-nav{height:30px;gap:2px;border-color:transparent;border-radius:6px;background:transparent}
.reader-annotation-nav-icon{color:var(--reader-muted)}
.reader-floating-toolbar .reader-annotation-nav .reader-icon-button{width:24px;height:28px;min-height:28px;border-radius:6px}
.reader-floating-toolbar.is-searching{gap:4px;max-width:min(560px,calc(100vw - 32px));padding-left:8px}
.reader-search-box{display:inline-flex;width:min(280px,42vw);min-width:180px;height:30px;align-items:center;gap:7px;color:var(--reader-muted)}
.reader-search-box input{width:100%;min-width:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:var(--reader-ink);font:inherit;font-size:12px;font-weight:760;line-height:1;outline:0;appearance:none;-webkit-appearance:none}
.reader-search-box input:focus,.reader-search-box input:focus-visible{border:0;box-shadow:none;outline:0}
.reader-search-box input::placeholder{color:var(--reader-muted)}
.reader-search-box input::-webkit-search-cancel-button{display:none}
.reader-floating-value.is-search-count{min-width:48px}
.reader-floating-control-group{display:inline-flex;align-items:center;gap:2px;min-width:max-content;padding:0}
.reader-floating-value{display:inline-flex;min-width:42px;height:30px;align-items:center;justify-content:center;color:var(--reader-muted);font-size:11px;font-weight:820;font-variant-numeric:tabular-nums;white-space:nowrap}
.reader-floating-value.is-wide{min-width:58px}
.reader-floating-value.is-annotation-progress{min-width:34px}
.reader-floating-slider{width:92px;min-width:72px;max-width:13vw}
.reader-toolbar-popover{width:190px;padding:9px;border:1px solid var(--app-reader-toolbar-border);border-radius:8px;background:var(--app-reader-toolbar-bg);box-shadow:var(--reader-soft-shadow),inset 0 1px 0 color-mix(in srgb,var(--reader-paper) 58%,transparent)}
.reader-toolbar-popover-slider-row{display:grid;grid-template-columns:24px minmax(0,1fr) 24px auto;align-items:center;gap:7px}
.reader-toolbar-popover-slider-row strong{min-width:38px;color:var(--reader-ink);font-size:12px;font-weight:850;text-align:right}
.reader-toolbar-popover-step{display:grid;width:24px;height:24px;place-items:center;border:0;border-radius:6px;background:transparent;color:var(--reader-ink);font:inherit}
.reader-toolbar-popover-slider{width:100%;accent-color:var(--reader-ink)}
.reader-toolbar-popover-slider::-webkit-slider-runnable-track{height:4px;border-radius:999px;background:linear-gradient(to right,var(--reader-ink) 0 var(--reader-toolbar-slider-percent,0%),var(--reader-ink-subtle) var(--reader-toolbar-slider-percent,0%) 100%)}
.reader-toolbar-popover-slider::-webkit-slider-thumb{width:15px;height:15px;margin-top:-5.5px;border:2px solid var(--reader-paper);border-radius:999px;background:var(--reader-ink);box-shadow:0 2px 7px color-mix(in srgb,var(--reader-ink) 16%,transparent);appearance:none}
.reader-article{padding:clamp(34px,4vw,56px) clamp(28px,4.6vw,64px)}
.reader-toc-toggle{display:grid;position:relative;overflow:hidden;--reader-toc-motion:cubic-bezier(.22,1,.36,1)}
.reader-toc-toggle::before{content:"";position:absolute;inset:4px;border-radius:5px;background:color-mix(in srgb,var(--reader-ink) 8%,transparent);opacity:0;transform:scale(.74);transition:opacity .18s ease,transform .2s var(--reader-toc-motion)}
.reader-toc-toggle.is-active::before{opacity:1;transform:scale(1)}
.reader-toc-toggle-icon{position:relative;z-index:1;display:block;color:currentColor}
.reader-toc-toggle-frame{fill:none;stroke:currentColor;stroke-width:1.8;transition:stroke-width .18s ease,transform .22s var(--reader-toc-motion);transform-box:fill-box;transform-origin:center}
.reader-toc-toggle-rail{fill:currentColor;transform-box:fill-box;transform-origin:left center;transition:opacity .18s ease,transform .24s var(--reader-toc-motion)}
.reader-toc-toggle.is-active .reader-toc-toggle-frame{stroke-width:1.65}
.reader-toc-toggle.is-active .reader-toc-toggle-rail{transform:scaleX(2.08)}
	.reader-annotation-nav{display:inline-flex;align-items:center;gap:4px;padding:3px;border:1px solid var(--reader-ink-subtle);border-radius:999px;background:var(--reader-paper)}
	.reader-annotation-nav .reader-icon-button{width:30px;height:30px;border-color:transparent;background:transparent}
	.reader-annotation-nav .reader-icon-button:hover:not(:disabled){background:var(--app-reader-toolbar-control-hover-bg)}
	.reader-annotation-nav .reader-icon-button:disabled{cursor:not-allowed;opacity:.34}
.reader-responsive-scrim{display:none;position:fixed;inset:76px 0 0;z-index:5;border:0;background:var(--app-reader-scrim);backdrop-filter:blur(2px);padding:0}
.reader-highlight{background:rgba(234,216,157,.28);box-shadow:0 0 0 1px rgba(199,164,94,.18)}
.reader-highlight.is-active{background:rgba(234,216,157,.42)}
.reader-surface-frame{position:relative;min-width:0;min-height:0;overflow:hidden;container:reader-surface / inline-size}
.reader-surface{height:100%;padding:42px clamp(28px,4vw,56px) 84px;overflow:auto}
.reader-edge-blur{position:absolute;left:0;right:0;z-index:120;height:38px;overflow:hidden;pointer-events:none}
.reader-edge-blur.is-top{top:0}
.reader-edge-blur.is-bottom{bottom:0}
.reader-edge-blur::before,.reader-edge-blur span{position:absolute;inset:0}
.reader-edge-blur::before{content:"";z-index:1;background:var(--app-reader-edge-blur-top)}
.reader-edge-blur.is-bottom::before{background:var(--app-reader-edge-blur-bottom)}
.reader-edge-blur span{z-index:2;backdrop-filter:blur(var(--reader-edge-blur-radius));-webkit-backdrop-filter:blur(var(--reader-edge-blur-radius));-webkit-mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%);mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%)}
.reader-edge-blur.is-bottom span{-webkit-mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%);mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%)}
.reader-edge-blur span:nth-child(1){--reader-edge-blur-radius:1px;opacity:.82}
.reader-edge-blur span:nth-child(2){--reader-edge-blur-radius:3px;opacity:.58}
.reader-edge-blur span:nth-child(3){--reader-edge-blur-radius:6px;opacity:.36}
.reader-edge-blur span:nth-child(4){--reader-edge-blur-radius:10px;opacity:.2}
.reader-app{--reader-annotation-rail-width:360px;--reader-annotation-rail-gap:20px}
.reader-canvas{position:relative;width:100%;max-width:none;margin:0 auto}
.reader-article{width:min(var(--reader-content-width),100%);max-width:100%;margin:0 auto}
.reader-annotation-rail{position:absolute;inset:0;min-height:100%;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);pointer-events:none}
.reader-annotation-rail>.reader-empty{position:absolute;left:var(--reader-empty-left,0);top:var(--reader-empty-top,50vh);width:var(--reader-note-width,var(--reader-annotation-rail-width));pointer-events:auto;transform:translateY(-50%)}
.reader-annotation-rail>.reader-note{position:absolute;width:var(--reader-note-width,var(--reader-annotation-rail-width));margin:0;pointer-events:auto;transform-origin:top center;transition:opacity .18s ease,filter .2s ease,transform .22s cubic-bezier(.22,1,.36,1),box-shadow .22s ease,border-color .16s ease}
.reader-annotation-rail>.reader-note.is-filtering-out{opacity:0;filter:blur(2px);pointer-events:none}
.reader-annotation-rail>.reader-note.is-stacked{transform:translate(var(--stack-offset,0px),var(--stack-offset-y,0px)) scale(var(--stack-scale,1))}
.reader-annotation-rail>.reader-note[data-rail-side="left"].is-stacked{transform:translate(calc(var(--stack-offset,0px) * -1),var(--stack-offset-y,0px)) scale(var(--stack-scale,1))}
.reader-annotation-rail>.reader-note.is-stack-front{box-shadow:var(--reader-elevated-shadow)}
.reader-annotation-rail>.reader-note.is-stacked:not(.is-stack-front){box-shadow:var(--reader-soft-shadow);filter:brightness(.985)}
.reader-annotation-rail>.reader-note.is-stacked:not(.is-stack-front) .reader-note-toolbar{pointer-events:none}
.reader-notes{padding:0 16px 32px;scroll-padding-top:80px}
.reader-notes-header{margin:0 -16px 14px;padding:14px 16px;background:var(--app-reader-toc-bg);box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 5%,transparent)}
.reader-note{scroll-margin-top:86px;border:1px solid var(--reader-ink-subtle);border-radius:18px;padding:14px;background:var(--reader-paper);box-shadow:var(--reader-soft-shadow)}
.reader-empty{display:grid;justify-items:center;gap:14px;margin:0;padding:18px 4px;border:0!important;border-radius:0;background:transparent!important;box-shadow:none!important;color:var(--reader-ink);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);text-align:center}
.reader-empty-icon{display:grid;width:56px;height:56px;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--reader-yellow) 12%,var(--reader-paper));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--reader-ink) 5%,transparent);color:color-mix(in srgb,var(--reader-yellow-strong) 78%,var(--reader-ink))}
.reader-empty strong{max-width:260px;color:var(--reader-ink);font-size:20px;font-weight:900;line-height:1.25;text-wrap:balance}
.reader-empty p{max-width:270px;margin:0;color:var(--reader-muted);font-size:13px;font-weight:650;line-height:1.65;text-wrap:pretty}
.reader-empty-gesture{display:grid;width:min(260px,100%);justify-items:center;gap:9px;margin-top:8px}
.reader-empty-gesture-card{display:grid;width:100%;gap:8px;padding:11px 14px;border-radius:8px;background:var(--reader-paper);box-shadow:0 0 0 1px color-mix(in srgb,var(--reader-ink) 7%,transparent),0 8px 20px color-mix(in srgb,var(--reader-ink) 6%,transparent)}
.reader-empty-line{position:relative;display:block;height:7px;overflow:hidden;border-radius:999px;background:color-mix(in srgb,var(--reader-muted) 14%,transparent)}
.reader-empty-line.is-short{width:68%;justify-self:center}
.reader-empty-line.is-medium{width:72%}
.reader-empty-line.has-highlight i{position:absolute;left:36%;top:0;bottom:0;width:44%;border-radius:inherit;background:color-mix(in srgb,var(--reader-yellow-strong) 58%,var(--reader-yellow))}
.reader-empty-gesture-arrow{width:9px;height:9px;border-right:2px solid color-mix(in srgb,var(--reader-muted) 46%,transparent);border-bottom:2px solid color-mix(in srgb,var(--reader-muted) 46%,transparent);transform:rotate(45deg)}
.reader-empty-gesture-card.is-note{grid-template-columns:18px minmax(0,1fr);align-items:center}
.reader-empty-gesture-card.is-note .reader-empty-line{grid-column:2}
.reader-empty-quote-mark{grid-row:1/3;align-self:start;color:var(--reader-yellow-strong);font-size:20px;font-weight:900;line-height:1}
.reader-empty-quote-mark::before{content:"“"}
.reader-note-action-row{display:flex;align-items:center;gap:6px;margin-bottom:10px;min-width:0}
.reader-note-action-row time{margin-left:auto;color:var(--reader-muted);font-size:11px;font-weight:760;white-space:nowrap}
.reader-note-anchor{display:grid;gap:8px}
.reader-note-anchor .reader-note-persona{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;margin:0;color:var(--reader-ink);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-note-persona .reader-avatar-badge{width:28px;height:28px}
.reader-note-persona strong{overflow:hidden;font-size:13px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-note-persona em{color:var(--reader-muted);font-size:12px;font-style:normal;font-weight:700}
.reader-note-quote{display:block;width:100%;margin-top:10px;padding:9px 11px;border:0;border-left:3px solid rgba(199,164,94,.72);border-radius:4px 10px 10px 4px;background:var(--app-reader-note-quote-bg);color:var(--app-reader-note-quote-text);font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif);font-size:12px;font-style:italic;font-weight:600;line-height:1.45;text-align:left;text-decoration:none}
.reader-note-primary-comment{margin-top:11px;color:var(--app-reader-note-quote-text);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-note-primary-comment .reader-markdown,.reader-note-primary-comment .reader-markdown p{font-size:13px;font-weight:760;line-height:1.62}
.reader-comments{display:grid;gap:12px;margin-top:14px}
.reader-comment{grid-template-columns:32px minmax(0,1fr);gap:10px;margin-top:0}
.reader-comment .reader-avatar-badge{width:30px;height:30px}
.reader-note-anchor .reader-avatar-badge,.reader-comment .reader-avatar-badge,.reader-agent-menu .reader-avatar-badge,.reader-agent-annotate-menu .reader-avatar-badge,.reader-virtual-label .reader-avatar-badge{display:grid;place-items:center;overflow:hidden;border-radius:999px;background:var(--reader-green);color:white;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:800;padding:0;margin:0}
.reader-avatar-badge.is-image{background:transparent;color:inherit}
.reader-avatar-badge img{width:100%;height:100%;object-fit:cover;border-radius:999px}
.reader-avatar-badge.is-svg img{object-fit:contain}
.reader-agent-menu{z-index:12;gap:3px;max-height:min(320px,calc(var(--app-viewport-height) - 40px));overflow:auto;padding:6px;border-radius:12px;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;line-height:1.2}
.reader-agent-menu button{grid-template-columns:24px minmax(0,1fr);min-height:34px;gap:7px;border-radius:9px;color:var(--reader-ink);font:inherit;padding:5px 6px}
.reader-agent-menu button.is-active{background:var(--reader-paper-hover)}
.reader-agent-menu .reader-avatar-badge{width:24px;height:24px}
.reader-agent-menu strong{overflow:hidden;font-size:12px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-agent-menu em{overflow:hidden;font-size:11px;font-style:normal;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.reader-highlight.is-temporary{background:rgba(77,155,114,.14);box-shadow:0 0 0 1px rgba(77,155,114,.2)}
.reader-highlight.is-agent-theater{background:rgba(77,155,114,.18);box-shadow:0 0 0 1px rgba(77,155,114,.22)}
.reader-highlight.is-search{background:rgba(244,201,93,.2);box-shadow:0 0 0 1px rgba(189,142,42,.28);pointer-events:none}
.reader-selection-menu{display:inline-flex;align-items:center;gap:5px;width:max-content;border:1px solid var(--app-reader-selection-menu-border);border-radius:999px;background:var(--reader-paper);box-shadow:var(--app-reader-selection-menu-shadow);backdrop-filter:blur(18px);padding:6px;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-selection-menu>button{justify-content:flex-start;color:var(--reader-ink);gap:6px}
.reader-selection-primary{height:36px;border:1px solid var(--reader-ink-hairline);background:var(--reader-paper);box-shadow:0 3px 10px color-mix(in srgb,var(--reader-ink) 5%,transparent);font-size:13px}
.reader-selection-primary:hover{border-color:color-mix(in srgb,var(--reader-ink) 18%,transparent);background:var(--reader-paper-hover);color:var(--reader-ink)}
.reader-selection-primary.is-copied{border-color:color-mix(in srgb,var(--reader-green) 34%,transparent);background:color-mix(in srgb,var(--reader-green) 10%,var(--reader-paper));color:var(--reader-green)}
.reader-selection-copy-icon.t-icon-swap{position:relative;display:inline-grid;width:15px;height:15px;place-items:center;flex:0 0 auto;--icon-swap-dur:200ms;--icon-swap-blur:2px;--icon-swap-start-scale:.25;--icon-swap-ease:cubic-bezier(.2,0,0,1)}
.reader-selection-copy-icon .t-icon{grid-area:1/1;display:grid;place-items:center;transition:opacity var(--icon-swap-dur) var(--icon-swap-ease),filter var(--icon-swap-dur) var(--icon-swap-ease),transform var(--icon-swap-dur) var(--icon-swap-ease);will-change:opacity,filter,transform}
.reader-selection-copy-icon[data-state="a"] .t-icon[data-icon="a"],.reader-selection-copy-icon[data-state="b"] .t-icon[data-icon="b"]{opacity:1;filter:blur(0);transform:scale(1)}
.reader-selection-copy-icon[data-state="a"] .t-icon[data-icon="b"],.reader-selection-copy-icon[data-state="b"] .t-icon[data-icon="a"]{opacity:0;filter:blur(var(--icon-swap-blur));transform:scale(var(--icon-swap-start-scale))}
.reader-selection-copy-shortcut.is-hidden{opacity:0}
@media (prefers-reduced-motion:reduce){.reader-selection-copy-icon .t-icon{transition:none!important;will-change:auto}}
.reader-selection-agent-actions{display:grid;gap:8px;min-width:0;border-top:1px solid var(--reader-ink-subtle);padding-top:10px}
.reader-selection-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--reader-muted);font-size:11px;font-weight:850;line-height:1}
.reader-selection-heading span{letter-spacing:.04em}
.reader-selection-heading em{color:var(--reader-muted);font-style:normal;font-weight:760}
.reader-selection-action-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.reader-selection-action-grid button{width:100%;min-width:0;height:36px;border:1px solid var(--reader-ink-subtle);border-radius:12px;background:var(--reader-paper);color:var(--reader-muted);padding:0 8px;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,color .14s ease,transform .14s ease}
.reader-selection-action-grid button strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:900}
.reader-selection-action-grid button:hover,.reader-selection-action-grid button.is-active{border-color:rgba(159,91,80,.18);background:rgba(159,91,80,.07);box-shadow:0 4px 12px color-mix(in srgb,var(--reader-ink) 5%,transparent);color:var(--reader-red)}
.reader-selection-action-grid button:active{transform:scale(.96)}
.reader-selection-action-grid button:disabled{cursor:not-allowed;opacity:.42}
.reader-selection-agent-list{display:grid;gap:5px;padding:8px;border-radius:14px;background:var(--reader-paper-panel);color:var(--reader-ink)}
.reader-selection-agent-list strong{font-size:12px;font-weight:900}
.reader-selection-agent-list button{display:grid;grid-template-columns:24px minmax(0,1fr);justify-content:initial;width:100%;height:34px;color:var(--reader-ink);padding:0 8px;text-align:left}
.reader-selection-agent-list button:hover{background:var(--reader-paper-hover)}
.reader-selection-agent-list .reader-avatar-badge{width:24px;height:24px}
.reader-chat-fab{position:fixed;right:22px;bottom:22px;z-index:var(--reader-z-popover);display:grid;width:46px;height:46px;place-items:center;border:1px solid var(--app-reader-chat-panel-border);border-radius:14px;background:var(--app-reader-chat-panel-bg);box-shadow:var(--app-reader-chat-panel-shadow);color:var(--reader-ink);transition:background .16s ease,border-color .16s ease,box-shadow .16s ease,transform .14s ease}
.reader-chat-fab:hover{border-color:var(--app-reader-composer-border);background:var(--app-reader-composer-bg);box-shadow:var(--app-reader-chat-panel-shadow)}
.reader-chat-fab:active{transform:scale(.96)}
.reader-chat-panel{position:fixed;right:22px;bottom:22px;z-index:var(--reader-z-panel);display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:min(410px,calc(100vw - 32px));max-height:min(640px,calc(var(--app-viewport-height) - 112px));overflow:hidden;border:1px solid var(--app-reader-chat-panel-border);border-radius:18px;background:var(--app-reader-chat-panel-bg);box-shadow:var(--app-reader-chat-panel-shadow);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);color:var(--reader-ink)}
.reader-chat-header{display:grid;grid-template-columns:minmax(0,1fr) 34px;align-items:center;gap:10px;padding:14px 14px 10px}
.reader-chat-header>div{display:grid;gap:3px;min-width:0}
.reader-chat-header strong{font-size:14px;font-weight:930;line-height:1.15}
.reader-chat-header button{display:grid;width:34px;height:34px;place-items:center;border:0;border-radius:10px;background:transparent;color:var(--reader-muted);padding:0;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-chat-header button:hover{background:var(--app-reader-toolbar-control-hover-bg);color:var(--reader-ink)}
.reader-chat-header button:active{transform:scale(.96)}
.reader-chat-context{display:grid;gap:7px;margin:0 0 9px;padding:10px;border-radius:12px;background:var(--app-reader-chat-context-bg);box-shadow:inset 0 0 0 1px var(--app-reader-chat-context-border)}
.reader-chat-context-jump{justify-self:start;max-width:100%;overflow:hidden;border:0;background:transparent;color:var(--app-reader-chat-context-fg);font:inherit;font-size:11px;font-weight:850;padding:0;text-align:left;text-overflow:ellipsis;white-space:nowrap}
.reader-chat-context-jump:not(:disabled){cursor:pointer}
.reader-chat-context-jump:not(:disabled):hover{color:var(--reader-ink);text-decoration:underline;text-underline-offset:2px}
.reader-chat-context-jump:disabled{cursor:default}
.reader-chat-context blockquote{max-height:84px;overflow:auto;margin:0;color:var(--app-reader-chat-context-fg);font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif);font-size:13px;font-weight:650;line-height:1.48}
.reader-chat-context button{justify-self:start;border:0;border-radius:999px;background:var(--app-reader-toolbar-control-bg);color:var(--reader-muted);font:inherit;font-size:11px;font-weight:820;padding:5px 9px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-chat-context button:hover{background:var(--app-reader-toolbar-control-hover-bg);color:var(--reader-ink)}
.reader-chat-context button:active{transform:scale(.96)}
.reader-chat-messages{display:grid;align-content:start;gap:11px;min-height:180px;overflow:auto;padding:4px 14px 12px}
.reader-chat-message{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;max-width:94%;min-width:0;align-items:start;font-size:13px;line-height:1.55}
.reader-chat-message>.reader-avatar-badge{width:28px;height:28px;box-shadow:0 2px 7px color-mix(in srgb,var(--reader-ink) 12%,transparent)}
.reader-chat-message p{margin:0;white-space:pre-wrap}
.reader-chat-message.is-user{display:block;justify-self:end}
.reader-chat-message.is-user .reader-chat-message-bubble{border-bottom-right-radius:6px;background:var(--app-reader-chat-user-bubble-bg);color:var(--app-reader-chat-user-bubble-fg)}
.reader-chat-message.is-assistant{justify-self:start}
.reader-chat-message.is-assistant .reader-chat-message-bubble{max-width:100%;border-bottom-left-radius:6px;background:var(--app-reader-chat-assistant-bubble-bg);color:var(--app-reader-chat-assistant-bubble-fg)}
.reader-chat-message-bubble{display:grid;gap:6px;min-width:0;max-width:100%;overflow:hidden;overflow-wrap:anywhere;word-break:break-word;padding:9px 11px;border-radius:14px}
.reader-chat-message-bubble header{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:10px;color:inherit;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-chat-message-bubble strong{min-width:0;overflow:hidden;font-size:11px;font-weight:900;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.reader-chat-message-bubble time{flex:0 0 auto;color:inherit;font-size:10px;font-weight:760;font-variant-numeric:tabular-nums;opacity:.58}
.reader-chat-message-context{display:block;max-height:42px;overflow:hidden;border:0;border-left:3px solid currentColor;background:transparent;color:inherit;font:inherit;font-size:11px;font-weight:760;line-height:1.35;opacity:.62;padding:0 0 0 7px;text-align:left}
.reader-chat-message-context:not(:disabled){cursor:pointer}
.reader-chat-message-context:not(:disabled):hover{opacity:.82;text-decoration:underline;text-underline-offset:2px}
.reader-chat-message-context:disabled{cursor:default}
.reader-chat-markdown{min-width:0;max-width:100%;overflow:hidden;overflow-wrap:anywhere;word-break:break-word;color:inherit;font-size:13px;line-height:1.58}
.reader-chat-markdown *{max-width:100%;overflow-wrap:anywhere;word-break:break-word}
.reader-chat-markdown>:first-child{margin-top:0}
.reader-chat-markdown>:last-child{margin-bottom:0}
.reader-chat-markdown p{margin:0 0 .65em;white-space:normal}
.reader-chat-empty{display:grid;min-height:128px;place-items:center;border:1px dashed var(--app-reader-chat-panel-border);border-radius:14px;color:var(--reader-muted);font-size:13px;font-weight:760}
.reader-chat-error{border-radius:12px;background:color-mix(in srgb,var(--reader-red) 12%,transparent);color:var(--reader-red);font-size:12px;font-weight:760;line-height:1.45;padding:9px 10px}
.reader-chat-composer{position:relative;display:grid;grid-template-rows:minmax(0,auto) auto;gap:9px;min-width:0;overflow:visible;padding:12px 14px 14px;border-top:1px solid var(--app-reader-chat-composer-border);background:var(--app-reader-chat-composer-bg)}
.reader-chat-composer textarea{display:block;width:100%;min-height:54px;max-height:calc(1.55em * 8 + 18px);margin:0;border:0;border-radius:0;background:transparent;color:var(--reader-ink);font:inherit;font-size:13px;line-height:1.55;outline:0;padding:0;resize:none}
.reader-chat-composer textarea:focus,.reader-chat-composer textarea:focus-visible{outline:0;box-shadow:none}
.reader-chat-composer .floating-composer-bar{display:flex;min-width:0;align-items:flex-end;justify-content:space-between;gap:10px}
.reader-chat-composer .floating-composer-actions{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:flex-end;gap:8px;margin-left:auto}
.reader-chat-composer .floating-composer-submit{display:inline-flex;height:32px;align-items:center;justify-content:center;gap:5px;border:0;border-radius:999px;background:var(--app-reader-chat-send-bg);color:var(--app-reader-chat-send-fg);font:inherit;font-size:12px;font-weight:850;padding:0 11px;transition:opacity .14s ease,transform .14s ease}
.reader-chat-composer .floating-composer-submit:active:not(:disabled){transform:scale(.96)}
.reader-chat-composer .floating-composer-submit:disabled{background:var(--app-reader-chat-send-disabled-bg);color:var(--app-reader-chat-send-disabled-fg);cursor:not-allowed;opacity:1}
.reader-chat-agent-tray{display:flex;min-width:0;align-items:center;gap:8px;margin-right:auto;overflow:visible;color:var(--reader-muted);font-size:11px;font-weight:850}
.reader-chat-agent-tray .reader-agent-avatar-stack,.reader-chat-agent-tray .reader-agent-avatar-stack-item{overflow:visible}
.reader-chat-agent-tray .reader-agent-avatar-stack-item{width:30px;height:30px;border-color:var(--app-reader-chat-composer-bg);background:var(--app-reader-chat-composer-bg)}
.reader-chat-agent-tray .reader-agent-avatar-stack-item.is-active{z-index:2;box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 16%,transparent);transform:translateY(-6px) scale(1.12)}
.reader-chat-agent-tray .reader-avatar-badge{width:24px;height:24px}
.reader-highlight-choice-menu{position:absolute;z-index:var(--reader-z-popover);width:240px;display:grid;gap:6px;padding:10px;border:1px solid var(--app-reader-composer-border);border-radius:16px;background:var(--reader-paper);box-shadow:var(--reader-elevated-shadow);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-highlight-choice-menu header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px 4px}
.reader-highlight-choice-menu header strong{font-size:13px;font-weight:900}
.reader-highlight-choice-menu header button{display:grid;width:26px;height:26px;place-items:center;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);padding:0}
.reader-highlight-choice-menu header button:hover{background:var(--app-reader-agent-panel-hover-bg);color:var(--reader-ink)}
.reader-highlight-choice-menu>button{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:7px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);padding:7px;text-align:left}
.reader-highlight-choice-menu>button:hover{background:var(--app-reader-agent-panel-hover-bg)}
.reader-highlight-choice-menu .reader-avatar-badge{display:grid;width:28px;height:28px;place-items:center;overflow:hidden;border-radius:999px;background:var(--reader-green);color:white;font-size:10px;font-weight:800}
.reader-highlight-choice-menu span{display:grid;gap:2px;min-width:0}
.reader-highlight-choice-menu span strong{overflow:hidden;font-size:12px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-highlight-choice-menu span em{overflow:hidden;color:var(--reader-muted);font-size:11px;font-style:normal;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.reader-virtual-cursor{left:0;top:0;gap:3px;transform:translate3d(var(--reader-cursor-x,0px),var(--reader-cursor-y,0px),0) translate(-10px,-10px);transition:transform .34s cubic-bezier(.22,1,.36,1);will-change:transform}
.reader-virtual-pointer{width:48px;height:48px;flex:0 0 auto;overflow:visible;border:0;background:transparent;clip-path:none;filter:drop-shadow(0 5px 8px color-mix(in srgb,var(--reader-ink) 18%,transparent));transform:none}
.reader-virtual-bloom{opacity:.95}
.reader-virtual-pointer-shape{stroke:#fff;stroke-width:2;stroke-linejoin:round}
.reader-virtual-cursor.is-offscreen .reader-virtual-pointer{opacity:.62}
.reader-virtual-cursor.is-offscreen .reader-virtual-bloom{opacity:.42}
.reader-virtual-label{border-color:color-mix(in srgb,var(--cursor-color,var(--reader-red)) 24%,transparent);color:var(--cursor-color,var(--reader-red))}
.reader-virtual-label .reader-avatar-badge{background:var(--cursor-color,var(--reader-red))}
@keyframes reader-cursor-leave{to{opacity:0;filter:blur(2px)}}
.reader-completion-burst{position:fixed;inset:0;z-index:9;overflow:hidden;pointer-events:none}
.reader-completion-burst-center{position:absolute;left:50%;top:50%;width:1px;height:1px;transform:scale(1.28);transform-origin:center}
.reader-completion-burst-ring{position:absolute;left:0;top:0;width:148px;height:148px;border:1px solid rgba(199,164,94,.3);border-radius:999px;opacity:0;transform:translate(-50%,-50%) scale(.18);animation:reader-completion-ring 1.18s cubic-bezier(.22,1,.36,1) forwards}
.reader-completion-burst-ring.is-wide{width:236px;height:236px;border-color:rgba(94,192,232,.22);animation-delay:.12s}
.reader-completion-particle{position:absolute;left:0;top:0;width:8px;height:13px;border-radius:2px;background:var(--reader-confetti-color);box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 12%,transparent);opacity:0;transform:translate(-50%,-50%) scale(.2) rotate(var(--reader-confetti-rotate));animation:reader-completion-pop 1.52s cubic-bezier(.16,1,.3,1) forwards;animation-delay:var(--reader-confetti-delay);will-change:transform,opacity,filter}
.reader-completion-particle.is-dot{width:7px;height:7px;border-radius:999px}
.reader-completion-particle.is-spark{width:4px;height:16px;border-radius:999px}
@keyframes reader-completion-ring{12%{opacity:.7}to{opacity:0;transform:translate(-50%,-50%) scale(1.2)}}
@keyframes reader-completion-pop{0%{opacity:0;filter:blur(3px);transform:translate(-50%,-50%) scale(.2) rotate(var(--reader-confetti-rotate))}16%{opacity:1;filter:blur(0)}76%{opacity:1;transform:translate(-50%,-50%) translate(var(--reader-confetti-x),var(--reader-confetti-y)) scale(1) rotate(calc(var(--reader-confetti-rotate) + 110deg))}100%{opacity:0;filter:blur(1px);transform:translate(-50%,-50%) translate(var(--reader-confetti-x),calc(var(--reader-confetti-y) + 42px)) scale(.86) rotate(calc(var(--reader-confetti-rotate) + 180deg))}}
.reader-agent-dock{position:fixed;left:50%;bottom:18px;z-index:135;display:flex;align-items:flex-end;justify-content:center;min-height:58px;max-width:calc(100vw - 36px);padding:8px 10px;border:1px solid var(--reader-ink-subtle);border-radius:19px;background:var(--reader-paper);box-shadow:var(--reader-elevated-shadow),inset 0 1px 0 rgba(255,255,255,.68);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);pointer-events:none;transform:translateX(-50%);transform-origin:bottom center;transition:opacity .18s ease,filter .18s ease}
.reader-agent-dock.is-completing{animation:reader-agent-dock-leave .78s cubic-bezier(.22,1,.36,1) .82s forwards}
.reader-agent-dock-list{display:flex;align-items:flex-end;gap:8px;min-width:0}
.reader-agent-dock-item{position:relative;display:grid;width:44px;height:44px;place-items:center;border-radius:12px;background:transparent;box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 14%,transparent),0 0 0 1px color-mix(in srgb,var(--agent-color) 18%,transparent);transform:translateY(0);transition:filter .18s ease,opacity .18s ease,transform .18s ease}
.reader-agent-dock-item .reader-avatar-badge{width:40px;height:40px;border-radius:10px;background:var(--agent-color);box-shadow:0 0 0 1px var(--reader-paper);font-size:12px}
.reader-agent-dock-item .reader-avatar-badge img{border-radius:10px}
.reader-agent-dock-item.is-active{animation:reader-agent-dock-hop .86s cubic-bezier(.34,1.56,.64,1) infinite;animation-delay:var(--reader-dock-delay)}
.reader-agent-dock-item.is-active::after{content:"";position:absolute;left:50%;bottom:-7px;width:5px;height:5px;border-radius:999px;background:var(--agent-color);box-shadow:0 0 0 4px color-mix(in srgb,var(--agent-color) 14%,transparent);transform:translateX(-50%);opacity:.9}
.reader-agent-dock-item.is-done{filter:saturate(.9);opacity:.86}
.reader-agent-dock .reader-completion-burst{position:absolute;inset:auto;left:50%;bottom:32px;z-index:1;width:1px;height:1px;overflow:visible}
.reader-agent-dock .reader-completion-burst-center{left:0;top:0;transform:scale(.82);transform-origin:center}
@keyframes reader-agent-dock-hop{0%,100%{transform:translateY(0) scale(1)}45%{transform:translateY(-10px) scale(1.04)}70%{transform:translateY(0) scale(.99)}}
@keyframes reader-agent-dock-leave{to{opacity:0;filter:blur(8px);transform:translateX(-50%) translateY(12px) scale(.92)}}
.reader-agent-annotate{height:38px;border-color:var(--app-reader-composer-border);background:var(--reader-paper);color:var(--reader-ink);padding:0 12px}
.reader-agent-annotate:hover,.reader-agent-annotate.is-active{background:var(--app-reader-toolbar-control-hover-bg);color:var(--reader-ink)}
.reader-notes-actions span{background:var(--reader-ink)}
.reader-agent-annotate-menu{gap:8px;margin:8px 0 18px;padding:14px;border-color:var(--reader-ink-subtle);border-radius:18px;background:var(--reader-paper);overflow:auto;max-height:calc(var(--app-viewport-height) - 112px)}
.reader-agent-annotate-menu>header{display:grid;gap:3px;padding:2px 4px 8px}
.reader-agent-annotate-menu>header strong{font-size:14px;font-weight:900}
.reader-agent-annotate-menu>header span{color:var(--reader-muted);font-size:12px;font-weight:720}
.reader-agent-option{position:relative;display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:8px;border:1px solid transparent;border-radius:14px;padding:6px}
.reader-agent-option:hover,.reader-agent-option.is-running,.reader-agent-option.is-selected{border-color:var(--reader-ink-subtle);background:var(--reader-paper-panel)}
.reader-agent-select{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:10px;border:0;border-radius:12px;background:transparent;color:var(--reader-ink);font:inherit;padding:6px;text-align:left}
.reader-agent-select:disabled{cursor:not-allowed;opacity:.65}
.reader-agent-action-picker{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:2px 6px 6px 54px;padding:7px;border-radius:14px;background:var(--reader-paper);box-shadow:inset 0 0 0 1px var(--reader-ink-hairline),var(--reader-soft-shadow)}
.reader-agent-annotate-menu .reader-agent-action-picker button{display:grid;grid-template-columns:1fr;align-content:start;align-items:start;gap:5px;min-height:64px;border:1px solid var(--reader-ink-subtle);border-radius:11px;background:var(--reader-paper);color:var(--reader-ink);font:inherit;padding:9px 10px;text-align:left;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-agent-action-picker button:hover,.reader-agent-annotate-menu .reader-agent-action-picker button.is-active{border-color:rgba(159,91,80,.18);background:rgba(159,91,80,.06);box-shadow:0 4px 12px color-mix(in srgb,var(--reader-ink) 5%,transparent);color:var(--reader-red)}
.reader-agent-annotate-menu .reader-agent-action-picker button:active{transform:scale(.96)}
.reader-agent-annotate-menu .reader-agent-action-picker button>strong{font-size:12px;font-weight:900;line-height:1.15}
.reader-agent-annotate-menu .reader-agent-action-picker button>span{display:block;width:auto;height:auto;min-width:0;margin:0;padding:0;border-radius:0;background:transparent;color:var(--reader-muted);font-size:10px;font-weight:720;line-height:1.35;place-items:initial}
.reader-agent-avatar{position:relative;display:grid;width:38px;height:44px;place-items:end center}
.reader-agent-avatar i{position:absolute;top:0;left:50%;width:9px;height:9px;border:1px solid rgba(37,29,22,.16);border-radius:999px;box-shadow:0 1px 3px color-mix(in srgb,var(--reader-ink) 20%,transparent);transform:translateX(-50%)}
.reader-agent-avatar .reader-avatar-badge{width:30px;height:30px}
.reader-agent-select>span:not(.reader-avatar-badge){display:grid;width:auto;height:auto;gap:2px;min-width:0;place-items:initial;border-radius:0;background:transparent;color:inherit;font-size:inherit;font-weight:inherit}
.reader-agent-select>span:not(.reader-avatar-badge) strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-agent-select>span:not(.reader-avatar-badge) small{overflow:hidden;color:#5d5147;font-size:11px;font-weight:760;text-overflow:ellipsis;white-space:nowrap}
.reader-agent-select b{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:var(--reader-ink-hairline);color:var(--reader-muted);font-size:11px;font-weight:850;line-height:1;padding:6px 8px}
.reader-agent-option:hover .reader-agent-select b{background:#251d16;color:#fffaf0}
.reader-agent-option.is-running .reader-agent-select b{background:rgba(159,91,80,.1);color:var(--reader-red)}
.reader-agent-option.is-selected .reader-agent-select b{background:#251d16;color:#fffaf0}
.reader-agent-annotate-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px;padding-top:10px;border-top:1px solid var(--reader-ink-subtle)}
.reader-agent-annotate-actions button{display:inline-flex;height:40px;width:auto;grid-template-columns:none;align-items:center;justify-content:center;border:0;border-radius:999px;background:var(--reader-paper-hover);color:var(--reader-ink);font:inherit;font-size:12px;font-weight:820;padding:0 14px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-agent-annotate-actions button:active:not(:disabled){transform:scale(.96)}
.reader-agent-annotate-actions button:last-child{background:var(--reader-ink);color:#fff}
.reader-agent-annotate-actions button:disabled{cursor:not-allowed;opacity:.48}
.reader-agent-empty{display:grid;min-height:220px;place-items:center;border:1px dashed color-mix(in srgb,var(--reader-ink) 14%,transparent);border-radius:16px;color:var(--reader-muted);font-size:13px;font-weight:760}
.reader-agent-annotate-popover{position:fixed;inset:0;z-index:var(--reader-z-modal);display:grid;place-items:center;width:auto;padding:34px;pointer-events:none}
.reader-agent-annotate-scrim{position:fixed;inset:0;border:0;background:rgba(40,35,29,.2);backdrop-filter:blur(10px);pointer-events:auto}
.reader-agent-annotate-popover .reader-agent-annotate-menu{position:relative;z-index:1;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;width:min(1180px,calc(100vw - 56px));height:min(860px,calc(var(--app-viewport-height) - 48px));max-height:min(860px,calc(var(--app-viewport-height) - 48px));margin:0;padding:18px;border:1px solid var(--app-reader-selection-menu-border);border-radius:20px;background:var(--reader-paper);box-shadow:0 28px 90px color-mix(in srgb,var(--reader-ink) 24%,transparent);overflow:hidden;pointer-events:auto}
.reader-agent-annotate-popover .reader-agent-annotate-menu:has(.reader-focus-progress){grid-template-rows:auto auto auto minmax(0,1fr) auto}
.reader-plan-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:24px;padding:2px 2px 8px}
.reader-plan-header>div{display:grid;gap:6px;min-width:0}
.reader-plan-header strong{font-size:22px;font-weight:900;line-height:1.16;text-wrap:balance}
.reader-plan-header span{color:var(--reader-muted);font-size:13px;font-weight:760;line-height:1.45;text-wrap:pretty}
.reader-plan-header p{display:flex;align-items:center;gap:8px;margin:0 0 1px;color:var(--reader-muted);font-size:13px;font-weight:820;white-space:nowrap}
.reader-plan-header b{color:var(--reader-ink);font-variant-numeric:tabular-nums}
.reader-plan-action-bar{position:relative;display:flex;align-items:center;gap:10px;min-height:56px;margin:8px 0 14px;padding:10px 14px;border-radius:14px;background:var(--reader-paper-panel);box-shadow:inset 0 0 0 1px var(--reader-ink-hairline);overflow:visible}
.reader-plan-action-bar>span{margin-right:6px;color:#8b8175;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
.reader-agent-annotate-menu .reader-plan-action{position:relative;display:inline-flex;width:auto;min-width:58px;height:34px;grid-template-columns:none;align-items:center;justify-content:center;gap:5px;border:1px solid var(--reader-ink-subtle);border-radius:999px;background:var(--reader-paper);color:var(--reader-ink);cursor:grab;font:inherit;font-size:12px;font-weight:900;padding:0 14px;text-align:center;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-plan-action:hover{border-color:color-mix(in srgb,var(--reader-ink) 18%,transparent);background:var(--reader-paper-hover);box-shadow:0 6px 16px color-mix(in srgb,var(--reader-ink) 8%,transparent)}
.reader-agent-annotate-menu .reader-plan-action:active{cursor:grabbing;transform:scale(.96)}
.reader-agent-annotate-menu .reader-plan-action:hover::after{content:attr(data-description);position:absolute;left:50%;bottom:calc(100% + 9px);z-index:4;width:max-content;max-width:240px;transform:translateX(-50%);border-radius:10px;background:#28231d;color:#fffaf0;box-shadow:0 12px 28px rgba(40,35,29,.2);font-size:11px;font-weight:760;line-height:1.45;padding:8px 10px;white-space:normal}
.reader-plan-grid-wrap{min-height:0;overflow:auto;padding:2px 2px 4px}
.reader-plan-grid{display:grid;gap:6px;min-width:max-content;align-items:stretch}
.reader-plan-corner{position:sticky;left:0;z-index:2;border-radius:12px;background:var(--reader-paper)}
.reader-plan-section{display:grid;align-content:end;gap:3px;min-height:44px;padding:0 4px 8px;border-bottom:1px dashed color-mix(in srgb,var(--reader-ink) 18%,transparent);color:var(--reader-muted);text-align:center}
.reader-plan-section span{font-size:11px;font-weight:850;line-height:1}
.reader-plan-section strong{overflow:hidden;color:#6f665d;font-size:12px;font-weight:900;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}
.reader-plan-agent{position:sticky;left:0;z-index:2;display:grid;grid-template-columns:8px 32px minmax(0,1fr) 30px;align-items:center;gap:10px;min-height:54px;padding:8px 8px 8px 0;background:var(--reader-paper)}
.reader-plan-agent-color{width:8px;height:34px;border-radius:999px;box-shadow:inset 0 0 0 1px rgba(37,29,22,.14)}
.reader-plan-agent .reader-avatar-badge{width:30px;height:30px}
.reader-plan-agent strong{overflow:hidden;font-size:13px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
.reader-agent-annotate-menu .reader-plan-agent button{display:grid;width:30px;height:30px;grid-template-columns:none;place-items:center;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);padding:0;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-plan-agent button:hover{background:var(--reader-ink-hairline);color:var(--reader-ink)}
.reader-agent-annotate-menu .reader-plan-agent button:active{transform:scale(.96)}
.reader-plan-cell{display:grid;min-height:54px;place-items:center;border:1px dashed rgba(199,164,94,.36);border-radius:9px;background:rgba(255,250,240,.45);color:#b0a394;font-size:14px;font-weight:820}
.reader-plan-cell.is-filled{border-style:solid;border-color:color-mix(in srgb,var(--agent-color) 34%,transparent);background:color-mix(in srgb,var(--agent-color) 10%,var(--reader-paper))}
.reader-agent-annotate-menu .reader-plan-cell-action{display:grid;width:100%;height:100%;grid-template-columns:1fr;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--reader-ink);font:inherit;padding:0 8px;text-align:center;transition:background .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-plan-cell-action:hover{background:color-mix(in srgb,var(--agent-color) 10%,transparent)}
.reader-agent-annotate-menu .reader-plan-cell-action:active{transform:scale(.96)}
.reader-plan-cell-action strong{display:inline-flex;max-width:100%;align-items:center;justify-content:center;gap:4px;overflow:hidden;font-size:13px;font-weight:950;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;margin:8px 0 14px;padding:10px 12px;border-radius:14px;background:var(--reader-paper-panel);box-shadow:inset 0 0 0 1px var(--reader-ink-hairline)}
.reader-focus-agent-picker{display:flex;min-width:0;flex-wrap:wrap;align-items:center;gap:7px}
.reader-agent-annotate-menu .reader-focus-agent-chip,.reader-agent-annotate-menu .reader-focus-assigned-chip{display:inline-flex;width:auto;height:34px;grid-template-columns:none;align-items:center;justify-content:center;gap:7px;border:1px solid var(--reader-ink-subtle);border-radius:999px;background:var(--reader-paper);color:var(--reader-ink);font:inherit;font-size:12px;font-weight:860;padding:0 10px 0 4px;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-focus-agent-chip:hover,.reader-agent-annotate-menu .reader-focus-assigned-chip:hover{border-color:color-mix(in srgb,var(--reader-ink) 18%,transparent);background:var(--reader-paper-panel);box-shadow:0 5px 14px color-mix(in srgb,var(--reader-ink) 5%,transparent)}
.reader-agent-annotate-menu .reader-focus-agent-chip:active,.reader-agent-annotate-menu .reader-focus-assigned-chip:active{transform:scale(.97)}
.reader-focus-agent-chip .reader-avatar-badge,.reader-focus-assigned-chip .reader-avatar-badge{width:26px;height:26px}
.reader-focus-agent-chip strong,.reader-focus-assigned-chip strong{max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-agent-chip svg,.reader-focus-assigned-chip svg{color:#75695d}
.reader-focus-add-wrap{position:relative;display:inline-flex;flex:0 0 auto}
.reader-agent-annotate-menu .reader-focus-add{display:inline-flex;width:auto;height:34px;grid-template-columns:none;align-items:center;justify-content:center;gap:7px;border:1px dashed rgba(40,35,29,.24);border-radius:999px;background:var(--reader-paper);color:var(--reader-ink);font:inherit;font-size:12px;font-weight:860;padding:0 12px;white-space:nowrap;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-focus-add:hover{border-color:rgba(40,35,29,.34);background:var(--reader-paper-panel);box-shadow:0 5px 14px color-mix(in srgb,var(--reader-ink) 6%,transparent)}
.reader-agent-annotate-menu .reader-focus-add:active{transform:scale(.97)}
.reader-focus-add svg{color:#6f665d}
.reader-focus-add-menu{position:absolute;left:0;top:calc(100% + 8px);z-index:8;display:grid;gap:4px;width:220px;max-height:260px;overflow:auto;padding:8px;border:1px solid var(--app-reader-selection-menu-border);border-radius:14px;background:var(--reader-paper);box-shadow:var(--reader-elevated-shadow)}
.reader-agent-annotate-menu .reader-focus-add-menu button{display:grid;width:100%;height:38px;grid-template-columns:28px minmax(0,1fr);align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);font:inherit;padding:0 8px;text-align:left;transition:background .14s ease}
.reader-agent-annotate-menu .reader-focus-add-menu button:hover{background:var(--reader-paper-hover)}
.reader-focus-add-menu .reader-avatar-badge{width:26px;height:26px}
.reader-focus-add-menu strong{overflow:hidden;font-size:12px;font-weight:860;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-add-menu>em{padding:8px;color:var(--reader-muted);font-size:12px;font-style:normal;font-weight:780}
.reader-focus-actions{display:inline-flex;align-items:center;justify-content:flex-end;gap:8px}
.reader-agent-annotate-menu .reader-focus-clear{display:inline-flex;width:auto;height:38px;grid-template-columns:none;align-items:center;justify-content:center;gap:6px;border:1px solid var(--app-reader-selection-menu-border);border-radius:999px;background:var(--reader-paper);color:var(--reader-muted);font:inherit;font-size:12px;font-weight:860;padding:0 12px;white-space:nowrap;transition:background .14s ease,border-color .14s ease,color .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-focus-clear:hover:not(:disabled){border-color:rgba(159,91,80,.22);background:color-mix(in srgb,var(--reader-red) 8%,var(--reader-paper));color:var(--reader-red)}
.reader-agent-annotate-menu .reader-focus-clear:active:not(:disabled){transform:scale(.96)}
.reader-agent-annotate-menu .reader-focus-clear:disabled{cursor:not-allowed;opacity:.42}
.reader-agent-annotate-menu .reader-focus-plan{display:inline-flex;width:auto;height:38px;grid-template-columns:none;align-items:center;justify-content:center;gap:7px;border:0;border-radius:999px;background:var(--reader-ink);color:#fff;font:inherit;font-size:12px;font-weight:900;padding:0 14px;white-space:nowrap;transition:background .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-focus-plan:hover:not(:disabled){background:#3b332b;box-shadow:0 8px 18px rgba(40,35,29,.16)}
.reader-agent-annotate-menu .reader-focus-plan:active:not(:disabled){transform:scale(.96)}
.reader-agent-annotate-menu .reader-focus-plan:disabled{background:var(--reader-paper-hover);color:#8a8a85;cursor:not-allowed;box-shadow:none;opacity:1}
.reader-focus-progress{display:grid;gap:8px;margin:-4px 0 14px;padding:10px 12px;border:1px solid var(--reader-ink-subtle);border-radius:14px;background:var(--reader-paper)}
.reader-focus-progress>div{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--reader-muted);font-size:12px;font-weight:850}
.reader-focus-progress strong{color:var(--reader-ink);font-size:12px}
.reader-focus-progress>i{display:block;height:7px;overflow:hidden;border-radius:999px;background:var(--reader-paper-hover)}
.reader-focus-progress>i>b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#28231d,#9f5b50,#c7a45e);transition:width .34s cubic-bezier(.22,1,.36,1)}
.reader-focus-card-list{display:grid;align-content:start;gap:10px;min-height:0;overflow:auto;padding:2px 4px 4px}
.reader-agent-annotate-menu:has(.reader-focus-agent-menu),.reader-focus-card-list:has(.reader-focus-agent-menu),.reader-focus-section-card:has(.reader-focus-agent-menu){overflow:visible}
.reader-focus-section-card:has(.reader-focus-agent-menu){position:relative;z-index:12}
.reader-focus-section-card{border:1px solid var(--reader-ink-subtle);border-radius:16px;background:var(--reader-paper);box-shadow:0 8px 24px color-mix(in srgb,var(--reader-ink) 5%,transparent);overflow:visible}
.reader-focus-section-card.is-open{border-color:rgba(40,35,29,.16);box-shadow:0 12px 30px color-mix(in srgb,var(--reader-ink) 8%,transparent)}
.reader-agent-annotate-menu .reader-focus-card-summary{display:grid;width:100%;min-height:64px;grid-template-columns:42px minmax(0,1fr) minmax(120px,auto) 24px;align-items:center;gap:10px;border:0;border-radius:16px;background:transparent;color:var(--reader-ink);font:inherit;padding:11px 14px;text-align:left;transition:background .14s ease}
.reader-agent-annotate-menu .reader-focus-card-summary:hover{background:#f6f6f5}
.reader-focus-card-summary>b{display:grid;width:32px;height:32px;place-items:center;border-radius:999px;background:#ececea;color:#6f6f6a;font-size:12px;font-weight:950}
.reader-focus-section-card.is-open .reader-focus-card-summary>b{background:var(--reader-ink);color:#fff}
.reader-focus-card-copy{display:grid;gap:4px;min-width:0}
.reader-focus-card-title{display:flex;min-width:0;align-items:center;gap:8px}
.reader-focus-card-copy strong{overflow:hidden;font-size:15px;font-weight:920;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-card-title>em{max-width:92px;overflow:hidden;border-radius:999px;background:rgba(159,91,80,.08);color:var(--reader-red);flex:0 0 auto;font-size:11px;font-style:normal;font-weight:850;padding:4px 8px;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-card-copy small{overflow:hidden;color:var(--reader-muted);font-size:12px;font-weight:720;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-card-agents{display:flex;min-width:0;max-width:220px;align-items:center;justify-content:flex-end;gap:8px;overflow:visible}
.reader-agent-avatar-stack{display:inline-flex;min-width:0;align-items:center;justify-content:flex-end;overflow:visible;padding:6px 0}
.reader-agent-avatar-stack-item{position:relative;display:grid;flex:0 0 auto;width:28px;min-width:28px;max-width:28px;height:28px;place-items:center;margin-left:-8px;appearance:none;border:2px solid var(--reader-paper);border-radius:999px;background:var(--reader-paper);box-shadow:0 2px 7px rgba(40,35,29,.12);color:inherit;line-height:1;padding:0;overflow:visible;transform:translateY(var(--avatar-shift,0px)) scale(var(--avatar-scale-active,1));transform-origin:center;transition:transform var(--avatar-dur,320ms) var(--avatar-ease-in,cubic-bezier(.22,1,.36,1)),box-shadow .16s ease,z-index .16s ease;will-change:transform}
.reader-agent-avatar-stack-item:first-child{margin-left:0}
.reader-agent-avatar-stack-item:hover,.reader-agent-avatar-stack-item:focus-visible,.reader-agent-avatar-stack-item.is-revealed{z-index:2;box-shadow:0 8px 18px rgba(40,35,29,.16)}
.reader-agent-avatar-stack-item:focus-visible,.reader-agent-avatar-stack-item.is-revealed{transform:translateY(-4px) scale(1.12)}
.reader-agent-avatar-stack-item.is-active{box-shadow:0 0 0 2px rgba(37,29,22,.16),0 2px 7px rgba(40,35,29,.12)}
.reader-agent-avatar-stack-item .reader-avatar-badge{width:24px;height:24px}
.reader-agent-avatar-stack-label{position:absolute;left:50%;bottom:calc(100% + 8px);z-index:3;display:block;max-width:132px;overflow:hidden;transform:translateX(-50%);border:1px solid var(--app-reader-selection-menu-border);border-radius:10px;background:var(--reader-paper);box-shadow:var(--reader-soft-shadow);color:var(--reader-ink);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:850;line-height:1.25;padding:7px 8px;text-align:center;text-overflow:ellipsis;white-space:nowrap}
@media (prefers-reduced-motion:reduce){.reader-agent-avatar-stack-item{transition:none!important;transform:none!important;will-change:auto}}
.reader-focus-avatar-stack{justify-content:flex-end}
.reader-focus-avatar-stack-item{width:28px;height:28px}
.reader-focus-avatar-stack-item .reader-avatar-badge{width:24px;height:24px}
.reader-focus-card-agents small{color:var(--reader-muted);font-size:12px;font-weight:780;white-space:nowrap}
.reader-focus-card-agents .reader-focus-message-count{border-radius:999px;background:var(--reader-paper-hover);color:var(--reader-muted);padding:6px 8px}
.reader-focus-card-summary>svg{justify-self:end;color:#75695d}
.reader-focus-card-body{display:grid;gap:13px;padding:0 18px 17px 66px}
.reader-focus-card-section{display:grid;gap:8px;padding-top:13px;border-top:1px solid rgba(40,35,29,.08)}
.reader-focus-card-section>strong{color:#5a5148;font-size:12px;font-weight:900}
.reader-focus-assigned-list{display:flex;min-width:0;flex-wrap:wrap;align-items:center;gap:9px}
.reader-focus-messages{display:grid;align-content:start;gap:8px;min-height:0}
.reader-focus-message{display:grid;grid-template-columns:18px minmax(0,1fr) 28px;align-items:start;gap:8px;padding:10px 9px;border-radius:12px;background:var(--reader-paper-panel);color:var(--reader-ink)}
.reader-focus-message>svg{margin-top:2px;color:var(--reader-red)}
.reader-focus-message-body{display:grid;gap:7px;min-width:0}
.reader-focus-message p{margin:0;color:var(--app-reader-chat-context-fg);font-size:13px;font-weight:720;line-height:1.5;overflow-wrap:anywhere}
.reader-focus-message-targets{display:flex;min-width:0;flex-wrap:wrap;gap:5px}
.reader-focus-message-targets>em{border-radius:999px;background:rgba(159,91,80,.08);color:var(--reader-red);font-size:11px;font-style:normal;font-weight:850;padding:4px 7px;white-space:nowrap}
.reader-agent-annotate-menu .reader-focus-message button{display:grid;width:28px;height:28px;grid-template-columns:none;place-items:center;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);padding:0}
.reader-agent-annotate-menu .reader-focus-message button:hover{background:var(--reader-ink-hairline);color:var(--reader-ink)}
.reader-focus-message-input{display:grid;gap:8px}
.reader-focus-message-input:has(.reader-focus-agent-menu){position:relative;z-index:30;overflow:visible}
.reader-focus-message-box{position:relative}
.reader-focus-message-box:has(.reader-focus-agent-menu){z-index:1}
.reader-focus-message-input textarea{width:100%;min-height:72px;resize:vertical;border:1px solid var(--app-reader-selection-menu-border);border-radius:14px;background:var(--reader-paper);color:var(--reader-ink);font:inherit;font-size:13px;line-height:1.55;padding:11px 12px}
.reader-focus-message-input textarea:focus,.reader-focus-message-input textarea:focus-visible{outline:0;border-color:rgba(40,35,29,.24);box-shadow:none}
.reader-focus-message-footer{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:10px;overflow:visible}
.reader-agent-annotate-menu .reader-focus-message-footer>button{display:inline-flex;width:auto;height:40px;grid-template-columns:none;align-items:center;justify-content:center;gap:7px;border:0;border-radius:999px;background:var(--reader-paper-hover);color:var(--reader-ink);font:inherit;font-size:12px;font-weight:850;padding:0 13px;white-space:nowrap}
.reader-agent-annotate-menu .reader-focus-message-footer>button:hover:not(:disabled){background:#dededb}
.reader-focus-message-agents{position:relative;display:flex;min-width:0;flex:1 1 auto;align-items:center;gap:7px;overflow:visible;color:var(--reader-muted);font-size:11px;font-weight:780}
.reader-focus-message-agents small{font-size:11px;font-weight:780}
.reader-agent-annotate-menu .reader-focus-message-agents .reader-agent-avatar-stack-item{width:30px;height:30px;border-color:var(--reader-paper);background:var(--reader-paper)}
.reader-agent-annotate-menu .reader-focus-message-agents .reader-agent-avatar-stack-item:hover{background:var(--reader-paper)}
.reader-focus-message-agents .reader-avatar-badge{width:26px;height:26px}
.reader-focus-agent-menu{right:auto;bottom:calc(100% + 8px);z-index:24;width:176px;max-width:min(176px,calc(100% - 16px));border-color:rgba(40,35,29,.16);background:var(--reader-paper);box-shadow:0 18px 44px rgba(40,35,29,.18),0 3px 10px rgba(40,35,29,.08)}
.reader-agent-annotate-menu .reader-focus-agent-menu button{min-height:36px}
.reader-focus-empty{display:grid;min-height:220px;place-items:center;border:1px dashed color-mix(in srgb,var(--reader-ink) 14%,transparent);border-radius:16px;color:var(--reader-muted);font-size:13px;font-weight:760}
.reader-plan-footer{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding-top:14px}
.reader-plan-add{position:relative}
.reader-agent-annotate-menu .reader-plan-add>button{display:inline-flex;width:auto;height:40px;grid-template-columns:none;align-items:center;justify-content:center;gap:7px;border:1px dashed rgba(40,35,29,.2);border-radius:999px;background:var(--reader-paper);color:var(--reader-ink);font:inherit;font-size:12px;font-weight:850;padding:0 14px;transition:background .14s ease,border-color .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-plan-add>button:hover{border-color:rgba(40,35,29,.28);background:var(--reader-paper-hover)}
.reader-agent-annotate-menu .reader-plan-add>button:active:not(:disabled){transform:scale(.96)}
.reader-agent-annotate-menu .reader-plan-add>button:disabled{cursor:not-allowed;opacity:.44}
.reader-plan-add-menu{position:absolute;left:0;bottom:calc(100% + 8px);z-index:3;display:grid;gap:4px;width:220px;padding:8px;border:1px solid var(--app-reader-selection-menu-border);border-radius:14px;background:var(--reader-paper);box-shadow:var(--reader-elevated-shadow)}
.reader-agent-annotate-menu .reader-plan-add-menu button{display:grid;width:100%;height:38px;grid-template-columns:28px minmax(0,1fr);align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);font:inherit;padding:0 8px;text-align:left}
.reader-agent-annotate-menu .reader-plan-add-menu button:hover{background:var(--app-reader-toolbar-control-hover-bg)}
.reader-plan-add-menu .reader-avatar-badge{width:26px;height:26px}
.reader-agent-annotate-menu .reader-plan-add-menu button>span:not(.reader-avatar-badge){display:block;width:auto;height:auto;min-width:0;margin:0;overflow:hidden;border-radius:0;background:transparent;color:var(--reader-ink);font-size:12px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-plan-help{margin:0;color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.45;text-align:center}
.reader-plan-footer .reader-agent-annotate-actions{margin:0;padding:0;border:0}
@media(max-width:860px){.reader-focus-toolbar{grid-template-columns:1fr}.reader-focus-plan{justify-self:end}.reader-agent-annotate-menu .reader-focus-card-summary{grid-template-columns:38px minmax(0,1fr) 24px}.reader-focus-card-agents{grid-column:2/-1;justify-content:flex-start}.reader-focus-card-body{padding-left:16px}.reader-focus-message-footer{align-items:flex-start;flex-direction:column}.reader-plan-footer{grid-template-columns:1fr}.reader-plan-footer .reader-agent-annotate-actions{justify-content:flex-end}}
.reader-composer-types{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.reader-composer-types button{display:inline-flex;align-items:center;justify-content:center;gap:4px;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:var(--reader-paper);color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:850;line-height:1;padding:7px 9px}
.reader-composer-types button:hover,.reader-composer-types button.is-active{border-color:rgba(159,91,80,.18);background:rgba(159,91,80,.07);color:var(--reader-red)}
.reader-comment-body{min-width:0}
.reader-comment-author{display:grid;grid-template-columns:minmax(0,1fr) auto;min-width:0;align-items:baseline;gap:8px;margin-bottom:3px;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-comment-author strong{display:inline-flex;min-width:0;align-items:center;gap:4px;font-size:12px;font-weight:850}
.reader-comment-author strong time{margin-left:3px;color:var(--reader-muted);font-size:10px;font-weight:760;font-variant-numeric:tabular-nums;white-space:nowrap}
.reader-comment .reader-comment-author>span{display:inline-flex;width:auto;height:auto;align-items:center;gap:3px;border-radius:999px;background:rgba(159,91,80,.07);color:var(--reader-red);font-size:10px;font-weight:850;line-height:1;padding:3px 6px}
.reader-comment .reader-review-label{display:inline-flex;width:max-content;max-width:100%;height:auto;min-width:0;align-items:center;margin:0 0 5px;border:1px solid transparent;border-radius:999px;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:9px;font-weight:900;line-height:1;overflow-wrap:normal;padding:3px 6px;white-space:nowrap;word-break:normal}
.reader-review-label.is-support{border-color:rgba(77,155,114,.18);background:rgba(77,155,114,.11);color:#356f51}
.reader-review-label.is-challenge{border-color:rgba(159,91,80,.2);background:rgba(159,91,80,.1);color:#8a3f32}
.reader-review-label.is-supplement{border-color:rgba(79,127,159,.2);background:rgba(79,127,159,.1);color:#3f6d8b}
.reader-markdown{min-width:0;color:var(--app-reader-note-quote-text);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:13px;line-height:1.66;overflow-wrap:anywhere;word-break:break-word}
.reader-markdown-content>*:first-child{margin-top:0}
.reader-markdown-content>*:last-child{margin-bottom:0}
.reader-markdown p{margin:0 0 8px;color:inherit;font-size:13px;line-height:1.66}
.reader-markdown h1,.reader-markdown h2,.reader-markdown h3,.reader-markdown h4,.reader-markdown h5,.reader-markdown h6{margin:10px 0 6px;color:var(--reader-ink);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-weight:850;line-height:1.35;letter-spacing:0}
.reader-markdown h1{font-size:15px}
.reader-markdown h2{font-size:14px}
.reader-markdown h3,.reader-markdown h4,.reader-markdown h5,.reader-markdown h6{font-size:13px}
.reader-markdown ul,.reader-markdown ol{margin:6px 0 8px;padding-left:18px}
.reader-markdown li{margin:3px 0}
.reader-markdown blockquote{margin:8px 0;padding-left:10px;border-left:3px solid color-mix(in srgb,var(--reader-red) 28%,transparent);color:var(--reader-ink)}
.reader-markdown code{border-radius:5px;background:var(--reader-ink-hairline);font-family:var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);font-size:12px;padding:1px 4px}
.reader-markdown pre{max-width:100%;overflow:auto;margin:8px 0;padding:10px;border-radius:10px;background:#251d16;color:#fffaf0}
.reader-markdown pre code{background:transparent;color:inherit;padding:0}
.reader-markdown a{color:inherit;text-decoration:underline;text-decoration-color:rgba(37,29,22,.35);text-decoration-thickness:1px;text-underline-offset:.16em}
.reader-markdown a:hover{color:var(--reader-red);text-decoration-color:currentColor}
.reader-delete-note{display:inline-flex;align-items:center;gap:5px;justify-content:center;height:40px;border:0;border-radius:999px;background:transparent;color:var(--reader-red,var(--app-reader-danger,#8a3f32));font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-weight:850;padding:0 12px;line-height:1;white-space:nowrap}
.reader-delete-note:hover{background:color-mix(in srgb,var(--reader-red,var(--app-reader-danger,#8a3f32)) 7%,transparent)}
.reader-delete-note>span{display:inline;width:auto;height:auto;place-items:normal;border-radius:0;background:transparent;color:inherit;font-size:inherit;font-weight:inherit;line-height:1;padding:0}
.reader-confirm-overlay{position:fixed;inset:0;z-index:var(--reader-z-modal,var(--app-z-modal,320));background:color-mix(in srgb,var(--reader-ink,var(--app-reader-ink,#251d16)) 38%,transparent)}
.reader-confirm-dialog{position:fixed;left:50%;top:50%;z-index:calc(var(--reader-z-modal,var(--app-z-modal,320)) + 1);width:min(420px,calc(100vw - 48px));display:grid;gap:16px;padding:20px;border:1px solid var(--app-reader-note-border,color-mix(in srgb,var(--app-reader-ink,#251d16) 14%,transparent));border-radius:16px;background:var(--reader-paper,var(--app-reader-paper,#fffaf0));box-shadow:0 22px 70px color-mix(in srgb,var(--reader-ink,var(--app-reader-ink,#251d16)) 22%,transparent);color:var(--reader-ink,var(--app-reader-ink,#251d16));font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);transform:translate(-50%,-50%)}
.reader-confirm-dialog header{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start}
.reader-confirm-icon{display:grid;width:36px;height:36px;place-items:center;border-radius:999px;background:color-mix(in srgb,var(--reader-red,var(--app-reader-danger,#8a3f32)) 14%,transparent);color:var(--reader-red,var(--app-reader-danger,#8a3f32))}
.reader-confirm-dialog h2{margin:0;color:var(--reader-ink,var(--app-reader-ink,#251d16));font-size:15px;font-weight:850;line-height:1.3}
.reader-confirm-dialog p{margin:6px 0 0;color:var(--reader-muted,var(--app-reader-muted,#756a5d));font-size:13px;line-height:1.55}
.reader-confirm-dialog footer{display:flex;justify-content:flex-end;gap:8px}
.reader-confirm-dialog footer button{border:0;border-radius:999px;font-family:inherit;font-size:13px;font-weight:760;padding:9px 14px}
.reader-confirm-cancel{background:var(--reader-paper-hover,color-mix(in srgb,var(--app-reader-ink,#251d16) 6%,var(--app-reader-paper,#fffaf0)));color:var(--reader-ink,var(--app-reader-ink,#251d16))}
.reader-confirm-delete{background:var(--reader-red,var(--app-reader-danger,#8a3f32));color:var(--app-reader-paper,#fff)}
.reader-agent-annotate-popover{position:fixed;inset:0;z-index:var(--reader-z-modal);display:grid;place-items:center;width:auto;padding:34px;pointer-events:none}
.reader-agent-annotate-popover .reader-agent-annotate-menu{margin:0}
.reader-toc-item-main{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}
.reader-toc-item-main>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-toc-meta{display:inline-flex;align-items:center;gap:8px}
.reader-toc-item-main strong{display:grid;min-width:24px;height:24px;place-items:center;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:var(--reader-paper-hover);color:var(--reader-ink);font-size:11px;font-weight:850}
.reader-toc-markers{display:flex;align-items:center;gap:5px}
.reader-toc-markers i{width:8px;height:8px;border:1px solid rgba(37,29,22,.14);border-radius:999px;box-shadow:0 1px 2px rgba(37,29,22,.12)}
.reader-toc-summary{display:inline-flex;align-items:center;gap:7px;margin-top:18px;padding:12px 10px;border:1px solid rgba(37,29,22,.12);border-radius:14px;background:var(--reader-paper-panel);color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;font-weight:760;line-height:1.4;white-space:nowrap}
.reader-toc-summary-stat{display:inline-flex;align-items:center;gap:4px;min-width:0}
.reader-toc-summary-stat svg{width:14px;height:14px;flex:none;stroke-width:2.1}
.reader-toc-summary-value{min-width:1ch;text-align:right}
.reader-toc-summary-separator{color:var(--reader-muted)}
.reader-notes-header{display:grid;gap:10px;margin:0 -16px 14px;padding:14px 16px;border-bottom:1px solid rgba(40,35,29,.08);background:var(--app-reader-toc-bg);box-shadow:0 8px 18px color-mix(in srgb,var(--reader-ink) 5%,transparent)}
.reader-notes-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.reader-notes-title-row strong{font-size:22px;font-weight:900;letter-spacing:0}
.reader-notes-title-row span{display:inline-flex;align-items:center;height:28px;border:1px solid var(--reader-ink-subtle);border-radius:999px;background:rgba(255,250,240,.76);color:var(--reader-muted);font-size:12px;font-weight:820;padding:0 10px}
.reader-note-tabs [data-slot="tabs-list"]{display:grid;width:100%;height:38px;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;padding:3px;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:var(--app-reader-agent-panel-bg);box-shadow:inset 0 1px 0 rgba(255,255,255,.72)}
.reader-note-tabs [data-slot="tabs-trigger"]{height:30px;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;font-weight:850;letter-spacing:0;padding:0 8px}
.reader-note-tabs [data-slot="tabs-trigger"][data-state="active"]{background:var(--reader-paper);color:var(--reader-ink);box-shadow:0 5px 14px rgba(40,35,29,.08)}
.reader-note-tabs [data-slot="tabs-trigger"]:focus-visible{outline:2px solid rgba(37,29,22,.24);outline-offset:2px}
.reader-note{overflow:hidden;padding:0;--reader-note-accent:var(--reader-yellow-strong)}
.reader-note:has(.reader-agent-menu),.reader-note:has(.reader-comment-agent-more-menu),.reader-note:has(.reader-action-menu-panel){z-index:26;overflow:visible}
.reader-note.has-review-menu{z-index:24;overflow:visible}
.reader-note.has-review-burst{overflow:visible}
.reader-note-body{position:relative;min-width:0;padding:16px 16px 0;background:var(--reader-paper)}
.reader-note.has-discussion .reader-note-body{padding:24px 22px 0;background:var(--app-reader-note-bg)}
.reader-note-toolbar{position:relative;display:flex;align-items:stretch;margin:14px -16px 0;border-top:1px solid rgba(40,35,29,.12);background:var(--reader-paper-panel)}
.reader-note.has-discussion .reader-note-toolbar{margin:20px -22px 0;border-top:1.5px solid color-mix(in srgb,var(--reader-note-accent) 46%,var(--app-reader-note-border));background:color-mix(in srgb,var(--app-reader-note-bg) 82%,var(--reader-bg))}
.reader-note-thread-toggle{display:flex;width:100%;min-width:0;min-height:44px;align-items:center;justify-content:space-between;gap:12px;border:0;background:transparent;color:var(--reader-muted);font:inherit;padding:0 14px 0 16px;text-align:left;transition:background .14s ease,color .14s ease}
.reader-note-thread-toggle:hover{background:var(--app-reader-agent-panel-hover-bg);color:var(--reader-ink)}
.reader-note-thread-toggle:active{background:color-mix(in srgb,var(--reader-note-accent) 14%,var(--reader-paper))}
.reader-note-thread-toggle-main{display:inline-flex;min-width:0;align-items:center;gap:10px}
.reader-note-thread-toggle-side{display:inline-flex;min-width:0;align-items:center;justify-content:flex-end;color:var(--reader-muted)}
.reader-note-toolbar.has-review-action .reader-note-thread-toggle{width:auto;flex:1 1 auto}
.reader-note-summary-toolbar{min-width:0}
.reader-note-discussion-summary{display:grid;flex:1 1 auto;min-width:0;min-height:58px;align-content:center;gap:3px;padding:10px 12px 10px 22px;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-note-discussion-summary .reader-note-thread-toggle-main{gap:9px}
.reader-note-assistant-summary{display:block;min-width:0;overflow:hidden;color:var(--reader-muted);font-size:11px;font-weight:760;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}
.reader-note-discussion-summary.is-busy .reader-note-assistant-summary{color:var(--reader-ink)}
.reader-note-discussion-entry{display:inline-flex;flex:0 0 auto;min-width:108px;align-items:center;justify-content:center;gap:7px;margin:9px 12px 9px 0;border:1px solid color-mix(in srgb,var(--reader-green) 22%,var(--app-reader-note-border));border-radius:10px;background:color-mix(in srgb,var(--reader-green) 10%,var(--reader-paper));color:color-mix(in srgb,var(--reader-green) 72%,var(--reader-ink));font:inherit;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:860;padding:0 12px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-note-discussion-entry:hover{background:color-mix(in srgb,var(--reader-green) 16%,var(--reader-paper));color:var(--reader-ink)}
.reader-note-discussion-entry:active{transform:scale(.98)}
.reader-note-discussion-entry[aria-disabled="true"]{cursor:default;opacity:.72}
.reader-note-discussion-entry[aria-disabled="true"]:hover{background:var(--reader-paper);color:var(--reader-muted)}
.reader-review-invite-wrap{position:relative;display:flex;flex:0 0 auto;align-items:stretch;border-left:1px solid var(--reader-ink-subtle)}
.reader-review-invite{display:inline-flex;min-width:78px;align-items:center;justify-content:center;gap:5px;border:0;background:var(--reader-paper);color:var(--reader-muted);font:inherit;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:860;padding:0 11px;transition:background .14s ease,color .14s ease}
.reader-review-invite:hover,.reader-review-invite.is-active{background:var(--reader-paper-hover);color:var(--reader-ink)}
.reader-review-invite:disabled{cursor:not-allowed;opacity:.58}
.reader-review-invite.is-reviewing svg{animation:reader-review-scale 1.05s ease-in-out infinite}
.reader-review-active-avatars{display:inline-flex;align-items:center;margin-left:1px}
.reader-review-active-avatars>span{display:grid;width:20px;height:20px;place-items:center;border-radius:999px;animation:reader-review-avatar-float .9s ease-in-out infinite}
.reader-review-active-avatars .reader-avatar-badge{width:18px;height:18px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green));font-size:8px}
.reader-review-active-avatars .reader-avatar-badge.is-image{background:transparent}
.reader-review-menu{position:absolute;right:8px;bottom:calc(100% + 8px);z-index:30;display:grid;gap:4px;width:238px;padding:8px;border:1px solid var(--app-reader-selection-menu-border);border-radius:14px;background:var(--reader-paper);box-shadow:var(--reader-elevated-shadow);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);transform-origin:bottom right}
.reader-review-menu>button{display:grid;width:100%;grid-template-columns:20px 30px minmax(0,1fr);align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);padding:8px;text-align:left}
.reader-review-menu>button:hover,.reader-review-menu>button.is-selected{background:var(--app-reader-toolbar-control-hover-bg)}
.reader-review-menu button:disabled{cursor:not-allowed;opacity:.54}
.reader-review-menu-check{display:grid;width:18px;height:18px;place-items:center;border:1px solid rgba(40,35,29,.16);border-radius:999px;color:var(--reader-red)}
.reader-review-menu .reader-avatar-badge{width:28px;height:28px;overflow:hidden;border-radius:999px;background:var(--reader-green);font-size:10px}
.reader-review-menu>button>span:last-child{display:grid;min-width:0;gap:2px}
.reader-review-menu strong{overflow:hidden;font-size:12px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
.reader-review-menu em{overflow:hidden;color:var(--reader-muted);font-size:11px;font-style:normal;font-weight:760;text-overflow:ellipsis;white-space:nowrap}
.reader-review-menu footer{display:flex;align-items:center;justify-content:flex-end;gap:7px;margin:4px -2px -2px;padding:8px 2px 0;border-top:1px solid rgba(40,35,29,.1)}
.reader-review-menu footer button{display:inline-flex;width:auto;height:30px;align-items:center;justify-content:center;border:0;border-radius:999px;background:#e7dac9;color:var(--reader-ink);font:inherit;font-size:11px;font-weight:860;padding:0 11px}
.reader-review-menu footer button:last-child{background:var(--reader-ink);color:#fffaf0}
.reader-review-menu footer button:disabled{cursor:not-allowed;opacity:.48}
.reader-note-review-burst{position:absolute;inset:0;z-index:6;overflow:visible;pointer-events:none}
.reader-note-review-burst .reader-completion-burst{position:absolute;inset:0;overflow:visible}
.reader-note-review-burst .reader-completion-burst-center{left:50%;top:44%;transform:scale(.58)}
.reader-note-toolbar .reader-delete-note{height:26px;margin-right:0;padding:0 8px;font-size:11px}
.reader-action-menu{position:relative;display:flex;align-items:center;justify-content:flex-end;overflow:visible}
.reader-action-menu-button{display:grid;width:32px;height:32px;place-items:center;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);padding:0;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-action-menu-button:hover,.reader-action-menu.is-open .reader-action-menu-button{background:var(--reader-paper-hover);color:var(--reader-ink)}
.reader-action-menu-button:active{transform:scale(.96)}
.reader-action-menu-button:focus-visible{outline:2px solid rgba(37,29,22,.22);outline-offset:2px}
.reader-action-menu-panel{display:grid;min-width:132px;padding:4px;border:1px solid var(--app-reader-selection-menu-border,color-mix(in srgb,var(--app-reader-ink,#251d16) 12%,transparent));border-radius:10px;background:var(--reader-paper,var(--app-reader-paper,#fffaf0));box-shadow:var(--reader-soft-shadow,0 8px 20px color-mix(in srgb,var(--app-reader-ink,#251d16) 10%,transparent));color:var(--reader-ink,var(--app-reader-ink,#251d16));font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);transform-origin:top right}
.reader-action-menu-item{display:inline-flex;width:100%;height:32px;align-items:center;justify-content:flex-start;gap:7px;border:0;border-radius:7px;background:transparent;color:var(--reader-ink,var(--app-reader-ink,#251d16));font:inherit;font-size:12px;font-weight:760;padding:0 9px}
.reader-action-menu-item:hover{background:var(--reader-paper-hover,color-mix(in srgb,var(--app-reader-ink,#251d16) 6%,var(--app-reader-paper,#fffaf0)))}
.reader-action-delete{width:100%;height:32px;justify-content:flex-start;border-radius:7px;background:transparent;box-shadow:none;font-size:12px;padding:0 9px}
.reader-action-delete:hover{background:var(--reader-paper-hover,color-mix(in srgb,var(--app-reader-ink,#251d16) 6%,var(--app-reader-paper,#fffaf0)))}
.reader-annotation-connection{position:fixed;inset:0;z-index:4;width:100vw;height:var(--app-viewport-height);overflow:visible;pointer-events:none}
.reader-annotation-connection-line{fill:none;stroke-width:2.15;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 4px 8px rgba(55,42,24,.18));opacity:.9}
.reader-annotation-arrowhead{fill:none;stroke-width:2.15;stroke-linecap:round;stroke-linejoin:round;opacity:.94}
.reader-note-anchor>span{padding:0;margin:0;background:transparent;border-radius:0}
.reader-note-card-header{position:relative;display:block;min-width:0}
.reader-note-card-header .reader-note-quote{margin-top:0}
.reader-note.has-discussion .reader-note-quote-badge{position:absolute;left:0;top:0;z-index:1;display:grid;width:40px;height:40px;place-items:center;border-radius:999px;background:color-mix(in srgb,var(--reader-note-accent) 16%,transparent);color:color-mix(in srgb,var(--reader-note-accent) 84%,var(--reader-ink))}
.reader-note.has-discussion .reader-note-left-line{position:absolute;left:19px;top:46px;bottom:10px;z-index:0;width:2px;border-radius:999px;background:linear-gradient(to bottom,color-mix(in srgb,var(--reader-note-accent) 82%,var(--reader-ink)),color-mix(in srgb,var(--reader-note-accent) 74%,transparent) 72%,transparent)}
.reader-note.has-discussion .reader-note-background-quote{position:absolute;right:-3px;bottom:-22px;z-index:0;color:color-mix(in srgb,var(--reader-note-accent) 13%,transparent);font-family:var(--font-reader-serif, Georgia, Cambria, "Times New Roman", serif);font-size:118px;font-weight:900;line-height:1;pointer-events:none;user-select:none}
.reader-note.has-distillation{overflow:visible;border:0;background:transparent;box-shadow:none;--reader-note-ticket-fill:var(--app-reader-note-bg);--reader-note-ticket-stroke:color-mix(in srgb,var(--reader-note-accent) 48%,var(--app-reader-note-border))}
.reader-note.has-distillation.is-active{border:0;background:transparent;box-shadow:none;--reader-note-ticket-stroke:color-mix(in srgb,var(--reader-note-accent) 44%,var(--app-reader-note-border))}
.reader-note.has-distillation .reader-note-body{position:relative;display:grid;grid-template-rows:minmax(0,1fr) auto;overflow:visible;min-height:184px;padding:0;background:transparent}
.reader-note-distillation-ticket{position:absolute;inset:0;z-index:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.reader-note.has-distillation.is-active .reader-note-distillation-ticket{filter:drop-shadow(0 0 0 color-mix(in srgb,var(--reader-note-accent) 26%,transparent)) drop-shadow(0 12px 22px color-mix(in srgb,var(--reader-ink) 14%,transparent)) drop-shadow(0 5px 14px color-mix(in srgb,var(--reader-note-accent) 14%,transparent))}

.reader-note.has-distillation .reader-note-card-header{position:relative;z-index:1;display:grid;min-height:126px;align-items:center;padding:28px 56px 18px 34px}
.reader-note-owner{display:grid;width:30px;height:30px;place-items:center;flex:0 0 auto;border:0;border-radius:999px;background:transparent;color:inherit;padding:0}
.reader-note-owner .reader-avatar-badge{width:30px;height:30px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green))}
.reader-note-owner .reader-avatar-badge.is-image{background:transparent}
.reader-note-meta{position:relative;z-index:1;display:grid;grid-template-columns:30px minmax(0,1fr) auto;min-width:0;align-items:center;gap:10px;margin-top:18px;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-note.has-discussion .reader-note-meta{padding-left:50px}
.reader-note-meta-copy{display:flex;min-width:0;align-items:baseline;gap:7px}
.reader-note-meta strong{overflow:hidden;color:var(--reader-ink);font-size:13px;font-weight:880;text-overflow:ellipsis;white-space:nowrap}
.reader-note-meta time{flex:0 0 auto;color:var(--reader-muted);font-size:11px;font-weight:760;font-variant-numeric:tabular-nums;white-space:nowrap}
.reader-comment-count{display:inline-flex;align-items:center;gap:6px;min-width:0;color:inherit;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;font-weight:820;font-variant-numeric:tabular-nums;white-space:nowrap}
.reader-note-type,.reader-note-intent{display:inline-flex;width:fit-content;align-items:center;gap:4px;border:1px solid rgba(159,91,80,.16);border-radius:999px;background:rgba(159,91,80,.07);color:var(--reader-red);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:850;line-height:1;padding:4px 7px;white-space:nowrap}
.reader-note-intent{border-color:color-mix(in srgb,var(--reader-ink) 12%,transparent);background:color-mix(in srgb,var(--reader-ink) 6%,transparent);color:var(--reader-muted)}
.reader-note-quote{position:relative;z-index:1;display:grid;width:100%;gap:5px;padding:0;border:0;background:transparent;color:var(--reader-ink);font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif);text-align:left;text-decoration:none}
.reader-note.has-discussion .reader-note-quote{padding-left:50px}
.reader-note-quote-mark{display:block;color:var(--reader-note-accent);font-family:var(--font-reader-serif, Georgia, Cambria, "Times New Roman", serif);font-size:28px;font-style:normal;font-weight:900;line-height:.78}
.reader-note.has-discussion .reader-note-quote-mark{display:none}
.reader-note-quote-text{display:block;color:var(--reader-ink);font-size:14px;font-style:normal;font-weight:690;line-height:1.72;text-wrap:pretty}
.reader-note.has-distillation .reader-note-quote{min-height:92px;align-items:center;padding:0}
.reader-note.has-distillation .reader-note-quote-text{font-size:15px;font-weight:720;letter-spacing:0;line-height:1.7}
.reader-note.is-distillation-morph-out .reader-note-body{transform-origin:center center;will-change:transform,opacity;animation:reader-distillation-morph-out 200ms cubic-bezier(.22,1,.36,1) both}
.reader-note.is-distillation-morph-in .reader-note-body{transform-origin:center center;will-change:transform,opacity;animation:reader-distillation-morph-in 300ms cubic-bezier(.22,1,.36,1) both}
.reader-note.is-distillation-unpublish-wobble .reader-note-body{transform-origin:center center;will-change:transform;animation:reader-distillation-unpublish-wobble 150ms ease both}
.reader-note.is-distillation-update .reader-note-body{transform-origin:center center;will-change:transform;animation:reader-distillation-update-breathe 400ms cubic-bezier(.22,1,.36,1) both}
.reader-note.is-distillation-update .reader-note-quote-text{animation:reader-distillation-fade .82s cubic-bezier(.22,1,.36,1)}
.reader-note.is-distillation-morph-in .reader-note-body::after,.reader-note.is-distillation-update .reader-note-body::after{content:"";position:absolute;inset:-40% -65%;z-index:2;background:linear-gradient(105deg,transparent 38%,color-mix(in srgb,var(--reader-paper) 14%,transparent) 44%,color-mix(in srgb,var(--reader-paper) 78%,transparent) 50%,color-mix(in srgb,var(--reader-paper) 16%,transparent) 56%,transparent 62%);pointer-events:none;transform:translateX(-58%) rotate(10deg);animation:reader-distillation-shimmer 1.05s cubic-bezier(.22,1,.36,1) both}
@keyframes reader-distillation-morph-out{0%{transform:scale(1);opacity:1}100%{transform:scale(.97);opacity:.6}}
@keyframes reader-distillation-morph-in{0%{transform:scale(.97);opacity:.6}100%{transform:scale(1);opacity:1}}
@keyframes reader-distillation-unpublish-wobble{0%{transform:rotate(0)}30%{transform:rotate(1deg)}70%{transform:rotate(-1deg)}100%{transform:rotate(0)}}
@keyframes reader-distillation-update-breathe{0%{transform:scale(1)}50%{transform:scale(1.01)}100%{transform:scale(1)}}
@keyframes reader-distillation-fade{0%{opacity:.16;transform:translateY(7px);filter:blur(3px)}42%{opacity:.5;filter:blur(1.6px)}100%{opacity:1;transform:translateY(0);filter:blur(0)}}
@keyframes reader-distillation-shimmer{0%{opacity:0;transform:translateX(-58%) rotate(10deg)}12%{opacity:1}100%{opacity:0;transform:translateX(58%) rotate(10deg)}}
@media (prefers-reduced-motion: reduce){.reader-note.is-distillation-morph-out .reader-note-body,.reader-note.is-distillation-morph-in .reader-note-body,.reader-note.is-distillation-unpublish-wobble .reader-note-body,.reader-note.is-distillation-update .reader-note-body,.reader-note.is-distillation-update .reader-note-quote-text,.reader-note.is-distillation-morph-in .reader-note-body::after,.reader-note.is-distillation-update .reader-note-body::after{animation:none;will-change:auto}}
.reader-thought-author-stack{display:inline-flex;min-width:0;align-items:center}
.reader-thought-author-avatar{display:grid;width:25px;height:25px;place-items:center;border-radius:999px;background:transparent}
.reader-thought-author-avatar+.reader-thought-author-avatar{margin-left:-8px}
.reader-thought-author-avatar .reader-avatar-badge{width:23px;height:23px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green));font-size:10px}
.reader-thought-author-avatar .reader-avatar-badge.is-image{background:transparent}
.reader-thought-author-more{display:grid;min-width:25px;height:25px;place-items:center;margin-left:-8px;border:2px solid var(--reader-paper);border-radius:999px;background:var(--app-reader-agent-panel-hover-bg);color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:10px;font-weight:900;font-variant-numeric:tabular-nums}
.reader-pending-agent-stack{display:inline-flex;min-width:0;align-items:center}
.reader-pending-agent-avatar{position:relative;display:grid;width:25px;height:25px;place-items:center;border-radius:999px;background:transparent}
.reader-pending-agent-avatar+.reader-pending-agent-avatar{margin-left:-8px}
.reader-pending-agent-avatar::after{content:"";position:absolute;right:1px;bottom:1px;width:7px;height:7px;border:2px solid var(--reader-paper);border-radius:999px;background:var(--reader-avatar-color,var(--reader-green));box-shadow:0 0 0 0 color-mix(in srgb,var(--reader-avatar-color,var(--reader-green)) 28%,transparent);animation:reader-pending-agent-pulse 1.24s ease-in-out infinite}
.reader-pending-agent-avatar .reader-avatar-badge{width:23px;height:23px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green));font-size:10px;filter:saturate(.82);opacity:.78}
.reader-pending-agent-avatar .reader-avatar-badge.is-image{background:transparent}
.reader-pending-agent-more{display:grid;min-width:25px;height:25px;place-items:center;margin-left:-8px;border:2px solid var(--reader-paper);border-radius:999px;background:var(--app-reader-agent-panel-hover-bg);color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:10px;font-weight:900;font-variant-numeric:tabular-nums}
.reader-note-distillation-menu{position:absolute;right:18px;top:18px;z-index:5}
.reader-note-distillation-menu .reader-action-menu-button{width:32px;height:32px;background:transparent;color:var(--reader-muted)}
.reader-note-distillation-menu .reader-action-menu-button:hover,.reader-note-distillation-menu.is-open .reader-action-menu-button{background:var(--reader-paper-hover);color:var(--reader-ink)}
.reader-note-distillation-footer{position:relative;z-index:1;min-height:50px;align-items:center;justify-content:space-between;margin:0;padding:0 34px;border-top:0;background:transparent}
.reader-note-distillation-footer::before{content:"";position:absolute;left:28px;right:28px;top:0;border-top:1.5px dashed color-mix(in srgb,var(--reader-note-accent) 36%,var(--app-reader-note-border));pointer-events:none}
.reader-note-distillation-badge{display:inline-grid;width:24px;height:24px;place-items:center;border-radius:0;background:transparent;color:color-mix(in srgb,var(--reader-note-accent) 76%,var(--reader-muted));opacity:.9}
.reader-note-distillation-badge svg{width:18px;height:18px}
.reader-note-distillation-time{color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;font-weight:760;font-variant-numeric:tabular-nums}
.reader-note-comments-region{width:100%;margin-top:0;overflow:visible}
.reader-note-comments-panel{display:grid;grid-template-rows:auto auto;min-height:0;overflow:visible;gap:0;border-top:1px solid var(--app-reader-note-border);background:color-mix(in srgb,var(--app-reader-note-bg) 86%,var(--reader-paper));padding:12px}
.reader-note-comments-panel>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:8px;border-bottom:1px dashed color-mix(in srgb,var(--reader-ink) 14%,transparent);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-note-comments-panel>header>div{display:flex;align-items:baseline;gap:7px;min-width:0}
.reader-note-comments-panel>header strong{font-size:13px;font-weight:900}
.reader-note-comments-panel>header span{color:var(--reader-muted);font-size:11px;font-weight:800}
.reader-note-comments-panel>header button{display:inline-flex;align-items:center;gap:4px;height:26px;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);font:inherit;font-size:11px;font-weight:850;padding:0 8px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-note-comments-panel>header button:hover{background:var(--app-reader-agent-panel-hover-bg);color:var(--reader-ink)}
.reader-note-comments-panel>header button:active{transform:scale(.96)}
.reader-note-comments-panel .reader-comments{display:grid;gap:8px;min-height:0;overflow:visible;margin:0 -4px 0 0;padding:0 4px 0 0}
.reader-note-comments-panel .reader-comment{grid-template-columns:32px minmax(0,1fr);width:100%;min-width:0}
.reader-discussion-thread{position:relative;z-index:0;display:grid;width:100%;overflow:visible;border:1px solid var(--app-reader-note-border);border-radius:8px;background:var(--reader-paper);box-shadow:0 1px 3px color-mix(in srgb,var(--reader-ink) 4%,transparent)}
.reader-note-comments-panel .reader-comments:has(.reader-agent-menu),.reader-note-comments-panel .reader-comments:has(.reader-agent-avatar-stack),.reader-note-comments-panel .reader-comments:has(.reader-comment-agent-more-menu),.reader-note-comments-panel .reader-comments:has(.reader-action-menu-panel),.reader-discussion-thread:has(.reader-agent-menu),.reader-discussion-thread:has(.reader-agent-avatar-stack),.reader-discussion-thread:has(.reader-comment-agent-more-menu),.reader-discussion-thread:has(.reader-action-menu-panel),.reader-thread-detail:has(.reader-agent-menu),.reader-thread-detail:has(.reader-agent-avatar-stack),.reader-thread-detail:has(.reader-comment-agent-more-menu),.reader-thread-detail:has(.reader-action-menu-panel),.reader-thought-footer:has(.reader-agent-avatar-stack),.reader-thought-footer:has(.reader-comment-agent-more-menu),.reader-thought-footer-actions:has(.reader-agent-avatar-stack),.reader-thought-footer-actions:has(.reader-comment-agent-more-menu),.reader-thread-reply-composer:has(.reader-agent-avatar-stack),.reader-thread-reply-composer:has(.reader-comment-agent-more-menu),.reader-inline-composer-panel:has(.reader-agent-avatar-stack),.reader-inline-composer-panel:has(.reader-comment-agent-more-menu),.reader-new-thought-composer:has(.reader-agent-avatar-stack),.reader-note-footer:has(.reader-agent-avatar-stack),.reader-composer .floating-composer-actions:has(.reader-agent-avatar-stack){overflow:visible}
.reader-discussion-thread:has(.reader-agent-menu),.reader-discussion-thread:has(.reader-comment-agent-more-menu),.reader-discussion-thread:has(.reader-action-menu-panel){z-index:20}
.reader-discussion-thread.is-open{grid-template-rows:auto auto auto;margin-bottom:14px;border:1px solid var(--app-reader-note-border);outline:0;background:var(--reader-paper);box-shadow:none}
.reader-thought-summary-wrap{position:relative;min-width:0}
.reader-thought-summary{display:grid;width:100%;min-height:0;grid-template-columns:34px minmax(0,1fr);align-items:start;gap:10px;border:0;background:transparent;color:inherit;font:inherit;padding:13px 14px 12px;text-align:left}
.reader-thought-summary:focus-visible{outline:2px solid rgba(37,29,22,.22);outline-offset:-2px}
.reader-thought-owner{display:grid;width:34px;height:34px;place-items:center;border-radius:999px;background:transparent}
.reader-thought-owner .reader-avatar-badge,.reader-thought-summary .reader-avatar-badge{width:30px;height:30px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green))}
.reader-thought-owner .reader-avatar-badge.is-image,.reader-thought-summary .reader-avatar-badge.is-image{background:transparent}
.reader-thought-summary-copy{display:grid;min-width:0;gap:8px}
.reader-thought-summary-meta{display:flex;min-width:0;align-items:baseline;gap:7px}
.reader-thought-summary-meta strong{display:block;overflow:hidden;color:var(--reader-ink);font-size:13px;font-weight:880;line-height:1.18;text-overflow:ellipsis;white-space:nowrap}
.reader-thought-time{color:var(--reader-muted);font-size:11px;font-weight:760;font-variant-numeric:tabular-nums;line-height:1.1;white-space:nowrap}
.reader-thought-summary .reader-comment-markdown{color:var(--app-reader-note-quote-text)}
.reader-thought-summary .reader-markdown-content,.reader-thought-summary .reader-markdown-content p{font-size:13px;font-weight:520;line-height:1.68}
.reader-thought-footer{position:relative;z-index:1;display:flex;min-height:44px;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;overflow:visible;padding:8px 14px;border-top:1px solid var(--app-reader-note-border);background:color-mix(in srgb,var(--app-reader-note-bg) 76%,var(--reader-paper))}
.reader-replies-toggle,.reader-replies-label{display:inline-flex;align-items:center;gap:6px;height:28px;border:0;background:transparent;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;font-weight:820;font-variant-numeric:tabular-nums;padding:0}
.reader-replies-toggle{transition:color .14s ease}
.reader-replies-toggle:hover{color:var(--reader-red)}
.reader-replies-label{cursor:default}
.reader-thought-footer-actions{display:inline-flex;min-width:0;align-items:center;justify-content:flex-end;gap:10px;margin-left:auto}
.reader-thought-review-status{display:inline-flex;min-width:0;align-items:center;gap:6px;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:850}
.reader-replies-toggle .reader-thought-review-status,.reader-replies-label .reader-thought-review-status{margin-left:3px}
.reader-thought-reviewer-stack,.reader-thought-review-motion{display:inline-flex;min-width:0;align-items:center}
.reader-thought-reviewer-stack>span,.reader-thought-review-motion>span{display:grid;width:22px;height:22px;place-items:center;border-radius:999px;background:transparent}
.reader-thought-reviewer-stack>span+span{margin-left:-7px}
.reader-thought-reviewer-stack .reader-avatar-badge,.reader-thought-review-motion .reader-avatar-badge{width:20px;height:20px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green));font-size:8px}
.reader-thought-reviewer-stack .reader-avatar-badge.is-image,.reader-thought-review-motion .reader-avatar-badge.is-image{background:transparent}
.reader-thought-review-motion{gap:4px}
.reader-thought-review-motion>span{animation:reader-review-avatar-travel var(--reviewer-duration) ease-in-out infinite;animation-delay:calc(var(--reviewer-index) * 120ms)}
.reader-thought-action-menu{position:absolute;right:10px;top:10px;z-index:2}
.reader-thread-detail::-webkit-scrollbar{width:7px}
.reader-thread-detail::-webkit-scrollbar-track{background:transparent}
.reader-thread-detail::-webkit-scrollbar-thumb{border:2px solid rgba(255,252,246,.9);border-radius:999px;background:rgba(154,143,131,.32)}
.reader-thread-detail{display:grid;max-height:min(calc(var(--app-viewport-height) * 0.46),420px);min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;gap:0;padding:0 14px 18px}
.reader-thread-detail:hover::-webkit-scrollbar-thumb{background:rgba(154,143,131,.48)}
.reader-thread-replies{position:relative;display:grid;gap:0;margin-left:0;padding-left:0}
.reader-thread-replies .reader-comment{position:relative;padding:11px 0;border-top:1px solid var(--app-reader-note-border);border-radius:0;background:transparent}
.reader-thread-replies .reader-comment:first-child{border-top-color:color-mix(in srgb,var(--reader-ink) 8%,transparent)}
.reader-comment.is-reply{grid-template-columns:28px minmax(0,1fr)}
.reader-comment.is-reply .reader-avatar-badge{width:26px;height:26px}
.reader-comment-action-menu{opacity:0;pointer-events:none;transition:opacity .14s ease}
.reader-comment:hover .reader-comment-action-menu,.reader-comment:focus-within .reader-comment-action-menu,.reader-comment-action-menu.is-open{opacity:1;pointer-events:auto}
.reader-comment-action-menu .reader-action-menu-button{width:28px;height:28px}
.reader-thread-reply-composer{display:flex;min-width:0;overflow:visible;justify-content:flex-end}
.reader-thought-footer-actions:has(.reader-inline-composer-panel){flex:1 0 100%;width:100%;align-items:flex-start;justify-content:stretch;margin-left:0}
.reader-thread-reply-composer:has(.reader-inline-composer-panel){flex:1 0 100%;justify-content:stretch;margin-top:8px}
.reader-thread-reply-composer .reader-inline-composer-panel{width:100%}
.reader-pending-thoughts{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;margin:8px 0 0;padding:11px 12px 13px;overflow:hidden;border:1px solid var(--app-reader-note-border);border-radius:8px;background:var(--reader-paper);box-shadow:0 1px 3px color-mix(in srgb,var(--reader-ink) 4%,transparent);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-pending-thoughts .reader-pending-agent-stack{align-self:start;padding-top:2px}
.reader-pending-thought-copy{display:grid;min-width:0;gap:3px}
.reader-pending-thought-copy strong{overflow:hidden;color:var(--reader-ink);font-size:13px;font-weight:880;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.reader-pending-thought-copy em{color:var(--reader-muted);font-size:12px;font-style:normal;font-weight:720;line-height:1.4;text-wrap:pretty}
.reader-pending-thought-progress{position:absolute;left:0;right:0;bottom:0;height:3px;overflow:hidden;background:color-mix(in srgb,var(--reader-ink) 8%,transparent)}
.reader-pending-thought-progress i{display:block;width:42%;height:100%;border-radius:999px;background:linear-gradient(90deg,transparent,var(--reader-note-accent,var(--reader-green)),transparent);animation:reader-pending-thought-progress 1.38s cubic-bezier(.22,1,.36,1) infinite}
.reader-new-thought-composer{margin:10px -12px -12px;padding:12px;border-top:1px solid var(--app-reader-note-border);background:color-mix(in srgb,var(--app-reader-note-bg) 84%,var(--reader-paper))}
.reader-new-thought-composer.is-empty{margin-top:0}
.reader-inline-composer-trigger{display:inline-flex;width:fit-content;justify-self:center;align-items:center;justify-content:center;gap:6px;height:32px;border:1px solid var(--app-reader-composer-border);border-radius:999px;background:var(--reader-paper);color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:850;padding:0 12px;box-shadow:0 4px 12px color-mix(in srgb,var(--reader-ink) 5%,transparent);transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,color .14s ease,transform .14s ease}
.reader-inline-composer-trigger:hover{border-color:color-mix(in srgb,var(--reader-ink) 22%,transparent);background:var(--app-reader-agent-panel-hover-bg);box-shadow:0 6px 16px color-mix(in srgb,var(--reader-ink) 8%,transparent);color:var(--reader-ink)}
.reader-inline-composer-trigger:active{transform:scale(.96)}
.reader-inline-composer-trigger:focus-visible{outline:2px solid rgba(37,29,22,.22);outline-offset:2px}
.reader-new-thought-composer .reader-inline-composer-trigger{width:100%;min-width:0;height:40px;border:1px dashed color-mix(in srgb,var(--reader-ink) 18%,transparent);border-radius:8px;background:var(--reader-paper)}
.reader-new-thought-composer .reader-inline-composer-trigger:hover{border-color:color-mix(in srgb,var(--reader-red) 18%,transparent);background:var(--app-reader-agent-panel-hover-bg);color:var(--reader-red)}
.reader-inline-composer-panel{position:relative;overflow:visible;transform-origin:top left}
.reader-inline-composer-panel.t-dropdown{transform:scale(.98);transition:transform .18s cubic-bezier(.22,1,.36,1),opacity .18s cubic-bezier(.22,1,.36,1)}
.reader-inline-composer-panel.t-dropdown.is-open{transform:scale(1)}
.reader-note-comments-panel .reader-markdown-content,.reader-note-comments-panel .reader-markdown-content *{max-width:100%;min-width:0;overflow-wrap:anywhere;word-break:break-word}
.reader-comments-empty{border:1px dashed color-mix(in srgb,var(--reader-ink) 14%,transparent);border-radius:12px;background:var(--reader-paper);color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.4;padding:12px;text-align:center}
.reader-comment-markdown{position:relative}
.reader-comment-markdown.is-collapsed .reader-markdown-content{max-height:calc(1.66em * 4);overflow:hidden}
.reader-comment-markdown.is-collapsed::after{content:"";position:absolute;left:0;right:0;bottom:28px;height:34px;background:linear-gradient(to bottom,transparent,color-mix(in srgb,var(--app-reader-note-bg) 96%,transparent));pointer-events:none}
.reader-note-primary-comment .reader-comment-markdown.is-collapsed::after{background:linear-gradient(to bottom,transparent,var(--reader-paper))}
.reader-comment-expand{position:relative;z-index:1;width:fit-content;height:26px;margin-top:4px;border:0;border-radius:999px;background:color-mix(in srgb,var(--reader-ink) 6%,transparent);color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:850;padding:0 9px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-comment-expand:hover{background:var(--app-reader-agent-panel-hover-bg);color:var(--reader-ink)}
.reader-comment-expand:active{transform:scale(.96)}
.reader-comment-author time{color:var(--reader-muted);font-size:10px;font-weight:760;font-variant-numeric:tabular-nums;white-space:nowrap}
.reader-comment-agent-tray{position:relative;display:flex;flex:0 1 auto;align-items:center;gap:8px;margin-right:auto;min-width:0;overflow:visible;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:780}
.reader-comment-agent-tray>button{display:grid;width:30px;height:30px;place-items:center;border:1px solid color-mix(in srgb,var(--reader-ink) 12%,transparent);border-radius:999px;background:var(--reader-paper);color:var(--reader-muted);padding:0}
.reader-comment-agent-tray>button:hover{background:var(--app-reader-agent-panel-hover-bg);color:var(--reader-ink)}
.reader-comment-agent-tray button:disabled{cursor:not-allowed;opacity:.45}
.reader-comment-agent-tray span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-comment-agent-tray .reader-agent-avatar-stack,.reader-comment-agent-tray .reader-agent-avatar-stack-item{overflow:visible}
.reader-comment-agent-tray .reader-comment-mention-label{display:grid;width:30px;height:30px;place-items:center;border:1px solid color-mix(in srgb,var(--reader-ink) 12%,transparent);border-radius:999px;background:var(--reader-paper);color:var(--reader-muted);font-size:15px;font-weight:850}
.reader-comment-agent-tray .reader-agent-avatar-stack{padding:0}
.reader-comment-agent-tray .reader-agent-avatar-stack-item{width:30px;height:30px;border-color:var(--reader-paper);background:var(--reader-paper)}
.reader-comment-agent-tray .reader-agent-avatar-stack-item:hover{background:var(--reader-paper)}
.reader-comment-agent-tray .reader-avatar-badge{width:24px;height:24px}
.reader-comment-agent-more{position:relative;z-index:40}
.reader-comment-agent-more-menu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:60;display:grid;gap:4px;width:190px;padding:8px;border:1px solid var(--app-reader-selection-menu-border);border-radius:14px;background:var(--reader-paper);box-shadow:var(--app-reader-composer-shadow)}
.reader-comment-agent-more-menu button{display:grid;width:100%;height:36px;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);padding:0 8px;text-align:left}
.reader-comment-agent-more-menu button:hover{background:var(--app-reader-agent-panel-hover-bg)}
.reader-comment-agent-more-menu strong{overflow:hidden;font-size:12px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
.reader-comment-agent-more-menu em{color:var(--reader-muted);font-size:11px;font-style:normal;font-weight:760}
.reader-note-comments-panel .reader-comment-box textarea{min-height:68px;max-height:96px;margin-top:0}
.reader-composer textarea:focus,.reader-composer textarea:focus-visible,.reader-note-comments-panel .reader-comment-box textarea:focus,.reader-note-comments-panel .reader-comment-box textarea:focus-visible{outline:0;box-shadow:none}
.reader-note-footer .reader-shortcut-hint{flex:0 0 auto;margin-right:0}
.reader-note-footer .reader-add-comment{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;gap:4px;padding:7px 10px}
.reader-composer{position:absolute;z-index:var(--reader-z-popover);width:min(520px,calc(100vw - 24px));padding:0;overflow:visible;border-color:var(--app-reader-composer-border);border-radius:20px;background:var(--reader-paper);box-shadow:var(--app-reader-composer-shadow),0 0 0 1px color-mix(in srgb,var(--reader-paper) 58%,transparent) inset;transform-origin:24px 18px;animation:reader-composer-pop .22s cubic-bezier(.22,1,.36,1)}
.reader-composer[data-placement="above"]{transform-origin:24px calc(100% - 18px)}
.reader-composer-header{display:grid;gap:8px;padding:12px 14px 10px;border-bottom:1px solid var(--app-reader-composer-border);border-radius:19px 19px 0 0;background:var(--reader-paper);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-composer-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.reader-composer-title-row strong{font-size:14px;font-weight:900;letter-spacing:0}
.reader-composer-title-row .reader-shortcut-hint{margin-right:0}
.reader-composer-types{display:grid;grid-template-columns:72px repeat(5,minmax(58px,1fr));align-items:center;gap:6px;margin:0}
.reader-composer-group-label{color:var(--reader-muted);font-size:10px;font-weight:900;line-height:1;white-space:nowrap}
.reader-composer-types button{height:28px;min-width:0;overflow:hidden;padding:0 6px;text-overflow:ellipsis;white-space:nowrap;font-size:11px;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease}
.reader-reading-intent-icon{flex:0 0 auto}
.reader-annotation-type-icon{flex:0 0 auto}
.reader-composer-types button:active{transform:scale(.96)}
.reader-composer-editor{position:relative;display:grid;grid-template-rows:minmax(0,auto) auto;gap:10px;min-width:0;border:0;border-radius:0;background:color-mix(in srgb,var(--reader-paper) 74%,var(--app-reader-note-bg));box-shadow:none;padding:14px 15px 12px}
.reader-composer textarea{display:block;min-height:88px;max-height:calc(1.55em * 8 + 28px);margin:0;border:0;border-radius:0;background:transparent;font-size:14px;line-height:1.55;padding:0;resize:none}
.reader-composer .floating-composer-bar{display:flex;min-width:0;align-items:flex-end;justify-content:space-between;gap:12px}
.reader-composer .floating-composer-actions{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:flex-end;gap:8px;margin-left:auto}
.reader-composer .floating-composer-actions button{display:inline-flex;height:32px;align-items:center;justify-content:center;gap:4px;border:0;border-radius:999px;padding:0 10px;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;font-weight:760;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-composer .floating-composer-submit{background:var(--reader-green);color:white}
.reader-composer .floating-composer-submit:disabled{cursor:not-allowed;opacity:.55}
.reader-composer .floating-composer-actions .reader-composer-cancel{background:color-mix(in srgb,var(--reader-ink) 8%,transparent);color:var(--reader-ink)}
.reader-composer .floating-composer-actions .reader-composer-cancel:hover{background:color-mix(in srgb,var(--reader-ink) 12%,transparent)}
.reader-composer .floating-composer-actions button:active{transform:scale(.96)}
.reader-composer-agent-tray{display:flex;min-width:0;align-items:center;gap:6px;margin-right:auto;overflow:visible}
.reader-composer-agent-tray>span{color:var(--reader-muted);font-size:16px;font-weight:900;line-height:1}
.reader-composer-agent-tray .reader-agent-avatar-stack,.reader-composer-agent-tray .reader-agent-avatar-stack-item{overflow:visible}
.reader-composer-actions .reader-composer-agent-tray .reader-agent-avatar-stack-item{width:28px;height:28px;border-color:var(--reader-paper);background:var(--reader-paper);color:inherit}
.reader-composer-actions .reader-composer-agent-tray .reader-agent-avatar-stack-item:hover{background:var(--reader-paper)}
.reader-composer-agent-tray .reader-avatar-badge{width:24px;height:24px}
.reader-composer .reader-agent-menu,.reader-comment-box .reader-agent-menu{right:auto;bottom:calc(100% + 8px);width:190px;max-width:min(190px,calc(100% - 16px));border-color:var(--app-reader-composer-border);background:var(--reader-paper);box-shadow:var(--app-reader-composer-shadow)}
.reader-selection-menu,.reader-composer{z-index:var(--reader-z-popover)}
.reader-tooltip-content{z-index:var(--reader-z-tooltip,var(--app-z-tooltip,340));max-width:min(260px,calc(100vw - 24px));border:1px solid color-mix(in srgb,var(--reader-paper,var(--app-reader-paper,#fffaf0)) 16%,transparent);border-radius:8px;background:var(--reader-ink,var(--app-reader-ink,#251d16));box-shadow:0 12px 28px color-mix(in srgb,var(--reader-ink,var(--app-reader-ink,#251d16)) 20%,transparent);color:var(--reader-paper,var(--app-reader-paper,#fffaf0));font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px;font-weight:760;line-height:1.35;padding:7px 9px;will-change:transform,opacity}
.reader-tooltip-content[data-state="delayed-open"],.reader-tooltip-content[data-state="instant-open"]{animation:reader-tooltip-in .12s ease-out}
.reader-tooltip-content .reader-kbd{border-color:color-mix(in srgb,var(--reader-paper,var(--app-reader-paper,#fffaf0)) 24%,transparent);border-bottom-color:color-mix(in srgb,var(--reader-paper,var(--app-reader-paper,#fffaf0)) 34%,transparent);background:color-mix(in srgb,var(--reader-paper,var(--app-reader-paper,#fffaf0)) 12%,transparent);box-shadow:none;color:var(--reader-paper,var(--app-reader-paper,#fffaf0))}
.reader-shortcut-tooltip{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.reader-shortcut-tooltip-keys{display:inline-flex;align-items:center;gap:3px}
@keyframes reader-composer-pop{from{opacity:0;transform:translateY(-6px) scale(.88);filter:blur(2px)}to{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}
@keyframes reader-tooltip-in{from{opacity:0;transform:translateY(2px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes reader-review-scale{0%,100%{transform:rotate(0deg) scale(1)}45%{transform:rotate(-8deg) scale(1.08)}70%{transform:rotate(5deg) scale(.98)}}
@keyframes reader-review-avatar-float{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.04)}}
@keyframes reader-review-avatar-travel{0%,100%{transform:translateX(-3px) translateY(0) scale(1)}50%{transform:translateX(4px) translateY(-2px) scale(1.04)}}
@keyframes reader-pending-agent-pulse{0%,100%{opacity:.52;box-shadow:0 0 0 0 color-mix(in srgb,var(--reader-avatar-color,var(--reader-green)) 28%,transparent)}50%{opacity:1;box-shadow:0 0 0 5px transparent}}
@keyframes reader-pending-thought-progress{0%{transform:translateX(-105%)}100%{transform:translateX(245%)}}
.reader-app :where(button,textarea,input,[tabindex]):focus-visible{outline:2px solid rgba(37,29,22,.42);outline-offset:3px}
.reader-app :where(.reader-composer textarea,.reader-note-comments-panel .reader-comment-box textarea):focus-visible{outline:0;box-shadow:none}
.reader-highlight{overflow:visible;background:transparent;box-shadow:none;mix-blend-mode:normal}
.reader-highlight.is-active{background:transparent;box-shadow:none}
.reader-highlight::before{content:"";position:absolute;z-index:1;left:min(var(--highlight-edge-size,0px),42%);right:min(var(--highlight-edge-size,0px),42%);bottom:var(--highlight-offset,-2px);height:var(--highlight-thickness,4px);border-radius:999px;background:var(--highlight-line,#f4c95d);opacity:var(--highlight-opacity,.78);-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 6' preserveAspectRatio='none'%3E%3Cpath d='M0 3 C4 0 8 6 12 3 S20 0 24 3' stroke='black' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 6' preserveAspectRatio='none'%3E%3Cpath d='M0 3 C4 0 8 6 12 3 S20 0 24 3' stroke='black' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");-webkit-mask-repeat:repeat-x;mask-repeat:repeat-x;-webkit-mask-size:24px 100%;mask-size:24px 100%;filter:drop-shadow(0 1px 0 var(--reader-paper))}
.reader-highlight.is-new::before{transform-origin:left center;animation:reader-highlight-grow .42s cubic-bezier(.22,1,.36,1) both;animation-delay:var(--highlight-grow-delay,0ms)}
.reader-highlight.is-active::before{opacity:1;filter:drop-shadow(0 1px 0 var(--reader-paper)) drop-shadow(0 0 5px rgba(37,29,22,.2))}
.reader-highlight.is-filter-dimmed{cursor:default}.reader-highlight.is-filter-dimmed .reader-highlight-dots{opacity:.42}
.reader-highlight.is-temporary,.reader-highlight.is-agent-theater{background:transparent;box-shadow:none}
.reader-highlight.is-temporary{border-radius:3px;background:rgba(77,155,114,.18)}
.reader-highlight.is-temporary::before,.reader-highlight.is-temporary .reader-highlight-dots{display:none}
.reader-article ::selection,.reader-article::selection{background:rgba(77,155,114,.18)}
.reader-highlight-dots{position:absolute;z-index:2;bottom:var(--highlight-dot-offset,-3px);display:flex;gap:2px;align-items:center;pointer-events:none}
.reader-highlight.is-new .reader-highlight-dots{animation:reader-highlight-dots-in .18s ease-out both;animation-delay:calc(var(--highlight-grow-delay,0ms) + .24s)}
.reader-highlight-dots.is-start{left:0}
.reader-highlight-dots.is-end{right:0}
.reader-highlight-dots i{display:block;width:5px;height:5px;border:1px solid rgba(37,29,22,.14);border-radius:999px;box-shadow:0 1px 2px rgba(37,29,22,.14)}
.reader-highlight:focus-visible{outline:0;box-shadow:none}
.reader-highlight:focus-visible::before{opacity:1;filter:drop-shadow(0 1px 0 var(--reader-paper)) drop-shadow(0 0 6px rgba(37,29,22,.24))}
@keyframes reader-highlight-grow{from{opacity:.35;transform:scaleX(0)}to{opacity:var(--highlight-opacity,.78);transform:scaleX(1)}}
@keyframes reader-highlight-dots-in{from{opacity:0;transform:scale(.65)}to{opacity:1;transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.t-dropdown{transition:none!important}.reader-app *{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}.reader-tooltip-content{animation:none!important}.reader-virtual-cursor{transition:none!important}.reader-virtual-cursor.is-leaving{animation:none!important;opacity:0}.reader-completion-burst{display:none!important}.reader-agent-dock.is-completing,.reader-agent-dock-item.is-active,.reader-review-invite.is-reviewing svg,.reader-review-active-avatars>span,.reader-thought-review-motion>span,.reader-pending-agent-avatar::after,.reader-pending-thought-progress i,.reader-highlight.is-new::before,.reader-highlight.is-new .reader-highlight-dots{animation:none!important}.reader-agent-dock.is-completing{opacity:0;filter:none;transform:translateX(-50%)}.reader-agent-dock-item.is-active{transform:none}.reader-pending-agent-avatar::after{opacity:1;box-shadow:none}.reader-pending-thought-progress i{transform:none}.reader-spinner{animation:none!important;border-top-color:rgba(23,63,44,.22)}}
@media(max-width:1320px){.reader-main{grid-template-columns:minmax(0,1fr)}.reader-toc-toggle{display:grid}}
.reader-app.is-annotation-right .reader-article{width:min(var(--reader-layout-article-width,var(--reader-content-width)),var(--reader-content-width),100%);margin:0}
.reader-app.is-annotation-stacked .reader-annotation-rail{position:relative;inset:auto;width:min(var(--reader-content-width),100%);display:grid;gap:14px;margin:16px auto 0;pointer-events:auto}
.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-empty,.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-note{position:relative;top:auto!important;left:auto!important;width:100%;pointer-events:auto;transform:none}
.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-note{transform:none}
@media(max-width:940px){.reader-surface{padding:32px 28px 64px}.reader-article{max-width:100%;font-size:min(var(--reader-font-size),22px)}.reader-app.is-annotation-stacked .reader-annotation-rail{width:100%;margin-top:16px}.reader-note-comments-panel .reader-comments{margin:0;padding:2px 0}.reader-app.is-annotation-stacked .reader-annotation-connection{display:none}}
@media(max-width:760px){.reader-toolbar{grid-template-columns:auto minmax(0,1fr) auto;gap:8px;min-height:72px;padding:12px 14px 15px}.reader-back{max-width:40px;padding:0 8px}.reader-back span{display:none}.reader-toolbar>.reader-toolbar-article{justify-content:start;text-align:left}.reader-toolbar-article-visual{display:none}.reader-toolbar-article-copy,.reader-toolbar-article.has-cover .reader-toolbar-article-copy{justify-items:start;text-align:left}.reader-toolbar-article-meta{justify-content:flex-start}.reader-floating-toolbar{top:78px;max-width:calc(100vw - 18px)}.reader-floating-slider{max-width:112px}.reader-brand-mark{width:34px;height:34px;border-radius:9px;font-size:16px}.reader-brand-title{font-size:12px}.reader-brand-copy p{font-size:11px}.reader-toolbar-actions{gap:7px}.reader-agent-annotate{width:38px;padding:0;justify-content:center}.reader-agent-annotate{font-size:0}.reader-agent-annotate svg{width:18px;height:18px}.reader-surface{padding:20px 14px 46px}.reader-article{border-radius:18px;padding:28px 20px;font-size:min(var(--reader-font-size),20px);line-height:1.72}.reader-article-header h1{font-size:28px}.reader-composer{left:8px!important;width:calc(100vw - 16px)}.reader-composer-types{grid-template-columns:1fr repeat(5,minmax(0,1fr))}.reader-composer-group-label{grid-column:1/-1}.reader-app.is-toc-open .reader-toc{top:72px}.reader-responsive-scrim{inset:72px 0 0}}
.reader-app.has-toc .reader-main,.reader-app.has-toc.is-toc-open .reader-main{grid-template-columns:minmax(0,1fr)}
.reader-toc.is-empty{display:none}
.reader-app.has-toc .reader-toc{position:absolute;display:block;left:18px;top:84px;bottom:18px;z-index:var(--reader-z-panel);width:min(320px,calc(100% - 36px));overflow:auto;padding:18px;border:1px solid var(--app-reader-selection-menu-border);border-radius:8px;background:var(--app-reader-toc-bg);box-shadow:var(--reader-elevated-shadow);opacity:0;visibility:hidden;pointer-events:none;clip-path:inset(0 100% 0 0 round 8px);transform:translateX(-1px);transform-origin:left center;transition:clip-path .28s cubic-bezier(.4,0,.2,1),transform .28s cubic-bezier(.4,0,.2,1),opacity .12s ease .16s,visibility .28s}
.reader-app.has-toc.is-toc-open .reader-toc{opacity:1;visibility:visible;pointer-events:auto;clip-path:inset(0 0 0 0 round 8px);transform:translateX(0);transition:clip-path .32s cubic-bezier(.22,1,.36,1),transform .32s cubic-bezier(.22,1,.36,1),opacity .1s ease,visibility 0s}
.reader-toc-toggle:disabled{cursor:not-allowed;opacity:.42}
@media(max-width:760px){.reader-toolbar-article-action{display:none}.reader-toolbar-article-title{font-size:13px}.reader-toolbar-article-meta{font-size:11px}.reader-app.has-toc.is-toc-open .reader-toc{left:0;top:72px;bottom:0;width:min(320px,calc(100% - 32px));border-radius:0;clip-path:inset(0 0 0 0 round 0)}.reader-app.has-toc.is-toc-open .reader-responsive-scrim{display:block}}
`;

export const readerStyles = `
:host{all:initial;color-scheme:light;--app-viewport-height:100vh;--reader-bg:var(--app-reader-bg);--reader-paper:var(--app-reader-paper);--reader-ink:var(--app-reader-ink);--reader-muted:var(--app-reader-muted);--reader-line:var(--app-reader-line);--reader-green:var(--app-reader-primary);--reader-red:var(--app-reader-danger);--reader-yellow:var(--app-reader-accent);--reader-yellow-strong:var(--app-reader-accent-strong);--reader-ink-weak:color-mix(in srgb,var(--reader-ink) 34%,transparent);--reader-ink-subtle:color-mix(in srgb,var(--reader-ink) 12%,transparent);--reader-ink-hairline:color-mix(in srgb,var(--reader-ink) 8%,transparent);--reader-paper-hover:color-mix(in srgb,var(--reader-ink) 6%,var(--reader-paper));--reader-paper-panel:color-mix(in srgb,var(--app-reader-note-bg) 74%,var(--reader-paper));--reader-elevated-shadow:0 18px 48px color-mix(in srgb,var(--reader-ink) 16%,transparent);--reader-soft-shadow:0 8px 20px color-mix(in srgb,var(--reader-ink) 6%,transparent);font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif)}@supports (height:100dvh){:host{--app-viewport-height:100dvh}}*{box-sizing:border-box}.reader-app{position:fixed;inset:0;z-index:2147483647;display:grid;grid-template-rows:auto 1fr;background:var(--reader-bg);color:var(--reader-ink)}.reader-toolbar{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:76px;padding:14px 28px;border-bottom:1px solid var(--app-reader-toolbar-border);background:var(--app-reader-toolbar-bg);backdrop-filter:blur(14px)}.reader-brand{display:flex;align-items:center;gap:12px;min-width:0}.reader-brand-mark{display:block;width:38px;height:38px;flex:0 0 auto;border-radius:10px;object-fit:cover}.reader-brand-copy{display:grid;gap:3px;min-width:0}.reader-brand-title{color:var(--reader-ink);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:13px;font-weight:900;letter-spacing:.16em;line-height:1}.reader-brand-copy p{display:flex;align-items:center;gap:7px;margin:0;overflow:hidden;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;font-weight:720;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}.reader-toolbar-actions{display:flex;align-items:center;gap:10px}.reader-close,.reader-icon-button{display:grid;width:38px;height:38px;place-items:center;border:1px solid var(--app-reader-toolbar-border);border-radius:999px;background:var(--app-reader-toolbar-control-bg);color:var(--reader-ink)}.reader-icon-button:hover,.reader-icon-button.is-active,.reader-close:hover{background:var(--app-reader-toolbar-control-hover-bg)}.reader-settings-panel{position:fixed;right:28px;top:88px;z-index:6;width:280px;padding:14px;border:1px solid var(--app-reader-composer-border);border-radius:18px;background:var(--app-reader-composer-bg);box-shadow:var(--app-reader-composer-shadow);backdrop-filter:blur(16px);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}.reader-setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}.reader-setting-row+.reader-setting-row{border-top:1px solid var(--reader-ink-subtle)}.reader-setting-label{display:inline-flex;align-items:center;gap:8px;color:var(--reader-muted);font-size:13px;font-weight:720}.reader-stepper{display:inline-flex;align-items:center;overflow:hidden;border:1px solid rgba(37,29,22,.14);border-radius:999px;background:var(--reader-paper)}.reader-stepper button{display:grid;width:30px;height:30px;place-items:center;border:0;background:transparent;color:var(--reader-muted)}.reader-stepper button:hover{background:var(--reader-paper-hover);color:var(--reader-green)}.reader-stepper strong{min-width:58px;color:var(--reader-ink);font-size:12px;text-align:center}.reader-main{min-height:0;display:grid;grid-template-columns:260px minmax(0,1fr) 360px}.reader-toc{min-width:0;overflow:auto;padding:42px 18px 48px 22px;border-right:1px solid var(--reader-ink-hairline);background:var(--app-reader-toc-bg);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}.reader-toc.is-empty{visibility:hidden}.reader-toc-title{margin:0 0 12px;color:var(--reader-green);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.reader-toc-item{display:block;width:100%;margin:2px 0;border:0;border-radius:10px;background:transparent;color:var(--reader-muted);font:inherit;font-size:13px;line-height:1.35;padding:7px 8px;text-align:left}.reader-toc-item:hover,.reader-toc-item.is-active{background:var(--app-reader-toc-item-hover-bg);color:var(--reader-ink)}.reader-toc-item.is-active{box-shadow:inset 3px 0 0 var(--reader-green);font-weight:820}.reader-toc-item[data-depth="2"]{padding-left:20px}.reader-toc-item[data-depth="3"]{padding-left:32px}.reader-toc-item[data-depth="4"]{padding-left:44px}.reader-surface{min-width:0;overflow:auto;padding:42px 48px 84px}.reader-canvas{position:relative;width:min(var(--reader-content-width),100%);margin:0 auto}.reader-article{position:relative;z-index:1;padding:56px 64px;border:1px solid var(--app-reader-note-border);border-radius:22px;background:var(--reader-paper);box-shadow:var(--app-reader-note-shadow);font-size:var(--reader-font-size);line-height:${readerBodyLineHeight};overflow-wrap:anywhere;word-break:break-word}.reader-article-header{margin-bottom:42px;padding-bottom:28px;border-bottom:1px solid var(--reader-ink-subtle)}.reader-article-header h1{margin:0;color:var(--reader-ink);font-size:36px;letter-spacing:0;line-height:1.18}.reader-article-header p{margin:14px 0 0;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:15px;line-height:1.5}.reader-article *{max-width:100%;min-width:0;overflow-wrap:anywhere}.reader-article-body{color:var(--reader-ink);text-wrap:pretty}.reader-article-body>:first-child{margin-top:0}.reader-article-body>:last-child{margin-bottom:0}.reader-article-body p{margin:0 0 1.05em}.reader-bilingual-translation{margin:-.2em 0 1.14em;color:color-mix(in srgb,var(--reader-ink) 76%,var(--reader-muted));font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:.9em;line-height:1.72}.reader-bilingual-translation[data-reader-translation-style="dashedLine"]{text-decoration:underline dashed color-mix(in srgb,var(--reader-green) 72%,transparent);text-underline-offset:5px}.reader-bilingual-translation[data-reader-translation-style="blur"]{filter:blur(4px);opacity:.75;transition:filter .12s ease,opacity .12s ease}.reader-bilingual-translation[data-reader-translation-style="blur"]:hover{filter:blur(0);opacity:1}.reader-bilingual-translation[data-reader-translation-style="blockquote"]{padding:.42em 0 .46em .9em;border-left:3px solid color-mix(in srgb,var(--reader-green) 68%,transparent)}.reader-bilingual-translation[data-reader-translation-style="weakened"]{color:var(--reader-muted)}.reader-bilingual-translation[data-reader-translation-style="border"]{display:inline-block;padding:.18em .42em;border:1px solid color-mix(in srgb,var(--reader-green) 45%,transparent);border-radius:6px}.reader-bilingual-translation.is-translating,.reader-bilingual-translation.is-failed{min-height:1.8em}.reader-bilingual-translation-loading,.reader-bilingual-translation-retry{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;border:0;border-radius:999px;background:color-mix(in srgb,var(--reader-green) 9%,transparent);color:var(--reader-green);vertical-align:middle}.reader-bilingual-translation-retry{cursor:pointer}.reader-bilingual-translation-retry:hover{background:color-mix(in srgb,var(--reader-red) 10%,transparent);color:var(--reader-red)}.reader-bilingual-translation-spinner{width:14px;height:14px;border:2px solid color-mix(in srgb,currentColor 20%,transparent);border-top-color:currentColor;border-radius:999px;animation:reader-spin .8s linear infinite}.reader-article-body h1,.reader-article-body h2,.reader-article-body h3,.reader-article-body h4,.reader-article-body h5,.reader-article-body h6{margin:1.65em 0 .65em;color:var(--reader-ink);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-weight:860;letter-spacing:0;line-height:1.28;text-wrap:balance}.reader-article-body h1{font-size:1.52em}.reader-article-body h2{font-size:1.28em}.reader-article-body h3{font-size:1.14em}.reader-article-body h4,.reader-article-body h5,.reader-article-body h6{font-size:1em}.reader-article-body strong,.reader-article-body b{color:var(--reader-ink);font-weight:850}.reader-article-body hr{height:1px;margin:1.35em 0 .8em;border:0;background:rgba(40,35,29,.52)}.reader-article-body ul,.reader-article-body ol{margin:1em 0 1em 1.35em;padding:0}.reader-article-body li{margin:.35em 0}.reader-article-body figure{margin:1em 0}.reader-article-body figcaption{margin:.45em 0 0;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:.72em;line-height:1.4}.reader-article img,.reader-article video,.reader-article iframe{max-width:100%;height:auto;border-radius:14px}.reader-article code{font-family:var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace)}.reader-article pre{overflow:auto;padding:18px;border-radius:16px;background:#24211d;color:#fbf6ec;font-family:var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace)}.reader-article table{display:block;max-width:100%;overflow-x:auto}.reader-article blockquote{margin-left:0;padding-left:22px;border-left:4px solid var(--reader-yellow);color:var(--reader-ink)}.reader-article a,.reader-markdown a{color:inherit;text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--reader-ink) 32%,transparent);text-decoration-thickness:1px;text-underline-offset:.16em}.reader-article a:hover,.reader-markdown a:hover{color:var(--reader-red);text-decoration-color:currentColor}.reader-highlight-layer{position:absolute;inset:0;z-index:3;pointer-events:none}.reader-highlight{position:absolute;border:0;border-radius:4px;background:rgba(234,216,157,.34);box-shadow:0 0 0 1px rgba(199,164,94,.18);mix-blend-mode:multiply;padding:0;pointer-events:auto}.reader-highlight.is-active{background:rgba(234,216,157,.5);box-shadow:0 0 0 2px rgba(40,35,29,.38)}.reader-highlight.is-temporary{background:rgba(77,155,114,.16);box-shadow:0 0 0 1px rgba(77,155,114,.22);pointer-events:none}.reader-highlight.is-agent-theater{background:rgba(77,155,114,.2);box-shadow:0 0 0 1px rgba(77,155,114,.24);pointer-events:none}.reader-selection-menu{position:absolute;z-index:5;padding:5px;border:1px solid var(--app-reader-selection-menu-border);border-radius:999px;background:var(--app-reader-selection-menu-bg);box-shadow:var(--app-reader-selection-menu-shadow)}.reader-selection-menu button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;border:0;border-radius:999px;background:transparent;color:var(--app-reader-selection-menu-fg);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:13px;font-weight:750;padding:0 12px}.reader-virtual-cursor{position:fixed;left:0;top:0;z-index:7;display:flex;align-items:center;gap:8px;pointer-events:none;transform:translate3d(var(--reader-cursor-x,0px),var(--reader-cursor-y,0px),0) translate(-4px,-4px);transition:transform .42s ease;will-change:transform}.reader-virtual-pointer{width:0;height:0;border-left:13px solid var(--reader-green);border-top:9px solid transparent;border-bottom:9px solid transparent;filter:drop-shadow(0 4px 8px rgba(40,35,29,.18));transform:rotate(-18deg)}.reader-virtual-label{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--app-reader-composer-border);border-radius:999px;background:var(--reader-paper);box-shadow:0 10px 28px rgba(40,35,29,.14);color:var(--reader-green);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;font-weight:820;padding:6px 10px;white-space:nowrap}.reader-virtual-label span{display:grid;width:22px;height:22px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:11px}.reader-virtual-cursor.is-offscreen .reader-virtual-pointer{opacity:.45}.reader-virtual-cursor.is-leaving{animation:reader-cursor-leave .9s ease forwards}@keyframes reader-cursor-leave{to{opacity:0;filter:blur(2px)}}.reader-notes{min-width:0;overflow:auto;padding:28px 22px 48px;border-left:1px solid var(--reader-ink-subtle);background:var(--app-reader-toc-bg)}.reader-notes-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;margin:-28px -22px 18px;padding:18px 22px;background:var(--app-reader-toc-bg);backdrop-filter:blur(14px);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}.reader-notes-actions{display:flex;align-items:center;gap:8px}.reader-notes-actions span{display:grid;min-width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:12px}.reader-agent-annotate{display:inline-flex;align-items:center;gap:6px;height:30px;border:1px solid var(--app-reader-toolbar-border);border-radius:999px;background:var(--app-reader-toolbar-control-bg);color:var(--reader-green);font:inherit;font-size:12px;font-weight:800;padding:0 10px}.reader-agent-annotate:hover,.reader-agent-annotate.is-active{background:var(--app-reader-toolbar-control-hover-bg)}.reader-agent-annotate:disabled{cursor:not-allowed;opacity:.55}.reader-agent-annotate-menu{display:grid;gap:6px;margin:-6px 0 14px;padding:10px;border:1px solid var(--app-reader-agent-panel-border);border-radius:16px;background:var(--app-reader-agent-panel-bg);box-shadow:0 12px 36px rgba(55,42,24,.1);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}.reader-agent-annotate-menu button{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:8px;border:0;border-radius:11px;background:transparent;color:var(--reader-ink);padding:8px;text-align:left}.reader-agent-annotate-menu button:hover{background:var(--app-reader-agent-panel-hover-bg)}.reader-agent-annotate-menu button:disabled{cursor:not-allowed;opacity:.65}.reader-agent-annotate-menu button>span{display:grid;width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:12px;font-weight:800}.reader-agent-annotate-menu em{color:var(--reader-muted);font-size:12px;font-style:normal}.reader-note{margin-bottom:14px;padding:16px;border:1px solid var(--app-reader-note-border);border-radius:16px;background:var(--app-reader-note-bg);box-shadow:var(--app-reader-note-shadow)}.reader-empty{display:grid;justify-items:center;gap:14px;margin:0;padding:18px 4px;border:0;border-radius:0;background:transparent;box-shadow:none;color:var(--reader-ink);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);text-align:center}.reader-empty-icon{display:grid;width:56px;height:56px;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--reader-yellow) 12%,var(--reader-paper));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--reader-ink) 5%,transparent);color:color-mix(in srgb,var(--reader-yellow-strong) 78%,var(--reader-ink))}.reader-empty strong{max-width:260px;color:var(--reader-ink);font-size:20px;font-weight:900;line-height:1.25;text-wrap:balance}.reader-empty p{max-width:270px;margin:0;color:var(--reader-muted);font-size:13px;font-weight:650;line-height:1.65;text-wrap:pretty}.reader-empty-gesture{display:grid;width:min(260px,100%);justify-items:center;gap:9px;margin-top:8px}.reader-empty-gesture-card{display:grid;width:100%;gap:8px;padding:11px 14px;border-radius:8px;background:var(--reader-paper);box-shadow:0 0 0 1px color-mix(in srgb,var(--reader-ink) 7%,transparent),0 8px 20px color-mix(in srgb,var(--reader-ink) 6%,transparent)}.reader-empty-line{position:relative;display:block;height:7px;overflow:hidden;border-radius:999px;background:color-mix(in srgb,var(--reader-muted) 14%,transparent)}.reader-empty-line.is-short{width:68%;justify-self:center}.reader-empty-line.is-medium{width:72%}.reader-empty-line.has-highlight i{position:absolute;left:36%;top:0;bottom:0;width:44%;border-radius:inherit;background:color-mix(in srgb,var(--reader-yellow-strong) 58%,var(--reader-yellow))}.reader-empty-gesture-arrow{width:9px;height:9px;border-right:2px solid color-mix(in srgb,var(--reader-muted) 46%,transparent);border-bottom:2px solid color-mix(in srgb,var(--reader-muted) 46%,transparent);transform:rotate(45deg)}.reader-empty-gesture-card.is-note{grid-template-columns:18px minmax(0,1fr);align-items:center}.reader-empty-gesture-card.is-note .reader-empty-line{grid-column:2}.reader-empty-quote-mark{grid-row:1/3;align-self:start;color:var(--reader-yellow-strong);font-size:20px;font-weight:900;line-height:1}.reader-empty-quote-mark::before{content:"“"}.reader-note-anchor{font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-weight:750}.reader-muted{margin:8px 0 0;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:13px;line-height:1.6}.reader-note.is-active{border-color:rgba(40,35,29,.34);box-shadow:0 0 0 3px rgba(40,35,29,.08),var(--app-reader-note-shadow)}.reader-note-anchor{width:100%;border:0;background:transparent;color:var(--reader-ink);font-size:14px;line-height:1.5;padding:0;text-align:left}.reader-note-anchor span{display:inline-flex;align-items:center;margin:0 6px 6px 0;border-radius:999px;background:var(--reader-ink-hairline);color:var(--reader-green);font-size:12px;font-weight:800;padding:3px 8px}.reader-comments{margin-top:12px}.reader-comment{display:grid;grid-template-columns:32px 1fr;gap:9px;margin-top:10px;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}.reader-comment span{display:grid;width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:11px}.reader-comment p{margin:0;color:var(--app-reader-note-quote-text);font-size:13px;line-height:1.55}.reader-avatar-badge img{width:100%;height:100%;object-fit:cover;border-radius:999px}.reader-spinner{display:inline-block;width:12px;height:12px;margin-left:6px;vertical-align:-2px;border:2px solid rgba(40,35,29,.2);border-top-color:var(--reader-green);border-radius:999px;animation:reader-spin .8s linear infinite}@keyframes reader-spin{to{transform:rotate(360deg)}}.reader-comment-box{position:relative}.reader-note textarea,.reader-composer textarea{width:100%;min-height:74px;resize:vertical;margin-top:12px;padding:10px 12px;border:1px solid var(--app-reader-composer-border);border-radius:12px;background:var(--reader-paper);color:var(--reader-ink);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:13px;line-height:1.5;outline:none}.reader-composer textarea{margin-top:0}.reader-agent-menu{position:absolute;left:0;right:0;bottom:calc(100% - 8px);z-index:4;display:grid;gap:4px;padding:8px;border:1px solid var(--app-reader-agent-panel-border);border-radius:14px;background:var(--reader-paper);box-shadow:var(--reader-elevated-shadow)}.reader-agent-menu button{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;padding:7px;text-align:left}.reader-agent-menu button:hover{background:var(--app-reader-agent-panel-hover-bg)}.reader-agent-menu em{color:var(--reader-muted);font-size:12px;font-style:normal}.reader-add-comment,.reader-composer-actions button{border:0;border-radius:999px;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;font-weight:760}.reader-delete-note{display:inline-flex;align-items:center;gap:5px;margin-right:auto;border:0;background:transparent;color:#8a3f32;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px;font-weight:760}.reader-delete-confirm{display:inline-flex;align-items:center;gap:6px;margin-right:auto;color:#6b5d50;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:12px}.reader-delete-confirm button{border:0;border-radius:999px;background:#eadfce;color:#4c4137;font:inherit;font-weight:760;padding:6px 9px}.reader-delete-confirm button:last-child{background:#8a3f32;color:white}.reader-add-comment{padding:9px 13px;background:var(--reader-green);color:white}.reader-note-footer,.reader-composer-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:10px}.reader-shortcut-hint{display:inline-flex;align-items:center;gap:5px;margin-right:auto;color:var(--reader-muted);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:11px}.reader-kbd{display:inline-flex;min-width:20px;height:20px;align-items:center;justify-content:center;border:1px solid rgba(40,35,29,.16);border-bottom-color:rgba(40,35,29,.28);border-radius:6px;background:var(--reader-paper);box-shadow:0 1px 0 rgba(40,35,29,.14);color:#4c4137;font-family:var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);font-size:10px;font-weight:750;line-height:1;padding:0 5px}.reader-composer{position:absolute;z-index:5;width:340px;padding:14px;border:1px solid var(--app-reader-composer-border);border-radius:18px;background:var(--app-reader-composer-bg);box-shadow:var(--app-reader-composer-shadow)}.reader-quote{max-height:92px;overflow:auto;padding:10px 12px;border-left:4px solid var(--reader-yellow-strong);background:var(--app-reader-note-quote-bg);color:var(--app-reader-note-quote-text);font-size:13px;line-height:1.5}.reader-composer-actions button{padding:9px 13px;background:#e6dbc8;color:var(--reader-ink)}.reader-composer-actions button:last-child{background:var(--reader-green);color:white}@media(max-width:940px){.reader-main{grid-template-columns:1fr}.reader-toc{display:none}.reader-notes{position:fixed;right:14px;bottom:14px;width:min(380px,calc(100vw - 28px));max-height:calc(var(--app-viewport-height) * 0.42);border:1px solid var(--app-reader-note-border);border-radius:22px;box-shadow:var(--reader-elevated-shadow)}.reader-surface{padding:24px 18px 220px}.reader-article{padding:34px 24px;font-size:18px}.reader-toolbar{padding:12px 16px}}
.reader-toc-toggle{display:grid;position:relative;overflow:hidden;--reader-toc-motion:cubic-bezier(.22,1,.36,1)}
.reader-toc-toggle::before{content:"";position:absolute;inset:4px;border-radius:5px;background:color-mix(in srgb,var(--reader-ink) 8%,transparent);opacity:0;transform:scale(.74);transition:opacity .18s ease,transform .2s var(--reader-toc-motion)}
.reader-toc-toggle.is-active::before{opacity:1;transform:scale(1)}
.reader-toc-toggle-icon{position:relative;z-index:1;display:block;color:currentColor}
.reader-toc-toggle-frame{fill:none;stroke:currentColor;stroke-width:1.8;transition:stroke-width .18s ease,transform .22s var(--reader-toc-motion);transform-box:fill-box;transform-origin:center}
.reader-toc-toggle-rail{fill:currentColor;transform-box:fill-box;transform-origin:left center;transition:opacity .18s ease,transform .24s var(--reader-toc-motion)}
.reader-toc-toggle.is-active .reader-toc-toggle-frame{stroke-width:1.65}
.reader-toc-toggle.is-active .reader-toc-toggle-rail{transform:scaleX(2.08)}
.reader-background-options{display:inline-flex;align-items:center;gap:7px}
.reader-background-options button{display:grid;width:28px;height:28px;place-items:center;border:1px solid var(--app-reader-toolbar-border);border-radius:999px;background:var(--reader-background-option);box-shadow:inset 0 0 0 1px rgba(255,255,255,.62);padding:0}
.reader-background-options button.is-active{border-color:var(--reader-green);box-shadow:0 0 0 2px color-mix(in srgb,var(--reader-green) 22%,transparent),inset 0 0 0 1px rgba(255,255,255,.72)}
.reader-background-options button:hover{transform:translateY(-1px)}
.reader-article{background:var(--reader-content-bg,var(--reader-paper))}
.reader-selection-menu{display:inline-flex;align-items:center;gap:4px}
.reader-selection-primary.is-copied{border-color:color-mix(in srgb,var(--reader-green) 34%,transparent);background:color-mix(in srgb,var(--reader-green) 10%,var(--reader-paper));color:var(--reader-green)}
.reader-selection-copy-icon.t-icon-swap{position:relative;display:inline-grid;width:15px;height:15px;place-items:center;flex:0 0 auto;--icon-swap-dur:200ms;--icon-swap-blur:2px;--icon-swap-start-scale:.25;--icon-swap-ease:cubic-bezier(.2,0,0,1)}
.reader-selection-copy-icon .t-icon{grid-area:1/1;display:grid;place-items:center;transition:opacity var(--icon-swap-dur) var(--icon-swap-ease),filter var(--icon-swap-dur) var(--icon-swap-ease),transform var(--icon-swap-dur) var(--icon-swap-ease);will-change:opacity,filter,transform}
.reader-selection-copy-icon[data-state="a"] .t-icon[data-icon="a"],.reader-selection-copy-icon[data-state="b"] .t-icon[data-icon="b"]{opacity:1;filter:blur(0);transform:scale(1)}
.reader-selection-copy-icon[data-state="a"] .t-icon[data-icon="b"],.reader-selection-copy-icon[data-state="b"] .t-icon[data-icon="a"]{opacity:0;filter:blur(var(--icon-swap-blur));transform:scale(var(--icon-swap-start-scale))}
.reader-selection-copy-shortcut.is-hidden{opacity:0}
.reader-surface-frame{position:relative;min-width:0;min-height:0;overflow:hidden}
.reader-surface-frame>.reader-surface{height:100%}
.reader-edge-blur{position:absolute;left:0;right:0;z-index:120;height:38px;overflow:hidden;pointer-events:none}
.reader-edge-blur.is-top{top:0}.reader-edge-blur.is-bottom{bottom:0}
.reader-edge-blur::before,.reader-edge-blur span{position:absolute;inset:0}
.reader-edge-blur::before{content:"";z-index:1;background:var(--app-reader-edge-blur-top)}
.reader-edge-blur.is-bottom::before{background:var(--app-reader-edge-blur-bottom)}
.reader-edge-blur span{z-index:2;backdrop-filter:blur(var(--reader-edge-blur-radius));-webkit-backdrop-filter:blur(var(--reader-edge-blur-radius));-webkit-mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%);mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%)}
.reader-edge-blur.is-bottom span{-webkit-mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%);mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%)}
.reader-edge-blur span:nth-child(1){--reader-edge-blur-radius:1px;opacity:.82}.reader-edge-blur span:nth-child(2){--reader-edge-blur-radius:3px;opacity:.58}.reader-edge-blur span:nth-child(3){--reader-edge-blur-radius:6px;opacity:.36}.reader-edge-blur span:nth-child(4){--reader-edge-blur-radius:10px;opacity:.2}
`;

export const readerDesktopEmbeddedStyles = `
.source-reader-shell{grid-template-rows:minmax(0,1fr);padding:0}
.reader-app{color-scheme:light;--reader-bg:var(--app-reader-bg);--reader-paper:var(--app-reader-paper);--reader-ink:var(--app-reader-ink);--reader-muted:var(--app-reader-muted);--reader-line:var(--app-reader-line);--reader-green:var(--app-reader-primary);--reader-red:var(--app-reader-danger);--reader-yellow:var(--app-reader-accent);--reader-yellow-strong:var(--app-reader-accent-strong);--reader-z-toolbar:var(--app-z-dropdown,140);--reader-z-popover:var(--app-z-popover,160);--reader-z-panel:var(--app-z-panel,190);--reader-z-modal:var(--app-z-modal,320);--reader-z-tooltip:var(--app-z-tooltip,340);--reader-ink-weak:color-mix(in srgb,var(--reader-ink) 34%,transparent);--reader-ink-subtle:color-mix(in srgb,var(--reader-ink) 12%,transparent);--reader-ink-hairline:color-mix(in srgb,var(--reader-ink) 8%,transparent);--reader-paper-hover:color-mix(in srgb,var(--reader-ink) 6%,var(--reader-paper));--reader-paper-panel:color-mix(in srgb,var(--app-reader-note-bg) 74%,var(--reader-paper));--reader-elevated-shadow:0 18px 48px color-mix(in srgb,var(--reader-ink) 16%,transparent);--reader-soft-shadow:0 8px 20px color-mix(in srgb,var(--reader-ink) 6%,transparent);font-family:var(--font-reader-serif, Charter, Georgia, Cambria, "Times New Roman", serif)}
.reader-brand-mark{display:grid;place-items:center;background:var(--reader-ink);color:var(--reader-paper);font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif);font-size:18px;font-weight:950;line-height:1}
.reader-app.is-embedded{position:relative;inset:auto;z-index:0;width:100%;height:100%;min-height:0;overflow:hidden;border-radius:8px}
.reader-app.is-embedded:has(.reader-agent-menu),.reader-app.is-embedded:has(.reader-comment-agent-more-menu){z-index:var(--reader-z-modal);overflow:visible}
.reader-app.is-embedded .reader-settings-panel{position:absolute}
.reader-app.is-embedded .reader-agent-annotate-popover{position:absolute}
.reader-app.is-embedded .reader-agent-annotate-scrim{position:absolute}
.reader-app.is-embedded .reader-responsive-scrim{position:absolute}
.reader-app.is-embedded .reader-annotation-connection{position:absolute;width:100%;height:100%}
.reader-app.is-embedded .reader-completion-burst{position:absolute}
.reader-app.is-embedded .reader-agent-dock{position:absolute}
.reader-toolbar-article{display:flex;align-items:center;gap:12px;min-width:0;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-toolbar-article-copy{display:grid;gap:5px;min-width:0}
.reader-toolbar-article-title{overflow:hidden;color:var(--reader-ink);font-size:15px;font-weight:920;line-height:1.18;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta{display:flex;align-items:center;gap:8px;min-width:0;margin:0;color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.25}
.reader-toolbar-article-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta span+span::before{content:"";display:inline-block;width:4px;height:4px;margin-right:8px;border-radius:999px;background:var(--reader-ink-weak);vertical-align:2px}
.reader-toolbar-article-action{display:flex;flex:0 0 auto;align-items:center;gap:8px}
.reader-toolbar-article-action .open-article-button.is-icon-only{--annotation-control-size:40px;border-color:transparent;border-radius:6px;background:transparent;color:var(--reader-ink)}
.reader-toolbar-article-action .open-article-button.is-icon-only:hover{background:var(--app-reader-toolbar-control-hover-bg)}
	.reader-app.is-embedded.has-toc .reader-toc{position:absolute}
@media(max-width:760px){.reader-toolbar-article-action{display:none}.reader-toolbar-article-title{font-size:13px}.reader-toolbar-article-meta{font-size:11px}}
`;
