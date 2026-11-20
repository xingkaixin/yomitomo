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
- **Full-Text Search**: Press ⌘F (Ctrl+F on Windows) or use the toolbar button to search the current document and jump to matches.
- **Highlight Navigation**: Cruise forward and backward between highlights without manual scrolling.
- **Persistent Assistant Chat**: Ask questions about the entire document at any time with multi-turn context retention.
- **Bilingual Translation**: Translate web articles paragraph by paragraph with visual status indicators on modified blocks. PDFs can be translated page by page, with each paragraph overlaid on the original page. This first version targets single-column text PDFs; scanned pages without a text layer cannot be translated.
- **Export Markdown**: Export the current document's highlights, thoughts, discussions, and published distillations to an `.md` file or copy them to the clipboard, verbatim.

### Typography and Visual Styling

- **Web Articles and Ebooks**: Adjust **Font Size** and **Article Width** to match your reading preferences.
- **PDFs**: Choose **Fit width**, **Fit page**, or **100%**, or zoom with ⌘/Ctrl + / − / 0.
- **Theme and Reading Appearance**: Choose light, dark, or system appearance at the bottom of the sidebar. Adjust reading size and width in the reader toolbar. PDFs keep their original page colors in dark mode; turn on the **Dark eye-care filter** in the PDF toolbar when you need it.

## Create Highlights and Thoughts

1. Select any text in the reading area.
2. Drag the handles at both ends of the selection to fine-tune boundaries without re-selecting (supported across web articles, ebooks, and PDFs).
3. Press the default shortcut `A` or click the annotation button on the floating menu.
4. Record your immediate reaction, question, or analysis.

To mark a passage without writing a thought, click **Highlight** in the floating menu to save it directly.

Highlights use hand-drawn underlines in your chosen color. Footnote numbers match the margin cards, and each highlight remains anchored to its source. Give a single highlight its own color from the annotation card menu or the discussion window header. Highlight creation and text copying can provide tactile audio feedback (configurable in Settings > General).

## Highlight Discussion Threads

Every highlight has its own discussion thread. Open an annotation card to see thoughts on the left and discussion bubbles on the right:

- Add ongoing reflections or reply to earlier thoughts.
- Type `@assistant_name` to bring specialized AI companions into the conversation. Responses are generated using document context, the highlighted snippet, and the full discussion thread.
- Pin key thoughts, delete outdated notes, and switch seamlessly between split and left-aligned layouts.
- Edit your own thoughts and replies after saving. Assistant replies and highlighted excerpts cannot be changed.

Minimizing a discussion window turns it into a bookmark capsule in the reader; click it to restore the same window and any unsent reply. Drag the capsule group to any corner of the reader, or use the arrow keys when it has focus. Press Esc to cancel a drag.

## Distillation

When your reflections around a passage mature into a concrete takeaway, framework, or actionable insight, open the **Distillation Window**. You can synthesize scattered notes into a polished draft and receive structured review feedback with live diff previews. See "[Distilled Notes and Review](/en/docs/sedimentation/)".

## Essential Shortcuts

| Shortcut                   | Action                                 |
| -------------------------- | -------------------------------------- |
| `C`                        | Copy selected text                     |
| `A`                        | Create a highlight from selected text  |
| `Q`                        | Ask AI about selected text             |
| `⌘F` / `Ctrl+F`            | Search the current document            |
| `⌘/Ctrl` + `+` / `−` / `0` | Zoom a PDF in, out, or back to default |

`C`, `A`, and `Q` can be customized in **Settings > Shortcuts**.
