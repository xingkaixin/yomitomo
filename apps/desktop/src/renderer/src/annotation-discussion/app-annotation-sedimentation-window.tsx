import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Check,
  MessageCircleQuestion,
  RotateCcw,
  Send,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import type {
  Agent,
  Annotation,
  AnnotationDistillationProposal,
  AnnotationDistillationReviewMessage,
  AnnotationDistillationReviewSession,
  ArticleRecord,
  Comment,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import { makeId, renderMarkdown } from '@yomitomo/shared';
import { applyAppTheme, readCachedThemeId, themeRegistry } from '../theme/app-theme';
import { FloatingComposer } from '@yomitomo/reader-ui/floating-composer';
import { promptArticle, publicReviewAgents } from '../source/bookcase/app-source-bookcase-shared';
import { articlePlainText } from '../shell/app-utils';
import {
  AgentAvatarStack,
  AvatarBadge,
  ReaderTooltip,
  SubmitShortcutTooltipContent,
} from '@yomitomo/reader-ui/reader-component-primitives';
import {
  getShortcutModifier,
  isMessageSendShortcutEvent,
} from '@yomitomo/reader-ui/reader-shortcuts';
import {
  applyAssistantRuntimeProgress,
  AssistantRuntimeProgressList,
} from '../shell/app-assistant-runtime-progress';
import { useSourceAwareWindowTransition } from '../shell/app-window-transition';
import {
  applyDistillationProposalToDraft,
  updateReviewProposalStatus,
  type DraftSelectionSnapshot,
} from './app-annotation-sedimentation-proposals';

type SedimentationWindowStatus =
  | { type: 'loading' }
  | { type: 'ready'; agents: Agent[]; article: ArticleRecord; annotation: Annotation }
  | { type: 'missing' }
  | { type: 'error'; message: string };

export function AnnotationSedimentationWindowApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const articleId = params.get('articleId') || '';
  const annotationId = params.get('annotationId') || '';
  const [status, setStatus] = useState<SedimentationWindowStatus>({ type: 'loading' });
  const windowTransition = useSourceAwareWindowTransition(params);

  useEffect(() => {
    const syncTheme = () => applyAppTheme(themeRegistry[readCachedThemeId()]);
    window.addEventListener('storage', syncTheme);
    window.addEventListener('focus', syncTheme);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('focus', syncTheme);
    };
  }, []);

  useEffect(() => {
    document.title = status.type === 'ready' ? sedimentationWindowTitle(status.annotation) : '沉淀';
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    if (!articleId || !annotationId) {
      setStatus({ type: 'missing' });
      return;
    }

    void Promise.all([
      window.yomitomoDesktop.getArticle(articleId),
      window.yomitomoDesktop.getState(),
    ])
      .then(([article, store]) => {
        if (cancelled) return;
        const annotation = article?.annotations.find((item) => item.id === annotationId);
        setStatus(
          article && annotation
            ? { type: 'ready', agents: store.agents, article, annotation }
            : { type: 'missing' },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({
          type: 'error',
          message: error instanceof Error ? error.message : '沉淀窗口加载失败',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [annotationId, articleId]);

  if (status.type !== 'ready') {
    return (
      <SedimentationEmptyState
        status={status}
        className={windowTransition.className}
        style={windowTransition.style}
      />
    );
  }
  return (
    <SedimentationShell
      status={status}
      style={windowTransition.style}
      className={windowTransition.className}
      onStatusChange={setStatus}
    />
  );
}

function SedimentationShell({
  className,
  status,
  style,
  onStatusChange,
}: {
  className: string;
  status: Extract<SedimentationWindowStatus, { type: 'ready' }>;
  style: CSSProperties;
  onStatusChange: (status: SedimentationWindowStatus) => void;
}) {
  const { agents, article, annotation } = status;
  const reviewAgents = useMemo(() => publicReviewAgents(agents), [agents]);
  const userProfile = sedimentationUserProfile(annotation, article);
  const [activeAgentIds, setActiveAgentIds] = useState<Set<string>>(
    () => new Set(reviewAgents[0] ? [reviewAgents[0].id] : []),
  );
  const activeAgents = reviewAgents.filter((agent) => activeAgentIds.has(agent.id));
  const [draft, setDraft] = useState(() => initialDistillationDraft(article.id, annotation));
  const [reviewDraft, setReviewDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewNotice, setReviewNotice] = useState('');
  const draftKey = distillationDraftKey(article.id, annotation.id);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftSelectionRef = useRef<DraftSelectionSnapshot | null>(null);
  const reviewTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shortcutModifier = getShortcutModifier();
  const messageSendShortcut = 'mod-enter' as const;
  const canPublish = Boolean(draft.trim()) && !saving;
  const canReview = activeAgents.length > 0 && !reviewing;
  const sessions = annotation.distillation?.reviewSessions || [];
  const isPublished = annotation.distillation?.status === 'published';
  const statusLabel = isPublished ? '已发布' : '草稿';
  const publishLabel = isPublished ? '更新发布' : '发布沉淀';
  const canUnpublish = isPublished && !saving;

  useEffect(() => {
    setActiveAgentIds((current) => {
      const available = new Set(reviewAgents.map((agent) => agent.id));
      const next = new Set(Array.from(current).filter((id) => available.has(id)));
      if (next.size === 0 && reviewAgents[0]) next.add(reviewAgents[0].id);
      return sameSet(current, next) ? current : next;
    });
  }, [reviewAgents]);

  useEffect(() => {
    window.localStorage.setItem(draftKey, draft);
  }, [draft, draftKey]);

  async function publishDistillation() {
    const content = draft.trim();
    if (!content) return;
    const transition = isPublished ? 'update' : 'publish';
    setSaving(true);
    try {
      const nextArticle = updateAnnotation(article, annotation.id, (current) => ({
        ...current,
        distillation: {
          ...current.distillation,
          status: 'published',
          content,
          publishedAt: current.distillation?.publishedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          reviewSessions: current.distillation?.reviewSessions,
        },
        updatedAt: new Date().toISOString(),
      }));
      const nextAnnotation = await saveAndRefresh(
        nextArticle,
        agents,
        annotation.id,
        onStatusChange,
      );
      const nextDistillation =
        nextAnnotation?.distillation ||
        nextArticle.annotations.find((item) => item.id === annotation.id)?.distillation;
      window.localStorage.removeItem(draftKey);
      await window.yomitomoDesktop.commitAnnotationSedimentation({
        articleId: article.id,
        annotationId: annotation.id,
        distillation: nextDistillation,
        transition,
      });
    } finally {
      setSaving(false);
    }
  }

  async function unpublishDistillation() {
    if (!isPublished || saving) return;
    setSaving(true);
    try {
      const nextArticle = updateAnnotation(article, annotation.id, (current) => ({
        ...current,
        distillation: {
          ...current.distillation,
          status: 'unpublished',
          content: current.distillation?.content || draft.trim(),
          publishedAt: current.distillation?.publishedAt,
          updatedAt: new Date().toISOString(),
          reviewSessions: current.distillation?.reviewSessions,
        },
        updatedAt: new Date().toISOString(),
      }));
      const nextAnnotation = await saveAndRefresh(
        nextArticle,
        agents,
        annotation.id,
        onStatusChange,
      );
      const nextDistillation =
        nextAnnotation?.distillation ||
        nextArticle.annotations.find((item) => item.id === annotation.id)?.distillation;
      await window.yomitomoDesktop.commitAnnotationSedimentation({
        articleId: article.id,
        annotationId: annotation.id,
        distillation: nextDistillation,
        transition: 'unpublish',
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleReviewAgent(agent: PublicAgent) {
    setActiveAgentIds((current) => {
      const next = new Set(current);
      if (next.has(agent.id)) {
        if (next.size === 1) {
          setReviewNotice('至少选择一个审阅助手');
          return current;
        }
        next.delete(agent.id);
      } else {
        next.add(agent.id);
      }
      setReviewNotice('');
      return next;
    });
  }

  async function submitReviewRound(input?: {
    reviewDraftOverride?: string;
    reviewMode?: 'review' | 'organize_discussion';
  }) {
    if (activeAgents.length === 0 || reviewing) return;
    setReviewing(true);
    setReviewNotice('');
    const effectiveReviewDraft = input?.reviewDraftOverride ?? reviewDraft;
    if (!input?.reviewDraftOverride) setReviewDraft('');
    try {
      const now = new Date().toISOString();
      const userMessage = effectiveReviewDraft.trim()
        ? ({
            id: makeId('distillation_review_message'),
            author: 'user',
            content: effectiveReviewDraft.trim(),
            createdAt: now,
          } satisfies AnnotationDistillationReviewMessage)
        : undefined;
      let workingArticle = article;
      let workingAnnotation = annotation;
      for (const agent of activeAgents) {
        const result = await requestAgentReviewRound({
          agent,
          article: workingArticle,
          annotation: workingAnnotation,
          draft,
          reviewDraft: effectiveReviewDraft,
          reviewMode: input?.reviewMode || 'review',
          sessions,
          userMessage,
          onOptimisticSession: (session) => {
            const nextAnnotation = annotationWithReviewSession(workingAnnotation, session);
            onStatusChange({
              type: 'ready',
              agents,
              article: updateAnnotation(workingArticle, workingAnnotation.id, () => nextAnnotation),
              annotation: nextAnnotation,
            });
          },
        });
        workingAnnotation = result.annotation;
        workingArticle = updateAnnotation(
          workingArticle,
          workingAnnotation.id,
          () => result.annotation,
        );
      }
      await saveAndRefresh(workingArticle, agents, annotation.id, onStatusChange);
    } catch (error) {
      setReviewNotice(error instanceof Error ? error.message : '审阅失败');
    } finally {
      setReviewing(false);
    }
  }

  function organizeDiscussion() {
    void submitReviewRound({
      reviewMode: 'organize_discussion',
      reviewDraftOverride:
        '请整理当前高亮、想法和审阅讨论，生成可直接加入沉淀稿的新增建议。只给新增建议，不要修改或删除现有草稿。',
    });
  }

  function recordDraftSelection() {
    const textarea = draftTextareaRef.current;
    if (!textarea) return;
    draftSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }

  async function handleProposalAccept(messageId: string, proposal: AnnotationDistillationProposal) {
    if (proposal.status !== 'pending') return;
    const result = applyDistillationProposalToDraft(draft, proposal, draftSelectionRef.current);
    if (!result.ok) {
      setReviewNotice(result.reason);
      return;
    }
    setDraft(result.draft);
    await updateProposalStatus(messageId, proposal.id, 'accepted');
    setReviewNotice('');
  }

  async function handleProposalIgnore(messageId: string, proposalId: string) {
    await updateProposalStatus(messageId, proposalId, 'ignored');
    setReviewNotice('');
  }

  async function handleProposalRestore(messageId: string, proposalId: string) {
    await updateProposalStatus(messageId, proposalId, 'pending');
    setReviewNotice('');
  }

  async function updateProposalStatus(
    messageId: string,
    proposalId: string,
    proposalStatus: AnnotationDistillationProposal['status'],
  ) {
    const nextSessions = updateReviewProposalStatus(
      annotation.distillation?.reviewSessions || [],
      messageId,
      proposalId,
      proposalStatus,
      new Date().toISOString(),
    );
    const nextArticle = updateAnnotation(article, annotation.id, (current) => ({
      ...current,
      distillation: {
        status: current.distillation?.status || 'unpublished',
        content: current.distillation?.content || '',
        publishedAt: current.distillation?.publishedAt,
        updatedAt: new Date().toISOString(),
        reviewSessions: nextSessions,
      },
      updatedAt: new Date().toISOString(),
    }));
    await saveAndRefresh(nextArticle, agents, annotation.id, onStatusChange);
  }

  return (
    <main
      className={[sedimentationWindowClassName(), className].filter(Boolean).join(' ')}
      style={style}
    >
      <section className="annotation-sedimentation-quote" aria-label="批注引文">
        <span aria-hidden="true">“</span>
        <p>{annotation.anchor.exact}</p>
      </section>
      <section className="annotation-sedimentation-body">
        <section className="annotation-sedimentation-document" aria-label="沉淀稿件">
          <header>
            <div className="annotation-sedimentation-document-title">
              <strong>沉淀稿</strong>
              <span
                className={`annotation-sedimentation-status is-${isPublished ? 'published' : 'draft'}`}
              >
                {statusLabel}
              </span>
            </div>
            <div className="annotation-sedimentation-document-actions">
              {isPublished ? (
                <ReaderTooltip content="取消发布后保留沉淀稿和审阅记录">
                  <button
                    className="is-secondary"
                    type="button"
                    disabled={!canUnpublish}
                    onClick={() => void unpublishDistillation()}
                  >
                    <RotateCcw size={15} />
                    <span>取消发布</span>
                  </button>
                </ReaderTooltip>
              ) : null}
              <ReaderTooltip content="让当前审阅助手把讨论整理成可采纳的新增建议">
                <button
                  className="is-secondary"
                  type="button"
                  disabled={!canReview}
                  onClick={organizeDiscussion}
                >
                  <Sparkles size={15} />
                  <span>整理讨论</span>
                </button>
              </ReaderTooltip>
              <ReaderTooltip
                content={
                  <SubmitShortcutTooltipContent
                    label={publishLabel}
                    shortcut={messageSendShortcut}
                    shortcutModifier={shortcutModifier}
                  />
                }
              >
                <button
                  type="button"
                  disabled={!canPublish}
                  onClick={() => void publishDistillation()}
                >
                  <UploadCloud size={15} />
                  <span>{publishLabel}</span>
                </button>
              </ReaderTooltip>
            </div>
          </header>
          <textarea
            ref={draftTextareaRef}
            value={draft}
            placeholder="写下你想沉淀的判断、框架、问题或可迁移的提醒..."
            onChange={(event) => {
              setDraft(event.target.value);
              recordDraftSelection();
            }}
            onClick={recordDraftSelection}
            onKeyDown={(event) => {
              if (!isMessageSendShortcutEvent(event, messageSendShortcut)) return;
              event.preventDefault();
              void publishDistillation();
            }}
            onKeyUp={recordDraftSelection}
            onSelect={recordDraftSelection}
          />
        </section>

        <aside className="annotation-sedimentation-review-panel" aria-label="审阅讨论区">
          <header>
            <div>
              <strong>审阅讨论</strong>
              <span>{reviewNotice || '选择至少一个审阅助手，然后围绕沉淀稿沟通'}</span>
            </div>
          </header>
          <ReviewSessions
            sessions={sessions}
            userProfile={userProfile}
            onProposalAccept={handleProposalAccept}
            onProposalIgnore={handleProposalIgnore}
            onProposalRestore={handleProposalRestore}
          />
          <footer>
            <FloatingComposer
              ref={reviewTextareaRef}
              className="annotation-sedimentation-review-composer"
              accessory={
                <div
                  className="annotation-sedimentation-review-composer-accessory"
                  aria-label="审阅助手"
                >
                  <AgentAvatarStack
                    agents={reviewAgents}
                    activeAgentIds={activeAgentIds}
                    ariaLabel="审阅助手"
                    className={reviewing ? 'is-reviewing' : ''}
                    revealLabelOnDoubleClick={false}
                    onAgentClick={toggleReviewAgent}
                  />
                </div>
              }
              submitDisabled={!canReview}
              submitIcon={<Send size={14} />}
              submitLabel="发送"
              submitTooltip={
                <SubmitShortcutTooltipContent
                  label="发送审阅请求"
                  shortcut={messageSendShortcut}
                  shortcutModifier={shortcutModifier}
                />
              }
              textarea={{
                value: reviewDraft,
                placeholder: '让已选审阅助手讨论这份沉淀...',
                rows: 2,
                onChange: (event) => setReviewDraft(event.target.value),
                onKeyDown: (event) => {
                  if (!isMessageSendShortcutEvent(event, messageSendShortcut)) return;
                  event.preventDefault();
                  void submitReviewRound();
                },
              }}
              onSubmit={() => void submitReviewRound()}
            />
          </footer>
        </aside>
      </section>
    </main>
  );
}

async function requestAgentReviewRound({
  agent,
  article,
  annotation,
  draft,
  reviewDraft,
  reviewMode,
  sessions,
  userMessage,
  onOptimisticSession,
}: {
  agent: PublicAgent;
  article: ArticleRecord;
  annotation: Annotation;
  draft: string;
  reviewDraft: string;
  reviewMode: 'review' | 'organize_discussion';
  sessions: AnnotationDistillationReviewSession[];
  userMessage?: AnnotationDistillationReviewMessage;
  onOptimisticSession: (session: AnnotationDistillationReviewSession) => void;
}) {
  const now = new Date().toISOString();
  const session = existingSessionForAgent(sessions, agent) || createReviewSession(agent, now);
  const assistantMessage: AnnotationDistillationReviewMessage = {
    id: makeId('distillation_review_message'),
    author: 'ai',
    content: '',
    createdAt: now,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
  };
  let workingSession = {
    ...session,
    messages: [...session.messages, ...(userMessage ? [userMessage] : []), assistantMessage],
    updatedAt: now,
  };
  onOptimisticSession(workingSession);

  const finalMessage = await window.yomitomoDesktop.requestAgentDistillationReviewStream(
    {
      agentId: agent.id,
      agentUsername: agent.username,
      reviewMessageId: assistantMessage.id,
      distillationReviewMode: reviewMode,
      instruction: distillationReviewInstruction(draft, reviewDraft, session),
      article: promptArticle(article, articlePlainText(article)),
      annotation,
      userComment: reviewRequestComment(userMessage, now),
    },
    (event) => {
      if (event.type === 'start') return;
      if (event.type === 'progress') {
        workingSession = updateSessionMessage(workingSession, assistantMessage.id, (message) =>
          Object.assign({}, message, {
            assistantProgress: applyAssistantRuntimeProgress(
              message.assistantProgress,
              event.progress,
            ),
          }),
        );
        onOptimisticSession(workingSession);
        return;
      }
      if (event.type !== 'delta') return;
      workingSession = updateSessionMessage(workingSession, assistantMessage.id, (message) =>
        Object.assign({}, message, { content: `${message.content}${event.delta}` }),
      );
      onOptimisticSession(workingSession);
    },
  );
  workingSession = updateSessionMessage(workingSession, assistantMessage.id, (message) =>
    Object.assign({}, message, {
      content:
        finalMessage.content ||
        workingSession.messages.find((item) => item.id === assistantMessage.id)?.content ||
        '',
      proposals: finalMessage.proposals || message.proposals || [],
    }),
  );

  return {
    annotation: annotationWithReviewSession(annotation, workingSession),
  };
}

function ReviewSessions({
  onProposalAccept,
  onProposalIgnore,
  onProposalRestore,
  sessions,
  userProfile,
}: {
  onProposalAccept: (
    messageId: string,
    proposal: AnnotationDistillationProposal,
  ) => void | Promise<void>;
  onProposalIgnore: (messageId: string, proposalId: string) => void | Promise<void>;
  onProposalRestore: (messageId: string, proposalId: string) => void | Promise<void>;
  sessions: AnnotationDistillationReviewSession[];
  userProfile: UserProfile;
}) {
  const messages = reviewTimelineMessages(sessions);
  const listRef = useRef<HTMLElement | null>(null);
  const scrollSignal = messages
    .map(
      (item) => `${item.key}:${item.message.content.length}:${item.message.proposals?.length || 0}`,
    )
    .join('|');

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [scrollSignal]);

  if (sessions.length === 0) {
    return (
      <section className="annotation-sedimentation-review-empty">
        <MessageCircleQuestion size={22} />
        <strong>还没有审阅讨论</strong>
        <p>选择审阅助手，直接发送即可开始。</p>
      </section>
    );
  }

  return (
    <section
      ref={listRef}
      className={[
        'annotation-sedimentation-review-list',
        'annotation-discussion-messages',
        'is-left-aligned',
      ].join(' ')}
      aria-label="审阅会话"
    >
      {messages.map((message) => (
        <ReviewTimelineMessage
          item={message}
          key={message.key}
          userProfile={userProfile}
          onProposalAccept={onProposalAccept}
          onProposalIgnore={onProposalIgnore}
          onProposalRestore={onProposalRestore}
        />
      ))}
    </section>
  );
}

type ReviewTimelineItem = {
  key: string;
  message: AnnotationDistillationReviewMessage;
};

function ReviewTimelineMessage({
  item,
  onProposalAccept,
  onProposalIgnore,
  onProposalRestore,
  userProfile,
}: {
  item: ReviewTimelineItem;
  onProposalAccept: (
    messageId: string,
    proposal: AnnotationDistillationProposal,
  ) => void | Promise<void>;
  onProposalIgnore: (messageId: string, proposalId: string) => void | Promise<void>;
  onProposalRestore: (messageId: string, proposalId: string) => void | Promise<void>;
  userProfile: UserProfile;
}) {
  const { message } = item;
  const isUser = message.author === 'user';
  const avatar = isUser ? userProfile.avatar : message.agentAvatar;
  const nickname = isUser
    ? userProfile.nickname
    : message.agentNickname || message.agentUsername || '审阅助手';
  const fallback = isUser ? userProfile.nickname.slice(0, 1) || '我' : nickname.slice(0, 1) || '审';
  const className = [
    'annotation-discussion-message',
    'annotation-sedimentation-review-message',
    isUser ? 'is-user' : 'is-assistant',
  ].join(' ');

  return (
    <article className={className}>
      <AvatarBadge avatar={avatar} fallback={fallback} />
      <div className="annotation-discussion-message-bubble">
        <header>
          <strong>{nickname}</strong>
          <ReaderTooltip content={formatAbsoluteTime(message.createdAt)}>
            <time dateTime={message.createdAt} tabIndex={0}>
              {formatRelativeTime(message.createdAt)}
            </time>
          </ReaderTooltip>
        </header>
        <AssistantRuntimeProgressList progress={message.assistantProgress} />
        <div
          className="annotation-discussion-markdown"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(message.content || '正在审阅...'),
          }}
        />
        {!isUser && message.proposals?.length ? (
          <ReviewProposalList
            messageId={message.id}
            proposals={message.proposals}
            onAccept={onProposalAccept}
            onIgnore={onProposalIgnore}
            onRestore={onProposalRestore}
          />
        ) : null}
      </div>
    </article>
  );
}

function ReviewProposalList({
  messageId,
  onAccept,
  onIgnore,
  onRestore,
  proposals,
}: {
  messageId: string;
  onAccept: (messageId: string, proposal: AnnotationDistillationProposal) => void | Promise<void>;
  onIgnore: (messageId: string, proposalId: string) => void | Promise<void>;
  onRestore: (messageId: string, proposalId: string) => void | Promise<void>;
  proposals: AnnotationDistillationProposal[];
}) {
  return (
    <section className="annotation-sedimentation-proposals" aria-label="稿件修改建议">
      {proposals.map((proposal) => (
        <article
          className={[
            'annotation-sedimentation-proposal',
            `is-${proposal.status}`,
            `is-${proposal.kind}`,
          ].join(' ')}
          key={proposal.id}
        >
          <div className="annotation-sedimentation-proposal-main">
            <header>
              <span>{proposalKindLabel(proposal.kind)}</span>
              <strong>{proposal.title}</strong>
            </header>
            {proposal.rationale ? <p>{proposal.rationale}</p> : null}
            <blockquote>{proposalPreview(proposal)}</blockquote>
          </div>
          <div className="annotation-sedimentation-proposal-actions">
            {proposal.status === 'pending' ? (
              <>
                <button type="button" onClick={() => void onAccept(messageId, proposal)}>
                  <Check size={14} />
                  <span>采纳</span>
                </button>
                <button
                  className="is-secondary"
                  type="button"
                  onClick={() => void onIgnore(messageId, proposal.id)}
                >
                  <X size={14} />
                  <span>忽略</span>
                </button>
              </>
            ) : null}
            {proposal.status === 'ignored' ? (
              <button
                className="is-secondary"
                type="button"
                onClick={() => void onRestore(messageId, proposal.id)}
              >
                <RotateCcw size={14} />
                <span>恢复</span>
              </button>
            ) : null}
            {proposal.status === 'accepted' ? (
              <span className="annotation-sedimentation-proposal-state">已采纳</span>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}

function proposalKindLabel(kind: AnnotationDistillationProposal['kind']) {
  if (kind === 'insert') return '新增';
  if (kind === 'replace') return '修改';
  return '删除';
}

function proposalPreview(proposal: AnnotationDistillationProposal) {
  if (proposal.kind === 'insert') return proposal.content || '';
  if (proposal.kind === 'replace') {
    return `${proposal.targetText || ''}\n→\n${proposal.replacementText || ''}`;
  }
  return proposal.targetText || '';
}

function reviewTimelineMessages(
  sessions: AnnotationDistillationReviewSession[],
): ReviewTimelineItem[] {
  const seenUserMessages = new Set<string>();
  const items: ReviewTimelineItem[] = [];

  for (const session of sessions) {
    for (const message of session.messages) {
      if (message.author === 'user') {
        const userKey = `user:${message.id}`;
        if (seenUserMessages.has(userKey)) continue;
        seenUserMessages.add(userKey);
        items.push({ key: userKey, message });
        continue;
      }

      items.push({
        key: `assistant:${session.id}:${message.id}`,
        message: {
          ...message,
          agentId: message.agentId || session.agentId,
          agentUsername: message.agentUsername || session.agentUsername,
          agentNickname: message.agentNickname || session.agentNickname,
          agentAvatar: message.agentAvatar || session.agentAvatar,
        },
      });
    }
  }

  return items.toSorted((left, right) => {
    const timeDelta = timestamp(left.message.createdAt) - timestamp(right.message.createdAt);
    if (timeDelta !== 0) return timeDelta;
    if (left.message.author !== right.message.author)
      return left.message.author === 'user' ? -1 : 1;
    return left.key.localeCompare(right.key);
  });
}

function SedimentationEmptyState({
  className,
  status,
  style,
}: {
  className: string;
  status: Exclude<SedimentationWindowStatus, { type: 'ready' }>;
  style: CSSProperties;
}) {
  return (
    <main
      className={[sedimentationWindowClassName(), className].filter(Boolean).join(' ')}
      style={style}
    >
      <section className="annotation-sedimentation-empty">
        <strong>{status.type === 'loading' ? '正在加载沉淀窗口' : '无法打开沉淀窗口'}</strong>
        <p>{status.type === 'error' ? status.message : '这条批注或文章不存在。'}</p>
      </section>
    </main>
  );
}

async function saveAndRefresh(
  nextArticle: ArticleRecord,
  agents: Agent[],
  annotationId: string,
  onStatusChange: (status: SedimentationWindowStatus) => void,
): Promise<Annotation | null> {
  const patch = await window.yomitomoDesktop.saveArticle(nextArticle);
  const nextFullArticle = await window.yomitomoDesktop.getArticle(patch.article.id);
  const nextAnnotation = nextFullArticle?.annotations.find((item) => item.id === annotationId);
  if (!nextFullArticle || !nextAnnotation) return null;
  onStatusChange({ type: 'ready', agents, article: nextFullArticle, annotation: nextAnnotation });
  return nextAnnotation;
}

function updateAnnotation(
  article: ArticleRecord,
  annotationId: string,
  update: (annotation: Annotation) => Annotation,
) {
  return {
    ...article,
    annotations: article.annotations.map((item) =>
      item.id === annotationId ? update(item) : item,
    ),
    updatedAt: new Date().toISOString(),
  };
}

function annotationWithReviewSession(
  annotation: Annotation,
  session: AnnotationDistillationReviewSession,
) {
  const sessions = annotation.distillation?.reviewSessions || [];
  const nextSessions = sessions.some((item) => item.id === session.id)
    ? sessions.map((item) => (item.id === session.id ? session : item))
    : [...sessions, session];
  return {
    ...annotation,
    distillation: {
      status: annotation.distillation?.status || 'unpublished',
      content: annotation.distillation?.content || '',
      publishedAt: annotation.distillation?.publishedAt,
      updatedAt: new Date().toISOString(),
      reviewSessions: nextSessions,
    },
  } satisfies Annotation;
}

function existingSessionForAgent(
  sessions: AnnotationDistillationReviewSession[],
  agent: PublicAgent,
) {
  return sessions.find((session) => session.agentId === agent.id);
}

function createReviewSession(agent: PublicAgent, now: string): AnnotationDistillationReviewSession {
  return {
    id: makeId('distillation_review'),
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function updateSessionMessage(
  session: AnnotationDistillationReviewSession,
  messageId: string,
  update: (message: AnnotationDistillationReviewMessage) => AnnotationDistillationReviewMessage,
) {
  return {
    ...session,
    messages: session.messages.map((message) =>
      message.id === messageId ? update(message) : message,
    ),
    updatedAt: new Date().toISOString(),
  };
}

function reviewRequestComment(
  message: AnnotationDistillationReviewMessage | undefined,
  createdAt: string,
): Comment {
  return {
    id: message?.id || makeId('distillation_review_request'),
    author: 'user',
    content: message?.content || '请基于当前稿件和整条批注讨论，给出审阅意见。',
    createdAt: message?.createdAt || createdAt,
  };
}

function distillationReviewInstruction(
  draft: string,
  reviewDraft: string,
  session: AnnotationDistillationReviewSession,
) {
  const transcript = session.messages
    .map((message) => `${message.author === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n');
  return [
    `当前沉淀稿：\n${draft.trim() || '（用户还没有写沉淀稿）'}`,
    `本轮用户请求：\n${reviewDraft.trim() || '请主动审阅当前沉淀方向。'}`,
    transcript ? `此前审阅讨论：\n${transcript}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function initialDistillationDraft(articleId: string, annotation: Annotation) {
  return (
    window.localStorage.getItem(distillationDraftKey(articleId, annotation.id)) ||
    annotation.distillation?.content ||
    ''
  );
}

function distillationDraftKey(articleId: string, annotationId: string) {
  return `annotation-distillation-draft:${articleId}:${annotationId}`;
}

function sameSet(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function sedimentationWindowClassName() {
  return ['annotation-sedimentation-window', `is-${window.yomitomoDesktop.platform ?? 'unknown'}`]
    .filter(Boolean)
    .join(' ');
}

function sedimentationWindowTitle(annotation: Annotation) {
  const quote = compactTitleText(annotation.anchor.exact);
  return quote ? `沉淀 - ${quote}` : '沉淀';
}

function compactTitleText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 34 ? `${normalized.slice(0, 34)}...` : normalized;
}

function timestamp(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function formatRelativeTime(value: string) {
  const deltaMs = Date.now() - timestamp(value);
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (deltaMs < minute) return '刚刚';
  if (deltaMs < hour) return `${Math.floor(deltaMs / minute)} 分钟前`;
  if (deltaMs < day) return `${Math.floor(deltaMs / hour)} 小时前`;
  if (deltaMs < day * 7) return `${Math.floor(deltaMs / day)} 天前`;
  return formatAbsoluteTime(value);
}

function formatAbsoluteTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function sedimentationUserProfile(annotation: Annotation, article: ArticleRecord): UserProfile {
  return {
    id: annotation.userId || 'user',
    nickname: annotation.userNickname || '我',
    username: annotation.userUsername || 'user',
    avatar: annotation.userAvatar || '',
    annotationColor: annotation.userAnnotationColor || annotation.color,
    updatedAt: article.updatedAt,
  };
}
