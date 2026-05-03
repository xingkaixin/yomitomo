import type { Agent, AgentAnnotatePayload, AgentMessagePayload, Annotation, Comment, LlmProvider } from "@yomitomo/shared";
import { createTextAnchor, makeId } from "@yomitomo/shared";
import { logError, logInfo } from "./logger";

export async function testProvider(provider: LlmProvider): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider.type !== "anthropic") {
      return { ok: false, message: "当前只支持测试 Anthropic provider" };
    }

    const content = await callAnthropic(provider, "You are a connectivity test assistant.", "Reply with OK only.", 128);
    return { ok: true, message: content };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Provider 测试失败" };
  }
}

export async function runAgentStream(
  provider: LlmProvider,
  agent: { soul: string },
  payload: AgentMessagePayload,
  onDelta: (delta: string) => void
): Promise<void> {
  if (provider.type !== "anthropic") {
    throw new Error("当前只支持 Anthropic provider 调用");
  }

  const system = `${agent.soul}\n\n你正在作为网页阅读器里的 @${payload.agentUsername} 参与一条批注讨论。回复要成为批注 thread 中的一条评论。保持具体、克制、围绕原文。`;
  const user = buildAgentPrompt(payload);
  await streamAnthropic(provider, system, user, 1200, onDelta);
}

export async function runAgent(provider: LlmProvider, agent: { id: string; username: string; nickname: string; avatar: string; annotationColor: string; soul: string }, payload: AgentMessagePayload): Promise<Comment> {
  if (provider.type !== "anthropic") {
    throw new Error("当前只支持 Anthropic provider 调用");
  }

  const system = `${agent.soul}\n\n你正在作为网页阅读器里的 @${agent.username} 参与一条批注讨论。回复要成为批注 thread 中的一条评论。保持具体、克制、围绕原文。`;
  const user = buildAgentPrompt(payload);
  const content = await callAnthropic(provider, system, user, 1200);

  return {
    id: "",
    author: "ai",
    content,
    createdAt: new Date().toISOString(),
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor
  };
}

export async function runAgentAnnotate(provider: LlmProvider, agent: Agent, payload: AgentAnnotatePayload): Promise<Annotation[]> {
  if (provider.type !== "anthropic") {
    throw new Error("当前只支持 Anthropic provider 调用");
  }

  const system = `${agent.soul}\n\n你正在作为网页阅读器里的 @${agent.username} 主动阅读文章并创建批注。只标出真正值得讨论的原文片段：金句、关键判断、强论点、反常规观点、潜在漏洞、值得追问的前提、与读者决策相关的信息。平平无奇的句子直接跳过。`;
  const content = await callAnthropic(provider, system, buildAgentAnnotatePrompt(payload), 4000);
  const suggestions = parseAnnotationSuggestions(content);
  const now = new Date().toISOString();

  return suggestions.flatMap((suggestion) => {
    const annotation = createAgentAnnotation(agent, payload, suggestion, now);
    return annotation ? [annotation] : [];
  });
}

export async function runAgentAnnotateStream(provider: LlmProvider, agent: Agent, payload: AgentAnnotatePayload, onAnnotation: (annotation: Annotation) => void): Promise<void> {
  if (provider.type !== "anthropic") {
    throw new Error("当前只支持 Anthropic provider 调用");
  }

  const system = `${agent.soul}\n\n你正在作为网页阅读器里的 @${agent.username} 主动阅读文章并创建批注。只标出真正值得讨论的原文片段：金句、关键判断、强论点、反常规观点、潜在漏洞、值得追问的前提、与读者决策相关的信息。平平无奇的句子直接跳过。`;
  let buffer = "";
  const flushLine = (line: string) => {
    const cleaned = line.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    if (!cleaned) return;

    try {
      const parsed = JSON.parse(cleaned) as { exact?: unknown; comment?: unknown };
      const exact = typeof parsed.exact === "string" ? parsed.exact : "";
      const annotation = createAgentAnnotation(agent, payload, {
        exact,
        comment: typeof parsed.comment === "string" ? parsed.comment : ""
      }, new Date().toISOString());
      if (annotation) {
        onAnnotation(annotation);
      } else {
        logInfo("agent.annotate.skip", { agent: agent.username, reason: "exact_not_found", exactPreview: exact.slice(0, 120) });
      }
    } catch (error) {
      logError("agent.annotate.ndjson_parse_error", error, { agent: agent.username, line: cleaned.slice(0, 500) });
    }
  };

  await streamAnthropic(provider, system, buildAgentAnnotateStreamPrompt(payload), 4000, (delta) => {
    buffer += delta;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) flushLine(line);
  });

  flushLine(buffer);
}

async function callAnthropic(provider: LlmProvider, system: string, user: string, maxTokens: number) {
  const baseUrl = provider.baseUrl.replace(/\/$/, "") || "https://api.anthropic.com";
  const url = `${baseUrl}/v1/messages`;
  logAnthropicRequest(provider, url, { stream: false, maxTokens });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: provider.modelName,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic 请求失败：${response.status} ${text.slice(0, 400)}`);
  }

  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.map((part) => (part.type === "text" ? part.text || "" : "")).join("\n").trim();
  if (!text) throw new Error("Anthropic 返回为空");
  return text;
}

async function streamAnthropic(provider: LlmProvider, system: string, user: string, maxTokens: number, onDelta: (delta: string) => void) {
  const baseUrl = provider.baseUrl.replace(/\/$/, "") || "https://api.anthropic.com";
  const url = `${baseUrl}/v1/messages`;
  logAnthropicRequest(provider, url, { stream: true, maxTokens });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: provider.modelName,
      max_tokens: maxTokens,
      stream: true,
      system,
      messages: [{ role: "user", content: user }]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic 请求失败：${response.status} ${text.slice(0, 400)}`);
  }

  if (!response.body) throw new Error("Anthropic streaming body 为空");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;

      const data = dataLine.slice(6);
      if (data === "[DONE]") continue;

      const parsed = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } };
      if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta" && parsed.delta.text) {
        onDelta(parsed.delta.text);
      }
    }
  }
}

function logAnthropicRequest(provider: LlmProvider, url: string, extra: Record<string, unknown>) {
  logInfo("anthropic.request", {
    url,
    model: provider.modelName,
    providerName: provider.name,
    apiKeyPreview: previewSecret(provider.apiKey),
    ...extra
  });
}

function previewSecret(value: string) {
  if (!value) return "<empty>";
  if (value.length <= 8) return "<too-short>";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function buildAgentPrompt(payload: AgentMessagePayload) {
  const comments = payload.annotation.comments
    .map((comment) => {
      const author = comment.author === "ai" ? comment.agentNickname || comment.agentUsername || "AI" : "用户";
      return `${author}: ${comment.content}`;
    })
    .join("\n");

  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n全文：\n${payload.article.text.slice(0, 30000)}\n\n用户高亮：\n${payload.annotation.anchor.exact}\n\n当前批注讨论：\n${comments}\n\n刚刚触发你的用户评论：\n${payload.userComment.content}\n\n请直接给出你作为批注评论的回复。`;
}

function buildAgentAnnotatePrompt(payload: AgentAnnotatePayload) {
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n全文：\n${payload.article.text.slice(0, 50000)}\n\n请返回 JSON 数组。每个元素包含：\n- exact：必须是文章中的原文连续片段，逐字一致\n- comment：你为什么认为这段值得讨论，作为批注里的第一条评论\n\n选择标准：只挑有讨论价值的文本；文章长可以多挑，文章短可以少挑；没有价值可以返回空数组。\n\n只返回 JSON，不要输出 Markdown。`;
}

function buildAgentAnnotateStreamPrompt(payload: AgentAnnotatePayload) {
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n全文：\n${payload.article.text.slice(0, 50000)}\n\n请用 NDJSON 返回批注。每一行都是一个完整 JSON 对象，格式为：{\"exact\":\"文章中的原文连续片段\",\"comment\":\"为什么这段值得讨论\"}\n\n选择标准：只挑有讨论价值的文本；文章长可以多挑，文章短可以少挑；没有价值可以不输出任何行。\n\n要求：\n- exact 必须是文章中的原文连续片段，逐字一致\n- 每发现一条值得批注的内容，就立刻输出一行 JSON\n- 只输出 NDJSON，不要输出 Markdown，不要输出数组。`;
}

function createAgentAnnotation(agent: Agent, payload: AgentAnnotatePayload, suggestion: { exact: string; comment: string }, now: string): Annotation | null {
  const exact = suggestion.exact.trim();
  const start = payload.article.text.indexOf(exact);
  if (start < 0) return null;

  const comment = suggestion.comment.trim();
  return {
    id: makeId("annotation"),
    anchor: createTextAnchor(payload.article.text, start, start + exact.length),
    author: "ai",
    color: agent.annotationColor,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    comments: comment
      ? [{
          id: makeId("comment"),
          author: "ai",
          content: comment,
          createdAt: now,
          agentId: agent.id,
          agentUsername: agent.username,
          agentNickname: agent.nickname,
          agentAvatar: agent.avatar,
          agentAnnotationColor: agent.annotationColor
        }]
      : [],
    createdAt: now,
    updatedAt: now
  };
}

function parseAnnotationSuggestions(content: string): Array<{ exact: string; comment: string }> {
  const json = content.match(/\[[\s\S]*\]/)?.[0] || content;
  const parsed = JSON.parse(json) as Array<{ exact?: unknown; comment?: unknown }>;
  return parsed
    .map((item) => ({
      exact: typeof item.exact === "string" ? item.exact : "",
      comment: typeof item.comment === "string" ? item.comment : ""
    }))
    .filter((item) => item.exact.trim().length > 0);
}
