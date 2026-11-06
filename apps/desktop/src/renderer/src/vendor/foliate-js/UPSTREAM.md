# foliate-js fork

Source: https://github.com/johnfactotum/foliate-js
Commit: 78914aef4466eb960965702401634c2cb348e9b1
License: MIT

Yomitomo maintains this copy as its own fork and does not track upstream. The commit above is the
fork point (upstream `main` as of 2026-05-01).

Changes target Yomitomo's reader only: Electron's Chromium renderer, reflowable EPUB/AZW3/MOBI in
paginated flow. Workarounds for other browsers and features Yomitomo does not use may be removed
instead of kept compatible. Performance changes need a before/after run of
`apps/desktop/e2e/performance/ebook-reader.test.ts`.

## Local changes

- `view.js`: PDF, FB2 and comic-book adapters are removed; EPUB loading and the MOBI/KF8 adapter
  with its `fflate` helper are kept.
- `paginator.js`: the previous section stays visible until the next one is laid out; page turns
  from the first or last page go straight to the adjacent section; the 100 ms wait after each turn
  is removed; `page-turn-start` is emitted; `getPageInfo()` reports the section page position.
- `paginator.js`: null guards in `expand()`, `destroy()` and `setStyles()` for views closed while a
  section is loading.
- `epub.js`, `paginator.js`, `view.js`: `section-load-timing` reports per-stage section load times
  (zip read, parse, resource replacement, serialization, iframe load, style, layout, anchor). The
  reader records them as `performance.ebook_section_load`.
- `view.d.ts`: types for the parts of the API the reader calls.
