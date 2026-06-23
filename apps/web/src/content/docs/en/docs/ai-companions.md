---
title: AI Reading Companions and Assistants
description: Configure reading assistants and review assistants, then use them in highlights, discussions, and distilled notes.
---

Yomitomo's AI features work around source-text anchors. Assistant thoughts, replies, and review comments are designed to point back to specific paragraphs, selections, or distilled drafts so you can return to the evidence.

<picture>
  <source
    srcset="/assets/en-assistant-1600.webp 1600w, /assets/en-assistant-2400.webp 2400w, /assets/en-assistant.webp 3388w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/en-assistant.webp" alt="Yomitomo assistants" loading="eager" decoding="async" />
</picture>

## Use Assistants While Reading

There are three ways to involve assistants:

1. Select source text and create an annotation so an assistant can add a thought based on that passage.
2. Mention `@assistant name` in a highlight discussion to invite a specific assistant into the thread.
3. Choose review assistants in the distillation window so they can review a draft note.

Assistant replies try to stay grounded in the source text, existing highlights, and the current discussion instead of producing generic summaries.

## Context Scope

When assistants generate thoughts, replies, or reviews, they can reference:

- The full text of the current paragraph
- Your existing annotations and discussions
- Earlier reading memory
- The article outline and overall structure

For EPUB books, you can also configure spoiler scope: current selection, current chapter, read content, or the whole book.

## Reading Assistants

Reading assistants focus on co-reading, explanation, questioning, and structure:

| Assistant    | Role               | Good At                                        |
| ------------ | ------------------ | ---------------------------------------------- |
| June Hartley | Marginal co-reader | Clarifying concepts and adding context         |
| Gideon Frost | Root-cause reader  | Examining premises and tracing causality       |
| Maya Brooks  | Question mentor    | Turning vague confusion into precise questions |
| Marcus Reed  | Insight editor     | Extracting transferable insights               |
| Iris Chen    | Concept translator | Explaining terms and conceptual background     |
| Daniel Park  | Structure guide    | Identifying structure and paragraph function   |

## Review Assistants

Review assistants focus on evidence, logic, clarity, risk, and actionability:

| Assistant        | Role               | Good At                                    |
| ---------------- | ------------------ | ------------------------------------------ |
| Arthur Whitfield | Evidence librarian | Checking facts and evidence chains         |
| Hannah Wells     | Reader advocate    | Protecting the reader's real question      |
| Julian Cross     | Final editor       | Reducing redundancy and improving clarity  |
| Simone Carter    | Logic reviewer     | Detecting gaps in reasoning                |
| Victor Tan       | Risk reviewer      | Flagging overgeneralization and risk       |
| Grace Kim        | Action calibrator  | Checking whether next steps are executable |

You can enable or disable assistants and review their role descriptions in the Assistants page.
