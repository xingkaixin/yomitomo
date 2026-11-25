---
title: "Deep Reading for Non-Fiction eBooks: From Passive Highlighting to Cognitive Mastery"
description: Read DRM-free EPUB, AZW3, and MOBI non-fiction ebooks in Yomitomo with anchored notes, spoiler-safe reading companions, single-highlight distillation, Reading Memory, and Markdown export.
---

It is common to finish a dense non-fiction book with dozens of highlighted sentences, only to forget the book's actual argument a month later. Highlighting marks what sounded good at the time, but it does not force you to test unfamiliar terms, write down your own reaction, or connect an idea to what you already know.

Yomitomo lets you read DRM-free ebooks locally, discuss specific passages without leaving the page, distill key threads into reusable notes, and retrieve them later through **Reading Memory**.

---

## Non-Fiction eBook Reading Workflow

| Stage | User Action | How Yomitomo Handles It | Output | Boundaries |
|---|---|---|---|---|
| **eBook Import** | Import DRM-free **EPUB, AZW3, or MOBI** files (up to 80 MB/book, 10/batch) | Parses TOC and chapters natively; stores original file locally | Local ebook entry in your library | DRM-locked files are not supported |
| **Anchored Notes** | Select text, click **Highlight** or press `A` to record a thought, pick a color | Saves text anchor, highlight color, and your verbatim thought in local SQLite | Highlight card in the sidebar with its own discussion thread | Non-destructive; source ebook file stays untouched |
| **Passage Discussion** | `@`-mention a reading companion (e.g., `@IrisChen`, `@MarcusReed`) or press `Q` for **Reader Q&A** | Sends passage and surrounding context to your configured model | Multi-turn thread attached to that passage | For EPUBs, assistants observe a spoiler-safe boundary (only chapters up to the highlighted chapter or current reading progress) |
| **Distillation** | Click **Distill these thoughts** in a highlight's discussion | Opens the **Distillation** window with **Organize discussion** and right-hand **Review Assistants** | Published distillation replacing that single highlight card in the sidebar | Operates on one highlight's discussion, not an entire chapter or book |
| **Book-Wide Recall & Export** | Use **Reading Memory** (**Ask library**, **Distillations**, **Revisit**) or **Export Markdown (.md)** | Searches saved notes across local articles or exports full book notes as Markdown | Cited cross-chapter answers, blind recall prompts, or `.md` files | No automatic two-way sync to external note apps |

---

## Capture Your Own Reaction, Not Just Yellow Lines

When a passage matters, select it and press `A` to write a quick thought right away, or click **Highlight** in the selection menu to mark it first. You can assign custom highlight colors per highlight (for instance, one color for core claims and another for questions), press `C` to copy, or click **Find related** to see whether you highlighted a similar idea in another book.

Yomitomo saves your highlights and thoughts verbatim and never rewrites them. Even without any AI provider configured, reading, highlighting, writing thoughts, and keyword search work offline.

---

## Unpack Unfamiliar Terms Without Leaving the Book

Stopping to search the web for an unfamiliar concept often pulls you out of the book entirely. Inside a highlight's discussion thread, `@`-mention a **Reading Companion** (or use **Ask assistants**):

- **@IrisChen** (Concept Translator): Explains specialized terms and definitions in plain language based on how the book uses them.
- **@MarcusReed** (Insight Editor): Pulls out practical takeaways and connections.
- **@DanielPark** (Structure Navigator): Explains how the current passage fits into the chapter's argument.
- **@GideonFrost** (First-Principles Reviewer): Challenges hidden assumptions in the author's reasoning.
- **@JuneHartley** (Margin Reading Companion) and **@MayaBrooks** (Question Mentor): Offer accessible margin commentary or help sharpen a vague question.

For EPUBs, assistants automatically respect a spoiler-safe readable boundary—they only see chapters up to the highlighted chapter or your current reading progress.

---

## Distill Important Threads and Review Across the Book

When a highlight's discussion develops into a real insight, click **Distill these thoughts** inside that discussion to open the **Distillation** window.

1. Click **Organize discussion** to pull points from the thread into your draft (additions only).
2. Rewrite and tighten the takeaway in your own words.
3. Optionally select **Review Assistants** in the right-hand review panel (such as **Simone Carter**, **Arthur Whitfield**, or **Julian Cross**) and accept or reject their inline diff suggestions item by item.
4. Publish. The published distillation replaces that single highlight card in the sidebar while keeping its jump link back to the passage.

Because each distillation belongs to one highlight's discussion, use **Reading Memory** when you want to step back across chapters or multiple books:

- **Distillations** library: Browse all published distillations in one place.
- **Ask library**: Ask questions scoped to this book, a collection, or selected books, and copy cited answers as Markdown.
- **Revisit**: Practice blind recall on a past highlight before revealing what you originally wrote.

---

## Who This Is For and Where It Stops

### Good Fit

- Readers studying non-fiction in economics, psychology, history, philosophy, technology, or management.
- Readers who own DRM-free EPUB, AZW3, or MOBI books and want notes stored locally.
- Readers who want to export structured Markdown notes without losing links to original passages inside Yomitomo.

### Not Designed For

- **DRM-locked store files**: Yomitomo does not bypass Adobe, Kindle, or other proprietary DRM locks.
- **Cloud-synced mobile reading**: Yomitomo is a desktop application for macOS and Windows.

---

## Frequently Asked Questions (FAQ)

### Q1: What ebook formats does Yomitomo support?
Yomitomo natively supports DRM-free **EPUB, AZW3, and MOBI** ebooks (up to 80 MB per book, up to 10 books per batch)—no Calibre conversion needed for AZW3 or MOBI. It also supports PDFs, web articles, `.txt`/`.md` files, and synced WeRead notes.

### Q2: How do I export all notes and distillations from a book?
Use **Export Markdown (.md)** or **Copy Markdown** in the reader toolbar to export the entire book's highlights, thoughts, discussions, and published distillations at once. You can also export or copy any individual distillation from the **Distillation** window or the **Distillations** library.

### Q3: What happens to the original highlight when I publish a distillation?
Publishing replaces only that single highlight card in the sidebar with your distilled note so the margin stays readable. The link back to the passage remains intact, and you can reopen the distillation or its underlying discussion at any time.

---

## Related Guides & Workflows

- [Knowledge Distillation Workflow: From Fragmented Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [WeRead Notes Migration Guide: Bring Your Highlights and Thoughts Local](/en/blog/scenarios/weread-migration/)
- [The Right Way to Use AI Reading Companions: Partner with Models, Don't Outsource Thinking](/en/blog/scenarios/ai-reading-companion/)
- [Reader, Annotations, and Discussions](/en/docs/reader/)
