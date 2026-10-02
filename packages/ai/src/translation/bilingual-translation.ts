import { Effect } from 'effect';
import type { LlmProvider } from '@yomitomo/shared';
import { parseJsonArray, stringValue } from '../json';
import { generateYomitomoTextEffect, runOptions } from '../provider/generation-runtime';

export const bilingualTranslationPromptVersion = 1;

export type BilingualTranslationBlock = {
  context?: string;
  id: string;
  text: string;
};

export type BilingualTranslationResult = {
  id: string;
  translation: string;
};

type TranslationBatchResult = {
  translations: BilingualTranslationResult[];
  inputTokens: number;
  outputTokens: number;
};

const maxBatchCharacters = 6000;

type BilingualTranslationInput = {
  provider: LlmProvider;
  blocks: BilingualTranslationBlock[];
  targetLanguage: string;
  title?: string;
  summary?: string;
};

export function translateBilingualArticleBlocks(
  input: BilingualTranslationInput,
  signal?: AbortSignal,
): Promise<TranslationBatchResult> {
  return Effect.runPromise(translateBilingualArticleBlocksEffect(input), runOptions(signal));
}

export const translateBilingualArticleBlocksEffect = Effect.fn('Translation.translateBlocks')(
  function* (input: BilingualTranslationInput) {
    const batches = batchBlocks(input.blocks, maxBatchCharacters);
    const translations: BilingualTranslationResult[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (const batch of batches) {
      const result = yield* generateYomitomoTextEffect(
        input.provider,
        {
          system: bilingualTranslationSystemPrompt(input),
          user: JSON.stringify(
            batch.map((block) => ({ id: block.id, context: block.context, text: block.text })),
            null,
            2,
          ),
          maxTokens: 4096,
          temperature: 0.2,
        },
        { failOnMaxTokens: true },
      );
      translations.push(
        ...(yield* Effect.try({
          try: () => parseTranslationResults(result.text),
          catch: (error) => error,
        })),
      );
      inputTokens += result.usage.inputTokens || 0;
      outputTokens += result.usage.outputTokens || 0;
    }

    return { translations, inputTokens, outputTokens };
  },
);

function bilingualTranslationSystemPrompt(input: {
  targetLanguage: string;
  title?: string;
  summary?: string;
}) {
  return `You are a professional ${input.targetLanguage} native translator.

Translate reading passages into ${input.targetLanguage}.

Output requirements:
1. Return only a JSON array. Do not wrap it in Markdown.
2. Each output item must be {"id": string, "translation": string}.
3. Preserve every input id exactly. Do not invent or omit ids.
4. Keep one translation per input passage.
5. Preserve proper nouns, code, URLs, commands, formulas, product names, and terms that should not be translated.
6. Keep inline HTML or inline emphasis semantics in a natural position if they appear in the input.
7. Use the optional context field only to resolve meaning. Do not translate or summarize the context itself.
8. Do not add explanations, summaries, or commentary.

Document context:
Title: ${input.title || 'Untitled'}
Summary: ${input.summary || ''}`;
}

function parseTranslationResults(text: string): BilingualTranslationResult[] {
  return parseJsonArray(text).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const id = stringValue(record.id);
    const translation = stringValue(record.translation);
    return id && translation ? [{ id, translation }] : [];
  });
}

function batchBlocks(blocks: BilingualTranslationBlock[], maxCharacters: number) {
  const batches: BilingualTranslationBlock[][] = [];
  let current: BilingualTranslationBlock[] = [];
  let currentCharacters = 0;

  for (const block of blocks) {
    const blockCharacters = block.text.length;
    if (current.length > 0 && currentCharacters + blockCharacters > maxCharacters) {
      batches.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(block);
    currentCharacters += blockCharacters;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}
