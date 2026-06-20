---
title: Settings, Models, and Data
description: Configure providers, task routing, shortcuts, local data, and app updates.
---

Settings covers the product boundaries: UI language, external model providers, themes and sound effects, App Lock, user input preferences, local data, and app updates.

## Model Providers

Yomitomo supports preset providers and custom OpenAI-compatible providers. When adding a provider, enter its name, base URL, API key, model, and reasoning effort.

Preset providers include:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- MiniMax
- Alibaba Cloud Bailian
- Moonshot
- Zhipu
- Volcengine
- Xiaomi MiMo

API keys are saved in the system keyring. SQLite only stores provider settings and key references.

## WeRead

WeRead sync requires a separate WeRead API key. See "[Get a WeRead API Key](/en/docs/weread-api-key/)".

## Task Routing

After configuring providers, assign models to different tasks:

| Task | Purpose |
| --- | --- |
| Reading assistants | Highlight thought generation and `@` mention replies |
| Review assistants | Evidence, logic, and clarity review |

## Language

In Settings > General you can switch the UI language (for example Simplified Chinese and English). App UI, assistant persona copy, and many prompts follow the selected language.

## Theme and Reader Paper

The theme button in the sidebar switches between light, dark, dusk indigo, and reader paper themes, including a hand-drawn ink paper picker. Reader paper only affects web articles, EPUB books, and PDF reading surfaces. In dark mode, PDFs keep their original page colors to avoid reducing document readability.

## Sound Effects

Settings > General lets you toggle in-app sound effects and adjust volume—for example import success, library delete, highlight creation, distillation commit, App Lock unlock, and assistant writing in discussions.

## App Lock

Settings > General lets you enable App Lock and set a PIN. When enabled, Yomitomo shows a lock screen and requires the PIN before continuing into the local reading workspace. PIN verification material is stored in the system keyring; SQLite only stores the needed lock state.

## Shortcuts

Message sending can use either `Enter` or `Cmd/Ctrl+Enter`. Reader selection actions support custom copy and annotation shortcuts. Each shortcut must be a single letter and cannot conflict with another shortcut.

## Data Management

Data management provides entries for the data directory, logs, and database file. It can configure log retention, clear logs, and back up or restore the SQLite database. Database backups do not include model API keys stored in the system keyring or separately saved ebook source files.

## Web Import Safety

Settings > General can allow or block web-article import access to localhost, private network, and cloud metadata addresses. It is off by default; enable it only when you explicitly need to import intranet articles.

## App Updates

Yomitomo supports update flows on macOS and Windows. The app checks for new versions at startup, and you can also check manually in Settings > About. When an update is available, release notes for that version are shown (fetched from the website before update, bundled locally after update). Public macOS installers are signed and notarized.

## Assistant Diagnostics

If an assistant does not respond as expected, open Assistant Diagnostics in Settings to inspect the most recent call state. This page is mainly for diagnosing model configuration, network issues, or provider errors.
