import { beforeEach, describe, expect, it } from 'vitest';
import type { Agent, Comment } from '@yomitomo/shared';
import {
  annotationWithAssistantRuns,
  discussionReplyPlaceholder,
  discussionThreads,
  replyTargetAgents,
} from '../annotation-discussion/app-annotation-discussion-utils';
import { initializeAppI18n } from '../i18n/app-i18n';
import { publicAnnotationAgents } from '../source/bookcase/source-public-agents';
import { annotationFixture } from './article-actions-test-utils';

const now = '2026-05-31T06:00:00.000Z';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

describe('discussion reply targeting', () => {
  it('removes a running assistant reply from the discussion when its parent is deleted', () => {
    const root = rootThought();
    const annotation = annotationFixture('annotation_1', { comments: [root] });
    const publicAgents = publicAnnotationAgents(agents());
    const run = {
      articleId: 'article_1',
      agentId: publicAgents[0].id,
      runKey: 'reply',
      channel: { kind: 'thread', annotationId: annotation.id, threadId: root.id },
      status: 'running',
      text: '正在回复',
      startedAt: now,
    } as const;
    const threads = (comments: Comment[]) =>
      discussionThreads(
        annotationWithAssistantRuns({ ...annotation, comments }, [run], publicAgents),
        new Set(),
      );

    expect(threads([root])[0].replies[0].content).toBe(run.text);
    expect(threads([])).toEqual([]);
  });

  it('keeps user-created thoughts passive until an assistant is mentioned', () => {
    const publicAgents = publicAnnotationAgents(agents());

    expect(replyTargetAgents('继续说', rootThought(), publicAgents)).toEqual([]);
    expect(discussionReplyPlaceholder(rootThought(), publicAgents)).toBe(
      '回复这条想法，输入 @助手 可邀请助手参与讨论',
    );
  });
});

function rootThought(): Comment {
  return {
    id: 'thought_1',
    author: { kind: 'user', username: 'reader' },
    content: '这是一条很长的想法'.repeat(20),
    createdAt: now,
  };
}

function agents(): Agent[] {
  return [agent()];
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    providerId: 'provider_1',
    nickname: '周现',
    username: 'zhou',
    avatar: '',
    annotationColor: '#f4c95d',
    annotationDensity: 'medium',
    temperature: 0.5,
    soul: '',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
