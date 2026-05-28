export type NormalizedAiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
};

export function normalizeAiUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  inputTokenDetails?: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  outputTokenDetails?: {
    reasoningTokens?: number;
  };
}): NormalizedAiUsage {
  return compactUsage({
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
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
