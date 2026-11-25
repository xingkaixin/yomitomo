---
title: AI Reading Companions and Assistants
description: Configure specialized reading companions and in-depth review assistants to enrich highlights, discussions, and distilled notes.
---

Yomitomo's AI capabilities are anchored directly to your source text. Every generated reflection, reply, and review comment references specific paragraphs, selections, or distilled drafts—allowing you to verify claims against original evidence at any time.

<picture>
  <source
    srcset="/assets/en-assistant-640.webp 640w, /assets/en-assistant-960.webp 960w, /assets/en-assistant-1280.webp 1280w, /assets/en-assistant-1600.webp 1600w, /assets/en-assistant.webp 2360w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/en-assistant.webp" alt="Yomitomo assistants" loading="eager" width="2360" height="1568" fetchpriority="high" decoding="async" />
</picture>

## Involve Assistants in Your Workflow

Assistants only speak when you explicitly invoke them—never automatically on scroll, page turn, or highlight creation:

1. **Ask Assistants on a Highlight**: Open a highlight's discussion thread, add a new thought, and choose **Ask assistants** to have a selected companion write a top-level thought grounded in that passage.
2. **Discussion `@` Mentions**: Type `@assistant_name` in any highlight discussion thread to invite a specialized reading companion into the conversation.
3. **Reader Q&A**: Select text and press `Q`, or open the persistent Q&A panel in the reader to ask multi-turn questions about the current passage or document.
4. **Distillation Review**: In the Distillation window, select review assistants on the right panel to analyze your draft and generate structured improvement suggestions.

Assistant responses remain strictly grounded in the document context, your notes, and the active discussion—avoiding detached, generic summaries.

## Context Awareness and Memory

Each assistant keeps its own conversation memory for a document, so earlier thoughts, discussions, and Q&A carry over into later replies. When generating thoughts, replies, or reviews, assistants look up what they need within the readable range:

- The document's outline and source paragraphs, including full-text search
- Your historical annotations, questions, and discussion records
- Reading memory built across previous reading sessions

For EPUB ebooks, a request started from a highlight lets the assistant read earlier chapters and the whole chapter containing the highlight. Questions without a selection stop at your reading progress. Source text lookup, reading memory search, and thread reading all share this same readable boundary, so passages, annotations, and discussions in later chapters are not available to assistants.

Passages and discussions cited in replies appear as links: a passage link moves the reader to the source text (for PDFs, to its page), and a discussion link opens that discussion. Discussions and Reader Q&A show steps such as reading the source text. Closing a window does not stop a reply in progress.

When a reply fails, the assistant shows the cause, such as a missing model, an invalid API key, insufficient balance, rate limiting, or a network failure, with a retry button and a link to **Model settings**. Reader Q&A can stop generation, start, switch, or clear sessions, and copy individual answers.

## Reading Companions Matrix

Reading companions focus on co-reading, concept clarification, deeper questioning, and structural analysis:

| Assistant    | Persona                   | Key Specialty                                  |
| ------------ | ------------------------- | ---------------------------------------------- |
| June Hartley | Margin Reading Companion  | Clarifying core concepts and adding context    |
| Gideon Frost | First-Principles Reviewer | Examining premises and tracing causality       |
| Maya Brooks  | Question Mentor           | Turning vague confusion into precise questions |
| Marcus Reed  | Insight Editor            | Extracting transferable mental models          |
| Iris Chen    | Concept Translator        | Explaining terminology and historical context  |
| Daniel Park  | Structure Navigator       | Dissecting argument flow and paragraph roles   |

## Review Assistants Matrix

Review assistants specialize in factual evidence, logical rigor, clarity of expression, and actionable outcomes:

| Assistant        | Persona           | Key Specialty                               |
| ---------------- | ----------------- | ------------------------------------------- |
| Arthur Whitfield | Evidence Archivist| Checking facts and evidence chain validity  |
| Hannah Wells     | Reader Advocate   | Safeguarding reader clarity and questions   |
| Julian Cross     | Final Copy Editor | Trimming redundancy and sharpening prose    |
| Simone Carter    | Logic Auditor     | Detecting cognitive gaps and leaps of logic |
| Victor Tan       | Risk Examiner     | Flagging overgeneralizations and biases     |
| Grace Kim        | Action Calibrator | Validating feasibility of concrete steps    |

You can browse each built-in assistant's introduction and enable or disable specific assistants on the **Assistants** page.
