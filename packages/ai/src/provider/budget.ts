import { providerPresets, type LlmProvider, type ProviderPreset } from '@yomitomo/shared';

const ARTICLE_TEXT_BUDGET = 30_000;

export function articleTextInputLimit(provider: LlmProvider): number {
  return ARTICLE_TEXT_BUDGET * articleTextBudgetFactor(provider);
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
