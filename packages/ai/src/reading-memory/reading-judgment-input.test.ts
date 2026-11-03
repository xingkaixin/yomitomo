import { describe, expect, it } from 'vitest';
import type { LlmProvider, ReadingEvidence, ReadingJudgmentInput } from '@yomitomo/shared';
import { prepareReadingJudgmentInput } from './reading-judgment-input';

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
