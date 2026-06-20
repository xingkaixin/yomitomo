---
title: Library and Import
description: Manage web articles, EPUB/AZW3/MOBI ebooks, and PDF documents, and understand how Yomitomo stores reading materials.
---

The Library is the entry point for all reading materials. Web articles, EPUB/AZW3/MOBI ebooks, PDF documents, and WeRead notes are managed separately so each source can open into the right reading flow. You can customize which content sources appear on the home view in Settings. Deleting items requires confirmation; successful imports and deletes can show toast and optional sound feedback.

<picture>
  <source
    srcset="/assets/epub-1600.webp 1600w, /assets/epub-2400.webp 2400w, /assets/epub.webp 4654w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/epub.webp" alt="Yomitomo EPUB library" loading="eager" decoding="async" />
</picture>

## Import Web Articles

1. Click the "+" button in the Library.
2. Choose "Add Web Page".
3. Paste an article URL that starts with `http://` or `https://`.
4. Wait for Yomitomo to extract the title, author, body text, and images.

For pages that need browser rendering, Yomitomo tries to render the page with the built-in browser before extracting the article body. By default, localhost, private network, and cloud metadata addresses are blocked, and HTML responses larger than 5 MB are not imported.

## Import Ebooks

1. Click the "+" button in the Library.
2. Choose "Ebook file".
3. Select or drop a local `.epub`, `.azw3`, or `.mobi` file.

Yomitomo parses the cover, table of contents, chapters, and body structure. Ebook import supports batches of up to 10 books, with an 80 MB limit per file. DRM-protected files or files with oversized decompressed content cannot be imported.

## Import PDF

1. Click the "+" button in the Library.
2. Choose "PDF Document".
3. Select or drop a local `.pdf` file.

PDF import supports batches of up to 10 files, with a 120 MB limit per file. After import, the Library shows page count, file name, and basic metadata. If you import the same PDF again, Yomitomo will tell you it already exists and let you open the existing document.

## Filter, Search, and Sort

The Library can filter by reading status:

- All
- New
- Reading
- Finished

You can also sort by recent reading, recent import, annotation count, or discussion count, and search by title or author.

Library cards show reading progress, highlight count, and distilled note count. PDFs are shown as document rows, while web articles and ebooks can keep their cover or source images.

## Local Storage

Reading data is stored in the desktop app data directory. When "Save images locally" is enabled, Yomitomo saves article body images to your computer during web import, reducing breakage when the original site changes or removes images.
