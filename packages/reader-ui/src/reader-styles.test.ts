import { describe, expect, it } from 'vitest';
import {
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
} from './reader-styles';

describe('reader embedded styles', () => {
  it('uses app-provided reader theme variables for core reader surfaces', () => {
    expect(combinedReaderStyles()).toContain('--reader-bg:var(--app-reader-bg)');
    expect(combinedReaderStyles()).toContain('background:var(--app-reader-edge-blur-top)');
    expect(combinedReaderStyles()).toContain('background:var(--app-reader-scrim)');
    expect(readerDesktopEmbeddedStyles).toContain('--reader-bg:var(--app-reader-bg)');
    expect(combinedReaderStyles()).not.toContain('--reader-bg:#f5f1e8');
    expect(readerDesktopEmbeddedStyles).not.toContain('--reader-bg:#f5f1e8');
  });

  it('does not render annotation cards with a thicker left rail', () => {
    expect(readerConversationStyles).not.toContain('border-left-width:4px');
    expect(readerConversationStyles).not.toContain('border-radius:18px 18px 18px 7px');
    expect(readerConversationStyles).not.toContain(
      '.reader-discussion-thread.is-open{grid-template-rows:auto auto auto;border-color:rgba(40,35,29,.16)',
    );
    expect(readerConversationStyles).toContain(
      '.reader-discussion-thread.is-open{grid-template-rows:auto auto auto;margin-bottom:14px;border:1px solid rgba(40,35,29,.1);outline:0;background:var(--reader-paper);box-shadow:none}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-thread-detail{display:grid;max-height:min(46vh,420px);min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;gap:0;padding:0 14px 18px}',
    );
  });

  it('keeps delete actions as neutral menu items', () => {
    expect(readerConversationStyles).not.toContain('.reader-comment .reader-comment-author span{');
    expect(readerConversationStyles).toContain('.reader-comment .reader-comment-author>span{');
    expect(readerConversationStyles).toContain(
      '.reader-action-menu-panel{position:absolute;right:0;top:calc(100% + 7px);z-index:36;display:grid;min-width:132px;padding:4px;border:1px solid var(--app-reader-selection-menu-border);border-radius:10px;background:var(--reader-paper);',
    );
    expect(readerConversationStyles).toContain(
      '.reader-action-delete{width:100%;height:32px;justify-content:flex-start;border-radius:7px;background:transparent;box-shadow:none;',
    );
    expect(readerConversationStyles).toContain(
      '.reader-delete-note>span{display:inline;width:auto;height:auto;place-items:normal;border-radius:0;background:transparent;color:inherit;font-size:inherit;font-weight:inherit;line-height:1;padding:0}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-delete-note::before{content:"";position:absolute;inset:0 auto 0 0;width:0;background:color-mix(in srgb,var(--reader-red) 14%,transparent);z-index:0}',
    );
    expect(readerConversationStyles).toContain(
      '.reader-delete-note:hover{background:color-mix(in srgb,var(--reader-red) 7%,transparent)}',
    );
    expect(readerConversationStyles).not.toContain(
      '.reader-delete-note::before{content:"";position:absolute;inset:0 auto 0 0;width:0;background:rgba(159,91,80,.14);z-index:0}',
    );
  });

  it('styles shortcut tooltips and keeps composer cancel neutral', () => {
    expect(readerConversationStyles).toContain('.reader-tooltip-content{');
    expect(readerConversationStyles).toContain('.reader-shortcut-tooltip{');
    expect(readerConversationStyles).toContain(
      '.reader-composer-actions .reader-composer-cancel{background:rgba(40,35,29,.08);color:var(--reader-ink)}',
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
      '.reader-selection-primary{height:36px;border:1px solid rgba(37,29,22,.09);background:var(--reader-paper);',
    );
    expect(readerConversationStyles).toContain(
      '.reader-composer .reader-agent-menu,.reader-comment-box .reader-agent-menu{right:auto;bottom:calc(100% + 8px);width:190px;',
    );
  });

  it('keeps long annotation text at readable body weights', () => {
    expect(readerConversationStyles).toContain(
      '.reader-note-quote-text{display:block;color:var(--reader-ink);font-size:13px;font-style:normal;font-weight:620;line-height:1.68',
    );
    expect(readerConversationStyles).toContain(
      '.reader-thought-summary .reader-markdown-content,.reader-thought-summary .reader-markdown-content p{font-size:13px;font-weight:520;line-height:1.68}',
    );
  });

  it('keeps the reader surface as the stable scroll container while assistant menus are open', () => {
    expect(readerDesktopEmbeddedStyles).not.toContain(
      '.reader-app.is-embedded:has(.reader-agent-menu) .reader-surface',
    );
    expect(readerDesktopEmbeddedStyles).not.toContain(
      '.reader-app.is-embedded:has(.reader-comment-agent-more-menu) .reader-surface',
    );
  });
});

function combinedReaderStyles() {
  return readerStyles + readerConversationStyles + readerDesktopEmbeddedStyles;
}
