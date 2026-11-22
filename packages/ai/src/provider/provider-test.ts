import type { LlmProvider } from '@yomitomo/shared';
import { generateYomitomoText } from './generation-runtime';
import { piThinkingLevel } from './pi-provider';

export async function testProvider(
  provider: LlmProvider,
): Promise<{ ok: boolean; message: string }> {
  try {
    const level = piThinkingLevel(provider);
    const thinks = level !== undefined && level !== 'off';
    const { text } = await generateYomitomoText(provider, {
      system: 'You are a connectivity test assistant.',
      user: 'Reply with OK only.',
      // Reasoning and gateway models can spend tokens on thinking before replying.
      maxTokens:
        thinks || provider.presetId === 'openrouter' || provider.presetId === 'vercel' ? 2048 : 128,
    });
    return { ok: true, message: text };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Provider test failed' };
  }
}
