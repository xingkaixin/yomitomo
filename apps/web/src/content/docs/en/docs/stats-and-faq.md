---
title: Reading Stats and FAQ
description: Review local reading and WeRead stats, and troubleshoot import, AI, and local data issues.
---

The Stats page helps you review reading activity instead of only seeing a list of materials. It includes Local Reading and WeRead sources.

## Metrics

Stats shows:

- Today's activity
- Recorded days
- Weekly active days
- Peak activity
- Imported articles
- Annotation count
- Distilled note count
- Discussion count
- Assistant participation count (including assistant contributions in summary metrics)

Charts show trends for article imports, highlights, distilled notes, and discussion comments. After the Settings IA refresh, assistant usage is also easier to review from stats-related views. The activity calendar shows reading activity over the last 70 days.

## WeRead Stats

After configuring a WeRead API key, switch the Stats page to WeRead. WeRead stats can be queried by week, month, year, or all time. Switching the period only reads saved data. Click Query or Re-query when you need to update a period.

WeRead query results are cached, so previously fetched periods remain available without another API request.

## AI Features Do Not Respond

Check:

1. Whether at least one model provider has been added.
2. Whether the API key is correct.
3. Whether "Test connection" succeeds.
4. Whether task routing has been configured for the relevant task.

## Web Article Import Fails

Common causes include:

- The URL is not a valid `http://` or `https://` address.
- The URL points to localhost, a private network, or a cloud metadata address, which is blocked by default.
- The HTML response is larger than 5 MB.
- The source site has anti-scraping protection.
- The network connection timed out.

Yomitomo tries to render pages with the built-in browser, but some sites may still fail to parse.

## Ebook Import Fails

Make sure the file is a `.epub`, `.azw3`, or `.mobi` file and is no larger than 80 MB. DRM-protected files or files with oversized decompressed content cannot be imported.

## PDF Import Fails

Make sure the file is a standard `.pdf` file and is no larger than 120 MB.

## Where Is Data Stored?

All data is stored in the local app data directory and is not uploaded to Yomitomo servers. API keys are saved in the system keyring.

## Does Yomitomo Send Anonymous Data?

By default, Yomitomo sends an anonymous heartbeat at most once per day containing only the app version, OS version, and architecture, used to understand active version distribution. It does not collect reading content, book titles, annotations, file paths, or AI conversations. You can turn it off with the "Send anonymous version and system metrics" toggle in the Privacy group under Settings > General.

## Supported Systems

Yomitomo currently supports macOS and Windows.
