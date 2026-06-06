import { readRendererStyles } from './css-test-utils';
import { describe, expect, it } from 'vitest';

const styles = readRendererStyles();

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

  it('uses a narrower display ratio for PDF covers only', () => {
    expectRule('.article-book.is-pdf-cover', ['--book-cover-ratio: 0.7;']);
    expectRule('.article-book', ['--book-cover-ratio: 0.8167;']);
  });

  it('keeps library card action buttons anchored in narrow card layouts', () => {
    expectRule('.library-list', ['grid-template-columns: repeat(3, minmax(0, 1fr));']);
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
      'opacity: 1;',
      'transform: none;',
    ]);
    expectRule('.library-web-item', ['padding: 18px 68px 18px 16px;']);
    expectRule('.library-ebook-list-item', ['padding: 18px 68px 18px 0;']);
    expectRule('.library-ebook-list-item', ['padding: 18px 68px 18px 16px;']);
    expect(styles).toMatch(
      /@media \(max-width: 1120px\) \{[\s\S]*\.library-list \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 980px\) \{[\s\S]*\.library-web-item,\n  \.library-ebook-list-item \{[\s\S]*padding-right: 68px;[\s\S]*\.library-item-actions \{[\s\S]*position: absolute;[\s\S]*top: 10px;[\s\S]*right: 10px;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]*\.library-ebook-list-item \{[\s\S]*padding-right: 68px;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]*\.library-list \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*\}/,
    );
    expect(styles).not.toMatch(/\.library-web-grid \{[^}]*grid-template-columns:/);
    expect(styles).not.toMatch(/\.library-ebook-list \{[^}]*grid-template-columns:/);
    expect(styles).not.toContain('repeat(auto-fit, minmax(min(100%, 480px), 1fr))');
    expect(styles).not.toContain('.library-item-actions {\n    position: static;');
    expect(styles).not.toMatch(
      /@media \(max-width: 980px\) \{[\s\S]*\.library-web-item,\n  \.library-ebook-list-item \{[\s\S]*padding-right: 0;[\s\S]*\}/,
    );
    expect(styles).not.toMatch(
      /@media \(max-width: 760px\) \{[\s\S]*\.library-ebook-list-item \{[\s\S]*padding-right: 0;[\s\S]*\}/,
    );
  });

  it('defines direction-aware reading library transitions with reduced motion support', () => {
    expect(styles).toContain('--page-slide-dur: 200ms;');
    expectRule(
      ".library-bookcase-screen[data-route-transition='enter-source'] .library-shelf-content",
      [
        'animation: library-route-source-enter var(--page-slide-dur) var(--page-slide-ease) both;',
        'will-change: opacity, transform, filter;',
      ],
    );
    expectRule(
      ".library-bookcase-screen[data-route-transition='enter-library'] .library-shelf-content",
      [
        'animation: library-route-library-enter var(--page-slide-dur) var(--page-slide-ease) both;',
        'will-change: opacity, transform, filter;',
      ],
    );
    expectRule(".library-home-body[data-source-transition='forward'] .library-source-panel", [
      'animation: library-source-panel-forward var(--page-slide-dur) var(--page-slide-ease) both;',
    ]);
    expectRule(".library-home-body[data-source-transition='backward'] .library-source-panel", [
      'animation: library-source-panel-backward var(--page-slide-dur) var(--page-slide-ease) both;',
    ]);
    expectRule(".library-source-panel[data-page-transition='forward'] .library-page-panel", [
      'animation: library-page-panel-forward var(--page-slide-dur) var(--page-slide-ease) both;',
    ]);
    expectRule(".library-source-panel[data-page-transition='backward'] .library-page-panel", [
      'animation: library-page-panel-backward var(--page-slide-dur) var(--page-slide-ease) both;',
    ]);
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.library-bookcase-screen\[data-route-transition\] \.library-shelf-content,[\s\S]*\.library-home-body\[data-source-transition\] \.library-source-panel,[\s\S]*\.library-source-panel\[data-page-transition\] \.library-page-panel \{[\s\S]*animation: none !important;[\s\S]*will-change: auto;[\s\S]*\}/,
    );
  });
});
