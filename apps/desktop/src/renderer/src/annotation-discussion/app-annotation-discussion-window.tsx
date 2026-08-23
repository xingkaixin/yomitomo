import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  GitPullRequestDraftIcon,
  BubbleChatIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  Agent,
  Annotation,
  ResolvedAppSettings,
  ArticleRecord,
  Comment,
  PublicAgent,
  UiLanguage,
} from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import {
  appendAnnotationComment,
  createUserComment,
  findMentionedAgents,
  sortAnnotations,
} from '@yomitomo/core';
import { applyAppTheme, readCachedThemeId, themeRegistry } from '../theme/app-theme';
import {
  agentInstructionFromNote,
  mentionDirectivesForAgent,
} from '../source/bookcase/app-source-agent-mention-request';
import { annotationsWithSavedComment } from '../source/bookcase/source-annotation-updates';
import { promptArticle } from '../source/bookcase/source-prompt-article';
import { publicAnnotationAgents } from '../source/bookcase/source-public-agents';
import { runSourceAgentCommentRequest } from '../source/bookcase/app-source-agent-comment-request';
import { playAppSoundEffect, stopAppSoundEffect } from '../sound/app-sound-effects';
import {
  AnnotationLayoutControl,
  type AnnotationMessageLayoutMode,
} from './app-annotation-layout-control';
import {
  applyAssistantRuntimeProgress,
  assistantRuntimeErrorMessage,
} from '../shell/app-assistant-runtime-progress';
import {
  elementWindowSourceRect,
  useSourceAwareWindowTransition,
} from '../shell/app-window-transition';
import {
  annotationUserProfile,
  assistantThoughtRouteNote,
  discussionArticleText,
  replyTargetAgents,
  discussionThreads,
  discussionWindowTitle,
  waitForMilliseconds,
} from './app-annotation-discussion-utils';
import type { AddThoughtAgentRun } from './app-annotation-discussion-add-run';
import { AddThoughtDialog } from './app-annotation-discussion-add-dialog';
import { ThoughtListItem } from './app-annotation-discussion-thread-list';
import { DiscussionThreadView } from './app-annotation-discussion-thread-view';
import {
  runSourceAgentThoughtRequest,
  type RunSourceAgentThoughtLifecycle,
} from './app-annotation-discussion-agent-thought';
import { useElementWidthBelow } from './app-annotation-discussion-hooks';
import { useAnnotationWindowArticlePatches } from './use-annotation-window-article-patches';
import { annotationWindowActions } from './app-annotation-window-actions';
import { getDesktopApi } from '../shell/app-desktop-api';

export { insertMentionAtSelection } from './app-annotation-discussion-utils';

type DiscussionLayoutMode = AnnotationMessageLayoutMode;
const DISCUSSION_IDEAS_AUTO_COLLAPSE_WIDTH = 760;

type ReplyAgentRun = {
  agent: PublicAgent;
  rootId: string;
  status: 'active' | 'queued';
};

type DiscussionWindowStatus =
  | { type: 'loading' }
  | {
      type: 'ready';
      agents: Agent[];
      article: ArticleRecord;
      settings: ResolvedAppSettings;
      uiLanguage: UiLanguage;
    }
  | { type: 'missing' }
  | { type: 'removed' }
  | { type: 'error'; message: string };

export function AnnotationDiscussionWindowApp() {
  const { t } = useTranslation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const articleId = params.get('articleId') || '';
  const annotationId = params.get('annotationId') || '';
  const [status, setStatus] = useState<DiscussionWindowStatus>({ type: 'loading' });
  const pendingArticleUpdateRef = useRef<ArticleRecord | null | undefined>(undefined);
  const className = annotationDiscussionWindowClassName();
  const windowTransition = useSourceAwareWindowTransition(params);
  const windowClassName = [className, windowTransition.className].filter(Boolean).join(' ');

  useAnnotationWindowArticlePatches(articleId, annotationId, (article) => {
    pendingArticleUpdateRef.current = article;
    setStatus((current) => {
      if (!article) return { type: 'missing' };
      if (current.type !== 'ready') return current;
      return { ...current, article };
    });
  });

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
    if (status.type === 'ready') {
      const annotation = status.article.annotations.find((item) => item.id === annotationId);
      if (annotation) {
        document.title = discussionWindowTitle({ annotation, article: status.article });
        return;
      }
    }
    document.title = t('discussion.title');
  }, [annotationId, status, t]);

  useEffect(() => {
    let cancelled = false;
    if (!articleId || !annotationId) {
      setStatus({ type: 'missing' });
      return;
    }

    void annotationWindowActions
      .loadWindow(articleId)
      .then(({ article, store }) => {
        if (cancelled) return;
        const pendingArticle = pendingArticleUpdateRef.current;
        const currentArticle = pendingArticle === undefined ? article : pendingArticle;
        const annotation = currentArticle?.annotations.find((item) => item.id === annotationId);
        setStatus(
          pendingArticle !== null && currentArticle && annotation
            ? {
                type: 'ready',
                agents: store.agents,
                article: currentArticle,
                settings: store.settings,
                uiLanguage: normalizeUiLanguage(store.settings.uiLanguage),
              }
            : { type: 'missing' },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({
          type: 'error',
          message: error instanceof Error ? error.message : t('discussion.loadFailed'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [annotationId, articleId]);

  if (status.type === 'ready') {
    const annotation = status.article.annotations.find((item) => item.id === annotationId);
    if (!annotation) {
      return (
        <DiscussionStatusScreen
          className={windowClassName}
          message={t('discussion.missing')}
          style={windowTransition.style}
        />
      );
    }
    return (
      <AnnotationDiscussionShell
        agents={status.agents}
        article={status.article}
        annotation={annotation}
        className={windowClassName}
        settings={status.settings}
        style={windowTransition.style}
        uiLanguage={status.uiLanguage}
        onArticleChange={(article) =>
          setStatus((current) => (current.type === 'ready' ? { ...current, article } : current))
        }
        onRemoved={() => setStatus({ type: 'removed' })}
      />
    );
  }

  const message =
    status.type === 'loading'
      ? t('discussion.loading')
      : status.type === 'missing'
        ? t('discussion.missing')
        : status.type === 'removed'
          ? t('discussion.deleted')
          : status.message;

  return (
    <DiscussionStatusScreen
      className={windowClassName}
      loading={status.type === 'loading'}
      message={message}
      style={windowTransition.style}
    />
  );
}

function DiscussionStatusScreen({
  className,
  loading = false,
  message,
  style,
}: {
  className: string;
  loading?: boolean;
  message: string;
  style: CSSProperties;
}) {
  return (
    <main className={className} style={style}>
      <section className="annotation-discussion-empty" aria-busy={loading}>
        <HugeiconsIcon icon={BubbleChatIcon} size={24} />
        <strong>{message}</strong>
      </section>
    </main>
  );
}

function useDiscussionArticleProjection({
  annotationId,
  article,
  onArticleChange,
  onRemoved,
}: {
  annotationId: string;
  article: ArticleRecord;
  onArticleChange: (article: ArticleRecord) => void;
  onRemoved: () => void;
}) {
  const articleRef = useRef(article);
  articleRef.current = article;
  const annotationsRef = useMemo(
    () => ({
      get current() {
        return articleRef.current.annotations;
      },
    }),
    [],
  );

  function replaceArticle(nextArticle: ArticleRecord) {
    articleRef.current = nextArticle;
    onArticleChange(nextArticle);
  }

  function applyAnnotations(annotations: Annotation[]) {
    const sortedAnnotations = sortAnnotations(annotations);
    if (!sortedAnnotations.some((item) => item.id === annotationId)) {
      onRemoved();
      return null;
    }
    const nextArticle = {
      ...articleRef.current,
      annotations: sortedAnnotations,
      updatedAt: new Date().toISOString(),
    };
    replaceArticle(nextArticle);
    return nextArticle;
  }

  return { annotationsRef, applyAnnotations, articleRef, replaceArticle };
}

function AnnotationDiscussionShell({
  agents,
  annotation,
  article,
  className,
  onArticleChange,
  onRemoved,
  settings,
  style,
  uiLanguage,
}: {
  agents: Agent[];
  annotation: Annotation;
  article: ArticleRecord;
  className: string;
  onArticleChange: (article: ArticleRecord) => void;
  onRemoved: () => void;
  settings: ResolvedAppSettings;
  style: CSSProperties;
  uiLanguage: UiLanguage;
}) {
  const { t } = useTranslation();
  const { annotationsRef, applyAnnotations, articleRef, replaceArticle } =
    useDiscussionArticleProjection({
      annotationId: annotation.id,
      article,
      onArticleChange,
      onRemoved,
    });
  const [pinnedThoughtIds, setPinnedThoughtIds] = useState<Set<string>>(() => new Set());
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null);
  const [ideasCollapsed, setIdeasCollapsed] = useState(false);
  const [ideasOverlayOpen, setIdeasOverlayOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<DiscussionLayoutMode>('split');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyCaretIndex, setReplyCaretIndex] = useState(0);
  const [newThoughtDraft, setNewThoughtDraft] = useState('');
  const [newThoughtOpen, setNewThoughtOpen] = useState(false);
  const [newThoughtMode, setNewThoughtMode] = useState<'self' | 'assistant'>('self');
  const [newThoughtCaretIndex, setNewThoughtCaretIndex] = useState(0);
  const [submittingThought, setSubmittingThought] = useState(false);
  const [addThoughtAgentRuns, setAddThoughtAgentRuns] = useState<AddThoughtAgentRun[]>([]);
  const [addThoughtCelebrating, setAddThoughtCelebrating] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyAgentRuns, setReplyAgentRuns] = useState<ReplyAgentRun[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [sendError, setSendError] = useState('');
  const discussionLayoutRef = useRef<HTMLElement>(null);
  const ideasAutoCollapsed = useElementWidthBelow(
    discussionLayoutRef,
    DISCUSSION_IDEAS_AUTO_COLLAPSE_WIDTH,
  );

  const annotationAgents = useMemo(
    () => publicAnnotationAgents(agents, uiLanguage),
    [agents, uiLanguage],
  );
  const replyRuleAgents = useMemo(
    () => publicAnnotationAgents(agents, uiLanguage, { includeDisabled: true }),
    [agents, uiLanguage],
  );
  const userProfile = annotationUserProfile(annotation, article);
  const threads = useMemo(
    () => discussionThreads(annotation, pinnedThoughtIds),
    [annotation, pinnedThoughtIds],
  );
  const selectedThread =
    threads.find((thread) => thread.root.id === selectedThoughtId) || threads[0] || null;
  const ideasRailCollapsed = ideasCollapsed || ideasAutoCollapsed;
  const ideasContentCollapsed = ideasAutoCollapsed ? !ideasOverlayOpen : ideasCollapsed;
  const ideasOverlayVisible = ideasAutoCollapsed && ideasOverlayOpen;
  const layoutClassName = [
    'annotation-discussion-layout',
    ideasRailCollapsed ? 'is-ideas-collapsed' : '',
    ideasContentCollapsed ? 'is-ideas-content-collapsed' : '',
    ideasAutoCollapsed ? 'is-ideas-auto-collapsed' : '',
    ideasOverlayVisible ? 'is-ideas-overlay-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (!ideasAutoCollapsed) setIdeasOverlayOpen(false);
  }, [ideasAutoCollapsed]);

  const assistantThoughtWriting = addThoughtAgentRuns.some((run) => run.status === 'active');
  useEffect(() => {
    if (!assistantThoughtWriting) return;
    playAppSoundEffect('discussion.assistant_thought_writing', settings);
    return () => stopAppSoundEffect('discussion.assistant_thought_writing');
  }, [assistantThoughtWriting, settings]);

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
      const nextArticle = await annotationWindowActions.deleteCommentAndReload(
        article.id,
        annotation.id,
        commentId,
      );
      const nextAnnotation = nextArticle?.annotations.find((item) => item.id === annotation.id);
      if (!nextArticle || !nextAnnotation) {
        onRemoved();
        return;
      }
      replaceArticle(nextArticle);
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

  async function saveComment(
    annotationId: string,
    comment: Comment,
    updatedAt = new Date().toISOString(),
  ) {
    const nextAnnotations = annotationsWithSavedComment(
      annotationsRef.current,
      annotationId,
      comment,
      updatedAt,
    );
    if (!nextAnnotations) return;
    const nextArticle = applyAnnotations(nextAnnotations);
    if (!nextArticle) return;
    await annotationWindowActions.saveComment(
      nextArticle.id,
      annotationId,
      comment,
      nextArticle.updatedAt,
    );
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
        annotation.id,
        userComment,
        userComment.createdAt,
      );
      const nextAnnotation = nextAnnotations?.find((item) => item.id === annotation.id);
      if (!nextAnnotations || !nextAnnotation) return;

      await saveComment(annotation.id, userComment, userComment.createdAt);
      const mentionedAgents = findMentionedAgents(trimmed, annotationAgents);
      const targetAgents =
        mentionedAgents.length > 0
          ? mentionedAgents
          : replyTargetAgents(trimmed, selectedRoot, replyRuleAgents);
      const instruction = agentInstructionFromNote(trimmed, targetAgents) || undefined;
      setReplyAgentRuns(
        targetAgents.map((agent, index) => ({
          agent,
          rootId: selectedRoot.id,
          status: index === 0 ? 'active' : 'queued',
        })),
      );
      for (const [index, agent] of targetAgents.entries()) {
        setReplyAgentRuns(
          targetAgents.slice(index).map((runAgent, runIndex) => ({
            agent: runAgent,
            rootId: selectedRoot.id,
            status: runIndex === 0 ? 'active' : 'queued',
          })),
        );
        const latestAnnotation =
          annotationsRef.current.find((item) => item.id === annotation.id) || nextAnnotation;
        await requestAgentReply(agent, latestAnnotation, userComment, instruction, {
          allowDisabledAgentForRule: mentionedAgents.length === 0,
        });
      }
    } catch (error) {
      setSendError(assistantRuntimeErrorMessage(error, 'discussion.replyFailed'));
    } finally {
      setSendingReply(false);
      setReplyAgentRuns([]);
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
          annotation.id,
          userComment,
          userComment.createdAt,
        );
        const nextAnnotation = nextAnnotations?.find((item) => item.id === annotation.id);
        if (!nextAnnotations || !nextAnnotation) return;

        await saveComment(annotation.id, userComment, userComment.createdAt);
        setSelectedThoughtId(userComment.id);

        const mentionedAgents = findMentionedAgents(trimmed, annotationAgents);
        const instruction = agentInstructionFromNote(trimmed, mentionedAgents) || undefined;
        for (const agent of mentionedAgents) {
          const latestAnnotation =
            annotationsRef.current.find((item) => item.id === annotation.id) || nextAnnotation;
          await requestAgentReply(agent, latestAnnotation, userComment, instruction);
        }
      } else {
        setAddThoughtCelebrating(false);
        setAddThoughtAgentRuns(
          mentionedThoughtAgents.map((agent) => ({
            agent,
            status: 'active',
          })),
        );
        const route = await planAssistantThoughtRoute(trimmed, mentionedThoughtAgents);
        const tasks = mentionedThoughtAgents.map((agent) => {
          const directive = mentionDirectivesForAgent(route, agent, 'create_thought')[0];
          const instruction =
            directive?.instruction ||
            agentInstructionFromNote(assistantThoughtRouteNote(trimmed, mentionedThoughtAgents), [
              agent,
            ]) ||
            trimmed;
          return {
            agent,
            instruction,
            readingIntent: directive?.readingIntent,
          };
        });
        setAddThoughtAgentRuns(
          tasks.map((task) => ({
            agent: task.agent,
            instruction: task.instruction,
            readingIntent: task.readingIntent,
            status: 'active',
          })),
        );
        const failedCount = await runAssistantThoughtTasks(tasks);
        if (failedCount > 0) return;
        await finishSuccessfulAssistantThoughts();
      }
      closeNewThoughtDialog();
    } catch (error) {
      setSendError(assistantRuntimeErrorMessage(error, 'discussion.addThought.failed'));
    } finally {
      setSubmittingThought(false);
      setStatusMessage('');
    }
  }

  async function retryAddThoughtRuns(agentIds: string[]) {
    if (submittingThought) return;
    const tasks = addThoughtAgentRuns
      .filter(
        (run) => agentIds.includes(run.agent.id) && run.status === 'failed' && run.instruction,
      )
      .map((run) => ({
        agent: run.agent,
        instruction: run.instruction || '',
        readingIntent: run.readingIntent,
      }));
    if (tasks.length === 0) return;

    setSubmittingThought(true);
    setSendError('');
    setAddThoughtCelebrating(false);
    setAddThoughtAgentRuns((runs) =>
      runs.map((run) =>
        agentIds.includes(run.agent.id)
          ? { ...run, errorMessage: undefined, progress: undefined, status: 'active' }
          : run,
      ),
    );
    try {
      const failedCount = await runAssistantThoughtTasks(tasks);
      if (failedCount > 0) return;
      if (
        addThoughtAgentRuns.every((run) => run.status === 'done' || agentIds.includes(run.agent.id))
      ) {
        await finishSuccessfulAssistantThoughts();
        closeNewThoughtDialog();
      }
    } finally {
      setSubmittingThought(false);
      setStatusMessage('');
    }
  }

  async function runAssistantThoughtTasks(
    tasks: {
      agent: PublicAgent;
      instruction: string;
      readingIntent?: Comment['readingIntent'];
    }[],
  ) {
    const results = await Promise.all(
      tasks.map(async (task) => {
        const latestAnnotation =
          annotationsRef.current.find((item) => item.id === annotation.id) || annotation;
        try {
          await requestAgentThought(
            task.agent,
            latestAnnotation,
            task.instruction,
            task.readingIntent,
            {
              onComplete: () => {
                updateAddThoughtAgentRun(task.agent.id, {
                  errorMessage: undefined,
                  status: 'done',
                });
                playAppSoundEffect('discussion.assistant_thought_done', settings);
              },
              onError: () => updateAddThoughtAgentRun(task.agent.id, { status: 'failed' }),
              onProgress: (progress) =>
                updateAddThoughtAgentRun(task.agent.id, (current) => ({
                  progress: applyAssistantRuntimeProgress(current.progress, progress),
                })),
            },
          );
          return true;
        } catch (error) {
          updateAddThoughtAgentRun(task.agent.id, {
            errorMessage: assistantRuntimeErrorMessage(
              error,
              'discussion.addThought.assistantFailed',
            ),
            status: 'failed',
          });
          return false;
        }
      }),
    );
    return results.filter((result) => !result).length;
  }

  async function finishSuccessfulAssistantThoughts() {
    setAddThoughtCelebrating(true);
    await waitForMilliseconds(1000);
  }

  async function planAssistantThoughtRoute(note: string, selectedAgents: PublicAgent[]) {
    const routeNote = assistantThoughtRouteNote(note, selectedAgents);
    try {
      return await annotationWindowActions.planAgentMentionRoute({
        note: routeNote,
        targetAnchor: annotation.anchor,
        agents: selectedAgents,
        allowedActions: ['create_thought'],
        article: promptArticle(articleRef.current, discussionArticleText(articleRef.current)),
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
    options: { allowDisabledAgentForRule?: boolean } = {},
  ) {
    await runSourceAgentCommentRequest({
      agent,
      annotation: annotationValue,
      userComment,
      instruction,
      allowDisabledAgentForRule: options.allowDisabledAgentForRule,
      desktop: getDesktopApi().agent,
      currentArticle: articleRef.current,
      articleText: discussionArticleText(articleRef.current),
      uiLanguage,
      annotationsRef,
      applyAnnotations,
      saveComment,
      setStatusMessage,
    });
  }

  async function requestAgentThought(
    agent: PublicAgent,
    annotationValue: Annotation,
    instruction: string,
    readingIntent?: Comment['readingIntent'],
    lifecycle?: RunSourceAgentThoughtLifecycle,
  ) {
    await runSourceAgentThoughtRequest({
      agent,
      annotation: annotationValue,
      instruction,
      readingIntent,
      uiLanguage,
      desktop: annotationWindowActions,
      currentArticle: articleRef.current,
      articleText: discussionArticleText(articleRef.current),
      annotationsRef,
      applyAnnotations,
      saveComment,
      setStatusMessage,
      onThoughtStart: setSelectedThoughtId,
      lifecycle,
    });
  }

  function updateAddThoughtAgentRun(
    agentId: string,
    update:
      | Partial<Pick<AddThoughtAgentRun, 'errorMessage' | 'progress' | 'status'>>
      | ((
          current: AddThoughtAgentRun,
        ) => Partial<Pick<AddThoughtAgentRun, 'errorMessage' | 'progress' | 'status'>>),
  ) {
    setAddThoughtAgentRuns((runs) =>
      runs.map((run) =>
        run.agent.id === agentId
          ? {
              ...run,
              ...(typeof update === 'function' ? update(run) : update),
            }
          : run,
      ),
    );
  }

  function openNewThoughtDialog() {
    setNewThoughtOpen(true);
    setNewThoughtMode('self');
    setNewThoughtDraft('');
    setNewThoughtCaretIndex(0);
    setSendError('');
  }

  function openSedimentationWindow(sourceElement: Element) {
    void annotationWindowActions.openSedimentation({
      articleId: article.id,
      annotationId: annotation.id,
      sourceRect: elementWindowSourceRect(sourceElement),
    });
  }

  function toggleIdeasSidebar() {
    if (ideasAutoCollapsed) {
      setIdeasOverlayOpen((current) => !current);
      return;
    }
    setIdeasOverlayOpen(false);
    setIdeasCollapsed((current) => !current);
  }

  function selectThought(commentId: string) {
    setSelectedThoughtId(commentId);
    if (ideasOverlayOpen) setIdeasOverlayOpen(false);
  }

  function closeNewThoughtDialog() {
    setNewThoughtOpen(false);
    setNewThoughtDraft('');
    setNewThoughtCaretIndex(0);
    setAddThoughtAgentRuns([]);
    setAddThoughtCelebrating(false);
  }

  function togglePinnedThought(commentId: string) {
    setPinnedThoughtIds((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }

  return (
    <main className={className} style={style}>
      <section
        className="annotation-discussion-quote"
        aria-labelledby="annotation-discussion-quote-title"
      >
        <strong id="annotation-discussion-quote-title">{t('discussion.quoteTitle')}</strong>
        <p>{annotation.anchor.exact}</p>
      </section>

      <section
        ref={discussionLayoutRef}
        className={layoutClassName}
        aria-label={t('discussion.window')}
      >
        <aside className="annotation-discussion-ideas" aria-expanded={!ideasContentCollapsed}>
          <header>
            <button
              className="annotation-discussion-ideas-toggle"
              type="button"
              aria-label={
                ideasContentCollapsed
                  ? t('discussion.expandThoughts')
                  : t('discussion.collapseThoughts')
              }
              aria-expanded={!ideasContentCollapsed}
              onClick={toggleIdeasSidebar}
            >
              {ideasContentCollapsed ? (
                <HugeiconsIcon icon={PanelLeftOpenIcon} size={15} />
              ) : (
                <HugeiconsIcon icon={PanelLeftCloseIcon} size={15} />
              )}
            </button>
            <strong>{t('discussion.thoughts')}</strong>
            <span className="annotation-discussion-ideas-count">{threads.length}</span>
            <button
              className="annotation-discussion-add-thought"
              type="button"
              aria-label={t('discussion.addThought.title')}
              onClick={openNewThoughtDialog}
            >
              <HugeiconsIcon icon={Add01Icon} size={14} />
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
                  agents={annotationAgents}
                  userProfile={userProfile}
                  onDelete={() => void deleteComment(thread.root.id)}
                  onPin={() => togglePinnedThought(thread.root.id)}
                  onSelect={() => selectThought(thread.root.id)}
                />
              ))}
            </div>
          ) : (
            <p>{t('discussion.noThoughts')}</p>
          )}
          <footer className="annotation-discussion-sedimentation-entry">
            <button
              className={annotation.distillation?.status === 'published' ? undefined : 'is-primary'}
              type="button"
              aria-label={
                annotation.distillation?.status === 'published'
                  ? t('discussion.viewDistillation')
                  : t('discussion.createDistillation')
              }
              onClick={(event) => openSedimentationWindow(event.currentTarget)}
            >
              <HugeiconsIcon icon={GitPullRequestDraftIcon} size={14} />
              <span>
                {annotation.distillation?.status === 'published'
                  ? t('discussion.viewDistillation')
                  : t('discussion.createDistillation')}
              </span>
            </button>
          </footer>
        </aside>
        <section className="annotation-discussion-thread">
          <header>
            <strong>{t('discussion.thread')}</strong>
            <div className="annotation-discussion-thread-actions">
              <AnnotationLayoutControl value={layoutMode} onChange={setLayoutMode} />
            </div>
          </header>
          {selectedThread ? (
            <DiscussionThreadView
              activeReplyAgents={replyAgentRuns.filter(
                (run) => run.rootId === selectedThread.root.id,
              )}
              deletingCommentId={deletingCommentId}
              layoutMode={layoutMode}
              thread={selectedThread}
              userProfile={userProfile}
              onDelete={(commentId) => void deleteComment(commentId)}
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
              <HugeiconsIcon icon={BubbleChatIcon} size={22} />
              <strong>{t('discussion.selectThoughtTitle')}</strong>
              <p>{t('discussion.selectThoughtDescription')}</p>
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
          runningAgents={addThoughtAgentRuns}
          celebrating={addThoughtCelebrating}
          submitting={submittingThought}
          onCancel={closeNewThoughtDialog}
          onCaretChange={setNewThoughtCaretIndex}
          onDraftChange={setNewThoughtDraft}
          onModeChange={setNewThoughtMode}
          onRetry={(agentId) => void retryAddThoughtRuns([agentId])}
          onRetryAll={() =>
            void retryAddThoughtRuns(
              addThoughtAgentRuns
                .filter((run) => run.status === 'failed')
                .map((run) => run.agent.id),
            )
          }
          onSubmit={() => void submitNewThought()}
        />
      ) : null}
    </main>
  );
}

function annotationDiscussionWindowClassName() {
  return ['annotation-discussion-window', `is-${annotationWindowActions.platform() ?? 'unknown'}`]
    .filter(Boolean)
    .join(' ');
}
