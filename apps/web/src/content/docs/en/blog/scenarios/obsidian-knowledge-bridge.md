---
title: "From Deep Reading to Second Brain: Closing the Knowledge Loop with Yomitomo and Obsidian"
description: Process highlights and AI discussions inside Yomitomo first, then export clean Markdown files or copy cited notes into Obsidian, Logseq, or Notion.
---

A common problem with Obsidian or Logseq vaults is dumping raw reading highlights straight into your notes folder. Hundreds of decontextualized quotes pile up, organizing them without the surrounding page is tedious, and the vault turns into an unread clipping archive.

Yomitomo acts as the reading and processing layer in front of your vault: you read, annotate, question passages with AI companions, and distill key discussions in context first, then export clean Markdown into Obsidian when the notes are actually ready.

---

## The Reading-to-Vault Pipeline

```text
[ Source Material ]
Web articles / EPUB, AZW3, MOBI ebooks / PDFs / .txt & .md / WeRead synced notes
      │
      ▼ (Read, highlight, record verbatim thoughts, discuss with Reading Companions)
[ In-Context Notes ]
Anchored highlights + thoughts + @GideonFrost / @IrisChen / @MarcusReed threads
      │
      ▼ (Distill key highlight discussions in the Distillation window)
[ Published Distillations & Reading Memory ]
Single-highlight distillations reviewed by Review Assistants + Ask library synthesis
      │
      ▼ (Built-in Export Markdown (.md) or Copy Markdown)
[ External Knowledge Vault ]
Obsidian / Logseq / Notion (add [[links]], tags, and vault structure)
```

*(Note: Synced WeRead books are read-only inside Yomitomo—you can export a WeRead book's highlights and thoughts as Markdown directly, or import that exported Markdown as a local text document if you want AI discussion and distillation on it.)*

---

## 3 Steps to Keep Your Obsidian Vault Clean

### Step 1: Think in Context Inside Yomitomo
Instead of sending every highlighted sentence straight to Obsidian, keep raw reading in Yomitomo. Select text and press `A` to record your immediate thought (or click **Highlight** and choose a color). When an argument needs unpacking, `@`-mention **Reading Companions** like `@GideonFrost` (First-Principles Reviewer), `@IrisChen` (Concept Translator), or `@MarcusReed` (Insight Editor) right beside the passage.

### Step 2: Distill Worthwhile Discussions
When a highlight's discussion leads to a takeaway you want to keep in your vault, click **Distill these thoughts** to open the **Distillation** window:

1. Click **Organize discussion** to bring thread points into your draft (additions only).
2. Rewrite the conclusion in your own words.
3. Run **Review Assistants** in the right-hand review panel—for example, **Simone Carter** (Logic Auditor) and **Julian Cross** (Final Copy Editor)—and accept or reject their inline diff suggestions item by item.
4. Publish the distillation.

When you want to pull insights across several local documents before writing a synthesis note in Obsidian, use **Reading Memory**: browse the **Distillations** library, click **Find related**, or ask a cross-document question in **Ask library** scoped to a collection or selected sources.

### Step 3: Export Markdown Into Obsidian
Yomitomo includes built-in **Export Markdown (.md)** and **Copy Markdown** in four places so you choose the right granularity for your vault:

- **Single distillation**: Export or copy from the **Distillation** window or **Distillations** library for atomic concept notes (e.g., `[[Working-Memory]]`).
- **Whole document**: Export or copy a document's highlights, thoughts, discussions, and published distillations from the reader toolbar for a source/literature note.
- **Synced WeRead book**: Export or copy a WeRead book's chapter-organized highlights and thoughts from the WeRead book toolbar.
- **Ask library answer**: Copy a cross-document answer as Markdown with source citations.

Drop the `.md` file into your Obsidian vault (or paste copied Markdown), add your `[[wikilinks]]` and tags, and keep the original source files and passage anchors searchable inside Yomitomo.

---

## Raw Highlight Sync vs. Distill-Then-Export

| Dimension | Raw Auto-Sync to Vault | Yomitomo → Markdown Export → Obsidian |
|---|---|---|
| **Note Density** | Long dumps of author quotes without your own reaction | Focused distillations, whole-document notes, or cited **Ask library** syntheses |
| **Vault Clutter** | Unprocessed clippings accumulate quickly | Only notes you explicitly export enter your vault |
| **Context** | Hard to check surrounding paragraphs once detached | Original PDFs, ebooks, web articles, and passage threads remain searchable locally in Yomitomo |
| **Sync Model** | Automatic background sync | Manual **Export Markdown (.md)** / **Copy Markdown**; no automatic two-way sync |

---

## Who This Is For and Where It Stops

### Good Fit

- Obsidian, Logseq, and Notion users who want to process reading material before adding files to their vault.
- Writers and researchers who want both clean `.md` exports and a local archive of original PDFs, ebooks, and web articles.

### Not Designed For

- **Hands-free automatic syncing**: Yomitomo does not automatically push highlights to Obsidian, Logseq, or Notion in the background.
- **Two-way editing**: Changes made in Obsidian do not sync back into Yomitomo's SQLite database.

---

## Frequently Asked Questions (FAQ)

### Q1: What does Markdown export include?
Exporting from the reader toolbar includes the document's highlights, thoughts, discussions, and published distillations. Exporting from the **Distillation** window or **Distillations** library exports that distillation note. Exporting from a WeRead book exports its synced highlights and thoughts by chapter. **Ask library** lets you copy the answer as Markdown with citations.

### Q2: If I edit an exported `.md` file in Obsidian, does it update Yomitomo?
No. Export is one-way; there is no automatic two-way sync with Obsidian or Notion. Yomitomo remains the source archive for original documents and passage anchors, while Obsidian holds your edited vault notes.

---

## Related Guides & Workflows

- [Knowledge Distillation Workflow: From Fragmented Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [Deep Reading for Non-Fiction eBooks: From Passive Highlighting to Cognitive Mastery](/en/blog/scenarios/deep-ebook-reading/)
- [Why Local-First Architecture Matters: Building Lifelong Intellectual Assets](/en/blog/scenarios/local-first-privacy/)
- [Distilled Notes and Review](/en/docs/sedimentation/)
