---
title: "Why Local-First Architecture Matters: Building Lifelong Intellectual Assets"
description: Understand the boundaries of local storage, remote AI requests, OS credentials, and data backups.
---

"Cloud-first" has become the default architecture for reading and note-taking apps: your documents are in the cloud, your highlights are in the cloud, and your reading analytics are in the cloud. While this delivers convenience, it incurs an under-discussed cost: **your intellectual labor no longer truly belongs to you**.

Reading data carries an intimate privacy profile. Unlike public status updates, it directly mirrors your internal cognitive process: raw skepticism toward authority, tentative hypotheses, and cross-disciplinary connections. Entrusting them to centralized cloud vendors exposes your mental models to third-party scraping, AI training pipelines, or total loss upon service shutdown.

Yomitomo takes a fundamentally different path: **Local-First Architecture**.

Remote AI requests send the reading content and conversation needed for the task to your configured model endpoint. A model running on your computer performs inference locally.

---

## Local-First Architecture & Data Flow

| Component | User Input & Operations | System Internal Processing | Storage & Output | Security & Data Boundaries |
|---|---|---|---|---|
| **Document Library** | Import EPUB, PDF, or capture web articles | Local parsing, cleaning, and persistence | Local SQLite and source document files | Zero proxy servers; no centralized telemetry collecting reading text |
| **Annotations & Threads** | Highlights (`A`), thoughts, discussion threads | Physical anchor binding; categorization; full-text indexing | Local structured graph and instant search index | Fully functional offline without internet access |
| **AI Model Credentials** | BYOK API Keys (OpenAI / Claude / DeepSeek / Ollama) | Encrypted storage via OS Keyring (macOS Keychain / Windows Credential Manager) | Local SQLite stores only provider metadata & key handles | Direct requests to configured model endpoints; remote AI receives task content |
| **Distillation & Backup** | Aggregate highlights into Markdown cards | Complete or database-only backup | Local backup folder or `.sqlite` file | Complete backups include original ebooks, PDFs, and PDF thumbnails, but exclude API keys |

---

## Four Core Pillars of Local-First Reading

### 1. Data Sovereignty: 100% Stored Locally on Your Machine

All your documents, highlights, thoughts, AI debate histories, distillation articles, and reading statistics live inside your local application directory:
- **No registration or login required**: Start reading immediately upon download without tying to any account system;
- **Zero forced obsolescence**: Immune to external terms-of-service changes, pricing hikes, or server shutdowns;
- **Zero surveillance**: No telemetry tracking your reading speed, habits, or intellectual leanings.

### 2. Hardware-Level Credential Protection: OS Keyring Integration

Yomitomo supports Bring Your Own Key (BYOK) for any OpenAI-compatible provider or local engine. Your keys are never stored in plaintext config files.
- macOS: Written directly into **Keychain**;
- Windows: Written directly into **Credential Manager**.

SQLite stores provider metadata and key references. Model requests go directly to your configured endpoint; remote providers receive the reading content and conversation needed for the task.

### 3. True Offline Autonomy: Network as an Enhancement, Not a Requirement

While cloud apps fail or show blank screens offline, Yomitomo's core engine—parsing, PDF/EPUB rendering, multi-tier annotations, discussion logs, and distillation drafting—works flawlessly with no network connection. When paired with local Ollama models, you can perform private AI-assisted deep reading during flights or in secure environments.

### 4. Open Standards: Zero Format Lock-In

Your annotations, discussions, and distillation bodies are stored in standard SQLite tables. You can read them with standard database tools. Original PDF and ebook files are stored separately from the database.

---

## Target Audience & Usage Boundaries

### Who This Is For

- Academics, legal professionals, analysts, engineers, and privacy-conscious thinkers handling sensitive or proprietary texts;
- Rational software users weary of SaaS lock-in, recurring subscriptions, and platform shutdowns;
- Readers who frequently study in offline environments (commutes, flights, offline research labs);
- Advanced users who maintain personal API keys or local Ollama / vLLM instances.

### What This Is Not For

- **Real-time multi-user collaborative editing**: Yomitomo is engineered for personal deep thinking, not multi-seat live co-editing;
- **Pre-packaged bundled cloud AI subscriptions**: Yomitomo does not resell compute credits; users configure their own API keys or local models.

---

## Frequently Asked Questions (FAQ)

### Q1: Does local-first mean I cannot sync between my laptop and desktop?
**Answer:** Create a complete backup in Settings > Data Management, copy the entire folder to the other computer, and restore it there. It includes the database, original ebooks and PDFs, and PDF thumbnails. API keys and App Lock do not transfer; configure keys again afterward. Database-only backups still require keeping source files separately. See the [backup guide](/en/docs/settings/#data-management-and-backup).

### Q2: Can Yomitomo developers access my OpenAI or DeepSeek API Keys?
**Answer:** Yomitomo does not relay LLM requests. API keys are stored in the OS keystore, and requests go directly to your configured model endpoint. Remote providers receive task content and the key used for authentication.

### Q3: What happens to my reading history if Yomitomo ceases development?
**Answer:** Your data remains completely accessible and functional forever. Because data resides in a standard local SQLite database, you can open and export it anytime using standard database tools.

---

## Related Guides & Workflows

- [Knowledge Distillation Workflow: From Fragmented Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [WeRead Notes Migration Guide: Bring Highlights Local](/en/blog/scenarios/weread-migration/)
- [Escaping the Read-It-Later Black Hole](/en/blog/scenarios/web-article-collection/)
- [Yomitomo Settings and Architecture Docs](/en/docs/settings/)
