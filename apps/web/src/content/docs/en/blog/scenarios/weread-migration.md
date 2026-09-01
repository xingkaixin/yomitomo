---
title: "WeRead Notes Migration Guide: Bring Your Highlights and Thoughts Local"
description: Cannot export highlights and thoughts from WeRead? Sync your books, annotations, and reflections to local SQLite via official Skill APIs with Yomitomo, continuing structured distillation in freedom.
---

WeRead offers a polished reading catalog, making it the primary reading tool for many serious readers. But after finishing dozens of books and accumulating hundreds of highlights, an inevitable bottleneck emerges: **your intellectual traces are trapped inside a closed platform**.

WeRead does not provide automated, structured export mechanisms. Compiling research notes requires tedious copy-pasting; engaging in multi-turn dialectic debates on past thoughts is impossible in standard mobile comment fields. If network policies shift or catalog access changes, your notes risk becoming digital relics.

Yomitomo builds upon the official WeRead Skill open protocol to offer a **lossless local sync and deep reprocessing pipeline**: direct communication with official APIs brings your shelf, highlights, thoughts, and progress straight into a local SQLite database.

---

## WeRead Local Sync Workflow

| Stage | Input | System Processing | Output | Boundaries |
|---|---|---|---|---|
| **API Authorization** | Official WeRead Skill API Key | Stored securely in OS Keyring; establishes direct HTTPS connection | Encrypted local credentials for library sync | Does not collect WeChat passwords or personal account tokens |
| **Selective Sync** | Select books from shelf | Incremental fetching of chapters, highlights, and thoughts | Mirrored library entries in local SQLite database | Syncs user annotations and TOCs; does not download DRM-protected full texts |
| **Cognitive Tagging** | Synced highlights & thoughts | Map to 5 cognitive categories (`A`); mention AI companions in threads | Deep debate threads anchored to original highlights | Requires configured local or cloud LLM credentials |
| **Knowledge Distillation** | Cross-book highlight clusters | Aggregate into Distillation Studio (`T`); verify with review agents | High-density Markdown distillation cards for external export | Output stays local; does not write back to WeRead cloud |

---

## Action Guide: 3 Steps to Local Sync and Reprocessing

### Step 1: Obtain Official Skill API Key and Connect Directly

Yomitomo uses no intermediate proxy servers. All requests originate directly from your desktop app:

1. Open the <a href="https://weread.qq.com/r/weread-skills" target="_blank" rel="noopener noreferrer">WeRead Skill Management Portal</a> (or inside the mobile app: **Me > Settings > WeRead Skill**).
2. Click **Quick Configuration**, scan the QR code to authenticate, and generate your dedicated API Key.
3. In Yomitomo, navigate to **Settings > Data Sources > WeRead**, paste the key, and click **Save and Test Connection**.

> For illustrated setup and troubleshooting, see the [WeRead API Key Documentation](/en/docs/weread-api-key/).

### Step 2: Selective Sync and Cognitive Categorization

In Yomitomo's dedicated WeRead view, select specific titles to sync:

- **Preserve Native Thoughts**: Yomitomo pulls both text highlights and your spontaneous thoughts attached to them.
- **Assign Cognitive Roles**: Select a highlight and press `A` to categorize it into one of five cognitive dimensions (Key Point, Assumption, Concept, Question, Quote).
- **Multi-Turn AI Dialogue**: Mention `@ZhouYan` to audit causal logic or `@ShenQingyuan` to unpack theoretical origins.

### Step 3: Cross-Book Synthesis and Export

Break free from single-book silos. Press `T` to open the Distillation Studio and group highlights across different books sharing common themes (e.g., comparing organizational structures across three management classics). Call review agents like `@HeMingheng` (Logic Auditor) and `@TangJian` (Senior Editor) to polish your output into a standalone knowledge card.

---

## Target Audience & Usage Boundaries

### Who This Is For

- Dedicated WeRead users with extensive reading notes seeking a permanent, sovereign local archive;
- Researchers and writers synthesizing themes across multiple books;
- Readers wanting to engage in rigorous AI debates anchored to their actual book highlights on desktop.

### What This Is Not For

- **Downloading pirated full-text eBooks**: Yomitomo adheres strictly to official API protocols, syncing annotations, bookmarks, and metadata without bypassing DRM protection;
- **Two-way sync back to WeRead**: Local annotations and AI conversations remain strictly in your local database without polluting cloud records;
- **Multi-user real-time cloud collaboration**: All records reside in local SQLite for personal intellectual synthesis.

---

## Frequently Asked Questions (FAQ)

### Q1: Will using the WeRead API Key get my account flagged or banned?
**Answer:** No. Yomitomo uses Tencent's official "WeRead Skill" open developer protocol. It does not utilize web scraping, memory injection, or unofficial reverse-engineered APIs.

### Q2: Where is synced data stored, and how do I migrate to a new machine?
**Answer:** 100% of data is stored in your local SQLite database. You can export a database backup anytime under **Settings > General** and restore it on any new device.

### Q3: If a book is delisted from WeRead, will my synced notes disappear?
**Answer:** No. Once synced to local SQLite, all highlights, thoughts, AI dialogues, and distillation cards are permanent local assets, entirely independent of cloud library changes.

---

## Related Guides & Workflows

- [Knowledge Distillation Workflow: From Fragmented Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [Why Local-First Architecture Matters for Reading Privacy](/en/blog/scenarios/local-first-privacy/)
- [The Right Way to Use AI Reading Companions](/en/blog/scenarios/ai-reading-companion/)
- [WeRead API Key Configuration Guide](/en/docs/weread-api-key/)
