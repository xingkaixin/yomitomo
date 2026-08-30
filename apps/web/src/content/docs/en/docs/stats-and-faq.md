---
title: Reading Stats and FAQ
description: Review reading metrics across local and WeRead sources, and troubleshoot import, AI, and local storage issues.
---

The Stats dashboard gives you an inspiring, quantitative overview of your reading habits and cognitive momentum over time. It aggregates data from two primary dimensions: **Local Reading** and **WeRead**.

## Key Metrics

The Stats dashboard visualizes several core dimensions:

- **Daily Activity**: Today's reading interactions and engagement frequency
- **Consistency & Milestones**: Total recorded days, active days per week, and all-time peak streaks
- **Cognitive Output**: Total imported articles, annotations, and distilled notes
- **Dialogue & Reflection**: Total discussion comments and AI companion co-reading contributions

Trend charts illustrate your historical trajectory across imports, highlights, distillations, and discussion threads, while the 70-day activity heatmap reflects your sustained reading cadence.

## WeRead Stats Synchronization

After configuring your WeRead API Key in Settings, you can switch to the **WeRead** tab in Stats. Query your reading duration and book distributions across **Weekly**, **Monthly**, **Yearly**, and **All-Time** periods. Query results are cached locally so you can review previously loaded periods instantly without extra network roundtrips.

---

## Frequently Asked Questions & Troubleshooting

### Why is the AI assistant not responding?

Please verify the following checkpoints:

1. **Provider Setup**: Ensure at least one AI provider is added under **Settings > Models and Routing**.
2. **API Key Validity**: Check that the API key was pasted without unintended whitespace.
3. **Connectivity Test**: Click **Test Connection** on the provider card to verify endpoint reachability.
4. **Task Routing**: Confirm that models are actively assigned to specific tasks (e.g., Reading Comprehension and In-Depth Review).

### Why did a web article import fail?

Common causes include:

- The URL is invalid or does not start with `http://` or `https://`.
- The target address points to loopback (`localhost`), private intranets, or cloud metadata endpoints (blocked by local security policy).
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

All reading materials, highlights, discussion threads, and distilled notes are stored strictly within your **local desktop application directory**. Data is never uploaded to Yomitomo servers. Model API keys are secured via native OS keystores (macOS Keychain and Windows Credential Manager).

### Does Yomitomo collect private user data?

By default, Yomitomo sends a lightweight anonymous heartbeat at most once per day (containing an anonymous installation UUID, app version, OS platform, architecture, and local timezone) solely for aggregated platform metrics. **It never collects reading texts, book titles, highlights, file paths, or AI conversation contents.** You can disable this anytime under **Settings > General > Privacy**.

### Which operating systems are supported?

Yomitomo natively supports **macOS (Apple Silicon & Intel)** and **Windows (x64 & ARM64)**.
