---
title: "Free Local AI PDF & EPUB Reader with Ollama (Offline Setup)"
description: Use Ollama to read, annotate, and discuss PDFs and EPUBs locally with Yomitomo—a free, open-source desktop reader. Includes localhost endpoint setup, model routing, and offline limits.
lastUpdated: 2026-11-27
---

Yomitomo can send reading questions to an Ollama model running on the same computer. Configure an `OpenAI compatible` provider at `http://localhost:11434/v1`, select a downloaded local model, and assign it to reading tasks. Your local model handles those AI requests; remote providers send the required context to their configured servers.

Maintained by the Yomitomo project, based on the v0.18.2 configuration and [Ollama's OpenAI compatibility documentation](https://docs.ollama.com/api/openai-compatibility). This is a setup guide, not a hardware performance benchmark.

## 1. Prepare a local model

Install [Ollama](https://ollama.com/) and download a model while connected to the internet. For example:

```bash
ollama pull qwen2.5:7b
ollama run qwen2.5:7b
```

This tag is an example, not a universal hardware recommendation. Model size, quantization, context length and available memory affect whether a model fits and how quickly it responds. Use a model supported by your hardware and check it in Ollama first.

Choose a locally downloaded model rather than a cloud model if local inference is your objective. A localhost endpoint alone does not prove that the selected model runs locally.

## 2. Connect Yomitomo

In **Settings > Models & routing**, add a provider using the `OpenAI compatible` preset (OpenAI Chat Completions protocol) and configure:

| Field | Value |
| --- | --- |
| Name | Ollama local |
| Base URL | `http://localhost:11434/v1` |
| API Key | `ollama` as a placeholder for the local server |
| Model | The exact installed tag, such as `qwen2.5:7b` |

Fetch the model list or add the model manually, test the connection, then save. Choose this provider and model as the **Default model**, and check each optional task override (**Reading comprehension**, **In-depth review**, and **Bilingual translation**) so requests go to your intended local model instead of a remote provider.

## 3. Try one passage

1. Import a local text-based PDF or DRM-free ebook (EPUB, AZW3, or MOBI) from the library's add menu.
2. Open it and select a short paragraph.
3. Press `A` to create a highlight and record a thought, open its discussion, and `@`-mention a reading companion such as `@GideonFrost` or `@JuneHartley`.
4. Ask a question with a verifiable answer, such as which sentence supports the author's conclusion.
5. Compare the reply with the source before saving your own note.

<figure>
  <img src="/assets/en-import-pdf-1280.webp" alt="Yomitomo Add PDF document dialog with a file selection and drop area" width="1280" height="851" loading="lazy" decoding="async" />
  <figcaption>Import a local PDF before testing passage-level AI discussion.</figcaption>
</figure>

Scanned PDFs need OCR in another tool before their text can be selected. There is no need to test the setup with sensitive material.

## What works offline?

Previously imported documents, manual highlights and thoughts, keyword search, and a compatible downloaded local model can be used without a cloud model API. Download the application and model weights first, then verify your intended reading task with the network disconnected.

Connecting Ollama does not disable every network feature in Yomitomo or isolate the computer from the network:

- **Explicit online features**: importing web articles fetches target URLs; WeRead sync and the optional in-app WeRead web reader contact WeRead; downloading the optional local Reading Memory embedding model (`embeddinggemma-300m-ONNX`) fetches weights from ModelScope or Hugging Face.
- **Background requests**: Yomitomo checks `download.yomitomo.app` / `yomitomo.app` for updates, sends anonymous usage metrics to `telemetry.yomitomo.app` by default (a daily anonymous heartbeat and Reading Memory action counts without an install ID, no reading content; opt out in **Settings > General > Privacy**), and fetches a public model pricing catalog from `models.dev` on startup and every 24 hours (not controlled by the telemetry toggle; sends no reading content, API key, or install ID).

See [Settings, Models, and Data](/en/docs/settings/) for model routing and privacy controls.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Connection refused | Ollama must be running on the same computer at the configured port. |
| Model not found | Match the full installed model tag, including its size suffix. |
| Slow replies or out-of-memory errors | Try a smaller model and shorter context; close other memory-intensive applications. |
| Basic replies work but review or translation struggles | Model capabilities vary. Switch to a more capable local model for **In-depth review** or **Bilingual translation**, or verify the prompt works directly in Ollama. |
| A request still goes to a remote provider | Check the **Default model** and every per-task override in **Settings > Models & routing**. |

Local inference can consume substantial memory, power and GPU time. We do not promise a fixed tokens-per-second rate or negligible battery use.

<a href="/en/#download" data-umami-event="download_section_click" data-umami-event-language="en" data-umami-event-placement="guide">Download Yomitomo and try reading with a local model</a>. For everyday annotation controls, see [Reader, Annotations, and Discussions](/en/docs/reader/).
