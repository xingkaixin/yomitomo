---
title: "The Right Way to Use AI Reading Companions: Partner with Models, Don't Outsource Thinking"
description: Use Yomitomo's reading companions and review assistants on demand—anchored to passages you choose—without handing over your judgment to generic book summaries.
---

"Read an entire book in 30 seconds with AI" is a common pitch: upload a file, click summarize, and skim a list of bullets. You get a quick overview, but you skip the parts that actually make reading stick—noticing weak assumptions, questioning unfamiliar terms, and testing whether an argument holds up.

Yomitomo treats AI as an on-demand reading partner, not a substitute reader. Active AI output only runs when you explicitly trigger it—never automatically while you scroll or turn pages. Your own highlights and thoughts are always saved and shown verbatim.

---

## How AI Fits Into the Reading Flow

| Stage | Trigger Action | System Behavior | Output | Boundaries |
|---|---|---|---|---|
| **Highlight & Thought** | Select text, click **Highlight** or press `A` to record a thought | Saves text anchor, optional highlight color, and your verbatim note in local SQLite | Highlight card in the sidebar with its own discussion thread | Reading and manual annotation work normally even with no AI configured |
| **Passage Discussion** | `@`-mention a reading companion in a highlight thread, click **Ask assistants**, or press `Q` for **Reader Q&A** | Sends the passage, surrounding context, and your prompt to your configured model | Reply attached to that highlight's thread (or to the open document in Reader Q&A) | Only runs on explicit user action; for EPUBs, context stops at the highlighted chapter or your current reading progress to avoid spoilers |
| **Multi-Turn Follow-Up** | Reply in the highlight thread with follow-up questions or counterarguments | Includes that thread's history in the request | Persistent discussion record anchored to the source text | Stays attached to that highlight so you can verify claims against the original passage |
| **Distillation & Review** | Click **Distill these thoughts** inside a highlight's discussion | Opens the **Distillation** window; supports **Organize discussion** and right-hand **Review Assistants** | Inline diff proposals you accept or reject item by item | Operates on a single highlight's discussion; you keep final editorial control |

---

## Anchored to the Text You Choose

When you select a passage in Yomitomo, you can click **Highlight**, press `A` to record a thought, press `C` to copy, press `Q` to ask a question in **Reader Q&A**, or click **Find related** to check your past notes in **Reading Memory**.

In a highlight's discussion thread, replies are grounded in that specific passage and its surrounding context. For EPUBs, assistants also respect a spoiler-safe reading boundary: they only read chapters up to the highlighted chapter or your current reading progress.

Because every thread stays linked to its source sentence, you can always jump back and check whether an AI reply actually matches what the author wrote.

---

## Two Distinct Groups of Built-In Assistants

Yomitomo separates assistants by where they work: **Reading Companions** help while you read and discuss a passage, while **Review Assistants** critique a draft inside the **Distillation** window.

### Reading Companions (6 Built-In)

You can `@`-mention these companions in any highlight discussion thread, pick them via **Ask assistants**, or chat with them in **Reader Q&A** (`Q`):

- **June Hartley** (`@JuneHartley`, Margin Reading Companion): Offers quick context and approachable explanations beside the text.
- **Gideon Frost** (`@GideonFrost`, First-Principles Reviewer): Challenges underlying premises, logic steps, and hidden assumptions.
- **Maya Brooks** (`@MayaBrooks`, Question Mentor): Helps turn vague doubts into specific, testable questions.
- **Marcus Reed** (`@MarcusReed`, Insight Editor): Connects passages to practical takeaways and broader implications.
- **Iris Chen** (`@IrisChen`, Concept Translator): Explains specialized terminology and concepts in plain language.
- **Daniel Park** (`@DanielPark`, Structure Navigator): Clarifies how a passage fits into the author's overall structure and argument.

### Review Assistants (6 Built-In)

Review assistants are selectable **only** in the right-hand review panel of the **Distillation** window. They cannot be `@`-mentioned inside highlight discussion threads:

- **Arthur Whitfield** (Evidence Archivist): Checks whether claims in your draft have concrete backing.
- **Hannah Wells** (Reader Advocate): Spots unclear jumps or missing context from a reader's perspective.
- **Julian Cross** (Final Copy Editor): Cuts wordiness and tightens phrasing.
- **Simone Carter** (Logic Auditor): Flags logical gaps, leaps, and weak causal links.
- **Victor Tan** (Risk Examiner): Surfaces unhedged claims, blind spots, and edge cases.
- **Grace Kim** (Action Calibrator): Checks whether practical conclusions or next steps are realistic and specific.

---

## Who This Is For and Where It Stops

### Good Fit

- Readers who want to do the thinking themselves and use AI to test or clarify specific passages.
- Researchers, engineers, and analysts working through dense non-fiction, papers, and technical reports.
- Writers who want structured feedback on their own distilled notes before keeping or exporting them.

### Not Designed For

- **One-click whole-book summaries**: Yomitomo does not auto-summarize documents on import.
- **Unattended reading**: Active AI output requires your explicit prompt or action.

---

## Frequently Asked Questions (FAQ)

### Q1: Do I need a subscription to Yomitomo to use AI companions?
No. Yomitomo is free and uses your own model configuration. Connect an API key from a supported provider (such as OpenAI, Anthropic, DeepSeek, Google Gemini, or another OpenAI-compatible endpoint), or connect a local server like Ollama or LM Studio.

### Q2: Do AI companions work offline?
Manual reading, highlighting, writing thoughts, and keyword search always work offline with no AI configured. If you connect a local model through Ollama with weights already downloaded, AI discussions and reviews also run without internet access. Remote API providers require an internet connection when invoked.

### Q3: Can I edit companion prompts or create custom personas?
No. On the top-level **Assistants** page, you can read each built-in assistant's introduction and enable or disable individual assistants, but you cannot edit system prompts, set per-assistant temperature/models, or create custom personas in the UI. Model selection is configured in **Settings > Models & routing** using a shared **Default model** plus optional per-task overrides (**Reading comprehension**, **In-depth review**, and **Bilingual translation**).

---

## Related Guides & Workflows

- [Critical Reading in Practice: Deconstruct Arguments with AI Review Agents](/en/blog/scenarios/critical-reading/)
- [Academic Paper Deep Reading: An AI-Powered Workflow for Researchers](/en/blog/scenarios/academic-paper-reading/)
- [Deep Reading for Non-Fiction eBooks: From Passive Highlighting to Cognitive Mastery](/en/blog/scenarios/deep-ebook-reading/)
- [AI Reading Companions and Assistants](/en/docs/ai-companions/)
