---
title: Library and Import
description: Manage web articles, EPUB/AZW3/MOBI ebooks, and PDF documents, and understand how Yomitomo stores reading materials.
---

The Library is the entry point for all reading materials. Web articles, EPUB/AZW3/MOBI ebooks, PDF documents, WeRead notes, and collections are managed separately so each source can open into the right reading flow. You can customize which content sources appear on the home view in Settings. Deleting items requires confirmation; successful imports and deletes can show toast and optional sound feedback.

## Collections

Collections group related reading items so you can review them by topic, project, or reading list. A collection does not copy content; it only organizes items already in your library by membership.

### Create a Collection

1. Click the "+" button in the Library.
2. Choose "New collection".
3. Enter a collection name (for example, "System Design").

The new collection opens empty. You can rename it anytime from its card menu with "Edit collection name".

### Add Items to a Collection

A collection can hold web articles, ebooks, PDFs, and WeRead books. There are two ways to add them:

- From inside the collection, click "Add to this collection" and pick existing library items. The picker supports type filtering and search; add items one by one with the "+" button or drag them into the "Pending" tray.
- From the library grid, drag an item card directly onto a collection card.

Open an item's card menu inside a collection and choose "Remove from collection" to take it out. This only removes the membership; the original article or book stays in your library.

### Covers and Pins

A collection card shows a cover stack built from up to 9 member covers, with the member count overlaid. An empty collection shows a placeholder cover. You can "Pin" collections and items you use often; pinned ones sort to the top of the library.

### Delete a Collection

Deleting a collection removes only the collection and its memberships. The articles, ebooks, PDFs, and WeRead books inside stay in your library. A confirmation dialog explains this before you delete.

## Import Web Articles

1. Click the "+" button in the Library.
2. Choose "Add Web Page".
3. Paste an article URL that starts with `http://` or `https://`.
4. Wait for Yomitomo to extract the title, author, body text, and images.

For pages that need browser rendering, Yomitomo tries to render the page with the built-in browser before extracting the article body. By default, localhost, private network, and cloud metadata addresses are blocked, and HTML responses larger than 5 MB are not imported.

<picture>
  <source
    srcset="/assets/en-import-web-1600.webp 1600w, /assets/en-import-web-2400.webp 2400w, /assets/en-import-web.webp 3388w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/en-import-web.webp" alt="Yomitomo import a web article" loading="lazy" decoding="async" />
</picture>

## Import Ebooks

1. Click the "+" button in the Library.
2. Choose "Ebook file".
3. Select or drop a local `.epub`, `.azw3`, or `.mobi` file.

Yomitomo parses the cover, table of contents, chapters, and body structure. Ebook import supports batches of up to 10 books, with an 80 MB limit per file. DRM-protected files or files with oversized decompressed content cannot be imported.

<picture>
  <source
    srcset="/assets/en-import-ebook-1600.webp 1600w, /assets/en-import-ebook-2400.webp 2400w, /assets/en-import-ebook.webp 3388w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/en-import-ebook.webp" alt="Yomitomo import an ebook" loading="lazy" decoding="async" />
</picture>

## Import PDF

1. Click the "+" button in the Library.
2. Choose "PDF Document".
3. Select or drop a local `.pdf` file.

PDF import supports batches of up to 10 files, with a 120 MB limit per file. After import, the Library shows page count, file name, and basic metadata. If you import the same PDF again, Yomitomo will tell you it already exists and let you open the existing document.

<picture>
  <source
    srcset="/assets/en-import-pdf-1600.webp 1600w, /assets/en-import-pdf-2400.webp 2400w, /assets/en-import-pdf.webp 3388w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/en-import-pdf.webp" alt="Yomitomo import a PDF" loading="lazy" decoding="async" />
</picture>

## Import Text and Markdown

1. Click the "+" in the top-right of the Library.
2. Choose "Text file".
3. Choose "Paste text" to paste directly, or "Upload files" to pick or drop `.txt` / `.md` files (multiple allowed).

Unlike other imports, text import adds a confirmation step: before importing you fill in or confirm a title (required) and author (optional), and you confirm each file when uploading several. Yomitomo detects the encoding and infers a title where it can — Markdown prefers front matter or the first heading, while plain text prefers the file name or first line. A file named `.txt`/`.md` whose contents are not text is rejected.

Markdown YAML front matter is rendered as a metadata block at the top of the content; content is sanitized, and remote images are not loaded automatically. Text gets its own manuscript cover and, like other content, can be filtered by the Text type and added to collections.

## Filter, Search, and Sort

The Library can filter by reading status:

- All
- New
- Reading
- Finished

You can also filter by content type, and the type filter is multi-select: collection, web, ebook, PDF, and WeRead. Each selected type shows as a removable chip, and selecting every type is the same as "All". The active type filter, search query, and currently open collection are kept when you switch menus or open an item, so returning to the Library lands back where you were.

Sort by recent reading, recent import, annotation count, or discussion count, and search by title or author.

Library cards show reading progress, highlight count, and distilled note count. PDFs are shown as document rows, while web articles and ebooks can keep their cover or source images.

## Local Storage

Reading data is stored in the desktop app data directory. When "Save images locally" is enabled, Yomitomo saves article body images to your computer during web import, reducing breakage when the original site changes or removes images.
