---
title: "The Right Way to Use AI Reading Companions: Partner with Models, Don't Outsource Thinking"
description: Worried AI weakens critical thinking? Yomitomo positions LLMs as critical co-readers anchored to source passages—ensuring you remain the principal thinker and final decision maker.
---

"Read an entire book in 30 seconds with AI" has become a pervasive marketing slogan. Upload a PDF, click a button, and receive a bulleted summary. While ostensibly efficient, consider what is actually lost in this transaction:

**Your own cognitive restructuring process is eliminated.**

Consuming a generic second-hand summary robs you of wrestling with complex arguments, noticing subtle contradictions, and experiencing authentic intellectual surprise. You skip the confusion, questioning, and synthesis that constitute real learning.

Yomitomo establishes a clear boundary: **AI is an active co-reader, never a surrogate thinker**. It engages strictly within your self-directed reading flow and never summarizes in your absence.

---

## AI Reading Companion Workflow & Interaction Rules

| Stage | Trigger Action | System Processing | Output | Boundaries |
|---|---|---|---|---|
| **Passage Anchoring** | Select text, press `A`, pick cognitive role, record initial thought | Creates precision DOM/text anchor; records initial reaction | Highlight card with dedicated discussion thread | No floating prompts allowed without exact text anchor |
| **Targeted Invocation** | Type `@` in discussion thread to summon specialist (e.g., `@ZhouYan`) | Injects passage, surrounding context, and persona prompt directly to LLM | Nuanced critique challenging assumptions and logic | No unsolicited popups; operates strictly on user demand |
| **Multi-Turn Debate** | Follow up with counter-arguments or additional queries | Merges conversation history with new context in LLM request | Verifiable thought evolution timeline | Kept strictly within that highlight's thread |
| **Synthesis & Audit** | Launch Distillation Studio (`T`), invoke review agents (`@HeMingheng`) | Audits draft for logical gaps, missing evidence, and verbosity | Structured feedback with side-by-side revision proposals | Reviewers offer suggestions; author retains final editorial control |

---

## The Passage-Anchoring Iron Rule

Yomitomo's architecture enforces one fundamental constraint: **every AI reflection and dialogue must be anchored to a specific text passage**.

AI cannot perform floating summaries over an entire book without context. Only when you highlight a section and note your initial instinct can an AI agent respond within your dedicated thread. Its feedback directly cites the passage, your reflection, and the surrounding text.

This prevents superficial reading habits and ensures every future review traces back to original empirical evidence.

---

## Matrix of Specialized Personas: Beyond Generic Chatbots

Rather than providing an undifferentiated chat interface, Yomitomo deploys two distinct cohorts of specialized reading and review agents:

### Reading Matrix (Inspiration, Clarification & Conceptual Decomposition)
- **@LinZhiwei** (Marginal Companion): Clarifies obscure concepts, providing historical and intellectual context;
- **@ZhouYan** (Root Cause Inquirer): Rigorously audits underlying premises and causal logic;
- **@XuWenqu** (Inquiry Mentor): Refines vague intuitive doubts into sharp, testable questions;
- **@ChenYanshu** (Insight Curator): Extracts cross-domain mental models for practical application;
- **@ShenQingyuan** (Concept Translator): Unpacks specialized terminology and intellectual genealogies;
- **@GuXingjian** (Structure Navigator): Clarifies the architectural role of paragraphs within broader arguments.

### Review Matrix (Evidence, Logic & Actionable Verification)
- **@LiangZhengyan** (Evidence Scribe): Audits empirical backing and dataset validity;
- **@HeMingheng** (Logic Auditor): Identifies logical fallacies, circular reasoning, and causal inversions;
- **@SuDingbai** (Risk Auditor): Flags overgeneralizations, cognitive biases, and unhedged claims;
- **@TangJian** (Senior Editor): Eliminates redundancies and refines prose for maximum density.

---

## Target Audience & Usage Boundaries

### Who This Is For

- Independent thinkers who refuse to rely on secondhand AI summaries;
- Professionals reading serious non-fiction, academic literature, and technical reports;
- Writers and researchers who use dialectic dialogue to spark original insights.

### What This Is Not For

- **Skimming entire books in 3 minutes**: Yomitomo is built for slow, deliberate mastery;
- **Audio-only passive entertainment**: The interface is optimized for desktop analytical study.

---

## Frequently Asked Questions (FAQ)

### Q1: Do I need a monthly subscription to use AI companions in Yomitomo?
**Answer:** No subscription fees are paid to Yomitomo. Yomitomo operates on a Bring Your Own Key (BYOK) model. Connect your official OpenAI, Anthropic, DeepSeek, or Google Gemini keys, or use local Ollama / LM Studio instances completely for free.

### Q2: Will AI companions work when offline?
**Answer:** If you use local models via Ollama (e.g., DeepSeek-R1 or Llama 3), AI features work 100% offline. If using cloud APIs, internet connectivity is required for inference, but all annotation and distillation tools remain fully functional offline.

### Q3: Can I customize AI companion prompts?
**Answer:** Yes. Under **Settings > AI Assistants**, you can fine-tune system prompts, model temperature, and default models for each companion, or build your own domain-specific personas.

---

## Related Guides & Workflows

- [Critical Reading in Practice: Deconstruct Arguments with Review Agents](/en/blog/scenarios/critical-reading/)
- [Academic Paper Deep Reading: An AI-Powered Workflow](/en/blog/scenarios/academic-paper-reading/)
- [Deep Reading for Non-Fiction eBooks](/en/blog/scenarios/deep-ebook-reading/)
- [AI Reading Companions & Review Matrix Documentation](/en/docs/ai-companions/)
