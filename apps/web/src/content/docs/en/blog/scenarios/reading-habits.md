---
title: "Improving Reading Habits with Local Analytics: Building a Data-Driven Cadence"
description: Track concrete reading output—highlights, thoughts, assistant contributions, and distillations—alongside assistant usage costs and WeRead reading duration in Yomitomo's local Stats view.
---

It is easy to feel busy reading without knowing whether you are actually turning reading into durable notes. Counting open tabs or page flips tells you very little about whether you paused to write down thoughts or finish distillations.

Yomitomo's **Stats** view focuses on observable reading output stored in your local SQLite database—plus AI usage tracking and optional synced WeRead duration—so you can review your cadence without guesswork.

---

## What Yomitomo Stats Tracks

| View | What It Measures | Visuals & Breakdown | Scope & Boundaries |
|---|---|---|---|
| **Local Reading Stats** | Daily and total counts of **Distillations**, **Thoughts**, **Highlights**, and **Assistant contributions** | **21-day activity trend chart**, **7-day streak badge**, and **70-day reading map** | Tracks concrete annotation and distillation output—does **not** track local reading duration, focus timers, or idle pauses |
| **Assistant Usage** | Total tokens, call counts, per-assistant breakdown, and estimated cost | Usage summary and per-assistant table inside **Stats** | Estimated cost uses the public pricing catalog fetched from `models.dev` |
| **WeRead** | Reading duration synced from your WeRead account | WeRead reading duration trends inside **Stats > WeRead** | The **only** tab in Stats that shows reading duration; requires configuring your official WeRead Skill API key |

---

## Reading Output Over Vanity Timers

Local reading stats in Yomitomo deliberately track what you produced while reading rather than how long a window stayed open:

- **Highlights & Thoughts**: Show whether you are actively responding to what you read rather than skimming passively.
- **Assistant contributions**: Show how often you engaged Reading Companions or Review Assistants in your discussions and drafts.
- **Distillations**: Show how many discussions you actually turned into published notes.
- **21-day activity trend, 7-day streak badge, and 70-day reading map**: Give you a quick visual read on consistency over the past three weeks and past ten weeks.

If your highlights keep rising while thoughts and distillations stay flat, that is a clear signal to slow down and spend a few minutes writing in your own words.

---

## Monitoring AI Costs in Assistant Usage

Because Yomitomo uses your own model providers (BYOK or local models), **Stats > Assistant usage** lets you see how your reading workflow translates into real API usage:

- **Total tokens and calls** across your configured models.
- **Per-assistant breakdown** showing which Reading Companions or Review Assistants you invoke most often.
- **Estimated cost**, computed locally using public model pricing fetched from `models.dev`.

---

## Pairing Local Depth with WeRead Duration

If you connect your official WeRead Skill API key under **Settings > Data sources > WeRead**, the **Stats > WeRead** tab displays your synced WeRead reading duration alongside your local desktop notes. WeRead captures time spent reading on mobile or in WeRead, while local stats capture the thoughts, discussions, and distillations you produce in Yomitomo.

---

## Who This Is For and Where It Stops

### Good Fit

- Readers who want a private, local view of their annotation and distillation consistency.
- BYOK users who want visibility into token counts, call volume, and estimated AI spend per assistant.
- WeRead users who want their WeRead reading duration visible in the same desktop app.

### Not Designed For

- **Local screen-time or focus tracking**: Yomitomo does not run a local reading timer, track active reading minutes on local documents, or log hourly focus blocks.
- **Public leaderboards or social streaks**: Your reading stats stay local to your machine with no social feed.

---

## Frequently Asked Questions (FAQ)

### Q1: Does Yomitomo upload my reading stats to a server?
Your detailed reading stats—daily counts, 21-day trends, 7-day streaks, 70-day reading map, and assistant usage logs—stay inside your local SQLite database. Separately, Yomitomo makes two lightweight background requests: anonymous usage metrics to `telemetry.yomitomo.app` (on by default, opt out in **Settings > General > Privacy**; sends a daily anonymous heartbeat and Reading Memory action counts without an install ID and with no reading content), and a GET request to `models.dev` on startup and every 24 hours to fetch the public model pricing catalog for **Assistant usage** cost estimates (not controlled by the telemetry toggle; sends no reading content, API key, or install ID).

### Q2: Does local stats track reading time or pause when I step away?
No. Local reading stats measures concrete actions (**Highlights**, **Thoughts**, **Assistant contributions**, and **Distillations**) rather than elapsed screen time. Reading duration is shown only under **Stats > WeRead** from synced WeRead records.

### Q3: Will my 70-day reading map transfer when I switch computers?
Yes. Create a backup in **Settings > Data management** (use a complete backup if you also want your original PDFs and ebooks transferred) and restore it on your new computer to bring over your historical stats and 70-day map.

---

## Related Guides & Workflows

- [Knowledge Distillation Workflow: From Fragmented Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [WeRead Notes Migration Guide: Bring Your Highlights and Thoughts Local](/en/blog/scenarios/weread-migration/)
- [Why Local-First Architecture Matters: Building Lifelong Intellectual Assets](/en/blog/scenarios/local-first-privacy/)
- [Reading Stats and FAQ](/en/docs/stats-and-faq/)
