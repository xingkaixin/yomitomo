---
title: Settings, Models, and Data
description: Configure AI model providers, task routing, shortcut preferences, local database backups, and privacy controls.
---

The Settings center manages all high-level application preferences: multi-language localization, external AI providers, themes, haptic sound effects, App Lock, shortcuts, local database backups, and updates.

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

Assign the best-suited model to distinct cognitive tasks according to reasoning intensity:

| Task Scenario           | Primary Responsibility                               |
| ----------------------- | ---------------------------------------------------- |
| Reading Comprehension   | Inline highlight thoughts, `@` replies, and Q&A      |
| In-Depth Review         | Evidence verification, logical audit, and copy polish|
| Bilingual Translation   | Paragraph-level streaming translation and refresh    |

The **Assistant Execution Mode** applies globally: **Fast Response** prioritizes low latency, whereas **Deep Verification** empowers assistants to employ tools and multi-step reasoning before answering.

## Language and Visual Customization

- **Language**: Toggle between Simplified Chinese, English, and Japanese in Settings > General. UI text and assistant personas adapt instantly.
- **Themes and Paper**: Switch between Light, Dark, and Dusk Indigo palettes alongside textured reading paper. In Dark Mode, PDFs retain their original background color to protect the contrast of technical diagrams and formulas.
- **Audio Feedback**: Adjust or mute tactile UI sound effects (e.g., successful imports, deletions, highlight creation, distillation publishing, unlock events, and typing effects).

## Security and Privacy Controls

- **Model requests**: Remote AI features send the source text, annotations, and conversation needed for the task to your configured model endpoint. A model running on your computer performs inference locally.
- **App Lock (PIN Code)**: Protects your local reading library behind a secure PIN screen. Passcode verification relies on native OS keystores.
- **Intranet Scraping Safeguards**: Blocks web imports from resolving to `localhost`, private intranet IPs, or cloud metadata endpoints by default.
- **Telemetry Controls**: Sends an anonymous daily heartbeat (anonymous UUID, app version, OS architecture) strictly for platform stability metrics. **Never transmits reading content, titles, highlights, local paths, or AI dialogues.** Can be disabled entirely in settings.

## Data Management and Backup

Open local data folders, inspect logs, and back up or restore the SQLite database. Database backups include stored annotations, discussions, distillations, and settings. They exclude original PDF and ebook files and API keys in the OS keystore. Keep source files separately and configure keys again on a new device.

## Reading Memory Data Scope

Reading Memory searches your saved highlights and thoughts, discussions you participated in, and published distillations. It does not automatically search the full text of every imported document. Semantic indexing and retrieval run locally; AI judgments send the selected evidence and question to your configured model endpoint.

## Non-Intrusive Updates

Yomitomo checks for updates in the background on startup and every 24 hours. A badge in the top bar lets you view release notes and start downloading. Once the download finishes, you can restart to install.

Starting with 0.16.0, macOS uses Sparkle. The first upgrade from an older version still downloads a full ZIP. After installation and restart, subsequent releases can use delta updates, falling back to a full package when no suitable delta is available or delta verification fails. macOS packages continue to use Developer ID signing and notarization; Windows keeps its existing update mechanism.
