import { describe, expect, it } from 'vitest';
import type { Agent } from '@yomitomo/shared';
import { buildEpubBookIndex, epubIndexText } from '@yomitomo/core';
import {
  annotationDensityInstruction,
  annotationDensityMax,
  createAgentAnnotation,
  parseAnnotationSuggestions,
} from '../index';

const agent: Agent = {
  id: 'agent-1',
  kind: 'annotation',
  providerId: 'provider-1',
  nickname: '阅读伙伴',
  username: 'reader',
  avatar: '',
  annotationColor: '#8ab6d6',
  annotationDensity: 'medium',
  enabled: true,
  temperature: 0.35,
  soul: 'test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('agent annotation generation', () => {
  it('creates agent annotations from exact article text', () => {
    const result = createAgentAnnotation(
      agent,
      'A first principles note.',
      { exact: 'first principles', comment: 'good point', readingIntent: 'explain' },
      '2026-01-02T00:00:00.000Z',
    );

    expect(result?.author).toBe('ai');
    expect(result?.annotationType).toBe('key_point');
    expect(result?.readingIntent).toBe('explain');
    expect(result?.anchor.start).toBe(2);
    expect(result?.comments[0]?.content).toBe('good point');
    expect(result?.comments[0]?.readingIntent).toBe('explain');
  });

  it('returns null when agent suggestion cannot be anchored', () => {
    expect(
      createAgentAnnotation(agent, 'A first principles note.', {
        exact: 'missing text',
        comment: 'good point',
      }),
    ).toBeNull();
  });

  it('anchors repeated agent suggestion text with prefix and suffix context', () => {
    const result = createAgentAnnotation(
      agent,
      'Alpha target closes one thought. Beta target opens the useful thought.',
      {
        exact: 'target',
        prefix: 'Beta ',
        suffix: ' opens',
        comment: 'second target is the useful one',
      },
      '2026-01-02T00:00:00.000Z',
    );

    expect(result?.anchor.start).toBe(38);
    expect(result?.anchor.prefix).toContain('Beta ');
    expect(result?.comments[0]?.content).toBe('second target is the useful one');
  });

  it('anchors agent suggestions inside an allowed text range', () => {
    const articleText = '外部 target 不应使用。内部 target 才能批注。';
    const allowedTextStart = articleText.indexOf('内部');
    const events: Array<{ event: string; data?: Record<string, unknown> }> = [];
    const result = createAgentAnnotation(
      agent,
      articleText,
      {
        exact: 'target',
        comment: 'inside allowed range',
      },
      '2026-01-02T00:00:00.000Z',
      {
        allowedTextStart,
        allowedTextEnd: articleText.length,
        performanceLogger: (event, data) => events.push({ event, data }),
      },
    );

    expect(result?.anchor.start).toBe(articleText.indexOf('target', allowedTextStart));
    expect(events[0]?.data).toMatchObject({
      exactMatchCount: 1,
      allowedExactMatchCount: 1,
    });
  });

  it('anchors repeated agent suggestion text from a context window', () => {
    const result = createAgentAnnotation(
      agent,
      'Alpha target closes one thought. Beta target opens the useful thought.',
      {
        exact: 'target',
        context: 'Beta target opens',
        comment: 'context selects the second target',
      },
      '2026-01-02T00:00:00.000Z',
    );

    expect(result?.anchor.start).toBe(38);
  });

  it('creates paragraph-aware anchors for EPUB agent annotations', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['第一段目标。', '第二段目标。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const result = createAgentAnnotation(
      agent,
      text,
      {
        exact: '第二段',
        comment: 'second paragraph',
      },
      '2026-01-02T00:00:00.000Z',
      { ebookIndex: index },
    );

    expect(result?.anchor).toMatchObject({
      paragraphId: 'chapter-1-paragraph-2',
      chapterId: 'chapter-1',
      segmentId: 'chapter-1-segment-1',
      textStartInParagraph: 0,
    });
  });

  it('rejects EPUB agent anchors outside allowed core paragraphs', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['第一段目标。', '第二段目标。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const result = createAgentAnnotation(
      agent,
      text,
      {
        exact: '第一段',
        comment: 'outside core paragraph',
      },
      '2026-01-02T00:00:00.000Z',
      {
        ebookIndex: index,
        allowedTextStart: index.paragraphs[1].textStart,
        allowedTextEnd: index.paragraphs[1].textEnd,
        allowedParagraphIds: [index.paragraphs[1].id],
      },
    );

    expect(result).toBeNull();
  });

  it('stores segment annotation system fields on agent annotations', () => {
    const result = createAgentAnnotation(
      agent,
      '关键句值得讨论。',
      {
        exact: '关键句',
        comment: 'note',
        moveType: 'surface_assumption',
        whyHere: '这里暴露了隐含前提。',
        evidenceUsed: ['localText', 'trace'],
        confidence: 'high',
        shouldShow: true,
      },
      '2026-01-02T00:00:00.000Z',
    );

    expect(result).toMatchObject({
      moveType: 'surface_assumption',
      whyHere: '这里暴露了隐含前提。',
      evidenceUsed: ['localText', 'trace'],
      confidence: 'high',
      shouldShow: true,
    });
  });

  it('anchors model suggestions when whitespace differs from article text', () => {
    const result = createAgentAnnotation(
      agent,
      '工具一旦进入手里，也会进入脑子。能力会反过来定义问题。\n知道什么时候不敲，是一种对冲工具偏见的能力。',
      {
        exact:
          '工具一旦进入手里，也会进入脑子。能力会反过来定义问题。 知道什么时候不敲，是一种对冲工具偏见的能力。',
        comment: 'whitespace differs',
      },
      '2026-01-02T00:00:00.000Z',
    );

    expect(result?.anchor.exact).toContain('\n知道什么时候不敲');
  });

  it('limits whitespace-insensitive agent matching to the allowed text range', () => {
    const repeated =
      '工具一旦进入手里，也会进入脑子。能力会反过来定义问题。\n知道什么时候不敲，是一种对冲工具偏见的能力。';
    const articleText = `外部 ${repeated}\n内部 ${repeated}`;
    const allowedTextStart = articleText.indexOf('内部');
    const events: Array<{ event: string; data?: Record<string, unknown> }> = [];
    const result = createAgentAnnotation(
      agent,
      articleText,
      {
        exact:
          '工具一旦进入手里，也会进入脑子。能力会反过来定义问题。 知道什么时候不敲，是一种对冲工具偏见的能力。',
        comment: 'inside allowed range',
      },
      '2026-01-02T00:00:00.000Z',
      {
        allowedTextStart,
        allowedTextEnd: articleText.length,
        performanceLogger: (event, data) => events.push({ event, data }),
      },
    );

    expect(result?.anchor.start).toBe(articleText.indexOf('工具', allowedTextStart));
    expect(events[0]?.data).toMatchObject({
      exactMatchCount: 0,
      whitespaceInsensitiveMatchCount: 1,
      allowedWhitespaceInsensitiveMatchCount: 1,
    });
  });

  it('anchors the longest recoverable fragment when a model uses ellipses', () => {
    const result = createAgentAnnotation(
      agent,
      '朴素 RAG 并不总是有效：\n对于频繁变更的代码库而言，为其建立向量和全文索引的成本会自然放大，而且由于存在分块等处理逻辑。\n另一个严重的问题在于语义的难以弥合。',
      {
        exact:
          '朴素 RAG 并不总是有效：对于频繁变更的代码库而言，为其建立向量和全文索引的成本会自然放大...另一个严重的问题在于语义的难以弥合。',
        comment: 'ellipsis differs',
      },
      '2026-01-02T00:00:00.000Z',
    );

    expect(result?.anchor.exact).toBe(
      '朴素 RAG 并不总是有效：\n对于频繁变更的代码库而言，为其建立向量和全文索引的成本会自然放大',
    );
  });

  it('parses agent annotation suggestions with context fields', () => {
    expect(
      parseAnnotationSuggestions(
        '[{"exact":"target","prefix":"Beta ","suffix":" opens","context":"Beta target opens","type":"quote","readingIntent":"challenge","comment":"note"}]',
      ),
    ).toEqual([
      {
        exact: 'target',
        prefix: 'Beta ',
        suffix: ' opens',
        context: 'Beta target opens',
        annotationType: 'quote',
        readingIntent: 'challenge',
        comment: 'note',
      },
    ]);
  });

  it('parses segment annotation metadata fields', () => {
    expect(
      parseAnnotationSuggestions(
        '[{"exact":"target","comment":"note","moveType":"challenge_argument","whyHere":"关键跳跃","evidenceUsed":["localText","trace","unknown"],"confidence":"medium","shouldShow":true}]',
      ),
    ).toEqual([
      {
        exact: 'target',
        prefix: undefined,
        suffix: undefined,
        context: undefined,
        annotationType: null,
        readingIntent: null,
        comment: 'note',
        moveType: 'challenge_argument',
        whyHere: '关键跳跃',
        evidenceUsed: ['localText', 'trace'],
        confidence: 'medium',
        shouldShow: true,
      },
    ]);
  });

  it('normalizes annotation density instructions', () => {
    expect(annotationDensityInstruction('low', '短文')).toContain('最多 1 条');
    expect(annotationDensityInstruction('medium', '短文')).toContain('最多 1 条');
    expect(annotationDensityInstruction('high', '短文')).toContain('最多 2 条');
    expect(annotationDensityMax('medium', '长文'.repeat(1200))).toBe(5);
  });
});
