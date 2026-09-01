---
title: "Improving Reading Habits with Local Analytics: Building a Data-Driven Cadence"
description: Cannot quantify how many days you truly read, when your peak focus occurs, or how much you distilled? Yomitomo translates reading behaviors into private local charts.
---

"How many books or deep articles did you genuinely master this year?"—most people can only offer vague guesses. Fewer still know how many days they maintained focused reading, which hours produced their highest-quality reflections, or what percentage of highlights converted into structured knowledge.

Sustainable reading habits should not rely on fleeting bursts of willpower. Yomitomo quantifies key cognitive behaviors locally, giving you **verifiable data** to optimize your reading cadence.

---

## Local Reading Analytics Metrics Model

| Dimension | Data Source | Calculation Logic | Visual Presentation | Habit Diagnostic Value |
|---|---|---|---|---|
| **Focused Time** | Local reader focus tracking | Excludes idle time; logs active engagement | Daily/Weekly charts and historical trends | Pinpoints true focus time without self-deception |
| **Cognitive Density** | Highlights (`A`), thoughts, discussions | Tracks frequency across 5 cognitive categories | Category breakdown donut chart & hourly distribution | Evaluates thinking depth (high Question/Assumption ratio = active critique) |
| **Distillation Ratio** | Published distillation cards (`T`) | Ratio of `Distillation Cards ÷ Total Highlights` | Conversion funnel & weekly distillation velocity | Warns against the "highlighting without synthesizing" trap |
| **Consistency Grid** | 70-day rolling activity | Daily cognitive score mapped to color density | GitHub-style 70-day activity matrix | Provides visual positive feedback to sustain momentum |

---

## The Local Analytics Dashboard

- **Daily Activity**: Active reading time, imported articles, highlight count, and distillation submissions;
- **Streaks & Consistency**: Total recorded days, active days per week, and peak cognitive time blocks;
- **Conversion Velocity**: Historical curve comparing raw highlights to finalized knowledge cards;
- **AI Collaboration Distribution**: Call frequency breakdown across various specialist personas.

These metrics expose hidden habit signals: if active days drop from 5 to 2, your routine is slipping; if late-night highlights are never referenced in distillation drafts, move deep reading to the morning.

---

## 70-Day Consistency Matrix

The 70-day heatmap uses varying green shades to visualize reading density over the past two months. This continuous positive feedback builds internal momentum far more effectively than abstract resolutions.

---

## WeRead Data Integration: Breadth Meets Depth

When configured with your WeRead API Key, the analytics center switches seamlessly to visualize your WeRead reading duration across weekly, monthly, and yearly horizons. WeRead represents **input breadth** (hours spent, pages turned), while Yomitomo metrics represent **processing depth** (questions raised, knowledge distilled).

---

## Target Audience & Usage Boundaries

### Who This Is For

- Readers seeking to build a sustainable analytical reading routine backed by quantitative data;
- Knowledge workers monitoring their highlight-to-distillation conversion efficiency;
- WeRead power users wishing to combine input volume with deep desktop synthesis.

### What This Is Not For

- **Social leaderboard competition**: Analytics are 100% private to your local device without public leaderboards or social sharing buttons;
- **Artificial time farming**: Focus tracking detects idle windows and pauses automatically when inactive.

---

## Frequently Asked Questions (FAQ)

### Q1: Is my reading analytics data uploaded to any server?
**Answer:** Never. All telemetry, timestamps, and heatmaps live exclusively inside your local SQLite database.

### Q2: Does the timer keep running if I step away from my desk?
**Answer:** No. Yomitomo includes intelligent idle detection. When the window loses focus or experiences no interaction, the timer pauses automatically.

### Q3: Will my 70-day heatmap transfer when switching computers?
**Answer:** Yes. Exporting your database backup under **Settings > General** and importing it on your new computer restores all historical analytics and heatmaps completely.

---

## Related Guides & Workflows

- [Knowledge Distillation Workflow: From Highlights to Structured Cards](/en/blog/scenarios/knowledge-distillation/)
- [WeRead Notes Migration Guide: Bring Highlights Local](/en/blog/scenarios/weread-migration/)
- [Escaping the Read-It-Later Black Hole](/en/blog/scenarios/web-article-collection/)
- [Reading Analytics & FAQ Documentation](/en/docs/stats-and-faq/)
