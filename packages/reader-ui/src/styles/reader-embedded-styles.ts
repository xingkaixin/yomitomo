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
.reader-toolbar-article{display:flex;flex:1 1 auto;max-width:100%;align-items:center;gap:12px;min-width:0;overflow:hidden;font-family:var(--font-ui, ui-sans-serif, system-ui, sans-serif)}
.reader-toolbar-article-copy{display:grid;flex:0 1 auto;gap:5px;max-width:100%;min-width:0;overflow:hidden}
.reader-toolbar-article-title{max-width:100%;overflow:hidden;color:var(--reader-ink);font-size:15px;font-weight:920;line-height:1.18;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta{display:flex;align-items:center;gap:8px;min-width:0;margin:0;color:var(--reader-muted);font-size:12px;font-weight:760;line-height:1.25}
.reader-toolbar-article-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reader-toolbar-article-meta span+span::before{content:"";display:inline-block;width:4px;height:4px;margin-right:8px;border-radius:999px;background:var(--reader-ink-weak);vertical-align:2px}
.reader-toolbar-article-action{display:flex;flex:0 0 auto;align-items:center;gap:8px}
.reader-toolbar-article-action .open-article-button.is-icon-only{--annotation-control-size:40px;border-color:transparent;border-radius:6px;background:transparent;color:var(--reader-ink)}
.reader-toolbar-article-action .open-article-button.is-icon-only:hover{background:var(--app-reader-toolbar-control-hover-bg)}
	.reader-app.is-embedded.has-toc .reader-toc{position:absolute}
@media(max-width:760px){.reader-toolbar-article-action{display:none}.reader-toolbar-article-title{font-size:13px}.reader-toolbar-article-meta{font-size:11px}}
`;
