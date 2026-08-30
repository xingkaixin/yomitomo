import { describe, expect, it } from 'vitest';
import * as ai from './index';

describe('@yomitomo/ai public exports', () => {
  it('exposes only the desktop runtime interface', () => {
    expect(Object.keys(ai).toSorted()).toEqual([
      'bilingualTranslationPromptVersion',
      'listProviderModels',
      'planAgentMentionRoute',
      'runAgentAnnotateStream',
      'runAgentDistillationReviewStructuredStream',
      'runAgentReview',
      'runAgentStream',
      'runAgentToolLoopTask',
      'runReadingJudgment',
      'setAiLogger',
      'testProvider',
      'translateBilingualArticleBlocks',
    ]);
  });
});
