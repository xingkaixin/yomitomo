import { describe, expect, it } from 'vitest';
import type { Agent, Annotation, ArticleRecord } from '@yomitomo/shared';
import {
  builtinDailyQuotes,
  collectDailyQuoteCandidates,
  formatDailyQuoteDate,
  selectDailyQuote,
} from '../app-daily-quote';

const now = new Date('2026-05-08T10:00:00.000+08:00');

function memoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

function article(annotations: Annotation[] = []): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com',
    canonicalUrl: 'https://example.com',
    title: '文章',
    contentHash: 'hash_1',
    annotations,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function quoteAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  const createdAt = overrides.createdAt || '2026-05-03T12:00:00.000+08:00';

  return {
    id: overrides.id || 'annotation_1',
    author: overrides.author || 'user',
    annotationType: 'quote',
    anchor: {
      exact: '把判断写下来，时间会帮你校准它。',
      prefix: '',
      suffix: '',
      start: 0,
      end: 16,
    },
    color: '#f4c95d',
    comments: [],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function assistant(overrides: Partial<Agent> = {}): Agent {
  const createdAt = overrides.createdAt || now.toISOString();

  return {
    id: overrides.id || 'agent_1',
    kind: overrides.kind || 'annotation',
    enabled: overrides.enabled ?? true,
    providerId: overrides.providerId || 'provider_1',
    nickname: overrides.nickname || '知微',
    username: overrides.username || 'lin_zhiwei',
    avatar: overrides.avatar || 'avatar_1',
    annotationColor: overrides.annotationColor || '#6fa48f',
    annotationDensity: overrides.annotationDensity || 'medium',
    temperature: overrides.temperature ?? 0.35,
    soul: overrides.soul || '',
    createdAt,
    updatedAt: overrides.updatedAt || createdAt,
    ...overrides,
  };
}

describe('daily quote', () => {
  it('keeps the same quote during a day', () => {
    const storage = memoryStorage();
    const first = selectDailyQuote([], { now, random: () => 0, storage });
    const second = selectDailyQuote([], { now, random: () => 0.9, storage });

    expect(first).toEqual(second);
    expect(first).toEqual({
      title: '今日一句',
      meta: '',
      text: builtinDailyQuotes[0].text,
    });
  });

  it('rotates through unseen builtin quotes first', () => {
    const storage = memoryStorage();

    const first = selectDailyQuote([], { now, random: () => 0, storage });
    const second = selectDailyQuote([], {
      now: new Date('2026-05-09T10:00:00.000+08:00'),
      random: () => 0,
      storage,
    });

    expect(first.text).toBe(builtinDailyQuotes[0].text);
    expect(second.text).toBe(builtinDailyQuotes[1].text);
  });

  it('keeps the same assistant avatar during a day', () => {
    const storage = memoryStorage();
    const agents = [
      assistant({ id: 'agent_1', nickname: '知微', avatar: 'avatar_1' }),
      assistant({ id: 'agent_2', kind: 'review', nickname: '唐简', avatar: 'avatar_2' }),
    ];

    const first = selectDailyQuote([], { now, random: () => 0, storage, agents });
    const second = selectDailyQuote([], { now, random: () => 0.9, storage, agents });

    expect(first.assistant).toEqual({
      id: 'agent_1',
      kind: 'annotation',
      name: '知微',
      avatar: 'avatar_1',
    });
    expect(second.assistant).toEqual(first.assistant);
  });

  it('avoids repeating yesterday assistant when possible', () => {
    const storage = memoryStorage();
    const agents = [
      assistant({ id: 'agent_1', nickname: '知微', avatar: 'avatar_1' }),
      assistant({ id: 'agent_2', kind: 'review', nickname: '唐简', avatar: 'avatar_2' }),
    ];

    const first = selectDailyQuote([], { now, random: () => 0, storage, agents });
    const second = selectDailyQuote([], {
      now: new Date('2026-05-09T10:00:00.000+08:00'),
      random: () => 0,
      storage,
      agents,
    });

    expect(first.assistant?.id).toBe('agent_1');
    expect(second.assistant?.id).toBe('agent_2');
  });

  it('uses personal quote annotations after the threshold is reached', () => {
    const quote = quoteAnnotation({
      comments: [
        {
          id: 'comment_1',
          author: 'user',
          content: 'review 的价值在于把盲区往外推。',
          createdAt: '2026-05-03T12:00:00.000+08:00',
        },
      ],
    });

    const selected = selectDailyQuote([article([quote])], {
      now,
      random: () => 0,
      storage: memoryStorage(),
      personalThreshold: 1,
    });

    expect(selected).toEqual({
      title: '今日一句',
      meta: '5/3 记下',
      text: 'review 的价值在于把盲区往外推。',
    });
  });

  it('labels agent quotes with the agent name', () => {
    const quote = quoteAnnotation({
      author: 'ai',
      agentNickname: '知微',
      createdAt: '2025-12-31T23:30:00.000+08:00',
      comments: [
        {
          id: 'comment_1',
          author: 'ai',
          content: '把判断留下来，未来才有机会校准。',
          createdAt: '2025-12-31T23:30:00.000+08:00',
        },
      ],
    });

    const selected = selectDailyQuote([article([quote])], {
      now,
      random: () => 0,
      storage: memoryStorage(),
      personalThreshold: 1,
    });

    expect(selected).toEqual({
      title: '今日一句',
      meta: '来自知微 · 2025/12/31 记下',
      text: '把判断留下来，未来才有机会校准。',
    });
  });

  it('collects only quote annotations with displayable length', () => {
    const candidates = collectDailyQuoteCandidates([
      article([
        quoteAnnotation({ id: 'quote_1' }),
        quoteAnnotation({ id: 'key_1', annotationType: 'key_point' }),
        quoteAnnotation({
          id: 'long_1',
          anchor: { exact: '长'.repeat(80), prefix: '', suffix: '' },
        }),
      ]),
    ]);

    expect(candidates.map((candidate) => candidate.id)).toEqual(['annotation:quote_1']);
  });

  it('formats current-year dates as month and day', () => {
    expect(formatDailyQuoteDate('2026-01-02T00:00:00.000+08:00', now)).toBe('1/2');
    expect(formatDailyQuoteDate('2025-12-31T23:30:00.000+08:00', now)).toBe('2025/12/31');
  });
});
