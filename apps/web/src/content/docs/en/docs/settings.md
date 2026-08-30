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

- **App Lock (PIN Code)**: Protects your local reading library behind a secure PIN screen. Passcode verification relies on native OS keystores.
- **Intranet Scraping Safeguards**: Blocks web imports from resolving to `localhost`, private intranet IPs, or cloud metadata endpoints by default.
- **Telemetry Controls**: Sends an anonymous daily heartbeat (anonymous UUID, app version, OS architecture) strictly for platform stability metrics. **Never transmits reading content, titles, highlights, local paths, or AI dialogues.** Can be disabled entirely in settings.

## Data Management and Backup

Access local data folders, inspect operational logs, and execute full local SQLite backups or restores with a single click (backups exclude OS-secured API keys and raw external ebook source files).

## Non-Intrusive Updates

Yomitomo checks for new releases on startup and every 24 hours in the background. When an update is available, a subtle badge appears in the top navigation bar without interrupting your reading. You can inspect release notes, download in the background, and choose whether to restart immediately or upon your next regular exit. All macOS and Windows packages are digitally signed and notarized.
