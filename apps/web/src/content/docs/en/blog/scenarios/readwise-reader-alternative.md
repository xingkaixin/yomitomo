---
title: "Free Open-Source Readwise Reader Alternative (Local-First) — Yomitomo"
description: Looking for a free, local-first Readwise Reader alternative? Compare Yomitomo vs Readwise Reader, NotebookLM, and Zotero across local PDF & EPUB storage, BYOK/Ollama AI, Markdown export, and pricing.
lastUpdated: 2026-11-27
---

Yomitomo is a free, open-source desktop app for reading PDFs, ebooks and web articles with passage-level notes, AI discussion, and Markdown export. Readwise Reader is a better fit when you need a reading queue across mobile and desktop, RSS feeds, or automatic highlight sync to other tools; NotebookLM fits quick multi-source synthesis in the browser; Zotero excels at academic citations and BibTeX. Choose around the workflow you use every day.

Maintained by the Yomitomo project. Yomitomo features refer to v0.18.2. Readwise, NotebookLM, and Zotero product details were checked against their official pages.

## Compare the workflows: Yomitomo vs Readwise Reader vs NotebookLM vs Zotero

| Need | Yomitomo | Readwise Reader | NotebookLM | Zotero |
| --- | --- | --- | --- | --- |
| Primary focus | Local-first close reading, passage-anchored AI discussion & distillation | Cloud read-it-later queue, RSS, and highlight sync hub | Cloud AI notebook for multi-source Q&A, study guides & Audio Overviews | Open-source reference manager, citation & BibTeX engine |
| Devices | macOS and Windows desktop | Web, desktop and mobile apps | Web and mobile apps (Google account) | Desktop (macOS, Windows, Linux), web & mobile |
| Reading material | PDF, EPUB, AZW3, MOBI, web articles, text/Markdown, and WeRead notes | Articles, PDFs, EPUBs, newsletters, RSS, and transcripts | Uploaded PDFs, Docs, web URLs, YouTube, and audio sources | PDFs, EPUBs, web snapshots, and bibliographic metadata |
| Reading data | Stored locally in SQLite and local source files (no account) | Synced through a Readwise cloud account | Stored in Google cloud notebooks | Stored locally with optional Zotero cloud sync |
| AI workflow | Explicit BYOK API or local Ollama; passage-anchored companions, single-highlight distillation review, and local Reading Memory | Built-in Ghostreader for summaries, Q&A, and term lookup | Cloud Gemini models over uploaded notebooks; no local model or margin reader | No built-in AI companions (relies on third-party plugins) |
| Notes & export | Built-in **Export Markdown (.md)** and **Copy Markdown** for documents, distillations, WeRead notes, and Ask library answers; no automatic Obsidian/Notion sync | Automatic highlight export integrations (Obsidian, Notion, Logseq, etc.) | Copy notes or export to Google Docs; not a margin annotation reader | Item notes, BibTeX/LaTeX/Word citations, and plugin ecosystem |
| Cost | Free, MIT open source; pay only for your own API usage (or $0 with Ollama) | Paid subscription; see [current pricing](https://readwise.io/pricing) | Free tier with paid Google AI plan tiers | Free, open source; paid cloud storage above free quota |

Readwise features are described on the [official Reader page](https://readwise.io/read), NotebookLM on [notebooklm.google](https://notebooklm.google/), and Zotero on [zotero.org](https://www.zotero.org/). This guide is maintained by Yomitomo and is not an independent benchmark.

### When to pick each tool

- **Pick Yomitomo** if you want a free, local-first desktop reader for PDFs, EPUBs, and long web articles where your highlights stay in SQLite, AI only speaks when you `@`-mention a companion, and you can switch freely between your own API key and local Ollama.
- **Pick Readwise Reader** if mobile reading, RSS/newsletter triage, and automatic highlight sync into Notion or Obsidian are non-negotiable.
- **Pick NotebookLM** if you want cloud-hosted synthesis across a bundle of sources (or Audio Overviews) rather than line-by-line margin annotation.
- **Pair Zotero with Yomitomo** if you write academic papers: keep bibliography, DOIs, and BibTeX in Zotero, and import core PDFs into Yomitomo for close reading and AI discussion. See [Academic Research Pipeline: Zotero + Yomitomo](/en/blog/scenarios/zotero-academic-workflow/).

## What reading in Yomitomo looks like

Import a document, select a passage, and click **Highlight** in the selection menu or press `A` to create a highlight and record your own thought. Open the highlight's discussion and `@`-mention a reading companion (or use **Ask assistants**). You can also press `Q` for **Reader Q&A**, or click **Find related** to search past notes in **Reading Memory**. Each highlight discussion stays anchored to the source passage so you can return to the surrounding text.

<figure>
  <img src="/assets/en-reader-1280.webp" alt="Yomitomo reading view with highlighted web passages and annotation cards beside the source" width="1280" height="818" loading="lazy" decoding="async" />
  <figcaption>A web article with passage-linked annotations in Yomitomo.</figcaption>
</figure>

When a highlight's discussion is worth keeping as a standalone note, click **Distill these thoughts** to open the **Distillation** window, organize the discussion into a draft, and run review assistants in the right-hand review panel. You remain responsible for checking the model's claims against the original material.

## Can I migrate my Readwise library?

There is no direct Readwise account connection or importer for its CSV highlight archive. Importing the original PDF or ebook does not restore the highlights you made in Readwise.

You can import supported original documents (PDF, EPUB, AZW3, MOBI, `.txt`, `.md`). You can also import Markdown or plain-text notes as text documents, though this does not recreate their original passage anchors or discussion threads. Try one document and keep your existing library before deciding how much to move.

See [Library and Import](/en/docs/library/) for supported file types and import limits.

## What does local storage mean for AI privacy?

Reading data is stored locally. If you configure a remote model, the context needed for that AI task is sent to that endpoint. A model running on your own computer can handle inference locally; it does not make every application feature independent of the network.

For a local setup, follow [Read PDFs and EPUBs with local AI: Yomitomo + Ollama setup](/en/blog/scenarios/local-ai-reading-with-ollama/). For backups, model routing, and privacy controls, see [Settings, Models, and Data](/en/docs/settings/).

## Try it with one document

Start with a PDF or ebook you already own. Make one highlight, write a note, and try a discussion using your chosen model. Check whether that workflow is useful before migrating more material.

<a href="/en/#download" data-umami-event="download_section_click" data-umami-event-language="en" data-umami-event-placement="guide">Download Yomitomo for macOS or Windows</a>.
