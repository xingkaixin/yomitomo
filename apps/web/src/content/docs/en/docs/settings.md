---
title: Settings, Models, and Data
description: Configure AI model providers, task routing, shortcut preferences, local data backups, and privacy controls.
---

The Settings center manages all high-level application preferences: multi-language localization, external AI providers, themes, haptic sound effects, App Lock, shortcuts, local data backups, and updates.

## Model Provider Configuration

Yomitomo supports popular preset providers as well as any custom OpenAI-compatible endpoint. Configuration is straightforward: select the protocol provider, then provide the endpoint credentials and models.

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

After selecting a provider, enter a display name, API Base URL, and your API Key. Click **Fetch** to automatically retrieve available models from the remote endpoint; if network conditions prevent dynamic fetching, reliable preset fallbacks are readily available. You can add, edit, delete, or hide models as needed.

API keys are safely managed by your operating system's native secure enclave—Keychain on macOS and Credential Manager on Windows. Yomitomo never stores raw plaintext secrets on disk.

## WeRead Integration

WeRead reading note sync requires a dedicated WeRead Skill API Key (see "[Get a WeRead API Key](/en/docs/weread-api-key/)").

Once configured, choose your synchronization strategy:

- **Manual Sync**: Triggers updates only when you click "Sync WeRead" in the Library.
- **Automatic Sync**: Syncs once on application launch, then silently every 30 minutes in the background. Ongoing sync processes will not collide or duplicate.

## Intelligent Task Routing

Choose one default model for reading comprehension, in-depth review, and bilingual translation. Expand per-task settings when you need different models; each task can also keep using the default.

| Task Scenario           | Primary Responsibility                               |
| ----------------------- | ---------------------------------------------------- |
| Reading Comprehension   | Inline highlight thoughts, `@` replies, and Q&A      |
| In-Depth Review         | Evidence verification, logical audit, and copy polish|
| Bilingual Translation   | Paragraph-level streaming translation and refresh    |

## Language and Visual Customization

- **Language**: Toggle between Simplified Chinese, English, and Japanese in Settings > General. UI text and assistant personas adapt instantly.
- **Themes and Paper**: The sidebar theme picker groups themes into light and dark categories, including ShadLingo variants. Theme cards show library samples, while paper cards show reader samples with choices such as pure white and deep blue. Within a category, custom paper choices are kept and default paper follows the theme; switching categories restores the remembered theme and paper. PDFs retain their original page colors in dark mode.
- **Audio Feedback**: Adjust or mute tactile UI sound effects (e.g., successful imports, deletions, highlight creation, distillation publishing, unlock events, and typing effects).

## Security and Privacy Controls

- **Model requests**: Remote AI features send the source text, annotations, and conversation needed for the task to your configured model endpoint. A model running on your computer performs inference locally.
- **App Lock (PIN Code)**: When enabled, lock the app at any time with the lock button in the top bar or ⌘+L (Ctrl+L on Windows). Turn on **Lock on startup** to start locked after every launch or update restart. The app does not lock automatically when idle. Unlocking requires the PIN; passcode verification relies on native OS keystores.
- **Telemetry Controls**: On by default. Sends two kinds of data to `telemetry.yomitomo.app`: an anonymous heartbeat at most once per day (anonymous installation UUID, app version, OS platform and version, architecture, local date, and timezone), and Reading Memory counts for opens, completed queries, source jumps, review decisions, and fallbacks, without the installation UUID. **Neither transmits reading content, titles, highlights, local paths, or AI dialogues.** Can be disabled under **Settings > General > Privacy**; turning it off also clears unsent Reading Memory counts.
- **Model Pricing Catalog**: About 5 seconds after launch and every 24 hours after that, if the local price cache is older than 24 hours, Yomitomo fetches the public model pricing catalog from `https://models.dev/api.json` to estimate assistant usage costs. This plain GET request carries no reading content, API keys, or installation UUID; like any network request, it lets models.dev see your IP address and request time. The telemetry setting does not control this request, and it runs even when no model provider is configured.

## Data Management and Backup

Back up your data before upgrading. v0.16.3 migrates the database to reader level 4; v0.16.2 and earlier cannot open it afterward. To downgrade, restore a compatible backup made before upgrading.

Open local data folders, inspect logs, and choose a complete backup or a database-only backup.

- **Complete backup**: Creates a folder containing the database, original ebooks and PDFs, PDF thumbnails, and a file checksum manifest. Keep the entire folder when moving devices. Restore verifies the files and database, keeps a safety backup of current data, and rolls back if installing the backup fails.
- **Database only**: Saves a SQLite file containing stored annotations, discussions, distillations, and settings. Original ebooks, PDFs, and thumbnails are excluded; keep source files separately.

Complete backups exclude API keys and do not transfer App Lock. After restoring, configure model and WeRead keys again and enable App Lock if needed. Download local Reading Memory models again on the new device. Assistant conversation memory is not backed up and is cleared when a database is restored; annotations, discussions, and Reader Q&A in the backup are restored as usual.

## Reading Memory Data Scope

Reading Memory searches your saved highlights and thoughts, discussions you participated in, and published distillations. It excludes full document text and unpublished distillation drafts. Library questions can search reading records from all sources, a collection, or selected sources. Semantic indexing and retrieval run locally; AI judgments send the selected evidence and question to your configured model endpoint.

## Non-Intrusive Updates

Yomitomo checks for updates in the background on startup and every 24 hours. A badge in the top bar lets you view release notes and start downloading. Once the download finishes, you can restart to install.

Starting with 0.16.0, macOS uses Sparkle. The first upgrade from an older version still downloads a full ZIP. After installation and restart, subsequent releases can use delta updates, falling back to a full package when no suitable delta is available or delta verification fails. macOS packages continue to use Developer ID signing and notarization; Windows keeps its existing update mechanism.
