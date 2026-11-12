---
title: Reader, Annotations, and Discussions
description: Master highlights, thoughts, inline discussions, bilingual translation, and distilled notes for an immersive close-reading workflow.
---

The Reader seamlessly integrates full-text reading, precise text anchoring, discussion threads, and distilled notes into a single cohesive workspace. You can instantly jump back from any note to its exact context in the original text, ensuring your insights never lose their grounding.

<picture>
  <source
    srcset="/assets/en-reader-640.webp 640w, /assets/en-reader-960.webp 960w, /assets/en-reader-1280.webp 1280w, /assets/en-reader-1600.webp 1600w, /assets/en-reader.webp 2360w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/en-reader.webp" alt="Yomitomo reader" loading="eager" width="2360" height="1508" fetchpriority="high" decoding="async" />
</picture>

## Reading Workspace and Controls

The Reader displays the source on a paper surface. Footnote numbers connect underlined passages to their margin cards. The floating toolbar provides access to essential tools:

- **Table of Contents (TOC)**: Expand the chapter hierarchy. The active section is highlighted and centered automatically, making it easy to track your reading progress.
- **Full-Text Search**: Search keywords across the current document and jump directly to matches.
- **Highlight Navigation**: Cruise forward and backward between highlights without manual scrolling.
- **Persistent Assistant Chat**: Ask questions about the entire document at any time with multi-turn context retention.
- **Bilingual Translation**: Translate web articles paragraph by paragraph with visual status indicators on modified blocks.

### Typography and Visual Styling

- **Web Articles and Ebooks**: Adjust **Font Size** and **Article Width** to match your reading preferences.
- **PDFs**: Use **PDF Zoom** to achieve optimal readability.
- **Theme and Reading Appearance**: Choose light, dark, or system appearance at the bottom of the sidebar. Adjust reading size and width in the reader toolbar. PDFs keep their original page colors in dark mode.

## Create Highlights and Thoughts

1. Select any text in the reading area.
2. Drag the handles at both ends of the selection to fine-tune boundaries without re-selecting (supported across web articles, ebooks, and PDFs).
3. Press the default shortcut `A` or click the annotation button on the floating menu.
4. Record your immediate reaction, question, or analysis.

Highlights use hand-drawn underlines in your chosen color. Footnote numbers match the margin cards, and each highlight remains anchored to its source. Highlight creation and text copying can provide tactile audio feedback (configurable in Settings > General).

## Highlight Discussion Threads

Every highlight has its own discussion thread. Open an annotation card to see thoughts on the left and discussion bubbles on the right:

- Add ongoing reflections or reply to earlier thoughts.
- Type `@assistant_name` to bring specialized AI companions into the conversation. Responses are generated using document context, the highlighted snippet, and the full discussion thread.
- Pin key thoughts, delete outdated notes, and switch seamlessly between split and left-aligned layouts.

## Distillation

When your reflections around a passage mature into a concrete takeaway, framework, or actionable insight, open the **Distillation Window**. You can synthesize scattered notes into a polished draft and receive structured review feedback with live diff previews. See "[Distilled Notes and Review](/en/docs/sedimentation/)".

## Essential Shortcuts

| Shortcut | Action                                |
| -------- | ------------------------------------- |
| `C`      | Copy selected text                    |
| `A`      | Create a highlight from selected text |
| `Q`      | Ask AI about selected text            |

All shortcuts can be customized in **Settings > Shortcuts**.
