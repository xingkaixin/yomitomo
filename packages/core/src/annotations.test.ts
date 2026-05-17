import { describe, expect, it } from 'vitest';
import type { Agent, Annotation, Comment, PublicAgent, UserProfile } from '@yomitomo/shared';
import {
  annotationColor,
  annotationDensityInstruction,
  annotationDensityMax,
  annotationPersona,
  annotationPrimaryComment,
  annotationThreadComments,
  annotationToPublicAgent,
  annotationTypeLabel,
  appendAnnotationComment,
  commentPersona,
  createAgentAnnotation,
  createUserAnnotation,
  deleteAnnotationComment,
  findMentionedAgents,
  getMentionQuery,
  parseAnnotationSuggestions,
  replaceMentionQuery,
  updateAnnotationComment,
} from './annotations';
import { buildEpubBookIndex, epubIndexText } from './ebook-index';

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
  enabled: true,
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
      },
    );

    expect(result?.anchor.start).toBe(articleText.indexOf('target', allowedTextStart));
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
        allowedTextStart: index.paragraphs[1]!.textStart,
        allowedTextEnd: index.paragraphs[1]!.textEnd,
        allowedParagraphIds: [index.paragraphs[1]!.id],
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

  it('creates user annotations with trimmed optional notes', () => {
    const anchor = {
      exact: 'first principles',
      prefix: '',
      suffix: '',
      start: 0,
      end: 16,
    };

    expect(
      createUserAnnotation(anchor, user, '  这里重要  ', 'concept', {
        now: '2026-01-02T00:00:00.000Z',
        readingIntent: 'challenge',
      }),
    ).toMatchObject({
      author: 'user',
      annotationType: 'concept',
      readingIntent: 'challenge',
      comments: [{ content: '这里重要', readingIntent: 'challenge', userId: user.id }],
    });
    expect(createUserAnnotation(anchor, user, '   ').comments).toEqual([]);
  });

  it('separates annotation body comments from discussion comments', () => {
    const base = createUserAnnotation(
      {
        exact: 'first principles',
        prefix: '',
        suffix: '',
        start: 0,
        end: 16,
      },
      user,
      '批注正文',
      'concept',
      { now: '2026-01-02T00:00:00.000Z' },
    );
    const reply = {
      ...comment('comment-reply'),
      createdAt: '2026-01-02T00:01:00.000Z',
    };
    const withReply = { ...base, comments: [...base.comments, reply] };

    expect(annotationPrimaryComment(withReply)?.content).toBe('批注正文');
    expect(annotationThreadComments(withReply)).toEqual([reply]);
    expect(annotationThreadComments({ ...base, comments: [reply] })).toEqual([reply]);
  });

  it('deletes a comment with its replies while keeping the annotation', () => {
    const root = comment('root');
    const reply = { ...comment('reply'), replyTo: 'root' };
    const other = comment('other');
    const targetAnnotation = createUserAnnotation(
      {
        exact: 'first principles',
        prefix: '',
        suffix: '',
        start: 0,
        end: 16,
      },
      user,
      '',
    );

    const result = deleteAnnotationComment(
      [{ ...targetAnnotation, id: 'annotation', comments: [root, reply, other] }],
      'annotation',
      'root',
      '2026-01-02T00:02:00.000Z',
    );

    expect(result?.[0]?.comments).toEqual([other]);
    expect(result?.[0]?.updatedAt).toBe('2026-01-02T00:02:00.000Z');
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
        enabled: true,
        personalityName: '克制阅读伙伴',
        temperature: 0.35,
      },
    ];

    expect(findMentionedAgents('@reader @reader @missing', agents)).toEqual(agents);
  });

  it('finds mentioned agents by Chinese display name', () => {
    const agents: PublicAgent[] = [
      {
        id: 'a',
        kind: 'annotation',
        nickname: '林知微',
        username: '林知微',
        avatar: '',
        annotationColor: '#8ab6d6',
        annotationDensity: 'medium',
        enabled: true,
        personalityName: '页边同读者',
        temperature: 0.35,
      },
    ];

    expect(findMentionedAgents('请 @林知微 看看', agents)).toEqual(agents);
  });

  it('detects and replaces the mention under caret', () => {
    const query = getMentionQuery('ask @rea', 8);

    expect(query).toEqual({ query: 'rea', start: 4, end: 8 });
    expect(replaceMentionQuery('ask @rea today', query!, 'reader')).toBe('ask @reader  today');
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

  it('builds public personas and colors from annotation identity fields', () => {
    const aiAnnotation = {
      ...annotation(),
      author: 'ai' as const,
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      agentAvatar: agent.avatar,
      agentAnnotationColor: agent.annotationColor,
    };
    const aiComment = {
      ...comment(),
      author: 'ai' as const,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      agentAvatar: agent.avatar,
    };
    const publicAgent: PublicAgent = {
      id: agent.id,
      kind: agent.kind,
      nickname: agent.nickname,
      username: agent.username,
      avatar: agent.avatar,
      annotationColor: agent.annotationColor,
      annotationDensity: agent.annotationDensity,
      enabled: agent.enabled,
      personalityName: '克制阅读伙伴',
      temperature: agent.temperature,
    };

    expect(annotationPersona(aiAnnotation, user, [publicAgent])).toEqual({
      avatar: agent.avatar,
      fallback: 'AI',
      color: agent.annotationColor,
      nickname: agent.nickname,
      username: agent.username,
    });
    expect(commentPersona(aiComment, user, [publicAgent])).toEqual({
      avatar: agent.avatar,
      fallback: 'AI',
      color: '#8ab6d6',
      nickname: agent.nickname,
      username: agent.username,
    });
    expect(annotationColor(aiAnnotation, user, [])).toBe(agent.annotationColor);
    expect(annotationToPublicAgent(aiAnnotation)).toEqual(
      expect.objectContaining({
        id: agent.id,
        nickname: agent.nickname,
        username: agent.username,
      }),
    );
  });

  it('normalizes public labels and density instructions', () => {
    expect(annotationTypeLabel('assumption')).toBe('前提漏洞');
    expect(annotationDensityInstruction('low', '短文')).toContain('最多 1 条');
    expect(annotationDensityInstruction('medium', '短文')).toContain('最多 1 条');
    expect(annotationDensityInstruction('high', '短文')).toContain('最多 2 条');
    expect(annotationDensityMax('medium', '长文'.repeat(1200))).toBe(5);
  });
});
