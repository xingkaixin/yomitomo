---
title: Settings, Models, and Data
description: Configure AI model providers, task routing, shortcut preferences, local data backups, and privacy controls.
---

The Settings center manages all high-level application preferences: multi-language localization, external AI providers, translation options, sound effects, App Lock, shortcuts, local data backups, and updates (light/dark appearance is switched in the sidebar footer).

## Model Provider Configuration

Yomitomo supports popular preset providers as well as any custom OpenAI-compatible endpoint. Configuration is straightforward: choose a preset provider (for Ollama, LM Studio, or any custom OpenAI-compatible server, pick an `OpenAI compatible` preset such as OpenAI and edit its Base URL and custom model name), then enter your credentials and models.

Built-in preset providers include:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- Alibaba Cloud DashScope
- Moonshot AI (Kimi)
- Zhipu GLM
- ByteDance Volcengine (Doubao)
- Xiaomi MiMo
- OpenRouter
- Vercel AI Gateway

After selecting a provider, enter a display name, API Base URL, and your API Key. Click **Fetch** to automatically retrieve available models from the remote endpoint; if network conditions prevent dynamic fetching, reliable preset fallbacks are readily available. You can add, edit, delete, or hide models as needed. Click **Duplicate config** to create a copy of an existing provider; its API key is copied into a separate keychain entry.

API keys are safely managed by your operating system's native secure enclave—Keychain on macOS and Credential Manager on Windows. Yomitomo never stores raw plaintext secrets on disk.

## WeRead Integration

WeRead reading note sync requires a dedicated WeRead Skill API Key (see "[Get a WeRead API Key](/en/docs/weread-api-key/)").

Once configured, choose your synchronization strategy:

- **Manual Sync**: Triggers updates only when you click "Sync WeRead" in the Library.
- **Automatic Sync**: Syncs once on application launch, then silently every 30 minutes in the background. Ongoing sync processes will not collide or duplicate.

### Open WeRead inside Yomitomo

In **Settings > Data sources > WeRead**, choose **Open the web version in Yomitomo** as the default opening method. Open a book or highlight to locate passages, turn pages, or jump between chapters in a compact view, or expand it to read. Compact navigation does not update your account's reading position; expanded reading lets WeRead record the current position and reading time.

The web sign-in stays in a separate local session and is excluded from complete backups. Clear it from WeRead settings when needed. Locking the app closes the embedded reader.

## Intelligent Task Routing

Choose one default model for reading comprehension, in-depth review, and bilingual translation. Expand per-task settings when you need different models. Tasks without their own model show "Inherit default model" and follow the default when it changes.

| Task Scenario         | Primary Responsibility                                                          |
| --------------------- | ------------------------------------------------------------------------------- |
| Reading Comprehension | Highlight assistant thoughts, `@` replies, and Reader Q&A                       |
| In-Depth Review       | Evidence verification, logical audit, and copy polish                           |
| Bilingual Translation | Paragraph-level translation for web articles, EPUB chapters, and text PDFs      |

## Language, Translation, and Appearance

- **Language**: Toggle between Simplified Chinese, English, and Japanese in **Settings > General**. UI text and assistant personas adapt instantly.
- **Translation**: Under **Settings > General**, choose target language, pick from 5 translation display styles, and optionally turn on **AI context-aware translation** (sends the document title, summary, and up to two neighboring paragraphs before and after each segment to improve contextual accuracy).
- **Theme and Reading Appearance**: The sidebar footer offers light, dark, and system appearance. Use the reader toolbar to adjust font size, width, paper color, and default underline colors. PDFs keep their original page colors in dark mode by default, with an optional **Dark eye-care filter** in the PDF toolbar.
- **Audio Feedback**: Adjust or mute UI sound effects (e.g., successful imports, deletions, highlight creation, distillation publishing, unlock events, and typing effects).

## Security and Privacy Controls

- **Model and translation requests**: Remote AI features send the source text, annotations, and conversation needed for the task to your configured model endpoint. Translation requests send the paragraphs being translated, title, target language, and existing summary—plus up to two adjacent paragraphs on each side when **AI context-aware translation** is enabled. A model running on your computer performs inference locally.
- **App Lock (PIN Code)**: When enabled, lock the app at any time with the lock button in the sidebar or ⌘+L (Ctrl+L on Windows). Turn on **Lock on startup** to start locked after every launch or update restart. The app does not lock automatically when idle. Unlocking requires the PIN; passcode verification relies on native OS keystores.
- **Telemetry Controls**: On by default. Sends two kinds of data to `telemetry.yomitomo.app`: an anonymous heartbeat at most once per day (anonymous installation UUID, app version, OS platform and version, architecture, local date, and timezone), and Reading Memory counts for opens, completed queries, source jumps, review decisions, and fallbacks, without the installation UUID. **Neither transmits reading content, titles, highlights, local paths, or AI dialogues.** Can be disabled under **Settings > General > Privacy**; turning it off also clears unsent Reading Memory counts.
- **Model Pricing Catalog**: About 5 seconds after launch and every 24 hours after that, if the local price cache is older than 24 hours, Yomitomo fetches the public model pricing catalog from `https://models.dev/api.json` to estimate assistant usage costs. This plain GET request carries no reading content, API keys, or installation UUID; like any network request, it lets models.dev see your IP address and request time. The telemetry setting does not control this request, and it runs even when no model provider is configured.

## Data Management and Backup

Back up your data before upgrading. v0.16.3 migrates the database to reader level 4; v0.16.2 and earlier cannot open it afterward. To downgrade, restore a compatible backup made before upgrading.

Open local data folders, inspect logs, and choose a complete backup or a database-only backup.

- **Complete backup**: Creates a folder containing the database, original ebooks and PDFs, PDF thumbnails, and a file checksum manifest. Keep the entire folder when moving devices. Restore verifies the files and database, keeps a safety backup of current data, and rolls back if installing the backup fails.
- **Database only**: Saves a SQLite file containing stored annotations, discussions, distillations, and settings. Original ebooks, PDFs, and thumbnails are excluded; keep source files separately.

Complete backups exclude API keys and do not transfer App Lock. After restoring, configure model and WeRead keys again and enable App Lock if needed. Download local Reading Memory models again on the new device. Assistant conversation memory is not backed up and is cleared when a database is restored; annotations, discussions, and Reader Q&A in the backup are restored as usual.

## Reading Memory Data Scope and Local Model

Reading Memory covers **Distillations**, **Ask library**, **Revisit**, and in-reader **Find related**. It searches saved highlights and thoughts, discussions you participated in, and published distillations from your local reading materials—excluding full document text, unpublished distillation drafts, and synced WeRead books. **Ask library** can search reading records from all local sources, a collection, or selected sources. **Revisit** prompts you to write your current judgment before revealing your past thought and optionally comparing new evidence, without overwriting the original record.

Semantic indexing and retrieval run locally. Under **Settings > Models & routing**, you can explicitly download the fixed-version local embedding model (from ModelScope by default, or switch to Hugging Face; downloads only model files and sends no reading content) and pause, resume, rebuild, or delete the index. If the local model is not ready, search falls back to keyword matching. When AI evaluates relations or answers questions, only the question and candidate evidence within the input budget are sent to your configured model endpoint.

When the local model or a model provider is not ready, Reading Memory panels link to **Download local model** or provider setup and show model download and indexing progress. Library questions keep up to 20 entries of session history, and answers can be copied as Markdown with their citations.

## Non-Intrusive Updates

Yomitomo checks for updates in the background on startup and every 24 hours. An update card in the sidebar lets you view release notes and start downloading. Once the download finishes, you can restart to install.

Starting with 0.16.0, macOS uses Sparkle. The first upgrade from an older version still downloads a full ZIP. After installation and restart, subsequent releases can use delta updates, falling back to a full package when no suitable delta is available or delta verification fails. macOS packages continue to use Developer ID signing and notarization; Windows keeps its existing update mechanism.
