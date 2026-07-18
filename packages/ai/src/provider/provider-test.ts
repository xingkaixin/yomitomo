import type { LlmProvider } from '@yomitomo/shared';
import { generateYomitomoText } from './generation-runtime';

export async function testProvider(
  provider: LlmProvider,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { text } = await generateYomitomoText(provider, {
      system: 'You are a connectivity test assistant.',
      user: 'Reply with OK only.',
      maxTokens: 128,
    });
    return { ok: true, message: text };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Provider test failed' };
  }
}
