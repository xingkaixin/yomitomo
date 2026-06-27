import { describe, expect, it } from 'vitest';
import { readerBodyLineHeight } from './reader-settings';
import {
  composeReaderStyles,
  readerConversationStyles,
  readerDesktopEmbeddedBundleStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
  readerStyleBundles,
} from './reader-styles';

describe('reader embedded styles', () => {
  it('keeps compatibility exports wired to explicit style bundles', () => {
    expect(readerStyleBundles.base).toBe(readerStyles);
    expect(readerStyleBundles.conversation).toBe(readerConversationStyles);
    expect(readerStyleBundles.desktopEmbedded).toBe(readerDesktopEmbeddedStyles);
  });

  it('composes desktop embedded styles in base, conversation, embedded order', () => {
    expect(readerDesktopEmbeddedBundleStyles).toBe(
      composeReaderStyles(['base', 'conversation', 'desktopEmbedded']),
    );

    const bundledStyles = compactCss(readerDesktopEmbeddedBundleStyles);
    const baseIndex = bundledStyles.indexOf(compactCss(':host { all: initial'));
    const conversationIndex = bundledStyles.indexOf(
      '.reader-main{grid-template-columns:minmax(0,1fr)}',
    );
    const embeddedIndex = bundledStyles.indexOf(
      '.source-reader-shell{grid-template-rows:minmax(0,1fr);padding:0}',
    );

    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(conversationIndex).toBeGreaterThan(baseIndex);
    expect(embeddedIndex).toBeGreaterThan(conversationIndex);
  });

  it('uses app-provided reader theme variables for core reader surfaces', () => {
    expectCssToContain(combinedReaderStyles(), '--reader-bg:var(--app-reader-bg)');
    expect(readerConversationStyles).toContain('--reader-z-popover:var(--app-z-popover,160)');
    expect(readerConversationStyles).toContain('--reader-z-tooltip:var(--app-z-tooltip,340)');
    expect(readerConversationStyles).toContain('--app-viewport-height:100vh');
    expect(readerConversationStyles).toContain('@supports (height:100dvh)');
    expectCssToContain(combinedReaderStyles(), '--reader-content-bg');
    expectCssToContain(
      combinedReaderStyles(),
      '.reader-article{background:var(--reader-content-bg,var(--reader-paper))}',
    );
    expectCssToContain(combinedReaderStyles(), '.reader-background-options{');
    expectCssToContain(combinedReaderStyles(), 'background:var(--app-reader-edge-blur-top)');
    expect(combinedReaderStyles()).toContain('background:var(--app-reader-scrim)');
    expect(readerDesktopEmbeddedStyles).toContain('--reader-bg:var(--app-reader-bg)');
    expectCssNotToContain(combinedReaderStyles(), '--reader-bg:#f5f1e8');
    expect(readerDesktopEmbeddedStyles).not.toContain('--reader-bg:#f5f1e8');
  });

  it('keeps base reader CSS source reviewable', () => {
    const longestLine = Math.max(...readerStyles.split('\n').map((line) => line.length));

    expect(readerStyles).toContain('\n.reader-article {\n');
    expect(readerStyles).toContain('\n@media(max-width:940px) {\n');
    expect(longestLine).toBeLessThanOrEqual(220);
  });

  it('wires popup surfaces to the shared motion contract', () => {
    expect(readerConversationStyles).toContain('--dropdown-open-dur:190ms');
    expect(readerConversationStyles).toContain('--dropdown-close-dur:120ms');
    expect(readerConversationStyles).toContain(
      '.t-dropdown{transform-origin:var(--transform-origin,var(--popup-transform-origin,top left));',
    );
    expect(readerConversationStyles).toContain(
      '.t-dropdown[data-open],.t-dropdown.is-open{transform:scale(1);opacity:1;pointer-events:auto}',
    );
    expect(readerConversationStyles).toContain(
      '.t-dropdown[data-closed],.t-dropdown[data-ending-style],.t-dropdown.is-closing{transform:scale(var(--dropdown-closing-scale));opacity:0;',
    );
    expect(readerConversationStyles).toContain(
      '@media(prefers-reduced-motion:reduce){.t-dropdown,.t-dropdown[data-closed],.t-dropdown[data-ending-style]{transform:none!important;transition:none!important}',
    );
    expect(readerConversationStyles).not.toContain('data-origin');
  });

  it('keeps selection copy icon swap on one reader motion contract', () => {
    const combinedStyles = combinedReaderStyles();

    expectCssToContain(readerStyles, '--reader-icon-swap-dur:250ms');
    expectCssToContain(readerStyles, '--reader-icon-swap-ease:ease-in-out');
    expectCssToContain(readerStyles, '--reader-icon-swap-blur:2px');
    expectCssToContain(readerStyles, '--reader-icon-swap-start-scale:.25');
    expectCssToContain(readerStyles, '--icon-swap-dur:var(--reader-icon-swap-dur)');
    expectCssToContain(readerStyles, '--icon-swap-ease:var(--reader-icon-swap-ease)');
    expectCssToContain(
      readerStyles,
      '@media(prefers-reduced-motion:reduce){.reader-selection-copy-icon .t-icon{transition:none!important;will-change:auto}}',
    );
    expect(countOccurrences(combinedStyles, '.reader-selection-copy-icon.t-icon-swap{')).toBe(1);
    expect(countOccurrences(combinedStyles, '.reader-selection-copy-icon .t-icon{grid-area')).toBe(
      1,
    );
    expect(
      countOccurrences(
        combinedStyles,
        '@media(prefers-reduced-motion:reduce){.reader-selection-copy-icon .t-icon{transition:none!important;will-change:auto}}',
      ),
    ).toBe(1);
    expect(readerConversationStyles).not.toContain('--icon-swap-dur');
    expect(readerConversationStyles).not.toContain('.reader-selection-copy-icon .t-icon{');
  });

  it('keeps reader chrome draggable with centered article metadata', () => {
    expect(readerConversationStyles).toContain('-webkit-app-region:drag');
    expect(readerConversationStyles).toContain(
      '.reader-back,.reader-toolbar-actions,.reader-toolbar-article-action,.reader-toolbar button{-webkit-app-region:no-drag}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-toolbar-article-copy{display:grid;flex:0 1 auto;gap:5px;max-width:100%;min-width:0;overflow:hidden;justify-items:center;text-align:center}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-toolbar-article-meta{display:flex;align-items:center;justify-content:center;',
    );
    expect(readerConversationStyles).toContain(
      '.reader-toolbar-article.has-cover .reader-toolbar-article-copy{justify-items:start;text-align:left}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-toolbar-article.has-cover .reader-toolbar-article-meta{justify-content:flex-start}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-toolbar-article-copy,.reader-toolbar-article.has-cover .reader-toolbar-article-copy{justify-items:start;text-align:left}',
    );
  });

  it('renders the table of contents as line navigation with count badges', () => {
    expectCssToContain(
      readerStyles,
      '.reader-toc{--reader-toc-line-width:10px;--reader-toc-line-active-width:20px;--reader-toc-line-current-width:var(--reader-toc-line-width);',
    );
    expectCssToContain(
      readerStyles,
      '.reader-toc-item{display:grid;grid-template-columns:var(--reader-toc-line-current-width) minmax(0,1fr);',
    );
    expect(readerConversationStyles).toContain('.reader-toc-line{');
    expect(readerConversationStyles).toContain('.reader-toc-count{');
    expect(readerConversationStyles).toContain(
      '@media(prefers-reduced-motion:reduce){.reader-toc-item,.reader-toc-line{transform:none!important;',
    );
    expect(readerConversationStyles).not.toContain('.reader-toc-markers');
    expect(readerConversationStyles).not.toContain('.reader-toc-item::before');
  });

  it('keeps long toolbar titles from squeezing leading visuals', () => {
    expect(readerConversationStyles).toContain(
      '.reader-toolbar-article{display:flex;flex:1 1 auto;max-width:100%;align-items:center;gap:12px;min-width:0;overflow:hidden;',
    );
    expect(readerConversationStyles).toContain(
      '.reader-toolbar-article-visual{display:grid;flex:0 0 auto;place-items:center}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-toolbar-article-title{max-width:100%;overflow:hidden;',
    );
    expect(readerDesktopEmbeddedStyles).toContain(
      '.reader-toolbar-article-copy{display:grid;flex:0 1 auto;gap:5px;max-width:100%;min-width:0;overflow:hidden}',
    );
  });

  it('keeps article blockquotes on reader theme tokens', () => {
    expectCssToContain(
      readerStyles,
      '.reader-article blockquote{margin-left:0;padding-left:22px;border-left:4px solid var(--reader-yellow);color:var(--reader-ink)}',
    );
    expect(combinedReaderStyles()).toContain(
      '.reader-markdown blockquote{margin:8px 0;padding-left:10px;border-left:3px solid color-mix(in srgb,var(--reader-red) 28%,transparent);color:var(--reader-ink)}',
    );
    expectCssNotToContain(
      readerStyles,
      '.reader-article blockquote{margin-left:0;padding-left:22px;border-left:4px solid var(--reader-yellow);color:#574f45}',
    );
    expectCssNotToContain(
      readerStyles,
      '.reader-markdown blockquote{margin:8px 0;padding-left:10px;border-left:3px solid rgba(159,91,80,.28);color:#5d5147}',
    );
  });

  it('uses the shared body line height for article reading', () => {
    expectCssToContain(
      readerStyles,
      `.reader-article{position:relative;z-index:1;padding:56px 64px;border:1px solid var(--app-reader-note-border);border-radius:22px;background:var(--reader-paper);box-shadow:var(--app-reader-note-shadow);font-size:var(--reader-font-size);line-height:${readerBodyLineHeight};`,
    );
  });

  it('disables article text selection during visible translation work', () => {
    expectCssToContain(
      readerStyles,
      '.reader-article-body.is-translation-select-disabled{user-select:none;-webkit-user-select:none}',
    );
    expectCssToContain(readerStyles, '.reader-bilingual-translation-indicator.is-failed{');
  });

  it('keeps highlight controls out of native text selection', () => {
    expectCssToContain(
      combinedReaderStyles(),
      '.reader-highlight-layer{position:absolute;inset:0;z-index:3;pointer-events:none;user-select:none;-webkit-user-select:none}',
    );
    expectCssToContain(
      combinedReaderStyles(),
      '.reader-highlight{position:absolute;border:0;border-radius:4px;background:rgba(234,216,157,.34);box-shadow:0 0 0 1px rgba(199,164,94,.18);mix-blend-mode:multiply;padding:0;pointer-events:none;user-select:none;-webkit-user-select:none}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-highlight{overflow:visible;background:transparent;box-shadow:none;mix-blend-mode:normal;pointer-events:none;user-select:none;-webkit-user-select:none}',
    );
  });

  it('keeps reader chat colors on reader theme tokens', () => {
    const chatStyles = readerConversationStyles.slice(
      readerConversationStyles.indexOf('.reader-chat-fab{'),
      readerConversationStyles.indexOf('.reader-highlight-choice-menu{'),
    );

    expect(chatStyles).toContain('background:var(--app-reader-chat-panel-bg)');
    expect(chatStyles).toContain('background:var(--app-reader-chat-user-bubble-bg)');
    expect(chatStyles).toContain('color:var(--app-reader-chat-user-bubble-fg)');
    expect(chatStyles).toContain('background:var(--app-reader-chat-assistant-bubble-bg)');
    expect(chatStyles).toContain('background:var(--app-reader-chat-send-bg)');
    expect(chatStyles).toContain('width:var(--reader-chat-panel-width');
    expect(chatStyles).toContain('--reader-chat-fab-return-dur:250ms');
    expect(chatStyles).toContain('.reader-chat-fab.is-returning');
    expect(chatStyles).toContain('@keyframes reader-chat-fab-return');
    expect(chatStyles).toContain('--reader-chat-morph-open-dur:350ms');
    expect(chatStyles).toContain('--reader-chat-morph-close-dur:250ms');
    expect(chatStyles).toContain('width:var(--reader-chat-morph-closed-size)');
    expect(chatStyles).toContain('height:var(--reader-chat-morph-closed-size)');
    expect(chatStyles).toContain('border-radius:var(--reader-chat-morph-closed-radius)');
    expect(chatStyles).toContain('filter:blur(var(--reader-chat-morph-blur))');
    expect(chatStyles).toContain('.reader-chat-fab-shortcut');
    expect(chatStyles).toContain('overflow:hidden');
    expect(chatStyles).toContain('.reader-chat-panel.is-opening');
    expect(chatStyles).toContain('.reader-chat-panel.is-closing');
    expect(chatStyles).toContain('.reader-chat-panel.is-resizing');
    expect(chatStyles).toContain('.reader-chat-fab.is-returning{animation:none!important');
    expect(chatStyles).toContain('.reader-chat-panel>.reader-chat-header');
    expect(chatStyles).toContain('.reader-chat-resize-handle.is-top-left');
    expect(chatStyles).not.toContain('.reader-chat-resize-handle.is-top-left::after');
    expect(chatStyles).not.toContain('#fffaf0');
  });

  it('renders search matches as filled highlights instead of annotation underlines', () => {
    expect(readerConversationStyles).toContain('--reader-search-highlight:color-mix');
    expect(readerConversationStyles).toContain('.reader-highlight.is-search::before{display:none}');
    expect(readerConversationStyles).toContain(
      '.reader-highlight.is-search.is-active{background:var(--reader-search-highlight-active)',
    );
  });

  it('does not render annotation cards with a thicker left rail', () => {
    expect(readerConversationStyles).not.toContain('border-left-width:4px');
    expect(readerConversationStyles).not.toContain('border-radius:18px 18px 18px 7px');
    expect(readerConversationStyles).not.toContain(
      '.reader-discussion-thread.is-open{grid-template-rows:auto auto auto;border-color:rgba(40,35,29,.16)',
    );
    expect(readerConversationStyles).toContain(
      '.reader-discussion-thread.is-open{grid-template-rows:auto auto auto;margin-bottom:14px;border:1px solid var(--app-reader-note-border);outline:0;background:var(--reader-paper);box-shadow:none}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-thread-detail{display:grid;max-height:min(calc(var(--app-viewport-height) * 0.46),420px);min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;gap:0;padding:0 14px 18px}',
    );
  });

  it('keeps delete actions as neutral menu items', () => {
    expect(readerConversationStyles).not.toContain('.reader-comment .reader-comment-author span{');
    expect(readerConversationStyles).toContain('.reader-comment .reader-comment-author>span{');
    expect(readerConversationStyles).toContain(
      '.reader-action-menu-panel{display:grid;min-width:132px;padding:4px;border:1px solid var(--app-reader-selection-menu-border,color-mix(in srgb,var(--app-reader-ink,#251d16) 12%,transparent));border-radius:10px;background:var(--reader-paper,var(--app-reader-paper,#fffaf0));',
    );
    expect(readerConversationStyles).toContain(
      '.reader-action-delete{width:100%;height:32px;justify-content:flex-start;border-radius:7px;background:transparent;box-shadow:none;',
    );
    expect(readerConversationStyles).toContain(
      '.reader-delete-note>span{display:inline;width:auto;height:auto;place-items:normal;border-radius:0;background:transparent;color:inherit;font-size:inherit;font-weight:inherit;line-height:1;padding:0}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-delete-note:hover{background:color-mix(in srgb,var(--reader-red,var(--app-reader-danger,#8a3f32)) 7%,transparent)}',
    );
    // 删除入口改为点击触发确认弹窗，不再保留长按进度条与计时动画。
    expect(readerConversationStyles).not.toContain('reader-delete-hold');
    expect(readerConversationStyles).not.toContain('.reader-delete-note.is-holding');
  });

  it('keeps reader portal surfaces on app-level fallbacks', () => {
    expect(readerConversationStyles).toContain(
      '.reader-confirm-overlay{position:fixed;inset:0;z-index:var(--reader-z-modal,var(--app-z-modal,320));',
    );
    expect(readerConversationStyles).toContain(
      'background:var(--reader-paper,var(--app-reader-paper,#fffaf0));',
    );
    expect(readerConversationStyles).toContain(
      '.reader-confirm-delete{background:var(--reader-red,var(--app-reader-danger,#8a3f32));color:var(--app-reader-paper,#fff)}',
    );
  });

  it('styles shortcut tooltips and keeps composer cancel neutral', () => {
    expect(readerConversationStyles).toContain('.reader-tooltip-content{');
    expect(readerConversationStyles).toContain(
      'z-index:var(--reader-z-tooltip,var(--app-z-tooltip,340));',
    );
    expect(readerConversationStyles).toContain(
      'background:var(--reader-ink,var(--app-reader-ink,#251d16));',
    );
    expect(readerConversationStyles).toContain(
      '.reader-tooltip-content[data-state="delayed-open"]{animation:reader-tooltip-in .12s ease-out}',
    );
    expect(readerConversationStyles).not.toContain(
      '.reader-tooltip-content[data-state="delayed-open"],.reader-tooltip-content[data-state="instant-open"]',
    );
    expect(readerConversationStyles).toContain('.reader-shortcut-tooltip{');
    expect(readerConversationStyles).toContain(
      '.reader-composer .floating-composer-actions .reader-composer-cancel{background:color-mix(in srgb,var(--reader-ink) 8%,transparent);color:var(--reader-ink)}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-composer{--transform-origin:24px 18px;position:absolute;z-index:var(--reader-z-popover);width:min(520px,calc(100vw - 24px));',
    );
    expect(readerConversationStyles).toContain(
      '.reader-composer[data-placement="above"]{--transform-origin:24px calc(100% - 18px)}',
    );
    expect(readerConversationStyles).not.toContain('reader-composer-pop');
    expect(readerConversationStyles).not.toContain('scale(.88)');
    expect(readerConversationStyles).toContain(
      '.reader-composer textarea{display:block;min-height:88px;max-height:calc(1.55em * 8 + 28px);',
    );
    expect(readerConversationStyles).toContain(
      '.reader-composer-editor{position:relative;display:grid;grid-template-rows:minmax(0,auto) auto;gap:10px;min-width:0;border:0;border-radius:0;background:',
    );
    expect(readerConversationStyles).toContain(
      'background:transparent;font-size:14px;line-height:1.55;padding:0;resize:none}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-composer .floating-composer-actions{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:flex-end;gap:8px;margin-left:auto}',
    );
  });

  it('uses shared stacked assistant avatars and neutral selection surfaces', () => {
    expect(readerConversationStyles).toContain(
      '.reader-agent-avatar-stack-item{position:relative;display:grid;flex:0 0 auto;width:28px;min-width:28px;max-width:28px;height:28px;',
    );
    expect(readerConversationStyles).toContain(
      '.reader-comment-agent-tray .reader-agent-avatar-stack,.reader-comment-agent-tray .reader-agent-avatar-stack-item{overflow:visible}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-selection-primary{height:36px;border:1px solid var(--reader-ink-hairline);background:var(--reader-paper);',
    );
    expect(readerConversationStyles).toContain(
      '.reader-composer .reader-agent-menu,.reader-comment-box .reader-agent-menu{right:auto;bottom:calc(100% + 8px);width:190px;',
    );
  });

  it('keeps long annotation text at readable body weights', () => {
    expect(readerConversationStyles).toContain(
      '.reader-note-quote-text{display:block;min-width:0;max-width:100%;overflow-wrap:anywhere;color:var(--reader-ink);font-size:14.5px;font-style:normal;font-weight:600;line-height:1.72;text-wrap:pretty;word-break:break-word}',
    );
    expect(readerConversationStyles).not.toContain(
      '.reader-note-quote:hover .reader-note-quote-text',
    );
    expect(readerConversationStyles).not.toContain(
      '.reader-note-quote-text{display:block;color:var(--reader-ink);font-size:14px;font-style:normal;font-weight:690;line-height:1.72;text-wrap:pretty;transition:color',
    );
    expect(readerConversationStyles).toContain(
      '.reader-thought-summary .reader-markdown-content,.reader-thought-summary .reader-markdown-content p{font-size:13px;font-weight:520;line-height:1.68}',
    );
  });

  it('does not recolor annotation quotes on hover', () => {
    expect(readerStyles).not.toContain('.reader-note-quote:hover{color:var(--reader-red)}');
    expect(readerConversationStyles).not.toContain(
      '.reader-note-quote:hover .reader-note-quote-text{color:var(--reader-red)}',
    );
  });

  it('keeps distillation card action hover aligned with annotation cards', () => {
    expect(readerConversationStyles).toContain(
      '.reader-action-menu-button:hover,.reader-action-menu.is-open .reader-action-menu-button{background:var(--reader-paper-hover);color:var(--reader-ink)}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note.has-discussion .reader-action-menu-button:hover,.reader-note.has-discussion .reader-action-menu.is-open .reader-action-menu-button,.reader-note-distillation-menu .reader-action-menu-button:hover,.reader-note-distillation-menu.is-open .reader-action-menu-button{background:var(--reader-paper-hover);color:var(--reader-ink)}',
    );
  });

  it('keeps redesigned annotation cards on reader theme tokens', () => {
    expect(readerConversationStyles).toContain(
      '.reader-note.has-discussion,.reader-note.has-distillation{position:relative;overflow:visible;padding:11px;border:1px solid var(--app-reader-note-annotation-border);',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note.has-discussion .reader-note-tab{border:1px solid var(--app-reader-note-annotation-border);border-bottom:0;background:var(--reader-note-surface);color:color-mix(in srgb,var(--reader-note-accent) 76%,var(--reader-ink))}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note.has-discussion .reader-note-body,.reader-note.has-distillation .reader-note-body{position:relative;min-width:0;overflow:visible;border-radius:10px 0 10px 0;background:var(--reader-note-surface);',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note.has-discussion .reader-note-toolbar{align-items:center;gap:8px;margin:8px 0 0;padding:0;border-top:0;background:transparent}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note-discussion-entry{position:relative;display:inline-flex;flex:0 0 auto;min-width:86px;min-height:30px;',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note-discussion-entry::after{content:"";position:absolute;inset:-5px 0}',
    );
    expect(readerConversationStyles).not.toContain('.reader-note-me-badge');
    expect(readerConversationStyles).toContain(
      '.reader-note.has-distillation{padding-bottom:0;border-color:var(--app-reader-note-distillation-border);background:var(--app-reader-note-distillation-mat);--reader-note-accent:var(--app-reader-note-distillation-accent);--reader-note-border:var(--app-reader-note-distillation-border);--reader-note-surface:var(--app-reader-note-distillation-surface)}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note.has-distillation .reader-note-tab{top:-14px;border:1px solid var(--reader-note-accent);background:var(--reader-note-accent);color:var(--app-reader-note-distillation-tab-fg)}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note-distillation-footer{position:relative;z-index:1;display:flex;justify-content:flex-end;margin:0;padding:4px 12px 7px;border-top:0;background:transparent}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note.is-distillation-dual-morph{overflow:visible;padding:0;border:0;background:transparent;box-shadow:none;transition:height .55s cubic-bezier(.22,1,.36,1),',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note-dual-face-distillation{z-index:3;padding:11px 11px 0;border:1px solid var(--app-reader-note-distillation-border);',
    );
    expect(readerConversationStyles).toContain(
      '--reader-note-surface:var(--app-reader-note-distillation-surface);transition:clip-path .62s cubic-bezier(.22,1,.36,1),opacity .62s step-end}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note.is-dual-stamp-in .reader-note-dual-face-distillation{animation:reader-distillation-stamp-in .62s cubic-bezier(.22,1,.36,1) both}',
    );
    expect(readerConversationStyles).toContain(
      '@keyframes reader-distillation-stamp-in{0%{transform:scale(1.45) rotate(-7deg);opacity:0}',
    );
    expect(readerConversationStyles).not.toContain('reader-note-unpublish-overlay');
    expect(readerConversationStyles).not.toContain('reader-distillation-cloud-recede');
    expect(readerConversationStyles).not.toContain('reader-annotation-reveal-in');
  });

  it('keeps the reader surface as the stable scroll container while assistant menus are open', () => {
    expect(readerDesktopEmbeddedStyles).not.toContain(
      '.reader-app.is-embedded:has(.reader-agent-menu) .reader-surface',
    );
    expect(readerDesktopEmbeddedStyles).not.toContain(
      '.reader-app.is-embedded:has(.reader-comment-agent-more-menu) .reader-surface',
    );
  });

  it('keeps the empty annotation state centered and visually quiet', () => {
    expect(readerConversationStyles).toContain(
      '.reader-annotation-rail>.reader-empty{position:absolute;left:var(--reader-empty-left,0);top:var(--reader-empty-top,50vh);',
    );
    expect(readerConversationStyles).toContain('transform:translateY(-50%)');
    expect(readerConversationStyles).toContain(
      '.reader-empty{display:grid;justify-items:center;gap:14px;margin:0;padding:18px 4px;border:0!important;',
    );
    expectCssNotToContain(readerStyles, '.reader-empty,.reader-note{');
    expectCssToContain(
      readerStyles,
      '.reader-empty{display:grid;justify-items:center;gap:14px;margin:0;padding:18px 4px;border:0;',
    );
    expect(readerConversationStyles).toContain(
      '.reader-empty-gesture{display:grid;width:min(260px,100%);justify-items:center;gap:9px;margin-top:8px}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-empty,.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-note{position:relative;top:auto!important;left:auto!important;width:100%;pointer-events:auto;transform:none}',
    );
  });

  it('keeps rail cards out of normal document flow', () => {
    const cardSurfaceIndex = readerConversationStyles.indexOf(
      '.reader-note.has-discussion,.reader-note.has-distillation{position:relative;',
    );
    const railOverrideIndex = readerConversationStyles.indexOf(
      '.reader-annotation-rail>.reader-note.has-discussion,.reader-annotation-rail>.reader-note.has-distillation{position:absolute}',
    );
    const stackedOverrideIndex = readerConversationStyles.indexOf(
      '.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-empty,.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-note{position:relative;',
    );

    expect(cardSurfaceIndex).toBeGreaterThanOrEqual(0);
    expect(railOverrideIndex).toBeGreaterThan(cardSurfaceIndex);
    expect(stackedOverrideIndex).toBeGreaterThan(railOverrideIndex);
  });
});

function combinedReaderStyles() {
  return readerDesktopEmbeddedBundleStyles;
}

function expectCssToContain(source: string, expected: string) {
  expect(compactCss(source)).toContain(compactCss(expected));
}

function expectCssNotToContain(source: string, expected: string) {
  expect(compactCss(source)).not.toContain(compactCss(expected));
}

function compactCss(source: string) {
  return source
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function countOccurrences(source: string, needle: string) {
  const compactSource = compactCss(source);
  const compactNeedle = compactCss(needle);

  return compactSource.split(compactNeedle).length - 1;
}
