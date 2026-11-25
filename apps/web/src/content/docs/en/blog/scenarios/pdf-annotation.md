---
title: "PDF Annotation in Practice: Review Contracts, Whitepapers, and Reports"
description: Review dense contracts, industry reports, and technical whitepapers locally in Yomitomo with PDFium rendering, anchored notes, Reading Companions, Distillation review, and Markdown export.
---

Contracts, equity research, policy whitepapers, and technical specifications usually arrive as long PDFs packed with dense clauses and charts. Standard PDF viewers give you colored markers and sticky notes, which quickly turn into an unsearchable pile of comments when you need to compile questions or a review memo.

Yomitomo keeps PDF rendering, anchored notes, AI discussion, and Markdown export local on your desktop while leaving the original PDF file untouched.

---

## Professional PDF Review Workflow

| Stage | User Action | How Yomitomo Handles It | Output | Boundaries |
|---|---|---|---|---|
| **Batch Import** | Import up to 10 PDFs at once (up to 120 MB/file) | Renders locally via PDFium with automatic deduplication | Local library entry; dark mode preserves original page colors by default (plus optional **Dark eye-care filter**) | Requires a text layer for selection/translation; no built-in OCR for image-only scans |
| **Clause Marking** | Select text, click **Highlight** or press `A` to record a thought, pick a highlight color | Stores passage coordinates, color, and verbatim thought in local SQLite | Anchored highlight card in the sidebar with its own discussion thread | Non-destructive overlay; original PDF file is never modified |
| **Passage Interrogation** | `@`-mention a reading companion (e.g., `@GideonFrost`, `@DanielPark`, `@MayaBrooks`) or press `Q` for **Reader Q&A** | Sends the selected clause, surrounding context, and prompt to your configured model | Multi-turn analysis attached to that exact clause | AI provides reading assistance, not legal or compliance certification |
| **Clause Distillation** | Click **Distill these thoughts** in a highlight's discussion | Opens the **Distillation** window with **Organize discussion** and right-hand **Review Assistants** | Inline diff preview (accept/reject item by item) → published distillation card | Operates on one highlight's discussion at a time |
| **Cross-Document Synthesis & Export** | Use **Reading Memory** (**Ask library**, **Find related**) or **Export Markdown (.md)** / **Copy Markdown** | Queries saved notes across a collection or selected PDFs; exports clean Markdown | Cited Markdown answers or full document note export | No annotated-PDF export and no automatic external sync |

---

## Practical PDF Reading Controls

Yomitomo includes several PDF-specific features suited to long business and technical files:

- **Batch import with deduplication**: Import up to 10 PDFs at a time (up to 120 MB per file).
- **Original page colors in dark mode**: Dark mode preserves original PDF page colors by default so financial charts, maps, and schematics stay legible, with an optional **Dark eye-care filter** if you prefer reduced glare.
- **Zoom controls**: Switch between **Fit width**, **Fit page**, and **100%**, or adjust with `⌘/Ctrl +`, `−`, and `0`.
- **Bilingual translation**: Translate single-column text PDFs page by page directly in the reader.

Use per-highlight customizable colors to keep reviews structured without heavy overhead—for example, one color for binding obligations, another for assumptions or financial projections, and a third for clauses requiring follow-up.

---

## Separating Reading Companions from Review Assistants

When reviewing a dense clause, match the assistant to the stage of your work:

1. **Inside a highlight's discussion thread (Reading Companions)**:
   - **@GideonFrost** (First-Principles Reviewer): Probes hidden assumptions, missing edge cases, and whether a metric or covenant actually guarantees the claimed outcome.
   - **@DanielPark** (Structure Navigator): Clarifies how a clause relates to definitions or sections elsewhere in the document.
   - **@MayaBrooks** (Question Mentor): Helps turn a vague concern into concrete negotiation or due-diligence questions.
   - **@IrisChen** (Concept Translator): Explains specialized financial, technical, or regulatory terminology in plain language.
2. **Inside the Distillation window (Review Assistants)**:
   - Click **Distill these thoughts** on a highlight's discussion to draft your takeaway, then select **Review Assistants** in the right-hand review panel (they cannot be `@`-mentioned in highlight threads): **Arthur Whitfield** (Evidence Archivist), **Simone Carter** (Logic Auditor), **Victor Tan** (Risk Examiner), **Grace Kim** (Action Calibrator), **Hannah Wells** (Reader Advocate), or **Julian Cross** (Final Copy Editor).
   - Review their suggested edits in the inline diff preview and accept or reject each change individually.

When reviewing a deal or project across several PDFs, group them into a collection and use **Reading Memory** (**Ask library** scoped to that collection or selected PDFs) to compile a cited Markdown summary of your notes across documents.

---

## Who This Is For and Where It Stops

### Good Fit

- Legal, investment, consulting, procurement, and engineering readers reviewing dense PDF reports, filings, and specifications.
- Readers handling confidential files who want local storage and the option to run AI through a local Ollama model.

### Not Designed For

- **PDF editing, form filling, or e-signatures**: Yomitomo is a close-reading and annotation tool, not a PDF editor.
- **Exporting annotations back into the PDF file**: Yomitomo exports notes as Markdown, not annotated PDFs.
- **Unprocessed image scans**: Image-only PDFs require OCR in another tool before text can be selected or translated.

---

## Frequently Asked Questions (FAQ)

### Q1: Are confidential PDFs uploaded to a cloud server?
Imported PDFs and notes are stored locally on your machine. If you invoke a remote AI or translation provider, the passage and context needed for that request are sent directly to your configured provider endpoint. If you configure a local model via Ollama, inference runs on your own computer. See [Why Local-First Architecture Matters: Building Lifelong Intellectual Assets](/en/blog/scenarios/local-first-privacy/) for the full outbound network boundary.

### Q2: Does annotating a PDF alter the original file?
No. All highlights, thoughts, discussions, and distillations are stored in Yomitomo's local SQLite database. The source PDF binary is never modified.

### Q3: Why does dark mode keep original PDF page colors by default?
Inverting financial charts, heatmaps, and technical diagrams often breaks color-coded legends and makes figures unreadable. Keeping original page colors preserves visual accuracy, while the optional **Dark eye-care filter** is available when you want a dimmer page.

---

## Related Guides & Workflows

- [Academic Paper Deep Reading: An AI-Powered Workflow for Researchers](/en/blog/scenarios/academic-paper-reading/)
- [Critical Reading in Practice: Deconstruct Arguments with AI Review Agents](/en/blog/scenarios/critical-reading/)
- [Why Local-First Architecture Matters: Building Lifelong Intellectual Assets](/en/blog/scenarios/local-first-privacy/)
- [Reader, Annotations, and Discussions](/en/docs/reader/)
