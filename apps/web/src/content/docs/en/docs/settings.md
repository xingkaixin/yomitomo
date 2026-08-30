---
title: Settings, Models, and Data
description: Configure providers, task routing, shortcuts, local data, and app updates.
---

Settings covers the product boundaries: UI language, external model providers, themes and sound effects, App Lock, user input preferences, local data, and app updates.

## Model Providers

Yomitomo supports preset providers and custom OpenAI-compatible providers. Configuring a provider takes two steps: first choose a protocol provider, then add the connection details and models.

Preset providers include:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- Alibaba Cloud Bailian
- Moonshot
- Zhipu
- Volcengine
- Xiaomi MiMo

After choosing a provider in the first step, the second step asks for its name, base URL, and API key, plus the models to use. Once an API key is entered, you can click "Fetch" to pull the available model list from the provider; if fetching fails, preset models are shown as fallback candidates. Preset models are tagged "Preset" and custom models "Custom". You can add, edit, and delete custom models, and hide preset models you do not need.

API keys are stored securely by the operating system—Keychain on macOS and Credential Manager on Windows. Yomitomo keeps only the provider settings and a reference to the key on your machine, never the key itself.

## WeRead

WeRead sync requires a separate WeRead API key. See "[Get a WeRead API Key](/en/docs/weread-api-key/)".

Once the API key is set, choose a sync mode:

- **Manual**: sync only when you click "Sync WeRead" in the library.
- **Automatic**: sync once after startup, then every 30 minutes in the background.

Automatic mode does not collide with manual sync: if a sync is still running, the scheduled tick is skipped.

## Task Routing

After configuring providers, assign models to different tasks:

| Task                  | Purpose                                                   |
| --------------------- | --------------------------------------------------------- |
| Reading assistants    | Reader annotations, `@` mention replies, and conversations |
| Review assistants     | Evidence, logic, and clarity review                        |
| Bilingual translation | Web-article paragraph translation and refresh              |

Assistant execution mode applies globally to reader annotations, follow-up questions, and co-reading tasks. Choose Fast response to prioritize a quick result, or Deep verification to have the assistant verify with tools before answering.

## Language

In Settings > General you can switch the UI language between Simplified Chinese, English, and Japanese. App UI, assistant persona copy, and many prompts follow the selected language.

## Theme and Reader Paper

The theme button in the sidebar switches between light, dark, dusk indigo, and reader paper themes, including a hand-drawn ink paper picker. Reader paper only affects web articles, EPUB books, and PDF reading surfaces. In dark mode, PDFs keep their original page colors to avoid reducing document readability.

## Sound Effects

Settings > General lets you toggle in-app sound effects and adjust volume—for example import success, library delete, highlight creation, distillation commit, App Lock unlock, and assistant writing in discussions.

## App Lock

Settings > General lets you enable App Lock and set a PIN. When enabled, Yomitomo shows a lock screen and requires the PIN before continuing into the local reading workspace. PIN verification material is stored securely by the operating system—Keychain on macOS and Credential Manager on Windows.

## Shortcuts

Message sending can use either `Enter` or `Cmd/Ctrl+Enter`. Reader selection actions support custom copy and annotation shortcuts. Each shortcut must be a single letter and cannot conflict with another shortcut.

## Data Management

Data management provides entries for the data directory, logs, and database file. It can configure log retention, clear logs, and back up or restore the SQLite database. Database backups do not include model API keys stored in Keychain or Credential Manager, or separately saved ebook source files.

## Web Import Safety

Settings > General can allow or block web-article import access to localhost, private network, and cloud metadata addresses. It is off by default; enable it only when you explicitly need to import intranet articles.

## App Updates

Yomitomo supports update flows on macOS and Windows. The app checks for new versions automatically after startup, then silently every 24 hours. When an update is available it does not open a dialog to interrupt reading; instead an "Update available" badge appears in the top navigation, and clicking it opens Settings > About to download and install. The download button shows transferred size, total size, and live speed. Closing the dialog leaves the download running in the background, and the header badge can reopen its progress at any time. When the download finishes, Yomitomo asks whether to restart now; choosing later lets you keep working and installs the update after a normal quit. You can also check manually with "Check for updates" in Settings > About. When an update is available, release notes for that version are shown (fetched from the website before update, bundled locally after update). Public macOS installers are signed and notarized.

## Privacy and Telemetry

The Privacy group in Settings > General provides a "Send anonymous usage metrics" toggle, on by default. When enabled, Yomitomo sends an anonymous heartbeat at most once per day containing an anonymous installation ID, app version, platform, OS version, architecture, local day, and optional timezone, used to understand active version and system distribution.

Reading memory sends separate requests with no identifiers, containing only counts of explicit feature openings, accepted local query completions, successful source jumps, the three review decisions, and keyword, partial-index, no-provider, or call-failure fallbacks. A later AI answer does not count as a second completion of the same query, and retrying a review does not count twice. These counts contain no dates, versions, questions, titles, excerpts, citations, judgments, or answers, and are never attached to the heartbeat containing the installation ID. Counts stay only in memory and each batch is attempted at most once; failures or exit can lose counts. They are not unique-user counts or exactly deduplicated measurements.

Neither kind of telemetry collects reading content, book titles, annotations, file paths, or AI conversations. You can turn the toggle off at any time to stop reporting and clear unsent reading-memory counts.

## Assistant Diagnostics

If an assistant does not respond as expected, open Assistant Diagnostics in Settings to inspect the most recent call state. This page is mainly for diagnosing model configuration, network issues, or provider errors.
