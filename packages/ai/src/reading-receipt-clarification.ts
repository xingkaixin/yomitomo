import type { Agent, ArticleRecord, LlmProvider } from '@yomitomo/shared';
import type { ReadingCardEvidenceUnit } from '@yomitomo/core';
import { parseJsonObject, stringValue } from './json';
import { callProviderText, streamProviderText } from './provider-client';

export type ReadingReceiptClarificationStance = 'include' | 'exclude';

export type ReadingReceiptClarificationOpinion = {
  agentId: string;
  agentNickname: string;
  agentUsername: string;
  agentAvatar: string;
  agentColor: string;
  stance: ReadingReceiptClarificationStance;
  reason: string;
};

export type ReadingReceiptClarificationRoundInput = {
  userThought?: string;
  opinions: ReadingReceiptClarificationOpinion[];
};

export type GenerateReadingReceiptClarificationInput = {
  article: ArticleRecord;
  evidenceUnit: ReadingCardEvidenceUnit;
  previousRounds?: ReadingReceiptClarificationRoundInput[];
  userThought?: string;
};

export async function generateReadingReceiptClarification(
  provider: LlmProvider,
  agents: Agent[],
  input: GenerateReadingReceiptClarificationInput,
): Promise<ReadingReceiptClarificationOpinion[]> {
  return Promise.all(
    agents.map(async (agent) => generateAgentClarificationOpinion(provider, agent, input)),
  );
}

export async function streamReadingReceiptClarificationOpinion(
  provider: LlmProvider,
  agent: Agent,
  input: GenerateReadingReceiptClarificationInput,
  onDelta: (delta: string) => void,
): Promise<ReadingReceiptClarificationOpinion> {
  const chunks: string[] = [];
  await streamProviderText(provider, clarificationPayload(agent, input), (delta) => {
    chunks.push(delta);
    onDelta(delta);
  });
  return normalizeAgentClarificationOpinion(agent, chunks.join(''));
}

async function generateAgentClarificationOpinion(
  provider: LlmProvider,
  agent: Agent,
  input: GenerateReadingReceiptClarificationInput,
): Promise<ReadingReceiptClarificationOpinion> {
  const rawResponse = await callProviderText(provider, clarificationPayload(agent, input));
  return normalizeAgentClarificationOpinion(agent, rawResponse);
}

function clarificationPayload(agent: Agent, input: GenerateReadingReceiptClarificationInput) {
  return {
    system: `${agent.soul}\n\n你正在参与 Yomitomo 的读后回执“待澄清”讨论。你的任务不是总结文章，而是判断这一条阅读痕迹是否应该进入本次读后回执材料。你必须明确站队，并给出能回到原文或批注现场的理由。`,
    user: buildClarificationPrompt(input),
    maxTokens: 900,
    temperature: agent.temperature,
  };
}

function normalizeAgentClarificationOpinion(
  agent: Agent,
  rawResponse: string,
): ReadingReceiptClarificationOpinion {
  const parsed = parseJsonObject(rawResponse);
  return {
    agentId: agent.id,
    agentNickname: agent.nickname,
    agentUsername: agent.username,
    agentAvatar: agent.avatar,
    agentColor: agent.annotationColor,
    stance: parsed.stance === 'exclude' ? 'exclude' : 'include',
    reason: stringValue(parsed.reason).slice(0, 420) || '没有给出理由。',
  };
}

function buildClarificationPrompt(input: GenerateReadingReceiptClarificationInput) {
  return `请判断这条待澄清材料应该“纳入”还是“暂放”。

定义：
- include：这条痕迹应该进入本次读后回执材料。它能支撑读者这次阅读真正留下的判断、困惑、转变或可复用洞见。
- exclude：这条痕迹本次先暂放。它可能只是原文普通信息、证据不足、与这次回执主线关系弱，或还没有形成可用判断。

文章：
${JSON.stringify(
  {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  },
  null,
  2,
)}

待澄清材料：
${JSON.stringify(
  {
    id: input.evidenceUnit.id,
    quote: input.evidenceUnit.quote,
    context: input.evidenceUnit.context,
    annotationType: input.evidenceUnit.annotationType,
    readingIntent: input.evidenceUnit.readingIntent,
    annotationAuthor: input.evidenceUnit.annotationAuthorLabel,
    annotationBody: input.evidenceUnit.annotationBody
      ? {
          author: input.evidenceUnit.annotationBody.authorLabel,
          content: input.evidenceUnit.annotationBody.content,
        }
      : null,
    comments: input.evidenceUnit.comments.map((comment) => ({
      author: comment.authorLabel,
      content: comment.content,
    })),
  },
  null,
  2,
)}

历史轮次：
${JSON.stringify(input.previousRounds || [], null, 2)}

用户本轮补充：
${input.userThought?.trim() || '无'}

输出 JSON，不要输出 Markdown。先输出 reason，再输出 stance：
{
  "reason": "用 1-3 句说明你的理由，必须具体，不要泛泛而谈",
  "stance": "include" | "exclude"
}`;
}
