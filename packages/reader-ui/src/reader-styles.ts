export const readerConversationStyles = `
.reader-app{--dropdown-open-dur:250ms;--dropdown-close-dur:150ms;--dropdown-pre-scale:.97;--dropdown-closing-scale:.99;--dropdown-ease:cubic-bezier(.22,1,.36,1)}
.reader-kbd{display:inline-grid;min-width:18px;height:18px;place-items:center;font-family:ui-sans-serif,system-ui,sans-serif;font-size:9px;font-weight:780;line-height:1;padding:0 5px}.reader-kbd-symbol{font-size:11px;padding:0}.reader-add-comment span,.reader-composer-actions button>span{font-size:10px;font-weight:730}
.t-dropdown{transform-origin:top left;transform:scale(var(--dropdown-pre-scale));opacity:0;pointer-events:none;transition:transform var(--dropdown-open-dur) var(--dropdown-ease),opacity var(--dropdown-open-dur) var(--dropdown-ease);will-change:transform,opacity}
.t-dropdown[data-origin="top-right"]{transform-origin:top right}.t-dropdown[data-origin="top-center"]{transform-origin:top center}.t-dropdown[data-origin="bottom-left"]{transform-origin:bottom left}.t-dropdown[data-origin="bottom-center"]{transform-origin:bottom center}.t-dropdown[data-origin="bottom-right"]{transform-origin:bottom right}
.t-dropdown.is-open{transform:scale(1);opacity:1;pointer-events:auto}.t-dropdown.is-closing{transform:scale(var(--dropdown-closing-scale));opacity:0;pointer-events:none;transition:transform var(--dropdown-close-dur) var(--dropdown-ease),opacity var(--dropdown-close-dur) var(--dropdown-ease)}
.reader-main{grid-template-columns:minmax(0,1fr)}
.reader-brand{min-width:0}
.reader-toolbar-article{display:flex;flex:1 1 auto;align-items:center;gap:12px;min-width:0;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-toolbar-article-copy{display:grid;gap:5px;min-width:0}
.reader-toolbar-article-title{overflow:hidden;color:var(--reader-ink);font-size:15px;font-weight:920;line-height:1.18;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta{display:flex;align-items:center;gap:8px;min-width:0;margin:0;color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.25}
.reader-toolbar-article-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta span+span::before{content:"";display:inline-block;width:4px;height:4px;margin-right:8px;border-radius:999px;background:rgba(40,35,29,.24);vertical-align:2px}
.reader-toolbar-article-action{display:flex;flex:0 0 auto;align-items:center;gap:8px}
.reader-article{padding:clamp(34px,4vw,56px) clamp(28px,4.6vw,64px)}
.reader-toc-toggle{display:grid;position:relative}
	.reader-annotation-nav{display:inline-flex;align-items:center;gap:4px;padding:3px;border:1px solid rgba(40,35,29,.1);border-radius:999px;background:rgba(255,253,248,.58)}
	.reader-annotation-nav .reader-icon-button{width:30px;height:30px;border-color:transparent;background:transparent}
	.reader-annotation-nav .reader-icon-button:hover:not(:disabled){background:#f0eadf}
	.reader-annotation-nav .reader-icon-button:disabled{cursor:not-allowed;opacity:.34}
.reader-responsive-scrim{display:none;position:fixed;inset:76px 0 0;z-index:5;border:0;background:rgba(40,35,29,.14);backdrop-filter:blur(2px);padding:0}
.reader-highlight{background:rgba(234,216,157,.28);box-shadow:0 0 0 1px rgba(199,164,94,.18)}
.reader-highlight.is-active{background:rgba(234,216,157,.42)}
.reader-surface-frame{position:relative;min-width:0;min-height:0;overflow:hidden}
.reader-surface{height:100%;padding:42px clamp(28px,4vw,56px) 84px;overflow:auto}
.reader-edge-blur{position:absolute;left:0;right:0;z-index:120;height:38px;overflow:hidden;pointer-events:none}
.reader-edge-blur.is-top{top:0}
.reader-edge-blur.is-bottom{bottom:0}
.reader-edge-blur::before,.reader-edge-blur span{position:absolute;inset:0}
.reader-edge-blur::before{content:"";z-index:1;background:linear-gradient(to bottom,rgba(245,241,232,.82),rgba(245,241,232,0))}
.reader-edge-blur.is-bottom::before{background:linear-gradient(to top,rgba(245,241,232,.82),rgba(245,241,232,0))}
.reader-edge-blur span{z-index:2;backdrop-filter:blur(var(--reader-edge-blur-radius));-webkit-backdrop-filter:blur(var(--reader-edge-blur-radius));-webkit-mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%);mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%)}
.reader-edge-blur.is-bottom span{-webkit-mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%);mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%)}
.reader-edge-blur span:nth-child(1){--reader-edge-blur-radius:1px;opacity:.82}
.reader-edge-blur span:nth-child(2){--reader-edge-blur-radius:3px;opacity:.58}
.reader-edge-blur span:nth-child(3){--reader-edge-blur-radius:6px;opacity:.36}
.reader-edge-blur span:nth-child(4){--reader-edge-blur-radius:10px;opacity:.2}
.reader-app{--reader-annotation-rail-width:360px;--reader-annotation-rail-gap:20px}
.reader-canvas{position:relative;width:100%;max-width:none;margin:0 auto}
.reader-article{width:min(var(--reader-content-width),100%);max-width:100%;margin:0 auto}
.reader-annotation-rail{position:absolute;inset:0;min-height:100%;font-family:ui-sans-serif,system-ui,sans-serif;pointer-events:none}
.reader-annotation-rail>.reader-empty{position:absolute;left:var(--reader-empty-left,0);top:0;width:var(--reader-note-width,var(--reader-annotation-rail-width));pointer-events:auto}
.reader-annotation-rail>.reader-note{position:absolute;width:var(--reader-note-width,var(--reader-annotation-rail-width));margin:0;pointer-events:auto;transition:left .24s cubic-bezier(.22,1,.36,1),width .24s cubic-bezier(.22,1,.36,1),top .24s cubic-bezier(.22,1,.36,1),opacity .18s ease,filter .18s ease,transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.reader-annotation-rail>.reader-note.is-filtering-out{opacity:0;filter:blur(2px);pointer-events:none}
.reader-annotation-rail>.reader-note.is-stacked{transform:translateX(calc(var(--stack-offset,0px)))}
.reader-annotation-rail>.reader-note[data-rail-side="left"].is-stacked{transform:translateX(calc(var(--stack-offset,0px) * -1))}
.reader-annotation-rail>.reader-note[data-stack-index="1"]{--stack-offset:10px}
.reader-annotation-rail>.reader-note[data-stack-index="2"]{--stack-offset:20px}
.reader-annotation-rail>.reader-note[data-stack-index="3"]{--stack-offset:30px}
.reader-annotation-rail>.reader-note.is-active{transform:translateX(0)}
.reader-annotation-rail>.reader-note.is-stacked:not(.is-stack-front){cursor:pointer}
.reader-annotation-rail>.reader-note.is-stacked:not(.is-stack-front) .reader-note-toolbar{pointer-events:none}
.reader-notes{padding:0 16px 32px;scroll-padding-top:80px}
.reader-notes-header{margin:0 -16px 14px;padding:14px 16px;background:rgba(250,247,240,.98);box-shadow:0 8px 18px rgba(40,35,29,.05)}
.reader-note{scroll-margin-top:86px;border-left-width:4px;border-radius:18px 18px 18px 7px;padding:14px;background:rgba(255,253,248,.96);box-shadow:0 14px 36px rgba(55,42,24,.12)}
.reader-note-action-row{display:flex;align-items:center;gap:6px;margin-bottom:10px;min-width:0}
.reader-note-action-row time{margin-left:auto;color:#9a8f83;font-size:11px;font-weight:760;white-space:nowrap}
.reader-note-anchor{display:grid;gap:8px}
.reader-note-anchor .reader-note-persona{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;margin:0;color:var(--reader-ink);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-note-persona .reader-avatar-badge{width:28px;height:28px}
.reader-note-persona strong{overflow:hidden;font-size:13px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-note-persona em{color:var(--reader-muted);font-size:12px;font-style:normal;font-weight:700}
.reader-note-quote{display:block;width:100%;margin-top:10px;padding:9px 11px;border:0;border-left:3px solid rgba(199,164,94,.72);border-radius:4px 10px 10px 4px;background:rgba(240,232,211,.54);color:#6a6056;cursor:pointer;font-family:Charter,Georgia,Cambria,"Times New Roman",serif;font-size:12px;font-style:italic;font-weight:600;line-height:1.45;text-align:left;text-decoration:none}
.reader-note-quote:hover{color:var(--reader-red)}
.reader-note-primary-comment{margin-top:11px;color:#3f352c;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-note-primary-comment .reader-markdown,.reader-note-primary-comment .reader-markdown p{font-size:13px;font-weight:760;line-height:1.62}
.reader-comments{display:grid;gap:12px;margin-top:14px}
.reader-comment{grid-template-columns:32px minmax(0,1fr);gap:10px;margin-top:0}
.reader-comment .reader-avatar-badge{width:30px;height:30px}
.reader-note-anchor .reader-avatar-badge,.reader-comment .reader-avatar-badge,.reader-agent-menu .reader-avatar-badge,.reader-agent-annotate-menu .reader-avatar-badge,.reader-virtual-label .reader-avatar-badge{display:grid;place-items:center;overflow:hidden;border-radius:999px;background:var(--reader-green);color:white;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:800;padding:0;margin:0}
.reader-avatar-badge.is-image{background:transparent;color:inherit}
.reader-avatar-badge img{width:100%;height:100%;object-fit:cover;border-radius:999px}
.reader-avatar-badge.is-svg img{object-fit:contain}
.reader-agent-menu{z-index:12;gap:3px;max-height:min(320px,calc(100vh - 40px));overflow:auto;padding:6px;border-radius:12px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;line-height:1.2}
.reader-agent-menu button{grid-template-columns:24px minmax(0,1fr) auto;min-height:34px;gap:7px;border-radius:9px;color:var(--reader-ink);font:inherit;padding:5px 6px}
.reader-agent-menu button.is-active{background:#f0e3cd}
.reader-agent-menu .reader-avatar-badge{width:24px;height:24px}
.reader-agent-menu strong{overflow:hidden;font-size:12px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-agent-menu em{overflow:hidden;font-size:11px;font-style:normal;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.reader-highlight.is-temporary{background:rgba(77,155,114,.14);box-shadow:0 0 0 1px rgba(77,155,114,.2)}
.reader-highlight.is-agent-theater{background:rgba(77,155,114,.18);box-shadow:0 0 0 1px rgba(77,155,114,.22)}
.reader-selection-menu{display:inline-flex;align-items:center;gap:5px;width:max-content;border:1px solid rgba(40,35,29,.14);border-radius:999px;background:rgba(255,253,248,.97);box-shadow:0 18px 48px rgba(40,35,29,.16);backdrop-filter:blur(18px);padding:6px;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-selection-menu>button{justify-content:flex-start;color:var(--reader-ink);gap:6px}
.reader-selection-primary{height:36px;border:1px solid rgba(37,29,22,.1);background:#fffdf7;box-shadow:0 3px 10px rgba(55,42,24,.05);font-size:13px}
.reader-selection-primary:hover{border-color:rgba(159,91,80,.2);background:#f3ece1;color:var(--reader-red)}
.reader-selection-agent-actions{display:grid;gap:8px;min-width:0;border-top:1px solid rgba(37,29,22,.1);padding-top:10px}
.reader-selection-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--reader-muted);font-size:11px;font-weight:850;line-height:1}
.reader-selection-heading span{letter-spacing:.04em}
.reader-selection-heading em{color:#9a8c7f;font-style:normal;font-weight:760}
.reader-selection-action-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.reader-selection-action-grid button{width:100%;min-width:0;height:36px;border:1px solid rgba(37,29,22,.1);border-radius:12px;background:#fffdf7;color:var(--reader-muted);padding:0 8px;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,color .14s ease,transform .14s ease}
.reader-selection-action-grid button strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:900}
.reader-selection-action-grid button:hover,.reader-selection-action-grid button.is-active{border-color:rgba(159,91,80,.18);background:rgba(159,91,80,.07);box-shadow:0 4px 12px rgba(40,35,29,.05);color:var(--reader-red)}
.reader-selection-action-grid button:active{transform:scale(.96)}
.reader-selection-action-grid button:disabled{cursor:not-allowed;opacity:.42}
.reader-selection-agent-list{display:grid;gap:5px;padding:8px;border-radius:14px;background:#f5ecdf;color:var(--reader-ink)}
.reader-selection-agent-list strong{font-size:12px;font-weight:900}
.reader-selection-agent-list button{display:grid;grid-template-columns:24px minmax(0,1fr);justify-content:initial;width:100%;height:34px;color:var(--reader-ink);padding:0 8px;text-align:left}
.reader-selection-agent-list button:hover{background:#fffaf0}
.reader-selection-agent-list .reader-avatar-badge{width:24px;height:24px}
.reader-highlight-choice-menu{position:absolute;z-index:160;width:240px;display:grid;gap:6px;padding:10px;border:1px solid rgba(40,35,29,.14);border-radius:16px;background:rgba(255,253,248,.97);box-shadow:0 18px 48px rgba(40,35,29,.16);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-highlight-choice-menu header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px 4px}
.reader-highlight-choice-menu header strong{font-size:13px;font-weight:900}
.reader-highlight-choice-menu header button{display:grid;width:26px;height:26px;place-items:center;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);cursor:pointer;padding:0}
.reader-highlight-choice-menu header button:hover{background:#f0e3cd;color:var(--reader-ink)}
.reader-highlight-choice-menu>button{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:7px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);cursor:pointer;padding:7px;text-align:left}
.reader-highlight-choice-menu>button:hover{background:#f0e3cd}
.reader-highlight-choice-menu .reader-avatar-badge{display:grid;width:28px;height:28px;place-items:center;overflow:hidden;border-radius:999px;background:var(--reader-green);color:white;font-size:10px;font-weight:800}
.reader-highlight-choice-menu span{display:grid;gap:2px;min-width:0}
.reader-highlight-choice-menu span strong{overflow:hidden;font-size:12px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-highlight-choice-menu span em{overflow:hidden;color:var(--reader-muted);font-size:11px;font-style:normal;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.reader-highlight-choice-menu b{display:inline-flex;align-items:center;gap:3px;min-width:0;border-radius:999px;background:rgba(159,91,80,.07);color:var(--reader-red);font-size:10px;font-weight:850;line-height:1;padding:4px 6px;white-space:nowrap}
.reader-highlight-choice-menu b i{color:rgba(159,91,80,.55);font-style:normal}
.reader-highlight-choice-menu .reader-highlight-choice-label{display:inline-flex;align-items:center;gap:3px;min-width:0}
.reader-highlight-choice-menu .reader-highlight-choice-label .reader-annotation-type-icon,.reader-highlight-choice-menu .reader-highlight-choice-label .reader-reading-intent-icon{width:11px;height:11px}
.reader-virtual-cursor{gap:3px;transform:translate(-10px,-10px);transition:left .34s cubic-bezier(.22,1,.36,1),top .34s cubic-bezier(.22,1,.36,1)}
.reader-virtual-pointer{width:48px;height:48px;flex:0 0 auto;overflow:visible;border:0;background:transparent;clip-path:none;filter:drop-shadow(0 5px 8px rgba(40,35,29,.18));transform:none}
.reader-virtual-bloom{opacity:.95}
.reader-virtual-pointer-shape{stroke:#fff;stroke-width:2;stroke-linejoin:round}
.reader-virtual-cursor.is-offscreen .reader-virtual-pointer{opacity:.62}
.reader-virtual-cursor.is-offscreen .reader-virtual-bloom{opacity:.42}
.reader-virtual-label{border-color:color-mix(in srgb,var(--cursor-color,var(--reader-red)) 24%,transparent);color:var(--cursor-color,var(--reader-red))}
.reader-virtual-label .reader-avatar-badge{background:var(--cursor-color,var(--reader-red))}
@keyframes reader-cursor-leave{to{opacity:0;transform:translate(8px,-34px) scale(.86);filter:blur(2px)}}
.reader-completion-burst{position:fixed;inset:0;z-index:9;overflow:hidden;pointer-events:none}
.reader-completion-burst-center{position:absolute;left:50%;top:50%;width:1px;height:1px;transform:scale(1.28);transform-origin:center}
.reader-completion-burst-ring{position:absolute;left:0;top:0;width:148px;height:148px;border:1px solid rgba(199,164,94,.3);border-radius:999px;opacity:0;transform:translate(-50%,-50%) scale(.18);animation:reader-completion-ring 1.18s cubic-bezier(.22,1,.36,1) forwards}
.reader-completion-burst-ring.is-wide{width:236px;height:236px;border-color:rgba(94,192,232,.22);animation-delay:.12s}
.reader-completion-particle{position:absolute;left:0;top:0;width:8px;height:13px;border-radius:2px;background:var(--reader-confetti-color);box-shadow:0 8px 18px rgba(40,35,29,.12);opacity:0;transform:translate(-50%,-50%) scale(.2) rotate(var(--reader-confetti-rotate));animation:reader-completion-pop 1.52s cubic-bezier(.16,1,.3,1) forwards;animation-delay:var(--reader-confetti-delay);will-change:transform,opacity,filter}
.reader-completion-particle.is-dot{width:7px;height:7px;border-radius:999px}
.reader-completion-particle.is-spark{width:4px;height:16px;border-radius:999px}
@keyframes reader-completion-ring{12%{opacity:.7}to{opacity:0;transform:translate(-50%,-50%) scale(1.2)}}
@keyframes reader-completion-pop{0%{opacity:0;filter:blur(3px);transform:translate(-50%,-50%) scale(.2) rotate(var(--reader-confetti-rotate))}16%{opacity:1;filter:blur(0)}76%{opacity:1;transform:translate(-50%,-50%) translate(var(--reader-confetti-x),var(--reader-confetti-y)) scale(1) rotate(calc(var(--reader-confetti-rotate) + 110deg))}100%{opacity:0;filter:blur(1px);transform:translate(-50%,-50%) translate(var(--reader-confetti-x),calc(var(--reader-confetti-y) + 42px)) scale(.86) rotate(calc(var(--reader-confetti-rotate) + 180deg))}}
.reader-agent-dock{position:fixed;left:50%;bottom:18px;z-index:135;display:flex;align-items:flex-end;justify-content:center;min-height:58px;max-width:calc(100vw - 36px);padding:8px 10px;border:1px solid rgba(40,35,29,.1);border-radius:19px;background:rgba(255,253,248,.68);box-shadow:0 18px 48px rgba(40,35,29,.16),inset 0 1px 0 rgba(255,255,255,.68);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);pointer-events:none;transform:translateX(-50%);transform-origin:bottom center;transition:opacity .18s ease,filter .18s ease}
.reader-agent-dock.is-completing{animation:reader-agent-dock-leave .78s cubic-bezier(.22,1,.36,1) .82s forwards}
.reader-agent-dock-list{display:flex;align-items:flex-end;gap:8px;min-width:0}
.reader-agent-dock-item{position:relative;display:grid;width:44px;height:44px;place-items:center;border-radius:12px;background:transparent;box-shadow:0 8px 18px rgba(40,35,29,.14),0 0 0 1px color-mix(in srgb,var(--agent-color) 18%,transparent);transform:translateY(0);transition:filter .18s ease,opacity .18s ease,transform .18s ease}
.reader-agent-dock-item .reader-avatar-badge{width:40px;height:40px;border-radius:10px;background:var(--agent-color);box-shadow:0 0 0 1px rgba(255,253,248,.82);font-size:12px}
.reader-agent-dock-item .reader-avatar-badge img{border-radius:10px}
.reader-agent-dock-item.is-active{animation:reader-agent-dock-hop .86s cubic-bezier(.34,1.56,.64,1) infinite;animation-delay:var(--reader-dock-delay)}
.reader-agent-dock-item.is-active::after{content:"";position:absolute;left:50%;bottom:-7px;width:5px;height:5px;border-radius:999px;background:var(--agent-color);box-shadow:0 0 0 4px color-mix(in srgb,var(--agent-color) 14%,transparent);transform:translateX(-50%);opacity:.9}
.reader-agent-dock-item.is-done{filter:saturate(.9);opacity:.86}
.reader-agent-dock .reader-completion-burst{position:absolute;inset:auto;left:50%;bottom:32px;z-index:1;width:1px;height:1px;overflow:visible}
.reader-agent-dock .reader-completion-burst-center{left:0;top:0;transform:scale(.82);transform-origin:center}
@keyframes reader-agent-dock-hop{0%,100%{transform:translateY(0) scale(1)}45%{transform:translateY(-10px) scale(1.04)}70%{transform:translateY(0) scale(.99)}}
@keyframes reader-agent-dock-leave{to{opacity:0;filter:blur(8px);transform:translateX(-50%) translateY(12px) scale(.92)}}
.reader-agent-annotate{height:38px;border-color:rgba(40,35,29,.14);background:rgba(255,253,248,.88);color:var(--reader-ink);padding:0 12px}
.reader-agent-annotate:hover,.reader-agent-annotate.is-active{background:#f0eadf;color:var(--reader-ink)}
.reader-notes-actions span{background:var(--reader-ink)}
.reader-agent-annotate-menu{gap:8px;margin:8px 0 18px;padding:14px;border-color:rgba(40,35,29,.12);border-radius:18px;background:rgba(255,253,248,.96);overflow:auto;max-height:calc(100vh - 112px)}
.reader-agent-annotate-menu>header{display:grid;gap:3px;padding:2px 4px 8px}
.reader-agent-annotate-menu>header strong{font-size:14px;font-weight:900}
.reader-agent-annotate-menu>header span{color:var(--reader-muted);font-size:12px;font-weight:720}
.reader-agent-option{position:relative;display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:8px;border:1px solid transparent;border-radius:14px;padding:6px}
.reader-agent-option:hover,.reader-agent-option.is-running,.reader-agent-option.is-selected{border-color:rgba(40,35,29,.12);background:rgba(240,234,223,.74)}
.reader-agent-select{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:10px;border:0;border-radius:12px;background:transparent;color:var(--reader-ink);cursor:pointer;font:inherit;padding:6px;text-align:left}
.reader-agent-select:disabled{cursor:not-allowed;opacity:.65}
.reader-agent-action-picker{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:2px 6px 6px 54px;padding:7px;border-radius:14px;background:rgba(255,253,248,.9);box-shadow:inset 0 0 0 1px rgba(40,35,29,.08),0 8px 20px rgba(40,35,29,.06)}
.reader-agent-annotate-menu .reader-agent-action-picker button{display:grid;grid-template-columns:1fr;align-content:start;align-items:start;gap:5px;min-height:64px;border:1px solid rgba(40,35,29,.1);border-radius:11px;background:#fffdf8;color:var(--reader-ink);cursor:pointer;font:inherit;padding:9px 10px;text-align:left;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-agent-action-picker button:hover,.reader-agent-annotate-menu .reader-agent-action-picker button.is-active{border-color:rgba(159,91,80,.18);background:rgba(159,91,80,.06);box-shadow:0 4px 12px rgba(40,35,29,.05);color:var(--reader-red)}
.reader-agent-annotate-menu .reader-agent-action-picker button:active{transform:scale(.96)}
.reader-agent-annotate-menu .reader-agent-action-picker button>strong{font-size:12px;font-weight:900;line-height:1.15}
.reader-agent-annotate-menu .reader-agent-action-picker button>span{display:block;width:auto;height:auto;min-width:0;margin:0;padding:0;border-radius:0;background:transparent;color:var(--reader-muted);font-size:10px;font-weight:720;line-height:1.35;place-items:initial}
.reader-agent-avatar{position:relative;display:grid;width:38px;height:44px;place-items:end center}
.reader-agent-avatar i{position:absolute;top:0;left:50%;width:9px;height:9px;border:1px solid rgba(37,29,22,.16);border-radius:999px;box-shadow:0 1px 3px rgba(37,29,22,.2);transform:translateX(-50%)}
.reader-agent-avatar .reader-avatar-badge{width:30px;height:30px}
.reader-agent-select>span:not(.reader-avatar-badge){display:grid;width:auto;height:auto;gap:2px;min-width:0;place-items:initial;border-radius:0;background:transparent;color:inherit;font-size:inherit;font-weight:inherit}
.reader-agent-select>span:not(.reader-avatar-badge) strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-agent-select>span:not(.reader-avatar-badge) small{overflow:hidden;color:#5d5147;font-size:11px;font-weight:760;text-overflow:ellipsis;white-space:nowrap}
.reader-agent-select b{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(37,29,22,.08);color:var(--reader-muted);font-size:11px;font-weight:850;line-height:1;padding:6px 8px}
.reader-agent-option:hover .reader-agent-select b{background:#251d16;color:#fffaf0}
.reader-agent-option.is-running .reader-agent-select b{background:rgba(159,91,80,.1);color:var(--reader-red)}
.reader-agent-option.is-selected .reader-agent-select b{background:#251d16;color:#fffaf0}
.reader-agent-annotate-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px;padding-top:10px;border-top:1px solid rgba(37,29,22,.1)}
.reader-agent-annotate-actions button{display:inline-flex;height:40px;width:auto;grid-template-columns:none;align-items:center;justify-content:center;border:0;border-radius:999px;background:#e7dac9;color:var(--reader-ink);font:inherit;font-size:12px;font-weight:820;padding:0 14px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-agent-annotate-actions button:active:not(:disabled){transform:scale(.96)}
.reader-agent-annotate-actions button:last-child{background:var(--reader-ink);color:#fffaf0}
.reader-agent-annotate-actions button:disabled{cursor:not-allowed;opacity:.48}
.reader-agent-annotate-popover{position:fixed;inset:0;z-index:200;display:grid;place-items:center;width:auto;padding:34px;pointer-events:none}
.reader-agent-annotate-scrim{position:fixed;inset:0;border:0;background:rgba(40,35,29,.2);backdrop-filter:blur(10px);pointer-events:auto}
.reader-agent-annotate-popover .reader-agent-annotate-menu{position:relative;z-index:1;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;width:min(1180px,calc(100vw - 56px));height:min(860px,calc(100vh - 48px));max-height:min(860px,calc(100vh - 48px));margin:0;padding:18px;border:1px solid rgba(40,35,29,.12);border-radius:20px;background:rgba(255,253,248,.98);box-shadow:0 28px 90px rgba(40,35,29,.24);overflow:hidden;pointer-events:auto}
.reader-agent-annotate-popover .reader-agent-annotate-menu:has(.reader-focus-progress){grid-template-rows:auto auto auto minmax(0,1fr) auto}
.reader-plan-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:24px;padding:2px 2px 8px}
.reader-plan-header>div{display:grid;gap:6px;min-width:0}
.reader-plan-header strong{font-size:22px;font-weight:900;line-height:1.16;text-wrap:balance}
.reader-plan-header span{color:var(--reader-muted);font-size:13px;font-weight:760;line-height:1.45;text-wrap:pretty}
.reader-plan-header p{display:flex;align-items:center;gap:8px;margin:0 0 1px;color:var(--reader-muted);font-size:13px;font-weight:820;white-space:nowrap}
.reader-plan-header b{color:var(--reader-ink);font-variant-numeric:tabular-nums}
.reader-plan-action-bar{position:relative;display:flex;align-items:center;gap:10px;min-height:56px;margin:8px 0 14px;padding:10px 14px;border-radius:14px;background:#f2eadc;box-shadow:inset 0 0 0 1px rgba(40,35,29,.09);overflow:visible}
.reader-plan-action-bar>span{margin-right:6px;color:#8b8175;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
.reader-agent-annotate-menu .reader-plan-action{position:relative;display:inline-flex;width:auto;min-width:58px;height:34px;grid-template-columns:none;align-items:center;justify-content:center;gap:5px;border:1px solid rgba(40,35,29,.1);border-radius:999px;background:#fffdf8;color:var(--reader-ink);cursor:grab;font:inherit;font-size:12px;font-weight:900;padding:0 14px;text-align:center;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-plan-action:hover{border-color:rgba(40,35,29,.18);background:#fffaf0;box-shadow:0 6px 16px rgba(40,35,29,.08)}
.reader-agent-annotate-menu .reader-plan-action:active{cursor:grabbing;transform:scale(.96)}
.reader-agent-annotate-menu .reader-plan-action:hover::after{content:attr(data-description);position:absolute;left:50%;bottom:calc(100% + 9px);z-index:4;width:max-content;max-width:240px;transform:translateX(-50%);border-radius:10px;background:#28231d;color:#fffaf0;box-shadow:0 12px 28px rgba(40,35,29,.2);font-size:11px;font-weight:760;line-height:1.45;padding:8px 10px;white-space:normal}
.reader-plan-grid-wrap{min-height:0;overflow:auto;padding:2px 2px 4px}
.reader-plan-grid{display:grid;gap:6px;min-width:max-content;align-items:stretch}
.reader-plan-corner{position:sticky;left:0;z-index:2;border-radius:12px;background:rgba(255,253,248,.94)}
.reader-plan-section{display:grid;align-content:end;gap:3px;min-height:44px;padding:0 4px 8px;border-bottom:1px dashed rgba(40,35,29,.18);color:var(--reader-muted);text-align:center}
.reader-plan-section span{font-size:11px;font-weight:850;line-height:1}
.reader-plan-section strong{overflow:hidden;color:#6f665d;font-size:12px;font-weight:900;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}
.reader-plan-agent{position:sticky;left:0;z-index:2;display:grid;grid-template-columns:8px 32px minmax(0,1fr) 30px;align-items:center;gap:10px;min-height:54px;padding:8px 8px 8px 0;background:rgba(255,253,248,.96)}
.reader-plan-agent-color{width:8px;height:34px;border-radius:999px;box-shadow:inset 0 0 0 1px rgba(37,29,22,.14)}
.reader-plan-agent .reader-avatar-badge{width:30px;height:30px}
.reader-plan-agent strong{overflow:hidden;font-size:13px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
.reader-agent-annotate-menu .reader-plan-agent button{display:grid;width:30px;height:30px;grid-template-columns:none;place-items:center;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);cursor:pointer;padding:0;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-plan-agent button:hover{background:rgba(40,35,29,.08);color:var(--reader-ink)}
.reader-agent-annotate-menu .reader-plan-agent button:active{transform:scale(.96)}
.reader-plan-cell{display:grid;min-height:54px;place-items:center;border:1px dashed rgba(199,164,94,.36);border-radius:9px;background:rgba(255,250,240,.45);color:#b0a394;font-size:14px;font-weight:820}
.reader-plan-cell.is-filled{border-style:solid;border-color:color-mix(in srgb,var(--agent-color) 34%,transparent);background:color-mix(in srgb,var(--agent-color) 10%,#fffdf8)}
.reader-agent-annotate-menu .reader-plan-cell-action{display:grid;width:100%;height:100%;grid-template-columns:1fr;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--reader-ink);cursor:pointer;font:inherit;padding:0 8px;text-align:center;transition:background .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-plan-cell-action:hover{background:color-mix(in srgb,var(--agent-color) 10%,transparent)}
.reader-agent-annotate-menu .reader-plan-cell-action:active{transform:scale(.96)}
.reader-plan-cell-action strong{display:inline-flex;max-width:100%;align-items:center;justify-content:center;gap:4px;overflow:hidden;font-size:13px;font-weight:950;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;margin:8px 0 14px;padding:10px 12px;border-radius:14px;background:#f2eadc;box-shadow:inset 0 0 0 1px rgba(40,35,29,.09)}
.reader-focus-agent-picker{display:flex;min-width:0;flex-wrap:wrap;align-items:center;gap:7px}
.reader-agent-annotate-menu .reader-focus-agent-chip,.reader-agent-annotate-menu .reader-focus-assigned-chip{display:inline-flex;width:auto;height:34px;grid-template-columns:none;align-items:center;justify-content:center;gap:7px;border:1px solid rgba(40,35,29,.1);border-radius:999px;background:#fffdf8;color:var(--reader-ink);cursor:pointer;font:inherit;font-size:12px;font-weight:860;padding:0 10px 0 4px;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-focus-agent-chip:hover,.reader-agent-annotate-menu .reader-focus-assigned-chip:hover{border-color:rgba(40,35,29,.18);background:#fffaf0;box-shadow:0 5px 14px rgba(40,35,29,.05)}
.reader-agent-annotate-menu .reader-focus-agent-chip:active,.reader-agent-annotate-menu .reader-focus-assigned-chip:active{transform:scale(.97)}
.reader-focus-agent-chip .reader-avatar-badge,.reader-focus-assigned-chip .reader-avatar-badge{width:26px;height:26px}
.reader-focus-agent-chip strong,.reader-focus-assigned-chip strong{max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-agent-chip svg,.reader-focus-assigned-chip svg{color:#75695d}
.reader-focus-add-wrap{position:relative;display:inline-flex;flex:0 0 auto}
.reader-agent-annotate-menu .reader-focus-add{display:inline-flex;width:auto;height:34px;grid-template-columns:none;align-items:center;justify-content:center;gap:7px;border:1px dashed rgba(40,35,29,.24);border-radius:999px;background:#fffdf8;color:var(--reader-ink);cursor:pointer;font:inherit;font-size:12px;font-weight:860;padding:0 12px;white-space:nowrap;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-focus-add:hover{border-color:rgba(40,35,29,.34);background:#fffaf0;box-shadow:0 5px 14px rgba(40,35,29,.06)}
.reader-agent-annotate-menu .reader-focus-add:active{transform:scale(.97)}
.reader-focus-add svg{color:#6f665d}
.reader-focus-add-menu{position:absolute;left:0;top:calc(100% + 8px);z-index:8;display:grid;gap:4px;width:220px;max-height:260px;overflow:auto;padding:8px;border:1px solid rgba(40,35,29,.12);border-radius:14px;background:#fffdf8;box-shadow:0 18px 44px rgba(40,35,29,.16)}
.reader-agent-annotate-menu .reader-focus-add-menu button{display:grid;width:100%;height:38px;grid-template-columns:28px minmax(0,1fr);align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);cursor:pointer;font:inherit;padding:0 8px;text-align:left;transition:background .14s ease}
.reader-agent-annotate-menu .reader-focus-add-menu button:hover{background:#f0eadf}
.reader-focus-add-menu .reader-avatar-badge{width:26px;height:26px}
.reader-focus-add-menu strong{overflow:hidden;font-size:12px;font-weight:860;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-add-menu>em{padding:8px;color:var(--reader-muted);font-size:12px;font-style:normal;font-weight:780}
.reader-focus-actions{display:inline-flex;align-items:center;justify-content:flex-end;gap:8px}
.reader-agent-annotate-menu .reader-focus-clear{display:inline-flex;width:auto;height:38px;grid-template-columns:none;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(40,35,29,.12);border-radius:999px;background:#fffdf8;color:var(--reader-muted);cursor:pointer;font:inherit;font-size:12px;font-weight:860;padding:0 12px;white-space:nowrap;transition:background .14s ease,border-color .14s ease,color .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-focus-clear:hover:not(:disabled){border-color:rgba(159,91,80,.22);background:#fff4ef;color:var(--reader-red)}
.reader-agent-annotate-menu .reader-focus-clear:active:not(:disabled){transform:scale(.96)}
.reader-agent-annotate-menu .reader-focus-clear:disabled{cursor:not-allowed;opacity:.42}
.reader-agent-annotate-menu .reader-focus-plan{display:inline-flex;width:auto;height:38px;grid-template-columns:none;align-items:center;justify-content:center;gap:7px;border:0;border-radius:999px;background:var(--reader-ink);color:#fffaf0;cursor:pointer;font:inherit;font-size:12px;font-weight:900;padding:0 14px;white-space:nowrap;transition:background .14s ease,box-shadow .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-focus-plan:hover:not(:disabled){background:#3b332b;box-shadow:0 8px 18px rgba(40,35,29,.16)}
.reader-agent-annotate-menu .reader-focus-plan:active:not(:disabled){transform:scale(.96)}
.reader-agent-annotate-menu .reader-focus-plan:disabled{background:#e7dac9;color:#766b5e;cursor:not-allowed;box-shadow:none;opacity:1}
.reader-focus-progress{display:grid;gap:8px;margin:-4px 0 14px;padding:10px 12px;border:1px solid rgba(40,35,29,.1);border-radius:14px;background:#fffdf8}
.reader-focus-progress>div{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--reader-muted);font-size:12px;font-weight:850}
.reader-focus-progress strong{color:var(--reader-ink);font-size:12px}
.reader-focus-progress>i{display:block;height:7px;overflow:hidden;border-radius:999px;background:#eadfce}
.reader-focus-progress>i>b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#28231d,#9f5b50,#c7a45e);transition:width .34s cubic-bezier(.22,1,.36,1)}
.reader-focus-card-list{display:grid;align-content:start;gap:10px;min-height:0;overflow:auto;padding:2px 4px 4px}
.reader-focus-section-card{border:1px solid rgba(40,35,29,.1);border-radius:16px;background:#fffdf8;box-shadow:0 8px 24px rgba(40,35,29,.05);overflow:visible}
.reader-focus-section-card.is-open{border-color:rgba(40,35,29,.16);box-shadow:0 12px 30px rgba(40,35,29,.08)}
.reader-agent-annotate-menu .reader-focus-card-summary{display:grid;width:100%;min-height:64px;grid-template-columns:42px minmax(0,1fr) minmax(120px,auto) 24px;align-items:center;gap:10px;border:0;border-radius:16px;background:transparent;color:var(--reader-ink);cursor:pointer;font:inherit;padding:11px 14px;text-align:left;transition:background .14s ease}
.reader-agent-annotate-menu .reader-focus-card-summary:hover{background:#fffaf0}
.reader-focus-card-summary>b{display:grid;width:32px;height:32px;place-items:center;border-radius:999px;background:#f0e5d4;color:#75695d;font-size:12px;font-weight:950}
.reader-focus-section-card.is-open .reader-focus-card-summary>b{background:var(--reader-ink);color:#fffaf0}
.reader-focus-card-copy{display:grid;gap:4px;min-width:0}
.reader-focus-card-title{display:flex;min-width:0;align-items:center;gap:8px}
.reader-focus-card-copy strong{overflow:hidden;font-size:15px;font-weight:920;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-card-title>em{max-width:92px;overflow:hidden;border-radius:999px;background:rgba(159,91,80,.08);color:var(--reader-red);flex:0 0 auto;font-size:11px;font-style:normal;font-weight:850;padding:4px 8px;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-card-copy small{overflow:hidden;color:var(--reader-muted);font-size:12px;font-weight:720;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-card-agents{display:flex;min-width:0;max-width:360px;flex-wrap:wrap;justify-content:flex-end;gap:6px}
.reader-focus-card-agents i{display:inline-flex;align-items:center;gap:5px;min-width:0;height:28px;border:1px solid rgba(40,35,29,.1);border-radius:999px;background:#fffaf0;font-style:normal;padding:0 8px 0 3px}
.reader-focus-card-agents .reader-avatar-badge{width:22px;height:22px}
.reader-focus-card-agents strong{max-width:72px;overflow:hidden;font-size:11px;font-weight:860;text-overflow:ellipsis;white-space:nowrap}
.reader-focus-card-agents small{color:#9a8f83;font-size:12px;font-weight:780;white-space:nowrap}
.reader-focus-card-agents .reader-focus-message-count{border-radius:999px;background:rgba(199,164,94,.12);color:#8a6e39;padding:6px 8px}
.reader-focus-card-summary>svg{justify-self:end;color:#75695d}
.reader-focus-card-body{display:grid;gap:13px;padding:0 18px 17px 66px}
.reader-focus-card-section{display:grid;gap:8px;padding-top:13px;border-top:1px solid rgba(40,35,29,.08)}
.reader-focus-card-section>strong{color:#5a5148;font-size:12px;font-weight:900}
.reader-focus-assigned-list{display:flex;min-width:0;flex-wrap:wrap;align-items:center;gap:9px}
.reader-focus-messages{display:grid;align-content:start;gap:8px;min-height:0}
.reader-focus-message{display:grid;grid-template-columns:18px minmax(0,1fr) 28px;align-items:start;gap:8px;padding:10px 9px;border-radius:12px;background:#f7f0e5;color:var(--reader-ink)}
.reader-focus-message>svg{margin-top:2px;color:var(--reader-red)}
.reader-focus-message-body{display:grid;gap:7px;min-width:0}
.reader-focus-message p{margin:0;color:#51483f;font-size:13px;font-weight:720;line-height:1.5;overflow-wrap:anywhere}
.reader-focus-message-targets{display:flex;min-width:0;flex-wrap:wrap;gap:5px}
.reader-focus-message-targets>em{border-radius:999px;background:rgba(159,91,80,.08);color:var(--reader-red);font-size:11px;font-style:normal;font-weight:850;padding:4px 7px;white-space:nowrap}
.reader-agent-annotate-menu .reader-focus-message button{display:grid;width:28px;height:28px;grid-template-columns:none;place-items:center;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);cursor:pointer;padding:0}
.reader-agent-annotate-menu .reader-focus-message button:hover{background:rgba(40,35,29,.08);color:var(--reader-ink)}
.reader-focus-message-input{display:grid;gap:8px}
.reader-focus-message-box{position:relative}
.reader-focus-message-input textarea{width:100%;min-height:72px;resize:vertical;border:1px solid rgba(40,35,29,.12);border-radius:14px;background:#fffdf8;color:var(--reader-ink);font:inherit;font-size:13px;line-height:1.55;padding:11px 12px}
.reader-focus-message-input textarea:focus,.reader-focus-message-input textarea:focus-visible{outline:0;border-color:rgba(40,35,29,.24);box-shadow:none}
.reader-focus-message-footer{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:10px}
.reader-agent-annotate-menu .reader-focus-message-footer>button{display:inline-flex;width:auto;height:40px;grid-template-columns:none;align-items:center;justify-content:center;gap:7px;border:0;border-radius:999px;background:#e7dac9;color:var(--reader-ink);cursor:pointer;font:inherit;font-size:12px;font-weight:850;padding:0 13px;white-space:nowrap}
.reader-agent-annotate-menu .reader-focus-message-footer>button:hover:not(:disabled){background:#ddceb9}
.reader-focus-message-agents{display:flex;min-width:0;flex:1 1 auto;flex-wrap:wrap;align-items:center;gap:7px;color:var(--reader-muted);font-size:11px;font-weight:780}
.reader-focus-message-agents small{font-size:11px;font-weight:780}
.reader-agent-annotate-menu .reader-focus-message-agents button{display:inline-flex;width:auto;height:30px;grid-template-columns:none;align-items:center;gap:6px;border:1px solid rgba(40,35,29,.1);border-radius:999px;background:#fffdf8;color:var(--reader-ink);font:inherit;font-size:11px;font-weight:850;padding:0 9px 0 4px}
.reader-agent-annotate-menu .reader-focus-message-agents button:hover{background:#fffaf0}
.reader-focus-message-agents .reader-avatar-badge{width:22px;height:22px}
.reader-focus-agent-menu{bottom:calc(100% - 4px)}
.reader-focus-empty{display:grid;min-height:220px;place-items:center;border:1px dashed rgba(40,35,29,.14);border-radius:16px;color:var(--reader-muted);font-size:13px;font-weight:760}
.reader-plan-footer{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding-top:14px}
.reader-plan-add{position:relative}
.reader-agent-annotate-menu .reader-plan-add>button{display:inline-flex;width:auto;height:40px;grid-template-columns:none;align-items:center;justify-content:center;gap:7px;border:1px dashed rgba(40,35,29,.2);border-radius:999px;background:#fffdf8;color:var(--reader-ink);cursor:pointer;font:inherit;font-size:12px;font-weight:850;padding:0 14px;transition:background .14s ease,border-color .14s ease,transform .14s ease}
.reader-agent-annotate-menu .reader-plan-add>button:hover{border-color:rgba(40,35,29,.28);background:#fffaf0}
.reader-agent-annotate-menu .reader-plan-add>button:active:not(:disabled){transform:scale(.96)}
.reader-agent-annotate-menu .reader-plan-add>button:disabled{cursor:not-allowed;opacity:.44}
.reader-plan-add-menu{position:absolute;left:0;bottom:calc(100% + 8px);z-index:3;display:grid;gap:4px;width:220px;padding:8px;border:1px solid rgba(40,35,29,.12);border-radius:14px;background:#fffdf8;box-shadow:0 18px 44px rgba(40,35,29,.16)}
.reader-agent-annotate-menu .reader-plan-add-menu button{display:grid;width:100%;height:38px;grid-template-columns:28px minmax(0,1fr);align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);cursor:pointer;font:inherit;padding:0 8px;text-align:left}
.reader-agent-annotate-menu .reader-plan-add-menu button:hover{background:#f0eadf}
.reader-plan-add-menu .reader-avatar-badge{width:26px;height:26px}
.reader-agent-annotate-menu .reader-plan-add-menu button>span:not(.reader-avatar-badge){display:block;width:auto;height:auto;min-width:0;margin:0;overflow:hidden;border-radius:0;background:transparent;color:var(--reader-ink);font-size:12px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-plan-help{margin:0;color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.45;text-align:center}
.reader-plan-footer .reader-agent-annotate-actions{margin:0;padding:0;border:0}
@media(max-width:860px){.reader-focus-toolbar{grid-template-columns:1fr}.reader-focus-plan{justify-self:end}.reader-agent-annotate-menu .reader-focus-card-summary{grid-template-columns:38px minmax(0,1fr) 24px}.reader-focus-card-agents{grid-column:2/-1;justify-content:flex-start}.reader-focus-card-body{padding-left:16px}.reader-focus-message-footer{align-items:flex-start;flex-direction:column}.reader-plan-footer{grid-template-columns:1fr}.reader-plan-footer .reader-agent-annotate-actions{justify-content:flex-end}}
.reader-composer-types{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.reader-composer-types button{display:inline-flex;align-items:center;justify-content:center;gap:4px;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:#fffdf7;color:var(--reader-muted);cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:850;line-height:1;padding:7px 9px}
.reader-composer-types button:hover,.reader-composer-types button.is-active{border-color:rgba(159,91,80,.18);background:rgba(159,91,80,.07);color:var(--reader-red)}
.reader-comment-body{min-width:0}
.reader-comment-author{display:grid;grid-template-columns:minmax(0,1fr) auto;min-width:0;align-items:baseline;gap:8px;margin-bottom:3px;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-comment-author strong{display:inline-flex;min-width:0;align-items:center;gap:4px;font-size:12px;font-weight:850}
.reader-comment .reader-comment-author span{display:inline-flex;width:auto;height:auto;align-items:center;gap:3px;border-radius:999px;background:rgba(159,91,80,.07);color:var(--reader-red);font-size:10px;font-weight:850;line-height:1;padding:3px 6px}
.reader-comment .reader-review-label{display:inline-flex;width:max-content;max-width:100%;height:auto;min-width:0;align-items:center;margin:0 0 5px;border:1px solid transparent;border-radius:999px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:9px;font-weight:900;line-height:1;overflow-wrap:normal;padding:3px 6px;white-space:nowrap;word-break:normal}
.reader-review-label.is-support{border-color:rgba(77,155,114,.18);background:rgba(77,155,114,.11);color:#356f51}
.reader-review-label.is-challenge{border-color:rgba(159,91,80,.2);background:rgba(159,91,80,.1);color:#8a3f32}
.reader-review-label.is-supplement{border-color:rgba(79,127,159,.2);background:rgba(79,127,159,.1);color:#3f6d8b}
.reader-markdown{min-width:0;color:#3f352c;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;line-height:1.66;overflow-wrap:anywhere;word-break:break-word}
.reader-markdown-content>*:first-child{margin-top:0}
.reader-markdown-content>*:last-child{margin-bottom:0}
.reader-markdown p{margin:0 0 8px;color:inherit;font-size:13px;line-height:1.66}
.reader-markdown h1,.reader-markdown h2,.reader-markdown h3,.reader-markdown h4,.reader-markdown h5,.reader-markdown h6{margin:10px 0 6px;color:var(--reader-ink);font-family:ui-sans-serif,system-ui,sans-serif;font-weight:850;line-height:1.35;letter-spacing:0}
.reader-markdown h1{font-size:15px}
.reader-markdown h2{font-size:14px}
.reader-markdown h3,.reader-markdown h4,.reader-markdown h5,.reader-markdown h6{font-size:13px}
.reader-markdown ul,.reader-markdown ol{margin:6px 0 8px;padding-left:18px}
.reader-markdown li{margin:3px 0}
.reader-markdown blockquote{margin:8px 0;padding-left:10px;border-left:3px solid rgba(159,91,80,.28);color:#5d5147}
.reader-markdown code{border-radius:5px;background:rgba(37,29,22,.08);font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12px;padding:1px 4px}
.reader-markdown pre{max-width:100%;overflow:auto;margin:8px 0;padding:10px;border-radius:10px;background:#251d16;color:#fffaf0}
.reader-markdown pre code{background:transparent;color:inherit;padding:0}
.reader-markdown a{color:inherit;text-decoration:underline;text-decoration-color:rgba(37,29,22,.35);text-decoration-thickness:1px;text-underline-offset:.16em}
.reader-markdown a:hover{color:var(--reader-red);text-decoration-color:currentColor}
.reader-delete-note{position:relative;isolation:isolate;overflow:hidden;justify-content:center;height:40px;border-radius:999px;padding:0 12px;line-height:1;touch-action:none;user-select:none;white-space:nowrap}
.reader-delete-note::before{content:"";position:absolute;inset:0 auto 0 0;width:0;background:rgba(159,91,80,.14);z-index:0}
.reader-delete-note:hover{background:rgba(159,91,80,.07)}
.reader-delete-note svg,.reader-delete-note span{position:relative;z-index:1}
.reader-delete-note.is-holding::before{animation:reader-delete-hold var(--delete-hold-ms) linear forwards}
@keyframes reader-delete-hold{to{width:100%}}
.reader-agent-annotate-popover{position:fixed;inset:0;z-index:200;display:grid;place-items:center;width:auto;padding:34px;pointer-events:none}
.reader-agent-annotate-popover .reader-agent-annotate-menu{margin:0}
.reader-toc-item-main{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}
.reader-toc-item-main>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-toc-meta{display:inline-flex;align-items:center;gap:8px}
.reader-toc-item-main strong{display:grid;min-width:24px;height:24px;place-items:center;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:#fffaf0;color:var(--reader-ink);font-size:11px;font-weight:850}
.reader-toc-markers{display:flex;align-items:center;gap:5px}
.reader-toc-markers i{width:8px;height:8px;border:1px solid rgba(37,29,22,.14);border-radius:999px;box-shadow:0 1px 2px rgba(37,29,22,.12)}
.reader-toc-summary{display:inline-flex;align-items:center;gap:7px;margin-top:18px;padding:12px 10px;border:1px solid rgba(37,29,22,.12);border-radius:14px;background:rgba(255,250,240,.72);color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:760;line-height:1.4;white-space:nowrap}
.reader-toc-summary-stat{display:inline-flex;align-items:center;gap:4px;min-width:0}
.reader-toc-summary-stat svg{width:14px;height:14px;flex:none;stroke-width:2.1}
.reader-toc-summary-value{min-width:1ch;text-align:right}
.reader-toc-summary-separator{color:var(--reader-muted)}
.reader-notes-header{display:grid;gap:10px;margin:0 -16px 14px;padding:14px 16px;border-bottom:1px solid rgba(40,35,29,.08);background:rgba(250,247,240,.96);box-shadow:0 8px 18px rgba(40,35,29,.05)}
.reader-notes-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.reader-notes-title-row strong{font-size:22px;font-weight:900;letter-spacing:0}
.reader-notes-title-row span{display:inline-flex;align-items:center;height:28px;border:1px solid rgba(37,29,22,.1);border-radius:999px;background:rgba(255,250,240,.76);color:var(--reader-muted);font-size:12px;font-weight:820;padding:0 10px}
.reader-note-tabs [data-slot="tabs-list"]{display:grid;width:100%;height:38px;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;padding:3px;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:rgba(255,250,240,.7);box-shadow:inset 0 1px 0 rgba(255,255,255,.72)}
.reader-note-tabs [data-slot="tabs-trigger"]{height:30px;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:850;letter-spacing:0;padding:0 8px}
.reader-note-tabs [data-slot="tabs-trigger"][data-state="active"]{background:#fffdf8;color:var(--reader-ink);box-shadow:0 5px 14px rgba(40,35,29,.08)}
.reader-note-tabs [data-slot="tabs-trigger"]:focus-visible{outline:2px solid rgba(37,29,22,.24);outline-offset:2px}
.reader-note{overflow:hidden;padding:0;--reader-note-accent:var(--reader-yellow-strong)}
.reader-note.has-review-menu{z-index:24;overflow:visible}
.reader-note.has-review-burst{overflow:visible}
.reader-note-body{position:relative;min-width:0;padding:16px 16px 0;background:rgba(255,253,248,.96)}
.reader-note-toolbar{position:relative;display:flex;align-items:stretch;margin:14px -16px 0;border-top:1px solid rgba(40,35,29,.12);background:rgba(250,246,238,.86)}
.reader-note-thread-toggle{display:flex;width:100%;min-width:0;min-height:44px;align-items:center;justify-content:space-between;gap:12px;border:0;background:transparent;color:var(--reader-muted);cursor:pointer;font:inherit;padding:0 14px 0 16px;text-align:left;transition:background .14s ease,color .14s ease}
.reader-note-thread-toggle:hover{background:#f0e3cd;color:var(--reader-ink)}
.reader-note-thread-toggle:active{background:#eadfce}
.reader-note-thread-toggle-main{display:inline-flex;min-width:0;align-items:center;gap:10px}
.reader-note-thread-toggle-side{display:inline-flex;min-width:0;align-items:center;justify-content:flex-end;color:var(--reader-muted)}
.reader-note-toolbar.has-review-action .reader-note-thread-toggle{width:auto;flex:1 1 auto}
.reader-review-invite-wrap{position:relative;display:flex;flex:0 0 auto;align-items:stretch;border-left:1px solid rgba(40,35,29,.1)}
.reader-review-invite{display:inline-flex;min-width:78px;align-items:center;justify-content:center;gap:5px;border:0;background:rgba(255,253,248,.52);color:var(--reader-muted);cursor:pointer;font:inherit;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:860;padding:0 11px;transition:background .14s ease,color .14s ease}
.reader-review-invite:hover,.reader-review-invite.is-active{background:#f0e3cd;color:var(--reader-ink)}
.reader-review-invite:disabled{cursor:not-allowed;opacity:.58}
.reader-review-invite.is-reviewing svg{animation:reader-review-scale 1.05s ease-in-out infinite}
.reader-review-active-avatars{display:inline-flex;align-items:center;margin-left:1px}
.reader-review-active-avatars>span{display:grid;width:20px;height:20px;place-items:center;border-radius:999px;animation:reader-review-avatar-float .9s ease-in-out infinite}
.reader-review-active-avatars .reader-avatar-badge{width:18px;height:18px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green));font-size:8px}
.reader-review-active-avatars .reader-avatar-badge.is-image{background:transparent}
.reader-review-menu{position:absolute;right:8px;bottom:calc(100% + 8px);z-index:30;display:grid;gap:4px;width:238px;padding:8px;border:1px solid rgba(40,35,29,.12);border-radius:14px;background:#fffdf8;box-shadow:0 16px 42px rgba(40,35,29,.16);font-family:ui-sans-serif,system-ui,sans-serif;transform-origin:bottom right}
.reader-review-menu>button{display:grid;width:100%;grid-template-columns:20px 30px minmax(0,1fr);align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);cursor:pointer;padding:8px;text-align:left}
.reader-review-menu>button:hover,.reader-review-menu>button.is-selected{background:#f0eadf}
.reader-review-menu button:disabled{cursor:not-allowed;opacity:.54}
.reader-review-menu-check{display:grid;width:18px;height:18px;place-items:center;border:1px solid rgba(40,35,29,.16);border-radius:999px;color:var(--reader-red)}
.reader-review-menu .reader-avatar-badge{width:28px;height:28px;overflow:hidden;border-radius:999px;background:var(--reader-green);font-size:10px}
.reader-review-menu>button>span:last-child{display:grid;min-width:0;gap:2px}
.reader-review-menu strong{overflow:hidden;font-size:12px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
.reader-review-menu em{overflow:hidden;color:var(--reader-muted);font-size:11px;font-style:normal;font-weight:760;text-overflow:ellipsis;white-space:nowrap}
.reader-review-menu footer{display:flex;align-items:center;justify-content:flex-end;gap:7px;margin:4px -2px -2px;padding:8px 2px 0;border-top:1px solid rgba(40,35,29,.1)}
.reader-review-menu footer button{display:inline-flex;width:auto;height:30px;align-items:center;justify-content:center;border:0;border-radius:999px;background:#e7dac9;color:var(--reader-ink);cursor:pointer;font:inherit;font-size:11px;font-weight:860;padding:0 11px}
.reader-review-menu footer button:last-child{background:var(--reader-ink);color:#fffaf0}
.reader-review-menu footer button:disabled{cursor:not-allowed;opacity:.48}
.reader-note-review-burst{position:absolute;inset:0;z-index:6;overflow:visible;pointer-events:none}
.reader-note-review-burst .reader-completion-burst{position:absolute;inset:0;overflow:visible}
.reader-note-review-burst .reader-completion-burst-center{left:50%;top:44%;transform:scale(.58)}
.reader-note-toolbar .reader-delete-note{height:26px;margin-right:0;padding:0 8px;font-size:11px}
.reader-delete-annotation{position:absolute;right:0;top:50%;z-index:2;display:inline-flex;min-width:88px;height:32px;align-items:center;justify-content:center;gap:5px;border-radius:999px;background:#fffdf8;box-shadow:0 0 0 1px rgba(255,253,248,.9),0 5px 16px rgba(40,35,29,.1);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:820;opacity:0;padding:0 11px;pointer-events:none;transform:translateY(calc(-50% + 2px));transition:background .14s ease,box-shadow .14s ease,opacity .14s ease,transform .14s ease}
.reader-note:hover .reader-delete-annotation,.reader-delete-annotation:focus-visible,.reader-delete-annotation.is-holding{opacity:1;pointer-events:auto;transform:translateY(-50%)}
.reader-annotation-connection{position:fixed;inset:0;z-index:4;width:100vw;height:100vh;overflow:visible;pointer-events:none}
.reader-annotation-connection-line{fill:none;stroke-width:2.15;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 4px 8px rgba(55,42,24,.18));opacity:.9}
.reader-annotation-arrowhead{fill:none;stroke-width:2.15;stroke-linecap:round;stroke-linejoin:round;opacity:.94}
.reader-note-anchor>span{padding:0;margin:0;background:transparent;border-radius:0}
.reader-note-card-header{display:block}
.reader-note-card-header .reader-note-quote{margin-top:0}
.reader-note-owner{display:grid;width:30px;height:30px;place-items:center;flex:0 0 auto;border:0;border-radius:999px;background:transparent;color:inherit;padding:0}
.reader-note-owner .reader-avatar-badge{width:30px;height:30px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green))}
.reader-note-owner .reader-avatar-badge.is-image{background:transparent}
.reader-note-meta{display:grid;grid-template-columns:30px minmax(0,1fr) auto;min-width:0;align-items:center;gap:9px;margin-top:14px;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-note-meta-copy{display:block;min-width:0}
.reader-note-meta strong{overflow:hidden;color:var(--reader-ink);font-size:13px;font-weight:880;text-overflow:ellipsis;white-space:nowrap}
.reader-note-time-actions{position:relative;display:grid;min-width:88px;justify-items:end}
.reader-note-meta time{margin-left:auto;color:#8d8378;font-size:11px;font-weight:760;font-variant-numeric:tabular-nums;white-space:nowrap;transition:opacity .14s ease}
.reader-note:hover .reader-note-time-actions time,.reader-note-time-actions:has(.reader-delete-annotation:focus-visible) time,.reader-note-time-actions:has(.reader-delete-annotation.is-holding) time{opacity:0;pointer-events:none}
.reader-comment-count{display:inline-flex;align-items:center;gap:6px;min-width:0;color:inherit;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:820;font-variant-numeric:tabular-nums;white-space:nowrap}
.reader-note-type,.reader-note-intent{display:inline-flex;width:fit-content;align-items:center;gap:4px;border:1px solid rgba(159,91,80,.16);border-radius:999px;background:rgba(159,91,80,.07);color:var(--reader-red);font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:850;line-height:1;padding:4px 7px;white-space:nowrap}
.reader-note-intent{border-color:rgba(37,29,22,.12);background:rgba(37,29,22,.06);color:#6f6258}
.reader-note-quote{display:grid;width:100%;gap:5px;padding:0;border:0;background:transparent;color:var(--reader-ink);cursor:pointer;font-family:Charter,Georgia,Cambria,"Times New Roman",serif;text-align:left;text-decoration:none}
.reader-note-quote:hover .reader-note-quote-text{color:var(--reader-red)}
.reader-note-quote-mark{display:block;color:var(--reader-note-accent);font-family:Georgia,Cambria,"Times New Roman",serif;font-size:28px;font-style:normal;font-weight:900;line-height:.78}
.reader-note-quote-text{display:block;color:var(--reader-ink);font-size:13px;font-style:italic;font-weight:760;line-height:1.62;text-wrap:pretty;transition:color .14s ease}
.reader-thought-author-stack{display:inline-flex;min-width:0;align-items:center}
.reader-thought-author-avatar{display:grid;width:25px;height:25px;place-items:center;border-radius:999px;background:transparent}
.reader-thought-author-avatar+.reader-thought-author-avatar{margin-left:-8px}
.reader-thought-author-avatar .reader-avatar-badge{width:23px;height:23px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green));font-size:10px}
.reader-thought-author-avatar .reader-avatar-badge.is-image{background:transparent}
.reader-thought-author-more{display:grid;min-width:25px;height:25px;place-items:center;margin-left:-8px;border:2px solid rgba(255,253,248,.92);border-radius:999px;background:#eee6db;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:10px;font-weight:900;font-variant-numeric:tabular-nums}
.reader-pending-agent-stack{display:inline-flex;min-width:0;align-items:center}
.reader-pending-agent-avatar{position:relative;display:grid;width:25px;height:25px;place-items:center;border-radius:999px;background:transparent}
.reader-pending-agent-avatar+.reader-pending-agent-avatar{margin-left:-8px}
.reader-pending-agent-avatar::after{content:"";position:absolute;right:1px;bottom:1px;width:7px;height:7px;border:2px solid rgba(255,253,248,.94);border-radius:999px;background:var(--reader-avatar-color,var(--reader-green));box-shadow:0 0 0 0 color-mix(in srgb,var(--reader-avatar-color,var(--reader-green)) 28%,transparent);animation:reader-pending-agent-pulse 1.24s ease-in-out infinite}
.reader-pending-agent-avatar .reader-avatar-badge{width:23px;height:23px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green));font-size:10px;filter:saturate(.82);opacity:.78}
.reader-pending-agent-avatar .reader-avatar-badge.is-image{background:transparent}
.reader-pending-agent-more{display:grid;min-width:25px;height:25px;place-items:center;margin-left:-8px;border:2px solid rgba(255,253,248,.92);border-radius:999px;background:#eee6db;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:10px;font-weight:900;font-variant-numeric:tabular-nums}
.reader-note-comments-region{width:100%;margin-top:0}
.reader-note-comments-panel{display:grid;grid-template-rows:auto auto;min-height:0;overflow:visible;gap:0;border-top:1px solid rgba(40,35,29,.1);background:rgba(250,246,238,.86);padding:12px}
.reader-note-comments-panel>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:8px;border-bottom:1px dashed rgba(40,35,29,.14);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-note-comments-panel>header>div{display:flex;align-items:baseline;gap:7px;min-width:0}
.reader-note-comments-panel>header strong{font-size:13px;font-weight:900}
.reader-note-comments-panel>header span{color:var(--reader-muted);font-size:11px;font-weight:800}
.reader-note-comments-panel>header button{display:inline-flex;align-items:center;gap:4px;height:26px;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);cursor:pointer;font:inherit;font-size:11px;font-weight:850;padding:0 8px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-note-comments-panel>header button:hover{background:#f0e3cd;color:var(--reader-ink)}
.reader-note-comments-panel>header button:active{transform:scale(.96)}
.reader-note-comments-panel .reader-comments{display:grid;gap:8px;min-height:0;overflow:visible;margin:0 -4px 0 0;padding:0 4px 0 0}
.reader-note-comments-panel .reader-comment{grid-template-columns:32px minmax(0,1fr);width:100%;min-width:0}
.reader-discussion-thread{position:relative;z-index:0;display:grid;width:100%;overflow:visible;border:1px solid rgba(40,35,29,.1);border-radius:8px;background:rgba(255,253,248,.78);box-shadow:0 1px 3px rgba(40,35,29,.04)}
.reader-note-comments-panel .reader-comments:has(.reader-agent-menu),.reader-note-comments-panel .reader-comments:has(.reader-comment-agent-more-menu),.reader-discussion-thread:has(.reader-agent-menu),.reader-discussion-thread:has(.reader-comment-agent-more-menu),.reader-thread-detail:has(.reader-agent-menu),.reader-thread-detail:has(.reader-comment-agent-more-menu){overflow:visible}
.reader-discussion-thread:has(.reader-agent-menu),.reader-discussion-thread:has(.reader-comment-agent-more-menu){z-index:20}
.reader-discussion-thread.is-open{grid-template-rows:auto auto auto;border-color:rgba(40,35,29,.16);background:rgba(255,252,246,.96);box-shadow:0 8px 22px rgba(55,42,24,.08)}
.reader-thought-summary-wrap{position:relative;min-width:0}
.reader-thought-summary{display:grid;width:100%;min-height:0;grid-template-columns:34px minmax(0,1fr);align-items:start;gap:10px;border:0;background:transparent;color:inherit;font:inherit;padding:13px 14px 12px;text-align:left}
.reader-thought-summary:focus-visible{outline:2px solid rgba(37,29,22,.22);outline-offset:-2px}
.reader-thought-owner{display:grid;width:34px;height:34px;place-items:center;border-radius:999px;background:transparent}
.reader-thought-owner .reader-avatar-badge,.reader-thought-summary .reader-avatar-badge{width:30px;height:30px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green))}
.reader-thought-owner .reader-avatar-badge.is-image,.reader-thought-summary .reader-avatar-badge.is-image{background:transparent}
.reader-thought-summary-copy{display:grid;min-width:0;gap:8px}
.reader-thought-summary-meta{display:grid;grid-template-columns:minmax(0,1fr) auto;min-width:0;align-items:center;gap:10px}
.reader-thought-summary-meta strong{display:block;overflow:hidden;color:var(--reader-ink);font-size:13px;font-weight:880;line-height:1.18;text-overflow:ellipsis;white-space:nowrap}
.reader-thought-time{color:#8d8378;font-size:11px;font-weight:760;font-variant-numeric:tabular-nums;line-height:1.1;white-space:nowrap}
.reader-thought-summary .reader-comment-markdown{color:#3f352c}
.reader-thought-summary .reader-markdown-content,.reader-thought-summary .reader-markdown-content p{font-size:13px;font-weight:720;line-height:1.62}
.reader-thought-footer{position:relative;z-index:1;display:flex;min-height:44px;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:8px 14px;border-top:1px solid rgba(40,35,29,.1);background:rgba(250,246,238,.76)}
.reader-replies-toggle,.reader-replies-label{display:inline-flex;align-items:center;gap:6px;height:28px;border:0;background:transparent;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:820;font-variant-numeric:tabular-nums;padding:0}
.reader-replies-toggle{cursor:pointer;transition:color .14s ease}
.reader-replies-toggle:hover{color:var(--reader-red)}
.reader-replies-label{cursor:default}
.reader-thought-footer-actions{display:inline-flex;min-width:0;align-items:center;justify-content:flex-end;gap:10px;margin-left:auto}
.reader-thought-review-status{display:inline-flex;min-width:0;align-items:center;gap:6px;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:850}
.reader-replies-toggle .reader-thought-review-status,.reader-replies-label .reader-thought-review-status{margin-left:3px}
.reader-thought-reviewer-stack,.reader-thought-review-motion{display:inline-flex;min-width:0;align-items:center}
.reader-thought-reviewer-stack>span,.reader-thought-review-motion>span{display:grid;width:22px;height:22px;place-items:center;border-radius:999px;background:transparent}
.reader-thought-reviewer-stack>span+span{margin-left:-7px}
.reader-thought-reviewer-stack .reader-avatar-badge,.reader-thought-review-motion .reader-avatar-badge{width:20px;height:20px;overflow:hidden;border-radius:999px;background:var(--reader-avatar-color,var(--reader-green));font-size:8px}
.reader-thought-reviewer-stack .reader-avatar-badge.is-image,.reader-thought-review-motion .reader-avatar-badge.is-image{background:transparent}
.reader-thought-review-motion{gap:4px}
.reader-thought-review-motion>span{animation:reader-review-avatar-travel var(--reviewer-duration) ease-in-out infinite;animation-delay:calc(var(--reviewer-index) * 120ms)}
.reader-delete-thought{position:absolute;right:10px;top:10px;z-index:1;height:24px;margin:0;padding:0 8px;border-radius:999px;background:rgba(255,253,248,.84);box-shadow:0 0 0 1px rgba(255,253,248,.76),0 3px 10px rgba(40,35,29,.08);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-size:10px;opacity:0;pointer-events:none;transform:translateY(2px);transition:background .14s ease,box-shadow .14s ease,opacity .14s ease,transform .14s ease}
.reader-discussion-thread:hover .reader-delete-thought,.reader-delete-thought:focus-visible,.reader-delete-thought.is-holding{opacity:1;pointer-events:auto;transform:translateY(0)}
.reader-thread-detail::-webkit-scrollbar{width:7px}
.reader-thread-detail::-webkit-scrollbar-track{background:transparent}
.reader-thread-detail::-webkit-scrollbar-thumb{border:2px solid rgba(255,252,246,.9);border-radius:999px;background:rgba(154,143,131,.32)}
.reader-thread-detail{display:grid;max-height:min(46vh,420px);min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;gap:0;padding:0 14px 12px}
.reader-thread-detail:hover::-webkit-scrollbar-thumb{background:rgba(154,143,131,.48)}
.reader-thread-replies{position:relative;display:grid;gap:0;margin-left:13px;padding-left:22px;border-left:2px solid rgba(199,164,94,.38)}
.reader-thread-replies .reader-comment{position:relative;padding:10px 0;border-radius:0;background:transparent}
.reader-thread-replies .reader-comment::before{content:"";position:absolute;left:-27px;top:21px;width:8px;height:8px;border:2px solid rgba(199,164,94,.82);border-radius:999px;background:rgba(255,252,246,.96)}
.reader-comment.is-reply{grid-template-columns:28px minmax(0,1fr)}
.reader-comment.is-reply .reader-avatar-badge{width:26px;height:26px}
.reader-thread-reply-composer{display:flex;min-width:0;justify-content:flex-end}
.reader-thought-footer-actions:has(.reader-inline-composer-panel){flex:1 0 100%;width:100%;align-items:flex-start;justify-content:stretch;margin-left:0}
.reader-thread-reply-composer:has(.reader-inline-composer-panel){flex:1 0 100%;justify-content:stretch;margin-top:8px}
.reader-thread-reply-composer .reader-inline-composer-panel{width:100%}
.reader-pending-thoughts{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;margin:8px 0 0;padding:11px 12px 13px;overflow:hidden;border:1px solid rgba(40,35,29,.1);border-radius:8px;background:rgba(255,253,248,.72);box-shadow:0 1px 3px rgba(40,35,29,.04);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-pending-thoughts .reader-pending-agent-stack{align-self:start;padding-top:2px}
.reader-pending-thought-copy{display:grid;min-width:0;gap:3px}
.reader-pending-thought-copy strong{overflow:hidden;color:var(--reader-ink);font-size:13px;font-weight:880;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
.reader-pending-thought-copy em{color:var(--reader-muted);font-size:12px;font-style:normal;font-weight:720;line-height:1.4;text-wrap:pretty}
.reader-pending-thought-progress{position:absolute;left:0;right:0;bottom:0;height:3px;overflow:hidden;background:rgba(40,35,29,.08)}
.reader-pending-thought-progress i{display:block;width:42%;height:100%;border-radius:999px;background:linear-gradient(90deg,transparent,var(--reader-note-accent,var(--reader-green)),transparent);animation:reader-pending-thought-progress 1.38s cubic-bezier(.22,1,.36,1) infinite}
.reader-new-thought-composer{margin:10px -12px -12px;padding:12px;border-top:1px solid rgba(40,35,29,.1);background:rgba(250,246,238,.84)}
.reader-new-thought-composer.is-empty{margin-top:0}
.reader-inline-composer-trigger{display:inline-flex;width:fit-content;justify-self:center;align-items:center;justify-content:center;gap:6px;height:32px;border:1px solid rgba(40,35,29,.14);border-radius:999px;background:rgba(255,253,248,.82);color:var(--reader-muted);cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:850;padding:0 12px;box-shadow:0 4px 12px rgba(40,35,29,.05);transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,color .14s ease,transform .14s ease}
.reader-inline-composer-trigger:hover{border-color:rgba(40,35,29,.22);background:#f0e3cd;box-shadow:0 6px 16px rgba(40,35,29,.08);color:var(--reader-ink)}
.reader-inline-composer-trigger:active{transform:scale(.96)}
.reader-inline-composer-trigger:focus-visible{outline:2px solid rgba(37,29,22,.22);outline-offset:2px}
.reader-new-thought-composer .reader-inline-composer-trigger{width:100%;min-width:0;height:40px;border:1px dashed rgba(40,35,29,.18);border-radius:8px;background:rgba(255,253,248,.62)}
.reader-new-thought-composer .reader-inline-composer-trigger:hover{border-color:rgba(159,91,80,.18);background:#fffaf0;color:var(--reader-red)}
.reader-inline-composer-panel{position:relative;transform-origin:top left}
.reader-inline-composer-panel.t-dropdown{transform:scale(.98);transition:transform .18s cubic-bezier(.22,1,.36,1),opacity .18s cubic-bezier(.22,1,.36,1)}
.reader-inline-composer-panel.t-dropdown.is-open{transform:scale(1)}
.reader-note-comments-panel .reader-markdown-content,.reader-note-comments-panel .reader-markdown-content *{max-width:100%;min-width:0;overflow-wrap:anywhere;word-break:break-word}
.reader-comments-empty{border:1px dashed rgba(40,35,29,.14);border-radius:12px;background:rgba(255,253,248,.58);color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.4;padding:12px;text-align:center}
.reader-comment-markdown{position:relative}
.reader-comment-markdown.is-collapsed .reader-markdown-content{max-height:calc(1.66em * 4);overflow:hidden}
.reader-comment-markdown.is-collapsed::after{content:"";position:absolute;left:0;right:0;bottom:28px;height:34px;background:linear-gradient(to bottom,rgba(250,246,238,0),rgba(250,246,238,.96));pointer-events:none}
.reader-note-primary-comment .reader-comment-markdown.is-collapsed::after{background:linear-gradient(to bottom,rgba(255,253,248,0),rgba(255,253,248,.96))}
.reader-comment-expand{position:relative;z-index:1;width:fit-content;height:26px;margin-top:4px;border:0;border-radius:999px;background:rgba(37,29,22,.06);color:var(--reader-muted);cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:850;padding:0 9px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-comment-expand:hover{background:#f0e3cd;color:var(--reader-ink)}
.reader-comment-expand:active{transform:scale(.96)}
.reader-comment-author time{margin-left:auto;color:#9a8f83;font-size:10px;font-weight:760;white-space:nowrap}
.reader-comment-agent-tray{position:relative;display:flex;flex:0 1 auto;align-items:center;gap:8px;margin-right:auto;min-width:0;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:780}
.reader-comment-agent-tray button{display:grid;width:30px;height:30px;place-items:center;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:#fffdf8;color:var(--reader-muted);cursor:pointer;padding:0}
.reader-comment-agent-tray button:hover{background:#f0e3cd;color:var(--reader-ink)}
.reader-comment-agent-tray button:disabled{cursor:not-allowed;opacity:.45}
.reader-comment-agent-tray span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-comment-agent-tray .reader-comment-mention-label{display:grid;width:30px;height:30px;place-items:center;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:#fffdf8;color:var(--reader-muted);font-size:15px;font-weight:850}
.reader-comment-agent-tray .reader-comment-agent-avatar{padding:0}
.reader-comment-agent-tray .reader-avatar-badge{width:24px;height:24px}
.reader-comment-agent-more{position:relative}
.reader-comment-agent-more-menu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:5;display:grid;gap:4px;width:190px;padding:8px;border:1px solid rgba(40,35,29,.12);border-radius:14px;background:#fffdf8;box-shadow:0 16px 42px rgba(40,35,29,.14)}
.reader-comment-agent-more-menu button{display:grid;width:100%;height:36px;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);padding:0 8px;text-align:left}
.reader-comment-agent-more-menu button:hover{background:#f0eadf}
.reader-comment-agent-more-menu strong{overflow:hidden;font-size:12px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
.reader-comment-agent-more-menu em{color:var(--reader-muted);font-size:11px;font-style:normal;font-weight:760}
.reader-note-comments-panel .reader-comment-box textarea{min-height:68px;max-height:96px;margin-top:0}
.reader-composer textarea:focus,.reader-composer textarea:focus-visible,.reader-note-comments-panel .reader-comment-box textarea:focus,.reader-note-comments-panel .reader-comment-box textarea:focus-visible{outline:0;box-shadow:none}
.reader-note-footer .reader-shortcut-hint{flex:0 0 auto;margin-right:0}
.reader-note-footer .reader-add-comment{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;gap:4px;padding:7px 10px}
.reader-composer{width:min(520px,calc(100vw - 24px));padding:0;overflow:visible;border-color:rgba(40,35,29,.16);border-radius:20px;background:rgba(255,253,248,.98);box-shadow:0 22px 64px rgba(40,35,29,.18),0 0 0 1px rgba(255,255,255,.58) inset;transform-origin:24px 18px;animation:reader-composer-pop .22s cubic-bezier(.22,1,.36,1)}
.reader-composer-header{display:grid;gap:8px;padding:12px 14px 10px;border-bottom:1px solid rgba(40,35,29,.1);border-radius:19px 19px 0 0;background:rgba(255,253,248,.94);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-composer-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.reader-composer-title-row strong{font-size:14px;font-weight:900;letter-spacing:0}
.reader-composer-title-row .reader-shortcut-hint{margin-right:0}
.reader-composer-types{display:grid;grid-template-columns:72px repeat(5,minmax(58px,1fr));align-items:center;gap:6px;margin:0}
.reader-composer-group-label{color:var(--reader-muted);font-size:10px;font-weight:900;line-height:1;white-space:nowrap}
.reader-composer-types button{height:28px;min-width:0;overflow:hidden;padding:0 6px;text-overflow:ellipsis;white-space:nowrap;font-size:11px;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease}
.reader-reading-intent-icon{flex:0 0 auto}
.reader-annotation-type-icon{flex:0 0 auto}
.reader-composer-types button:active{transform:scale(.96)}
.reader-composer-editor{position:relative}
.reader-composer textarea{display:block;min-height:118px;margin:0;border:0;border-radius:0;background:rgba(255,253,247,.74);font-size:14px;padding:14px 15px}
.reader-composer-actions{margin:0;padding:12px 14px;border-top:1px solid rgba(37,29,22,.1);border-radius:0 0 19px 19px;background:rgba(250,243,230,.9)}
.reader-composer-actions button{display:inline-flex;height:32px;align-items:center;justify-content:center;gap:4px;padding:0 10px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-composer-actions button:active{transform:scale(.96)}
.reader-composer-agent-tray{display:flex;min-width:0;align-items:center;gap:6px;margin-right:auto}
.reader-composer-agent-tray>span{color:var(--reader-muted);font-size:16px;font-weight:900;line-height:1}
.reader-composer-actions .reader-composer-agent-tray button{position:relative;display:grid;width:28px;height:28px;place-items:center;border:0;border-radius:999px;background:transparent;color:inherit;padding:0}
.reader-composer-agent-tray button.is-active{box-shadow:0 0 0 2px rgba(37,29,22,.18)}
.reader-composer-agent-tray .reader-avatar-badge{width:28px;height:28px}
.reader-composer-agent-tray b{position:absolute;left:50%;bottom:calc(100% + 8px);display:grid;gap:1px;min-width:118px;transform:translateX(-50%);border:1px solid rgba(40,35,29,.12);border-radius:10px;background:#fffdf8;box-shadow:0 12px 28px rgba(40,35,29,.14);color:var(--reader-ink);font-size:11px;font-weight:850;line-height:1.25;padding:7px 8px;text-align:center;white-space:nowrap}
.reader-composer-agent-tray b em{color:var(--reader-muted);font-size:10px;font-style:normal;font-weight:760}
.reader-selection-menu,.reader-composer{z-index:120}
@keyframes reader-composer-pop{from{opacity:0;transform:translateY(-6px) scale(.88);filter:blur(2px)}to{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}
@keyframes reader-review-scale{0%,100%{transform:rotate(0deg) scale(1)}45%{transform:rotate(-8deg) scale(1.08)}70%{transform:rotate(5deg) scale(.98)}}
@keyframes reader-review-avatar-float{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.04)}}
@keyframes reader-review-avatar-travel{0%,100%{transform:translateX(-3px) translateY(0) scale(1)}50%{transform:translateX(4px) translateY(-2px) scale(1.04)}}
@keyframes reader-pending-agent-pulse{0%,100%{opacity:.52;box-shadow:0 0 0 0 color-mix(in srgb,var(--reader-avatar-color,var(--reader-green)) 28%,transparent)}50%{opacity:1;box-shadow:0 0 0 5px transparent}}
@keyframes reader-pending-thought-progress{0%{transform:translateX(-105%)}100%{transform:translateX(245%)}}
.reader-app :where(button,textarea,input,[tabindex]):focus-visible{outline:2px solid rgba(37,29,22,.42);outline-offset:3px}
.reader-app :where(.reader-composer textarea,.reader-note-comments-panel .reader-comment-box textarea):focus-visible{outline:0;box-shadow:none}
.reader-highlight{overflow:visible;background:transparent;box-shadow:none;mix-blend-mode:normal}
.reader-highlight.is-active{background:transparent;box-shadow:none}
.reader-highlight.is-active::after{content:"";position:absolute;inset:0 -1px;border-radius:4px;background:var(--highlight-fill,rgba(244,201,93,.16))}
.reader-highlight::before{content:"";position:absolute;z-index:1;left:min(var(--highlight-edge-size,0px),42%);right:min(var(--highlight-edge-size,0px),42%);bottom:var(--highlight-offset,-2px);height:var(--highlight-thickness,4px);border-radius:999px;background:var(--highlight-line,#f4c95d);opacity:var(--highlight-opacity,.78);-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 6' preserveAspectRatio='none'%3E%3Cpath d='M0 3 C4 0 8 6 12 3 S20 0 24 3' stroke='black' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 6' preserveAspectRatio='none'%3E%3Cpath d='M0 3 C4 0 8 6 12 3 S20 0 24 3' stroke='black' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");-webkit-mask-repeat:repeat-x;mask-repeat:repeat-x;-webkit-mask-size:24px 100%;mask-size:24px 100%;filter:drop-shadow(0 1px 0 rgba(255,253,248,.72))}
.reader-highlight.is-active::before{opacity:1;filter:drop-shadow(0 1px 0 rgba(255,253,248,.72)) drop-shadow(0 0 5px rgba(37,29,22,.2))}
.reader-highlight.is-filter-dimmed{cursor:default}.reader-highlight.is-filter-dimmed .reader-highlight-dots{opacity:.42}
.reader-highlight.is-temporary,.reader-highlight.is-agent-theater{background:transparent;box-shadow:none}
.reader-highlight-dots{position:absolute;z-index:2;bottom:var(--highlight-dot-offset,-3px);display:flex;gap:2px;align-items:center;pointer-events:none}
.reader-highlight-dots.is-start{left:0}
.reader-highlight-dots.is-end{right:0}
.reader-highlight-dots i{display:block;width:5px;height:5px;border:1px solid rgba(37,29,22,.14);border-radius:999px;box-shadow:0 1px 2px rgba(37,29,22,.14)}
.reader-highlight:focus-visible{outline:0;box-shadow:none}
.reader-highlight:focus-visible::before{opacity:1;filter:drop-shadow(0 1px 0 rgba(255,253,248,.72)) drop-shadow(0 0 6px rgba(37,29,22,.24))}
@media(prefers-reduced-motion:reduce){.t-dropdown{transition:none!important}.reader-app *{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}.reader-virtual-cursor{transition:none!important}.reader-virtual-cursor.is-leaving{animation:none!important;opacity:0}.reader-completion-burst{display:none!important}.reader-delete-note.is-holding::before{animation:none!important;width:100%}.reader-spinner{animation:none!important;border-top-color:rgba(23,63,44,.22)}}
@media(max-width:1320px){.reader-main{grid-template-columns:minmax(0,1fr)}.reader-toc-toggle{display:grid}}
.reader-app.is-annotation-stacked .reader-annotation-rail{position:relative;inset:auto;width:min(var(--reader-content-width),100%);display:grid;gap:14px;margin:16px auto 0;pointer-events:auto}
.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-empty,.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-note{position:relative;top:auto!important;left:auto!important;width:100%;pointer-events:auto}
.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-note{transform:none}
@media(max-width:1100px){.reader-surface{padding:32px 28px 64px}.reader-canvas{width:min(var(--reader-content-width),100%)}.reader-article{width:100%;max-width:100%;font-size:min(var(--reader-font-size),22px)}.reader-annotation-rail{position:relative;inset:auto;width:100%;display:grid;gap:14px;margin-top:16px;pointer-events:auto}.reader-annotation-rail>.reader-empty,.reader-annotation-rail>.reader-note{position:relative;top:auto!important;left:auto!important;width:100%!important;pointer-events:auto}.reader-annotation-rail>.reader-note{transform:none}.reader-note-comments-panel .reader-comments{margin:0;padding:2px 0}.reader-annotation-connection{display:none}}
@media(max-width:760px){.reader-toolbar{min-height:72px;padding:12px 14px}.reader-brand-mark{width:34px;height:34px;border-radius:9px;font-size:16px}.reader-brand-title{font-size:12px}.reader-brand-copy p{font-size:11px}.reader-toolbar-actions{gap:7px}.reader-agent-annotate{width:38px;padding:0;justify-content:center}.reader-agent-annotate{font-size:0}.reader-agent-annotate svg{width:18px;height:18px}.reader-surface{padding:20px 14px 46px}.reader-article{border-radius:18px;padding:28px 20px;font-size:min(var(--reader-font-size),20px);line-height:1.72}.reader-article-header h1{font-size:28px}.reader-composer{left:8px!important;width:calc(100vw - 16px)}.reader-composer-types{grid-template-columns:1fr repeat(5,minmax(0,1fr))}.reader-composer-group-label{grid-column:1/-1}.reader-app.is-toc-open .reader-toc{top:72px}.reader-responsive-scrim{inset:72px 0 0}}
.reader-app.has-toc .reader-main,.reader-app.has-toc.is-toc-open .reader-main{grid-template-columns:minmax(0,1fr)}
.reader-toc.is-empty{display:none}
.reader-app.has-toc .reader-toc{position:absolute;display:block;left:18px;top:84px;bottom:18px;z-index:30;width:min(320px,calc(100% - 36px));overflow:auto;padding:18px;border:1px solid rgba(40,35,29,.12);border-radius:8px;background:rgba(250,247,240,.96);box-shadow:0 18px 48px rgba(40,35,29,.14);opacity:0;visibility:hidden;pointer-events:none;transform:translateX(-12px);transition:opacity .2s ease,transform .2s ease,visibility .2s}
.reader-app.has-toc.is-toc-open .reader-toc{opacity:1;visibility:visible;pointer-events:auto;transform:translateX(0)}
.reader-toc-toggle:disabled{cursor:not-allowed;opacity:.42}
@media(max-width:760px){.reader-toolbar-article-action{display:none}.reader-toolbar-article-title{font-size:13px}.reader-toolbar-article-meta{font-size:11px}.reader-app.has-toc.is-toc-open .reader-toc{left:0;top:72px;bottom:0;width:min(320px,calc(100% - 32px));border-radius:0}.reader-app.has-toc.is-toc-open .reader-responsive-scrim{display:block}}
`;

export const readerStyles = `
:host{all:initial;color-scheme:light;--reader-bg:#f5f1e8;--reader-paper:#fffdf8;--reader-ink:#28231d;--reader-muted:#746d63;--reader-line:#e3dccf;--reader-green:#28231d;--reader-red:#9f5b50;--reader-yellow:#ead89d;--reader-yellow-strong:#c7a45e;font-family:Charter,Georgia,Cambria,"Times New Roman",serif}*{box-sizing:border-box}.reader-app{position:fixed;inset:0;z-index:2147483647;display:grid;grid-template-rows:auto 1fr;background:var(--reader-bg);color:var(--reader-ink)}.reader-toolbar{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:76px;padding:14px 28px;border-bottom:1px solid rgba(40,35,29,.1);background:rgba(255,253,248,.9);backdrop-filter:blur(14px)}.reader-brand{display:flex;align-items:center;gap:12px;min-width:0}.reader-brand-mark{display:block;width:38px;height:38px;flex:0 0 auto;border-radius:10px;object-fit:cover}.reader-brand-copy{display:grid;gap:3px;min-width:0}.reader-brand-title{color:var(--reader-ink);font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;font-weight:900;letter-spacing:.16em;line-height:1}.reader-brand-copy p{display:flex;align-items:center;gap:7px;margin:0;overflow:hidden;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:720;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}.reader-toolbar-actions{display:flex;align-items:center;gap:10px}.reader-close,.reader-icon-button{display:grid;width:38px;height:38px;place-items:center;border:1px solid rgba(40,35,29,.14);border-radius:999px;background:rgba(255,253,248,.84);color:var(--reader-ink);cursor:pointer}.reader-icon-button:hover,.reader-icon-button.is-active,.reader-close:hover{background:#f0eadf}.reader-settings-panel{position:fixed;right:28px;top:88px;z-index:6;width:280px;padding:14px;border:1px solid rgba(40,35,29,.14);border-radius:18px;background:rgba(255,253,248,.96);box-shadow:0 18px 48px rgba(40,35,29,.14);backdrop-filter:blur(16px);font-family:ui-sans-serif,system-ui,sans-serif}.reader-setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}.reader-setting-row+.reader-setting-row{border-top:1px solid rgba(37,29,22,.1)}.reader-setting-label{display:inline-flex;align-items:center;gap:8px;color:var(--reader-muted);font-size:13px;font-weight:720}.reader-stepper{display:inline-flex;align-items:center;overflow:hidden;border:1px solid rgba(37,29,22,.14);border-radius:999px;background:#fffdf7}.reader-stepper button{display:grid;width:30px;height:30px;place-items:center;border:0;background:transparent;color:var(--reader-muted);cursor:pointer}.reader-stepper button:hover{background:rgba(40,35,29,.06);color:var(--reader-green)}.reader-stepper strong{min-width:58px;color:var(--reader-ink);font-size:12px;text-align:center}.reader-main{min-height:0;display:grid;grid-template-columns:260px minmax(0,1fr) 360px}.reader-toc{min-width:0;overflow:auto;padding:42px 18px 48px 22px;border-right:1px solid rgba(40,35,29,.08);background:rgba(250,247,240,.62);font-family:ui-sans-serif,system-ui,sans-serif}.reader-toc.is-empty{visibility:hidden}.reader-toc-title{margin:0 0 12px;color:var(--reader-green);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.reader-toc-item{display:block;width:100%;margin:2px 0;border:0;border-radius:10px;background:transparent;color:var(--reader-muted);cursor:pointer;font:inherit;font-size:13px;line-height:1.35;padding:7px 8px;text-align:left}.reader-toc-item:hover{background:rgba(255,253,248,.82);color:var(--reader-ink)}.reader-toc-item[data-depth="2"]{padding-left:20px}.reader-toc-item[data-depth="3"]{padding-left:32px}.reader-toc-item[data-depth="4"]{padding-left:44px}.reader-surface{min-width:0;overflow:auto;padding:42px 48px 84px}.reader-canvas{position:relative;width:min(var(--reader-content-width),100%);margin:0 auto}.reader-article{position:relative;z-index:1;padding:56px 64px;border:1px solid rgba(40,35,29,.1);border-radius:22px;background:rgba(255,253,248,.96);box-shadow:0 18px 54px rgba(40,35,29,.1);font-size:var(--reader-font-size);line-height:1.78;overflow-wrap:anywhere;word-break:break-word}.reader-article-header{margin-bottom:42px;padding-bottom:28px;border-bottom:1px solid rgba(40,35,29,.1)}.reader-article-header h1{margin:0;color:var(--reader-ink);font-size:36px;letter-spacing:0;line-height:1.18}.reader-article-header p{margin:14px 0 0;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.5}.reader-article *{max-width:100%;min-width:0;overflow-wrap:anywhere}.reader-article-body{color:var(--reader-ink);text-wrap:pretty}.reader-article-body>:first-child{margin-top:0}.reader-article-body>:last-child{margin-bottom:0}.reader-article-body p{margin:0 0 1.05em}.reader-article-body h1,.reader-article-body h2,.reader-article-body h3,.reader-article-body h4,.reader-article-body h5,.reader-article-body h6{margin:1.65em 0 .65em;color:var(--reader-ink);font-family:ui-sans-serif,system-ui,sans-serif;font-weight:860;letter-spacing:0;line-height:1.28;text-wrap:balance}.reader-article-body h1{font-size:1.52em}.reader-article-body h2{font-size:1.28em}.reader-article-body h3{font-size:1.14em}.reader-article-body h4,.reader-article-body h5,.reader-article-body h6{font-size:1em}.reader-article-body strong,.reader-article-body b{color:var(--reader-ink);font-weight:850}.reader-article-body hr{height:1px;margin:1.35em 0 .8em;border:0;background:rgba(40,35,29,.52)}.reader-article-body ul,.reader-article-body ol{margin:1em 0 1em 1.35em;padding:0}.reader-article-body li{margin:.35em 0}.reader-article-body figure{margin:1em 0}.reader-article-body figcaption{margin:.45em 0 0;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:.72em;line-height:1.4}.reader-article img,.reader-article video,.reader-article iframe{max-width:100%;height:auto;border-radius:14px}.reader-article pre{overflow:auto;padding:18px;border-radius:16px;background:#24211d;color:#fbf6ec}.reader-article table{display:block;max-width:100%;overflow-x:auto}.reader-article blockquote{margin-left:0;padding-left:22px;border-left:4px solid var(--reader-yellow);color:#574f45}.reader-article a,.reader-markdown a{color:inherit;text-decoration:underline;text-decoration-color:rgba(40,35,29,.32);text-decoration-thickness:1px;text-underline-offset:.16em}.reader-article a:hover,.reader-markdown a:hover{color:var(--reader-red);text-decoration-color:currentColor}.reader-highlight-layer{position:absolute;inset:0;z-index:3;pointer-events:none}.reader-highlight{position:absolute;border:0;border-radius:4px;background:rgba(234,216,157,.34);box-shadow:0 0 0 1px rgba(199,164,94,.18);cursor:pointer;mix-blend-mode:multiply;padding:0;pointer-events:auto}.reader-highlight.is-active{background:rgba(234,216,157,.5);box-shadow:0 0 0 2px rgba(40,35,29,.38)}.reader-highlight.is-temporary{background:rgba(77,155,114,.16);box-shadow:0 0 0 1px rgba(77,155,114,.22);pointer-events:none}.reader-highlight.is-agent-theater{background:rgba(77,155,114,.2);box-shadow:0 0 0 1px rgba(77,155,114,.24);pointer-events:none}.reader-selection-menu{position:absolute;z-index:5;padding:5px;border-radius:999px;background:rgba(39,36,32,.92);box-shadow:0 12px 34px rgba(37,29,22,.28)}.reader-selection-menu button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;border:0;border-radius:999px;background:transparent;color:#fff8e8;cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;font-weight:750;padding:0 12px}.reader-virtual-cursor{position:fixed;z-index:7;display:flex;align-items:center;gap:8px;pointer-events:none;transform:translate(-4px,-4px);transition:left .42s ease,top .42s ease}.reader-virtual-pointer{width:0;height:0;border-left:13px solid var(--reader-green);border-top:9px solid transparent;border-bottom:9px solid transparent;filter:drop-shadow(0 4px 8px rgba(40,35,29,.18));transform:rotate(-18deg)}.reader-virtual-label{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(40,35,29,.14);border-radius:999px;background:rgba(255,253,248,.96);box-shadow:0 10px 28px rgba(40,35,29,.14);color:var(--reader-green);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:820;padding:6px 10px;white-space:nowrap}.reader-virtual-label span{display:grid;width:22px;height:22px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:11px}.reader-virtual-cursor.is-offscreen .reader-virtual-pointer{opacity:.45}.reader-virtual-cursor.is-leaving{animation:reader-cursor-leave .9s ease forwards}@keyframes reader-cursor-leave{to{opacity:0;transform:translate(18px,-24px) scale(.86);filter:blur(2px)}}.reader-notes{min-width:0;overflow:auto;padding:28px 22px 48px;border-left:1px solid rgba(40,35,29,.1);background:rgba(250,247,240,.78)}.reader-notes-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;margin:-28px -22px 18px;padding:18px 22px;background:rgba(250,247,240,.94);backdrop-filter:blur(14px);font-family:ui-sans-serif,system-ui,sans-serif}.reader-notes-actions{display:flex;align-items:center;gap:8px}.reader-notes-actions span{display:grid;min-width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:12px}.reader-agent-annotate{display:inline-flex;align-items:center;gap:6px;height:30px;border:1px solid rgba(40,35,29,.14);border-radius:999px;background:rgba(255,253,248,.84);color:var(--reader-green);cursor:pointer;font:inherit;font-size:12px;font-weight:800;padding:0 10px}.reader-agent-annotate:hover,.reader-agent-annotate.is-active{background:#f0eadf}.reader-agent-annotate:disabled{cursor:not-allowed;opacity:.55}.reader-agent-annotate-menu{display:grid;gap:6px;margin:-6px 0 14px;padding:10px;border:1px solid rgba(37,29,22,.12);border-radius:16px;background:rgba(255,250,240,.92);box-shadow:0 12px 36px rgba(55,42,24,.1);font-family:ui-sans-serif,system-ui,sans-serif}.reader-agent-annotate-menu button{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:8px;border:0;border-radius:11px;background:transparent;color:var(--reader-ink);cursor:pointer;padding:8px;text-align:left}.reader-agent-annotate-menu button:hover{background:#f0e3cd}.reader-agent-annotate-menu button:disabled{cursor:not-allowed;opacity:.65}.reader-agent-annotate-menu button>span{display:grid;width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:12px;font-weight:800}.reader-agent-annotate-menu em{color:var(--reader-muted);font-size:12px;font-style:normal}.reader-empty,.reader-note{margin-bottom:14px;padding:16px;border:1px solid rgba(40,35,29,.1);border-radius:16px;background:rgba(255,253,248,.88);box-shadow:0 8px 24px rgba(40,35,29,.07)}.reader-empty strong,.reader-note-anchor{font-family:ui-sans-serif,system-ui,sans-serif;font-weight:750}.reader-empty p,.reader-muted{margin:8px 0 0;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;line-height:1.6}.reader-note.is-active{border-color:rgba(40,35,29,.34);box-shadow:0 0 0 3px rgba(40,35,29,.08),0 8px 24px rgba(40,35,29,.07)}.reader-note-anchor{width:100%;border:0;background:transparent;color:var(--reader-ink);cursor:pointer;font-size:14px;line-height:1.5;padding:0;text-align:left}.reader-note-anchor span{display:inline-flex;align-items:center;margin:0 6px 6px 0;border-radius:999px;background:rgba(40,35,29,.08);color:var(--reader-green);font-size:12px;font-weight:800;padding:3px 8px}.reader-comments{margin-top:12px}.reader-comment{display:grid;grid-template-columns:32px 1fr;gap:9px;margin-top:10px;font-family:ui-sans-serif,system-ui,sans-serif}.reader-comment span{display:grid;width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:11px}.reader-comment p{margin:0;color:#3f352c;font-size:13px;line-height:1.55}.reader-avatar-badge img{width:100%;height:100%;object-fit:cover;border-radius:999px}.reader-spinner{display:inline-block;width:12px;height:12px;margin-left:6px;vertical-align:-2px;border:2px solid rgba(40,35,29,.2);border-top-color:var(--reader-green);border-radius:999px;animation:reader-spin .8s linear infinite}@keyframes reader-spin{to{transform:rotate(360deg)}}.reader-comment-box{position:relative}.reader-note textarea,.reader-composer textarea{width:100%;min-height:74px;resize:vertical;margin-top:12px;padding:10px 12px;border:1px solid rgba(40,35,29,.14);border-radius:12px;background:#fffdf8;color:var(--reader-ink);font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;line-height:1.5;outline:none}.reader-composer textarea{margin-top:0}.reader-agent-menu{position:absolute;left:0;right:0;bottom:calc(100% - 8px);z-index:4;display:grid;gap:4px;padding:8px;border:1px solid rgba(40,35,29,.12);border-radius:14px;background:#fffdf8;box-shadow:0 16px 42px rgba(40,35,29,.14)}.reader-agent-menu button{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;cursor:pointer;padding:7px;text-align:left}.reader-agent-menu button:hover{background:#f0eadf}.reader-agent-menu em{color:var(--reader-muted);font-size:12px;font-style:normal}.reader-add-comment,.reader-composer-actions button{border:0;border-radius:999px;cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:760}.reader-delete-note{display:inline-flex;align-items:center;gap:5px;margin-right:auto;border:0;background:transparent;color:#8a3f32;cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:760}.reader-delete-confirm{display:inline-flex;align-items:center;gap:6px;margin-right:auto;color:#6b5d50;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px}.reader-delete-confirm button{border:0;border-radius:999px;background:#eadfce;color:#4c4137;cursor:pointer;font:inherit;font-weight:760;padding:6px 9px}.reader-delete-confirm button:last-child{background:#8a3f32;color:white}.reader-add-comment{padding:9px 13px;background:var(--reader-green);color:white}.reader-note-footer,.reader-composer-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:10px}.reader-shortcut-hint{display:inline-flex;align-items:center;gap:5px;margin-right:auto;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px}.reader-kbd{display:inline-flex;min-width:20px;height:20px;align-items:center;justify-content:center;border:1px solid rgba(40,35,29,.16);border-bottom-color:rgba(40,35,29,.28);border-radius:6px;background:#fffdf8;box-shadow:0 1px 0 rgba(40,35,29,.14);color:#4c4137;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:10px;font-weight:750;line-height:1;padding:0 5px}.reader-composer{position:absolute;z-index:5;width:340px;padding:14px;border:1px solid rgba(40,35,29,.14);border-radius:18px;background:rgba(255,253,248,.98);box-shadow:0 22px 64px rgba(40,35,29,.18)}.reader-quote{max-height:92px;overflow:auto;padding:10px 12px;border-left:4px solid var(--reader-yellow-strong);background:rgba(234,216,157,.18);color:#3f352c;font-size:13px;line-height:1.5}.reader-composer-actions button{padding:9px 13px;background:#e6dbc8;color:var(--reader-ink)}.reader-composer-actions button:last-child{background:var(--reader-green);color:white}@media(max-width:980px){.reader-main{grid-template-columns:1fr}.reader-toc{display:none}.reader-notes{position:fixed;right:14px;bottom:14px;width:min(380px,calc(100vw - 28px));max-height:42vh;border:1px solid rgba(40,35,29,.14);border-radius:22px;box-shadow:0 18px 54px rgba(40,35,29,.16)}.reader-surface{padding:24px 18px 220px}.reader-article{padding:34px 24px;font-size:18px}.reader-toolbar{padding:12px 16px}}
.reader-selection-menu{display:inline-flex;align-items:center;gap:4px}
.reader-surface-frame{position:relative;min-width:0;min-height:0;overflow:hidden}
.reader-surface-frame>.reader-surface{height:100%}
.reader-edge-blur{position:absolute;left:0;right:0;z-index:120;height:38px;overflow:hidden;pointer-events:none}
.reader-edge-blur.is-top{top:0}.reader-edge-blur.is-bottom{bottom:0}
.reader-edge-blur::before,.reader-edge-blur span{position:absolute;inset:0}
.reader-edge-blur::before{content:"";z-index:1;background:linear-gradient(to bottom,rgba(245,241,232,.82),rgba(245,241,232,0))}
.reader-edge-blur.is-bottom::before{background:linear-gradient(to top,rgba(245,241,232,.82),rgba(245,241,232,0))}
.reader-edge-blur span{z-index:2;backdrop-filter:blur(var(--reader-edge-blur-radius));-webkit-backdrop-filter:blur(var(--reader-edge-blur-radius));-webkit-mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%);mask-image:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%)}
.reader-edge-blur.is-bottom span{-webkit-mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%);mask-image:linear-gradient(to top,#000 0%,rgba(0,0,0,.82) 36%,transparent 100%)}
.reader-edge-blur span:nth-child(1){--reader-edge-blur-radius:1px;opacity:.82}.reader-edge-blur span:nth-child(2){--reader-edge-blur-radius:3px;opacity:.58}.reader-edge-blur span:nth-child(3){--reader-edge-blur-radius:6px;opacity:.36}.reader-edge-blur span:nth-child(4){--reader-edge-blur-radius:10px;opacity:.2}
`;

export const readerDesktopEmbeddedStyles = `
.source-reader-shell{grid-template-rows:minmax(0,1fr);padding:0}
.reader-app{color-scheme:light;--reader-bg:#f5f1e8;--reader-paper:#fffdf8;--reader-ink:#28231d;--reader-muted:#746d63;--reader-line:#e3dccf;--reader-green:#28231d;--reader-red:#9f5b50;--reader-yellow:#ead89d;--reader-yellow-strong:#c7a45e;font-family:Charter,Georgia,Cambria,"Times New Roman",serif}
.reader-brand-mark{display:grid;place-items:center;background:var(--reader-ink);color:var(--reader-paper);font-family:ui-sans-serif,system-ui,sans-serif;font-size:18px;font-weight:950;line-height:1}
.reader-app.is-embedded{position:relative;inset:auto;z-index:0;width:100%;height:100%;min-height:0;overflow:hidden;border-radius:8px}
.reader-app.is-embedded .reader-settings-panel{position:absolute}
.reader-app.is-embedded .reader-agent-annotate-popover{position:absolute}
.reader-app.is-embedded .reader-agent-annotate-scrim{position:absolute}
.reader-app.is-embedded .reader-responsive-scrim{position:absolute}
.reader-app.is-embedded .reader-annotation-connection{position:absolute;width:100%;height:100%}
.reader-app.is-embedded .reader-completion-burst{position:absolute}
.reader-app.is-embedded .reader-agent-dock{position:absolute}
.reader-toolbar-article{display:flex;align-items:center;gap:12px;min-width:0;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-toolbar-article-copy{display:grid;gap:5px;min-width:0}
.reader-toolbar-article-title{overflow:hidden;color:var(--reader-ink);font-size:15px;font-weight:920;line-height:1.18;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta{display:flex;align-items:center;gap:8px;min-width:0;margin:0;color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.25}
.reader-toolbar-article-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta span+span::before{content:"";display:inline-block;width:4px;height:4px;margin-right:8px;border-radius:999px;background:rgba(40,35,29,.24);vertical-align:2px}
.reader-toolbar-article-action{display:flex;flex:0 0 auto;align-items:center;gap:8px}
.reader-toolbar-article-action .open-article-button.is-icon-only{--annotation-control-size:30px;border-color:rgba(40,35,29,.14);background:rgba(255,253,248,.84);color:var(--reader-ink)}
.reader-toolbar-article-action .open-article-button.is-icon-only:hover{background:#f0eadf}
	.reader-app.is-embedded.has-toc .reader-toc{position:absolute}
@media(max-width:760px){.reader-toolbar-article-action{display:none}.reader-toolbar-article-title{font-size:13px}.reader-toolbar-article-meta{font-size:11px}}
`;
