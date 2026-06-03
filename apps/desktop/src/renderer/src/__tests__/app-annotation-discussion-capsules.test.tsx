// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, Comment } from '@yomitomo/shared';
import {
  AnnotationDiscussionCapsules,
  annotationDiscussionCapsuleItems,
} from '../reading-library/app-reading-library';
import type { AnnotationDiscussionWindowState } from '../../../ipc-contract';

const now = '2026-05-31T10:00:00.000Z';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function comment(overrides: Partial<Comment>): Comment {
  return {
    id: overrides.id || 'comment_1',
    author: overrides.author || 'user',
    content: overrides.content || '内容',
    createdAt: now,
    ...overrides,
  };
}

function annotation(id: string, exact: string, comments: Comment[] = []): Annotation {
  return {
    id,
    anchor: {
      exact,
      prefix: '',
      suffix: '',
      start: 0,
      end: exact.length,
    },
    author: 'user',
    color: '#f4c95d',
    comments,
    createdAt: now,
    updatedAt: now,
  };
}

function article(annotations: Annotation[]): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: '文章',
    byline: '作者',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations,
    createdAt: now,
    updatedAt: now,
  };
}

function windowState(annotationId: string): AnnotationDiscussionWindowState {
  return {
    articleId: 'article_1',
    annotationId,
    windowId: Number(annotationId.replace(/\D/g, '') || 1),
    minimized: true,
  };
}

describe('annotationDiscussionCapsuleItems', () => {
  it('counts ideas, replies and assistant participants without users', () => {
    const items = annotationDiscussionCapsuleItems(
      article([
        annotation('annotation_1', '划线 1', [
          comment({ id: 'idea_1', author: 'ai', agentId: 'agent_1', agentNickname: '行开心' }),
          comment({
            id: 'reply_1',
            author: 'ai',
            replyTo: 'idea_1',
            agentId: 'agent_1',
            agentNickname: '行开心',
          }),
          comment({ id: 'reply_2', author: 'user', replyTo: 'idea_1', userNickname: 'Kevin' }),
        ]),
      ]),
      [windowState('annotation_1')],
    );

    expect(items[0]).toMatchObject({
      ideaCount: 1,
      replyCount: 2,
      quote: '划线 1',
    });
    expect(items[0]?.assistants).toEqual([{ key: 'agent_1', name: '行开心', avatar: undefined }]);
  });
});

describe('AnnotationDiscussionCapsules', () => {
  it('shows an expanded list by default for four or fewer minimized discussions', () => {
    render(
      <AnnotationDiscussionCapsules
        article={article([
          annotation('annotation_1', '第一条划线', [
            comment({ id: 'idea_1' }),
            comment({ id: 'reply_1', replyTo: 'idea_1' }),
          ]),
          annotation('annotation_2', '第二条划线', [
            comment({
              id: 'idea_2',
              author: 'ai',
              agentId: 'agent_1',
              agentAvatar: '   ',
              agentNickname: '行开心',
            }),
          ]),
        ])}
        windows={[windowState('annotation_1'), windowState('annotation_2')]}
      />,
    );

    expect(screen.getByText('收起的讨论')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('第一条划线')).toBeTruthy();
    expect(screen.getByText('1 想法 · 1 回复')).toBeTruthy();
    expect(screen.getByText('第二条划线')).toBeTruthy();
    expect(screen.getByTitle('行开心')).toBeTruthy();
    expect(screen.queryByRole('img', { name: '行开心' })).toBeNull();
    expect(screen.queryByText(/未读/)).toBeNull();
  });

  it('collapses five or more minimized discussions until the user expands them', () => {
    const annotations = Array.from({ length: 5 }, (_, index) =>
      annotation(`annotation_${index + 1}`, `划线 ${index + 1}`),
    );

    render(
      <AnnotationDiscussionCapsules
        article={article(annotations)}
        windows={annotations.map((item) => windowState(item.id))}
      />,
    );

    expect(screen.getByRole('button', { name: /收起的讨论/ })).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.queryByText('划线 1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /收起的讨论/ }));

    expect(screen.getByText('划线 1')).toBeTruthy();
    expect(screen.getByText('划线 5')).toBeTruthy();
  });

  it('opens the matching minimized discussion when a row is clicked', () => {
    const onOpen = vi.fn();

    render(
      <AnnotationDiscussionCapsules
        article={article([annotation('annotation_1', '第一条划线')])}
        windows={[windowState('annotation_1')]}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByTitle('打开批注讨论：第一条划线'));

    expect(onOpen).toHaveBeenCalledWith('article_1', 'annotation_1');
  });
});
