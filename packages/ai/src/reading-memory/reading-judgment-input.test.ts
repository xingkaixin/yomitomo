import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LlmProvider, ReadingEvidence, ReadingJudgmentInput } from '@yomitomo/shared';
import * as budget from '../provider/budget';
import { prepareReadingJudgmentInput } from './reading-judgment-input';

afterEach(() => vi.restoreAllMocks());

describe('reading judgment input', () => {
  it('sends only the need-evidence flag from review metadata without exporting review dates or history', () => {
    const items = (['need_evidence', 'still_agree', 'changed'] as const).map((decision) =>
      evidence(decision, {
        review: { decision, reviewedAt: 'private-review-date' },
      }),
    );
    const result = prepareReadingJudgmentInput(
      provider(),
      { kind: 'library-answer', question: 'What remains uncertain?' },
      items,
    );
    expect(result).not.toBeNull();
    if (!result) return;
    expect(JSON.parse(result.user).evidence).toEqual(
      items.map((item, index) => ({
        id: `e${index + 1}`,
        kind: 'user_judgment',
        text: item.content,
        excerpt: 'Source excerpt.',
        ...(index === 0 ? { needsEvidence: true } : {}),
      })),
    );
    expect(result.user).not.toContain('private-');
    expect(result.sent.get('e1')).toBe(items[0]);
  });

  it('sends only query and evidence text fields with truthful attribution and temporary ids', () => {
    const items = [
      evidence('user'),
      evidence('ai', { authorKind: 'ai' }),
      evidence('distillation', { assetType: 'distillation', authorKind: 'ai' }),
      evidence('source', { assetType: 'annotation', role: 'source' }),
      evidence('reviewed-distillation', { assetType: 'distillation', authorKind: 'user' }),
    ];
    const input = {
      kind: 'library-answer' as const,
      question: 'What did I conclude?',
      title: 'private-query-title',
      collectionName: 'private-collection-name',
    };
    const result = prepareReadingJudgmentInput(provider(), input, items);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(JSON.parse(result.user)).toEqual({
      kind: 'library-answer',
      input: { question: input.question },
      evidence: [
        { id: 'e1', kind: 'user_judgment', text: items[0].content, excerpt: 'Source excerpt.' },
        { id: 'e2', kind: 'ai_discussion', text: items[1].content, excerpt: 'Source excerpt.' },
        { id: 'e3', kind: 'distillation', text: items[2].content, excerpt: 'Source excerpt.' },
        { id: 'e4', kind: 'source', text: items[3].content },
        { id: 'e5', kind: 'user_judgment', text: items[4].content, excerpt: 'Source excerpt.' },
      ],
    });
    expect(result.user).not.toContain('private-');
    expect(result.truncated).toBe(false);
    items.forEach((item, index) => expect(result.sent.get(`e${index + 1}`)).toBe(item));
  });

  it.each([
    [{ kind: 'reading-relations', selection: 'A current idea.' }, 3, 3000],
    [{ kind: 'library-answer', question: 'What did I conclude?' }, 12, 6000],
    [{ kind: 'evidence-comparison', judgment: 'My current judgment.' }, 6, 4000],
  ] satisfies Array<[ReadingJudgmentInput, number, number]>)(
    'enforces the %j evidence and serialized byte limits with equal evidence shares',
    (input, count, byteLimit) => {
      const items = Array.from({ length: 20 }, (_, index) =>
        evidence(String(index), {
          content: 'Long evidence. '.repeat(10_000),
          review: { decision: 'need_evidence', reviewedAt: '2026-08-30T00:00:00.000Z' },
        }),
      );
      const result = prepareReadingJudgmentInput(provider(), input, items);
      expect(result).not.toBeNull();
      if (!result) return;
      const parsed = parseUser(result.user);
      expect(byteLength(result.user)).toBeLessThanOrEqual(byteLimit);
      expect(parsed.evidence).toHaveLength(count);
      expect(result.sent.size).toBe(count);
      expect(result.truncated).toBe(true);
      const lengths = parsed.evidence.map((item) => item.text.length);
      expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1);
      parsed.evidence.forEach((item, index) => {
        expect(item.text).not.toBe('');
        expect(item.id).toBe(`e${index + 1}`);
        expect(item).toHaveProperty('needsEvidence', true);
        expect(result.sent.get(item.id)).toBe(items[index]);
      });
    },
  );

  it.each([
    ['an oversized selection', { kind: 'reading-relations', selection: 'x'.repeat(1_000_000) }],
    [
      'a question without room for JSON fields',
      { kind: 'library-answer', question: 'x'.repeat(6000) },
    ],
    ['an oversized judgment', { kind: 'evidence-comparison', judgment: 'x'.repeat(4000) }],
    [
      'an oversized additional question',
      { kind: 'reading-relations', selection: 'Selected.', question: 'x'.repeat(3000) },
    ],
    ['an empty question', { kind: 'library-answer', question: '  ' }],
  ] satisfies Array<[string, ReadingJudgmentInput]>)(
    'refuses %s instead of truncating required query materials',
    (_name, input) => {
      expect(prepareReadingJudgmentInput(provider(), input, [evidence('one')])).toBeNull();
    },
  );

  it('preserves the additional question and caps paragraph content inside the total budget', () => {
    const input: ReadingJudgmentInput = {
      kind: 'reading-relations',
      selection: '当前选区。',
      question: ' How does this relate to "earlier ideas"?\nPlease compare. ',
      paragraph: '语境😀\n'.repeat(10_000),
    };
    const result = prepareReadingJudgmentInput(provider(), input, [
      evidence('one'),
      evidence('two'),
      evidence('three'),
    ]);
    expect(result).not.toBeNull();
    if (!result) return;
    const parsed = parseUser(result.user);
    expect(parsed.input.selection).toBe(input.selection);
    expect(parsed.input.question).toBe(input.question);
    expect(byteLength(JSON.stringify(parsed.input.paragraph))).toBeLessThanOrEqual(1200);
    expect(byteLength(result.user)).toBeLessThanOrEqual(3000);
    expect(parsed.evidence).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('lets the paragraph give up its space instead of dropping every evidence item', () => {
    const emptyRequestBytes = byteLength(
      JSON.stringify({ kind: 'reading-relations', input: { selection: '' }, evidence: [] }),
    );
    const selection = 'x'.repeat(3000 - emptyRequestBytes - 60);
    const result = prepareReadingJudgmentInput(
      provider(),
      { kind: 'reading-relations', selection, paragraph: 'Context. '.repeat(500) },
      [evidence('one')],
    );
    expect(result).not.toBeNull();
    if (!result) return;
    const parsed = parseUser(result.user);
    expect(parsed.input).toEqual({ selection });
    expect(parsed.evidence).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(byteLength(result.user)).toBeLessThanOrEqual(3000);
  });

  it('counts escaped JSON bytes and never splits an emoji while clipping large evidence', () => {
    const content = '中😀"\\\n\u0001\ud800'.repeat(100_000);
    const result = prepareReadingJudgmentInput(
      provider(),
      { kind: 'library-answer', question: 'Compare "ideas"\\\n中😀.' },
      [evidence('one', { content })],
    );
    expect(result).not.toBeNull();
    if (!result) return;
    const parsed = parseUser(result.user);
    const text = parsed.evidence[0].text;
    expect(content.startsWith(text)).toBe(true);
    expect(text.endsWith('\ud83d')).toBe(false);
    expect(text).toContain('\ud800');
    expect(byteLength(result.user)).toBeLessThanOrEqual(6000);
    expect(result.truncated).toBe(true);
  });

  it('drops an optional excerpt when only the first complete content character fits', () => {
    const baseBytes = byteLength(
      JSON.stringify({ kind: 'library-answer', input: { question: '' }, evidence: [] }),
    );
    const source = evidence('one', { content: '中' });
    source.location.anchor.exact = 'a';
    const question = 'x'.repeat(6000 - baseBytes - 59);
    const result = prepareReadingJudgmentInput(provider(), { kind: 'library-answer', question }, [
      source,
    ]);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(parseUser(result.user).evidence).toEqual([
      { id: 'e1', kind: 'user_judgment', text: '中' },
    ]);
    expect(result.truncated).toBe(true);
    expect(byteLength(result.user)).toBeLessThanOrEqual(6000);
  });

  it('deduplicates local ids, omits empty content, and maps only actually sent evidence', () => {
    const first = evidence('one');
    const second = evidence('two');
    const result = prepareReadingJudgmentInput(
      provider(),
      { kind: 'library-answer', question: 'Compare.' },
      [
        first,
        evidence('one', { content: 'Ignored duplicate.' }),
        evidence('empty', { content: ' \n\t ' }),
        second,
      ],
    );
    expect(result).not.toBeNull();
    if (!result) return;
    expect([...result.sent]).toEqual([
      ['e1', first],
      ['e2', second],
    ]);
    expect(result.user).not.toContain('Ignored duplicate.');
    expect(result.truncated).toBe(false);
    expect(
      prepareReadingJudgmentInput(provider(), { kind: 'library-answer', question: 'Q?' }, []),
    ).toBeNull();
    expect(
      prepareReadingJudgmentInput(provider(), { kind: 'library-answer', question: 'Q?' }, [
        evidence('empty', { content: ' ' }),
      ]),
    ).toBeNull();
  });

  it('honors a smaller existing provider budget before serializing the request', () => {
    vi.spyOn(budget, 'articleTextInputLimit').mockReturnValue(500);
    const result = prepareReadingJudgmentInput(
      provider(),
      { kind: 'library-answer', question: 'A question.' },
      [evidence('one', { content: 'Long evidence. '.repeat(1000) })],
    );
    expect(result).not.toBeNull();
    if (!result) return;
    expect(byteLength(result.user)).toBeLessThanOrEqual(500);
    expect(result.sent.size).toBe(1);
    expect(result.truncated).toBe(true);
    expect(
      prepareReadingJudgmentInput(
        provider(),
        { kind: 'library-answer', question: 'x'.repeat(500) },
        [evidence('one')],
      ),
    ).toBeNull();
  });
});

function parseUser(user: string) {
  return JSON.parse(user) as {
    kind: ReadingJudgmentInput['kind'];
    input: Record<string, string>;
    evidence: Array<{ id: string; kind: string; text: string; excerpt?: string }>;
  };
}

function byteLength(text: string) {
  return new TextEncoder().encode(text).byteLength;
}

function evidence(id: string, changes: Partial<ReadingEvidence> = {}): ReadingEvidence {
  return {
    id: `private-evidence-${id}`,
    assetType: 'comment',
    role: 'judgment',
    authorKind: 'user',
    content: 'My earlier judgment.',
    sourceVersion: 'private-source-version',
    source: {
      ref: { kind: 'article', id: 'private-article-id' },
      sourceType: 'web',
      title: 'private-title',
      byline: 'private-author',
    },
    location: {
      annotationId: 'private-annotation-id',
      commentId: 'private-comment-id',
      anchor: {
        exact: 'Source excerpt.',
        prefix: 'private-prefix',
        suffix: 'private-suffix',
        start: 12,
        end: 27,
      },
    },
    createdAt: '2026-08-30T00:00:00Z',
    updatedAt: '2026-08-30T00:00:00Z',
    ...changes,
  };
}

function provider(): LlmProvider {
  return {
    id: 'provider-test',
    name: 'Test provider',
    type: 'openai-chat',
    baseUrl: 'https://example.invalid',
    apiKey: '',
    modelName: 'test-model',
    createdAt: '2026-08-30T00:00:00Z',
    updatedAt: '2026-08-30T00:00:00Z',
  };
}
