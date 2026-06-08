---
title: "PDF Annotation in Practice: A Close-Reading Method for Contracts, Reports, and Whitepapers"
description: Facing a 50-page PDF contract, industry report, or policy whitepaper? Yomitomo's PDF reader offers annotation tools that go beyond yellow highlighting — mark key clauses, flag questions, and let AI review assistants provide a second pair of eyes.
---

PDF is the most common document format in professional life. Contracts, investment reports, technical whitepapers, policy documents — they're mostly PDFs, often dozens of pages dense with clauses and data. Ordinary PDF readers give you a highlighter, an underline tool, and sticky notes. But these tools still operate on the mental model of marking up paper — you annotate a surface, but nothing helps you **understand** that surface.

Yomitomo's PDF support isn't a PDF viewer with an annotation layer bolted on. It brings the annotation type system, AI Review Assistants, and the distillation workflow into PDF reading.

## Mark Judgment Types, Not Just Positions

After importing a PDF, select a clause or passage and press `A` to create an annotation. Yomitomo offers the same five annotation types. In a document review context, they mean:

- **Key Point**: Critical clauses, core data points, conclusive statements
- **Assumption**: Premises the document depends on (e.g., "Based on the assumption of Q3 market stability")
- **Concept**: Domain-specific terminology or abbreviations that need follow-up research
- **Question**: Contradictory data, vague wording, items requiring clarification from the other party
- **Quote**: Passages worth lifting directly into meeting minutes or memos

Here's a concrete scenario: you're reviewing a 45-page SaaS service agreement. Every time you hit a liability clause, mark it as "Key Point." Every time you see "including but not limited to," mark it as "Assumption" — this phrase expands liability scope, but the boundary is undefined. Every undefined term gets marked as "Concept." Every contradictory clause gets marked as "Question."

After the review, filter by "Question" to generate a list of items needing clarification from the counterparty. Filter by "Key Point" to quickly reconstruct the contract's core obligation framework. This type-based filtering is something traditional PDF annotation tools cannot do — they know you marked a spot, but they don't know what kind of judgment you made there.

## Let AI Review Assistants Double-Check the Document

Yomitomo's Review Assistants are especially useful in PDF scenarios because they provide a **second pair of eyes**:

- After marking a liability clause, type `@Liang Zhengyan` — the Evidence Steward reminds you to check whether the clause references data sources, applicable regulation versions, and whether they're specific enough
- When you spot a logical gap, type `@He Mingheng` — the Logic Reviewer points out missing links in the reasoning chain
- When you suspect a statement is too vague, type `@Su Dingbai` — the Risk Reviewer flags potential overgeneralizations and undeclared risks
- When your own annotation is verbose, type `@Tang Jian` — the Final Editor compresses the fluff

AI responses land in the highlight's discussion area — they don't float in a separate chat window disconnected from the document. This means every annotation has a complete, traceable discussion history. Reopen the contract three months later, and you can reconstruct the full review trail, not just the final conclusions.

## Practical PDF Import Details

Yomitomo supports batch PDF import — up to 10 files at once, with a per-file limit of 120MB. After import, the library shows page count, filename, and basic metadata. If you try to import the same PDF again, Yomitomo alerts you that the document is already in your library, preventing duplicate entries.

While reading PDFs, you can adjust font size and page width. Under dark themes, PDFs retain their original page colors — this detail matters: many contracts rely on color and formatting for meaning, and inverting colors would make them unreadable. Yomitomo chooses to preserve the document's original appearance rather than sacrifice usability for a "dark mode" aesthetic.

Like EPUBs, PDFs support the Distillation window — you can synthesize structured notes from highlights across multiple related PDFs, producing a consolidated document review output.

## Who This Is For

Lawyers, legal counsel, consultants, product managers, and investors who regularly review contracts, reports, whitepapers, or policy documents. If what you need isn't just "reading PDFs" but forming judgments, conducting reviews, and producing outputs within PDFs.
