---
title: AI Reading Companions and Assistants
description: Configure specialized reading companions and in-depth review assistants to enrich highlights, discussions, and distilled notes.
---

Yomitomo's AI capabilities are anchored directly to your source text. Every generated reflection, reply, and review comment references specific paragraphs, selections, or distilled drafts—allowing you to verify claims against original evidence at any time.

<picture>
  <source
    srcset="/assets/en-assistant-640.webp 640w, /assets/en-assistant-960.webp 960w, /assets/en-assistant-1280.webp 1280w, /assets/en-assistant-1600.webp 1600w, /assets/en-assistant-2400.webp 2400w, /assets/en-assistant.webp 3388w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/en-assistant.webp" alt="Yomitomo assistants" loading="eager" width="3388" height="2520" fetchpriority="high" decoding="async" />
</picture>

## Involve Assistants in Your Workflow

There are three primary ways to interact with AI assistants during reading:

1. **Highlight Reflections**: Create a highlight on selected text to receive instant contextual thoughts from an assistant.
2. **Discussion `@` Mentions**: Type `@assistant_name` in any highlight discussion thread to invite a specialized persona into the conversation.
3. **Distillation Review**: In the distillation window, select review assistants to analyze your draft and generate structured improvement suggestions.

Assistant responses remain strictly grounded in the document context, your notes, and the active discussion—avoiding detached, generic summaries.

## Context Awareness and Memory

Each assistant keeps its own conversation memory for a document, so earlier thoughts, discussions, and Q&A carry over into later replies. When generating thoughts, replies, or reviews, assistants look up what they need:

- The document's outline and source paragraphs, including full-text search
- Your historical annotations, questions, and discussion records
- Reading memory built across previous reading sessions

For EPUB ebooks, a request started from a highlight lets the assistant read earlier chapters and the whole chapter containing the highlight. Questions without a selection stop at your reading progress. Later chapters are not available to assistants.

Passages and discussions cited in replies appear as links: a passage link moves the reader to the source text (for PDFs, to its page), and a discussion link opens that discussion. Discussions and Reader Q&A show steps such as reading the source text. Closing a window does not stop a reply in progress.

## Reading Companions Matrix

Reading companions focus on co-reading, concept clarification, deeper questioning, and structural analysis:

| Assistant    | Persona            | Key Specialty                                  |
| ------------ | ------------------ | ---------------------------------------------- |
| June Hartley | Marginal Co-reader | Clarifying core concepts and adding context    |
| Gideon Frost | Root-Cause Reader  | Examining premises and tracing causality       |
| Maya Brooks  | Question Mentor    | Turning vague confusion into precise questions |
| Marcus Reed  | Insight Editor     | Extracting transferable mental models          |
| Iris Chen    | Concept Translator | Explaining terminology and historical context  |
| Daniel Park  | Structure Guide    | Dissecting argument flow and paragraph roles   |

## Review Assistants Matrix

Review assistants specialize in factual evidence, logical rigor, clarity of expression, and actionable outcomes:

| Assistant        | Persona            | Key Specialty                              |
| ---------------- | ------------------ | ------------------------------------------ |
| Arthur Whitfield | Evidence Librarian | Checking facts and evidence chain validity |
| Hannah Wells     | Reader Advocate    | Safeguarding reader clarity and questions  |
| Julian Cross     | Final Editor       | Trimming redundancy and sharpening prose   |
| Simone Carter    | Logic Reviewer     | Detecting cognitive gaps and leap of logic |
| Victor Tan       | Risk Reviewer      | Flagging overgeneralizations and biases    |
| Grace Kim        | Action Calibrator  | Validating feasibility of concrete steps   |

You can enable or disable specific assistants and inspect their full prompt configurations on the **Assistants** page.
