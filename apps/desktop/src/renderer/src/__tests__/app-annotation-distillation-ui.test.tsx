// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Annotation, ArticleRecord } from '@yomitomo/shared';
import { AnnotationDiscussionWindowApp } from '../annotation-discussion/app-annotation-discussion-window';
import { AnnotationSedimentationWindowApp } from '../annotation-discussion/app-annotation-sedimentation-window';
import { applyDistillationProposalToDraft } from '../annotation-discussion/app-annotation-sedimentation-proposals';
import { initializeAppI18n } from '../i18n/app-i18n';

const now = '2026-05-31T06:00:00.000Z';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  window.history.replaceState({}, '', '/');
  vi.clearAllMocks();
});

describe('annotation distillation UI', () => {
  it('uses the explicit distillation entry copy before publishing', async () => {
    installDesktopApi(article(annotation()));
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationDiscussionWindowApp />);

    expect(await screen.findByRole('button', { name: /把这些想法沉淀下来/ })).toBeTruthy();
    expect(screen.queryByText('开始沉淀')).toBeNull();
  });

  it('labels an unpublished distillation draft as draft', async () => {
    installDesktopApi(article(annotation()));
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    expect(await screen.findByText('沉淀稿')).toBeTruthy();
    expect(screen.getByText('草稿')).toBeTruthy();
    expect(screen.queryByText('已发布')).toBeNull();
  });

  it('labels a published distillation as published', async () => {
    installDesktopApi(
      article(
        annotation({
          distillation: {
            status: 'published',
            content: '已经发布的沉淀',
            publishedAt: now,
          },
        }),
      ),
    );
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    expect(await screen.findByText('已发布')).toBeTruthy();
    expect(screen.queryByText('草稿')).toBeNull();
  });

  it('keeps an intentionally empty local distillation draft', async () => {
    installDesktopApi(
      article(
        annotation({
          distillation: {
            status: 'unpublished',
            content: '旧的沉淀草稿',
          },
        }),
      ),
    );
    window.localStorage.setItem('annotation-distillation-draft:article_1:annotation_1', '');
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    const textarea = (await screen.findByPlaceholderText(/写下你想沉淀/)) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });

  it('accepts a pending proposal into the local distillation draft', async () => {
    const desktop = installDesktopApi(
      article(
        annotation({
          distillation: {
            status: 'unpublished',
            content: '',
            reviewSessions: [
              {
                id: 'review_session_1',
                agentId: 'agent_1',
                messages: [
                  {
                    id: 'review_message_1',
                    author: 'ai',
                    content: '建议补成一条可以带走的判断。',
                    createdAt: now,
                    proposals: [
                      {
                        id: 'proposal_1',
                        kind: 'insert',
                        status: 'pending',
                        title: '新增判断',
                        content: '这是一条新的沉淀判断。',
                        updatedAt: now,
                      },
                    ],
                  },
                ],
                createdAt: now,
                updatedAt: now,
              },
            ],
          },
        }),
      ),
    );
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    expect(await screen.findByText('新增判断')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '采纳' }));

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/写下你想沉淀/) as HTMLTextAreaElement;
      expect(textarea.value).toBe('这是一条新的沉淀判断。');
    });
    await waitFor(() => {
      expect(desktop.saveArticle).toHaveBeenCalledWith(
        expect.objectContaining({
          annotations: [
            expect.objectContaining({
              distillation: expect.objectContaining({
                reviewSessions: [
                  expect.objectContaining({
                    messages: [
                      expect.objectContaining({
                        proposals: [
                          expect.objectContaining({
                            id: 'proposal_1',
                            status: 'accepted',
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            }),
          ],
        }),
      );
    });
  });

  it('clears the review composer immediately after submit', async () => {
    const desktop = installDesktopApi(article(annotation()));
    desktop.requestAgentDistillationReviewStream.mockImplementation(async (payload) => ({
      id: payload.reviewMessageId || 'review_message_1',
      author: 'ai',
      content: '收到，我来审阅。',
      createdAt: now,
      agentId: 'agent_1',
      proposals: [],
    }));
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    const textarea = (await screen.findByPlaceholderText(
      '让已选审阅助手讨论这份沉淀...',
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '请重点看证据边界' } });
    fireEvent.click(await screen.findByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
    await waitFor(() => {
      expect(desktop.requestAgentDistillationReviewStream).toHaveBeenCalledWith(
        expect.objectContaining({
          distillationDraft: '',
          distillationReviewRequest: '请重点看证据边界',
          instruction: '',
        }),
        expect.any(Function),
      );
    });
  });

  it('renders and saves streamed structured review items', async () => {
    const desktop = installDesktopApi(article(annotation()));
    const overviewItem = {
      id: 'review_item_1',
      type: 'overview' as const,
      stance: 'mixed' as const,
      content: '这段判断有价值，但证据边界还不够清楚。',
    };
    const proposal = {
      id: 'proposal_1',
      kind: 'insert' as const,
      status: 'pending' as const,
      title: '补证据边界',
      content: '补一条证据边界。',
      updatedAt: now,
    };
    const proposalItem = {
      id: 'review_item_2',
      type: 'proposal' as const,
      proposal,
    };
    desktop.requestAgentDistillationReviewStream.mockImplementation(async (payload, onEvent) => {
      onEvent({ type: 'item', item: overviewItem });
      onEvent({ type: 'item', item: proposalItem });
      return {
        id: payload.reviewMessageId || 'review_message_1',
        author: 'ai',
        content: overviewItem.content,
        createdAt: now,
        agentId: 'agent_1',
        items: [overviewItem, proposalItem],
        proposals: [proposal],
        status: 'done',
      };
    });
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    await screen.findByPlaceholderText('让已选审阅助手讨论这份沉淀...');
    fireEvent.click(await screen.findByRole('button', { name: '发送' }));

    expect(await screen.findByText('这段判断有价值，但证据边界还不够清楚。')).toBeTruthy();
    expect(await screen.findByText('补证据边界')).toBeTruthy();
    await waitFor(() => {
      expect(desktop.saveArticle).toHaveBeenCalledWith(
        expect.objectContaining({
          annotations: [
            expect.objectContaining({
              distillation: expect.objectContaining({
                reviewSessions: [
                  expect.objectContaining({
                    messages: [
                      expect.objectContaining({
                        items: [overviewItem, proposalItem],
                        proposals: [proposal],
                        status: 'done',
                      }),
                    ],
                  }),
                ],
              }),
            }),
          ],
        }),
      );
    });
  });

  it('renders organized discussion in the draft area without saving a review session', async () => {
    const desktop = installDesktopApi(article(annotation()));
    const overviewItem = {
      id: 'review_item_1',
      type: 'overview' as const,
      stance: 'solid' as const,
      content: '可以沉淀为一个可迁移的判断。',
    };
    desktop.requestAgentDistillationReviewStream.mockImplementation(async (payload, onEvent) => {
      onEvent({ type: 'item', item: overviewItem });
      return {
        id: payload.reviewMessageId || 'review_message_1',
        author: 'ai',
        content: overviewItem.content,
        createdAt: now,
        agentId: 'agent_1',
        items: [overviewItem],
        proposals: [],
        status: 'done',
      };
    });
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    fireEvent.click(await screen.findByRole('button', { name: '整理讨论' }));
    expect(await screen.findByText('整理当前讨论？')).toBeTruthy();
    expect(screen.getByText(/不会自动改写草稿/)).toBeTruthy();
    expect(desktop.requestAgentDistillationReviewStream).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '开始整理' }));

    expect(await screen.findByText('讨论整理')).toBeTruthy();
    expect(await screen.findByText('可以沉淀为一个可迁移的判断。')).toBeTruthy();
    expect(screen.getByText('还没有审阅讨论')).toBeTruthy();
    expect(desktop.requestAgentDistillationReviewStream).toHaveBeenCalledWith(
      expect.objectContaining({
        distillationReviewMode: 'organize_discussion',
        distillationDraft: '',
        distillationReviewRequest: expect.stringContaining('请整理'),
        instruction: '',
      }),
      expect.any(Function),
    );
    expect(desktop.saveArticle).not.toHaveBeenCalled();
  });

  it('appends an organized insert proposal to the local draft', async () => {
    const desktop = installDesktopApi(article(annotation()));
    const proposal = {
      id: 'proposal_1',
      kind: 'insert' as const,
      status: 'pending' as const,
      title: '补一个判断',
      content: '讨论可以沉淀成这条判断。',
      updatedAt: now,
    };
    const proposalItem = {
      id: 'review_item_1',
      type: 'proposal' as const,
      proposal,
    };
    desktop.requestAgentDistillationReviewStream.mockImplementation(async (payload, onEvent) => {
      onEvent({ type: 'item', item: proposalItem });
      return {
        id: payload.reviewMessageId || 'review_message_1',
        author: 'ai',
        content: '整理完成。',
        createdAt: now,
        agentId: 'agent_1',
        items: [proposalItem],
        proposals: [proposal],
        status: 'done',
      };
    });
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    await startOrganizeDiscussion();
    expect(await screen.findByText('补一个判断')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '加入草稿' }));

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/写下你想沉淀/) as HTMLTextAreaElement;
      expect(textarea.value).toBe('讨论可以沉淀成这条判断。');
    });
    expect(screen.getAllByText('已加入草稿').length).toBeGreaterThan(0);
    expect(desktop.saveArticle).not.toHaveBeenCalled();
  });

  it('shows organized discussion failures in the draft area', async () => {
    const desktop = installDesktopApi(article(annotation()));
    desktop.requestAgentDistillationReviewStream.mockRejectedValue(new Error('provider failed'));
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    await startOrganizeDiscussion();

    expect(await screen.findByText('整理失败')).toBeTruthy();
    expect(await screen.findByText('provider failed')).toBeTruthy();
    expect(await screen.findByRole('button', { name: '重试' })).toBeTruthy();
    expect(desktop.saveArticle).not.toHaveBeenCalled();
  });

  it('marks failed distillation review messages as failed', async () => {
    const desktop = installDesktopApi(article(annotation()));
    desktop.requestAgentDistillationReviewStream.mockRejectedValue(new Error('provider failed'));
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    await screen.findByPlaceholderText('让已选审阅助手讨论这份沉淀...');
    fireEvent.click(await screen.findByRole('button', { name: '发送' }));

    expect(await screen.findAllByText('provider failed')).toHaveLength(2);
    expect(screen.queryByText('正在审阅...')).toBeNull();
    expect(desktop.requestAgentDistillationReviewStream).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(desktop.saveArticle).toHaveBeenCalledWith(
        expect.objectContaining({
          annotations: [
            expect.objectContaining({
              distillation: expect.objectContaining({
                reviewSessions: [
                  expect.objectContaining({
                    messages: [
                      expect.objectContaining({
                        author: 'ai',
                        content: '',
                        errorMessage: 'provider failed',
                        status: 'failed',
                      }),
                    ],
                  }),
                ],
              }),
            }),
          ],
        }),
      );
    });
  });
});

describe('annotation distillation proposals', () => {
  it('inserts proposal content at the latest selection end', () => {
    const result = applyDistillationProposalToDraft(
      '第一段\n第二段',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        content: '新增段落',
        updatedAt: now,
      },
      { start: 0, end: 3 },
    );

    expect(result).toEqual({
      ok: true,
      draft: '第一段\n新增段落\n第二段',
      changeOffset: 4,
      changeLength: 4,
    });
  });

  it('replaces a proposal target only when the text is unique', () => {
    const result = applyDistillationProposalToDraft(
      '旧判断需要收敛',
      {
        id: 'proposal_1',
        kind: 'replace',
        status: 'pending',
        title: '修改',
        targetText: '旧判断',
        replacementText: '新判断',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({ ok: true, draft: '新判断需要收敛', changeOffset: 0, changeLength: 3 });
  });

  it('keeps the draft unchanged when a replace target appears multiple times', () => {
    const result = applyDistillationProposalToDraft(
      '判断一。判断二。',
      {
        id: 'proposal_1',
        kind: 'replace',
        status: 'pending',
        title: '修改',
        targetText: '判断',
        replacementText: '结论',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: '目标文本在当前草稿中出现多次，需要手动定位',
    });
  });

  it('replaces a proposal target when only whitespace differs', () => {
    const result = applyDistillationProposalToDraft(
      '旧判断需要\n收敛',
      {
        id: 'proposal_1',
        kind: 'replace',
        status: 'pending',
        title: '修改',
        targetText: '旧判断需要 收敛',
        replacementText: '新判断',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({ ok: true, draft: '新判断', changeOffset: 0, changeLength: 3 });
  });

  it('deletes a proposal target only when the text is unique', () => {
    const result = applyDistillationProposalToDraft(
      '保留。删除这句。继续。',
      {
        id: 'proposal_1',
        kind: 'delete',
        status: 'pending',
        title: '删除',
        targetText: '删除这句。',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({ ok: true, draft: '保留。继续。', changeOffset: 3, changeLength: 0 });
  });

  it('deletes a proposal target when only whitespace differs', () => {
    const result = applyDistillationProposalToDraft(
      '保留。\n删除这句。\n继续。',
      {
        id: 'proposal_1',
        kind: 'delete',
        status: 'pending',
        title: '删除',
        targetText: '删除这句。',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: true,
      draft: '保留。\n\n继续。',
      changeOffset: 4,
      changeLength: 0,
    });
  });
});

function installDesktopApi(sourceArticle: ArticleRecord) {
  let currentArticle = sourceArticle;
  const desktop = {
    getArticle: vi.fn().mockImplementation(async () => currentArticle),
    getState: vi.fn().mockResolvedValue({ agents: agents() }),
    saveArticle: vi.fn().mockImplementation(async (nextArticle: ArticleRecord) => {
      currentArticle = nextArticle;
      return { article: { id: nextArticle.id } };
    }),
    commitAnnotationSedimentation: vi.fn().mockResolvedValue(undefined),
    requestAgentDistillationReviewStream: vi.fn(),
  };
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktop,
  });
  return desktop;
}

async function startOrganizeDiscussion() {
  fireEvent.click(await screen.findByRole('button', { name: '整理讨论' }));
  fireEvent.click(await screen.findByRole('button', { name: '开始整理' }));
}

function article(sourceAnnotation: Annotation): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    sourceType: 'web',
    title: '测试文章',
    byline: '作者',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [sourceAnnotation],
    createdAt: now,
    updatedAt: now,
  };
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: {
      exact: '值得讨论的一段划线',
      prefix: '',
      suffix: '',
      start: 0,
      end: 8,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function agents(): Agent[] {
  return [
    {
      id: 'agent_1',
      kind: 'review',
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
    },
  ];
}
