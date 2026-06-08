---
title: "Why Choose a Local-First Reading Tool: Your Reading Data Should Belong to You"
description: Reading notes, highlights, annotations — these are your most private thought processes. Why hand them over to the cloud? Yomitomo's local-first architecture guarantees data sovereignty, offline availability, and privacy protection.
---

By 2026, "cloud-first" has become the default in software development. Notes in the cloud, documents in the cloud, reading data in the cloud. This model brings the convenience of cross-device sync, but it also brings a widely accepted yet rarely discussed cost: **your reading data no longer belongs to you**.

Reading data is different from other data. It's not calendar events or task lists — those are records of your interactions with the world. Reading data is your **thinking process**: your marginal notes beside a passage, your doubts about a claim, the path your mind took from one concept to another. This data constitutes your cognitive trajectory. Handing it to the cloud means you've tacitly accepted that the service provider can analyze it, train models on it, or let it disappear when the service shuts down.

Yomitomo chose a different path: **local-first**.

## All Data Stored on Your Computer

All of Yomitomo's reading data — imported articles, EPUBs, PDFs, your highlights, annotations, discussions, distillations, reading statistics — is stored entirely in the desktop application data directory. No Yomitomo cloud server stores any of your reading content.

This means:

- You don't need to create an account. Download, install, and start using it.
- Your reading data is unaffected by service provider policy changes.
- You can use all features completely offline (except AI assistants, which require internet to call model APIs).
- No one can analyze your reading preferences and thinking patterns.

## API Keys Stored in the System Keyring

Yomitomo needs to connect to AI model providers (OpenAI, Anthropic, DeepSeek, etc.) for assistant features. But your API keys are not stored in Yomitomo's ordinary configuration files.

Yomitomo uses the operating system's keyring (macOS Keychain, Windows Credential Manager) to store API keys. The SQLite database only retains provider configuration and key references — never plaintext keys. This means even if someone gains access to your Yomitomo data files, they cannot read your API keys.

API calls are sent directly from your local application to the model provider's servers. Yomitomo does not proxy or forward any of these requests. Your API key is known only to you and the model provider.

## Fully Functional Offline

Yomitomo's core reading features — importing articles, reading EPUBs and PDFs, highlighting, annotating, discussing, distilling — all work completely offline. You don't need an internet connection to complete a full deep reading session.

AI assistant features require connectivity (since model inference runs in the cloud), but they are optional. You can disable all AI assistants and use Yomitomo as a purely offline reading and annotation tool.

This design stands in sharp contrast to "cloud-first" tools: cloud tools degrade or become unusable when the network drops, while a local-first tool **gains extra capabilities** when online rather than **losing core capabilities** when offline.

## Data Backup and Portability

Local-first doesn't mean data fragility. Yomitomo provides SQLite database backup and restore functionality. You can periodically export the database file and back it up to an external drive or a cloud storage service you trust.

The database format is standard SQLite. This means even if you someday stop using Yomitomo, your data is not locked in a proprietary format. You can open, query, and export your reading data with any SQLite tool.

WeRead synced data is also stored in the local SQLite database. Once your WeRead highlights and thoughts are synced locally, they are fully independent of the WeRead platform.

## The Privacy of Reading

Reading is fundamentally a private act. The passages you mark in a book, the questions you write down — these might be problems you're wrestling with, confusions you're facing, even internal dialogues you're having with yourself. This content doesn't belong on any cloud service's analytics dashboard.

Local-first guarantees that you can safely expose your ignorance and confusion during reading — and that's precisely the prerequisite for deep learning. If you knew every annotation could be analyzed, used for model training, or someday leaked, you'd subconsciously self-censor, writing "safe" notes that reveal no weakness. And those "safe notes" carry zero cognitive value.

## Who This Is For

Anyone sensitive about data privacy, frequently reading in offline environments, or simply believing that "my thinking should stay on my own hard drive." If the "everything to the cloud" trend makes you uneasy, local-first is your most fundamental solution.
