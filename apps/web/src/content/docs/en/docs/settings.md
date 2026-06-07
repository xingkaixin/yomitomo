---
title: Settings, Models, and Data
description: Configure providers, task routing, shortcuts, local data, and app updates.
---

Settings covers the product boundaries: external model providers, user input preferences, local data, and app updates.

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

## Theme and Reader Paper

The theme button in the sidebar switches between light, dark, and reader paper themes. Reader paper only affects web articles, EPUB books, and PDF reading surfaces. In dark mode, PDFs keep their original page colors to avoid reducing document readability.

## Shortcuts

Message sending can use either `Enter` or `Cmd/Ctrl+Enter`. Reader selection actions support custom copy and annotation shortcuts. Each shortcut must be a single letter and cannot conflict with another shortcut.

## Data Management

Data management provides entries for the data directory, logs, and database file. It also supports SQLite database backup and restore.

## App Updates

Yomitomo supports update flows on macOS and Windows. The app checks for new versions at startup, and you can also check manually in Settings > About.

## Assistant Diagnostics

If an assistant does not respond as expected, open Assistant Diagnostics in Settings to inspect the most recent call state. This page is mainly for diagnosing model configuration, network issues, or provider errors.
