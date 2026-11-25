---
title: "Knowledge Distillation Workflow: From Fragmented Highlights to Structured Cards"
description: Turn a single highlight and its discussion into a clear, verified distilled note—then connect distilled notes across your library with Reading Memory and Markdown export.
---

Highlighting is easy; turning highlights into notes you can actually use months later is the hard part. Most reading apps stop at collecting excerpts, leaving you with hundreds of disconnected quotes and no record of why you cared about them.

Yomitomo organizes close reading into four progressive steps attached to a passage: **Highlight → Thought → Discussion → Distillation**, backed by **Reading Memory** when you want to connect notes across documents.

---

## The Four Steps on a Passage

| Step | What You Do | How Yomitomo Handles It | Result |
|---|---|---|---|
| **1. Highlight** | Select text and click **Highlight** (or press `A`), optionally choose a highlight color | Anchors the selection to the source text in local SQLite | Highlight card linked to the exact passage |
| **2. Thought** | Press `A` and write your immediate reaction | Saves your note verbatim beside the highlight (never altered by AI) | Personal note tied to the source quote |
| **3. Discussion** | Open the highlight's thread and `@`-mention a reading companion (or click **Ask assistants**) | Sends the passage, surrounding context, and thread history to your configured model | Multi-turn discussion anchored to that highlight |
| **4. Distillation** | Click **Distill these thoughts** inside the highlight's discussion | Opens the **Distillation** window with **Organize discussion** and right-hand **Review Assistants** | Published distillation replacing that single highlight card in the sidebar |

---

## Step-by-Step Walkthrough

### 1. Highlight (Mark the Passage)
Select a sentence or paragraph and click **Highlight** in the selection menu, or press `A` to highlight and write a note in one step. Pick a highlight color if you want a simple visual system across your notes.

### 2. Thought (Capture Your Own Reaction)
Write down why the passage stood out—a disagreement, an example from work, or a question you want to verify. Even one sentence is enough, and Yomitomo keeps your wording exactly as you wrote it.

### 3. Discussion (Test the Idea)
When a passage deserves deeper questioning, open its discussion thread and `@`-mention one of the six **Reading Companions**:

- **@MayaBrooks** (Question Mentor): Sharpens vague doubts into concrete questions.
- **@GideonFrost** (First-Principles Reviewer): Tests premises and causal logic.
- **@MarcusReed** (Insight Editor): Helps connect a passage to practical takeaways.
- **@IrisChen** (Concept Translator): Clarifies unfamiliar terms in context.
- **@DanielPark** (Structure Navigator): Explains the passage's role in the wider argument.
- **@JuneHartley** (Margin Reading Companion): Offers quick context and commentary.

### 4. Distillation (Organize and Publish One Highlight's Discussion)
Distillation in Yomitomo works on a **single highlight's discussion**—it turns one messy thread into a clean, self-contained note rather than summarizing an entire book or batch of articles.

1. Inside the highlight's discussion window, click **Distill these thoughts** to open the **Distillation** window.
2. Click **Organize discussion** to pull points from the thread into your draft. This action only adds content; it does not overwrite your existing text.
3. Edit the draft in your own words.
4. Select one or more **Review Assistants** in the right-hand review panel (**Arthur Whitfield**, **Hannah Wells**, **Julian Cross**, **Simone Carter**, **Victor Tan**, or **Grace Kim**). Review Assistants can only be used here, not via `@`-mentions in highlight threads.
5. Inspect each suggested edit in the **inline diff preview**, accept or reject item by item, and publish.

Publishing replaces only that single highlight card in the sidebar while keeping the jump link to the source passage.

---

## Connecting Distillations Across Documents

Once you have published distillations across multiple articles or books, use **Reading Memory** to work across your library:

- **Distillations** library: Review all published distillations in one view.
- **Find related**: From any highlight in the reader, surface related notes from other local documents.
- **Ask library**: Ask cross-document questions scoped to all sources, a collection, or selected documents, and copy the cited answer as Markdown.
- **Revisit**: Test your recall of a past highlight before revealing your saved thought.

Reading Memory indexes saved highlights, thoughts, participated discussions, and published distillations from your local articles (not WeRead entries, full article text, or unpublished drafts).

---

## Who This Is For and Where It Stops

### Good Fit

- Readers who want key discussions compressed into clear personal notes without losing links to the original passage.
- Writers, researchers, and analysts who reuse reading takeaways in memos, essays, or external vaults.

### Not Designed For

- **Automatic whole-book or multi-document summarization**: Distillation intentionally starts from a single highlight's discussion that you engaged with.
- **Passive link hoarding**: If you only want bookmarks, a browser folder is simpler.

---

## Frequently Asked Questions (FAQ)

### Q1: Can I edit a distillation after publishing it?
Yes. You can reopen and edit any published distillation from the sidebar or the **Distillations** library, and the original passage anchor and discussion history remain accessible.

### Q2: How do I move distillations into Obsidian or Notion?
Use the built-in **Export Markdown (.md)** or **Copy Markdown** actions available in the **Distillation** window, the **Distillations** library, the reader toolbar (for a whole document), and **Ask library** answers. There is no automatic two-way sync to Obsidian or Notion.

### Q3: Why distill manually instead of generating an AI summary?
An AI summary gives you the model's compression of a text. A distillation captures what you questioned, verified, and decided to keep—grounded in the exact passage where the thought started.

---

## Related Guides & Workflows

- [Critical Reading in Practice: Deconstruct Arguments with AI Review Agents](/en/blog/scenarios/critical-reading/)
- [Deep Reading for Non-Fiction eBooks: From Passive Highlighting to Cognitive Mastery](/en/blog/scenarios/deep-ebook-reading/)
- [Why Local-First Architecture Matters: Building Lifelong Intellectual Assets](/en/blog/scenarios/local-first-privacy/)
- [Distilled Notes and Review](/en/docs/sedimentation/)
