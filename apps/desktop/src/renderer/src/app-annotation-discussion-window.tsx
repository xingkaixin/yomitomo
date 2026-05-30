import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
  type ReactNode,
} from 'react';
import {
  ChevronDown,
  GitPullRequestDraft,
  MessageCircle,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Agent,
  Annotation,
  ArticleRecord,
  Comment,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import { makeId, renderMarkdown } from '@yomitomo/shared';
import {
  appendAnnotationComment,
  commentPersona,
  createUserComment,
  findMentionedAgents,
  getMentionQuery,
  sortAnnotations,
  updateAnnotationComment,
} from '@yomitomo/core';
import { applyAppTheme, readCachedThemeId, themeRegistry } from './app-theme';
import { FloatingComposer } from './app-floating-composer';
import {
  agentInstructionFromNote,
  mentionDirectivesForAgent,
  promptArticle,
  publicAnnotationAgents,
} from './app-source-bookcase-shared';
import { runSourceAgentCommentRequest } from './app-source-agent-comment-request';
import { articlePlainText } from './app-utils';
import {
  matchesAgentMentionQuery,
  mentionDraftWithAgent,
} from '@yomitomo/reader-ui/reader-mention-utils';
import {
  AgentAvatarStack,
  AvatarBadge,
  ReaderTooltip,
  ShortcutTooltipContent,
  SubmitShortcutTooltipContent,
} from '@yomitomo/reader-ui/reader-component-primitives';
import {
  getShortcutModifier,
  isMessageSendShortcutEvent,
} from '@yomitomo/reader-ui/reader-shortcuts';
import {
  AnnotationLayoutControl,
  type AnnotationMessageLayoutMode,
} from './app-annotation-layout-control';

type DiscussionLayoutMode = AnnotationMessageLayoutMode;
const DISCUSSION_DELETE_HOLD_MS = 900;

type DiscussionWindowStatus =
  | { type: 'loading' }
  | { type: 'ready'; agents: Agent[]; article: ArticleRecord; annotation: Annotation }
  | { type: 'missing' }
  | { type: 'error'; message: string };

export function AnnotationDiscussionWindowApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const articleId = params.get('articleId') || '';
  const annotationId = params.get('annotationId') || '';
  const [status, setStatus] = useState<DiscussionWindowStatus>({ type: 'loading' });
  const className = annotationDiscussionWindowClassName();

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
    document.title = status.type === 'ready' ? discussionWindowTitle(status) : '批注讨论';
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
          message: error instanceof Error ? error.message : '讨论窗口加载失败',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [annotationId, articleId]);

  if (status.type === 'ready') {
    return (
      <AnnotationDiscussionShell
        agents={status.agents}
        article={status.article}
        annotation={status.annotation}
        className={className}
      />
    );
  }

  const message =
    status.type === 'loading'
      ? '正在载入批注讨论'
      : status.type === 'missing'
        ? '找不到这条批注讨论'
        : status.message;

  return (
    <main className={className}>
      <section className="annotation-discussion-empty" aria-busy={status.type === 'loading'}>
        <MessageCircle size={24} />
        <strong>{message}</strong>
      </section>
    </main>
  );
}

function AnnotationDiscussionShell({
  agents,
  annotation,
  article,
  className,
}: {
  agents: Agent[];
  annotation: Annotation;
  article: ArticleRecord;
  className: string;
}) {
  const [currentArticle, setCurrentArticle] = useState(article);
  const [currentAnnotation, setCurrentAnnotation] = useState(annotation);
  const [pinnedThoughtIds, setPinnedThoughtIds] = useState<Set<string>>(() => new Set());
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<DiscussionLayoutMode>('split');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyCaretIndex, setReplyCaretIndex] = useState(0);
  const [newThoughtDraft, setNewThoughtDraft] = useState('');
  const [newThoughtOpen, setNewThoughtOpen] = useState(false);
  const [newThoughtMode, setNewThoughtMode] = useState<'self' | 'assistant'>('self');
  const [newThoughtCaretIndex, setNewThoughtCaretIndex] = useState(0);
  const [submittingThought, setSubmittingThought] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [sendError, setSendError] = useState('');
  const [removed, setRemoved] = useState(false);
  const annotationsRef = useRef<Annotation[]>(article.annotations);
  const currentArticleRef = useRef(article);

  useEffect(() => {
    setCurrentArticle(article);
    setCurrentAnnotation(annotation);
    setRemoved(false);
  }, [annotation]);

  useEffect(() => {
    annotationsRef.current = currentArticle.annotations;
    currentArticleRef.current = currentArticle;
  }, [currentArticle]);

  const annotationAgents = useMemo(() => publicAnnotationAgents(agents), [agents]);
  const userProfile = annotationUserProfile(currentAnnotation, currentArticle);
  const threads = useMemo(
    () => discussionThreads(currentAnnotation, pinnedThoughtIds),
    [currentAnnotation, pinnedThoughtIds],
  );
  const selectedThread =
    threads.find((thread) => thread.root.id === selectedThoughtId) || threads[0] || null;
  const replies = currentAnnotation.comments.length - threads.length;

  useEffect(() => {
    if (!threads.length) {
      setSelectedThoughtId(null);
      return;
    }
    setSelectedThoughtId((current) =>
      current && threads.some((thread) => thread.root.id === current)
        ? current
        : threads[0].root.id,
    );
  }, [threads]);

  async function deleteComment(commentId: string) {
    if (deletingCommentId) return;
    setDeletingCommentId(commentId);
    try {
      await window.yomitomoDesktop.deleteArticleComment(
        article.id,
        currentAnnotation.id,
        commentId,
      );
      const nextArticle = await window.yomitomoDesktop.getArticle(article.id);
      const nextAnnotation = nextArticle?.annotations.find(
        (item) => item.id === currentAnnotation.id,
      );
      if (!nextArticle || !nextAnnotation) {
        setRemoved(true);
        return;
      }
      setCurrentArticle(nextArticle);
      setCurrentAnnotation(nextAnnotation);
      setPinnedThoughtIds((current) => {
        if (!current.has(commentId)) return current;
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    } finally {
      setDeletingCommentId(null);
    }
  }

  function applyAnnotations(annotations: Annotation[]) {
    const sortedAnnotations = sortAnnotations(annotations);
    const nextAnnotation = sortedAnnotations.find((item) => item.id === currentAnnotation.id);
    if (!nextAnnotation) {
      setRemoved(true);
      return null;
    }
    const nextArticle = {
      ...currentArticleRef.current,
      annotations: sortedAnnotations,
      updatedAt: new Date().toISOString(),
    };
    annotationsRef.current = sortedAnnotations;
    currentArticleRef.current = nextArticle;
    setCurrentArticle(nextArticle);
    setCurrentAnnotation(nextAnnotation);
    return nextArticle;
  }

  async function saveAnnotations(annotations: Annotation[]) {
    const nextArticle = applyAnnotations(annotations);
    if (!nextArticle) return;
    await window.yomitomoDesktop.saveArticle(nextArticle);
  }

  async function submitReply() {
    const selectedRoot = selectedThread?.root;
    const trimmed = replyDraft.trim();
    if (!selectedRoot || !trimmed || sendingReply) return;
    setSendingReply(true);
    setSendError('');
    setReplyDraft('');
    setReplyCaretIndex(0);
    try {
      const userComment = createUserComment(userProfile, trimmed, { replyTo: selectedRoot.id });
      const nextAnnotations = appendAnnotationComment(
        annotationsRef.current,
        currentAnnotation.id,
        userComment,
        userComment.createdAt,
      );
      const nextAnnotation = nextAnnotations?.find((item) => item.id === currentAnnotation.id);
      if (!nextAnnotations || !nextAnnotation) return;

      await saveAnnotations(nextAnnotations);
      const mentionedAgents = findMentionedAgents(trimmed, annotationAgents);
      const instruction = agentInstructionFromNote(trimmed, mentionedAgents) || undefined;
      for (const agent of mentionedAgents) {
        const latestAnnotation =
          annotationsRef.current.find((item) => item.id === currentAnnotation.id) || nextAnnotation;
        await requestAgentReply(agent, latestAnnotation, userComment, instruction);
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : '回复发送失败');
    } finally {
      setSendingReply(false);
      setStatusMessage('');
    }
  }

  async function submitNewThought() {
    const trimmed = newThoughtDraft.trim();
    if (!trimmed || submittingThought) return;
    const mentionedThoughtAgents = findMentionedAgents(trimmed, annotationAgents);
    if (newThoughtMode === 'assistant' && mentionedThoughtAgents.length === 0) return;
    setSubmittingThought(true);
    setSendError('');
    try {
      if (newThoughtMode === 'self') {
        const userComment = createUserComment(userProfile, trimmed);
        const nextAnnotations = appendAnnotationComment(
          annotationsRef.current,
          currentAnnotation.id,
          userComment,
          userComment.createdAt,
        );
        const nextAnnotation = nextAnnotations?.find((item) => item.id === currentAnnotation.id);
        if (!nextAnnotations || !nextAnnotation) return;

        await saveAnnotations(nextAnnotations);
        setSelectedThoughtId(userComment.id);

        const mentionedAgents = findMentionedAgents(trimmed, annotationAgents);
        const instruction = agentInstructionFromNote(trimmed, mentionedAgents) || undefined;
        for (const agent of mentionedAgents) {
          const latestAnnotation =
            annotationsRef.current.find((item) => item.id === currentAnnotation.id) ||
            nextAnnotation;
          await requestAgentReply(agent, latestAnnotation, userComment, instruction);
        }
      } else {
        const route = await planAssistantThoughtRoute(trimmed, mentionedThoughtAgents);
        for (const agent of mentionedThoughtAgents) {
          const latestAnnotation =
            annotationsRef.current.find((item) => item.id === currentAnnotation.id) ||
            currentAnnotation;
          const directive = mentionDirectivesForAgent(route, agent, 'create_thought')[0];
          const instruction =
            directive?.instruction ||
            agentInstructionFromNote(assistantThoughtRouteNote(trimmed, mentionedThoughtAgents), [
              agent,
            ]) ||
            trimmed;
          await requestAgentThought(agent, latestAnnotation, instruction, directive?.readingIntent);
        }
      }
      closeNewThoughtDialog();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : '想法添加失败');
    } finally {
      setSubmittingThought(false);
      setStatusMessage('');
    }
  }

  async function planAssistantThoughtRoute(note: string, selectedAgents: PublicAgent[]) {
    const routeNote = assistantThoughtRouteNote(note, selectedAgents);
    try {
      return await window.yomitomoDesktop.planAgentMentionRoute({
        note: routeNote,
        targetAnchor: currentAnnotation.anchor,
        agents: selectedAgents,
        allowedActions: ['create_thought'],
        article: promptArticle(
          currentArticleRef.current,
          discussionArticleText(currentArticleRef.current),
        ),
      });
    } catch {
      return {
        createUserThought: false,
        directives: selectedAgents.map((agent) => ({
          agentId: agent.id,
          agentUsername: agent.username,
          action: 'create_thought' as const,
          instruction: note,
        })),
      };
    }
  }

  async function requestAgentReply(
    agent: PublicAgent,
    annotationValue: Annotation,
    userComment: Comment,
    instruction?: string,
  ) {
    await runSourceAgentCommentRequest({
      agent,
      annotation: annotationValue,
      userComment,
      instruction,
      desktop: window.yomitomoDesktop,
      currentArticle: currentArticleRef.current,
      articleText: discussionArticleText(currentArticleRef.current),
      annotationsRef,
      applyAnnotations,
      saveAnnotations,
      setStatusMessage,
    });
  }

  async function requestAgentThought(
    agent: PublicAgent,
    annotationValue: Annotation,
    instruction: string,
    readingIntent?: Comment['readingIntent'],
  ) {
    await runSourceAgentThoughtRequest({
      agent,
      annotation: annotationValue,
      instruction,
      readingIntent,
      desktop: window.yomitomoDesktop,
      currentArticle: currentArticleRef.current,
      articleText: discussionArticleText(currentArticleRef.current),
      annotationsRef,
      applyAnnotations,
      saveAnnotations,
      setStatusMessage,
      onThoughtStart: setSelectedThoughtId,
    });
  }

  function openNewThoughtDialog() {
    setNewThoughtOpen(true);
    setNewThoughtMode('self');
    setNewThoughtDraft('');
    setNewThoughtCaretIndex(0);
    setSendError('');
  }

  function openSedimentationWindow() {
    void window.yomitomoDesktop.openAnnotationSedimentation({
      articleId: currentArticle.id,
      annotationId: currentAnnotation.id,
    });
  }

  function closeNewThoughtDialog() {
    setNewThoughtOpen(false);
    setNewThoughtDraft('');
    setNewThoughtCaretIndex(0);
  }

  function insertAgentMention(agent: PublicAgent) {
    const mention = `@${agent.username} `;
    setReplyDraft((current) => {
      if (current.includes(mention.trim())) return current;
      const prefix = current.trimEnd();
      const next = prefix ? `${prefix} ${mention}` : mention;
      setReplyCaretIndex(next.length);
      return next;
    });
  }

  function togglePinnedThought(commentId: string) {
    setPinnedThoughtIds((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }

  if (removed) {
    return (
      <main className={className}>
        <section className="annotation-discussion-empty">
          <MessageCircle size={24} />
          <strong>这条批注已删除</strong>
        </section>
      </main>
    );
  }

  return (
    <main className={className}>
      <section className="annotation-discussion-quote" aria-label="批注引文">
        <span aria-hidden="true">“</span>
        <p>{currentAnnotation.anchor.exact}</p>
      </section>

      <section className="annotation-discussion-layout" aria-label="批注讨论窗口">
        <aside className="annotation-discussion-ideas">
          <header>
            <strong>想法</strong>
            <span>{threads.length}</span>
            <button
              className="annotation-discussion-add-thought"
              type="button"
              aria-label="添加想法"
              onClick={openNewThoughtDialog}
            >
              <Plus size={14} />
            </button>
          </header>
          {threads.length > 0 ? (
            <div className="annotation-discussion-idea-list">
              {threads.map((thread) => (
                <ThoughtListItem
                  key={thread.root.id}
                  isDeleting={deletingCommentId === thread.root.id}
                  isSelected={thread.root.id === selectedThread?.root.id}
                  thread={thread}
                  userProfile={userProfile}
                  onDelete={() => void deleteComment(thread.root.id)}
                  onPin={() => togglePinnedThought(thread.root.id)}
                  onSelect={() => setSelectedThoughtId(thread.root.id)}
                />
              ))}
            </div>
          ) : (
            <p>还没有想法</p>
          )}
          <footer className="annotation-discussion-sedimentation-entry">
            <button type="button" onClick={openSedimentationWindow}>
              <GitPullRequestDraft size={14} />
              <span>开始沉淀</span>
            </button>
          </footer>
        </aside>
        <section className="annotation-discussion-thread">
          <header>
            <strong>讨论区</strong>
            <div className="annotation-discussion-thread-actions">
              <span>{replies} 条回复</span>
              <AnnotationLayoutControl value={layoutMode} onChange={setLayoutMode} />
            </div>
          </header>
          {selectedThread ? (
            <DiscussionThreadView
              deletingCommentId={deletingCommentId}
              layoutMode={layoutMode}
              thread={selectedThread}
              userProfile={userProfile}
              onDelete={(commentId) => void deleteComment(commentId)}
              onInsertAgentMention={insertAgentMention}
              onReplyCaretChange={setReplyCaretIndex}
              onReplyDraftChange={setReplyDraft}
              onSubmitReply={() => void submitReply()}
              replyDraft={replyDraft}
              replyCaretIndex={replyCaretIndex}
              annotationAgents={annotationAgents}
              sendingReply={sendingReply}
              sendError={sendError}
              statusMessage={statusMessage}
            />
          ) : (
            <div className="annotation-discussion-thread-placeholder">
              <MessageCircle size={22} />
              <strong>选择想法查看讨论</strong>
              <p>这条批注的讨论会在这里展开。</p>
            </div>
          )}
        </section>
      </section>
      {newThoughtOpen ? (
        <AddThoughtDialog
          agents={annotationAgents}
          caretIndex={newThoughtCaretIndex}
          draft={newThoughtDraft}
          mode={newThoughtMode}
          submitting={submittingThought}
          onCancel={closeNewThoughtDialog}
          onCaretChange={setNewThoughtCaretIndex}
          onDraftChange={setNewThoughtDraft}
          onModeChange={setNewThoughtMode}
          onSubmit={() => void submitNewThought()}
        />
      ) : null}
    </main>
  );
}

type DiscussionThread = {
  isPinned: boolean;
  pending: boolean;
  replies: Comment[];
  replyCount: number;
  root: Comment;
  updatedAt: string;
};

function AddThoughtDialog({
  agents,
  caretIndex,
  draft,
  mode,
  onCancel,
  onCaretChange,
  onDraftChange,
  onModeChange,
  onSubmit,
  submitting,
}: {
  agents: PublicAgent[];
  caretIndex: number;
  draft: string;
  mode: 'self' | 'assistant';
  onCancel: () => void;
  onCaretChange: (value: number) => void;
  onDraftChange: (value: string) => void;
  onModeChange: (value: 'self' | 'assistant') => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionCandidateRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const shortcutModifier = getShortcutModifier();
  const mentionQuery = mode === 'assistant' ? getMentionQuery(draft, caretIndex) : null;
  const matchedAgents =
    mentionQuery === null
      ? []
      : agents.filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query));
  const mentionedAgents = findMentionedAgents(draft, agents);
  const canSubmit =
    Boolean(draft.trim()) && !submitting && (mode === 'self' || mentionedAgents.length > 0);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery?.query]);

  useEffect(() => {
    if (matchedAgents.length > 0 && selectedMentionIndex >= matchedAgents.length)
      setSelectedMentionIndex(0);
  }, [matchedAgents.length, selectedMentionIndex]);

  useEffect(() => {
    mentionCandidateRefs.current[selectedMentionIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedMentionIndex]);

  useEffect(() => {
    resizeAddThoughtTextarea();
  }, [draft, mode]);

  function updateCaret(element: HTMLTextAreaElement) {
    onCaretChange(element.selectionStart);
  }

  function resizeAddThoughtTextarea() {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    const maxHeight = 320;
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function selectMentionAgent(agent: PublicAgent) {
    const next = mentionDraftWithAgent(draft, agent.username, mentionQuery);
    onDraftChange(next.content);
    onCaretChange(next.caretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  function insertAgentMention(agent: PublicAgent) {
    const next = insertMentionAtCaret(draft, agent.username, caretIndex, mentionQuery);
    onDraftChange(next.content);
    onCaretChange(next.caretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  return (
    <div className="annotation-discussion-modal-backdrop" role="presentation">
      <section
        className="annotation-discussion-add-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="annotation-discussion-add-title"
      >
        <header>
          <Plus size={19} />
          <h2 id="annotation-discussion-add-title">添加想法</h2>
          <ReaderTooltip content={<ShortcutTooltipContent keys={['Esc']} label="关闭" />}>
            <button
              className="annotation-discussion-add-close"
              type="button"
              aria-label="关闭添加想法"
              onClick={onCancel}
            >
              <X size={15} />
            </button>
          </ReaderTooltip>
        </header>
        <FloatingComposer
          ref={textareaRef}
          className="annotation-discussion-add-editor"
          accessory={
            <div className="annotation-discussion-add-composer-accessory">
              <div className="annotation-discussion-add-mode" role="tablist" aria-label="添加方式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'self'}
                  className={mode === 'self' ? 'is-active' : ''}
                  onClick={() => onModeChange('self')}
                >
                  自己写
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'assistant'}
                  className={mode === 'assistant' ? 'is-active' : ''}
                  onClick={() => onModeChange('assistant')}
                >
                  让助手来
                </button>
              </div>
              {mode === 'assistant' ? (
                <div className="annotation-discussion-add-agents">
                  <AgentAvatarStack
                    agents={agents}
                    ariaLabel="插入助手提及"
                    onAgentClick={insertAgentMention}
                  />
                </div>
              ) : null}
            </div>
          }
          mentionMenu={
            matchedAgents.length > 0 ? (
              <div className="reader-agent-menu annotation-discussion-mention-menu annotation-discussion-add-mention-menu">
                {matchedAgents.map((agent, index) => (
                  <button
                    className={index === selectedMentionIndex ? 'is-active' : ''}
                    key={agent.id}
                    ref={(element) => {
                      mentionCandidateRefs.current[index] = element;
                    }}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectMentionAgent(agent)}
                  >
                    <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
                    <span>
                      <strong>{agent.nickname}</strong>
                      <em>@{agent.username}</em>
                    </span>
                  </button>
                ))}
              </div>
            ) : null
          }
          submitDisabled={!canSubmit}
          submitIcon={<Plus size={14} />}
          submitLabel={submitting ? '添加中' : '添加'}
          submitTooltip={
            <SubmitShortcutTooltipContent
              label="添加"
              shortcut="mod-enter"
              shortcutModifier={shortcutModifier}
            />
          }
          textarea={{
            'aria-label': mode === 'self' ? '想法内容' : '给助手的指令',
            value: draft,
            placeholder:
              mode === 'self' ? '挂在这条划线下的一条想法...' : '告诉助手要写什么想法...',
            rows: 1,
            disabled: submitting,
            autoFocus: true,
            onChange: (event) => {
              onDraftChange(event.currentTarget.value);
              updateCaret(event.currentTarget);
              requestAnimationFrame(resizeAddThoughtTextarea);
            },
            onClick: (event) => updateCaret(event.currentTarget),
            onKeyDown: (event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onCancel();
                return;
              }
              if (matchedAgents.length > 0 && event.key === 'ArrowDown') {
                event.preventDefault();
                setSelectedMentionIndex((index) => (index + 1) % matchedAgents.length);
                return;
              }
              if (matchedAgents.length > 0 && event.key === 'ArrowUp') {
                event.preventDefault();
                setSelectedMentionIndex(
                  (index) => (index - 1 + matchedAgents.length) % matchedAgents.length,
                );
                return;
              }
              if (matchedAgents.length > 0 && event.key === 'Tab') {
                event.preventDefault();
                const agent = matchedAgents[selectedMentionIndex] || matchedAgents[0];
                if (agent) selectMentionAgent(agent);
                return;
              }
              if (isMessageSendShortcutEvent(event, 'mod-enter')) {
                event.preventDefault();
                onSubmit();
              }
            },
            onKeyUp: (event) => {
              if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp')
                return;
              updateCaret(event.currentTarget);
            },
            onSelect: (event) => updateCaret(event.currentTarget),
          }}
          onSubmit={onSubmit}
        />
      </section>
    </div>
  );
}

function ThoughtListItem({
  isDeleting,
  isSelected,
  onDelete,
  onPin,
  onSelect,
  thread,
  userProfile,
}: {
  isDeleting: boolean;
  isSelected: boolean;
  onDelete: () => void;
  onPin: () => void;
  onSelect: () => void;
  thread: DiscussionThread;
  userProfile: UserProfile;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const author = commentPersona(thread.root, userProfile, []);
  const itemClassName = [
    'annotation-discussion-idea',
    isSelected ? 'is-selected' : '',
    thread.isPinned ? 'is-pinned' : '',
    thread.pending ? 'is-pending' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={itemClassName}>
      <button className="annotation-discussion-idea-main" type="button" onClick={onSelect}>
        <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
        <span>
          <strong>{author.nickname}</strong>
          <em>{thread.root.content}</em>
          <small>
            {formatRelativeTime(thread.updatedAt)} · {thread.replyCount} 条回复
            {thread.pending ? ' · 处理中' : ''}
          </small>
        </span>
      </button>
      <div
        className="annotation-discussion-idea-actions"
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setMenuOpen(false);
        }}
      >
        <button
          className={menuOpen ? 'is-active' : ''}
          type="button"
          aria-label="更多想法操作"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((current) => !current);
          }}
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen ? (
          <div className="annotation-discussion-idea-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                onPin();
                setMenuOpen(false);
              }}
            >
              {thread.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
              <span>{thread.isPinned ? '取消固定' : '固定置顶'}</span>
            </button>
            <LongPressDeleteButton
              className="annotation-discussion-idea-delete"
              disabled={isDeleting}
              label="长按删除想法和回复"
              onDelete={onDelete}
              onComplete={() => setMenuOpen(false)}
            >
              <Trash2 size={13} />
              <span>长按删除</span>
            </LongPressDeleteButton>
          </div>
        ) : null}
      </div>
      {thread.isPinned ? (
        <span className="annotation-discussion-idea-pin-badge" aria-label="已置顶">
          <Pin size={10} />
        </span>
      ) : null}
    </article>
  );
}

function DiscussionThreadView({
  annotationAgents,
  deletingCommentId,
  layoutMode,
  onDelete,
  onInsertAgentMention,
  onReplyCaretChange,
  onReplyDraftChange,
  onSubmitReply,
  replyCaretIndex,
  replyDraft,
  sendError,
  sendingReply,
  statusMessage,
  thread,
  userProfile,
}: {
  annotationAgents: PublicAgent[];
  deletingCommentId: string | null;
  layoutMode: DiscussionLayoutMode;
  onDelete: (commentId: string) => void;
  onInsertAgentMention: (agent: PublicAgent) => void;
  onReplyCaretChange: (value: number) => void;
  onReplyDraftChange: (value: string) => void;
  onSubmitReply: () => void;
  replyCaretIndex: number;
  replyDraft: string;
  sendError: string;
  sendingReply: boolean;
  statusMessage: string;
  thread: DiscussionThread;
  userProfile: UserProfile;
}) {
  const messages = thread.replies;
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionCandidateRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [rootThoughtExpanded, setRootThoughtExpanded] = useState(false);
  const rootThoughtHtml = renderMarkdown(thread.root.content);
  const mentionQuery = getMentionQuery(replyDraft, replyCaretIndex);
  const matchedAgents =
    mentionQuery === null
      ? []
      : annotationAgents.filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query));
  const shortcutModifier = getShortcutModifier();
  const className = [
    'annotation-discussion-messages',
    layoutMode === 'left' ? 'is-left-aligned' : 'is-split',
  ].join(' ');

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery?.query]);

  useEffect(() => {
    if (matchedAgents.length > 0 && selectedMentionIndex >= matchedAgents.length)
      setSelectedMentionIndex(0);
  }, [matchedAgents.length, selectedMentionIndex]);

  useEffect(() => {
    mentionCandidateRefs.current[selectedMentionIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedMentionIndex]);

  useEffect(() => {
    updateScrollBottomVisibility();
  }, [messages.length]);

  useEffect(() => {
    setRootThoughtExpanded(false);
  }, [thread.root.id]);

  useEffect(() => {
    resizeReplyTextarea();
  }, [replyDraft, thread.root.id]);

  function updateCaret(element: HTMLTextAreaElement) {
    onReplyCaretChange(element.selectionStart);
  }

  function resizeReplyTextarea() {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    const maxHeight = 168;
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function selectMentionAgent(agent: PublicAgent) {
    const next = mentionDraftWithAgent(replyDraft, agent.username, mentionQuery);
    onReplyDraftChange(next.content);
    onReplyCaretChange(next.caretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  function updateScrollBottomVisibility() {
    const element = messagesRef.current;
    if (!element) {
      setShowScrollBottom(false);
      return;
    }
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    setShowScrollBottom(distance > 56);
  }

  function scrollMessagesToBottom() {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }

  return (
    <div className="annotation-discussion-thread-body">
      <section
        className={['annotation-discussion-root-thought', rootThoughtExpanded ? 'is-expanded' : '']
          .filter(Boolean)
          .join(' ')}
        aria-label="想法内容"
      >
        <div className="annotation-discussion-root-thought-content">
          <div dangerouslySetInnerHTML={{ __html: rootThoughtHtml }} />
        </div>
        <button
          className="annotation-discussion-root-thought-toggle"
          type="button"
          aria-expanded={rootThoughtExpanded}
          onClick={() => setRootThoughtExpanded((expanded) => !expanded)}
        >
          <span>{rootThoughtExpanded ? '收起想法' : '展开想法'}</span>
          <ChevronDown size={14} />
        </button>
      </section>
      <div className="annotation-discussion-thread-meta">
        <ReaderTooltip content={formatAbsoluteTime(thread.root.createdAt)}>
          <time dateTime={thread.root.createdAt} tabIndex={0}>
            {formatAbsoluteTime(thread.root.createdAt)}
          </time>
        </ReaderTooltip>
        {thread.pending ? <span>助手回复中</span> : null}
      </div>
      {messages.length > 0 ? (
        <div ref={messagesRef} className={className} onScroll={updateScrollBottomVisibility}>
          {messages.map((message) => (
            <DiscussionMessage
              isDeleting={deletingCommentId === message.id}
              key={message.id}
              message={message}
              userProfile={userProfile}
              onDelete={() => onDelete(message.id)}
            />
          ))}
        </div>
      ) : (
        <div className="annotation-discussion-reply-empty">
          <MessageCircle size={24} />
          <strong>当前没有讨论</strong>
          <p>这条想法还没有回复。</p>
        </div>
      )}
      <footer className="annotation-discussion-composer">
        {showScrollBottom ? (
          <button
            className="annotation-discussion-scroll-bottom"
            type="button"
            aria-label="滚动到底部"
            onClick={scrollMessagesToBottom}
          >
            <ChevronDown size={16} />
          </button>
        ) : null}
        <FloatingComposer
          ref={textareaRef}
          className="annotation-discussion-composer-input"
          accessory={
            annotationAgents.length > 0 ? (
              <div className="annotation-discussion-agent-dock" aria-label="可提及助手">
                <AgentAvatarStack
                  agents={annotationAgents}
                  ariaLabel="可提及助手"
                  onAgentClick={onInsertAgentMention}
                />
              </div>
            ) : undefined
          }
          mentionMenu={
            matchedAgents.length > 0 ? (
              <div className="reader-agent-menu annotation-discussion-mention-menu">
                {matchedAgents.map((agent, index) => (
                  <button
                    className={index === selectedMentionIndex ? 'is-active' : ''}
                    key={agent.id}
                    ref={(element) => {
                      mentionCandidateRefs.current[index] = element;
                    }}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectMentionAgent(agent)}
                  >
                    <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
                    <span>
                      <strong>{agent.nickname}</strong>
                      <em>@{agent.username}</em>
                    </span>
                  </button>
                ))}
              </div>
            ) : null
          }
          status={sendError || statusMessage || (sendingReply ? '正在发送' : '')}
          submitDisabled={!replyDraft.trim() || sendingReply}
          submitIcon={<Send size={14} />}
          submitLabel="回复"
          submitTooltip={
            <SubmitShortcutTooltipContent
              label="回复"
              shortcut="mod-enter"
              shortcutModifier={shortcutModifier}
            />
          }
          textarea={{
            value: replyDraft,
            placeholder: '回复这条想法，输入 @助手 可邀请助手参与讨论',
            rows: 1,
            disabled: sendingReply,
            onChange: (event) => {
              onReplyDraftChange(event.currentTarget.value);
              updateCaret(event.currentTarget);
              requestAnimationFrame(resizeReplyTextarea);
            },
            onClick: (event) => updateCaret(event.currentTarget),
            onKeyDown: (event) => {
              if (matchedAgents.length > 0 && event.key === 'ArrowDown') {
                event.preventDefault();
                setSelectedMentionIndex((index) => (index + 1) % matchedAgents.length);
                return;
              }
              if (matchedAgents.length > 0 && event.key === 'ArrowUp') {
                event.preventDefault();
                setSelectedMentionIndex(
                  (index) => (index - 1 + matchedAgents.length) % matchedAgents.length,
                );
                return;
              }
              if (matchedAgents.length > 0 && event.key === 'Tab') {
                event.preventDefault();
                const agent = matchedAgents[selectedMentionIndex] || matchedAgents[0];
                if (agent) selectMentionAgent(agent);
                return;
              }
              if (isMessageSendShortcutEvent(event, 'mod-enter')) {
                event.preventDefault();
                onSubmitReply();
              }
            },
            onKeyUp: (event) => {
              if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp')
                return;
              updateCaret(event.currentTarget);
            },
            onSelect: (event) => updateCaret(event.currentTarget),
          }}
          onSubmit={onSubmitReply}
        />
      </footer>
    </div>
  );
}

function DiscussionMessage({
  isDeleting,
  message,
  onDelete,
  userProfile,
}: {
  isDeleting: boolean;
  message: Comment;
  onDelete: () => void;
  userProfile: UserProfile;
}) {
  const author = commentPersona(message, userProfile, []);
  const html = renderMarkdown(message.content);
  const className = [
    'annotation-discussion-message',
    message.author === 'user' ? 'is-user' : 'is-assistant',
    message.pending ? 'is-pending' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className}>
      <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
      <div className="annotation-discussion-message-bubble">
        <header>
          <strong>{author.nickname}</strong>
          <ReaderTooltip content={formatAbsoluteTime(message.createdAt)}>
            <time dateTime={message.createdAt} tabIndex={0}>
              {formatRelativeTime(message.createdAt)}
            </time>
          </ReaderTooltip>
          {message.pending ? <em>回复中</em> : null}
          <LongPressDeleteButton
            className="annotation-discussion-message-delete"
            disabled={isDeleting}
            label="长按删除回复"
            onDelete={onDelete}
          >
            <Trash2 size={13} />
          </LongPressDeleteButton>
        </header>
        <div
          className="annotation-discussion-markdown"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </article>
  );
}

function LongPressDeleteButton({
  children,
  className,
  disabled,
  label,
  onComplete,
  onDelete,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onComplete?: () => void;
  onDelete: () => void;
}) {
  const deleteTimerRef = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);

  useEffect(
    () => () => {
      if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    },
    [],
  );

  function stopHold() {
    if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
    setHolding(false);
  }

  function startHold(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || deleteTimerRef.current !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHolding(true);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      setHolding(false);
      onDelete();
      onComplete?.();
    }, DISCUSSION_DELETE_HOLD_MS);
  }

  return (
    <button
      className={['annotation-discussion-hold-delete', holding ? 'is-holding' : '', className || '']
        .filter(Boolean)
        .join(' ')}
      style={{ '--delete-hold-ms': `${DISCUSSION_DELETE_HOLD_MS}ms` } as CSSProperties}
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={stopHold}
      onPointerDown={startHold}
      onPointerLeave={stopHold}
      onPointerUp={stopHold}
    >
      {children}
    </button>
  );
}

type RunSourceAgentThoughtRequestInput = {
  agent: PublicAgent;
  annotation: Annotation;
  instruction: string;
  readingIntent?: Comment['readingIntent'];
  desktop: Pick<typeof window.yomitomoDesktop, 'requestAgentCommentStream'>;
  currentArticle: ArticleRecord;
  articleText: string;
  annotationsRef: RefObject<Annotation[]>;
  applyAnnotations: (annotations: Annotation[]) => ArticleRecord | null;
  saveAnnotations: (annotations: Annotation[]) => Promise<void>;
  setStatusMessage: (message: string) => void;
  onThoughtStart: (commentId: string) => void;
};

async function runSourceAgentThoughtRequest({
  agent,
  annotation,
  instruction,
  readingIntent,
  desktop,
  currentArticle,
  articleText,
  annotationsRef,
  applyAnnotations,
  saveAnnotations,
  setStatusMessage,
  onThoughtStart,
}: RunSourceAgentThoughtRequestInput) {
  setStatusMessage(`${agent.nickname} 正在添加想法`);
  const createdAt = new Date().toISOString();
  const placeholderComment: Comment = {
    id: makeId('comment'),
    author: 'ai',
    content: '',
    createdAt,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    readingIntent: readingIntent || annotation.readingIntent,
    pending: true,
  };
  onThoughtStart(placeholderComment.id);

  const pendingAnnotations = appendAnnotationComment(
    annotationsRef.current,
    annotation.id,
    placeholderComment,
    createdAt,
  );
  if (pendingAnnotations) applyAnnotations(pendingAnnotations);

  const instructionComment: Comment = {
    id: makeId('comment'),
    author: 'user',
    content: instruction,
    createdAt,
    readingIntent,
  };
  let pendingCommentId = placeholderComment.id;
  let pendingDelta = '';
  let pendingFrame = 0;
  let streamedContent = '';

  const flushDelta = () => {
    pendingFrame = 0;
    if (!pendingDelta || !pendingCommentId) return;
    const delta = pendingDelta;
    pendingDelta = '';
    streamedContent += delta;
    const nextAnnotations = updateAnnotationComment(
      annotationsRef.current,
      annotation.id,
      pendingCommentId,
      (comment) => ({ ...comment, content: comment.content + delta }),
    );
    if (nextAnnotations) applyAnnotations(nextAnnotations);
  };
  const scheduleDeltaFlush = () => {
    if (pendingFrame) return;
    pendingFrame = window.requestAnimationFrame(flushDelta);
  };

  try {
    const finalComment = await desktop.requestAgentCommentStream(
      {
        agentId: agent.id,
        agentUsername: agent.username,
        responseMode: 'create_thought',
        readingIntent: readingIntent || annotation.readingIntent,
        instruction,
        article: promptArticle(currentArticle, articleText),
        annotation,
        userComment: instructionComment,
      },
      (event) => {
        if (event.type === 'start') {
          const nextAnnotations = updateAnnotationComment(
            annotationsRef.current,
            annotation.id,
            pendingCommentId,
            () => ({
              ...event.comment,
              id: pendingCommentId,
              replyTo: undefined,
              pending: true,
            }),
          );
          if (nextAnnotations) applyAnnotations(nextAnnotations);
          return;
        }
        pendingDelta += event.delta;
        scheduleDeltaFlush();
      },
    );

    if (pendingFrame) {
      window.cancelAnimationFrame(pendingFrame);
      flushDelta();
    }
    const completedComment = {
      ...finalComment,
      id: pendingCommentId,
      replyTo: undefined,
      content: finalComment.content || streamedContent,
      pending: false,
    };
    const nextAnnotations = updateAnnotationComment(
      annotationsRef.current,
      annotation.id,
      pendingCommentId,
      () => completedComment,
      completedComment.createdAt,
    );
    if (nextAnnotations) await saveAnnotations(nextAnnotations);
  } finally {
    if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
    setStatusMessage('');
  }
}

function annotationDiscussionWindowClassName() {
  return ['annotation-discussion-window', `is-${window.yomitomoDesktop.platform ?? 'unknown'}`]
    .filter(Boolean)
    .join(' ');
}

function discussionWindowTitle({
  annotation,
  article,
}: {
  article: ArticleRecord;
  annotation: Annotation;
}) {
  const quote = compactTitleText(annotation.anchor.exact);
  const articleTitle = compactTitleText(article.title || '未命名文章');
  return quote ? `批注讨论 - ${quote}` : `批注讨论 - ${articleTitle}`;
}

function compactTitleText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function assistantThoughtRouteNote(note: string, agents: PublicAgent[]) {
  return `${agents.map((agent) => `@${agent.username}`).join(' ')} ${note}`.trim();
}

function insertMentionAtCaret(
  content: string,
  username: string,
  caretIndex: number,
  mentionQuery: ReturnType<typeof getMentionQuery>,
) {
  if (mentionQuery) return mentionDraftWithAgent(content, username, mentionQuery);

  const start = Math.max(0, Math.min(caretIndex, content.length));
  const before = content.slice(0, start);
  const after = content.slice(start);
  const prefix = before && !/\s$/u.test(before) ? ' ' : '';
  const suffix = after && !/^\s/u.test(after) ? ' ' : '';
  const mention = `${prefix}@${username} ${suffix}`;
  const nextContent = `${before}${mention}${after}`;
  return {
    content: nextContent,
    caretIndex: before.length + prefix.length + username.length + 2,
  };
}

function discussionThreads(
  annotation: Annotation,
  pinnedThoughtIds: Set<string>,
): DiscussionThread[] {
  const roots = annotation.comments.filter((comment) => !comment.replyTo);
  const rootIds = new Set(roots.map((comment) => comment.id));
  const repliesByRoot = new Map(roots.map((comment) => [comment.id, [] as Comment[]]));
  const fallbackRoot = roots[0];

  for (const comment of annotation.comments) {
    if (rootIds.has(comment.id)) continue;
    const rootId =
      comment.replyTo && rootIds.has(comment.replyTo) ? comment.replyTo : fallbackRoot?.id;
    if (!rootId) continue;
    repliesByRoot.get(rootId)?.push(comment);
  }

  return roots
    .map((root) => {
      const replies = (repliesByRoot.get(root.id) || []).toSorted(compareCommentsOldestFirst);
      const updatedAt = latestCommentTime([root, ...replies]);
      return {
        isPinned: pinnedThoughtIds.has(root.id),
        pending: root.pending || replies.some((reply) => reply.pending),
        replies,
        replyCount: replies.length,
        root,
        updatedAt,
      };
    })
    .toSorted(compareThreads);
}

function compareThreads(a: DiscussionThread, b: DiscussionThread) {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  return timestamp(b.updatedAt) - timestamp(a.updatedAt);
}

function compareCommentsOldestFirst(a: Comment, b: Comment) {
  return timestamp(a.createdAt) - timestamp(b.createdAt);
}

function latestCommentTime(comments: Comment[]) {
  return comments.reduce(
    (latest, comment) => {
      const value = timestamp(comment.createdAt);
      return value > timestamp(latest) ? comment.createdAt : latest;
    },
    comments[0]?.createdAt || new Date(0).toISOString(),
  );
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

function discussionArticleText(article: ArticleRecord) {
  if (article.contentHtml) return articlePlainText(article);
  if (article.ebook?.chapters.length) {
    return article.ebook.chapters.map((chapter) => htmlText(chapter.html)).join('\n\n');
  }
  return [article.excerpt, article.annotations.map((item) => item.anchor.exact).join('\n')]
    .filter(Boolean)
    .join('\n\n');
}

function htmlText(value: string) {
  const container = document.createElement('div');
  container.innerHTML = value;
  return container.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function annotationUserProfile(annotation: Annotation, article: ArticleRecord): UserProfile {
  return {
    id: annotation.userId || 'user',
    nickname: annotation.userNickname || '我',
    username: annotation.userUsername || 'user',
    avatar: annotation.userAvatar || '',
    annotationColor: annotation.userAnnotationColor || annotation.color,
    updatedAt: article.updatedAt,
  };
}
