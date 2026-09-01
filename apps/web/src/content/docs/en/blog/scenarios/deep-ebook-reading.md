---
title: "Deep Reading for Non-Fiction eBooks: From Passive Highlighting to Cognitive Mastery"
description: Highlight dozens of lines in non-fiction books only to forget them weeks later? Use Yomitomo's multi-tier annotations, AI conceptual mapping, and chapter-level distillation to build lasting mental models.
---

You have likely experienced this frustration: you finish an insightful non-fiction book on cognitive science or business strategy, diligently highlighting key sentences. Months later, you can only vaguely praise it as "worth reading," unable to recall its core arguments or operationalize its frameworks.

This failure stems from traditional e-reader design, which treats colored highlights as the finish line of reading. In reality, highlighting is merely the **initial trace**. True mastery requires deconstructing unfamiliar terminology, connecting arguments across chapters, and condensing hundreds of pages into reusable mental models.

Yomitomo transforms EPUB reading into a **deliberate distillation environment**.

---

## Non-Fiction eBook Deep Reading Workflow

| Stage | User Action & Input | Internal Processing | Output & Asset | Boundaries |
|---|---|---|---|---|
| **eBook Ingestion** | Import local standard EPUB files | Local parsing of TOC, typography, and chapter DOM structure | Clean, distraction-free reading view with custom typography | Supports standard EPUB; DRM-locked files not supported |
| **Five-Tier Annotation** | Select text, press `A` | Binds DOM chapter anchor; tags as Key Point, Concept, Assumption, etc. | Structured sidebar annotations filterable by category | Stored in local SQLite; leaves source EPUB file untouched |
| **On-Site Concept Analysis** | Summon `@ShenQingyuan` or `@ChenYanshu` in thread | Injects passage and chapter context into LLM prompt | Clear contextual definition and transferable mental model | Analysis strictly follows book context without drifting |
| **Chapter Distillation** | Press `T` to open Distillation Studio | Aggregates chapter highlights; refines draft with review agents | 300–500 word high-density chapter knowledge card | Focuses on reader's restructured framework, not raw TOC summaries |

---

## Moving Beyond Flat Highlighting

When reading an EPUB in Yomitomo, select text and press `A` to assign an explicit cognitive role:
- **Key Point**: Central theses and empirical conclusions;
- **Assumption**: Unstated premises (e.g., "Assumes market actors behave with perfect rationality");
- **Concept**: Newly introduced frameworks or technical definitions;
- **Question**: Counter-intuitive claims or logical leaps;
- **Quote**: Striking prose suited for citation.

This categorization forces your brain to evaluate **how each passage connects to your existing mental models**.

---

## On-Site Concept Unpacking Without Context Switching

Encountering obscure jargon often forces readers to search the web, inevitably triggering digital distractions. In Yomitomo, invoke `@ShenQingyuan` (Concept Translator) inside the highlight thread. She breaks down the term's intellectual heritage and context-specific nuance right beside the text.

---

## Concluding Chapters with Distillation

EPUBs have natural chapter boundaries. Yomitomo encourages a compounding rhythm: **conclude each chapter by pressing `T` to open Distillation Studio**.

Synthesize the chapter's core arguments, test your practical takeaways, and invoke review agents to polish your draft. Once published, your chapter distillation card replaces scattered highlights in the sidebar, providing an instant high-density executive summary upon future visits.

---

## Target Audience & Usage Boundaries

### Who This Is For

- Readers studying complex non-fiction in economics, psychology, philosophy, and management;
- Knowledge workers turning theoretical books into actionable frameworks;
- Lifelong learners seeking to build a permanent personal digital library.

### What This Is Not For

- **Casual fiction & entertainment**: Heavy cognitive tagging is unnecessary for plot-driven leisure;
- **Adobe DRM-locked files**: Yomitomo does not bypass proprietary DRM locks.

---

## Frequently Asked Questions (FAQ)

### Q1: What eBook formats are supported besides EPUB?
**Answer:** Yomitomo natively supports standard EPUB eBooks, PDF whitepapers/papers, and captured web articles. For MOBI or AZW3 files, convert them to standard EPUB using Calibre before importing.

### Q2: How do I export all chapter distillations for an entire book?
**Answer:** In the Library view, open the book's overview panel to view all completed chapter distillation cards. You can copy them in one click as a unified Markdown document.

### Q3: Why do published distillation cards replace raw highlights in the sidebar?
**Answer:** Cognitive load management: once you have distilled a chapter, your high-density conclusions take precedence, reducing visual clutter while retaining instant jump links back to source passages.

---

## Related Guides & Workflows

- [Knowledge Distillation Workflow: From Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [WeRead Notes Migration Guide: Bring Highlights Local](/en/blog/scenarios/weread-migration/)
- [The Right Way to Use AI Reading Companions](/en/blog/scenarios/ai-reading-companion/)
- [EPUB Reader Feature Documentation](/en/docs/reader/)
