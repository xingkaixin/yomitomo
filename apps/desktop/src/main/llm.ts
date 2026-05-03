import type {
  Agent,
  AgentAnnotatePayload,
  AgentMessagePayload,
  Annotation,
  ArticleRecord,
  Comment,
  LlmProvider,
  ReadingCardRecord,
  ReadingCardReviewerResult,
} from '@yomitomo/shared';
import {
  annotationDensityInstruction,
  createAgentAnnotation,
  normalizeAnnotationType,
  parseAnnotationSuggestions,
  type ReadingCardEvidenceUnit,
} from '@yomitomo/core';
import { logError, logInfo } from './logger';

export type GenerateReadingCardInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
};

export type ReviewReadingCardInput = GenerateReadingCardInput & {
  readingCard: ReadingCardRecord;
  reviewAgentIds?: string[];
};

export type ReviewReadingCardResult = Pick<
  ReadingCardReviewerResult,
  'verdict' | 'summary' | 'findings' | 'acceptedClaims' | 'missingAngles' | 'rawResponse'
>;

export async function testProvider(
  provider: LlmProvider,
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider.type !== 'anthropic') {
      return { ok: false, message: '当前只支持测试 Anthropic provider' };
    }

    const content = await callAnthropic(
      provider,
      'You are a connectivity test assistant.',
      'Reply with OK only.',
      128,
    );
    return { ok: true, message: content };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Provider 测试失败' };
  }
}

export async function runAgentStream(
  provider: LlmProvider,
  agent: { soul: string; temperature: number },
  payload: AgentMessagePayload,
  onDelta: (delta: string) => void,
): Promise<void> {
  if (provider.type !== 'anthropic') {
    throw new Error('当前只支持 Anthropic provider 调用');
  }

  const system = `${agent.soul}\n\n你正在作为网页阅读器里的 @${payload.agentUsername} 参与一条批注讨论。回复要成为批注 thread 中的一条评论。保持具体、克制、围绕原文。`;
  const user = buildAgentPrompt(payload);
  await streamAnthropic(provider, system, user, 1200, agent.temperature, onDelta);
}

export async function runAgent(
  provider: LlmProvider,
  agent: {
    id: string;
    username: string;
    nickname: string;
    avatar: string;
    annotationColor: string;
    temperature: number;
    soul: string;
  },
  payload: AgentMessagePayload,
): Promise<Comment> {
  if (provider.type !== 'anthropic') {
    throw new Error('当前只支持 Anthropic provider 调用');
  }

  const system = `${agent.soul}\n\n你正在作为网页阅读器里的 @${agent.username} 参与一条批注讨论。回复要成为批注 thread 中的一条评论。保持具体、克制、围绕原文。`;
  const user = buildAgentPrompt(payload);
  const content = await callAnthropic(provider, system, user, 1200, agent.temperature);

  return {
    id: '',
    author: 'ai',
    content,
    createdAt: new Date().toISOString(),
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
  };
}

export async function runAgentAnnotate(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
): Promise<Annotation[]> {
  if (provider.type !== 'anthropic') {
    throw new Error('当前只支持 Anthropic provider 调用');
  }

  const system = `${agent.soul}\n\n你正在作为网页阅读器里的 @${agent.username} 主动阅读文章并创建批注。只标出真正值得讨论的原文片段：金句、关键判断、强论点、反常规观点、潜在漏洞、值得追问的前提、与读者决策相关的信息。平平无奇的句子直接跳过。`;
  const content = await callAnthropic(
    provider,
    system,
    buildAgentAnnotatePrompt(payload, agent),
    4000,
    agent.temperature,
  );
  const suggestions = parseAnnotationSuggestions(content);
  const now = new Date().toISOString();

  return suggestions.flatMap((suggestion) => {
    const annotation = createAgentAnnotation(agent, payload.article.text, suggestion, now);
    return annotation ? [annotation] : [];
  });
}

export async function runAgentAnnotateStream(
  provider: LlmProvider,
  agent: Agent,
  payload: AgentAnnotatePayload,
  onAnnotation: (annotation: Annotation) => void,
): Promise<void> {
  if (provider.type !== 'anthropic') {
    throw new Error('当前只支持 Anthropic provider 调用');
  }

  const system = `${agent.soul}\n\n你正在作为网页阅读器里的 @${agent.username} 主动阅读文章并创建批注。只标出真正值得讨论的原文片段：金句、关键判断、强论点、反常规观点、潜在漏洞、值得追问的前提、与读者决策相关的信息。平平无奇的句子直接跳过。`;
  let buffer = '';
  const flushLine = (line: string) => {
    const cleaned = line
      .trim()
      .replace(/^```(?:json)?/, '')
      .replace(/```$/, '')
      .trim();
    if (!cleaned) return;

    try {
      const parsed = JSON.parse(cleaned) as { exact?: unknown; comment?: unknown; type?: unknown };
      const exact = typeof parsed.exact === 'string' ? parsed.exact : '';
      const annotation = createAgentAnnotation(
        agent,
        payload.article.text,
        {
          exact,
          comment: typeof parsed.comment === 'string' ? parsed.comment : '',
          annotationType: normalizeAnnotationType(parsed.type),
        },
        new Date().toISOString(),
      );
      if (annotation) {
        onAnnotation(annotation);
      } else {
        logInfo('agent.annotate.skip', {
          agent: agent.username,
          reason: 'exact_not_found',
          exactPreview: exact.slice(0, 120),
        });
      }
    } catch (error) {
      logError('agent.annotate.ndjson_parse_error', error, {
        agent: agent.username,
        line: cleaned.slice(0, 500),
      });
    }
  };

  await streamAnthropic(
    provider,
    system,
    buildAgentAnnotateStreamPrompt(payload, agent),
    4000,
    agent.temperature,
    (delta) => {
      buffer += delta;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) flushLine(line);
    },
  );

  flushLine(buffer);
}

export async function generateReadingCard(provider: LlmProvider, input: GenerateReadingCardInput) {
  if (provider.type !== 'anthropic') {
    throw new Error('当前只支持 Anthropic provider 调用');
  }

  const system =
    '你是 Yomitomo 的读后卡片生成器。你的任务是基于文章全文、读者批注和讨论证据生成一张可保存的读后笔记。你使用产品级整理策略，保持克制、准确、有判断力；不要套用任何批注助手的人格或口吻。必须区分文章观点、读者关注、助手补充。所有判断都要能回到原文或证据单元。';

  return callAnthropic(provider, system, buildReadingCardPrompt(input), 3000, 0.35);
}

export async function reviewReadingCard(
  provider: LlmProvider,
  agent: Agent,
  input: ReviewReadingCardInput,
): Promise<ReviewReadingCardResult> {
  if (provider.type !== 'anthropic') {
    throw new Error('当前只支持 Anthropic provider 调用');
  }

  const system = `${agent.soul}\n\n你是 Yomitomo 的读后卡片审核助手。你要审当前读后卡片和证据之间的关系，重点检查事实归因、证据链、覆盖度、压缩质量和后续行动价值。保持你的审核倾向，但输出必须克制、可执行、能回到原文或证据单元。`;
  const rawResponse = await callAnthropic(
    provider,
    system,
    buildReviewReadingCardPrompt(input),
    3200,
    agent.temperature,
    { failOnMaxTokens: true },
  );
  return normalizeReadingCardReviewResponse(rawResponse);
}

async function callAnthropic(
  provider: LlmProvider,
  system: string,
  user: string,
  maxTokens: number,
  temperature?: number,
  options: { failOnMaxTokens?: boolean } = {},
) {
  const baseUrl = provider.baseUrl.replace(/\/$/, '') || 'https://api.anthropic.com';
  const url = `${baseUrl}/v1/messages`;
  logAnthropicRequest(provider, url, { stream: false, maxTokens, temperature });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: provider.modelName,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic 请求失败：${response.status} ${text.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = data.content
    ?.map((part) => (part.type === 'text' ? part.text || '' : ''))
    .join('\n')
    .trim();
  if (!text) throw new Error('Anthropic 返回为空');
  logInfo('anthropic.response', {
    model: provider.modelName,
    providerName: provider.name,
    stopReason: data.stop_reason || '',
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    textLength: text.length,
  });
  if (options.failOnMaxTokens && data.stop_reason === 'max_tokens') {
    throw new Error(`模型输出达到 max_tokens=${maxTokens}，结构化 JSON 可能已被截断`);
  }
  return text;
}

async function streamAnthropic(
  provider: LlmProvider,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
  onDelta: (delta: string) => void,
) {
  const baseUrl = provider.baseUrl.replace(/\/$/, '') || 'https://api.anthropic.com';
  const url = `${baseUrl}/v1/messages`;
  logAnthropicRequest(provider, url, { stream: true, maxTokens, temperature });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: provider.modelName,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic 请求失败：${response.status} ${text.slice(0, 400)}`);
  }

  if (!response.body) throw new Error('Anthropic streaming body 为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;

      const data = dataLine.slice(6);
      if (data === '[DONE]') continue;

      const parsed = JSON.parse(data) as {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      if (
        parsed.type === 'content_block_delta' &&
        parsed.delta?.type === 'text_delta' &&
        parsed.delta.text
      ) {
        onDelta(parsed.delta.text);
      }
    }
  }
}

function logAnthropicRequest(provider: LlmProvider, url: string, extra: Record<string, unknown>) {
  logInfo('anthropic.request', {
    url,
    model: provider.modelName,
    providerName: provider.name,
    apiKeyPreview: previewSecret(provider.apiKey),
    ...extra,
  });
}

function previewSecret(value: string) {
  if (!value) return '<empty>';
  if (value.length <= 8) return '<too-short>';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function buildAgentPrompt(payload: AgentMessagePayload) {
  const comments = payload.annotation.comments
    .map((comment) => {
      const author =
        comment.author === 'ai' ? formatAgentAuthor(comment) : formatUserAuthor(comment);
      return `${author}: ${comment.content}`;
    })
    .join('\n');
  const userMention = formatUserMention(payload.userComment);

  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n全文：\n${payload.article.text.slice(0, 30000)}\n\n用户高亮：\n${payload.annotation.anchor.exact}\n\n可提及的读者账号：${userMention}\n\n当前批注讨论：\n${comments}\n\n刚刚触发你的读者评论：\n${formatUserAuthor(payload.userComment)}: ${payload.userComment.content}\n\n请直接给出你作为批注评论的回复。需要提及读者时，使用 ${userMention}。`;
}

function formatAgentAuthor(comment: Comment) {
  if (comment.agentNickname && comment.agentUsername) {
    return `${comment.agentNickname} (@${comment.agentUsername})`;
  }
  return comment.agentNickname || (comment.agentUsername ? `@${comment.agentUsername}` : 'AI');
}

function formatUserAuthor(comment: Comment) {
  if (comment.userNickname && comment.userUsername) {
    return `${comment.userNickname} (@${comment.userUsername})`;
  }
  return comment.userNickname || formatUserMention(comment);
}

function formatUserMention(comment: Comment) {
  return comment.userUsername ? `@${comment.userUsername}` : '读者';
}

function buildAgentAnnotatePrompt(payload: AgentAnnotatePayload, agent: Agent) {
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n全文：\n${payload.article.text.slice(0, 50000)}\n\n请返回 JSON 数组。每个元素包含：\n- exact：必须是文章中的原文连续片段，逐字一致\n- type：只允许 key_point、assumption、concept、question、quote\n- comment：你为什么认为这段值得讨论，作为批注里的第一条评论\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity)}\n\n类型含义：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n选择标准：只挑有讨论价值的文本；没有价值可以返回空数组。\n\n只返回 JSON，不要输出 Markdown。`;
}

function buildAgentAnnotateStreamPrompt(payload: AgentAnnotatePayload, agent: Agent) {
  return `文章标题：${payload.article.title}\n文章 URL：${payload.article.url}\n\n全文：\n${payload.article.text.slice(0, 50000)}\n\n请用 NDJSON 返回批注。每一行都是一个完整 JSON 对象，格式为：{"exact":"文章中的原文连续片段","type":"key_point","comment":"为什么这段值得讨论"}\n\n批注密度：${annotationDensityInstruction(agent.annotationDensity)}\n\n类型只允许：\n- key_point：关键判断或强论点\n- assumption：前提、漏洞、可挑战处\n- concept：概念解释需求\n- question：值得追问的问题\n- quote：金句或可复用表达\n\n选择标准：只挑有讨论价值的文本；没有价值可以不输出任何行。\n\n要求：\n- exact 必须是文章中的原文连续片段，逐字一致\n- type 必须从允许值中选择\n- 每发现一条值得批注的内容，就立刻输出一行 JSON\n- 只输出 NDJSON，不要输出 Markdown，不要输出数组。`;
}

function buildReadingCardPrompt(input: GenerateReadingCardInput) {
  const article = {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  };
  const evidence = input.evidenceUnits.map((unit) => ({
    id: unit.index,
    type: unit.annotationType || '批注',
    quote: unit.quote,
    annotationAuthor: unit.annotationAuthorLabel,
    comments: unit.comments.map((comment) => ({
      author: comment.authorLabel,
      content: comment.content,
    })),
  }));

  return `请基于全文和证据单元生成一张中文 Markdown 读后卡片。

文章信息：
${JSON.stringify(article, null, 2)}

全文：
${input.articleText.slice(0, 50000)}

证据单元：
${JSON.stringify(evidence, null, 2).slice(0, 30000)}

输出要求：
- 直接输出 Markdown，不要输出代码块。
- 不要写“文章快照”。
- 不要复述全文概要。
- 每条关键判断尽量标注证据编号，例如 [#1]。
- 保留读者自己的关注点，标明“我”或读者昵称。
- 助手观点和文章观点分开表达。
- 内容要精炼、有层次，适合作为读后笔记保存。

固定结构：
# ${input.article.title}

## 核心主张
用 1-2 句话说清文章最重要的判断。

## 我关注了什么
按主题归并读者批注和评论，每条带原文证据编号。

## 讨论中浮现了什么
整理共识、分歧、未回答问题。来源来自评论 thread。

## 可复用洞见
提炼 3-5 条可以迁移到其他阅读或决策里的洞见。

## 后续行动线索
列出后续阅读、验证假设或可执行动作。`;
}

function buildReviewReadingCardPrompt(input: ReviewReadingCardInput) {
  const article = {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  };
  const card = {
    id: input.readingCard.id,
    sections: input.readingCard.sections,
    markdown: input.readingCard.contentMarkdown,
  };
  const evidence = input.evidenceUnits.map((unit) => ({
    id: unit.index,
    type: unit.annotationType || '批注',
    quote: unit.quote,
    annotationAuthor: unit.annotationAuthorLabel,
    comments: unit.comments.map((comment) => ({
      author: comment.authorLabel,
      content: comment.content,
    })),
  }));

  return `请审核这张读后卡片，返回一个 JSON 对象。

文章信息：
${JSON.stringify(article, null, 2)}

全文：
${input.articleText.slice(0, 50000)}

证据单元：
${JSON.stringify(evidence, null, 2).slice(0, 30000)}

读后卡片：
${JSON.stringify(card, null, 2).slice(0, 30000)}

审核维度：
- 证据链：关键判断是否能对应文章原文或证据单元。
- 归因：文章观点、读者关注、助手讨论是否表达清楚。
- 覆盖：高价值批注和评论是否被合理吸收。
- 压缩质量：是否保留有效判断，去除空泛复述。
- 行动线索：后续行动是否具体、能执行、和阅读材料有关。

输出 JSON 格式：
{
  "verdict": "pass",
  "summary": "整体审核结论，80 字以内",
  "findings": [
    {
      "section": "核心主张",
      "severity": "high",
      "problem": "问题描述",
      "evidenceIds": [1, 2],
      "suggestedRewrite": "可选，给出更好的改写"
    }
  ],
  "acceptedClaims": ["保留得好的判断"],
  "missingAngles": ["建议补充的视角"]
}

约束：
- verdict 只允许 pass 或 revise；存在高风险事实、归因或证据问题时使用 revise。
- severity 只允许 high、medium、low。
- evidenceIds 使用证据单元 id；没有对应证据时返回空数组。
- findings 最多 6 条，acceptedClaims 最多 4 条，missingAngles 最多 4 条。
- 只输出 JSON 对象，不要输出 Markdown。`;
}

function normalizeReadingCardReviewResponse(rawResponse: string): ReviewReadingCardResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObject(rawResponse);
  } catch (error) {
    logError('reading_card.review.parse_error', error, {
      rawLength: rawResponse.length,
      rawPreview: rawResponse.slice(0, 1200),
      rawTail: rawResponse.slice(-500),
    });
    return {
      verdict: 'revise',
      summary: '审核助手返回的内容格式异常，已保留原始输出供排查。',
      findings: [
        {
          section: '整张卡片',
          severity: 'high',
          problem: '审稿结果 JSON 解析失败，当前这位审核助手的结构化结论无法可靠读取。',
          evidenceIds: [],
        },
      ],
      acceptedClaims: [],
      missingAngles: [],
      rawResponse,
    };
  }
  return {
    verdict: parsed.verdict === 'pass' ? 'pass' : 'revise',
    summary: stringValue(parsed.summary).slice(0, 300),
    findings: Array.isArray(parsed.findings)
      ? parsed.findings.slice(0, 6).flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const finding = item as Record<string, unknown>;
          const problem = stringValue(finding.problem).slice(0, 500);
          if (!problem) return [];
          return [
            {
              section: stringValue(finding.section).slice(0, 80),
              severity:
                finding.severity === 'high' || finding.severity === 'low'
                  ? finding.severity
                  : 'medium',
              problem,
              evidenceIds: numberArray(finding.evidenceIds).slice(0, 8),
              suggestedRewrite: stringValue(finding.suggestedRewrite).slice(0, 800) || undefined,
            },
          ];
        })
      : [],
    acceptedClaims: stringArray(parsed.acceptedClaims).slice(0, 4),
    missingAngles: stringArray(parsed.missingAngles).slice(0, 4),
    rawResponse,
  };
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    throw new Error('审稿结果不是有效 JSON');
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = stringValue(item);
        return text ? [text.slice(0, 500)] : [];
      })
    : [];
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
    : [];
}
