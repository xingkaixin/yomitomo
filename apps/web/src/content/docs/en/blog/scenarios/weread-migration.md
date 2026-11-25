---
title: "WeRead Notes Migration Guide: Bring Your Highlights and Thoughts Local"
description: Sync your WeRead books, highlights, thoughts, and reading duration locally via the official WeRead Skill API, browse them offline, open the web reader in-app, and export clean Markdown.
lastUpdated: 2026-10-03
---

If you do much of your book reading in WeRead, your highlights and thoughts accumulate inside a closed platform where bulk export and local archiving are awkward.

Yomitomo connects directly to the official **WeRead Skill API** to sync your WeRead books' highlights, thoughts, and reading duration into your local SQLite database. Once synced, you can browse your notes offline by chapter, organize books into collections, export Markdown, track reading duration in **Stats > WeRead**, and jump back to the book—including via Yomitomo's optional embedded WeRead web reader.

---

## How WeRead Works in Yomitomo

| Capability | How It Works | Boundaries |
|---|---|---|
| **API Connection** | Paste your official WeRead Skill API key in **Settings > Data sources > WeRead** | Stored in your OS keyring; requests go directly to WeRead (no Yomitomo proxy) |
| **Library Sync** | Click **Sync WeRead** (or rely on 30-minute auto sync); refresh one book via **Sync book** | Syncs all books with highlights/thoughts (no pre-sync book picker); syncs annotations and metadata, not DRM-protected full texts |
| **Read-Only Notes View** | Browse highlights and thoughts by chapter offline; group books into Collections | Read-only view inside Yomitomo: you cannot create local highlights (`A`), `@`-mention AI companions, distill, or index WeRead books in Reading Memory |
| **Jump Back & In-App Web Reader** | Open a book or highlight in the WeRead desktop app, browser, or **Open the web version in Yomitomo** | In **Settings > Data sources > WeRead**: compact window does not write back reading progress; expanded view lets WeRead record position and reading time; login session stays local and is excluded from complete backups |
| **Markdown Export & Re-Import** | Click **Export Markdown (.md)** or **Copy Markdown** in the WeRead book toolbar | Want AI discussion, distillation, or Reading Memory on WeRead notes? Export as Markdown and import the `.md` file as a local text document |

---

## Step-by-Step Setup and Workflow

### Step 1: Connect Your Official WeRead Skill API Key

All WeRead requests go directly from your desktop app to WeRead:

1. Open the <a href="https://weread.qq.com/r/weread-skills" target="_blank" rel="noopener noreferrer">WeRead Skill Management Portal</a> (or in the WeRead mobile app: **Me > Settings > WeRead Skill**).
2. Authenticate and generate your API key.
3. In Yomitomo, open **Settings > Data sources > WeRead**, paste the key, and save/test the connection.

> For illustrated setup steps and troubleshooting, see [Get a WeRead API Key](/en/docs/weread-api-key/).

### Step 2: Sync and Browse Your Notes Offline

Click **Sync WeRead** to pull all books that have highlights or thoughts into your local SQLite database (Yomitomo also runs automatic sync every 30 minutes). To update a single title later without waiting, click **Sync book** on that book's page.

Inside a synced WeRead book page, you can:

- Browse your highlights and thoughts organized by chapter, even offline.
- Group synced books into **Collections** alongside the rest of your library.
- View your WeRead reading duration stats under **Stats > WeRead**.
- Jump back to the book or highlight in the WeRead desktop app, your browser, or directly inside Yomitomo using **Open the web version in Yomitomo** (configured in **Settings > Data sources > WeRead**). Note that the compact embedded window does not write back reading progress to WeRead, while the expanded view lets WeRead record reading position and duration as normal.

### Step 3: Export Markdown (or Re-Import for AI Discussion)

From the WeRead book toolbar, use **Export Markdown (.md)** or **Copy Markdown** to save your chapter-organized highlights and thoughts into Obsidian, Notion, or any local folder.

Because synced WeRead books are a **read-only notes view** in Yomitomo, you cannot press `A` to add local highlights, `@`-mention AI companions, distill threads, or search WeRead books through **Reading Memory** directly. If you want to discuss or distill a book's WeRead notes with Yomitomo's AI companions and index them in **Reading Memory**, export the book as Markdown and import that `.md` file into Yomitomo as a local text document (drag and drop the `.md` file, or use **Text file → Paste text**).

---

## Who This Is For and Where It Stops

### Good Fit

- WeRead readers who want a local SQLite archive and clean Markdown exports of their highlights and thoughts.
- Readers who want to browse WeRead notes offline, organize them into collections, and view WeRead reading duration in **Stats > WeRead**.
- Users who want to jump from a synced note back to WeRead without leaving Yomitomo.

### Not Designed For

- **Downloading full DRM-protected WeRead books**: Yomitomo uses the official Skill API to sync highlights, thoughts, and metadata only.
- **Writing edits back to WeRead**: Synced notes in Yomitomo are read-only and never overwrite your WeRead cloud notes.
- **Direct AI discussion or Reading Memory on synced WeRead entries**: Export to Markdown and import as a local text document if you need AI discussion, distillation, or Reading Memory indexing.

---

## Frequently Asked Questions (FAQ)

### Q1: Is using the WeRead Skill API key safe for my account?
Yomitomo uses the official WeRead Skill API, but cannot guarantee account status, future WeRead policies, or API availability. Follow WeRead's current rules and handle authorization or rate-limit messages according to WeRead's official guidance.

### Q2: Where is synced WeRead data stored, and how do I move it to a new computer?
Synced highlights, thoughts, and metadata live in your local SQLite database. Create a backup under **Settings > Data management** (choose a complete backup if you also want your local PDFs and ebooks included) and restore it on the new computer. Your WeRead API key and embedded WeRead web reader login session are excluded from backups—sign in or re-enter your key after restoring.

### Q3: If a book is removed from WeRead later, will my synced notes disappear?
No. Once synced into your local SQLite database (and optionally exported as `.md` files), your highlights and thoughts remain stored locally regardless of catalog changes in WeRead.

---

## Related Guides & Workflows

- [Knowledge Distillation Workflow: From Fragmented Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [Why Local-First Architecture Matters: Building Lifelong Intellectual Assets](/en/blog/scenarios/local-first-privacy/)
- [Improving Reading Habits with Local Analytics: Building a Data-Driven Cadence](/en/blog/scenarios/reading-habits/)
- [Get a WeRead API Key](/en/docs/weread-api-key/)
