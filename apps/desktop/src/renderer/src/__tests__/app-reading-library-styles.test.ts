import { readFileSync } from 'node:fs';
import { readRendererStyles } from './css-test-utils';
import { describe, expect, it } from 'vitest';

const styles = readRendererStyles();
const importOverrides = readFileSync(
  new URL('../styles/theme-overrides/library-import.css', import.meta.url),
  'utf8',
);

function rulesFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    styles.matchAll(new RegExp(`${escapedSelector} \\{(?<body>[^}]+)\\}`, 'g')),
  ).map((match) => match.groups?.body || '');
}

function expectRule(selector: string, properties: string[]) {
  expect(
    rulesFor(selector).some((rule) => properties.every((property) => rule.includes(property))),
  ).toBe(true);
}

function expectFinalRule(selector: string, properties: string[]) {
  const rule = rulesFor(selector).at(-1);
  expect(rule).toBeDefined();
  expect(properties.every((property) => rule?.includes(property))).toBe(true);
}

function countOccurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

describe('reading library styles', () => {
  it('keeps long document list text inside the item bounds', () => {
    expectRule('.library-ebook-list-copy', ['min-width: 0;', 'overflow: hidden;']);
    expectRule('.library-ebook-list-source', ['min-width: 0;', 'overflow: hidden;']);
    expectRule('.library-ebook-list-source span', [
      'max-width: 100%;',
      'text-overflow: ellipsis;',
      'white-space: nowrap;',
    ]);
    expectRule('.library-ebook-list-main', ['overflow: hidden;']);
    expectRule('.library-ebook-list-item h3', [
      'overflow-wrap: anywhere;',
      'word-break: break-word;',
    ]);
  });

  it('keeps the weread detail header cover flat', () => {
    expectRule('.weread-book-cover.is-flat-cover', [
      'width: var(--book-cover-width);',
      'height: var(--book-cover-height);',
    ]);
    expect(styles).not.toContain('.weread-bookcase-title:hover .article-book-scene');
    expect(styles).not.toContain('.weread-bookcase-title:hover .article-book-ground-shadow');
  });

  it('truncates long weread detail titles inside the header', () => {
    expectRule('.weread-bookcase-title', ['min-width: 0;']);
    expectRule('.weread-bookcase-title > div', ['min-width: 0;', 'overflow: hidden;']);
    expectRule('.weread-bookcase-title h2', [
      'min-width: 0;',
      'flex: 1 1 auto;',
      'overflow: hidden;',
      'text-overflow: ellipsis;',
      'white-space: nowrap;',
    ]);
    expectRule('.weread-bookcase-title p', [
      'overflow: hidden;',
      'text-overflow: ellipsis;',
      'white-space: nowrap;',
    ]);
    expectRule('.weread-bookcase-actions', ['flex: 0 0 auto;']);
  });

  it('shares book hover motion with web article cards', () => {
    expect(styles).toContain('.library-web-item:hover .article-book-scene');
    expect(styles).toContain('.library-web-item:focus-within .article-book-scene');
    expect(styles).toContain('.library-web-item:hover .article-book');
    expect(styles).toContain('.library-web-item:focus-within .article-book');
    expect(styles).toContain('.library-web-item:hover .article-book-ground-shadow');
    expect(styles).toContain('.library-web-item:focus-within .article-book-ground-shadow');
  });

  it('overlays the web cover chrome without pushing the source metadata down', () => {
    expectRule('.web-cover-body', ['position: absolute;', 'inset: 0;', 'padding: 13% 12%;']);
    expectRule('.web-cover-chrome', ['position: absolute;', 'transform: translateY(-100%);']);
    expect(styles).toMatch(
      /\.library-web-item:hover \.web-cover-chrome,[\s\S]*\.library-web-item:focus-within \.web-cover-chrome \{[\s\S]*transform: translateY\(0\);[\s\S]*\}/,
    );
    expect(styles).not.toContain('.library-web-item:hover .web-cover-body');
    expect(styles).not.toContain('.library-web-item:focus-within .web-cover-body');
    expect(styles).not.toContain('padding-block-start: calc(13% + 22px);');
  });

  it('uses narrower display ratios for PDF and web covers', () => {
    expectRule('.article-book.is-pdf-cover', ['--book-cover-ratio: 0.7;']);
    expectRule('.article-book.is-web-cover', ['--book-cover-ratio: 0.68;']);
    expectRule('.article-book', ['--book-cover-ratio: 0.8167;']);
  });

  it('keeps library card action buttons anchored in narrow card layouts', () => {
    expectRule('.library-home-header-main', [
      'position: relative;',
      'justify-content: center;',
      'gap: 14px;',
    ]);
    expectRule('.library-collection-inline-back', ['position: absolute;', 'top: 2px;', 'left: 0;']);
    expectRule('.library-search-combo', [
      'flex: 0 1 clamp(340px, 34vw, 480px);',
      'width: clamp(340px, 34vw, 480px);',
      'min-width: 0;',
    ]);
    expectRule('.library-add-menu-popover,\n.library-card-menu-popover,\n.library-import-dialog', [
      'background: hsl(var(--popover) / 0.98);',
      'color: hsl(var(--popover-foreground));',
    ]);
    expectRule('.library-add-menu-popover button,\n.library-card-menu-popover button', [
      'color: hsl(var(--popover-foreground));',
    ]);
    expectRule(
      '.library-add-menu-popover button:disabled,\n.library-card-menu-popover button:disabled',
      ['color: hsl(var(--muted-foreground));', 'opacity: 0.52;'],
    );
    expectRule('.library-home-actions .library-add-trigger', [
      'width: 54px;',
      'height: 38px;',
      'padding: 0;',
    ]);
    expectRule('.library-home-actions .inline-flex', ['border-radius: 0;', 'box-shadow: none;']);
    expectRule('.library-search-combo .library-type-filter-trigger', ['width: 108px;']);
    expect(styles).toMatch(
      /\.library-filter-group,[\s\S]*\.library-ebook-layout-toggle \{[\s\S]*display: inline-flex;[\s\S]*border: 1px solid hsl\(var\(--border\) \/ 0\.82\);/,
    );
    expect(styles).toMatch(
      /\.library-filter-group button,[\s\S]*\.library-ebook-layout-toggle button \{[\s\S]*min-height: 36px;[\s\S]*border-right: 1px solid hsl\(var\(--border\) \/ 0\.58\);/,
    );
    expect(styles).toMatch(
      /\.library-filter-group button:last-child,[\s\S]*\.library-ebook-layout-toggle button:last-child \{[\s\S]*border-right: 0;/,
    );
    expect(styles).toMatch(
      /\.library-filter-group button:hover,[\s\S]*\.library-ebook-layout-toggle button\.is-active \{[\s\S]*background: hsl\(var\(--foreground\)\);[\s\S]*color: hsl\(var\(--card\)\);[\s\S]*box-shadow: none;/,
    );
    expectRule('.library-collection-footer-label', [
      'display: inline-flex;',
      'min-width: 0;',
      'gap: 10px;',
    ]);
    expectRule('.library-collection-footer-label strong', [
      'max-width: min(280px, 38vw);',
      'overflow: hidden;',
      'text-overflow: ellipsis;',
      'white-space: nowrap;',
    ]);
    expectRule('.library-collection-footer-label .library-count-stat', [
      'color: hsl(var(--muted-foreground));',
      'font-size: 12px;',
      'font-weight: 760;',
    ]);
    expectRule('.library-collection-footer-label .library-count-stat svg', [
      'width: 13px;',
      'height: 13px;',
    ]);
    expectRule('.library-list', ['grid-template-columns: repeat(3, minmax(0, 1fr));']);
    expectRule('.settings-content', [
      '--library-entity-card-min-width: 400px;',
      '--library-entity-card-max-width: 560px;',
    ]);
    expect(rulesFor('.library-entity-grid').at(-1)).toEqual(expect.stringContaining('auto-fit,'));
    expect(rulesFor('.library-entity-grid').at(-1)).toEqual(
      expect.stringContaining('minmax(min(100%, var(--library-entity-card-min-width)), 1fr)'),
    );
    expect(rulesFor('.library-entity-grid').at(-1)).toEqual(
      expect.stringContaining('grid-auto-rows: minmax(156px, auto);'),
    );
    expectRule('.library-entity-grid > *', [
      'width: 100%;',
      'max-width: var(--library-entity-card-max-width);',
    ]);
    expectRule('.library-skeleton-grid', [
      'auto-fit,',
      'minmax(min(100%, var(--library-entity-card-min-width)), 1fr)',
    ]);
    expectRule('.library-skeleton-card', [
      'width: 100%;',
      'max-width: var(--library-entity-card-max-width);',
    ]);
    expectRule('.library-web-item-cover', ['align-self: start;']);
    expectRule('.library-web-item', ['grid-template-columns: 120px minmax(0, 1fr);']);
    expectRule('.library-web-item-source span', ['font-size: 10px;', 'line-height: 1;']);
    expectRule('.library-web-item h3', [
      '-webkit-line-clamp: 2;',
      'font-size: clamp(19px, 1.45vw, 25px);',
      'overflow-wrap: anywhere;',
      'word-break: break-word;',
    ]);
    expectRule('.library-item-actions', [
      'top: 10px;',
      'right: 10px;',
      'opacity: 0;',
      'transform: none;',
    ]);
    expectRule('.library-list-item .library-item-actions.is-active', ['opacity: 1;']);
    expect(styles).toMatch(
      /\.library-ebook-list-item:focus-within \.library-item-actions \{\s*opacity: 1;/,
    );
    expectRule('.library-web-item', ['padding: 18px 68px 18px 16px;']);
    expectRule('.library-ebook-list-item', ['padding: 18px 68px 18px 0;']);
    expectRule('.library-ebook-list-item', ['padding: 18px 68px 18px 16px;']);
    expectRule(
      '.library-entity-grid .library-article-list-item.library-web-item,\n.library-entity-grid .library-article-list-item.library-ebook-list-item',
      ['min-height: 156px;', 'padding: 14px 68px 14px 8px;'],
    );
    expectRule('.library-entity-grid .library-collection-list-item', [
      'min-height: 156px;',
      'border-right: 1px solid hsl(var(--border) / 0.72);',
      'padding: 0;',
    ]);
    // The collection blends into the grid: no floating-card chrome on the fan.
    expectRule('.library-collection-fan', ['overflow: hidden;']);
    expect(rulesFor('.library-collection-fan').some((rule) => rule.includes('box-shadow'))).toBe(
      false,
    );
    expect(rulesFor('.library-collection-fan').some((rule) => rule.includes('border-radius'))).toBe(
      false,
    );
    expectRule('.library-collection-fan-copy', ['justify-content: space-between;']);
    expectRule('.library-collection-fan-foot', ['align-items: center;']);
    expectRule('.library-collection-fan-kicker', ['color: var(--app-interactive-link);']);
    expectRule('.library-collection-fan h3', ['color: hsl(var(--foreground));']);
    expectRule('.library-collection-fan-card', [
      '--fan-rel: calc(var(--fan-index, 0) - (var(--fan-count, 1) - 1) / 2);',
      'z-index: calc(10 - var(--fan-index, 0));',
    ]);
    expect(
      rulesFor(
        '.library-collection-list-item:hover .library-collection-fan-card,\n.library-collection-list-item:focus-within .library-collection-fan-card',
      ).some((rule) => rule.includes('rotate(0deg)')),
    ).toBe(true);
    expectRule('.library-collection-fan .library-card-pin-indicator', [
      'align-self: center;',
      'width: 18px;',
      'height: 18px;',
      'color: var(--app-interactive-link);',
      'transform: none;',
    ]);
    expectRule(
      '.library-collection-fan-card .article-book,\n.library-collection-fan-card .weread-book-cover',
      [
        '--book-cover-height: 92px;',
        '--book-depth: 0px;',
        'width: var(--book-cover-width);',
        'height: var(--book-cover-height);',
      ],
    );
    expectRule('.library-collection-fan-card .article-book-scene', [
      'top: 0;',
      'left: 0;',
      'transform: none;',
    ]);
    expectRule('.library-collection-fan-placeholder', ['width: 64px;', 'height: 92px;']);
    expect(styles).not.toContain('.library-collection-cover-stack');
    expect(styles).not.toContain('.library-collection-cover-item');
    expect(styles).not.toContain('.library-collection-front');
    expect(styles).not.toContain('--app-collection-cover-');
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.library-collection-fan-card \{[\s\S]*transition: none;/,
    );
    expectRule('.library-collection-picker-list > .library-collection-picker-item.is-dragging', [
      'opacity: 0.36;',
    ]);
    expectRule(
      '.library-collection-picker-cover .article-book,\n.library-collection-picker-cover .weread-book-cover,\n.library-collection-picker-selected-cover .article-book,\n.library-collection-picker-selected-cover .weread-book-cover',
      [
        '--book-depth: 0px;',
        'width: var(--book-cover-width);',
        'height: var(--book-cover-height);',
      ],
    );
    expectRule('.library-collection-picker-selected-grid', [
      'grid-template-columns: repeat(auto-fill, 64px);',
      'justify-content: start;',
    ]);
    expectRule('.library-collection-picker-selected-item', ['width: 64px;']);
    expectRule('.library-collection-picker-selected-remove', [
      'top: 50%;',
      'left: 50%;',
      'width: 26px;',
      'height: 26px;',
    ]);
    expect(styles).toMatch(
      /\.library-entity-grid \.library-article-list-item \.library-web-item-meta,[\s\S]*\.library-entity-grid \.library-article-list-item \.library-ebook-list-meta \{[\s\S]*justify-content: space-between;[\s\S]*width: 100%;[\s\S]*margin-top: auto;[\s\S]*margin-bottom: 2px;/,
    );
    expect(styles).toMatch(
      /\.library-entity-grid \.library-article-list-item \.library-count-stats \{[\s\S]*justify-content: flex-end;[\s\S]*flex-wrap: nowrap;[\s\S]*margin-right: -58px;/,
    );
    expect(styles).toMatch(
      /\.library-entity-grid \.library-article-list-item \.library-item-date-source \{[\s\S]*display: inline-flex;[\s\S]*gap: 7px;/,
    );
    expect(styles).toMatch(
      /\.library-entity-grid[\s\S]*\.article-book\.is-web-cover[\s\S]*\+ \.library-cover-progress \{[\s\S]*transform: none;/,
    );
    expect(styles).toMatch(
      /\.library-entity-grid \.library-article-list-item \.library-web-item-cover,[\s\S]*\.library-entity-grid \.library-article-list-item \.library-ebook-cover-column \{[\s\S]*width: 126px;[\s\S]*align-content: center;[\s\S]*align-self: center;[\s\S]*justify-items: center;/,
    );
    expect(styles).toMatch(
      /\.library-entity-grid \.library-article-list-item \.library-cover-progress,[\s\S]*\.library-entity-grid \.library-article-list-item \.library-ebook-progress \{[\s\S]*inset: auto;[\s\S]*width: 58px;[\s\S]*transform: translateX\(-10px\);/,
    );
    expect(styles).toMatch(
      /\.library-entity-grid \.library-article-list-item \.library-ebook-cover-column \.library-cover-progress,[\s\S]*\.library-entity-grid\s+\.library-article-list-item\s+\.library-ebook-cover-column\s+\.library-ebook-progress \{[\s\S]*transform: translateX\(-10px\);/,
    );
    expect(styles).toMatch(
      /@container app-content \(max-width: 980px\) \{[\s\S]*\.library-home \.library-home-actions \{[\s\S]*display: flex;[\s\S]*width: auto;[\s\S]*flex: 0 0 auto;/,
    );
    expect(styles).toMatch(
      /@container app-content \(max-width: 980px\) \{[\s\S]*\.library-home \.library-search \{[\s\S]*flex: 0 1 clamp\(340px, 34vw, 480px\);[\s\S]*width: clamp\(340px, 34vw, 480px\);[\s\S]*min-width: 0;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 980px\) \{[\s\S]*\.library-home \.library-home-actions \{[\s\S]*display: flex;[\s\S]*width: auto;[\s\S]*flex: 0 0 auto;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 980px\) \{[\s\S]*\.library-home \.library-search \{[\s\S]*flex: 0 1 clamp\(340px, 34vw, 480px\);[\s\S]*width: clamp\(340px, 34vw, 480px\);[\s\S]*min-width: 0;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 1120px\) \{[\s\S]*\.library-list \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 980px\) \{[\s\S]*\.library-web-item \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*padding-right: 68px;[\s\S]*\.library-item-actions \{[\s\S]*position: absolute;[\s\S]*top: 10px;[\s\S]*right: 10px;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 980px\) \{[\s\S]*\.library-ebook-list-item \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*padding-right: 68px;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]*\.library-ebook-list-item \{[\s\S]*padding-right: 68px;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]*\.library-home \.library-search \{[\s\S]*flex: 0 1 clamp\(320px, 55vw, 360px\);[\s\S]*width: clamp\(320px, 55vw, 360px\);[\s\S]*max-width: 360px;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]*\.library-search-combo \.library-type-filter-trigger \{[\s\S]*width: 104px;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]*\.library-list \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*\}/,
    );
    expect(styles).not.toMatch(/\.library-web-grid \{[^}]*grid-template-columns:/);
    expect(styles).not.toMatch(/\.library-ebook-list \{[^}]*grid-template-columns:/);
    expect(styles).not.toContain('repeat(auto-fit, minmax(min(100%, 480px), 1fr))');
    expect(styles).not.toContain('.library-item-actions {\n    position: static;');
    expect(styles).not.toContain('.library-collection-list-item .library-item-actions.is-active');
    expect(rulesFor('.library-web-item,\n  .library-ebook-list-item')).not.toContain(
      expect.stringContaining('padding-right: 0;'),
    );
    expect(rulesFor('.library-ebook-list-item')).not.toContain(
      expect.stringContaining('padding-right: 0;'),
    );
  });

  it('defines direction-aware reading library transitions with reduced motion support', () => {
    expect(styles).toContain('--page-slide-dur: 150ms;');
    expect(styles).toContain('--page-fade-dur: 250ms;');
    expect(styles).toContain('--page-slide-distance: 8px;');
    expect(styles).not.toContain('--page-blur:');
    expect(styles).not.toContain('filter: blur(var(--page-blur));');
    expect(rulesFor('.library-shelf-content').some((rule) => rule.includes('filter'))).toBe(false);
    expect(countOccurrences(styles, '@keyframes library-page-forward-enter')).toBe(1);
    expect(countOccurrences(styles, '@keyframes library-page-backward-enter')).toBe(1);
    expectRule(
      ".library-bookcase-screen[data-route-transition='enter-source'] .library-shelf-content",
      [
        'animation: library-page-forward-enter var(--page-slide-dur) var(--page-slide-ease) both;',
        'will-change: opacity, transform;',
      ],
    );
    expectRule(
      ".library-bookcase-screen[data-route-transition='enter-library'] .library-shelf-content",
      [
        'animation: library-page-backward-enter var(--page-slide-dur) var(--page-slide-ease) both;',
        'will-change: opacity, transform;',
      ],
    );
    expectRule(".library-home-body[data-list-transition='forward'] .library-source-panel", [
      'animation: library-page-forward-enter var(--page-slide-dur) var(--page-slide-ease) both;',
    ]);
    expectRule(".library-home-body[data-list-transition='backward'] .library-source-panel", [
      'animation: library-page-backward-enter var(--page-slide-dur) var(--page-slide-ease) both;',
    ]);
    expectRule(".library-source-panel[data-page-transition='forward'] .library-page-panel", [
      'animation: library-page-forward-enter var(--page-slide-dur) var(--page-slide-ease) both;',
    ]);
    expectRule(".library-source-panel[data-page-transition='backward'] .library-page-panel", [
      'animation: library-page-backward-enter var(--page-slide-dur) var(--page-slide-ease) both;',
    ]);
    expect(styles).not.toContain('data-source-transition');
    expect(styles).not.toContain('library-route-source-enter');
    expect(styles).not.toContain('library-route-library-enter');
    expect(styles).not.toContain('library-source-panel-forward');
    expect(styles).not.toContain('library-page-panel-forward');
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.library-bookcase-screen\[data-route-transition\] \.library-shelf-content,[\s\S]*\.library-home-body\[data-list-transition\] \.library-source-panel,[\s\S]*\.library-source-panel\[data-page-transition\] \.library-page-panel \{[\s\S]*animation: none !important;[\s\S]*will-change: auto;[\s\S]*\}/,
    );
  });

  it('reveals only the first-use empty state with restrained motion', () => {
    expectRule(
      '.library-empty.is-first-use > .library-empty-marks,\n.library-empty.is-first-use > h3,\n.library-empty.is-first-use > p,\n.library-empty.is-first-use > .library-empty-entries',
      [
        '--library-first-use-final-opacity: 1;',
        'animation: library-first-use-enter 240ms cubic-bezier(0.23, 1, 0.32, 1) both;',
      ],
    );
    expectRule('.library-empty.is-first-use > .library-empty-marks', [
      '--library-first-use-final-opacity: 0.5;',
    ]);
    expectRule('.library-empty.is-first-use > h3', ['animation-delay: 50ms;']);
    expectRule('.library-empty.is-first-use > p', ['animation-delay: 100ms;']);
    expectRule('.library-empty.is-first-use > .library-empty-entries', ['animation-delay: 150ms;']);
    expect(styles).not.toContain('.library-empty.is-collection > .library-empty-entries');
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.library-empty\.is-first-use > \.library-empty-marks,[\s\S]*animation: library-first-use-fade 160ms cubic-bezier\(0\.23, 1, 0\.32, 1\) both;/,
    );
  });

  it('aligns import completion motion to success and reveal tokens', () => {
    expectRule('.library-import-dialog', [
      '--library-import-success-dur: 500ms;',
      '--library-import-success-ease: cubic-bezier(0.22, 1, 0.36, 1);',
      '--library-import-success-scale-from: 0.96;',
      '--library-import-check-path: 1;',
      '--library-import-reveal-dur: 400ms;',
      '--library-import-reveal-distance: 4px;',
      '--library-import-reveal-blur: 2px;',
      '--library-import-cover-stagger: 70ms;',
    ]);
    expectRule(
      '.library-article-import-result-check svg path,\n.library-import-success-icon path',
      [
        'stroke-dasharray: var(--library-import-check-path);',
        'stroke-dashoffset: var(--library-import-check-path);',
        'animation: library-import-check-draw var(--library-import-success-dur)',
      ],
    );
    expectRule('.library-file-import-result', [
      'animation: library-import-content-reveal var(--library-import-reveal-dur)',
      'var(--library-import-reveal-ease) both;',
    ]);
    expectRule('.library-ebook-import-cover-card', [
      'animation: ebook-import-cover-fan-in var(--library-import-cover-dur)',
      'animation-delay: calc(var(--ebook-import-cover-order) * var(--library-import-cover-stagger));',
    ]);
    expect(styles).not.toContain('stroke-dasharray: 18;');
    expect(styles).not.toContain('scale(0.25)');
    expect(styles).not.toContain('@keyframes ebook-success-pop');
    expect(styles).not.toContain('@keyframes file-import-result-in');
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.library-article-import-box\.has-parsed-title \.library-article-import-input input,[\s\S]*\.library-import-success-icon path \{[\s\S]*animation: none !important;[\s\S]*stroke-dashoffset: 0 !important;[\s\S]*\}[\s\S]*\.library-ebook-import-cover-card \{[\s\S]*animation: none !important;[\s\S]*filter: none;[\s\S]*opacity: 1;[\s\S]*transform: translateX\(calc\(-50% \+ var\(--ebook-import-cover-x\)\)\)/,
    );
  });

  it('uses theme semantics for import overlays and status states', () => {
    expectFinalRule('.library-import-modal-scrim', ['background: var(--app-overlay-scrim);']);
    expectFinalRule('.library-import-dialog', [
      'background: hsl(var(--card));',
      'box-shadow: var(--app-shell-panel-shadow);',
    ]);
    expectFinalRule('.library-import-dialog.is-error', [
      'var(--app-action-danger-bg)',
      'hsl(var(--card))',
    ]);
    expectFinalRule('.library-import-dialog.is-duplicate', [
      'var(--app-reader-accent-strong)',
      'hsl(var(--card))',
    ]);
    expectFinalRule('.library-article-import-box.is-error,\n.library-ebook-dropzone.is-error', [
      'var(--app-action-danger-bg)',
      'hsl(var(--card))',
    ]);
    expectFinalRule('.library-article-import-box.is-duplicate', [
      'var(--app-reader-accent-strong)',
      'hsl(var(--card))',
    ]);
    expectFinalRule(
      '.library-import-status-icon.is-error,\n.library-ebook-dropzone-icon.is-error',
      ['var(--app-action-danger-bg)', 'hsl(var(--card))'],
    );
    expectFinalRule('.library-import-status-icon.is-duplicate', [
      'var(--app-reader-accent-strong)',
      'hsl(var(--card))',
    ]);
    expectFinalRule('.library-file-import-result.is-error', [
      'var(--app-action-danger-bg)',
      'hsl(var(--card))',
    ]);
    expectFinalRule('.library-article-duplicate-callout', [
      'var(--app-reader-accent-strong)',
      'hsl(var(--card))',
    ]);
    expect(importOverrides).not.toMatch(/(?:rgb|hsl)\(\d/);
  });
});
