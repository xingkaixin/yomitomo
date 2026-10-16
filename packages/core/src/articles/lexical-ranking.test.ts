import { describe, expect, it } from 'vitest';
import { lexicalDocument, rankLexicalDocuments } from './lexical-ranking';

function documents(texts: string[]) {
  return texts.flatMap((text) => {
    const document = lexicalDocument(text);
    return document ? [{ ...document, text }] : [];
  });
}

describe('rankLexicalDocuments', () => {
  it('ranks CJK paragraphs by BM25 with a phrase bonus', () => {
    const ranked = rankLexicalDocuments(
      documents(['制度惯性第一次出现。', '制度惯性继续影响决策。', '这里再次讨论制度惯性。']),
      '制度惯性 影响',
    );

    expect(ranked.map((document) => document.text)).toEqual([
      '制度惯性继续影响决策。',
      '制度惯性第一次出现。',
      '这里再次讨论制度惯性。',
    ]);
    expect(ranked.map((document) => Number(document.score.toFixed(4)))).toEqual([
      2.0035, 0.6852, 0.6677,
    ]);
  });

  it('ignores queries made only of stop terms', () => {
    expect(rankLexicalDocuments(documents(['这里讨论人口红利。']), '这里 哪里 什么')).toEqual([]);
  });
});
