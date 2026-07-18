import { providerPresets, type LlmProvider, type ProviderPreset } from '@yomitomo/shared';

export type ModelInputTask = 'agent-message' | 'agent-annotate';

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
};

export function budgetArticleText(
  provider: LlmProvider,
  task: ModelInputTask,
  text: string,
): { text: string; report: ModelBudgetReport } {
  return budgetText(
    task,
    'articleText',
    text,
    TASK_ARTICLE_BUDGETS[task] * articleTextBudgetFactor(provider),
  );
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
    return 'Model context limit exceeded. Use a larger-context model, narrow the article scope, or reduce annotation evidence and try again.';
  }
  return `Anthropic request failed: ${status} ${body.slice(0, 400)}`;
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
      report: {
        task,
        field,
        originalChars: text.length,
        includedChars: text.length,
        compressed: false,
      },
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

function articleTextBudgetFactor(provider: LlmProvider) {
  const preset = resolveBudgetPreset(provider);
  const modelFactor = preset?.articleTextBudget.modelFactors?.[provider.modelName.toLowerCase()];
  return modelFactor ?? preset?.articleTextBudget.defaultFactor ?? 0.75;
}

function resolveBudgetPreset(provider: LlmProvider): ProviderPreset | undefined {
  const configuredPreset = providerPresets.find((preset) => preset.id === provider.presetId);
  if (configuredPreset) return configuredPreset;

  const protocolPresets = providerPresets.filter((preset) => preset.type === provider.type);
  return protocolPresets.length === 1 ? protocolPresets[0] : undefined;
}
