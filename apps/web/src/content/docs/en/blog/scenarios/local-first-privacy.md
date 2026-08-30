---
title: "Why Local-First Matters: Building Reading Assets That Truly Belong to You"
description: Highlights, marginal notes, and immediate reactions represent your most intimate intellectual labor. Why surrender them to the cloud? Yomitomo's local-first architecture guarantees data sovereignty, offline resilience, and absolute privacy.
---

In modern software development, "cloud-first" has become the unquestioned default: documents in the cloud, notes in the cloud, and reading habits hosted on remote servers. While this enables convenient cross-device synchronization, it comes at a steep, rarely examined price: **your cognitive exhaust is no longer your property**.

Reading data is fundamentally distinct from calendar events or task lists—which merely record administrative commitments. Your marginalia, intuitive skepticism, and spontaneous conceptual links constitute **your active thought process**. Surrendering them to centralized clouds means tacitly consenting to behavioral analytics, model-training scraping, and the ever-present risk of platform sunsetting.

Yomitomo charts a different course: **Local-First**.

## Sovereign Data Ownership: 100% on Your Machine

Every byte of reading data in Yomitomo—imported web essays, EPUBs, academic PDFs, highlights, thoughts, discussions, distillation drafts, and analytics—resides strictly inside your desktop's local application data directory. Yomitomo operates zero central servers collecting reading content.

- **Zero Account Gatekeeping**: Download, install, and begin reading immediately with no login barriers.
- **Immune to Platform Drift**: Unaffected by remote service shutdowns or changing terms of service.
- **Resilient Offline Utility**: Seamlessly read, annotate, and distill thoughts in airplane mode.
- **Zero Profiling**: No commercial algorithms analyzing your intellectual curiosity.

## System-Grade Credential Protection

Yomitomo connects to external LLM providers (OpenAI, Anthropic, DeepSeek, etc.) purely via client-side requests. Crucially, your secrets are never saved in plaintext config files.

API keys are delegated to your operating system's native hardware-backed keystores (macOS Keychain and Windows Credential Manager). The local SQLite database stores only provider metadata and key references. Even if database files are physically copied, plaintext keys cannot be extracted. Furthermore, API calls route straight from your machine to the provider endpoint without intermediary proxy servers.

## Offline-First: Network Extends Power, It Does Not Gate It

Cloud-first applications degrade or lock up entirely when disconnected. As a local-first application, Yomitomo keeps its entire core engine—content extraction, EPUB/PDF rendering, multi-type annotation, discussion threading, and knowledge distillation—100% functional without internet connectivity. Connectivity merely provides optional leverage when querying cloud models—**the network expands capability; it never holds core features hostage**.

## Transparent Open Standards: No Vendor Lock-In

Local-first does not mean fragile. Yomitomo includes native one-click backup and restore tools for its underlying SQLite database. Because data is stored in standard SQLite tables rather than proprietary black-box blobs, you retain permanent access. You can query, inspect, and export your entire intellectual history with any generic database tool.

Imported WeRead notes also land in your local SQLite store—liberating your reading history from proprietary platform silos.

## Intellectual Privacy: The Freedom to Think Fearlessly

Deep reading is an inherently private sanctuary. The rough thoughts, naive questions, and nascent hypotheses you formulate in the margins belong solely to you.

Absolute local privacy empowers you to expose cognitive vulnerabilities and grapple with difficult ideas without fear of surveillance—the fundamental prerequisite for genuine intellectual growth.
