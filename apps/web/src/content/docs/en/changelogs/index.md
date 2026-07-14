---
title: Release Notes
description: Yomitomo release notes.
sidebar:
  hidden: true
---

## 0.12.0

Released: 2026-07-14

- Assistant execution mode can switch between fast responses and deeper verification across annotations, follow-ups, and co-reading.
- Collection organization gains keyboard drag and drop with announcements, and the Library grid adapts to available width.
- Database restore is now atomic and recoverable, while web imports and API-key logging have tighter security boundaries.
- The default theme aligns around warm paper and cinnabar; the website adds a mobile product preview, scroll motion, and accessibility improvements.

[View 0.12.0 release notes](/en/changelogs/v0-12-0/)

## 0.11.0

Released: 2026-07-05

- Annotation cards gain fan-stacked shuffle behavior so dense rails are easier to scan.
- Automation runs no longer send real telemetry heartbeats.
- Desktop E2E coverage now spans library import, reader navigation, annotations, progress, settings, AI, EPUB/PDF import, and responsive layouts.
- Reader, PDFium, web source, style, and article repository boundaries were split to reduce future change risk.

[View 0.11.0 release notes](/en/changelogs/v0-11-0/)

## 0.10.0

Released: 2026-06-28

- The Library adds a Text type: paste text or upload `.txt` / `.md`, with a manuscript cover, type filter, and collection support.
- Selections gain draggable endpoint handles, and import and model routing show privacy boundary notices.
- Ebook click-to-page hot zones and adaptive spread layout, with PDF default zoom adapting to window width.
- Disabled double-click selection, fixed covers being squeezed after a refresh, and hardened desktop security boundaries.

[View 0.10.0 release notes](/en/changelogs/v0-10-0/)

## 0.9.2

Released: 2026-06-26

- Fixed Library search clear duration parsing in production builds, so the dissolve transition no longer ends too early.
- This is a patch release for the Library search experience.

[View 0.9.2 release notes](/en/changelogs/v0-9-2/)

## 0.9.1

Released: 2026-06-25

- Library and reader search gained clear actions, and the Ask panel now uses in-place morph and dissolve transitions.
- Last-read PDF page restore is faster and steadier, and Library summaries sync right after distillation edits.
- Fixed annotation-rail scrolling, web-translation drag selection, mention-chip caret alignment, and leftover reading memory after deletion.

[View 0.9.1 release notes](/en/changelogs/v0-9-1/)

## 0.9.0

Released: 2026-06-24

- The Library is now a mixed list across content types, with collections, pinned items, session-aware type filters, and fuller empty states.
- Distillation review now streams structured suggestions that can be previewed, accepted, or dismissed in the draft.
- WeRead can sync automatically, the app can check for updates automatically, and local storage, cache maintenance, and reader details are steadier.

[View 0.9.0 release notes](/en/changelogs/v0-9-0/)

## 0.8.0

Released: 2026-06-20

- Added AZW3/MOBI ebook import and reading, with better annotation location for Kindle content.
- Made large libraries, ebook pagination, PDF opening, and assistant diagnostics feel lighter.
- Hardened web import, EPUB decompression, App Lock, and database backup boundaries while clarifying Data Management settings.

[View 0.8.0 release notes](/en/changelogs/v0-8-0/)

## 0.7.2

Released: 2026-06-17

- Added App Lock so a PIN can protect the local reading workspace and be managed from Settings.
- Improved paragraph translation feedback, active table-of-contents focus, and smoother TOC toggle motion.
- Routed website downloads and app updates through the Cloudflare download worker with download/update analytics.

[View 0.7.2 release notes](/en/changelogs/v0-7-2/)

## 0.7.1

Released: 2026-06-17

- Fixed packaged assistant avatars rendering as `file://` text instead of images.
- Covers reader chat, annotation discussion inputs, add-thought flows, and distillation review discussions.

[View 0.7.1 release notes](/en/changelogs/v0-7-1/)

## 0.7.0

Released: 2026-06-16

- Language switching, reader chat/search, bilingual web-article translation, unified toasts and sound effects, hand-drawn theme visuals.
- Deeper distillation and discussion motion; reworked Settings and Library IA; signed and notarized macOS releases.
- HTML sanitization and renderer sandbox; fixes for annotation rail, stats, imports, and more.

[View 0.7.0 release notes](/en/changelogs/v0-7-0/)

## 0.6.0

Released: 2026-06-01

- Added the reading memory foundation and traceable AI assistant tool runtime.
- Added annotation discussion windows, distillation flow, distilled cards, and review assistant feedback.
- Improved reader paper themes, library import, license notices, and desktop package size.

[View 0.6.0 release notes](/en/changelogs/v0-6-0/)

## 0.5.0

Released: 2026-05-26

- Added PDF import and reading, including outlines, selection, annotations, assistant dock, and focused PDF co-reading.
- Added WeRead note sync, reading stats, and API key setup docs.
- Improved startup, stats, EPUB index queries, and annotation scrolling performance.

[View 0.5.0 release notes](/en/changelogs/v0-5-0/)

## 0.4.0

Released: 2026-05-21

- Added the desktop app update flow and product website.
- Improved provider settings, reader discussion experience, and data management.
- Optimized EPUB reading, annotation hot paths, and library loading performance.

[View 0.4.0 release notes](/en/changelogs/v0-4-0/)

## 0.3.0

Released: 2026-05-15

- Added local EPUB import and reading.
- Added EPUB reading context, anchors, and AI co-reading.
- Improved EPUB highlights, pagination, and reader interactions.

[View 0.3.0 release notes](/en/changelogs/v0-3-0/)

## 0.2.0

[View 0.2.0 release notes](/en/changelogs/v0-2-0/)

## 0.1.0

[View 0.1.0 release notes](/en/changelogs/v0-1-0/)
