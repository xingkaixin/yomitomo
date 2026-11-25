---
title: "Why Local-First Architecture Matters: Building Lifelong Intellectual Assets"
description: Understand what stays on your computer, what network requests Yomitomo makes, how API keys are stored, and how local backups work.
---

Most reading apps store your documents, highlights, and notes on vendor servers. That makes multi-device sync convenient, but it ties years of personal notes to someone else's pricing, terms of service, and uptime.

Yomitomo takes a **local-first** approach: your library, highlights, thoughts, discussions, and published distillations live on your own computer in open formats, with no Yomitomo account required. At the same time, "local-first" does not mean "zero network traffic." Knowing the exact privacy boundary lets you decide what to enable, what to disable, and which model to use for sensitive files.

---

## Local Storage vs. Outbound Network Requests

| Component | Stored Locally | Outbound Network Activity |
|---|---|---|
| **Documents & Notes** | SQLite database + separate local PDFs, ebooks (EPUB/AZW3/MOBI), web captures, and text files | None for reading, manual annotation, or keyword search |
| **API Keys** | OS keyring (**macOS Keychain** / **Windows Credential Manager**); SQLite stores provider metadata only | Sent directly to your configured provider endpoint when authenticating an AI or WeRead request |
| **AI & Translation** | Discussions, distillations, and usage records stay in local SQLite | Configured remote LLM/translation providers receive the passage, context, and prompt when you invoke them; a local model (e.g., Ollama) runs on your machine |
| **Reading Memory** | Local SQLite + optional local embedding model (`embeddinggemma-300m-ONNX`) | Downloads the embedding model from **ModelScope** or **Hugging Face** only when you explicitly request it |
| **Web Import & WeRead** | Captured articles and synced WeRead notes stay in local SQLite | Web import fetches the target URL; WeRead sync and optional in-app web reader talk directly to WeRead |
| **Updates, Telemetry & Pricing** | Local settings and cached pricing catalog | Update checks (`download.yomitomo.app` / `yomitomo.app`), opt-out anonymous telemetry (`telemetry.yomitomo.app`), and public pricing catalog (`models.dev`) |

---

## Complete Outbound Request Boundary

To keep privacy claims concrete and verifiable, here is every outbound network request Yomitomo can make:

1. **Configured LLM or translation provider**: Triggered only when you explicitly invoke an AI companion, review assistant, Reader Q&A, Ask library, or translation. Requests go directly from your machine to the endpoint you configured (no Yomitomo relay server).
2. **Target URL on web import**: Fetches the URL you paste into **Add web article** (direct fetch, with an unauthenticated headless browser fallback for dynamic/SPA pages).
3. **WeRead API and optional in-app WeRead web reader**: Communicates directly with WeRead when you sync notes via the official Skill API or open a book in Yomitomo's embedded WeRead web reader. The embedded web reader's login session stays local and is excluded from complete backups.
4. **ModelScope / Hugging Face**: Contacted only if you explicitly choose to download the optional local Reading Memory embedding model (`embeddinggemma-300m-ONNX`).
5. **`download.yomitomo.app` / `yomitomo.app`**: Checked for application updates.
6. **`telemetry.yomitomo.app`**: Enabled by default and opt-out in **Settings > General > Privacy**. Sends a daily anonymous heartbeat and Reading Memory action counts without an install ID. It never sends reading content, document titles, highlights, thoughts, or discussions.
7. **`models.dev`**: Performs a GET request on startup and every 24 hours to fetch the public model pricing catalog used to estimate costs in **Stats > Assistant usage**. This request is not controlled by the telemetry toggle and sends no reading content, API key, or install ID.

---

## Four Practical Properties of Local-First Reading

### 1. Your Reading Core Works Without AI or Internet
Without an AI provider, API key, or local embedding model configured, reading, highlighting, writing thoughts, and keyword search work normally. Saving a highlight or thought never waits for AI, embeddings, or remote calls.

### 2. Credentials Live in the OS Keyring
API keys for model providers and WeRead are stored in **macOS Keychain** or **Windows Credential Manager**, never in plaintext config files. SQLite holds only provider settings and references.

### 3. Standard SQLite and Built-In Markdown Export
Your annotations, discussions, and distillations are stored in a standard local SQLite database, while original PDFs and ebooks are stored separately on disk. You can also export notes anytime via built-in **Export Markdown (.md)** and **Copy Markdown** without vendor lock-in.

### 4. Full Local Backups
In **Settings > Data management**, you can create either a **database-only backup** or a **complete backup**:
- A **complete backup** includes the SQLite database, original ebooks and PDFs, and PDF thumbnails.
- **Excluded from complete backups**: API keys, App Lock settings, and the WeRead web reader login session.

---

## Who This Is For and Where It Stops

### Good Fit

- Researchers, engineers, lawyers, analysts, and readers working with proprietary or sensitive documents.
- Users who want local SQLite storage, Markdown export, and BYOK or local Ollama inference without a recurring subscription.
- People who read offline on flights or commutes and want a dependable desktop app.

### Not Designed For

- **Real-time multi-user collaboration**: Yomitomo is built for individual reading and note-taking.
- **Built-in cloud sync across mobile devices**: Syncing across machines uses manual backups rather than a hosted account.

---

## Frequently Asked Questions (FAQ)

### Q1: How do I move my library between two computers?
Create a complete backup in **Settings > Data management**, copy the backup folder to the other computer, and restore it there. It includes the database, original ebooks and PDFs, and PDF thumbnails. Re-enter your API keys (and WeRead web reader login if used) afterward. A database-only backup does not include source PDFs or ebooks. See [Settings, Models, and Data](/en/docs/settings/#data-management-and-backup).

### Q2: Can Yomitomo developers see my API keys or reading content?
No. Yomitomo does not relay LLM requests through a proxy server. API keys stay in your OS keyring, and AI requests go directly to the model endpoint you configured. Anonymous telemetry (which you can disable in **Settings > General > Privacy**) never includes reading content.

### Q3: What happens to my notes if Yomitomo stops being developed?
Your local app keeps working offline, your original PDFs and ebooks remain separate files on disk, your notes remain readable in standard SQLite tables, and you can export them as Markdown files at any time.

---

## Related Guides & Workflows

- [Read PDFs and EPUBs with local AI: Yomitomo + Ollama setup](/en/blog/scenarios/local-ai-reading-with-ollama/)
- [Knowledge Distillation Workflow: From Fragmented Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [WeRead Notes Migration Guide: Bring Your Highlights and Thoughts Local](/en/blog/scenarios/weread-migration/)
- [Settings, Models, and Data](/en/docs/settings/)
