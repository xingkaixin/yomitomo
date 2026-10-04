import { describe, expect, it } from 'vitest';
import {
  readerConversationStyles as readerConversationStylesSource,
  readerDesktopEmbeddedBundleStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
} from './reader-styles';

const readerConversationStyles = compactCss(readerConversationStylesSource);
const embeddedStyles = compactCss(readerDesktopEmbeddedBundleStyles);

describe('reader interaction styles', () => {
  it('keeps toolbar controls clickable over draggable window chrome', () => {
    expect(readerConversationStyles).toContain(
      '.reader-back,.reader-toolbar-actions,.reader-toolbar-article-action,.reader-toolbar button{-webkit-app-region:no-drag}',
    );
  });

  it('disables article text selection during visible translation work', () => {
    expect(compactCss(readerStyles)).toMatch(
      /\.reader-article-body\.is-translation-select-disabled\{[^}]*user-select:none;/,
    );
  });

  it('keeps highlight controls out of native text selection', () => {
    expect(embeddedStyles).toMatch(
      /\.reader-highlight-layer\{[^}]*pointer-events:none;[^}]*user-select:none;/,
    );
    expect(embeddedStyles).toMatch(
      /\.reader-highlight\{[^}]*pointer-events:none;[^}]*user-select:none;/,
    );
    expect(embeddedStyles).toMatch(
      /\.reader-selection-handle\{[^}]*pointer-events:auto;[^}]*touch-action:none;[^}]*user-select:none;/,
    );
  });

  it('disables popup movement for reduced motion', () => {
    expect(readerConversationStyles).toContain(
      '@media(prefers-reduced-motion:reduce){.t-dropdown,.t-dropdown[data-closed],.t-dropdown[data-ending-style]{transform:none!important;transition:none!important}',
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

function compactCss(source: string) {
  return source
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}
