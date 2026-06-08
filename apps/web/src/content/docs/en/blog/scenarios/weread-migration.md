---
title: "WeRead Notes Migration Guide: Bring Your Highlights and Thoughts Local"
description: Accumulated hundreds of highlights on WeRead with no way to export and organize them? Sync your WeRead data to your local machine with Yomitomo, then continue annotating, discussing, and distilling in a more flexible environment.
---

WeRead (微信读书) is one of the smoothest ebook reading experiences in the Chinese market. Many readers have gone through dozens of books on it, accumulating hundreds of highlights and thoughts. But sooner or later, you hit a wall: **your reading data is locked inside the platform**.

WeRead doesn't offer an official full-text export. If you want to compile your highlights into reading notes, you have to copy them out one by one by hand. If you want to add follow-up thoughts to an existing note, you can only append a comment inside the app — no linking across books, no free-form editing. Worse: if you ever stop using WeRead, those highlights and thoughts become inaccessible digital relics.

Yomitomo provides a **local migration path** through WeRead's open API: sync your highlights, thoughts, and reading progress to your own machine, then continue working with them locally.

## Step 1: Get Your API Key and Connect

Yomitomo doesn't run a WeRead proxy server. Sync happens through WeRead's official API. All you need is to grab an API key from the WeRead web client — similar to how many third-party reading stats tools work.

The exact steps are in Yomitomo's "Get a WeRead API Key" guide. The whole process takes about two minutes: log into the web reader, open developer tools, locate the key field in a request header, and paste it into Yomitomo's WeRead settings.

This is a one-time configuration. Once set up, your reading data is requested directly from WeRead's API by your local application — it doesn't pass through any third-party server.

## Step 2: Selective Sync

Yomitomo doesn't blindly pull your entire WeRead library. On the WeRead page, you choose which books to sync, pulling highlights, thoughts, and reading progress on demand.

Synced content enters Yomitomo's library alongside your locally imported EPUBs, PDFs, and web articles. This means you can:

- Continue annotating your WeRead highlights — Yomitomo's five annotation types (Key Point, Assumption, Concept, Question, Quote) apply to synced content just as they do to local imports
- Add follow-up comments and questions beneath your original WeRead thoughts
- Invite AI assistants into the discussion via `@AssistantName`, letting them engage with your WeRead highlights and notes
- Combine highlights from multiple WeRead books in the Distillation window for cross-book knowledge synthesis

## Step 3: Freedom After Localization

Once your data is local, you gain freedoms the platform can't offer:

- **Full-text search**: Search across all your synced books by title keyword in the library
- **Cross-book synthesis**: The Distillation window can reference highlights from multiple books for topic-based knowledge integration
- **Reading stats**: Yomitomo's Stats page incorporates WeRead data alongside local reading data, showing activity trends from both sources
- **Data backup**: Yomitomo supports SQLite database backup and restore — your WeRead notes are protected alongside your local notes

Syncing isn't a one-time "export and done." You can re-sync anytime to pull in the latest reading progress and newly added highlights.

## Who This Is For

Heavy WeRead users who have accumulated substantial highlights and thoughts and want to localize their reading data, work with it more deeply, and free it from platform lock-in.
