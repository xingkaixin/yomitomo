---
title: Reading Stats and FAQ
description: Review reading metrics across local and WeRead sources, and troubleshoot import, AI, and local storage issues.
---

The Stats dashboard gives you a clear overview of your reading activity, annotation cadence, and assistant usage over time. It includes **Local Reading**, **Assistant usage**, and **WeRead** views.

## Key Metrics

The local reading stats view tracks:

- **Today & Total Activity**: Distillations, thoughts, highlights, and assistant contributions (local stats do not track reading duration)
- **Consistency & Milestones**: Total recorded days, active days per week, 7-day streak badge, and peak streaks
- **21-Day Activity Trend**: Daily curves for distillations, thoughts, and highlights
- **70-Day Reading Map**: An activity heatmap showing your ongoing reading rhythm

Switch to **Assistant usage** to review call counts, total tokens, estimated cost (based on the public `models.dev` pricing catalog), and per-assistant breakdowns.

## WeRead Stats Synchronization

After configuring your WeRead API Key in Settings, you can switch to the **WeRead** tab in Stats. Query your reading duration and book distributions across **Weekly**, **Monthly**, **Yearly**, and **All-Time** periods. Query results are cached locally so you can review previously loaded periods instantly without extra network roundtrips.

---

## Frequently Asked Questions & Troubleshooting

### Why is the AI assistant not responding?

Please verify the following checkpoints:

1. **Provider Setup**: Ensure at least one AI provider is added under **Settings > Models & routing**.
2. **API Key Validity**: Check that the API key was pasted without unintended whitespace.
3. **Connectivity Test**: Edit the provider configuration and click **Test** in the dialog footer to verify endpoint reachability and authentication.
4. **Default Model & Routing**: Confirm a **Default model** is selected under **Model usage** in **Settings > Models & routing** (and if you enabled per-task overrides, confirm the relevant task has a valid model).

### Why did a web article import fail?

Common causes include:

- The URL is invalid or does not start with `http://` or `https://`.
- The raw HTML payload exceeds the 5 MB threshold.
- The destination website enforces aggressive anti-scraping protections or strict login paywalls.
- Network connection timed out.

Yomitomo automatically attempts headless rendering for single-page dynamic apps, though heavily customized interfaces may still resist automated extraction.

### Why did an ebook import fail?

- Ensure the file is a standard `.epub`, `.azw3`, or `.mobi` file under 80 MB.
- DRM-encrypted ebooks and files with oversized decompressed payloads cannot be imported.

### Why did a PDF import fail?

- Ensure the file is a standard `.pdf` document under 120 MB.
- Password-protected or corrupted PDFs must be decrypted or repaired before importing.

### Where is my reading data stored?

All reading materials, highlights, discussion threads, and distilled notes are stored strictly within your **local desktop application directory**. Data is never uploaded to Yomitomo servers. Model API keys are secured via native OS keystores (macOS Keychain and Windows Credential Manager). Remote AI features send the reading content and conversation needed for the task to your configured model endpoint. A model running on your own computer performs inference locally.

### Does Yomitomo collect private user data?

By default, Yomitomo sends a lightweight anonymous heartbeat at most once per day (containing an anonymous installation UUID, app version, OS platform and version, architecture, local date, and timezone) solely for aggregated platform metrics. Reading Memory separately sends counts for opens, completed queries, source jumps, review decisions, and fallbacks, without the installation UUID. **It never collects reading texts, book titles, highlights, file paths, or AI conversation contents.** You can disable this anytime under **Settings > General > Privacy**; turning it off also clears unsent Reading Memory counts.

### Which operating systems are supported?

Yomitomo supports **macOS (Apple Silicon)** and **Windows (x64)**.
