import { describe, expect, it } from 'vitest';
import type { Agent, Annotation, Comment, PublicAgent, UserProfile } from '@yomitomo/shared';
import {
  appendAnnotationComment,
  createAgentAnnotation,
  findMentionedAgents,
  getMentionQuery,
  parseAnnotationSuggestions,
  replaceMentionQuery,
  updateAnnotationComment,
} from './annotations';

const user: UserProfile = {
  id: 'user-1',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const agent: Agent = {
  id: 'agent-1',
  kind: 'annotation',
  providerId: 'provider-1',
  nickname: '阅读伙伴',
  username: 'reader',
  avatar: '',
  annotationColor: '#8ab6d6',
  annotationDensity: 'medium',
  temperature: 0.35,
  soul: 'test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function annotation(): Annotation {
  return {
    id: 'annotation-1',
    anchor: {
      exact: 'first principles',
      prefix: '',
      suffix: '',
      start: 0,
      end: 16,
    },
    author: 'user',
    color: user.annotationColor,
    userId: user.id,
    userUsername: user.username,
    userNickname: user.nickname,
    userAvatar: user.avatar,
    userAnnotationColor: user.annotationColor,
    comments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function comment(id = 'comment-1'): Comment {
  return {
    id,
    author: 'user',
    content: 'note',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('annotation core', () => {
  it('creates agent annotations from exact article text', () => {
    const result = createAgentAnnotation(
      agent,
      'A first principles note.',
      { exact: 'first principles', comment: 'good point' },
      '2026-01-02T00:00:00.000Z',
    );

    expect(result?.author).toBe('ai');
    expect(result?.annotationType).toBe('key_point');
    expect(result?.anchor.start).toBe(2);
    expect(result?.comments[0]?.content).toBe('good point');
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

  it('updates annotation comments immutably', () => {
    const base = annotation();
    const added = appendAnnotationComment([base], base.id, comment(), '2026-01-02T00:00:00.000Z');
    const updated = updateAnnotationComment(
      added!,
      base.id,
      'comment-1',
      (item) => ({ ...item, content: 'changed' }),
      '2026-01-03T00:00:00.000Z',
    );

    expect(added?.[0]).not.toBe(base);
    expect(updated?.[0]?.comments[0]?.content).toBe('changed');
    expect(updated?.[0]?.updatedAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('finds mentioned agents by username once', () => {
    const agents: PublicAgent[] = [
      {
        id: 'a',
        kind: 'annotation',
        nickname: 'A',
        username: 'reader',
        avatar: '',
        annotationColor: '#8ab6d6',
        annotationDensity: 'medium',
        personalityName: '克制阅读伙伴',
        temperature: 0.35,
      },
    ];

    expect(findMentionedAgents('@reader @reader @missing', agents)).toEqual(agents);
  });

  it('detects and replaces the mention under caret', () => {
    const query = getMentionQuery('ask @rea', 8);

    expect(query).toEqual({ query: 'rea', start: 4, end: 8 });
    expect(replaceMentionQuery('ask @rea today', query!, 'reader')).toBe('ask @reader  today');
  });

  it('parses agent annotation suggestions with context fields', () => {
    expect(
      parseAnnotationSuggestions(
        '[{"exact":"target","prefix":"Beta ","suffix":" opens","context":"Beta target opens","type":"quote","comment":"note"}]',
      ),
    ).toEqual([
      {
        exact: 'target',
        prefix: 'Beta ',
        suffix: ' opens',
        context: 'Beta target opens',
        annotationType: 'quote',
        comment: 'note',
      },
    ]);
  });
});
