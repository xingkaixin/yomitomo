---
title: "Academic Paper Deep Reading: An AI-Powered Workflow for Researchers"
description: Read academic PDFs closely with Yomitomo—anchored highlights, passage-level AI discussion, per-highlight distillation, cross-paper Reading Memory, and Markdown export.
---

Suppose your lab discusses two preprints in a morning seminar and you need to write a literature synthesis next week. You highlight lines in a PDF viewer and close the file thinking you followed the argument. A week later, you remember a comparison chart, but not the paper's assumptions or why a claim looked shaky.

Flat highlighting marks where something looked important, not what you thought about it or how the argument held up. In research reading, you need to record your own doubts beside the exact sentence, test the paper's reasoning, and find those notes again across related papers.

Yomitomo keeps your highlights, notes, AI discussions, and distilled takeaways anchored to the source PDF in a local database.

---

## Academic Paper Reading Workflow

| Stage | User Action | How Yomitomo Handles It | Output | Boundaries |
|---|---|---|---|---|
| **Document Import** | Import local PDFs (up to 120 MB/file, 10/batch) | Renders locally with PDFium; extracts the text layer | Local library entry; dark mode preserves original chart colors (optional **Dark eye-care filter**); zoom presets and single-column **Bilingual translation** | No built-in OCR; scanned image-only PDFs need OCR before import |
| **Anchored Notes** | Select text and click **Highlight** or press `A` to record a thought | Saves text anchor, highlight color, and your verbatim thought in local SQLite | Highlight card in the sidebar with its own discussion thread | Non-destructive overlay; does not modify the original PDF file |
| **Passage Discussion** | `@`-mention a reading companion (e.g., `@DanielPark`, `@GideonFrost`, `@IrisChen`) or press `Q` for **Reader Q&A** | Sends the selected passage, surrounding context, and your prompt to your configured model | Multi-turn discussion attached to that highlight (or the open paper in Reader Q&A) | Requires a configured local or remote model; always check replies against the paper |
| **Distillation** | Click **Distill these thoughts** inside a highlight's discussion | Opens the **Distillation** window; supports **Organize discussion** and right-hand **Review Assistants** with inline diff preview | Published distillation replacing that single highlight card in the sidebar | Operates on one highlight's discussion, not an entire paper or multi-paper batch |
| **Cross-Paper Recall** | Use **Find related** in the reader, or **Ask library** / **Distillations** in **Reading Memory** | Searches saved highlights, thoughts, participated discussions, and published distillations across local articles | Cited cross-paper answers and Markdown export | Indexes saved notes on local articles, not full raw article text or unpublished drafts |

---

## 3 Steps for Reading Research Papers

### Step 1: Anchor Your Own Questions While Reading

Open a PDF in Yomitomo. Dark mode keeps original page and figure colors by default so charts stay readable, with an optional **Dark eye-care filter** if you prefer dimmer pages. You can switch zoom presets (**Fit width**, **Fit page**, **100%**, or `⌘/Ctrl + / − / 0`) and use page-by-page **Bilingual translation** on single-column text PDFs.

When a claim, assumption, or derivation catches your eye, select the text and press `A` to write your thought immediately (or click **Highlight** to save the passage first, and pick a highlight color to distinguish key claims from open questions). Your highlight and thought are stored verbatim—Yomitomo never rewrites them.

### Step 2: Interrogate Passages with Reading Companions

Instead of asking a chatbot to summarize a 20-page paper, open a highlight's discussion and `@`-mention one of the six built-in **Reading Companions** (or use **Ask assistants**):

- **@DanielPark** (Structure Navigator): Maps how a paragraph or section functions inside the paper's argument.
- **@GideonFrost** (First-Principles Reviewer): Tests assumptions, causal steps, and missing boundary conditions.
- **@IrisChen** (Concept Translator): Explains unfamiliar terminology or formal definitions in context.
- **@MayaBrooks** (Question Mentor): Sharpens a vague objection into concrete follow-up questions.
- **@JuneHartley** (Margin Reading Companion) and **@MarcusReed** (Insight Editor): Help unpack dense prose or pull out reusable takeaways.

Each reply stays inside that highlight's thread. You can also press `Q` for **Reader Q&A** when you have a question about the open document.

### Step 3: Distill Key Discussions and Query Across Papers

When a highlight's discussion reaches a conclusion worth keeping, click **Distill these thoughts** to open the **Distillation** window.

1. Click **Organize discussion** to pull points from the thread into your draft (additions only—it does not silently erase what you wrote).
2. Edit the draft in your own words.
3. Run one or more **Review Assistants** in the right-hand review panel—for example, **Simone Carter** (Logic Auditor) to check reasoning gaps, **Arthur Whitfield** (Evidence Archivist) to flag unsupported claims, or **Julian Cross** (Final Copy Editor) to tighten phrasing.
4. Review suggested edits item by item in the inline diff preview, then publish. The published distillation replaces that single highlight card in the sidebar while keeping the link back to the passage.

To synthesize across multiple papers, open **Reading Memory**: browse the **Distillations** library, click **Find related** from a highlight, or run **Ask library** scoped to a collection or selected papers to get a cited answer you can copy as Markdown.

---

## Who This Is For and Where It Stops

### Good Fit

- Graduate students, postdocs, and researchers reading preprints and journal PDFs closely.
- R&D engineers and analysts who want notes anchored to exact claims and figures.
- Readers who want local storage and control over which AI model sees their passages.

### Not Designed For

- **Batch-summarizing dozens of papers without reading**: Yomitomo is built around passages you select and question yourself.
- **Image-only scanned PDFs**: Yomitomo has no built-in OCR; run OCR first if the PDF has no text layer.
- **Replacing Zotero**: Keep Zotero for bibliographic metadata, DOIs, and BibTeX/Word citations; pair it with Yomitomo for close reading.

---

## Frequently Asked Questions (FAQ)

### Q1: Does annotating a PDF in Yomitomo modify the original file?
No. Yomitomo stores coordinates, highlights, thoughts, discussions, and distillations in its local SQLite database. The PDF binary is not altered.

### Q2: Can AI companions still make mistakes on long papers?
Yes. Anchoring discussions to a selected passage and its surrounding context keeps replies focused on the text in front of you, which reduces drift compared with dumping an entire PDF into a chat window. Even so, models can misread formulas, tables, or context—always verify claims against the original paper.

### Q3: Can I export notes to Obsidian or LaTeX?
Yomitomo includes built-in **Export Markdown (.md)** and **Copy Markdown** for a whole document's highlights, thoughts, discussions, and published distillations (from the reader toolbar), for individual distillations (from the **Distillation** window or **Distillations** library), and for **Ask library** answers (with citations). There is no automatic two-way sync to Obsidian or Notion, no LaTeX or BibTeX export, and no annotated-PDF export. For LaTeX papers, paste the Markdown text and format citations yourself.

---

## Related Guides & Workflows

- [Critical Reading in Practice: Deconstruct Arguments with AI Review Agents](/en/blog/scenarios/critical-reading/)
- [PDF Annotation in Practice: Review Contracts, Whitepapers, and Reports](/en/blog/scenarios/pdf-annotation/)
- [Knowledge Distillation Workflow: From Fragmented Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [Reader, Annotations, and Discussions](/en/docs/reader/)
