---
title: "Academic Research Pipeline: Zotero Literature Management + Yomitomo Deep Reading"
description: Pair Zotero for citation management and BibTeX with Yomitomo for close PDF reading, passage-level AI discussion, distillation review, Reading Memory, and Markdown export.
---

Managing references and reading papers closely are two different jobs:

1. **Reference management (Zotero)**: Capturing bibliographic metadata with browser connectors, storing DOIs, organizing reading lists, and inserting formatted citations into Word or LaTeX.
2. **Close reading and note synthesis (Yomitomo)**: Annotating key PDFs with passage-anchored thoughts, interrogating claims with Reading Companions, distilling important discussions with Review Assistants, querying notes across papers with **Reading Memory**, and exporting clean Markdown.

Keeping both tools focused on what they do best avoids overloading Zotero with messy scratch notes while keeping your citations accurate.

---

## Zotero + Yomitomo Research Workflow

| Stage | Tool | Action | Output |
|---|---|---|---|
| **1. Collect & Catalog** | **Zotero** | Save papers via Zotero Connector from arXiv, IEEE, or publisher sites | Clean metadata, DOI, PDF attachment, and BibTeX entry |
| **2. Import Key PDFs** | **Yomitomo** | Import the papers you plan to read closely (up to 120 MB/file, 10/batch) | Local PDFium reading view; dark mode preserves original chart colors (optional **Dark eye-care filter**), zoom presets, and single-column **Bilingual translation** |
| **3. Annotate & Question** | **Yomitomo** | Select text, press `A` to write a thought (or click **Highlight** and choose a color); `@`-mention Reading Companions (`@DanielPark`, `@GideonFrost`, `@IrisChen`) or press `Q` for **Reader Q&A** | Anchored notes and multi-turn threads linked to exact passages |
| **4. Distill & Cross-Query** | **Yomitomo** | Click **Distill these thoughts** on key threads and run **Review Assistants** in the **Distillation** window; use **Reading Memory** (**Ask library**, **Find related**) across papers | Published distillations and cited cross-paper answers |
| **5. Export & Cite** | **Yomitomo → Zotero / LaTeX** | Use **Export Markdown (.md)** or **Copy Markdown**; paste into a Zotero item note or manuscript draft, then cite via Zotero | Draft backed by verifiable paper notes and properly formatted citations |

---

## 4 Steps to Pair Zotero and Yomitomo

### Step 1: Collect Broadly in Zotero
Use the Zotero Connector to capture everything relevant to your topic into Zotero collections (for example, "To Read," "Baselines," or "Ablations") so your bibliographic metadata and BibTeX keys stay clean from day one.

### Step 2: Import Core Papers Into Yomitomo
Drag the papers that deserve close reading into Yomitomo (up to 10 PDFs per batch, up to 120 MB per file). Use highlight colors to distinguish key claims, methodological assumptions, and questions for lab meetings, and press `A` to record your own thoughts beside the text. Original PDF files are never modified.

### Step 3: Question Claims with Reading Companions
Inside a highlight's discussion thread, `@`-mention **Reading Companions** (or use **Ask assistants**):

- **@DanielPark** (Structure Navigator): Traces how an experiment or proof supports the paper's thesis.
- **@GideonFrost** (First-Principles Reviewer): Checks assumptions, baselines, and missing variables.
- **@IrisChen** (Concept Translator): Clarifies unfamiliar mathematical notation or domain terms in context.
- **@MayaBrooks** (Question Mentor): Sharpens half-formed doubts into concrete questions for seminars.

### Step 4: Distill Key Threads, Query Across Papers, and Export Markdown
When a highlight's discussion produces a conclusion worth keeping, click **Distill these thoughts** to open the **Distillation** window, click **Organize discussion**, refine the draft, and run **Review Assistants** in the right-hand review panel—such as **Simone Carter** (Logic Auditor), **Arthur Whitfield** (Evidence Archivist), or **Julian Cross** (Final Copy Editor)—accepting or rejecting inline diff proposals item by item.

Before writing a related-work section, open **Reading Memory** and run **Ask library** scoped to that project's collection or selected papers to pull together your saved highlights, thoughts, discussions, and published distillations with citations.

Finally, use built-in **Export Markdown (.md)** or **Copy Markdown** (for an individual distillation, a whole paper's notes, or an **Ask library** answer) and paste the text into your Zotero item note or LaTeX/Word draft, where Zotero handles formal citations.

---

## Who This Is For and Where It Stops

### Good Fit

- Graduate students, postdocs, and researchers who already rely on Zotero for references and want stronger close-reading, AI discussion, and cross-paper note retrieval.
- Authors drafting literature reviews, grant proposals, and dissertation chapters.

### Not Designed For

- **Replacing Zotero's citation engine**: Yomitomo has no BibTeX or LaTeX citation export and no automatic sync with Zotero.
- **Image-only scanned PDFs**: Run OCR before importing scanned papers into Yomitomo.

---

## Frequently Asked Questions (FAQ)

### Q1: Why not just highlight inside Zotero's built-in PDF reader?
Zotero's reader is great for quick highlights and keeping annotations inside your reference manager. Yomitomo adds passage-anchored multi-turn discussions with specialized **Reading Companions**, single-highlight **Distillation** with **Review Assistants** and inline diff previews, page-by-page **Bilingual translation** for single-column PDFs, and **Reading Memory** (**Ask library**, **Find related**, **Revisit**) across your local reading notes.

### Q2: Does importing a PDF into Yomitomo copy the file on disk?
Yes. Yomitomo stores a local copy of imported PDFs inside its application data directory so your Zotero library files stay untouched and your Yomitomo backups remain self-contained. Import only the papers you plan to read closely rather than mirroring your entire Zotero archive.

---

## Related Guides & Workflows

- [Academic Paper Deep Reading: An AI-Powered Workflow for Researchers](/en/blog/scenarios/academic-paper-reading/)
- [Critical Reading in Practice: Deconstruct Arguments with AI Review Agents](/en/blog/scenarios/critical-reading/)
- [Knowledge Distillation Workflow: From Fragmented Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [Reader, Annotations, and Discussions](/en/docs/reader/)
