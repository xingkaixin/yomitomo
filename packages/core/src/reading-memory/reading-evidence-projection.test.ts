import type { Annotation, Comment } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import {
  materializeReadingEvidence,
  projectReadingEvidenceThread,
  selectProjectableReadingJudgments,
} from './reading-evidence-projection';

describe('reading evidence projection', () => {
  it('selects judgments from only the source fields needed for eligibility', () => {
    const reader = { author: { kind: 'user' as const }, content: '  判断  ' };
    const assistant = { author: { kind: 'agent' as const }, content: '补充' };
    const blankReader = { ...reader, content: '\u00a0\u3000\ufeff' };
    const pendingReader = { ...reader, pending: true };

    expect(
      selectProjectableReadingJudgments({
        comments: [assistant, blankReader, pendingReader],
        distillation: { status: 'published', content: '\u3000提炼\u00a0' },
      }),
    ).toEqual({ comments: [], distillationContent: '提炼' });
    expect(
      selectProjectableReadingJudgments({
        comments: [assistant, reader, blankReader, pendingReader],
        distillation: { status: 'published', content: '\u00a0\u3000\ufeff' },
      }),
    ).toEqual({ comments: [assistant, reader], distillationContent: '' });
  });

  it('projects a user annotation with stable asset-specific identity', () => {
    const source = annotation({
      author: userAuthor('reader-secret'),
      comments: [],
    });

    const first = project(source, 'projector-v1');
    const second = project(source, 'projector-v2');

    expect(first).toEqual([
      {
        id: 'reading_evidence_annotation:annotation_1',
        assetType: 'annotation',
        sourceVersion: 'source-v1',
        projectorVersion: 'projector-v1',
        isJudgment: false,
        isUserAuthored: true,
        searchText: '前文 目标原文 后文',
        sourceCreatedAt: '2026-08-29T00:00:00.000Z',
        sourceUpdatedAt: '2026-08-29T00:10:00.000Z',
      },
    ]);
    expect(second.map((entry) => entry.id)).toEqual(first.map((entry) => entry.id));
  });

  it('projects every active comment when the discussion has reader participation', () => {
    const source = annotation({
      comments: [
        comment('ai-only', agentAuthor('assistant-a'), 'AI 独白'),
        comment('ai-only-reply', agentAuthor('assistant-b'), 'AI 追问', {
          replyTo: 'ai-only',
        }),
        comment('mixed-root', agentAuthor('assistant-a'), 'AI 原始判断'),
        comment('mixed-user', userAuthor('reader'), '用户回应', { replyTo: 'mixed-root' }),
        comment('mixed-ai', agentAuthor('assistant-b'), 'AI 后续判断', {
          replyTo: 'mixed-user',
        }),
        comment('pending-ai', agentAuthor('assistant-b'), '待生成内容', {
          replyTo: 'mixed-root',
          pending: true,
        }),
        comment('blank-user', userAuthor('reader'), '   ', { replyTo: 'ai-only' }),
        comment('pending-user-root', userAuthor('reader'), '待发送用户内容', { pending: true }),
        comment('pending-user-ai-reply', agentAuthor('assistant-a'), '有效 AI 回复', {
          replyTo: 'pending-user-root',
        }),
      ],
    });

    const entries = project(source);

    expect(entries.map((entry) => entry.id)).toEqual([
      'reading_evidence_annotation:annotation_1',
      'reading_evidence_comment:ai-only',
      'reading_evidence_comment:ai-only-reply',
      'reading_evidence_comment:mixed-root',
      'reading_evidence_comment:mixed-user',
      'reading_evidence_comment:mixed-ai',
      'reading_evidence_comment:pending-user-ai-reply',
    ]);
    expect(entries.slice(1).map((entry) => entry.isUserAuthored)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(entries.slice(1).every((entry) => entry.isJudgment)).toBe(true);
  });

  it('excludes an assistant-only thread without a published distillation', () => {
    const source = annotation({
      comments: [comment('ai-only', agentAuthor('assistant'), 'AI 独白')],
    });

    expect(project(source)).toEqual([]);
    expect(
      project(
        annotation({
          comments: [comment('pending-user', userAuthor('reader'), '稍后发送', { pending: true })],
        }),
      ),
    ).toEqual([]);
  });

  it('projects only a non-blank published distillation', () => {
    const published = annotation({
      distillation: {
        status: 'published',
        content: '  用户确认后的蒸馏判断  ',
        publishedAt: '2026-08-29T00:20:00.000Z',
        updatedAt: '2026-08-29T00:30:00.000Z',
      },
    });

    expect(project(published)).toEqual([
      expect.objectContaining({
        id: 'reading_evidence_annotation:annotation_1',
        assetType: 'annotation',
      }),
      expect.objectContaining({
        id: 'reading_evidence_distillation:annotation_1',
        assetType: 'distillation',
        isJudgment: true,
        isUserAuthored: false,
        searchText: '用户确认后的蒸馏判断 目标原文',
        sourceCreatedAt: '2026-08-29T00:20:00.000Z',
        sourceUpdatedAt: '2026-08-29T00:30:00.000Z',
      }),
    ]);
    expect(
      project(
        annotation({
          distillation: { status: 'unpublished', content: '未发布内容' },
        }),
      ),
    ).toEqual([]);
    expect(
      project(
        annotation({
          distillation: { status: 'published', content: '   ' },
        }),
      ),
    ).toEqual([]);
  });

  it('indexes only explicit evidence text', () => {
    const source = annotation({
      author: agentAuthor('annotation-secret-username'),
      whyHere: 'annotation-secret-reason',
      comments: [
        {
          ...comment('assistant', agentAuthor('comment-secret-username'), '允许的助手判断'),
          reviewLabel: '可深挖',
          readingIntent: 'challenge',
          assistantProgress: {
            steps: [{ id: 'progress-secret-id', label: 'progress-secret-label', status: 'active' }],
            fallbackMessage: 'progress-secret-fallback',
          },
        },
        comment('reader', userAuthor('reader-secret-username'), '允许的用户判断', {
          replyTo: 'assistant',
        }),
      ],
      distillation: {
        status: 'published',
        content: '允许的蒸馏内容',
        reviewSessions: [
          {
            id: 'review-secret-session',
            agentId: 'review-secret-agent',
            messages: [
              {
                id: 'review-secret-message',
                author: agentAuthor('review-secret-username'),
                content: 'review-secret-content',
                createdAt: '2026-08-29T00:20:00.000Z',
              },
            ],
            createdAt: '2026-08-29T00:20:00.000Z',
            updatedAt: '2026-08-29T00:20:00.000Z',
          },
        ],
      },
    });

    expect(project(source).map((entry) => entry.searchText)).toEqual([
      '前文 目标原文 后文',
      '允许的助手判断 目标原文',
      '允许的用户判断 目标原文',
      '允许的蒸馏内容 目标原文',
    ]);
    expect(
      project(source)
        .map((entry) => entry.searchText)
        .join(' '),
    ).not.toMatch(/secret|可深挖|challenge/);
  });

  it('materializes an annotation from current source and article facts', () => {
    const source = annotation({ author: userAuthor('reader') });
    const [projected] = project(source);
    if (!projected) throw new Error('missing projected annotation');

    expect(
      materializeReadingEvidence({
        projected,
        annotation: source,
        article: {
          id: 'article_1',
          sourceType: 'ebook',
          title: '当前标题',
          byline: '当前作者',
        },
      }),
    ).toEqual({
      id: 'reading_evidence_annotation:annotation_1',
      assetType: 'annotation',
      role: 'source',
      authorKind: 'user',
      content: '目标原文',
      sourceVersion: 'source-v1',
      source: {
        ref: { kind: 'article', id: 'article_1' },
        sourceType: 'ebook',
        title: '当前标题',
        byline: '当前作者',
      },
      location: {
        annotationId: 'annotation_1',
        anchor: source.anchor,
      },
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:10:00.000Z',
    });
  });

  it('materializes a current comment and rejects stale comment facts', () => {
    const source = annotation({
      comments: [
        comment('assistant', agentAuthor('assistant'), '  当前助手判断  '),
        comment('reader', userAuthor('reader'), '当前用户判断', { replyTo: 'assistant' }),
      ],
    });
    const [assistantComment, readerComment] = source.comments;
    if (!assistantComment || !readerComment) throw new Error('missing source comments');
    const projected = project(source).find((entry) => entry.sourceCommentId === 'assistant');
    if (!projected) throw new Error('missing projected comment');
    const article = { id: 'article_1', sourceType: 'web' as const, title: '文章' };

    expect(materializeReadingEvidence({ projected, annotation: source, article })).toMatchObject({
      id: 'reading_evidence_comment:assistant',
      assetType: 'comment',
      role: 'judgment',
      authorKind: 'ai',
      content: '当前助手判断',
      location: { annotationId: 'annotation_1', commentId: 'assistant' },
      createdAt: assistantComment.createdAt,
      updatedAt: assistantComment.createdAt,
    });
    expect(
      materializeReadingEvidence({
        projected,
        annotation: { ...source, comments: source.comments.slice(1) },
        article,
      }),
    ).toBeNull();
    expect(
      materializeReadingEvidence({
        projected,
        annotation: {
          ...source,
          comments: [{ ...assistantComment, pending: true }, readerComment],
        },
        article,
      }),
    ).toBeNull();
    expect(
      materializeReadingEvidence({
        projected,
        annotation: {
          ...source,
          comments: [{ ...assistantComment, content: '   ' }, readerComment],
        },
        article,
      }),
    ).toBeNull();
    expect(
      materializeReadingEvidence({
        projected,
        annotation: {
          ...source,
          comments: [assistantComment, { ...readerComment, pending: true }],
        },
        article,
      }),
    ).toBeNull();
  });

  it('materializes only a currently published distillation', () => {
    const source = annotation({
      distillation: {
        status: 'published',
        content: '  当前蒸馏  ',
        publishedAt: '2026-08-29T00:20:00.000Z',
        updatedAt: '2026-08-29T00:30:00.000Z',
      },
    });
    const projected = project(source).find((entry) => entry.assetType === 'distillation');
    if (!projected) throw new Error('missing projected distillation');
    const article = { id: 'article_1', sourceType: 'pdf' as const, title: '文章' };

    expect(materializeReadingEvidence({ projected, annotation: source, article })).toMatchObject({
      id: 'reading_evidence_distillation:annotation_1',
      assetType: 'distillation',
      role: 'judgment',
      content: '当前蒸馏',
      createdAt: '2026-08-29T00:20:00.000Z',
      updatedAt: '2026-08-29T00:30:00.000Z',
    });
    expect(
      materializeReadingEvidence({
        projected,
        annotation: {
          ...source,
          distillation: { ...source.distillation!, status: 'unpublished' },
        },
        article,
      }),
    ).toBeNull();
  });
});

function project(source: Annotation, projectorVersion = 'projector-v1') {
  return projectReadingEvidenceThread({
    articleId: 'article_1',
    annotation: source,
    sourceVersion: 'source-v1',
    projectorVersion,
  });
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: {
      exact: '目标原文',
      prefix: '前文',
      suffix: '后文',
      start: 10,
      end: 14,
    },
    author: agentAuthor('assistant'),
    color: '#f59e0b',
    comments: [],
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:10:00.000Z',
    ...overrides,
  };
}

function comment(
  id: string,
  author: Comment['author'],
  content: string,
  overrides: Partial<Comment> = {},
): Comment {
  return {
    id,
    author,
    content,
    createdAt: `2026-08-29T00:${String(id.length).padStart(2, '0')}:00.000Z`,
    ...overrides,
  };
}

function userAuthor(username: string) {
  return { kind: 'user' as const, userId: `user:${username}`, username };
}

function agentAuthor(username: string) {
  return { kind: 'agent' as const, agentId: `agent:${username}`, username };
}
