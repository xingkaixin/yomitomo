export const readerConversationStyles = `
.reader-main{grid-template-columns:minmax(0,1fr)}
.reader-brand{min-width:0}
.reader-toolbar-article{display:flex;flex:1 1 auto;align-items:center;gap:12px;min-width:0;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-toolbar-article-copy{display:grid;gap:5px;min-width:0}
.reader-toolbar-article-title{overflow:hidden;color:var(--reader-ink);font-size:15px;font-weight:920;line-height:1.18;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta{display:flex;align-items:center;gap:8px;min-width:0;margin:0;color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.25}
.reader-toolbar-article-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta span+span::before{content:"";display:inline-block;width:4px;height:4px;margin-right:8px;border-radius:999px;background:rgba(40,35,29,.24);vertical-align:2px}
.reader-toolbar-article-action{display:flex;flex:0 0 auto;align-items:center;gap:8px}
.reader-toolbar-current-view{display:inline-flex;height:30px;align-items:center;border:1px solid rgba(40,35,29,.12);border-radius:999px;background:rgba(255,253,248,.82);color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:850;line-height:1;padding:0 10px;white-space:nowrap}
.reader-article{padding:clamp(34px,4vw,56px) clamp(28px,4.6vw,64px)}
.reader-toc-toggle{display:grid;position:relative}
.reader-notes-toggle{display:grid;position:relative}
.reader-notes-toggle span{position:absolute;right:-5px;top:-5px;display:grid;min-width:18px;height:18px;place-items:center;border:1px solid rgba(40,35,29,.12);border-radius:999px;background:var(--reader-ink);color:var(--reader-paper);font-family:ui-sans-serif,system-ui,sans-serif;font-size:10px;font-weight:850;line-height:1;padding:0 5px}
.reader-responsive-scrim{display:none;position:fixed;inset:76px 0 0;z-index:5;border:0;background:rgba(40,35,29,.14);backdrop-filter:blur(2px);padding:0}
.reader-app.is-notes-open .reader-responsive-scrim{display:block;z-index:130;backdrop-filter:none}
.reader-highlight{background:rgba(234,216,157,.28);box-shadow:0 0 0 1px rgba(199,164,94,.18)}
.reader-highlight.is-active{background:rgba(234,216,157,.42)}
.reader-surface{padding:42px clamp(28px,4vw,56px) 84px;overflow:auto}
.reader-canvas{width:calc(var(--reader-content-width) + 760px);max-width:none;margin:0 auto}
.reader-article{width:var(--reader-content-width);max-width:min(var(--reader-content-width),calc(100vw - 120px))}
.reader-annotation-rail{position:absolute;left:calc(var(--reader-content-width) + 18px);top:0;width:320px;min-height:100%;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-annotation-rail>.reader-note{position:absolute;left:0;width:100%;margin:0;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.reader-annotation-rail>.reader-note.is-stacked{transform:translateX(calc(var(--stack-offset,0px)))}
.reader-annotation-rail>.reader-note[data-stack-index="1"]{--stack-offset:10px}
.reader-annotation-rail>.reader-note[data-stack-index="2"]{--stack-offset:20px}
.reader-annotation-rail>.reader-note[data-stack-index="3"]{--stack-offset:30px}
.reader-annotation-rail>.reader-note.is-active{transform:translateX(0)}
.reader-annotation-rail>.reader-note.is-stacked:not(.is-stack-front){cursor:pointer}
.reader-annotation-rail>.reader-note.is-stacked:not(.is-stack-front) .reader-note-toolbar{pointer-events:none}
.reader-question-drawer{position:fixed;right:0;top:76px;bottom:0;z-index:140;width:min(420px,calc(100vw - 32px));overflow:auto;padding:18px;border-left:1px solid rgba(40,35,29,.12);background:rgba(250,247,240,.98);box-shadow:-22px 0 58px rgba(40,35,29,.16);transform:translateX(calc(100% + 24px));transition:transform .22s cubic-bezier(.22,1,.36,1);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-app.is-notes-open .reader-question-drawer{transform:translateX(0)}
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
.reader-agent-menu{z-index:12;gap:3px;padding:6px;border-radius:12px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;line-height:1.2}
.reader-agent-menu button{grid-template-columns:24px minmax(0,1fr) auto;min-height:34px;gap:7px;border-radius:9px;color:var(--reader-ink);font:inherit;padding:5px 6px}
.reader-agent-menu button.is-active{background:#f0e3cd}
.reader-agent-menu .reader-avatar-badge{width:24px;height:24px}
.reader-agent-menu strong{overflow:hidden;font-size:12px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-agent-menu em{overflow:hidden;font-size:11px;font-style:normal;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.reader-question-panel{display:grid;gap:14px;margin:0 0 14px;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-question-panel-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-18px -18px 0;padding:24px 18px 18px;border-bottom:1px solid rgba(40,35,29,.08);background:rgba(255,253,248,.72)}
.reader-question-panel-header div{display:flex;align-items:baseline;gap:10px;min-width:0}
.reader-question-panel-header strong{color:var(--reader-ink);font-family:Charter,Georgia,Cambria,"Times New Roman",serif;font-size:28px;font-weight:850;line-height:1}
.reader-question-panel-header span{color:var(--reader-muted);font-size:13px;font-weight:850;letter-spacing:.08em}
.reader-question-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.reader-question-tabs button{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;height:42px;border:1px solid transparent;border-radius:14px;background:transparent;color:var(--reader-muted);cursor:pointer;font:inherit;font-size:13px;font-weight:900;padding:0 10px;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,color .14s ease}
.reader-question-tabs button.is-active{border-color:rgba(40,35,29,.08);background:rgba(255,253,248,.9);box-shadow:0 8px 22px rgba(55,42,24,.08);color:var(--reader-ink)}
.reader-question-tabs i{width:7px;height:7px;flex:0 0 auto;border-radius:999px;background:#9f5b50}
.reader-question-tabs button:nth-child(2) i{background:#477a5c}
.reader-question-tabs button:nth-child(3) i{background:#81786c}
.reader-question-tabs b{font-size:13px;font-weight:900}
.reader-question-list{display:grid;gap:12px}
.reader-question-empty{margin:10px 0 0;color:var(--reader-muted);font-size:13px;font-weight:760;line-height:1.5}
.reader-question-list article{display:grid;gap:12px;overflow:hidden;border:1px solid rgba(37,29,22,.08);border-radius:16px;background:#fffdf7;padding:14px 14px 12px 18px;box-shadow:0 12px 30px rgba(55,42,24,.08)}
.reader-question-list article.is-answered,.reader-question-list article.is-parked{background:rgba(255,253,248,.78)}
.reader-question-open{display:grid;gap:10px;border:0;background:transparent;color:var(--reader-ink);font:inherit;padding:0;text-align:left}
.reader-question-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
.reader-question-persona{display:grid;grid-template-columns:30px minmax(0,1fr);align-items:center;gap:9px;min-width:0}
.reader-question-persona .reader-avatar-badge{display:grid;width:30px;height:30px;place-items:center;overflow:hidden;border-radius:999px;background:var(--reader-green);color:white;font-size:12px;font-weight:850}
.reader-question-persona .reader-avatar-badge.is-image{background:transparent;color:inherit}
.reader-question-persona>span{display:grid;gap:1px;min-width:0}
.reader-question-persona strong{overflow:hidden;color:var(--reader-ink);font-size:14px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
.reader-question-meta time{flex:0 0 auto;color:var(--reader-muted);font-size:12px;font-weight:820;white-space:nowrap}
.reader-question-type{justify-self:start;border-radius:999px;background:rgba(159,91,80,.1);color:#8a4d43;font-size:12px;font-weight:900;line-height:1;padding:5px 9px}
.reader-question-open em{display:block;padding:10px 12px;border-left:3px solid rgba(199,164,94,.82);border-radius:4px 9px 9px 4px;background:rgba(240,232,211,.5);color:#6a6056;font-family:Charter,Georgia,Cambria,"Times New Roman",serif;font-size:13px;font-style:italic;font-weight:650;line-height:1.55;overflow-wrap:anywhere;white-space:pre-wrap}
.reader-question-content{color:#3f352c;font-size:14px;font-weight:760;line-height:1.62;overflow-wrap:anywhere;white-space:pre-wrap}
.reader-question-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:12px;border-top:1px dashed rgba(176,151,109,.42)}
.reader-question-actions button{height:32px;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);cursor:pointer;font:inherit;font-size:12px;font-weight:900;padding:0 12px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-question-actions button:last-child{background:var(--reader-green);color:#fffdf7}
.reader-question-actions button:hover{background:rgba(159,91,80,.08);color:var(--reader-red)}
.reader-question-actions button:last-child:hover{background:#1f1a16;color:#fffdf7}
.reader-question-actions button:active{transform:scale(.96)}
.reader-highlight.is-temporary{background:rgba(77,155,114,.14);box-shadow:0 0 0 1px rgba(77,155,114,.2)}
.reader-highlight.is-agent-theater{background:rgba(77,155,114,.18);box-shadow:0 0 0 1px rgba(77,155,114,.22)}
.reader-selection-menu{display:grid;width:max-content;border:1px solid rgba(40,35,29,.14);border-radius:999px;background:rgba(255,253,248,.97);box-shadow:0 18px 48px rgba(40,35,29,.16);backdrop-filter:blur(18px);padding:6px;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-selection-menu>button{justify-content:flex-start;color:var(--reader-ink)}
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
.reader-highlight-choice-menu{position:absolute;z-index:6;width:240px;display:grid;gap:6px;padding:10px;border:1px solid rgba(40,35,29,.14);border-radius:16px;background:rgba(255,253,248,.97);box-shadow:0 18px 48px rgba(40,35,29,.16);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-highlight-choice-menu header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px 4px}
.reader-highlight-choice-menu header strong{font-size:13px;font-weight:900}
.reader-highlight-choice-menu header button{display:grid;width:26px;height:26px;place-items:center;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);cursor:pointer;padding:0}
.reader-highlight-choice-menu header button:hover{background:#f0e3cd;color:var(--reader-ink)}
.reader-highlight-choice-menu>button{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:8px;border:0;border-radius:11px;background:transparent;color:var(--reader-ink);cursor:pointer;padding:8px;text-align:left}
.reader-highlight-choice-menu>button:hover{background:#f0e3cd}
.reader-highlight-choice-menu .reader-avatar-badge{display:grid;width:30px;height:30px;place-items:center;overflow:hidden;border-radius:999px;background:var(--reader-green);color:white;font-size:11px;font-weight:800}
.reader-highlight-choice-menu span{display:grid;gap:2px;min-width:0}
.reader-highlight-choice-menu span strong{overflow:hidden;font-size:13px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
.reader-highlight-choice-menu span em{overflow:hidden;color:var(--reader-muted);font-size:12px;font-style:normal;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.reader-highlight-choice-menu b{border-radius:999px;background:rgba(159,91,80,.07);color:var(--reader-red);font-size:11px;font-weight:850;line-height:1;padding:6px 8px;white-space:nowrap}
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
.reader-agent-annotate-popover .reader-agent-annotate-menu{position:relative;z-index:1;display:grid;width:min(1180px,calc(100vw - 56px));max-height:min(780px,calc(100vh - 68px));margin:0;padding:18px;border:1px solid rgba(40,35,29,.12);border-radius:20px;background:rgba(255,253,248,.98);box-shadow:0 28px 90px rgba(40,35,29,.24);overflow:hidden;pointer-events:auto}
.reader-plan-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:24px;padding:2px 2px 8px}
.reader-plan-header>div{display:grid;gap:6px;min-width:0}
.reader-plan-header strong{font-size:22px;font-weight:900;line-height:1.16;text-wrap:balance}
.reader-plan-header span{color:var(--reader-muted);font-size:13px;font-weight:760;line-height:1.45;text-wrap:pretty}
.reader-plan-header p{display:flex;align-items:center;gap:8px;margin:0 0 1px;color:var(--reader-muted);font-size:13px;font-weight:820;white-space:nowrap}
.reader-plan-header b{color:var(--reader-ink);font-variant-numeric:tabular-nums}
.reader-plan-action-bar{position:relative;display:flex;align-items:center;gap:10px;min-height:56px;margin:8px 0 14px;padding:10px 14px;border-radius:14px;background:#f2eadc;box-shadow:inset 0 0 0 1px rgba(40,35,29,.09);overflow:visible}
.reader-plan-action-bar>span{margin-right:6px;color:#8b8175;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
.reader-agent-annotate-menu .reader-plan-action{position:relative;display:inline-flex;width:auto;min-width:58px;height:34px;grid-template-columns:none;align-items:center;justify-content:center;border:1px solid rgba(40,35,29,.1);border-radius:999px;background:#fffdf8;color:var(--reader-ink);cursor:grab;font:inherit;font-size:12px;font-weight:900;padding:0 14px;text-align:center;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease}
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
.reader-plan-cell-action strong{overflow:hidden;max-width:100%;font-size:13px;font-weight:950;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
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
.reader-composer-types{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.reader-composer-types button{border:1px solid rgba(37,29,22,.12);border-radius:999px;background:#fffdf7;color:var(--reader-muted);cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:850;line-height:1;padding:7px 9px}
.reader-composer-types button:hover,.reader-composer-types button.is-active{border-color:rgba(159,91,80,.18);background:rgba(159,91,80,.07);color:var(--reader-red)}
.reader-comment-body{min-width:0}
.reader-comment-author{display:flex;min-width:0;flex-wrap:wrap;align-items:baseline;gap:6px;margin-bottom:3px;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-comment-author strong{min-width:0;font-size:12px;font-weight:850}
.reader-comment-author em{min-width:0;color:var(--reader-muted);font-size:11px;font-style:normal;font-weight:700}
.reader-comment .reader-comment-author span{display:inline-flex;width:auto;height:auto;border-radius:999px;background:rgba(159,91,80,.07);color:var(--reader-red);font-size:10px;font-weight:850;line-height:1;padding:3px 6px}
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
.reader-delete-note{position:relative;isolation:isolate;overflow:hidden;height:40px;border-radius:999px;padding:0 12px;touch-action:none;user-select:none}
.reader-delete-note::before{content:"";position:absolute;inset:0 auto 0 0;width:0;background:rgba(159,91,80,.14);z-index:0}
.reader-delete-note:hover{background:rgba(159,91,80,.07)}
.reader-delete-note svg,.reader-delete-note span{position:relative;z-index:1}
.reader-delete-note.is-holding::before{animation:reader-delete-hold var(--delete-hold-ms) linear forwards}
@keyframes reader-delete-hold{to{width:100%}}
.reader-agent-annotate-popover{position:fixed;inset:0;z-index:200;display:grid;place-items:center;width:auto;padding:34px;pointer-events:none}
.reader-agent-annotate-popover .reader-agent-annotate-menu{margin:0}
.reader-pairing-row{display:grid;gap:8px;padding:0 0 10px;margin-bottom:8px;border-bottom:1px solid rgba(37,29,22,.1)}
.reader-pairing-row label{display:inline-flex;align-items:center;gap:8px;color:var(--reader-muted);font-size:13px;font-weight:760}
.reader-pairing-row input{width:100%;height:34px;border:1px solid rgba(37,29,22,.16);border-radius:10px;background:#fffdf7;color:var(--reader-ink);font:inherit;font-size:12px;padding:0 10px}
.reader-pairing-actions{display:flex;gap:8px}
.reader-pairing-actions button{display:inline-flex;height:32px;align-items:center;gap:6px;border:0;border-radius:999px;background:#e7dac9;color:var(--reader-ink);cursor:pointer;font:inherit;font-size:12px;font-weight:820;padding:0 11px}
.reader-pairing-actions button:first-child{background:var(--reader-ink);color:#fffaf0}
.reader-pairing-actions button:disabled{cursor:not-allowed;opacity:.48}
.reader-pairing-status{color:var(--reader-red);font-size:12px;font-weight:760}
.reader-pairing-connected{display:grid;gap:10px}
.reader-pairing-connected.is-offline .reader-pairing-connected-main>span{background:var(--reader-red)}
.reader-pairing-connected-actions{display:flex;gap:8px;flex-wrap:wrap}
.reader-pairing-connected-main{display:flex;align-items:center;gap:10px;min-width:0}
.reader-pairing-connected-main>span{display:grid;width:34px;height:34px;flex:none;place-items:center;border-radius:999px;background:#1f6b3a;color:#fffaf0}
.reader-pairing-connected-main strong{display:block;font-size:14px;font-weight:900}
.reader-pairing-connected-main p{margin:2px 0 0;color:#51664d;font-size:12px;font-weight:720;line-height:1.4}
.reader-pairing-identity{display:grid;gap:2px;border-radius:12px;background:rgba(255,253,247,.78);box-shadow:inset 0 0 0 1px rgba(37,29,22,.1);padding:9px 11px}
.reader-pairing-identity span{color:var(--reader-muted);font-size:11px;font-weight:760}
.reader-pairing-identity strong{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:13px;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.reader-pairing-connected button{display:inline-flex;width:fit-content;height:34px;align-items:center;gap:6px;border:0;border-radius:999px;background:#e7dac9;color:var(--reader-ink);cursor:pointer;font:inherit;font-size:12px;font-weight:820;padding:0 12px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-pairing-connected button:hover{background:#f0e3cd}
.reader-pairing-connected button:active{transform:scale(.96)}
.reader-toc-item-main{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}
.reader-toc-item-main>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-toc-meta{display:inline-flex;align-items:center;gap:8px}
.reader-toc-item-main strong{display:grid;min-width:24px;height:24px;place-items:center;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:#fffaf0;color:var(--reader-ink);font-size:11px;font-weight:850}
.reader-toc-markers{display:flex;align-items:center;gap:5px}
.reader-toc-markers i{width:8px;height:8px;border:1px solid rgba(37,29,22,.14);border-radius:999px;box-shadow:0 1px 2px rgba(37,29,22,.12)}
.reader-toc-summary{margin-top:18px;padding:12px 10px;border:1px solid rgba(37,29,22,.12);border-radius:14px;background:rgba(255,250,240,.72);color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:760;line-height:1.4}
.reader-notes-header{display:grid;gap:10px;margin:0 -16px 14px;padding:14px 16px;border-bottom:1px solid rgba(40,35,29,.08);background:rgba(250,247,240,.96);box-shadow:0 8px 18px rgba(40,35,29,.05)}
.reader-notes-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.reader-notes-title-row strong{font-size:22px;font-weight:900;letter-spacing:0}
.reader-notes-title-row span{display:inline-flex;align-items:center;height:28px;border:1px solid rgba(37,29,22,.1);border-radius:999px;background:rgba(255,250,240,.76);color:var(--reader-muted);font-size:12px;font-weight:820;padding:0 10px}
.reader-note-tabs [data-slot="tabs-list"]{display:grid;width:100%;height:38px;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;padding:3px;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:rgba(255,250,240,.7);box-shadow:inset 0 1px 0 rgba(255,255,255,.72)}
.reader-note-tabs [data-slot="tabs-trigger"]{height:30px;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:850;letter-spacing:0;padding:0 8px}
.reader-note-tabs [data-slot="tabs-trigger"][data-state="active"]{background:#fffdf8;color:var(--reader-ink);box-shadow:0 5px 14px rgba(40,35,29,.08)}
.reader-note-tabs [data-slot="tabs-trigger"]:focus-visible{outline:2px solid rgba(37,29,22,.24);outline-offset:2px}
.reader-note-body{min-width:0}
.reader-note-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding-top:10px;border-top:1px dashed rgba(40,35,29,.18)}
.reader-comment-toggle{display:inline-flex;align-items:center;gap:5px;height:26px;border:1px solid rgba(37,29,22,.12);border-radius:999px;background:#fffaf0;color:var(--reader-muted);cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:800;padding:0 8px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-comment-toggle:hover{background:#f0e3cd;color:var(--reader-ink)}
.reader-comment-toggle:active{transform:scale(.96)}
.reader-comment-toggle:focus-visible{outline:none}
.reader-note-toolbar .reader-delete-note{height:26px;margin-right:0;padding:0 8px;font-size:11px}
.reader-annotation-connection{position:fixed;inset:0;z-index:4;width:100vw;height:100vh;overflow:visible;pointer-events:none}
.reader-annotation-connection path{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 4px 8px rgba(55,42,24,.18));opacity:.92}
.reader-note-anchor>span{padding:0;margin:0;background:transparent;border-radius:0}
.reader-note-type,.reader-note-intent{display:inline-flex;width:fit-content;align-items:center;border:1px solid rgba(159,91,80,.16);border-radius:999px;background:rgba(159,91,80,.07);color:var(--reader-red);font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:850;line-height:1;padding:4px 7px;white-space:nowrap}
.reader-note-intent{border-color:rgba(37,29,22,.12);background:rgba(37,29,22,.06);color:#6f6258}
.reader-note-comments-region{width:100%;margin-top:12px}
.reader-note-comments-panel{display:grid;grid-template-rows:auto auto auto auto;min-height:0;overflow:visible;gap:9px;border:1px solid rgba(40,35,29,.1);border-radius:14px;background:rgba(250,246,238,.86);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 22px rgba(55,42,24,.08);padding:10px}
.reader-note-comments-panel>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:8px;border-bottom:1px dashed rgba(40,35,29,.14);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-note-comments-panel>header>div{display:flex;align-items:baseline;gap:7px;min-width:0}
.reader-note-comments-panel>header strong{font-size:13px;font-weight:900}
.reader-note-comments-panel>header span{color:var(--reader-muted);font-size:11px;font-weight:800}
.reader-note-comments-panel>header button{display:inline-flex;align-items:center;gap:4px;height:26px;border:0;border-radius:999px;background:transparent;color:var(--reader-muted);cursor:pointer;font:inherit;font-size:11px;font-weight:850;padding:0 8px;transition:background .14s ease,color .14s ease,transform .14s ease}
.reader-note-comments-panel>header button:hover{background:#f0e3cd;color:var(--reader-ink)}
.reader-note-comments-panel>header button:active{transform:scale(.96)}
.reader-note-comments-panel .reader-comments{max-height:600px;min-height:0;overflow:auto;margin:0 -4px 0 0;padding-right:4px}
.reader-note-comments-panel .reader-comment{grid-template-columns:32px minmax(0,1fr);width:100%;min-width:0}
.reader-note-comments-panel .reader-markdown-content,.reader-note-comments-panel .reader-markdown-content *{max-width:100%;min-width:0;overflow-wrap:anywhere;word-break:break-word}
.reader-comment-markdown{position:relative}
.reader-comment-markdown.is-collapsed .reader-markdown-content{max-height:calc(1.66em * 4);overflow:hidden}
.reader-comment-markdown.is-collapsed::after{content:"";position:absolute;left:0;right:0;bottom:28px;height:34px;background:linear-gradient(to bottom,rgba(250,246,238,0),rgba(250,246,238,.96));pointer-events:none}
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
.reader-comment-agent-more-menu{position:absolute;left:0;bottom:calc(100% + 8px);z-index:5;display:grid;gap:4px;width:190px;padding:8px;border:1px solid rgba(40,35,29,.12);border-radius:14px;background:#fffdf8;box-shadow:0 16px 42px rgba(40,35,29,.14)}
.reader-comment-agent-more-menu button{display:grid;width:100%;height:36px;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;color:var(--reader-ink);padding:0 8px;text-align:left}
.reader-comment-agent-more-menu button:hover{background:#f0eadf}
.reader-comment-agent-more-menu strong{overflow:hidden;font-size:12px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
.reader-comment-agent-more-menu em{color:var(--reader-muted);font-size:11px;font-style:normal;font-weight:760}
.reader-note-comments-panel .reader-comment-box textarea{min-height:68px;max-height:96px;margin-top:0}
.reader-note-footer .reader-shortcut-hint{flex:0 0 auto;margin-right:0}
.reader-note-footer .reader-add-comment{flex:0 0 auto}
.reader-composer{width:min(520px,calc(100vw - 24px));padding:0;overflow:visible;border-color:rgba(40,35,29,.16);border-radius:20px;background:rgba(255,253,248,.98);box-shadow:0 22px 64px rgba(40,35,29,.18),0 0 0 1px rgba(255,255,255,.58) inset;transform-origin:24px 18px;animation:reader-composer-pop .22s cubic-bezier(.22,1,.36,1)}
.reader-composer-header{display:grid;gap:12px;padding:14px 14px 12px;border-bottom:1px solid rgba(40,35,29,.1);border-radius:19px 19px 0 0;background:rgba(255,253,248,.94);font-family:ui-sans-serif,system-ui,sans-serif}
.reader-composer-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.reader-composer-title-row strong{font-size:14px;font-weight:900;letter-spacing:0}
.reader-composer-title-row .reader-shortcut-hint{margin-right:0}
.reader-composer-types{display:grid;grid-template-columns:82px repeat(5,minmax(68px,1fr));align-items:center;gap:8px;margin:0}
.reader-composer-group-label{color:var(--reader-muted);font-size:11px;font-weight:900;line-height:1;white-space:nowrap}
.reader-composer-types button{height:34px;overflow:hidden;padding:0 10px;text-overflow:ellipsis;white-space:nowrap;font-size:12px;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease}
.reader-composer-types button:active{transform:scale(.96)}
.reader-composer-editor{position:relative}
.reader-composer textarea{display:block;min-height:118px;margin:0;border:0;border-radius:0;background:rgba(255,253,247,.74);font-size:14px;padding:14px 15px}
.reader-composer-actions{margin:0;padding:12px 14px;border-top:1px solid rgba(37,29,22,.1);border-radius:0 0 19px 19px;background:rgba(250,243,230,.9)}
.reader-composer-actions button{height:36px;padding:0 13px;transition:background .14s ease,color .14s ease,transform .14s ease}
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
.reader-app :where(button,textarea,input,[tabindex]):focus-visible{outline:2px solid rgba(37,29,22,.42);outline-offset:3px}
.reader-highlight{overflow:visible;background:transparent;box-shadow:none;mix-blend-mode:normal}
.reader-highlight.is-active{background:transparent;box-shadow:none}
.reader-highlight.is-active::after{content:"";position:absolute;inset:0 -1px;border-radius:4px;background:var(--highlight-fill,rgba(244,201,93,.16))}
.reader-highlight::before{content:"";position:absolute;z-index:1;left:min(var(--highlight-edge-size,0px),42%);right:min(var(--highlight-edge-size,0px),42%);bottom:var(--highlight-offset,-2px);height:var(--highlight-thickness,4px);border-radius:999px;background:var(--highlight-line,#f4c95d);opacity:var(--highlight-opacity,.78);-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 6' preserveAspectRatio='none'%3E%3Cpath d='M0 3 C4 0 8 6 12 3 S20 0 24 3' stroke='black' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 6' preserveAspectRatio='none'%3E%3Cpath d='M0 3 C4 0 8 6 12 3 S20 0 24 3' stroke='black' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");-webkit-mask-repeat:repeat-x;mask-repeat:repeat-x;-webkit-mask-size:24px 100%;mask-size:24px 100%;filter:drop-shadow(0 1px 0 rgba(255,253,248,.72))}
.reader-highlight.is-active::before{opacity:1;filter:drop-shadow(0 1px 0 rgba(255,253,248,.72)) drop-shadow(0 0 5px rgba(37,29,22,.2))}
.reader-highlight.is-temporary,.reader-highlight.is-agent-theater{background:transparent;box-shadow:none}
.reader-highlight-dots{position:absolute;z-index:2;bottom:var(--highlight-dot-offset,-3px);display:flex;gap:2px;align-items:center;pointer-events:none}
.reader-highlight-dots.is-start{left:0}
.reader-highlight-dots.is-end{right:0}
.reader-highlight-dots i{display:block;width:5px;height:5px;border:1px solid rgba(37,29,22,.14);border-radius:999px;box-shadow:0 1px 2px rgba(37,29,22,.14)}
.reader-highlight:focus-visible{outline:0;box-shadow:none}
.reader-highlight:focus-visible::before{opacity:1;filter:drop-shadow(0 1px 0 rgba(255,253,248,.72)) drop-shadow(0 0 6px rgba(37,29,22,.24))}
@media(prefers-reduced-motion:reduce){.reader-app *{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}.reader-virtual-cursor{transition:none!important}.reader-virtual-cursor.is-leaving{animation:none!important;opacity:0}.reader-completion-burst{display:none!important}.reader-delete-note.is-holding::before{animation:none!important;width:100%}.reader-spinner{animation:none!important;border-top-color:rgba(23,63,44,.22)}}
@media(max-width:1320px){.reader-main{grid-template-columns:minmax(0,1fr)}.reader-toc-toggle{display:grid}.reader-toc{display:none}.reader-app.is-toc-open .reader-toc{position:fixed;display:block;left:0;top:76px;bottom:0;z-index:6;width:min(320px,calc(100vw - 32px));border-right:1px solid rgba(40,35,29,.1);background:rgba(250,247,240,.98);box-shadow:18px 0 48px rgba(40,35,29,.14)}.reader-app.is-toc-open .reader-responsive-scrim{display:block}}
@media(max-width:1100px){.reader-surface{padding:32px 28px 64px}.reader-canvas{width:min(var(--reader-content-width),100%)}.reader-article{width:100%;max-width:100%;font-size:min(var(--reader-font-size),22px)}.reader-annotation-rail{position:relative;left:auto;top:auto;width:100%;display:grid;gap:14px;margin-top:16px}.reader-annotation-rail>.reader-note{position:relative;top:auto!important;left:auto;width:100%}.reader-annotation-connection{display:none}}
@media(max-width:760px){.reader-toolbar{min-height:72px;padding:12px 14px}.reader-brand-mark{width:34px;height:34px;border-radius:9px;font-size:16px}.reader-brand-title{font-size:12px}.reader-brand-copy p{font-size:11px}.reader-toolbar-actions{gap:7px}.reader-agent-annotate{width:38px;padding:0;justify-content:center}.reader-agent-annotate{font-size:0}.reader-agent-annotate svg{width:18px;height:18px}.reader-surface{padding:20px 14px 46px}.reader-article{border-radius:18px;padding:28px 20px;font-size:min(var(--reader-font-size),20px);line-height:1.72}.reader-article-header h1{font-size:28px}.reader-question-drawer{top:72px;width:min(420px,calc(100vw - 16px))}.reader-composer{left:8px!important;width:calc(100vw - 16px)}.reader-composer-types{grid-template-columns:1fr repeat(5,minmax(0,1fr))}.reader-composer-group-label{grid-column:1/-1}.reader-app.is-toc-open .reader-toc{top:72px}.reader-responsive-scrim{inset:72px 0 0}}
.reader-app.has-toc .reader-main{grid-template-columns:0 minmax(0,1fr);transition:grid-template-columns var(--resize-dur,300ms) var(--resize-ease,cubic-bezier(.22,1,.36,1))}
.reader-app.has-toc.is-toc-open .reader-main{grid-template-columns:minmax(240px,280px) minmax(0,1fr)}
.reader-app.has-toc .reader-toc{display:block;overflow:hidden;padding:42px 0 48px;border-right:0;opacity:0;visibility:hidden;pointer-events:none;transform:translateX(-10px);transition:opacity .2s ease,transform .2s ease,visibility .2s}
.reader-app.has-toc.is-toc-open .reader-toc{overflow:auto;padding:42px 18px 48px 22px;border-right:1px solid rgba(40,35,29,.08);opacity:1;visibility:visible;pointer-events:auto;transform:translateX(0)}
.reader-toc-toggle:disabled{cursor:not-allowed;opacity:.42}
@media(max-width:1320px){.reader-app.has-toc .reader-main,.reader-app.has-toc.is-toc-open .reader-main{grid-template-columns:minmax(0,1fr)}.reader-app.has-toc .reader-toc{display:none}.reader-app.has-toc.is-toc-open .reader-toc{position:fixed;display:block;left:0;top:76px;bottom:0;z-index:6;width:min(320px,calc(100vw - 32px));overflow:auto;padding:42px 18px 48px 22px;border-right:1px solid rgba(40,35,29,.1);background:rgba(250,247,240,.98);box-shadow:18px 0 48px rgba(40,35,29,.14);opacity:1;visibility:visible;pointer-events:auto;transform:translateX(0)}.reader-app.has-toc.is-toc-open .reader-responsive-scrim{display:block}}
@media(max-width:760px){.reader-toolbar-article-action{display:none}.reader-toolbar-article-title{font-size:13px}.reader-toolbar-article-meta{font-size:11px}.reader-app.has-toc.is-toc-open .reader-toc{top:72px}}
`;

export const readerStyles = `
:host{all:initial;color-scheme:light;--reader-bg:#f5f1e8;--reader-paper:#fffdf8;--reader-ink:#28231d;--reader-muted:#746d63;--reader-line:#e3dccf;--reader-green:#28231d;--reader-red:#9f5b50;--reader-yellow:#ead89d;--reader-yellow-strong:#c7a45e;font-family:Charter,Georgia,Cambria,"Times New Roman",serif}*{box-sizing:border-box}.reader-app{position:fixed;inset:0;z-index:2147483647;display:grid;grid-template-rows:auto 1fr;background:var(--reader-bg);color:var(--reader-ink)}.reader-toolbar{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:76px;padding:14px 28px;border-bottom:1px solid rgba(40,35,29,.1);background:rgba(255,253,248,.9);backdrop-filter:blur(14px)}.reader-brand{display:flex;align-items:center;gap:12px;min-width:0}.reader-brand-mark{display:block;width:38px;height:38px;flex:0 0 auto;border-radius:10px;object-fit:cover}.reader-brand-copy{display:grid;gap:3px;min-width:0}.reader-brand-title{color:var(--reader-ink);font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;font-weight:900;letter-spacing:.16em;line-height:1}.reader-brand-copy p{display:flex;align-items:center;gap:7px;margin:0;overflow:hidden;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:720;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}.reader-connection{width:7px;height:7px;border-radius:999px;box-shadow:0 0 0 2px rgba(40,35,29,.06)}.reader-connection.is-connected{background:#4d9b72}.reader-connection.is-disconnected{background:#b86f62}.reader-toolbar-actions{display:flex;align-items:center;gap:10px}.reader-close,.reader-icon-button{display:grid;width:38px;height:38px;place-items:center;border:1px solid rgba(40,35,29,.14);border-radius:999px;background:rgba(255,253,248,.84);color:var(--reader-ink);cursor:pointer}.reader-icon-button:hover,.reader-icon-button.is-active,.reader-close:hover{background:#f0eadf}.reader-settings-panel{position:fixed;right:28px;top:88px;z-index:6;width:280px;padding:14px;border:1px solid rgba(40,35,29,.14);border-radius:18px;background:rgba(255,253,248,.96);box-shadow:0 18px 48px rgba(40,35,29,.14);backdrop-filter:blur(16px);font-family:ui-sans-serif,system-ui,sans-serif}.reader-setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}.reader-setting-row+.reader-setting-row{border-top:1px solid rgba(37,29,22,.1)}.reader-setting-label{display:inline-flex;align-items:center;gap:8px;color:var(--reader-muted);font-size:13px;font-weight:720}.reader-stepper{display:inline-flex;align-items:center;overflow:hidden;border:1px solid rgba(37,29,22,.14);border-radius:999px;background:#fffdf7}.reader-stepper button{display:grid;width:30px;height:30px;place-items:center;border:0;background:transparent;color:var(--reader-muted);cursor:pointer}.reader-stepper button:hover{background:rgba(40,35,29,.06);color:var(--reader-green)}.reader-stepper strong{min-width:58px;color:var(--reader-ink);font-size:12px;text-align:center}.reader-main{min-height:0;display:grid;grid-template-columns:260px minmax(0,1fr) 360px}.reader-toc{min-width:0;overflow:auto;padding:42px 18px 48px 22px;border-right:1px solid rgba(40,35,29,.08);background:rgba(250,247,240,.62);font-family:ui-sans-serif,system-ui,sans-serif}.reader-toc.is-empty{visibility:hidden}.reader-toc-title{margin:0 0 12px;color:var(--reader-green);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.reader-toc-item{display:block;width:100%;margin:2px 0;border:0;border-radius:10px;background:transparent;color:var(--reader-muted);cursor:pointer;font:inherit;font-size:13px;line-height:1.35;padding:7px 8px;text-align:left}.reader-toc-item:hover{background:rgba(255,253,248,.82);color:var(--reader-ink)}.reader-toc-item[data-depth="2"]{padding-left:20px}.reader-toc-item[data-depth="3"]{padding-left:32px}.reader-toc-item[data-depth="4"]{padding-left:44px}.reader-surface{min-width:0;overflow:auto;padding:42px 48px 84px}.reader-canvas{position:relative;width:min(var(--reader-content-width),100%);margin:0 auto}.reader-article{position:relative;z-index:1;padding:56px 64px;border:1px solid rgba(40,35,29,.1);border-radius:22px;background:rgba(255,253,248,.96);box-shadow:0 18px 54px rgba(40,35,29,.1);font-size:var(--reader-font-size);line-height:1.78;overflow-wrap:anywhere;word-break:break-word}.reader-article-header{margin-bottom:42px;padding-bottom:28px;border-bottom:1px solid rgba(40,35,29,.1)}.reader-article-header h1{margin:0;color:var(--reader-ink);font-size:36px;letter-spacing:0;line-height:1.18}.reader-article-header p{margin:14px 0 0;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.5}.reader-article *{max-width:100%;min-width:0;overflow-wrap:anywhere}.reader-article-body{color:var(--reader-ink);text-wrap:pretty}.reader-article-body>:first-child{margin-top:0}.reader-article-body>:last-child{margin-bottom:0}.reader-article-body p{margin:0 0 1.05em}.reader-article-body h1,.reader-article-body h2,.reader-article-body h3,.reader-article-body h4,.reader-article-body h5,.reader-article-body h6{margin:1.65em 0 .65em;color:var(--reader-ink);font-family:ui-sans-serif,system-ui,sans-serif;font-weight:860;letter-spacing:0;line-height:1.28;text-wrap:balance}.reader-article-body h1{font-size:1.52em}.reader-article-body h2{font-size:1.28em}.reader-article-body h3{font-size:1.14em}.reader-article-body h4,.reader-article-body h5,.reader-article-body h6{font-size:1em}.reader-article-body strong,.reader-article-body b{color:var(--reader-ink);font-weight:850}.reader-article-body hr{height:1px;margin:1.35em 0 .8em;border:0;background:rgba(40,35,29,.52)}.reader-article-body ul,.reader-article-body ol{margin:1em 0 1em 1.35em;padding:0}.reader-article-body li{margin:.35em 0}.reader-article-body figure{margin:1em 0}.reader-article-body figcaption{margin:.45em 0 0;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:.72em;line-height:1.4}.reader-article img,.reader-article video,.reader-article iframe{max-width:100%;height:auto;border-radius:14px}.reader-article pre{overflow:auto;padding:18px;border-radius:16px;background:#24211d;color:#fbf6ec}.reader-article table{display:block;max-width:100%;overflow-x:auto}.reader-article blockquote{margin-left:0;padding-left:22px;border-left:4px solid var(--reader-yellow);color:#574f45}.reader-article a,.reader-markdown a{color:inherit;text-decoration:underline;text-decoration-color:rgba(40,35,29,.32);text-decoration-thickness:1px;text-underline-offset:.16em}.reader-article a:hover,.reader-markdown a:hover{color:var(--reader-red);text-decoration-color:currentColor}.reader-highlight-layer{position:absolute;inset:0;z-index:3;pointer-events:none}.reader-highlight{position:absolute;border:0;border-radius:4px;background:rgba(234,216,157,.34);box-shadow:0 0 0 1px rgba(199,164,94,.18);cursor:pointer;mix-blend-mode:multiply;padding:0;pointer-events:auto}.reader-highlight.is-active{background:rgba(234,216,157,.5);box-shadow:0 0 0 2px rgba(40,35,29,.38)}.reader-highlight.is-temporary{background:rgba(77,155,114,.16);box-shadow:0 0 0 1px rgba(77,155,114,.22);pointer-events:none}.reader-highlight.is-agent-theater{background:rgba(77,155,114,.2);box-shadow:0 0 0 1px rgba(77,155,114,.24);pointer-events:none}.reader-selection-menu{position:absolute;z-index:5;padding:5px;border-radius:999px;background:rgba(39,36,32,.92);box-shadow:0 12px 34px rgba(37,29,22,.28)}.reader-selection-menu button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;border:0;border-radius:999px;background:transparent;color:#fff8e8;cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;font-weight:750;padding:0 12px}.reader-virtual-cursor{position:fixed;z-index:7;display:flex;align-items:center;gap:8px;pointer-events:none;transform:translate(-4px,-4px);transition:left .42s ease,top .42s ease}.reader-virtual-pointer{width:0;height:0;border-left:13px solid var(--reader-green);border-top:9px solid transparent;border-bottom:9px solid transparent;filter:drop-shadow(0 4px 8px rgba(40,35,29,.18));transform:rotate(-18deg)}.reader-virtual-label{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(40,35,29,.14);border-radius:999px;background:rgba(255,253,248,.96);box-shadow:0 10px 28px rgba(40,35,29,.14);color:var(--reader-green);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:820;padding:6px 10px;white-space:nowrap}.reader-virtual-label span{display:grid;width:22px;height:22px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:11px}.reader-virtual-cursor.is-offscreen .reader-virtual-pointer{opacity:.45}.reader-virtual-cursor.is-leaving{animation:reader-cursor-leave .9s ease forwards}@keyframes reader-cursor-leave{to{opacity:0;transform:translate(18px,-24px) scale(.86);filter:blur(2px)}}.reader-notes{min-width:0;overflow:auto;padding:28px 22px 48px;border-left:1px solid rgba(40,35,29,.1);background:rgba(250,247,240,.78)}.reader-notes-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;margin:-28px -22px 18px;padding:18px 22px;background:rgba(250,247,240,.94);backdrop-filter:blur(14px);font-family:ui-sans-serif,system-ui,sans-serif}.reader-notes-actions{display:flex;align-items:center;gap:8px}.reader-notes-actions span{display:grid;min-width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:12px}.reader-agent-annotate{display:inline-flex;align-items:center;gap:6px;height:30px;border:1px solid rgba(40,35,29,.14);border-radius:999px;background:rgba(255,253,248,.84);color:var(--reader-green);cursor:pointer;font:inherit;font-size:12px;font-weight:800;padding:0 10px}.reader-agent-annotate:hover,.reader-agent-annotate.is-active{background:#f0eadf}.reader-agent-annotate:disabled{cursor:not-allowed;opacity:.55}.reader-agent-annotate-menu{display:grid;gap:6px;margin:-6px 0 14px;padding:10px;border:1px solid rgba(37,29,22,.12);border-radius:16px;background:rgba(255,250,240,.92);box-shadow:0 12px 36px rgba(55,42,24,.1);font-family:ui-sans-serif,system-ui,sans-serif}.reader-agent-annotate-menu button{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:8px;border:0;border-radius:11px;background:transparent;color:var(--reader-ink);cursor:pointer;padding:8px;text-align:left}.reader-agent-annotate-menu button:hover{background:#f0e3cd}.reader-agent-annotate-menu button:disabled{cursor:not-allowed;opacity:.65}.reader-agent-annotate-menu button>span{display:grid;width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:12px;font-weight:800}.reader-agent-annotate-menu em{color:var(--reader-muted);font-size:12px;font-style:normal}.reader-empty,.reader-note{margin-bottom:14px;padding:16px;border:1px solid rgba(40,35,29,.1);border-radius:16px;background:rgba(255,253,248,.88);box-shadow:0 8px 24px rgba(40,35,29,.07)}.reader-empty strong,.reader-note-anchor{font-family:ui-sans-serif,system-ui,sans-serif;font-weight:750}.reader-empty p,.reader-muted{margin:8px 0 0;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;line-height:1.6}.reader-note.is-active{border-color:rgba(40,35,29,.34);box-shadow:0 0 0 3px rgba(40,35,29,.08),0 8px 24px rgba(40,35,29,.07)}.reader-note-anchor{width:100%;border:0;background:transparent;color:var(--reader-ink);cursor:pointer;font-size:14px;line-height:1.5;padding:0;text-align:left}.reader-note-anchor span{display:inline-flex;align-items:center;margin:0 6px 6px 0;border-radius:999px;background:rgba(40,35,29,.08);color:var(--reader-green);font-size:12px;font-weight:800;padding:3px 8px}.reader-comments{margin-top:12px}.reader-comment{display:grid;grid-template-columns:32px 1fr;gap:9px;margin-top:10px;font-family:ui-sans-serif,system-ui,sans-serif}.reader-comment span{display:grid;width:28px;height:28px;place-items:center;border-radius:999px;background:var(--reader-green);color:white;font-size:11px}.reader-comment p{margin:0;color:#3f352c;font-size:13px;line-height:1.55}.reader-avatar-badge img{width:100%;height:100%;object-fit:cover;border-radius:999px}.reader-spinner{display:inline-block;width:12px;height:12px;margin-left:6px;vertical-align:-2px;border:2px solid rgba(40,35,29,.2);border-top-color:var(--reader-green);border-radius:999px;animation:reader-spin .8s linear infinite}@keyframes reader-spin{to{transform:rotate(360deg)}}.reader-comment-box{position:relative}.reader-note textarea,.reader-composer textarea{width:100%;min-height:74px;resize:vertical;margin-top:12px;padding:10px 12px;border:1px solid rgba(40,35,29,.14);border-radius:12px;background:#fffdf8;color:var(--reader-ink);font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;line-height:1.5;outline:none}.reader-composer textarea{margin-top:0}.reader-agent-menu{position:absolute;left:0;right:0;bottom:calc(100% - 8px);z-index:4;display:grid;gap:4px;padding:8px;border:1px solid rgba(40,35,29,.12);border-radius:14px;background:#fffdf8;box-shadow:0 16px 42px rgba(40,35,29,.14)}.reader-agent-menu button{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;cursor:pointer;padding:7px;text-align:left}.reader-agent-menu button:hover{background:#f0eadf}.reader-agent-menu em{color:var(--reader-muted);font-size:12px;font-style:normal}.reader-add-comment,.reader-composer-actions button{border:0;border-radius:999px;cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:760}.reader-delete-note{display:inline-flex;align-items:center;gap:5px;margin-right:auto;border:0;background:transparent;color:#8a3f32;cursor:pointer;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:760}.reader-delete-confirm{display:inline-flex;align-items:center;gap:6px;margin-right:auto;color:#6b5d50;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px}.reader-delete-confirm button{border:0;border-radius:999px;background:#eadfce;color:#4c4137;cursor:pointer;font:inherit;font-weight:760;padding:6px 9px}.reader-delete-confirm button:last-child{background:#8a3f32;color:white}.reader-add-comment{padding:9px 13px;background:var(--reader-green);color:white}.reader-note-footer,.reader-composer-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:10px}.reader-shortcut-hint{display:inline-flex;align-items:center;gap:5px;margin-right:auto;color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px}.reader-kbd{display:inline-flex;min-width:20px;height:20px;align-items:center;justify-content:center;border:1px solid rgba(40,35,29,.16);border-bottom-color:rgba(40,35,29,.28);border-radius:6px;background:#fffdf8;box-shadow:0 1px 0 rgba(40,35,29,.14);color:#4c4137;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:10px;font-weight:750;line-height:1;padding:0 5px}.reader-composer{position:absolute;z-index:5;width:340px;padding:14px;border:1px solid rgba(40,35,29,.14);border-radius:18px;background:rgba(255,253,248,.98);box-shadow:0 22px 64px rgba(40,35,29,.18)}.reader-quote{max-height:92px;overflow:auto;padding:10px 12px;border-left:4px solid var(--reader-yellow-strong);background:rgba(234,216,157,.18);color:#3f352c;font-size:13px;line-height:1.5}.reader-composer-actions button{padding:9px 13px;background:#e6dbc8;color:var(--reader-ink)}.reader-composer-actions button:last-child{background:var(--reader-green);color:white}@media(max-width:980px){.reader-main{grid-template-columns:1fr}.reader-toc{display:none}.reader-notes{position:fixed;right:14px;bottom:14px;width:min(380px,calc(100vw - 28px));max-height:42vh;border:1px solid rgba(40,35,29,.14);border-radius:22px;box-shadow:0 18px 54px rgba(40,35,29,.16)}.reader-surface{padding:24px 18px 220px}.reader-article{padding:34px 24px;font-size:18px}.reader-toolbar{padding:12px 16px}}
`;

export const readerDesktopEmbeddedStyles = `
.source-reader-shell{padding:0}
.reader-app{color-scheme:light;--reader-bg:#f5f1e8;--reader-paper:#fffdf8;--reader-ink:#28231d;--reader-muted:#746d63;--reader-line:#e3dccf;--reader-green:#28231d;--reader-red:#9f5b50;--reader-yellow:#ead89d;--reader-yellow-strong:#c7a45e;font-family:Charter,Georgia,Cambria,"Times New Roman",serif}
.reader-brand-mark{display:grid;place-items:center;background:var(--reader-ink);color:var(--reader-paper);font-family:ui-sans-serif,system-ui,sans-serif;font-size:18px;font-weight:950;line-height:1}
.reader-app.is-embedded{position:relative;inset:auto;z-index:0;width:100%;height:100%;min-height:0;overflow:hidden;border-radius:8px}
.reader-app.is-embedded .reader-settings-panel{position:absolute}
.reader-app.is-embedded .reader-agent-annotate-popover{position:absolute}
.reader-app.is-embedded .reader-agent-annotate-scrim{position:absolute}
.reader-app.is-embedded .reader-responsive-scrim{position:absolute}
.reader-app.is-embedded .reader-question-drawer{position:absolute}
.reader-app.is-embedded .reader-annotation-connection{position:absolute;width:100%;height:100%}
.reader-app.is-embedded .reader-completion-burst{position:absolute}
.reader-toolbar-article{display:flex;align-items:center;gap:12px;min-width:0;font-family:ui-sans-serif,system-ui,sans-serif}
.reader-toolbar-article-copy{display:grid;gap:5px;min-width:0}
.reader-toolbar-article-title{overflow:hidden;color:var(--reader-ink);font-size:15px;font-weight:920;line-height:1.18;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta{display:flex;align-items:center;gap:8px;min-width:0;margin:0;color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.25}
.reader-toolbar-article-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta span+span::before{content:"";display:inline-block;width:4px;height:4px;margin-right:8px;border-radius:999px;background:rgba(40,35,29,.24);vertical-align:2px}
.reader-toolbar-article-action{display:flex;flex:0 0 auto;align-items:center;gap:8px}
.reader-toolbar-current-view{display:inline-flex;height:30px;align-items:center;border:1px solid rgba(40,35,29,.12);border-radius:999px;background:rgba(255,253,248,.82);color:var(--reader-muted);font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:850;line-height:1;padding:0 10px;white-space:nowrap}
.reader-toolbar-article-action .open-article-button.is-icon-only{--annotation-control-size:30px;border-color:rgba(40,35,29,.14);background:rgba(255,253,248,.84);color:var(--reader-ink)}
.reader-toolbar-article-action .open-article-button.is-icon-only:hover{background:#f0eadf}
@media(max-width:1320px){.reader-app.is-embedded.is-toc-open .reader-toc{position:absolute}}
@media(max-width:760px){.reader-toolbar-article-action{display:none}.reader-toolbar-article-title{font-size:13px}.reader-toolbar-article-meta{font-size:11px}}
`;
