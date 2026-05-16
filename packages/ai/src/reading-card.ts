import type {
  Agent,
  ArticleRecord,
  LlmProvider,
  ReadingCardRecord,
  ReadingCardReviewRecord,
  ReadingCardReviewerResult,
  ReadingDeliberationRecord,
} from '@yomitomo/shared';
import {
  buildReadingQuestions,
  type ReadingCardEvidenceUnit,
  type ReadingReceiptDecision,
} from '@yomitomo/core';
import {
  budgetArticleText,
  budgetDeliberationJson,
  budgetEvidenceJson,
  budgetReadingCardJson,
  formatBudgetNotice,
} from './budget';
import { numberArray, parseJsonObject, stringArray, stringValue } from './json';
import { logAiError } from './logger';
import { callProviderText } from './provider-client';

export type GenerateReadingCardInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
  receiptDecisions?: ReadingReceiptDecision[];
  readingDeliberation?: ReadingDeliberationRecord;
};

export type GenerateReadingDeliberationInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
  receiptDecisions?: ReadingReceiptDecision[];
};

export type ReviewReadingCardInput = GenerateReadingCardInput & {
  readingCard: ReadingCardRecord;
  previousReview?: ReadingCardReviewRecord;
  reviewAgentIds?: string[];
};

export type ReviewReadingCardResult = Pick<
  ReadingCardReviewerResult,
  'status' | 'verdict' | 'summary' | 'findings' | 'acceptedClaims' | 'missingAngles' | 'rawResponse'
>;

export async function generateReadingCard(provider: LlmProvider, input: GenerateReadingCardInput) {
  const system =
    '你是 Yomitomo 的读后回执整理员。你的任务不是复述文章，而是把这次阅读留下的停顿、判断、分歧、问题和可保存内容收成一份可回看的读后回执。你使用产品级整理策略，保持克制、准确、有判断力；不要套用任何批注助手的人格或口吻。必须区分文章观点、读者关注、助手补充。所有判断都要能回到原文或证据单元。';

  return callProviderText(provider, {
    system,
    user: buildReadingCardPrompt(provider, input),
    maxTokens: 3000,
    temperature: 0.35,
  });
}

export async function generateReadingDeliberation(
  provider: LlmProvider,
  input: GenerateReadingDeliberationInput,
) {
  const system =
    '你是 Yomitomo 的阅读审议编辑。你的任务是基于文章全文、读者批注、助手批注和评论 thread，整理这场阅读讨论已经形成的判断、分歧、证据强弱和未决问题。保持中立、具体、可追溯，所有判断都要能回到原文或证据单元。';

  return callProviderText(provider, {
    system,
    user: buildReadingDeliberationPrompt(provider, input),
    maxTokens: 3600,
    temperature: 0.3,
  });
}

export async function reviewReadingCard(
  provider: LlmProvider,
  agent: Agent,
  input: ReviewReadingCardInput,
): Promise<ReviewReadingCardResult> {
  const system = `${agent.soul}\n\n你是 Yomitomo 的读后回执审阅助手。你要审当前回执和证据之间的关系，重点检查事实归因、证据链、读者声音、压缩质量和后续行动价值。保持你的审核倾向，但输出必须克制、可执行、能回到原文或证据单元。`;
  const rawResponse = await callProviderText(
    provider,
    {
      system,
      user: buildReviewReadingCardPrompt(provider, input),
      maxTokens: 6000,
      temperature: agent.temperature,
    },
    { failOnMaxTokens: true },
  );
  return normalizeReadingCardReviewResponse(rawResponse);
}

function buildReadingCardPrompt(provider: LlmProvider, input: GenerateReadingCardInput) {
  const article = {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  };
  const evidenceUnits = receiptIncludedEvidenceUnits(input.evidenceUnits, input.receiptDecisions);
  const evidence = readingCardPromptEvidence(evidenceUnits);
  const questions = buildReadingQuestions(input.article)
    .filter(
      (question) =>
        receiptDecisionForEvidence(input.receiptDecisions, question.annotationId) !== 'exclude',
    )
    .map((question) => ({
      id: question.id,
      status: question.status,
      author: question.authorLabel,
      text: question.text,
      quote: question.quote,
    }));
  const receiptDecisions = readingReceiptDecisionPrompt(input.receiptDecisions);
  const deliberation = input.readingDeliberation
    ? {
        id: input.readingDeliberation.id,
        markdown: input.readingDeliberation.contentMarkdown,
        sections: input.readingDeliberation.sections,
      }
    : null;
  const articleText = budgetArticleText(provider, 'reading-card', input.articleText);
  const evidenceJson = budgetEvidenceJson('reading-card', evidence);
  const deliberationJson = deliberation
    ? budgetDeliberationJson('reading-card', deliberation)
    : { text: '暂无', report: null };
  const budgetNotice = formatBudgetNotice(
    [articleText.report, evidenceJson.report, deliberationJson.report].filter(
      (report) => report !== null,
    ),
  );

  return `请基于全文和证据单元生成一份中文 Markdown 读后回执。

文章信息：
${JSON.stringify(article, null, 2)}

${budgetNotice}

全文：
${articleText.text}

证据单元：
${evidenceJson.text}

本次收束选择：
${receiptDecisions}

问题状态：
${JSON.stringify(questions, null, 2)}

阅读审议：
${deliberationJson.text}

输出要求：
- 直接输出 Markdown，不要输出代码块。
- 不要写“文章快照”。
- 不要复述全文概要。
- 这不是文章总结，而是交代这次阅读痕迹被如何处理。
- 每条关键判断尽量标注证据编号，例如 [#1]。
- 保留读者自己的关注点，标明“我”或读者昵称。
- 助手观点和文章观点分开表达。
- 如果有阅读审议，优先吸收其中的共识、分歧、证据强弱和未决问题。
- 保留未决问题状态：open 作为待推进问题，answered 作为已收束问题，parked 作为暂不推进问题。
- 对重要证据单元说明处理结果：纳入回执、继续追问、暂放、证据不足。
- 尊重“本次收束选择”：include 可以进入回执主判断；question 只能作为待追问/未收束问题；exclude 不要写入回执。
- 内容要精炼、有层次，适合作为读完这篇文章后的回看入口。

固定结构：
# ${input.article.title}

## 一句话带走
用 1 句话写出这次阅读最后留下的判断；不是全文摘要，也不是文章标题改写。

## 我停下来的地方
按阅读现场整理读者批注、用户评论、助手批注和讨论 thread。优先写“我在哪里停下、为什么停下、谁推动了理解变化、这条痕迹最后如何处理”。

## 改变 / 确认 / 怀疑
### 改变
写 1 条这篇文章改变了什么看法；没有证据就写“暂无”。

### 确认
写 1 条这篇文章确认了什么已有判断；没有证据就写“暂无”。

### 怀疑
写 1 条这篇文章让我仍然怀疑什么；没有证据就写“暂无”。

## 还没收束的问题
列出 open、answered、parked 问题。用“还想追问 / 已经想通 / 先放一放”表达状态。

## 可保存成稿
整理一份可以复制到笔记工具的短成稿。只放已经纳入回执的判断，保留必要证据编号，避免冗长。`;
}

function buildReadingDeliberationPrompt(
  provider: LlmProvider,
  input: GenerateReadingDeliberationInput,
) {
  const article = {
    title: input.article.title,
    url: input.article.canonicalUrl || input.article.url,
    byline: input.article.byline || '',
    excerpt: input.article.excerpt || '',
  };
  const evidenceUnits = receiptIncludedEvidenceUnits(input.evidenceUnits, input.receiptDecisions);
  const evidence = readingCardPromptEvidence(evidenceUnits);
  const questions = buildReadingQuestions(input.article)
    .filter(
      (question) =>
        receiptDecisionForEvidence(input.receiptDecisions, question.annotationId) !== 'exclude',
    )
    .map((question) => ({
      id: question.id,
      status: question.status,
      author: question.authorLabel,
      text: question.text,
      quote: question.quote,
    }));
  const receiptDecisions = readingReceiptDecisionPrompt(input.receiptDecisions);
  const articleText = budgetArticleText(provider, 'reading-deliberation', input.articleText);
  const evidenceJson = budgetEvidenceJson('reading-deliberation', evidence);
  const budgetNotice = formatBudgetNotice([articleText.report, evidenceJson.report]);

  return `请生成一份中文 Markdown 阅读审议。

文章信息：
${JSON.stringify(article, null, 2)}

${budgetNotice}

全文：
${articleText.text}

证据单元：
${evidenceJson.text}

本次收束选择：
${receiptDecisions}

问题状态：
${JSON.stringify(questions, null, 2)}

输出要求：
- 直接输出 Markdown，不要输出代码块。
- 每个关键判断尽量标注证据编号，例如 [#1]。
- 区分文章观点、读者关注、助手补充和评论 thread。
- 聚焦这场阅读讨论形成了什么判断，避免复述全文。
- 对证据薄弱、归因不清或仍需验证的内容明确指出。
- 单独汇总问题状态：open 是未决问题，answered 是已回答问题，parked 是搁置问题。
- 明确告诉后续回执生成：哪些痕迹可以直接纳入，哪些需要用户回到批注补一句判断。
- 尊重“本次收束选择”：include 进入共识/证据强弱；question 进入未决问题；exclude 不进入本次审议。

固定结构：
# ${input.article.title}｜阅读审议

## 共识
整理文章、读者和助手之间已经形成的主要共识。

## 分歧与张力
整理不同批注或评论之间的分歧、冲突、可挑战前提。

## 证据强弱
列出证据较强的判断和证据较弱的判断，说明依据。

## 未决问题
优先列出 open 问题，并简要说明对应证据；再用短句概括 answered 和 parked 问题。

## 给读后回执的建议
说明生成回执时应该保留、压缩或谨慎处理的内容。`;
}

function buildReviewReadingCardPrompt(provider: LlmProvider, input: ReviewReadingCardInput) {
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
  const evidence = readingCardPromptEvidence(input.evidenceUnits);
  const articleText = budgetArticleText(provider, 'reading-card-review', input.articleText);
  const evidenceJson = budgetEvidenceJson('reading-card-review', evidence);
  const cardJson = budgetReadingCardJson('reading-card-review', card);
  const budgetNotice = formatBudgetNotice([
    articleText.report,
    evidenceJson.report,
    cardJson.report,
  ]);

  return `请审核这份读后回执，返回一个 JSON 对象。

文章信息：
${JSON.stringify(article, null, 2)}

${budgetNotice}

全文：
${articleText.text}

证据单元：
${evidenceJson.text}

读后回执：
${cardJson.text}

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
      "section": "一句话带走",
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
- 文本字段里引用证据时统一写成 [#1] 这种格式；evidenceIds 仍返回数字数组。
- findings 最多 6 条，acceptedClaims 最多 4 条，missingAngles 最多 4 条。
- 只输出 JSON 对象，不要输出 Markdown。`;
}

function receiptIncludedEvidenceUnits(
  evidenceUnits: ReadingCardEvidenceUnit[],
  decisions: ReadingReceiptDecision[] | undefined,
) {
  return evidenceUnits.filter(
    (unit) => receiptDecisionForEvidence(decisions, unit.id) !== 'exclude',
  );
}

function receiptDecisionForEvidence(
  decisions: ReadingReceiptDecision[] | undefined,
  evidenceId: string,
) {
  return (
    decisions?.find((decision) => decision.evidenceId === evidenceId)?.disposition || 'include'
  );
}

function readingReceiptDecisionPrompt(decisions: ReadingReceiptDecision[] | undefined) {
  if (!decisions?.length) return '未指定，默认全部纳入本次收束。';
  return JSON.stringify(
    decisions.map((decision) => ({
      evidenceId: decision.evidenceId,
      evidenceIndex: decision.evidenceIndex,
      disposition: decision.disposition,
    })),
    null,
    2,
  );
}

function readingCardPromptEvidence(evidenceUnits: ReadingCardEvidenceUnit[]) {
  return evidenceUnits.map((unit) => ({
    id: unit.index,
    type: unit.annotationType || '批注',
    questionStatus: unit.questionStatus || '',
    quote: unit.quote,
    annotationAuthor: unit.annotationAuthorLabel,
    annotationBody: unit.annotationBody
      ? {
          author: unit.annotationBody.authorLabel,
          questionStatus: unit.annotationBody.questionStatus || '',
          content: unit.annotationBody.content,
        }
      : null,
    comments: unit.comments.map((comment) => ({
      author: comment.authorLabel,
      questionStatus: comment.questionStatus || '',
      content: comment.content,
    })),
  }));
}

function normalizeReadingCardReviewResponse(rawResponse: string): ReviewReadingCardResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObject(rawResponse);
  } catch (error) {
    logAiError('reading_card.review.parse_error', error, {
      rawLength: rawResponse.length,
      rawPreview: rawResponse.slice(0, 1200),
      rawTail: rawResponse.slice(-500),
    });
    return {
      status: 'error',
      verdict: 'revise',
      summary: '审阅助手返回的内容格式异常，已保留原始输出供排查。',
      findings: [
        {
          section: '整份回执',
          severity: 'high',
          problem: '审阅结果 JSON 解析失败，当前这位审阅助手的结构化结论无法可靠读取。',
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
