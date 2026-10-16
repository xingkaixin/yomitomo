import type { Usage } from '@earendil-works/pi-ai';

export type NormalizedAiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
};

export function normalizePiUsage(usage: Usage): NormalizedAiUsage {
  return compactUsage({
    inputTokens: usage.input,
    outputTokens: usage.output,
    reasoningTokens: usage.reasoning,
    cachedInputTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    totalTokens: usage.totalTokens,
  });
}

function compactUsage(usage: NormalizedAiUsage): NormalizedAiUsage {
  return Object.fromEntries(
    Object.entries(usage).filter(
      ([, value]) => typeof value === 'number' && Number.isFinite(value),
    ),
  ) as NormalizedAiUsage;
}
