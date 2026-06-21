// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashText, type Agent, type Annotation, type ArticleRecord } from '@yomitomo/shared';
import { AnnotationDiscussionWindowApp } from '../annotation-discussion/app-annotation-discussion-window';
import { AnnotationSedimentationWindowApp } from '../annotation-discussion/app-annotation-sedimentation-window';
import {
  applyDistillationProposalToDraft,
  composeDistillationProposalDraftChangeSetEntries,
  planDistillationProposalDraftAnchor,
  planDistillationProposalChange,
  planDistillationProposalChangeSet,
} from '../annotation-discussion/app-annotation-sedimentation-proposals';
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

  it('previews and keeps a pending proposal in the local distillation draft', async () => {
    const desktop = installDesktopApi(
      article(
        annotation({
          distillation: {
            status: 'unpublished',
            content: '已有判断。',
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
                        insertAfterText: '已有判断。',
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
    fireEvent.click(screen.getByRole('button', { name: '预览变更' }));
    expect(await screen.findByLabelText('草稿变更预览')).toBeTruthy();
    expect(screen.queryByText('正在预览一条建议，确认后才会改写草稿')).toBeNull();
    expect(draftTextarea().value).toBe('已有判断。');
    fireEvent.click(screen.getByRole('button', { name: '保留' }));

    await waitFor(() => {
      expect(draftTextarea().value).toBe('已有判断。\n这是一条新的沉淀判断。');
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

  it('highlights the current draft anchor when hovering a review proposal', async () => {
    installDesktopApi(
      article(
        annotation({
          distillation: {
            status: 'unpublished',
            content: '已有判断。旧判断需要收敛。',
            reviewSessions: [
              {
                id: 'review_session_1',
                agentId: 'agent_1',
                messages: [
                  {
                    id: 'review_message_1',
                    author: 'ai',
                    content: '建议改写旧判断。',
                    createdAt: now,
                    proposals: [
                      {
                        id: 'proposal_1',
                        kind: 'replace',
                        status: 'pending',
                        title: '修改判断',
                        targetText: '旧判断',
                        replacementText: '新判断',
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

    const proposal = (await screen.findByText('修改判断')).closest(
      '.annotation-sedimentation-proposal',
    );
    expect(proposal).toBeTruthy();
    fireEvent.mouseEnter(proposal!);
    const highlight = await screen.findByLabelText('草稿锚点高亮');
    expect(within(highlight).getByText('旧判断')).toBeTruthy();
    fireEvent.mouseLeave(proposal!);
    expect(screen.queryByLabelText('草稿锚点高亮')).toBeNull();
  });

  it('does not show draft anchor highlights while previewing proposal changes', async () => {
    installDesktopApi(
      article(
        annotation({
          distillation: {
            status: 'unpublished',
            content: '已有判断。旧判断。',
            reviewSessions: [
              {
                id: 'review_session_1',
                agentId: 'agent_1',
                messages: [
                  {
                    id: 'review_message_1',
                    author: 'ai',
                    content: '建议换一个判断。',
                    createdAt: now,
                    proposals: [
                      {
                        id: 'proposal_1',
                        kind: 'replace',
                        status: 'pending',
                        title: '修改判断',
                        targetText: '旧判断',
                        replacementText: '新判断',
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

    const proposal = (await screen.findByText('修改判断')).closest(
      '.annotation-sedimentation-proposal',
    );
    expect(proposal).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '预览变更' }));
    expect(await screen.findByLabelText('草稿变更预览')).toBeTruthy();
    fireEvent.mouseEnter(proposal!);
    expect(screen.queryByLabelText('草稿锚点高亮')).toBeNull();
  });

  it('silently skips draft anchor highlights when the proposal target is stale', async () => {
    installDesktopApi(
      article(
        annotation({
          distillation: {
            status: 'unpublished',
            content: '当前草稿已经没有旧判断。',
            reviewSessions: [
              {
                id: 'review_session_1',
                agentId: 'agent_1',
                messages: [
                  {
                    id: 'review_message_1',
                    author: 'ai',
                    content: '这条建议基于旧草稿。',
                    createdAt: now,
                    proposals: [
                      {
                        id: 'proposal_1',
                        kind: 'replace',
                        status: 'pending',
                        title: '修改不存在的判断',
                        targetText: '不存在的判断',
                        replacementText: '新判断',
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

    const proposal = (await screen.findByText('修改不存在的判断')).closest(
      '.annotation-sedimentation-proposal',
    );
    expect(proposal).toBeTruthy();
    fireEvent.mouseEnter(proposal!);
    expect(screen.queryByLabelText('草稿锚点高亮')).toBeNull();
  });

  it('previews one review message and decides each draft change separately', async () => {
    const desktop = installDesktopApi(
      article(
        annotation({
          distillation: {
            status: 'unpublished',
            content: '已有判断。旧判断。',
            reviewSessions: [
              {
                id: 'review_session_1',
                agentId: 'agent_1',
                messages: [
                  {
                    id: 'review_message_1',
                    author: 'ai',
                    content: '这一轮需要同时补充和改写。',
                    createdAt: now,
                    proposals: [
                      {
                        id: 'proposal_1',
                        kind: 'insert',
                        status: 'pending',
                        title: '新增判断',
                        insertAfterText: '已有判断。',
                        content: '补充判断。',
                        updatedAt: now,
                      },
                      {
                        id: 'proposal_2',
                        kind: 'replace',
                        status: 'pending',
                        title: '修改判断',
                        targetText: '旧判断',
                        replacementText: '新判断',
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
    fireEvent.click(screen.getAllByRole('button', { name: '预览变更' })[0]);
    const preview = await screen.findByLabelText('草稿变更预览');
    expect(within(preview).getByText('补充判断。')).toBeTruthy();
    expect(within(preview).getByText('旧判断')).toBeTruthy();
    expect(within(preview).getByText('新判断')).toBeTruthy();
    expect(screen.getAllByText('预览中')).toHaveLength(2);
    expect(draftTextarea().value).toBe('已有判断。旧判断。');
    fireEvent.click(screen.getAllByRole('button', { name: '保留' })[0]);
    expect(await screen.findByText('已保留')).toBeTruthy();
    expect(draftTextarea().value).toBe('已有判断。旧判断。');
    fireEvent.click(screen.getByRole('button', { name: '放弃' }));

    await waitFor(() => {
      expect(draftTextarea().value).toBe('已有判断。\n补充判断。\n旧判断。');
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
                          expect.objectContaining({
                            id: 'proposal_2',
                            status: 'ignored',
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

  it('discards a previewed proposal without changing the draft', async () => {
    const desktop = installDesktopApi(
      article(
        annotation({
          distillation: {
            status: 'unpublished',
            content: '旧判断需要收敛',
            reviewSessions: [
              {
                id: 'review_session_1',
                agentId: 'agent_1',
                messages: [
                  {
                    id: 'review_message_1',
                    author: 'ai',
                    content: '建议换一个判断。',
                    createdAt: now,
                    proposals: [
                      {
                        id: 'proposal_1',
                        kind: 'replace',
                        status: 'pending',
                        title: '修改判断',
                        targetText: '旧判断',
                        replacementText: '新判断',
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

    expect(await screen.findByText('修改判断')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '预览变更' }));
    const preview = await screen.findByLabelText('草稿变更预览');
    expect(within(preview).getByText('旧判断')).toBeTruthy();
    expect(within(preview).getByText('新判断')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '放弃' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('草稿变更预览')).toBeNull();
    });
    expect(draftTextarea().value).toBe('旧判断需要收敛');
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
                            status: 'ignored',
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
      '让当前审阅助手讨论这份沉淀...',
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

  it('switches the selected review assistant instead of selecting multiple assistants', async () => {
    const desktop = installDesktopApi(article(annotation()));
    desktop.requestAgentDistillationReviewStream.mockImplementation(async (payload) => ({
      id: payload.reviewMessageId || 'review_message_1',
      author: 'ai',
      content: '收到，我来审阅。',
      createdAt: now,
      agentId: payload.agentId,
      proposals: [],
    }));
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    await screen.findByPlaceholderText('让当前审阅助手讨论这份沉淀...');
    fireEvent.click(await screen.findByRole('button', { name: '@梁证言' }));
    fireEvent.click(await screen.findByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(desktop.requestAgentDistillationReviewStream).toHaveBeenCalledOnce();
    });
    expect(desktop.requestAgentDistillationReviewStream).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent_2' }),
      expect.any(Function),
    );
  });

  it('keeps the current review assistant selected when clicked again', async () => {
    const desktop = installDesktopApi(article(annotation()));
    desktop.requestAgentDistillationReviewStream.mockImplementation(async (payload) => ({
      id: payload.reviewMessageId || 'review_message_1',
      author: 'ai',
      content: '收到，我来审阅。',
      createdAt: now,
      agentId: payload.agentId,
      proposals: [],
    }));
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    await screen.findByPlaceholderText('让当前审阅助手讨论这份沉淀...');
    fireEvent.click(await screen.findByRole('button', { name: '@周现' }));
    expect(await screen.findByText('需要保留一个审阅助手')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(desktop.requestAgentDistillationReviewStream).toHaveBeenCalledOnce();
    });
    expect(desktop.requestAgentDistillationReviewStream).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent_1' }),
      expect.any(Function),
    );
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

    await screen.findByPlaceholderText('让当前审阅助手讨论这份沉淀...');
    fireEvent.click(await screen.findByRole('button', { name: '发送' }));

    expect(await screen.findByText('这段判断有价值，但证据边界还不够清楚。')).toBeTruthy();
    expect(await screen.findByText('补证据边界')).toBeTruthy();
    expect(await screen.findByLabelText('草稿变更预览')).toBeTruthy();
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
                        items: [
                          overviewItem,
                          expect.objectContaining({
                            id: proposalItem.id,
                            type: 'proposal',
                            proposal: expect.objectContaining({
                              id: proposal.id,
                              sourceDraftHash: hashText(''),
                              sourceReviewSessionId: expect.any(String),
                              sourceReviewMessageId: expect.any(String),
                              sourceAgentId: 'agent_1',
                            }),
                          }),
                        ],
                        proposals: [
                          expect.objectContaining({
                            id: proposal.id,
                            sourceDraftHash: hashText(''),
                            sourceReviewSessionId: expect.any(String),
                            sourceReviewMessageId: expect.any(String),
                            sourceAgentId: 'agent_1',
                          }),
                        ],
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
    expect(await screen.findByLabelText('草稿变更预览')).toBeTruthy();
    expect(draftTextarea().placeholder).toBe('');
    expect(screen.getByText('预览中')).toBeTruthy();
    expect(screen.queryByLabelText('稿件修改建议')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保留' }));

    await waitFor(() => {
      expect(draftTextarea().value).toBe('讨论可以沉淀成这条判断。');
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

    await screen.findByPlaceholderText('让当前审阅助手讨论这份沉淀...');
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
  it('plans a resolved draft anchor for a replace proposal', () => {
    const result = planDistillationProposalDraftAnchor('已有判断。旧判断。', {
      id: 'proposal_1',
      kind: 'replace',
      status: 'pending',
      title: '修改',
      targetText: '旧判断',
      replacementText: '新判断',
      sourceDraftHash: hashText('已有判断。旧判断。'),
      updatedAt: now,
    });

    expect(result).toEqual({
      ok: true,
      status: 'resolved',
      anchorKind: 'text',
      range: { start: 5, end: 8 },
      text: '旧判断',
    });
  });

  it('marks a draft anchor as drifted when the source draft changed but text still matches', () => {
    const result = planDistillationProposalDraftAnchor('新前缀。旧判断。', {
      id: 'proposal_1',
      kind: 'replace',
      status: 'pending',
      title: '修改',
      targetText: '旧判断',
      replacementText: '新判断',
      sourceDraftHash: hashText('旧草稿。旧判断。'),
      updatedAt: now,
    });

    expect(result).toEqual({
      ok: true,
      status: 'drifted',
      anchorKind: 'text',
      range: { start: 4, end: 7 },
      text: '旧判断',
    });
  });

  it('marks a draft anchor as ambiguous when target text appears multiple times', () => {
    const result = planDistillationProposalDraftAnchor('旧判断。旧判断。', {
      id: 'proposal_1',
      kind: 'replace',
      status: 'pending',
      title: '修改',
      targetText: '旧判断',
      replacementText: '新判断',
      updatedAt: now,
    });

    expect(result).toEqual({
      ok: false,
      status: 'ambiguous',
    });
  });

  it('recovers an insert draft anchor from instruction-shaped content', () => {
    const result = planDistillationProposalDraftAnchor('第一段。第二段。', {
      id: 'proposal_1',
      kind: 'insert',
      status: 'pending',
      title: '新增',
      content: '在“第一段”之后，补充：“新增段落。”',
      updatedAt: now,
    });

    expect(result).toEqual({
      ok: true,
      status: 'resolved',
      anchorKind: 'text',
      range: { start: 0, end: 3 },
      text: '第一段',
    });
  });

  it('uses a point draft anchor for unchanged unanchored inserts', () => {
    const draft = '第一段';
    const result = planDistillationProposalDraftAnchor(draft, {
      id: 'proposal_1',
      kind: 'insert',
      status: 'pending',
      title: '新增',
      content: '新增段落',
      sourceDraftHash: hashText(draft),
      updatedAt: now,
    });

    expect(result).toEqual({
      ok: true,
      status: 'resolved',
      anchorKind: 'point',
      range: { start: 3, end: 3 },
      text: '',
    });
  });

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

  it('plans an insert proposal change for draft preview', () => {
    const result = planDistillationProposalChange(
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
      change: {
        kind: 'insert',
        baseDraft: '第一段\n第二段',
        draft: '第一段\n新增段落\n第二段',
        range: { start: 3, end: 3 },
        insertedText: '\n新增段落',
        changeOffset: 4,
        changeLength: 4,
      },
    });
  });

  it('plans a grouped proposal change set against one base draft', () => {
    const result = planDistillationProposalChangeSet(
      '已有判断。旧判断。',
      [
        {
          id: 'proposal_1',
          kind: 'insert',
          status: 'pending',
          title: '新增',
          insertAfterText: '已有判断。',
          content: '补充判断。',
          updatedAt: now,
        },
        {
          id: 'proposal_2',
          kind: 'replace',
          status: 'pending',
          title: '修改',
          targetText: '旧判断',
          replacementText: '新判断',
          updatedAt: now,
        },
      ],
      null,
    );

    expect(result).toEqual({
      ok: true,
      changeSet: expect.objectContaining({
        baseDraft: '已有判断。旧判断。',
        draft: '已有判断。\n补充判断。\n新判断。',
        changes: [
          expect.objectContaining({
            kind: 'insert',
            range: { start: 5, end: 5 },
            insertedText: '\n补充判断。\n',
          }),
          expect.objectContaining({
            kind: 'replace',
            range: { start: 5, end: 8 },
            deletedText: '旧判断',
            insertedText: '新判断',
          }),
        ],
      }),
    });
  });

  it('plans grouped proposals when insert content carries the anchor instruction', () => {
    const draft =
      'Agentic Coding的边界之一是隐性知识不在语料库中。作者以ScopeDB开发为例，指出@andylokandy随手指出Rust库或标准库接口、@leiysky随手丢论文和友商文档，以及作者自己“莫名其妙知道的很多诡异的细节”——这些在特定场合能提效十倍以上的知识，AI搜不到、组合不出来。';
    const result = planDistillationProposalChangeSet(
      draft,
      [
        {
          id: 'proposal_insert_examples',
          kind: 'insert',
          status: 'pending',
          title: '补充证据锚点',
          content:
            '在“作者以ScopeDB开发为例”之后，补充具体案例：“例如@andylokandy随手指出Rust库或标准库接口、@leiysky随手丢论文和友商文档。”',
          updatedAt: now,
        },
        {
          id: 'proposal_insert_review',
          kind: 'insert',
          status: 'pending',
          title: '补充推导中间步骤',
          content:
            '在“AI搜不到、组合不出来”之后，补充：“作者认为，由于这些隐性知识缺失，AI实际每段核心代码的产出都需要Review。”',
          updatedAt: now,
        },
        {
          id: 'proposal_replace_quotes',
          kind: 'replace',
          status: 'pending',
          title: '替换诡异细节',
          targetText: '自己莫名其妙知道的很多诡异的细节',
          replacementText: '自己积累的特定领域工具链知识、标准库接口、论文引用等隐性知识',
          updatedAt: now,
        },
      ],
      null,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.changes).toHaveLength(3);
    expect(result.changeSet.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposalId: 'proposal_insert_examples',
          kind: 'insert',
          insertedText: expect.stringContaining('例如@andylokandy随手指出Rust库或标准库接口'),
        }),
        expect.objectContaining({
          proposalId: 'proposal_insert_review',
          kind: 'insert',
          insertedText: expect.stringContaining('AI实际每段核心代码的产出都需要Review'),
        }),
        expect.objectContaining({
          proposalId: 'proposal_replace_quotes',
          kind: 'replace',
          deletedText: '自己“莫名其妙知道的很多诡异的细节”',
        }),
      ]),
    );
  });

  it('keeps same-position inserts readable when grouping an empty draft', () => {
    const draft = '';
    const result = planDistillationProposalChangeSet(
      draft,
      [
        {
          id: 'proposal_1',
          kind: 'insert',
          status: 'pending',
          title: '新增一',
          content: '第一条',
          sourceDraftHash: hashText(draft),
          updatedAt: now,
        },
        {
          id: 'proposal_2',
          kind: 'insert',
          status: 'pending',
          title: '新增二',
          content: '第二条',
          sourceDraftHash: hashText(draft),
          updatedAt: now,
        },
      ],
      null,
    );

    expect(result).toEqual({
      ok: true,
      changeSet: expect.objectContaining({
        draft: '第一条\n第二条',
        changes: [
          expect.objectContaining({ insertedText: '第一条' }),
          expect.objectContaining({ insertedText: '\n第二条' }),
        ],
      }),
    });
  });

  it('recomputes insert spacing when composing a kept subset of grouped changes', () => {
    const draft = '';
    const result = planDistillationProposalChangeSet(
      draft,
      [
        {
          id: 'proposal_1',
          kind: 'insert',
          status: 'pending',
          title: '新增一',
          content: '第一条',
          sourceDraftHash: hashText(draft),
          updatedAt: now,
        },
        {
          id: 'proposal_2',
          kind: 'insert',
          status: 'pending',
          title: '新增二',
          content: '第二条',
          sourceDraftHash: hashText(draft),
          updatedAt: now,
        },
      ],
      null,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      composeDistillationProposalDraftChangeSetEntries(draft, [result.changeSet.changes[1]]),
    ).toBe('第二条');
  });

  it('rejects grouped proposal changes when their draft ranges conflict', () => {
    const result = planDistillationProposalChangeSet(
      '旧判断需要收敛',
      [
        {
          id: 'proposal_1',
          kind: 'replace',
          status: 'pending',
          title: '修改一',
          targetText: '旧判断',
          replacementText: '新判断',
          updatedAt: now,
        },
        {
          id: 'proposal_2',
          kind: 'delete',
          status: 'pending',
          title: '删除一',
          targetText: '旧判断需要',
          updatedAt: now,
        },
      ],
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'conflicting_changes',
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

  it('plans a replace proposal change for draft preview', () => {
    const result = planDistillationProposalChange(
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

    expect(result).toEqual({
      ok: true,
      change: {
        kind: 'replace',
        baseDraft: '旧判断需要收敛',
        draft: '新判断需要收敛',
        range: { start: 0, end: 3 },
        deletedText: '旧判断',
        insertedText: '新判断',
        changeOffset: 0,
        changeLength: 3,
      },
    });
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
      reason: 'target_ambiguous',
    });
  });

  it('inserts after a unique anchor', () => {
    const result = applyDistillationProposalToDraft(
      '第一段\n第二段',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        insertAfterText: '第一段',
        content: '新增段落',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: true,
      draft: '第一段\n新增段落\n第二段',
      changeOffset: 4,
      changeLength: 4,
    });
  });

  it('recovers the insertion anchor when a model writes it into content', () => {
    const result = applyDistillationProposalToDraft(
      '第一段。第二段',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        content: '在“第一段”之后，补充：“新增段落。”',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: true,
      draft: '第一段。\n新增段落。\n第二段',
      changeOffset: 5,
      changeLength: 5,
    });
  });

  it('does not append insert proposals when the anchor is missing', () => {
    const result = applyDistillationProposalToDraft(
      '第一段',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        insertAfterText: '不存在的段落',
        content: '新增段落',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'insert_anchor_not_found',
    });
  });

  it('does not append insert proposals without selection or anchor', () => {
    const result = applyDistillationProposalToDraft(
      '第一段',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        content: '新增段落',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'insert_anchor_not_found',
    });
  });

  it('appends unanchored insert proposals when the source draft is unchanged', () => {
    const draft = '第一段';
    const result = applyDistillationProposalToDraft(
      draft,
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        content: '新增段落',
        sourceDraftHash: hashText(draft),
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: true,
      draft: '第一段\n新增段落',
      changeOffset: 4,
      changeLength: 4,
    });
  });

  it('does not append unanchored insert proposals when the source draft changed', () => {
    const result = applyDistillationProposalToDraft(
      '第一段',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        content: '新增段落',
        sourceDraftHash: hashText('旧草稿'),
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'insert_anchor_not_found',
    });
  });

  it('does not insert duplicate proposal content', () => {
    const result = applyDistillationProposalToDraft(
      '第一段\n新增段落',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        insertAfterText: '第一段',
        content: '新增 段落',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'duplicate_insert',
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

  it('replaces a proposal target when only quote marks differ', () => {
    const result = applyDistillationProposalToDraft(
      '作者自己“莫名其妙知道的很多诡异的细节”需要收敛',
      {
        id: 'proposal_1',
        kind: 'replace',
        status: 'pending',
        title: '修改',
        targetText: '自己莫名其妙知道的很多诡异的细节',
        replacementText: '自己积累的特定领域知识',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: true,
      draft: '作者自己积累的特定领域知识需要收敛',
      changeOffset: 2,
      changeLength: 11,
    });
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

  it('plans a delete proposal change for draft preview', () => {
    const result = planDistillationProposalChange(
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

    expect(result).toEqual({
      ok: true,
      change: {
        kind: 'delete',
        baseDraft: '保留。删除这句。继续。',
        draft: '保留。继续。',
        range: { start: 3, end: 8 },
        deletedText: '删除这句。',
        changeOffset: 3,
        changeLength: 0,
      },
    });
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

function draftTextarea() {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    '.annotation-sedimentation-document textarea',
  );
  if (!textarea) {
    throw new Error('Draft textarea not found');
  }
  return textarea;
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
    {
      id: 'agent_2',
      kind: 'review',
      providerId: 'provider_1',
      nickname: '梁证言',
      username: 'liang',
      avatar: '',
      annotationColor: '#8ab4f8',
      annotationDensity: 'medium',
      temperature: 0.4,
      soul: '',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
