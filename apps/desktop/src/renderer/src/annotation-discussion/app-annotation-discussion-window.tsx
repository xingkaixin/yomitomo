import { useDesktopReaderSettings } from '../settings/app-reader-settings';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  GitPullRequestDraftIcon,
  BubbleChatIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from '@hugeicons/core-free-icons';
import { useMemo, useReducer, useRef, type CSSProperties } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
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
import {
  annotationColor,
  createUserComment,
  editUserComment,
  findMentionedAgents,
  isEditableUserComment,
  sortAnnotations,
} from '@yomitomo/core';
import { readerLineColorOptions } from '@yomitomo/reader-ui/reader-settings';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { agentInstructionFromNote } from '../source/bookcase/app-source-agent-mention-request';
import {
  annotationsWithSavedColor,
  annotationsWithSavedComment,
} from '../source/bookcase/source-annotation-updates';
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
import {
  classifyAssistantError,
  classifyAssistantRunFailure,
  type AssistantFailureInfo,
} from '../shell/assistant-error-classification';
import { deliverAssistantMessage } from '../shell/app-assistant-runs';
import {
  elementWindowSourceRect,
  useSourceAwareWindowTransition,
} from '../shell/app-window-transition';
import {
  annotationUserProfile,
  annotationWithAssistantRuns,
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
import { AppIsland } from '../shell/app-island';
import { Textarea } from '../components/ui/textarea';
import { appToast } from '../shell/app-toast';
import { useDesktopEvent } from '../shell/use-desktop-event';
import { measureDiscussionWindowTransition } from '../reading-library/discussion-window-transition';

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
  const className = annotationDiscussionWindowClassName();
  const windowTransition = useSourceAwareWindowTransition(route.params);
  useDesktopEvent(getDesktopApi()?.annotations?.discussion?.onTransition, (event) => {
    void measureDiscussionWindowTransition(event)?.catch(() => undefined);
  });
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
        <AppIsland />
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

type FailedReplyDelivery = {
  agent: PublicAgent;
  channel: AssistantChannel;
  sourceCommentId: string;
  targetAgents: PublicAgent[];
  allowDisabledAgentForRule?: boolean;
};

type DiscussionReplyError = {
  failure: AssistantFailureInfo;
  threadId: string | null;
};

type DiscussionShellState = {
  addThoughtAgentRuns: AddThoughtAgentRun[];
  addThoughtCelebrating: boolean;
  deletingCommentId: string | null;
  ideasAutoCollapsed: boolean;
  ideasCollapsed: boolean;
  ideasOverlayOpen: boolean;
  ideasRailSettled: boolean;
  layoutMode: DiscussionLayoutMode;
  newThoughtCaretIndex: number;
  newThoughtDraft: string;
  newThoughtMode: NewThoughtMode;
  newThoughtOpen: boolean;
  pinnedThoughtIds: Set<string>;
  replyCaretIndex: number;
  replyDraft: string;
  replyError: DiscussionReplyError | null;
  deliveryErrors: {
    threadId: string;
    delivery: FailedReplyDelivery;
    failure: AssistantFailureInfo;
  }[];
  selectedThoughtId: string | null;
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
  | {
      type: 'replyDeliveryFailed';
      delivery: FailedReplyDelivery;
      failure: AssistantFailureInfo;
      threadId: string;
    }
  | { type: 'replyRetryStarted' | 'replyDeliverySucceeded'; threadId: string; agentId: string }
  | { type: 'ideasSidebarToggled' }
  | { type: 'ideasSlideEnded' }
  | { type: 'layoutModeChanged'; layoutMode: DiscussionLayoutMode }
  | { type: 'layoutWidthMeasured'; narrow: boolean }
  | { type: 'newThoughtCaretMoved'; caretIndex: number }
  | { type: 'newThoughtClosed' }
  | { type: 'newThoughtDraftChanged'; draft: string }
  | { type: 'newThoughtModeChanged'; mode: NewThoughtMode }
  | { type: 'newThoughtOpened' }
  | { type: 'replyCaretMoved'; caretIndex: number }
  | { type: 'replyDraftChanged'; draft: string }
  | {
      type: 'replyFailed';
      failure: AssistantFailureInfo;
      restoredDraft: string | null;
      threadId: string | null;
    }
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
    ideasRailSettled: false,
    layoutMode: 'split',
    newThoughtCaretIndex: 0,
    newThoughtDraft: '',
    newThoughtMode: 'self',
    newThoughtOpen: false,
    pinnedThoughtIds: new Set(),
    replyCaretIndex: 0,
    replyDraft: '',
    replyError: null,
    deliveryErrors: [],
    selectedThoughtId: discussionThreads(annotation, new Set())[0]?.root.id ?? null,
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
        submittingThought: true,
      };
    case 'assistantThoughtRunsStarted':
      return { ...state, addThoughtAgentRuns: event.runs, addThoughtCelebrating: false };
    case 'assistantThoughtsCelebrated':
      return { ...state, addThoughtCelebrating: true };
    case 'commentDeleteFailed':
      return {
        ...state,
        deletingCommentId: null,
        replyError: {
          failure: { kind: 'unknown', message: event.error, canRetry: false, openSettings: false },
          threadId: null,
        },
      };
    case 'commentDeleteStarted':
      return { ...state, deletingCommentId: event.commentId, replyError: null };
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
    case 'replyDeliveryFailed':
      return {
        ...state,
        deliveryErrors: [
          ...state.deliveryErrors.filter(
            (item) =>
              item.threadId !== event.threadId ||
              item.delivery.agent.id !== event.delivery.agent.id,
          ),
          { threadId: event.threadId, delivery: event.delivery, failure: event.failure },
        ],
      };
    case 'replyDeliverySucceeded':
    case 'replyRetryStarted':
      return {
        ...state,
        deliveryErrors: state.deliveryErrors.filter(
          (item) => item.threadId !== event.threadId || item.delivery.agent.id !== event.agentId,
        ),
        sendingReply: event.type === 'replyRetryStarted' || state.sendingReply,
      };
    case 'ideasSidebarToggled':
      return state.ideasAutoCollapsed
        ? { ...state, ideasOverlayOpen: !state.ideasOverlayOpen }
        : {
            ...state,
            ideasCollapsed: !state.ideasCollapsed,
            ideasOverlayOpen: false,
            ideasRailSettled: false,
          };
    case 'ideasSlideEnded':
      return state.ideasCollapsed && !state.ideasRailSettled
        ? { ...state, ideasRailSettled: true }
        : state;
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
      };
    case 'replyCaretMoved':
      return { ...state, replyCaretIndex: event.caretIndex };
    case 'replyDraftChanged':
      return { ...state, replyDraft: event.draft };
    case 'replyFailed': {
      const nextError: DiscussionReplyError = {
        failure: event.failure,
        threadId: event.threadId,
      };
      return event.restoredDraft === null
        ? { ...state, replyError: nextError }
        : {
            ...state,
            replyCaretIndex: event.restoredDraft.length,
            replyDraft: event.restoredDraft,
            replyError: nextError,
          };
    }
    case 'replySettled':
      return { ...state, sendingReply: false };
    case 'replySubmitted':
      return {
        ...state,
        replyCaretIndex: 0,
        replyDraft: '',
        replyError: null,
        sendingReply: true,
      };
    case 'selfThoughtSaved':
      return { ...state, selectedThoughtId: event.commentId };
    case 'thoughtDraftReceived':
      return {
        ...state,
        newThoughtCaretIndex: event.draft.length,
        newThoughtDraft: event.draft,
        newThoughtMode: 'self',
        newThoughtOpen: true,
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
      return { ...state, submittingThought: true };
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
    ideasRailSettled,
    layoutMode,
    newThoughtCaretIndex,
    newThoughtDraft,
    newThoughtMode,
    newThoughtOpen,
    pinnedThoughtIds,
    replyCaretIndex,
    replyDraft,
    replyError,
    selectedThoughtId,
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
  // The expanded list stays laid out under the sliding thread until it covers the list.
  const ideasRailShown = ideasAutoCollapsed
    ? !ideasOverlayOpen
    : ideasCollapsed && ideasRailSettled;
  const ideasOverlayVisible = ideasAutoCollapsed && ideasOverlayOpen;
  const layoutClassName = [
    'annotation-discussion-layout',
    ideasRailCollapsed ? 'is-ideas-collapsed' : '',
    ideasRailShown ? 'is-ideas-content-collapsed' : '',
    ideasAutoCollapsed ? 'is-ideas-auto-collapsed' : '',
    ideasOverlayVisible ? 'is-ideas-overlay-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const assistantThoughtWriting = addThoughtAgentRuns.some((run) => run.status === 'active');
  const receiveThoughtDraft = useStableCallback((draft: string) => {
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
  const reportThoughtDraftFailure = useStableCallback((error: unknown) => {
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

  async function editComment(commentId: string, content: string) {
    const currentAnnotation = latestArticle().annotations.find((item) => item.id === annotation.id);
    const target = currentAnnotation?.comments.find((item) => item.id === commentId);
    if (!target || !isEditableUserComment(target, userProfile)) return;
    const updated = editUserComment(target, content);
    if (!updated) return;
    try {
      await saveComment(annotation.id, updated);
    } catch (error) {
      console.warn('[annotation-discussion] comment edit failed', {
        articleId: article.id,
        annotationId: annotation.id,
        commentId,
        error,
      });
      appToast.error(assistantRuntimeErrorMessage(error, 'discussion.editFailed'));
      throw error;
    }
  }

  async function changeAnnotationColor(color: string) {
    const currentAnnotation = latestArticle().annotations.find((item) => item.id === annotation.id);
    if (!currentAnnotation) return;
    const trimmed = color.trim();
    if (!trimmed) return;
    if (
      !currentAnnotation.author.annotationColor &&
      annotationColor(currentAnnotation, userProfile, personaAgents) === trimmed
    ) {
      return;
    }
    const updatedAt = new Date().toISOString();
    try {
      const patch = await annotationWindowActions.saveAnnotationColor({
        articleId: article.id,
        annotationId: annotation.id,
        color: trimmed,
        updatedAt,
      });
      if (!patch) return;
      applyAnnotations(
        annotationsWithSavedColor(latestArticle().annotations, annotation.id, trimmed, updatedAt),
        patch.article.updatedAt,
      );
    } catch (error) {
      console.warn('[annotation-discussion] highlight color update failed', {
        articleId: article.id,
        annotationId: annotation.id,
        error,
      });
      appToast.error(assistantRuntimeErrorMessage(error, 'discussion.colorFailed'));
    }
  }

  async function submitReply() {
    const selectedRoot = selectedThread?.root;
    const draft = replyDraft;
    const trimmed = draft.trim();
    if (!selectedRoot || !trimmed || sendingReply || deletingCommentId === selectedRoot.id) return;
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
      const channel: AssistantChannel = {
        kind: 'thread',
        annotationId: annotation.id,
        threadId: selectedRoot.id,
      };
      const pendingDeliveries = targetAgents.map((agent) => ({
        agent,
        channel,
        sourceCommentId: userComment.id,
        targetAgents,
        allowDisabledAgentForRule: mentionedAgents.length === 0,
      }));
      await deliverReplyTargets(pendingDeliveries, userComment.id, selectedRoot.id);
    } catch (error) {
      console.warn('[annotation-discussion] reply submission failed', {
        articleId: article.id,
        annotationId: annotation.id,
        error,
      });
      dispatch({
        type: 'replyFailed',
        failure: classifyAssistantError(error, 'discussion.replyFailed'),
        restoredDraft: userCommentSaved ? null : draft,
        threadId: selectedRoot.id,
      });
    } finally {
      dispatch({ type: 'replySettled' });
    }
  }

  async function retryFailedReply(item: DiscussionShellState['deliveryErrors'][number]) {
    if (sendingReply || !item.failure.canRetry) return;
    dispatch({
      type: 'replyRetryStarted',
      threadId: item.threadId,
      agentId: item.delivery.agent.id,
    });
    try {
      await deliverReplyTargets([item.delivery], makeId('retry'), item.threadId);
    } finally {
      dispatch({ type: 'replySettled' });
    }
  }

  async function deliverReplyTargets(
    deliveries: FailedReplyDelivery[],
    triggerId: string,
    threadId: string,
  ) {
    await Promise.all(
      deliveries.map(async (target) => {
        try {
          await requestAgentReply(target, triggerId, threadId);
        } catch (error) {
          console.warn('[annotation-discussion] assistant reply delivery failed', {
            articleId: article.id,
            annotationId: annotation.id,
            agentId: target.agent.id,
            error,
          });
          dispatch({
            type: 'replyDeliveryFailed',
            delivery: target,
            failure: classifyAssistantError(error, 'discussion.replyFailed'),
            threadId,
          });
        }
      }),
    );
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

        const channel: AssistantChannel = {
          kind: 'thread',
          annotationId: annotation.id,
          threadId: userComment.id,
        };
        await deliverReplyTargets(
          mentionedThoughtAgents.map((agent) => ({
            agent,
            channel,
            sourceCommentId: userComment.id,
            targetAgents: mentionedThoughtAgents,
          })),
          userComment.id,
          userComment.id,
        );
      } else {
        const instruction = agentInstructionFromNote(trimmed, mentionedThoughtAgents) || trimmed;
        const tasks = mentionedThoughtAgents.map((agent) => ({ agent, instruction }));
        dispatch({
          type: 'assistantThoughtRunsStarted',
          runs: tasks.map((task) => ({ ...task, status: 'active' })),
        });
        playAppSoundEffect('discussion.assistant_thought_writing', settings);
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
      // The reply composer's status sits behind this modal, and is absent without a thread.
      appToast.error(assistantRuntimeErrorMessage(error, 'discussion.addThought.failed'));
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
      .map((run) => ({ agent: run.agent, instruction: run.instruction || '' }));
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

  async function runAssistantThoughtTasks(tasks: { agent: PublicAgent; instruction: string }[]) {
    const results = await Promise.all(
      tasks.map(async (task) => {
        try {
          const event = await requestAgentThought(task.agent, task.instruction);
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

  function assistantRequest(
    agent: PublicAgent,
    channel: AssistantChannel,
    triggerId: string,
    options: Pick<AssistantDeliveryRequest, 'allowDisabledAgentForRule' | 'instruction'> = {},
  ): AssistantDeliveryRequest {
    return { articleId: article.id, channel, agentId: agent.id, triggerId, ...options };
  }

  async function requestAgentReply(
    target: FailedReplyDelivery,
    triggerId: string,
    threadId: string,
  ) {
    const { agent, channel, sourceCommentId, allowDisabledAgentForRule } = target;
    const comment = latestArticle()
      .annotations.find((item) => item.id === annotation.id)
      ?.comments.find((item) => item.id === sourceCommentId);
    if (!comment) return;
    const instruction = agentInstructionFromNote(comment.content, target.targetAgents) || undefined;
    const delivery = await deliverAssistantMessage(
      assistantRequest(agent, channel, triggerId, { instruction, allowDisabledAgentForRule }),
    );
    void delivery?.settled.then((event) => {
      if (event.status === 'done') {
        dispatch({ type: 'replyDeliverySucceeded', threadId, agentId: agent.id });
        return;
      }
      if (event.status !== 'failed') return;
      console.warn('[annotation-discussion] assistant reply failed', event);
      dispatch({
        type: 'replyDeliveryFailed',
        delivery: target,
        failure: classifyAssistantRunFailure(event, 'discussion.replyFailed'),
        threadId,
      });
    });
  }

  async function requestAgentThought(agent: PublicAgent, instruction: string) {
    const delivery = await deliverAssistantMessage(
      assistantRequest(agent, { kind: 'annotation', annotationId: annotation.id }, makeId('ask'), {
        instruction,
      }),
    );
    const event = await delivery?.settled;
    if (event?.status === 'done') return event;
    console.warn('[annotation-discussion] assistant thought failed', event);
    throw new Error(
      classifyAssistantRunFailure(event, 'discussion.addThought.assistantFailed').message,
    );
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

  const [readerSettings] = useDesktopReaderSettings();
  const activeHighlightColor = annotationColor(
    annotation,
    userProfile,
    personaAgents,
    readerSettings.distillationColor,
  );

  return (
    <main className={className} style={style}>
      <section
        className="annotation-discussion-quote"
        aria-labelledby="annotation-discussion-quote-title"
      >
        <div className="annotation-discussion-quote-header">
          <strong id="annotation-discussion-quote-title">{t('discussion.quoteTitle')}</strong>
          <div
            className="annotation-discussion-color-swatches"
            role="radiogroup"
            aria-label={t('discussion.highlightColor')}
          >
            {readerLineColorOptions.map((color, index) => (
              <button
                key={color}
                aria-checked={activeHighlightColor === color}
                aria-label={`${t('discussion.highlightColor')} ${index + 1}`}
                className="annotation-discussion-color-swatch"
                role="radio"
                style={{ '--annotation-swatch': color } as CSSProperties}
                type="button"
                onClick={() => void changeAnnotationColor(color)}
              />
            ))}
          </div>
        </div>
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
        <section
          className="annotation-discussion-thread"
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === 'margin-left') {
              dispatch({ type: 'ideasSlideEnded' });
            }
          }}
        >
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
              messageSendShortcut={settings.messageSendShortcut}
              thread={selectedThread}
              userProfile={userProfile}
              onDelete={(commentId) => void deleteComment(commentId)}
              onEdit={editComment}
              onOpenModelSettings={() => void getDesktopApi().assistant.openModelSettings()}
              onReplyCaretChange={(caretIndex) => dispatch({ type: 'replyCaretMoved', caretIndex })}
              onReplyDraftChange={(draft) => dispatch({ type: 'replyDraftChanged', draft })}
              onSubmitReply={() => void submitReply()}
              replyDraft={replyDraft}
              replyCaretIndex={replyCaretIndex}
              annotationAgents={annotationAgents}
              personaAgents={personaAgents}
              sendingReply={sendingReply}
              sendFailures={[
                ...(replyError &&
                (!replyError.threadId || replyError.threadId === selectedThread.root.id)
                  ? [{ failure: replyError.failure }]
                  : []),
                ...state.deliveryErrors
                  .filter((item) => item.threadId === selectedThread.root.id)
                  .map((item) => ({
                    agent: item.delivery.agent,
                    failure: item.failure,
                    retry: () => void retryFailedReply(item),
                  })),
              ]}
            />
          ) : replyDraft ? (
            <label className="annotation-discussion-thread-placeholder px-4">
              <strong>{t('discussion.unsentReply')}</strong>
              <Textarea className="max-w-md" readOnly value={replyDraft} />
            </label>
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
          messageSendShortcut={settings.messageSendShortcut}
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
