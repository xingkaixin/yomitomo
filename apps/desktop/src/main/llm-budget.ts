import type { LlmProvider } from '@yomitomo/shared';

export type ModelInputTask =
  | 'agent-message'
  | 'agent-annotate'
  | 'reading-card'
  | 'reading-deliberation'
  | 'reading-card-review';

export type ModelBudgetReport = {
  task: ModelInputTask;
  field: string;
  originalChars: number;
  includedChars: number;
  compressed: boolean;
};

const TASK_ARTICLE_BUDGETS: Record<ModelInputTask, number> = {
  'agent-message': 30_000,
  'agent-annotate': 50_000,
  'reading-card': 50_000,
  'reading-deliberation': 50_000,
  'reading-card-review': 50_000,
};

const JSON_BUDGETS = {
  evidence: 30_000,
  deliberation: 18_000,
  readingCard: 30_000,
};

export function budgetArticleText(
  provider: LlmProvider,
  task: ModelInputTask,
  text: string,
): { text: string; report: ModelBudgetReport } {
  return budgetText(task, 'articleText', text, TASK_ARTICLE_BUDGETS[task] * modelBudgetFactor(provider));
}

export function budgetEvidenceJson(task: ModelInputTask, value: unknown) {
  return budgetText(task, 'evidenceUnits', JSON.stringify(value, null, 2), JSON_BUDGETS.evidence);
}

export function budgetDeliberationJson(task: ModelInputTask, value: unknown) {
  return budgetText(
    task,
    'readingDeliberation',
    JSON.stringify(value, null, 2),
    JSON_BUDGETS.deliberation,
  );
}

export function budgetReadingCardJson(task: ModelInputTask, value: unknown) {
  return budgetText(task, 'readingCard', JSON.stringify(value, null, 2), JSON_BUDGETS.readingCard);
}

export function formatBudgetNotice(reports: ModelBudgetReport[]) {
  const compressed = reports.filter((report) => report.compressed);
  if (compressed.length === 0) return '模型输入预算：全文与证据均未压缩。';

  const lines = compressed.map(
    (report) =>
      `- ${report.field}: ${report.originalChars} 字符压缩为 ${report.includedChars} 字符`,
  );
  return `模型输入预算：以下内容已按当前模型上下文预算压缩，原始文章保存层不受影响。\n${lines.join('\n')}`;
}

export function normalizeAnthropicError(status: number, body: string) {
  const lower = body.toLowerCase();
  if (
    status === 400 &&
    (lower.includes('context') ||
      lower.includes('token') ||
      lower.includes('too long') ||
      lower.includes('maximum'))
  ) {
    return '模型上下文超限：请换用更大上下文模型，缩小文章范围，或减少批注证据后重试。';
  }
  return `Anthropic 请求失败：${status} ${body.slice(0, 400)}`;
}

function budgetText(
  task: ModelInputTask,
  field: string,
  text: string,
  maxChars: number,
): { text: string; report: ModelBudgetReport } {
  if (text.length <= maxChars) {
    return {
      text,
      report: { task, field, originalChars: text.length, includedChars: text.length, compressed: false },
    };
  }

  const marker = `\n\n[中间内容已按模型输入预算省略：原始 ${text.length} 字符，保留 ${maxChars} 字符]\n\n`;
  const available = Math.max(0, maxChars - marker.length);
  const headChars = Math.ceil(available * 0.65);
  const tailChars = available - headChars;
  const compressed = `${text.slice(0, headChars)}${marker}${text.slice(text.length - tailChars)}`;
  return {
    text: compressed,
    report: {
      task,
      field,
      originalChars: text.length,
      includedChars: compressed.length,
      compressed: true,
    },
  };
}

function modelBudgetFactor(provider: LlmProvider) {
  const model = provider.modelName.toLowerCase();
  if (model.includes('haiku')) return 0.6;
  if (model.includes('opus') || model.includes('sonnet')) return 1;
  return 0.75;
}
