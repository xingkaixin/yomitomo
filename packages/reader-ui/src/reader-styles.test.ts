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

    const baseIndex = readerDesktopEmbeddedBundleStyles.indexOf(':host{all:initial');
    const conversationIndex = readerDesktopEmbeddedBundleStyles.indexOf(
      '.reader-main{grid-template-columns:minmax(0,1fr)}',
    );
    const embeddedIndex = readerDesktopEmbeddedBundleStyles.indexOf(
      '.source-reader-shell{grid-template-rows:minmax(0,1fr);padding:0}',
    );

    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(conversationIndex).toBeGreaterThan(baseIndex);
    expect(embeddedIndex).toBeGreaterThan(conversationIndex);
  });

  it('uses app-provided reader theme variables for core reader surfaces', () => {
    expect(combinedReaderStyles()).toContain('--reader-bg:var(--app-reader-bg)');
    expect(readerConversationStyles).toContain('--reader-z-popover:var(--app-z-popover,160)');
    expect(readerConversationStyles).toContain('--reader-z-tooltip:var(--app-z-tooltip,340)');
    expect(readerConversationStyles).toContain('--app-viewport-height:100vh');
    expect(readerConversationStyles).toContain('@supports (height:100dvh)');
    expect(combinedReaderStyles()).toContain('--reader-content-bg');
    expect(combinedReaderStyles()).toContain(
      '.reader-article{background:var(--reader-content-bg,var(--reader-paper))}',
    );
    expect(combinedReaderStyles()).toContain('.reader-background-options{');
    expect(combinedReaderStyles()).toContain('background:var(--app-reader-edge-blur-top)');
    expect(combinedReaderStyles()).toContain('background:var(--app-reader-scrim)');
    expect(readerDesktopEmbeddedStyles).toContain('--reader-bg:var(--app-reader-bg)');
    expect(combinedReaderStyles()).not.toContain('--reader-bg:#f5f1e8');
    expect(readerDesktopEmbeddedStyles).not.toContain('--reader-bg:#f5f1e8');
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
    expect(readerStyles).toContain(
      '.reader-article blockquote{margin-left:0;padding-left:22px;border-left:4px solid var(--reader-yellow);color:var(--reader-ink)}',
    );
    expect(combinedReaderStyles()).toContain(
      '.reader-markdown blockquote{margin:8px 0;padding-left:10px;border-left:3px solid color-mix(in srgb,var(--reader-red) 28%,transparent);color:var(--reader-ink)}',
    );
    expect(readerStyles).not.toContain(
      '.reader-article blockquote{margin-left:0;padding-left:22px;border-left:4px solid var(--reader-yellow);color:#574f45}',
    );
    expect(readerStyles).not.toContain(
      '.reader-markdown blockquote{margin:8px 0;padding-left:10px;border-left:3px solid rgba(159,91,80,.28);color:#5d5147}',
    );
  });

  it('uses the shared body line height for article reading', () => {
    expect(readerStyles).toContain(
      `.reader-article{position:relative;z-index:1;padding:56px 64px;border:1px solid var(--app-reader-note-border);border-radius:22px;background:var(--reader-paper);box-shadow:var(--app-reader-note-shadow);font-size:var(--reader-font-size);line-height:${readerBodyLineHeight};`,
    );
  });

  it('disables article text selection during visible translation work', () => {
    expect(readerStyles).toContain(
      '.reader-article-body.is-translation-select-disabled{user-select:none;-webkit-user-select:none}',
    );
    expect(readerStyles).toContain('.reader-bilingual-translation-indicator.is-failed{');
  });

  it('keeps highlight controls out of native text selection', () => {
    expect(combinedReaderStyles()).toContain(
      '.reader-highlight-layer{position:absolute;inset:0;z-index:3;pointer-events:none;user-select:none;-webkit-user-select:none}',
    );
    expect(combinedReaderStyles()).toContain(
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
    expect(chatStyles).toContain('.reader-chat-fab-shortcut');
    expect(chatStyles).toContain('overflow:hidden');
    expect(chatStyles).toContain('.reader-chat-panel.is-opening');
    expect(chatStyles).toContain('.reader-chat-panel.is-closing');
    expect(chatStyles).toContain('.reader-chat-panel.is-resizing');
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
    expect(readerConversationStyles).toContain('.reader-shortcut-tooltip{');
    expect(readerConversationStyles).toContain(
      '.reader-composer .floating-composer-actions .reader-composer-cancel{background:color-mix(in srgb,var(--reader-ink) 8%,transparent);color:var(--reader-ink)}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-composer{position:absolute;z-index:var(--reader-z-popover);width:min(520px,calc(100vw - 24px));',
    );
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
      '.reader-note-quote-text{display:block;color:var(--reader-ink);font-size:14.5px;font-style:normal;font-weight:600;line-height:1.72',
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
      '.reader-note.has-discussion .reader-note-tab{border:1px solid var(--app-reader-note-annotation-border);border-bottom:0;background:var(--reader-paper);color:color-mix(in srgb,var(--reader-note-accent) 76%,var(--reader-ink))}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note.has-discussion .reader-note-toolbar{align-items:center;gap:10px;margin:14px 0 0;padding:13px 0 0;border-top:1px solid var(--reader-ink-hairline);background:transparent}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note-discussion-entry{position:relative;display:inline-flex;flex:0 0 auto;min-width:92px;min-height:34px;',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note-discussion-entry::after{content:"";position:absolute;inset:-3px -4px}',
    );
    expect(readerConversationStyles).not.toContain('.reader-note-me-badge');
    expect(readerConversationStyles).toContain(
      '.reader-note.has-distillation{padding-bottom:0;border-color:var(--app-reader-note-distillation-border);background:var(--app-reader-note-distillation-mat);--reader-note-accent:var(--app-reader-note-distillation-accent);--reader-note-border:var(--app-reader-note-distillation-border)}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note.has-distillation .reader-note-tab{top:-14px;border:1px solid var(--reader-note-accent);background:var(--reader-note-accent);color:var(--app-reader-note-distillation-tab-fg)}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note-distillation-footer{position:relative;z-index:1;display:flex;justify-content:flex-end;margin:0;padding:4px 12px 7px;border-top:0;background:transparent}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note.is-distillation-morph-in[data-distillation-transition="publish"] .reader-note-body,.reader-note.is-distillation-morph-in[data-distillation-transition="publish"] .reader-note-tab,.reader-note.is-distillation-morph-in[data-distillation-transition="publish"] .reader-note-distillation-footer{transform-origin:center center;will-change:transform,opacity;animation:reader-distillation-stamp-in 620ms cubic-bezier(.22,1,.36,1) both}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-note-unpublish-overlay{position:absolute;inset:0;z-index:8;overflow:visible;padding:11px 11px 0;border:1px solid var(--app-reader-note-distillation-border);',
    );
    expect(readerConversationStyles).toContain(
      'animation:reader-distillation-cloud-recede 620ms cubic-bezier(.22,1,.36,1) both',
    );
    expect(readerConversationStyles).toContain(
      '@keyframes reader-distillation-cloud-recede{0%{clip-path:circle(170% at 58px -1px);',
    );
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
    expect(readerStyles).not.toContain('.reader-empty,.reader-note{');
    expect(readerStyles).toContain(
      '.reader-empty{display:grid;justify-items:center;gap:14px;margin:0;padding:18px 4px;border:0;',
    );
    expect(readerConversationStyles).toContain(
      '.reader-empty-gesture{display:grid;width:min(260px,100%);justify-items:center;gap:9px;margin-top:8px}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-empty,.reader-app.is-annotation-stacked .reader-annotation-rail>.reader-note{position:relative;top:auto!important;left:auto!important;width:100%;pointer-events:auto;transform:none}',
    );
  });
});

function combinedReaderStyles() {
  return readerDesktopEmbeddedBundleStyles;
}
