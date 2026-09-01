---
title: "Air-Gapped & Private AI Reading: Yomitomo + Ollama Local LLM Workflow"
description: Need AI reading companions in offline or secure environments? Connect Yomitomo to local Ollama instances running DeepSeek-R1, Qwen 2.5, or Llama 3 for 100% private, zero-data-leakage study.
---

As Large Language Models become integral to research, due diligence, and code review, a pressing paradox arises: **the higher the sensitivity of the reading material (unreleased patents, proprietary M&A contracts, cutting-edge drafts), the less acceptable it is to upload it to commercial cloud APIs**.

Furthermore, during international flights or inside classified network zones, cloud-dependent AI reading tools fail entirely.

Yomitomo natively supports local inference engines like **Ollama** and **LM Studio**, enabling an **air-gapped, zero-data-leakage, fully offline** analytical reading environment.

---

## Local Private AI Reading Architecture

| Pipeline Node | Input | System Processing | Output Deliverable | Security & Boundary |
|---|---|---|---|---|
| **Model Hosting** | Local Ollama service running `qwen2.5` or `deepseek-r1` | Local CPU/GPU hosts `http://localhost:11434` HTTP endpoint | High-speed offline inference ready on device | Zero external network calls; model weights reside on local disk |
| **Endpoint Setup** | Configure `http://localhost:11434/v1` in Yomitomo | Validates local endpoint and maps to companion personas | Local models assigned to `@ZhouYan`, `@HeMingheng`, etc. | No external API keys required; zero token subscription fees |
| **Passage Debate** | Select text, press `A`, mention companion in thread | Yomitomo extracts anchor context and POSTs prompt to `localhost` | Millisecond-level logic critiques and concept clarifications | Data packets circulate strictly within local loopback |
| **Synthesis Card** | Press `T` to open Distillation Studio and audit draft | Local LLM checks reasoning gaps and refines prose | High-density Markdown distillation cards in SQLite | Knowledge assets archived offline for permanent reuse |

---

## 4 Steps to Configure Yomitomo + Ollama for Offline Reading

### Step 1: Install and Launch Ollama
1. Visit <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Ollama's official site</a> to download the installer for macOS, Windows, or Linux.
2. In your terminal, pull your preferred analytical model:
   ```bash
   # Recommended for bilingual non-fiction & concept parsing:
   ollama run qwen2.5:14b

   # Recommended for intense logical auditing & reasoning:
   ollama run deepseek-r1:14b
   ```

### Step 2: Configure Custom Provider in Yomitomo
1. In Yomitomo, navigate to **Settings > AI Models**.
2. Click **Add Provider** and set the following parameters:
   - **Provider Type**: `Custom / OpenAI Compatible`;
   - **Base URL**: `http://localhost:11434/v1`;
   - **API Key**: Enter any placeholder string (e.g., `ollama`);
   - **Model Name**: Enter your pulled model tag (e.g., `qwen2.5:14b` or `deepseek-r1:14b`).
3. Click **Test Connection** and save upon success.

### Step 3: Map Local Models to Reading & Review Companions
Under **Settings > AI Assistants**, assign your local Ollama model as the default engine across all reading and review companions.

### Step 4: Air-Gapped Deep Reading
Turn off Wi-Fi or switch to airplane mode, then open an EPUB or PDF paper:
- Select a paragraph and press `A`;
- In the thread, type: `@ZhouYan Audit the necessary conditions for this causal deduction`;
- Your local GPU performs rapid inference, generating rigorous critiques right in your margin;
- Press `T` to distill your conclusions into permanent knowledge assets.

---

## Recommended Hardware & Model Sizing

| Hardware Setup | Recommended Model | Strengths | Expected Inference Speed |
|---|---|---|---|
| **Apple Silicon (16GB Unified RAM)** | `qwen2.5:7b` / `deepseek-r1:8b` | Rapid concept explanations, standard logical audits | 30–45 tokens/s |
| **Apple Silicon (32GB+ Unified RAM)** | `qwen2.5:14b` / `deepseek-r1:14b` | Deep academic critiques, rigorous evidence auditing | 20–35 tokens/s |
| **PC + RTX 4070/4080 (12–16GB VRAM)** | `qwen2.5:14b-instruct` | Blazing-fast document analysis and debate | 40–60 tokens/s |

---

## Target Audience & Usage Boundaries

### Who This Is For

- Researchers, legal analysts, and engineers handling sensitive data under strict non-disclosure terms;
- Knowledge workers needing uninterrupted study workflows during flights or in offline research spaces;
- Power users with modern hardware looking for zero-cost, unlimited local token generation.

### What This Is Not For

- **Low-spec machines (e.g., 8GB RAM without dedicated GPU)**: Running 14B models locally may cause sluggishness; lighter 7B models or cloud APIs are advised;
- **Real-time live web search**: Local models focus on logical deconstruction of the provided passages rather than real-time web querying.

---

## Frequently Asked Questions (FAQ)

### Q1: Does running local models drain my laptop battery rapidly?
**Answer:** Yomitomo only triggers local inference when you deliberately invoke an assistant with `@` or request a distillation review (generating only a few hundred tokens per call). It does not run continuous background workloads, minimizing battery impact.

### Q2: Do I need to configure firewall rules for Ollama?
**Answer:** No. Ollama listens on `http://localhost:11434`. As long as Yomitomo runs on the same machine, communication travels across local loopback without modifying firewall policies.

---

## Related Guides & Workflows

- [Why Local-First Architecture Matters for Reading Privacy](/en/blog/scenarios/local-first-privacy/)
- [Academic Paper Deep Reading: An AI-Powered Workflow](/en/blog/scenarios/academic-paper-reading/)
- [Critical Reading in Practice: Deconstruct Arguments](/en/blog/scenarios/critical-reading/)
- [Yomitomo Model Configuration Documentation](/en/docs/settings/)
