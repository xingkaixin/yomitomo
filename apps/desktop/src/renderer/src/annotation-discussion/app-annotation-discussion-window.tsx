import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  GitPullRequestDraftIcon,
  BubbleChatIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from '@hugeicons/core-free-icons';
import { useEffectEvent, useMemo, useReducer, useRef, type CSSProperties } from 'react';
import type {
  Agent,
  Annotation,
  AssistantChannel,
  AssistantDeliveryRequest,
  ResolvedAppSettings,
  ArticleRecord,
  Comment,
  PublicAgent,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { createUserComment, findMentionedAgents, sortAnnotations } from '@yomitomo/core';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import {
  agentInstructionFromNote,
  mentionDirectivesForAgent,
} from '../source/bookcase/app-source-agent-mention-request';
import { annotationsWithSavedComment } from '../source/bookcase/source-annotation-updates';
import { promptArticle } from '../source/bookcase/source-prompt-article';
import {
  publicAnnotationAgents,
  publicPersonaAgents,
} from '../source/bookcase/source-public-agents';
import { playAppSoundEffect, stopAppSoundEffect } from '../sound/app-sound-effects';
import {
  AnnotationLayoutControl,
  type AnnotationMessageLayoutMode,
} from './app-annotation-layout-control';
import { assistantRuntimeErrorMessage } from '../shell/app-assistant-runtime-progress';
import { deliverAssistantMessage } from '../shell/app-assistant-runs';
import {
  elementWindowSourceRect,
  useSourceAwareWindowTransition,
} from '../shell/app-window-transition';
import {
  annotationUserProfile,
  annotationWithAssistantRuns,
  assistantThoughtRouteNote,
  discussionArticleText,
  replyTargetAgents,
  discussionThreads,
  waitForMilliseconds,
} from './app-annotation-discussion-utils';
import type { AddThoughtAgentRun } from './app-annotation-discussion-add-run';
import { AddThoughtDialog } from './app-annotation-discussion-add-dialog';
import { ThoughtListItem } from './app-annotation-discussion-thread-list';
import { DiscussionThreadView } from './app-annotation-discussion-thread-view';
import { useElementWidthBelowRef } from './app-annotation-discussion-hooks';
import {
  bindDiscussionWindow,
  createDiscussionWindowStore,
  DiscussionWindowStoreProvider,
  useDiscussionWindow,
  useDiscussionWindowStoreApi,
} from './app-annotation-discussion-window-store';
import { readAnnotationWindowRoute, type AnnotationWindowRoute } from './annotation-window-startup';
import { annotationWindowActions } from './app-annotation-window-actions';
import { getDesktopApi } from '../shell/app-desktop-api';
import { AppToaster, appToast } from '../shell/app-toast';

export { insertMentionAtSelection } from './app-annotation-discussion-utils';

type DiscussionLayoutMode = AnnotationMessageLayoutMode;
type NewThoughtMode = 'self' | 'assistant';
const DISCUSSION_IDEAS_AUTO_COLLAPSE_WIDTH = 760;

/** Starts the discussion window from its URL and returns its root component. */
export function createAnnotationDiscussionWindow() {
  const route = readAnnotationWindowRoute();
  const store = createDiscussionWindowStore(route);
  const unbind = bindDiscussionWindow(store, route);
  import.meta.hot?.dispose(unbind);
  return function AnnotationDiscussionWindow() {
    return (
      <DiscussionWindowStoreProvider store={store}>
        <AnnotationDiscussionWindowApp route={route} />
      </DiscussionWindowStoreProvider>
    );
  };
}

function AnnotationDiscussionWindowApp({ route }: { route: AnnotationWindowRoute }) {
  const { t } = useTranslation();
  const status = useDiscussionWindow((state) => state.status);
  const themeTone = useDiscussionWindow((state) => state.themeTone);
  const className = annotationDiscussionWindowClassName();
  const windowTransition = useSourceAwareWindowTransition(route.params);
  const windowClassName = [className, windowTransition.className].filter(Boolean).join(' ');

  if (status.type === 'ready') {
    const annotation = status.article.annotations.find((item) => item.id === route.annotationId);
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
      <>
        <AnnotationDiscussionShell
          agents={status.agents}
          article={status.article}
          annotation={annotation}
          className={windowClassName}
          settings={status.settings}
          style={windowTransition.style}
          uiLanguage={status.uiLanguage}
          user={status.user}
        />
        <AppToaster tone={themeTone} topOffset={24} />
      </>
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

function useDiscussionArticleProjection(annotationId: string, article: ArticleRecord) {
  const store = useDiscussionWindowStoreApi();
  const { annotationRemoved, articleChanged } = store.getState().actions;

  // Async work reads the store so it sees articles saved after it started.
  function latestArticle() {
    const { status } = store.getState();
    return status.type === 'ready' ? status.article : article;
  }

  function applyAnnotations(annotations: Annotation[], updatedAt = new Date().toISOString()) {
    const sortedAnnotations = sortAnnotations(annotations);
    if (!sortedAnnotations.some((item) => item.id === annotationId)) {
      annotationRemoved();
      return null;
    }
    const nextArticle = {
      ...latestArticle(),
      annotations: sortedAnnotations,
      updatedAt,
    };
    articleChanged(nextArticle);
    return nextArticle;
  }

  return { annotationRemoved, applyAnnotations, latestArticle, replaceArticle: articleChanged };
}

type DiscussionShellState = {
  addThoughtAgentRuns: AddThoughtAgentRun[];
  addThoughtCelebrating: boolean;
  deletingCommentId: string | null;
  ideasAutoCollapsed: boolean;
  ideasCollapsed: boolean;
  ideasOverlayOpen: boolean;
  layoutMode: DiscussionLayoutMode;
  newThoughtCaretIndex: number;
  newThoughtDraft: string;
  newThoughtMode: NewThoughtMode;
  newThoughtOpen: boolean;
  pinnedThoughtIds: Set<string>;
  replyCaretIndex: number;
  replyDraft: string;
  selectedThoughtId: string | null;
  sendError: string;
  sendingReply: boolean;
  submittingThought: boolean;
};

type DiscussionShellEvent =
  | { type: 'assistantThoughtFailed'; agentId: string; errorMessage: string }
  | { type: 'assistantThoughtFinished'; agentId: string; commentId?: string }
  | { type: 'assistantThoughtRetryStarted'; agentIds: string[] }
  | { type: 'assistantThoughtRunsStarted'; runs: AddThoughtAgentRun[] }
  | { type: 'assistantThoughtsCelebrated' }
  | { type: 'commentDeleteFailed'; error: string }
  | { type: 'commentDeleteStarted'; commentId: string }
  | { type: 'commentDeleted'; commentId: string; selectedThoughtId: string | null }
  | { type: 'errorShown'; error: string }
  | { type: 'ideasSidebarToggled' }
  | { type: 'layoutModeChanged'; layoutMode: DiscussionLayoutMode }
  | { type: 'layoutWidthMeasured'; narrow: boolean }
  | { type: 'newThoughtCaretMoved'; caretIndex: number }
  | { type: 'newThoughtClosed' }
  | { type: 'newThoughtDraftChanged'; draft: string }
  | { type: 'newThoughtModeChanged'; mode: NewThoughtMode }
  | { type: 'newThoughtOpened' }
  | { type: 'replyCaretMoved'; caretIndex: number }
  | { type: 'replyDraftChanged'; draft: string }
  | { type: 'replyFailed'; error: string; restoredDraft: string | null }
  | { type: 'replySettled' }
  | { type: 'replySubmitted' }
  | { type: 'selfThoughtSaved'; commentId: string }
  | { type: 'thoughtDraftReceived'; draft: string }
  | { type: 'thoughtPinToggled'; commentId: string }
  | { type: 'thoughtSelected'; commentId: string }
  | { type: 'thoughtSubmitSettled' }
  | { type: 'thoughtSubmitStarted' };

function initialDiscussionShellState(annotation: Annotation): DiscussionShellState {
  return {
    addThoughtAgentRuns: [],
    addThoughtCelebrating: false,
    deletingCommentId: null,
    ideasAutoCollapsed: false,
    ideasCollapsed: false,
    ideasOverlayOpen: false,
    layoutMode: 'split',
    newThoughtCaretIndex: 0,
    newThoughtDraft: '',
    newThoughtMode: 'self',
    newThoughtOpen: false,
    pinnedThoughtIds: new Set(),
    replyCaretIndex: 0,
    replyDraft: '',
    selectedThoughtId: discussionThreads(annotation, new Set())[0]?.root.id ?? null,
    sendError: '',
    sendingReply: false,
    submittingThought: false,
  };
}

function updateAgentRun(
  runs: AddThoughtAgentRun[],
  agentId: string,
  update: Partial<AddThoughtAgentRun>,
) {
  return runs.map((run) => (run.agent.id === agentId ? { ...run, ...update } : run));
}

function discussionShellReducer(
  state: DiscussionShellState,
  event: DiscussionShellEvent,
): DiscussionShellState {
  switch (event.type) {
    case 'assistantThoughtFailed':
      return {
        ...state,
        addThoughtAgentRuns: updateAgentRun(state.addThoughtAgentRuns, event.agentId, {
          errorMessage: event.errorMessage,
          status: 'failed',
        }),
      };
    case 'assistantThoughtFinished':
      return {
        ...state,
        addThoughtAgentRuns: updateAgentRun(state.addThoughtAgentRuns, event.agentId, {
          errorMessage: undefined,
          status: 'done',
        }),
        selectedThoughtId: event.commentId ?? state.selectedThoughtId,
      };
    case 'assistantThoughtRetryStarted':
      return {
        ...state,
        addThoughtAgentRuns: state.addThoughtAgentRuns.map((run) =>
          event.agentIds.includes(run.agent.id)
            ? { ...run, errorMessage: undefined, progress: undefined, status: 'active' }
            : run,
        ),
        addThoughtCelebrating: false,
        sendError: '',
        submittingThought: true,
      };
    case 'assistantThoughtRunsStarted':
      return { ...state, addThoughtAgentRuns: event.runs, addThoughtCelebrating: false };
    case 'assistantThoughtsCelebrated':
      return { ...state, addThoughtCelebrating: true };
    case 'commentDeleteFailed':
      return { ...state, deletingCommentId: null, sendError: event.error };
    case 'commentDeleteStarted':
      return { ...state, deletingCommentId: event.commentId, sendError: '' };
    case 'commentDeleted': {
      const pinnedThoughtIds = new Set(state.pinnedThoughtIds);
      pinnedThoughtIds.delete(event.commentId);
      return {
        ...state,
        deletingCommentId: null,
        pinnedThoughtIds: state.pinnedThoughtIds.has(event.commentId)
          ? pinnedThoughtIds
          : state.pinnedThoughtIds,
        selectedThoughtId: event.selectedThoughtId,
      };
    }
    case 'errorShown':
      return { ...state, sendError: event.error };
    case 'ideasSidebarToggled':
      return state.ideasAutoCollapsed
        ? { ...state, ideasOverlayOpen: !state.ideasOverlayOpen }
        : { ...state, ideasCollapsed: !state.ideasCollapsed, ideasOverlayOpen: false };
    case 'layoutModeChanged':
      return { ...state, layoutMode: event.layoutMode };
    case 'layoutWidthMeasured':
      if (state.ideasAutoCollapsed === event.narrow) return state;
      return {
        ...state,
        ideasAutoCollapsed: event.narrow,
        ideasOverlayOpen: event.narrow && state.ideasOverlayOpen,
      };
    case 'newThoughtCaretMoved':
      return { ...state, newThoughtCaretIndex: event.caretIndex };
    case 'newThoughtClosed':
      return {
        ...state,
        addThoughtAgentRuns: [],
        addThoughtCelebrating: false,
        newThoughtCaretIndex: 0,
        newThoughtDraft: '',
        newThoughtOpen: false,
      };
    case 'newThoughtDraftChanged':
      return { ...state, newThoughtDraft: event.draft };
    case 'newThoughtModeChanged':
      return { ...state, newThoughtMode: event.mode };
    case 'newThoughtOpened':
      return {
        ...state,
        newThoughtCaretIndex: 0,
        newThoughtDraft: '',
        newThoughtMode: 'self',
        newThoughtOpen: true,
        sendError: '',
      };
    case 'replyCaretMoved':
      return { ...state, replyCaretIndex: event.caretIndex };
    case 'replyDraftChanged':
      return { ...state, replyDraft: event.draft };
    case 'replyFailed':
      return event.restoredDraft === null
        ? { ...state, sendError: event.error }
        : {
            ...state,
            replyCaretIndex: event.restoredDraft.length,
            replyDraft: event.restoredDraft,
            sendError: event.error,
          };
    case 'replySettled':
      return { ...state, sendingReply: false };
    case 'replySubmitted':
      return { ...state, replyCaretIndex: 0, replyDraft: '', sendError: '', sendingReply: true };
    case 'selfThoughtSaved':
      return { ...state, selectedThoughtId: event.commentId };
    case 'thoughtDraftReceived':
      return {
        ...state,
        newThoughtCaretIndex: event.draft.length,
        newThoughtDraft: event.draft,
        newThoughtMode: 'self',
        newThoughtOpen: true,
        sendError: '',
      };
    case 'thoughtPinToggled': {
      const pinnedThoughtIds = new Set(state.pinnedThoughtIds);
      if (pinnedThoughtIds.has(event.commentId)) pinnedThoughtIds.delete(event.commentId);
      else pinnedThoughtIds.add(event.commentId);
      return { ...state, pinnedThoughtIds };
    }
    case 'thoughtSelected':
      return { ...state, ideasOverlayOpen: false, selectedThoughtId: event.commentId };
    case 'thoughtSubmitSettled':
      return { ...state, submittingThought: false };
    case 'thoughtSubmitStarted':
      return { ...state, sendError: '', submittingThought: true };
  }
}

function AnnotationDiscussionShell({
  agents,
  annotation,
  article,
  className,
  settings,
  style,
  uiLanguage,
  user,
}: {
  agents: Agent[];
  annotation: Annotation;
  article: ArticleRecord;
  className: string;
  settings: ResolvedAppSettings;
  style: CSSProperties;
  uiLanguage: UiLanguage;
  user: UserProfile;
}) {
  const { t } = useTranslation();
  const { annotationRemoved, applyAnnotations, latestArticle, replaceArticle } =
    useDiscussionArticleProjection(annotation.id, article);
  const [state, dispatch] = useReducer(
    discussionShellReducer,
    annotation,
    initialDiscussionShellState,
  );
  const {
    addThoughtAgentRuns,
    addThoughtCelebrating,
    deletingCommentId,
    ideasAutoCollapsed,
    ideasCollapsed,
    ideasOverlayOpen,
    layoutMode,
    newThoughtCaretIndex,
    newThoughtDraft,
    newThoughtMode,
    newThoughtOpen,
    pinnedThoughtIds,
    replyCaretIndex,
    replyDraft,
    selectedThoughtId,
    sendError,
    sendingReply,
    submittingThought,
  } = state;
  const thoughtDraftHandoffRef = useRef(false);
  const discussionLayoutRef = useElementWidthBelowRef(
    DISCUSSION_IDEAS_AUTO_COLLAPSE_WIDTH,
    (narrow) => dispatch({ type: 'layoutWidthMeasured', narrow }),
  );

  const annotationAgents = useMemo(
    () => publicAnnotationAgents(agents, uiLanguage),
    [agents, uiLanguage],
  );
  const personaAgents = useMemo(
    () => publicPersonaAgents(agents, uiLanguage),
    [agents, uiLanguage],
  );
  const replyRuleAgents = useMemo(
    () => publicAnnotationAgents(agents, uiLanguage, { includeDisabled: true }),
    [agents, uiLanguage],
  );
  const userProfile = annotationUserProfile(annotation, article, user);
  const assistantRuns = useDiscussionWindow((windowState) => windowState.assistantRuns);
  const threads = useMemo(
    () =>
      discussionThreads(
        annotationWithAssistantRuns(annotation, assistantRuns, replyRuleAgents),
        pinnedThoughtIds,
      ),
    [annotation, assistantRuns, pinnedThoughtIds, replyRuleAgents],
  );
  // An awaited assistant thought stays selected until the reloaded article brings it in.
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

  const assistantThoughtWriting = addThoughtAgentRuns.some((run) => run.status === 'active');
  const receiveThoughtDraft = useEffectEvent((draft: string) => {
    if (
      thoughtDraftHandoffRef.current ||
      newThoughtDraft.length > 0 ||
      submittingThought ||
      sendingReply ||
      assistantThoughtWriting
    ) {
      appToast.warning(t('readingMemory.library.thought.draftBusy'));
      return;
    }
    // Multiple IPC replies can settle before React commits the first draft.
    thoughtDraftHandoffRef.current = true;
    dispatch({ type: 'thoughtDraftReceived', draft });
  });
  const reportThoughtDraftFailure = useEffectEvent((error: unknown) => {
    console.warn('[annotation-discussion] thought draft loading failed', {
      articleId: article.id,
      annotationId: annotation.id,
      error,
    });
    appToast.error(t('readingMemory.library.thought.draftLoadFailed'));
  });

  useMountEffect(() => {
    let active = true;
    const discussion = getDesktopApi().annotations.discussion;
    const consumeThoughtDraft = () => {
      void discussion
        .consumeThoughtDraft()
        .then((draft) => {
          if (active && draft !== null) receiveThoughtDraft(draft);
        })
        .catch((error: unknown) => {
          if (active) reportThoughtDraftFailure(error);
        });
    };
    const unsubscribe = discussion.onThoughtDraftAvailable(consumeThoughtDraft);
    consumeThoughtDraft();
    return () => {
      active = false;
      unsubscribe();
    };
  });

  useMountEffect(() => () => stopAppSoundEffect('discussion.assistant_thought_writing'));

  async function deleteComment(commentId: string) {
    if (deletingCommentId) return;
    dispatch({ type: 'commentDeleteStarted', commentId });
    const visibleThreadId = selectedThread?.root.id ?? null;
    const nextSelectedThoughtId =
      visibleThreadId === commentId
        ? (threads.find((thread) => thread.root.id !== commentId)?.root.id ?? null)
        : visibleThreadId;
    try {
      const nextArticle = await annotationWindowActions.deleteCommentAndReload(
        article.id,
        annotation.id,
        commentId,
      );
      const nextAnnotation = nextArticle?.annotations.find((item) => item.id === annotation.id);
      if (!nextArticle || !nextAnnotation) {
        annotationRemoved();
        return;
      }
      replaceArticle(nextArticle);
      dispatch({ type: 'commentDeleted', commentId, selectedThoughtId: nextSelectedThoughtId });
    } catch (error) {
      console.warn('[annotation-discussion] comment deletion failed', {
        articleId: article.id,
        annotationId: annotation.id,
        commentId,
        error,
      });
      dispatch({
        type: 'commentDeleteFailed',
        error: assistantRuntimeErrorMessage(error, 'discussion.deleteFailed'),
      });
    }
  }

  async function saveComment(
    annotationId: string,
    comment: Comment,
    updatedAt = new Date().toISOString(),
  ) {
    const articleId = latestArticle().id;
    const articleUpdatedAt = new Date().toISOString();
    await annotationWindowActions.saveComment(articleId, annotationId, comment, articleUpdatedAt);
    const nextAnnotations = annotationsWithSavedComment(
      latestArticle().annotations,
      annotationId,
      comment,
      updatedAt,
    );
    if (!nextAnnotations) return;
    applyAnnotations(nextAnnotations, articleUpdatedAt);
  }

  async function submitReply() {
    const selectedRoot = selectedThread?.root;
    const draft = replyDraft;
    const trimmed = draft.trim();
    if (!selectedRoot || !trimmed || sendingReply) return;
    dispatch({ type: 'replySubmitted' });
    let userCommentSaved = false;
    try {
      const userComment = createUserComment(userProfile, trimmed, { replyTo: selectedRoot.id });
      await saveComment(annotation.id, userComment, userComment.createdAt);
      userCommentSaved = true;
      const mentionedAgents = findMentionedAgents(trimmed, annotationAgents);
      const targetAgents =
        mentionedAgents.length > 0
          ? mentionedAgents
          : replyTargetAgents(trimmed, selectedRoot, replyRuleAgents);
      const instruction = agentInstructionFromNote(trimmed, targetAgents) || undefined;
      const channel: AssistantChannel = {
        kind: 'thread',
        annotationId: annotation.id,
        threadId: selectedRoot.id,
      };
      await Promise.all(
        targetAgents.map((agent) =>
          requestAgentReply(agent, channel, userComment.id, {
            instruction,
            allowDisabledAgentForRule: mentionedAgents.length === 0,
          }),
        ),
      );
    } catch (error) {
      console.warn('[annotation-discussion] reply submission failed', {
        articleId: article.id,
        annotationId: annotation.id,
        error,
      });
      dispatch({
        type: 'replyFailed',
        error: assistantRuntimeErrorMessage(error, 'discussion.replyFailed'),
        restoredDraft: userCommentSaved ? null : draft,
      });
    } finally {
      dispatch({ type: 'replySettled' });
    }
  }

  async function submitNewThought() {
    const trimmed = newThoughtDraft.trim();
    if (!trimmed || submittingThought) return;
    const mentionedThoughtAgents = findMentionedAgents(trimmed, annotationAgents);
    if (newThoughtMode === 'assistant' && mentionedThoughtAgents.length === 0) return;
    dispatch({ type: 'thoughtSubmitStarted' });
    try {
      if (newThoughtMode === 'self') {
        const userComment = createUserComment(userProfile, trimmed);
        await saveComment(annotation.id, userComment, userComment.createdAt);
        dispatch({ type: 'selfThoughtSaved', commentId: userComment.id });

        const mentionedAgents = findMentionedAgents(trimmed, annotationAgents);
        const instruction = agentInstructionFromNote(trimmed, mentionedAgents) || undefined;
        const channel: AssistantChannel = {
          kind: 'thread',
          annotationId: annotation.id,
          threadId: userComment.id,
        };
        await Promise.all(
          mentionedAgents.map((agent) =>
            requestAgentReply(agent, channel, userComment.id, { instruction }),
          ),
        );
      } else {
        dispatch({
          type: 'assistantThoughtRunsStarted',
          runs: mentionedThoughtAgents.map((agent) => ({ agent, status: 'active' })),
        });
        playAppSoundEffect('discussion.assistant_thought_writing', settings);
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
        dispatch({
          type: 'assistantThoughtRunsStarted',
          runs: tasks.map((task) => ({
            agent: task.agent,
            instruction: task.instruction,
            readingIntent: task.readingIntent,
            status: 'active',
          })),
        });
        const failedCount = await runAssistantThoughtTasks(tasks);
        if (failedCount > 0) return;
        await finishSuccessfulAssistantThoughts();
      }
      closeNewThoughtDialog();
    } catch (error) {
      console.warn('[annotation-discussion] thought submission failed', {
        articleId: article.id,
        annotationId: annotation.id,
        error,
      });
      dispatch({
        type: 'errorShown',
        error: assistantRuntimeErrorMessage(error, 'discussion.addThought.failed'),
      });
    } finally {
      dispatch({ type: 'thoughtSubmitSettled' });
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

    dispatch({ type: 'assistantThoughtRetryStarted', agentIds });
    playAppSoundEffect('discussion.assistant_thought_writing', settings);
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
      dispatch({ type: 'thoughtSubmitSettled' });
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
        try {
          const event = await requestAgentThought(task.agent, task.instruction, task.readingIntent);
          dispatch({
            type: 'assistantThoughtFinished',
            agentId: task.agent.id,
            commentId: event.commentId,
          });
          playAppSoundEffect('discussion.assistant_thought_done', settings);
          return true;
        } catch (error) {
          dispatch({
            type: 'assistantThoughtFailed',
            agentId: task.agent.id,
            errorMessage: assistantRuntimeErrorMessage(
              error,
              'discussion.addThought.assistantFailed',
            ),
          });
          return false;
        }
      }),
    );
    stopAppSoundEffect('discussion.assistant_thought_writing');
    return results.filter((result) => !result).length;
  }

  async function finishSuccessfulAssistantThoughts() {
    dispatch({ type: 'assistantThoughtsCelebrated' });
    await waitForMilliseconds(1000);
  }

  async function planAssistantThoughtRoute(note: string, selectedAgents: PublicAgent[]) {
    const routeNote = assistantThoughtRouteNote(note, selectedAgents);
    try {
      const currentArticle = latestArticle();
      return await annotationWindowActions.planAgentMentionRoute({
        note: routeNote,
        targetAnchor: annotation.anchor,
        agents: selectedAgents,
        allowedActions: ['create_thought'],
        article: promptArticle(currentArticle, discussionArticleText(currentArticle)),
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

  function assistantRequest(
    agent: PublicAgent,
    channel: AssistantChannel,
    triggerId: string,
    options: Pick<
      AssistantDeliveryRequest,
      'allowDisabledAgentForRule' | 'instruction' | 'readingIntent'
    > = {},
  ): AssistantDeliveryRequest {
    return { articleId: article.id, channel, agentId: agent.id, triggerId, ...options };
  }

  async function requestAgentReply(
    agent: PublicAgent,
    channel: AssistantChannel,
    triggerId: string,
    options: Pick<AssistantDeliveryRequest, 'allowDisabledAgentForRule' | 'instruction'> = {},
  ) {
    const delivery = await deliverAssistantMessage(
      assistantRequest(agent, channel, triggerId, options),
    );
    void delivery?.settled.then((event) => {
      if (event.status !== 'failed') return;
      console.warn('[annotation-discussion] assistant reply failed', event);
      dispatch({ type: 'errorShown', error: t('discussion.replyFailed') });
    });
  }

  async function requestAgentThought(
    agent: PublicAgent,
    instruction: string,
    readingIntent?: Comment['readingIntent'],
  ) {
    const delivery = await deliverAssistantMessage(
      assistantRequest(agent, { kind: 'annotation', annotationId: annotation.id }, makeId('ask'), {
        instruction,
        readingIntent,
      }),
    );
    const event = await delivery?.settled;
    if (event?.status === 'done') return event;
    console.warn('[annotation-discussion] assistant thought failed', event);
    throw new Error(t('discussion.addThought.assistantFailed'));
  }

  function openNewThoughtDialog() {
    thoughtDraftHandoffRef.current = false;
    dispatch({ type: 'newThoughtOpened' });
  }

  function changeNewThoughtDraft(draft: string) {
    thoughtDraftHandoffRef.current = false;
    dispatch({ type: 'newThoughtDraftChanged', draft });
  }

  function closeNewThoughtDialog() {
    thoughtDraftHandoffRef.current = false;
    dispatch({ type: 'newThoughtClosed' });
  }

  function openSedimentationWindow(sourceElement: Element) {
    void annotationWindowActions.openSedimentation({
      articleId: article.id,
      annotationId: annotation.id,
      sourceRect: elementWindowSourceRect(sourceElement),
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
              onClick={() => dispatch({ type: 'ideasSidebarToggled' })}
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
                  agents={personaAgents}
                  userProfile={userProfile}
                  onDelete={() => void deleteComment(thread.root.id)}
                  onPin={() => dispatch({ type: 'thoughtPinToggled', commentId: thread.root.id })}
                  onSelect={() => dispatch({ type: 'thoughtSelected', commentId: thread.root.id })}
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
              <AnnotationLayoutControl
                value={layoutMode}
                onChange={(mode) => dispatch({ type: 'layoutModeChanged', layoutMode: mode })}
              />
            </div>
          </header>
          {selectedThread ? (
            <DiscussionThreadView
              articleId={article.id}
              deletingCommentId={deletingCommentId}
              layoutMode={layoutMode}
              thread={selectedThread}
              userProfile={userProfile}
              onDelete={(commentId) => void deleteComment(commentId)}
              onReplyCaretChange={(caretIndex) => dispatch({ type: 'replyCaretMoved', caretIndex })}
              onReplyDraftChange={(draft) => dispatch({ type: 'replyDraftChanged', draft })}
              onSubmitReply={() => void submitReply()}
              replyDraft={replyDraft}
              replyCaretIndex={replyCaretIndex}
              annotationAgents={annotationAgents}
              personaAgents={personaAgents}
              sendingReply={sendingReply}
              sendError={sendError}
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
          onCaretChange={(caretIndex) => dispatch({ type: 'newThoughtCaretMoved', caretIndex })}
          onDraftChange={changeNewThoughtDraft}
          onModeChange={(mode) => dispatch({ type: 'newThoughtModeChanged', mode })}
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
