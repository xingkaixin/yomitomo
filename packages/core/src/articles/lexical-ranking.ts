const BM25_K1 = 1.2;
const BM25_B = 0.75;

export type LexicalDocument = {
  normalizedText: string;
  terms: Map<string, number>;
  length: number;
};

export function lexicalDocument(text: string): LexicalDocument | null {
  const normalizedText = normalizeLexicalText(text);
  const terms = termCounts(tokenizeNormalizedLexicalText(normalizedText));
  return terms.size > 0 ? { normalizedText, terms, length: tokenLength(terms) } : null;
}

export function rankLexicalDocuments<T extends LexicalDocument>(documents: T[], query: string) {
  const queries = queryTexts(query);
  const queryTerms = termCounts(queries.flatMap(tokenizeLexicalText));
  if (queryTerms.size === 0 || documents.length === 0) return [];
  return scoreDocuments(documents, queryTerms, queries).toSorted(
    (left, right) => right.score - left.score,
  );
}

function queryTexts(query: string) {
  const text = query.replace(/\s+/g, ' ').trim();
  return text ? [text] : [];
}

function scoreDocuments<T extends LexicalDocument>(
  documents: T[],
  queryTerms: Map<string, number>,
  queryPhrases: string[],
): Array<T & { score: number; matchedTerms: string[] }> {
  const avgLength =
    documents.reduce((total, document) => total + document.length, 0) / documents.length || 1;
  const documentFrequency = documentFrequencyForQueryTerms(documents, queryTerms);
  const normalizedQueryPhrases = queryPhrases
    .map(normalizeLexicalText)
    .filter((phrase) => phrase.length >= 2 && phrase.length <= 40);

  return documents.flatMap((document) => {
    let score = 0;
    const matchedTerms: string[] = [];
    for (const [term, queryCount] of queryTerms) {
      const count = document.terms.get(term) || 0;
      if (count === 0) continue;
      matchedTerms.push(term);
      const frequency = documentFrequency.get(term) || 0;
      const idf = Math.log(1 + (documents.length - frequency + 0.5) / (frequency + 0.5));
      const normalized =
        (count * (BM25_K1 + 1)) /
        (count + BM25_K1 * (1 - BM25_B + BM25_B * (document.length / avgLength)));
      score += idf * normalized * Math.sqrt(queryCount);
    }

    const phraseBonus = normalizedQueryPhrases.reduce(
      (total, phrase) => total + phraseMatchBonus(document.normalizedText, phrase),
      0,
    );
    const finalScore = score + phraseBonus;
    return finalScore > 0
      ? [
          {
            ...document,
            score: finalScore,
            matchedTerms,
          },
        ]
      : [];
  });
}

function documentFrequencyForQueryTerms(
  documents: LexicalDocument[],
  queryTerms: Map<string, number>,
) {
  const queryTermSet = new Set(queryTerms.keys());
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const term of document.terms.keys()) {
      if (!queryTermSet.has(term)) continue;
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }
  return documentFrequency;
}

function phraseMatchBonus(normalizedText: string, normalizedPhrase: string) {
  return normalizedText.includes(normalizedPhrase) ? 1.2 : 0;
}

function tokenizeLexicalText(text: string) {
  return tokenizeNormalizedLexicalText(normalizeLexicalText(text));
}

function tokenizeNormalizedLexicalText(normalizedText: string) {
  const tokens: string[] = [];
  let ascii = '';
  let cjk = '';
  const flushAscii = () => {
    if (ascii.length >= 2 && !STOP_TERMS.has(ascii)) tokens.push(ascii);
    ascii = '';
  };
  const flushCjk = () => {
    tokens.push(...cjkTokens(cjk));
    cjk = '';
  };

  for (const rawChar of normalizedText) {
    if (isAsciiWordChar(rawChar)) {
      flushCjk();
      ascii += rawChar;
      continue;
    }
    if (isCjk(rawChar)) {
      flushAscii();
      cjk += rawChar;
      continue;
    }
    flushAscii();
    flushCjk();
  }
  flushAscii();
  flushCjk();
  return tokens;
}

function cjkTokens(text: string) {
  if (text.length < 2) return [];
  const tokens: string[] = [];
  if (text.length <= 8 && !STOP_TERMS.has(text)) tokens.push(text);
  for (const size of [2, 3]) {
    for (let index = 0; index <= text.length - size; index += 1) {
      const token = text.slice(index, index + size);
      if (!STOP_TERMS.has(token)) tokens.push(token);
    }
  }
  return tokens;
}

function termCounts(tokens: string[]) {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function tokenLength(terms: Map<string, number>) {
  return Array.from(terms.values()).reduce((total, count) => total + count, 0);
}

function normalizeLexicalText(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isAsciiWordChar(char: string) {
  return /^[a-z0-9]$/.test(char);
}

function isCjk(char: string) {
  const code = char.codePointAt(0) || 0;
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

const STOP_TERMS = new Set([
  '一个',
  '这个',
  '那个',
  '这些',
  '那些',
  '我们',
  '他们',
  '你们',
  '它们',
  '可以',
  '因为',
  '所以',
  '但是',
  '如果',
  '不是',
  '就是',
  '以及',
  '或者',
  '关于',
  '什么',
  '哪里',
  '这里',
  '那里',
  '前面',
  '提过',
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
]);
