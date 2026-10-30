import { useMemo, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import type {
  Agent,
  Annotation,
  AnnotationDistillationProposal,
  AnnotationDistillationReviewMessage,
  ArticleRecord,
  PublicAgent,
  UiLanguage,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { annotationAgentAuthorRef } from '@yomitomo/core';
import { promptArticle } from '../source/bookcase/source-prompt-article';
import { publicReviewAgents } from '../source/bookcase/source-public-agents';
import { articlePlainText } from '../shell/app-article-presentation';
import {
  applyAssistantRuntimeProgress,
  assistantRuntimeErrorMessage,
} from '../shell/app-assistant-runtime-progress';
import { recordRendererPerformanceTiming } from '../shell/app-renderer-performance';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { useCompositionSubmit } from '@yomitomo/reader-ui/use-composition-submit';
import { desktopIpcErrorCodes, isDesktopIpcErrorLike } from '../../../ipc-errors';
import type { HoveredDraftAnchor } from './app-annotation-sedimentation-draft-preview';
import type { OrganizeDiscussionState } from './app-annotation-sedimentation-organize-card';
import {
  distillationReviewPayloadFields,
  requestAgentReviewRound,
} from './app-annotation-sedimentation-review-request';
import {
  planDistillationProposalDraftAnchor,
  planDistillationProposalChangeSet,
  proposalApplyFailureMessage,
  type DistillationProposalDraftChange,
  type DraftSelectionSnapshot,
} from './app-annotation-sedimentation-proposals';
import {
  acceptedDraftPreviewChanges,
  annotationWithReviewSession,
  appendReviewItemToMessage,
  articleWithReviewProposalStatuses,
  createReviewSession,
  draftPreviewDecisionsForProposals,
  draftPreviewDraft,
  draftProposalWorkflowReducer,
  draftPreviewStatusesFromDecisions,
  distillationProposalSource,
  existingSessionForAgent,
  hasPendingDraftPreviewDecisions,
  initialDraftProposalWorkflowState,
  pendingOrganizeProposals,
  pendingReviewProposals,
  publishedDistillationArticle,
  reviewItemWithProposalSource,
  reviewMessageWithProposalSource,
  unpublishedDistillationArticle,
  updateArticleAnnotation,
  type DraftPreviewDecision,
  type PendingDraftPreview,
} from './app-annotation-sedimentation-state';
import { annotationWindowActions } from './app-annotation-window-actions';

type DistillationOperation = 'organize' | 'publish' | 'review' | 'unpublish' | 'update' | null;

export type SedimentationReadyStatus = {
  type: 'ready';
  agents: Agent[];
  article: ArticleRecord;
  annotation: Annotation;
  uiLanguage: UiLanguage;
};

export function useAnnotationSedimentationController({
  onStatusChange,
  status,
}: {
  onStatusChange: (status: SedimentationReadyStatus) => void;
  status: SedimentationReadyStatus;
}) {
  const { t } = useTranslation();
  const { agents, article, annotation, uiLanguage } = status;
  const reviewAgents = useMemo(() => publicReviewAgents(agents, uiLanguage), [agents, uiLanguage]);
  const [
    {
      activeOperation,
      draft,
      draftPreviewScroll,
      hoveredDraftAnchor,
      organizeConfirmOpen,
      organizeState,
      reviewDraft,
      reviewNotice,
      selectedReviewAgentId,
    },
    dispatch,
  ] = useReducer(
    sedimentationReducer,
    { articleId: article.id, annotation },
    initialSedimentationState,
  );
  const activeAgent =
    reviewAgents.find((agent) => agent.id === selectedReviewAgentId) || reviewAgents[0] || null;
  const activeAgentId = activeAgent?.id || null;
  const [proposalWorkflow, dispatchProposalWorkflow] = useReducer(
    draftProposalWorkflowReducer,
    undefined,
    initialDraftProposalWorkflowState,
  );
  const {
    appliedOrganizeProposalIds,
    dismissedOrganizeProposalIds,
    preview: pendingDraftPreview,
  } = proposalWorkflow;
  const draftKey = distillationDraftKey(article.id, annotation.id);
  const draftRef = useRef(draft);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftSelectionRef = useRef<DraftSelectionSnapshot | null>(null);
  const sessions = annotation.distillation?.reviewSessions || [];
  const busy = activeOperation !== null;
  const hasPendingDraftPreview = Boolean(pendingDraftPreview);
  const isPublished = annotation.distillation?.status === 'published';
  const shortcutModifier = getShortcutModifier();
  const messageSendShortcut = 'mod-enter' as const;

  useMountEffect(() => window.localStorage.setItem(draftKey, draftRef.current));

  async function publish() {
    const content = draft.trim();
    if (!content || busy) return;
    const transition = isPublished ? 'update' : 'publish';
    recordOperation(annotation.id, transition, 'started');
    dispatch({ type: 'operationStarted', operation: transition });
    try {
      const nextArticle = publishedDistillationArticle({
        annotationId: annotation.id,
        article,
        content,
        now: new Date().toISOString(),
      });
      const nextAnnotation = await saveAndRefresh(
        nextArticle,
        agents,
        annotation.id,
        annotation.distillation?.updatedAt ?? null,
        uiLanguage,
        onStatusChange,
      );
      const nextDistillation =
        nextAnnotation?.distillation ||
        nextArticle.annotations.find((item) => item.id === annotation.id)?.distillation;
      window.localStorage.removeItem(draftKey);
      await annotationWindowActions.commitSedimentation({
        articleId: article.id,
        annotationId: annotation.id,
        distillation: nextDistillation,
        transition,
      });
    } catch (error) {
      dispatch({ type: 'reviewNoticeShown', notice: distillationSaveErrorMessage(error) });
    } finally {
      recordOperation(annotation.id, transition, 'settled');
      dispatch({ type: 'operationSettled' });
    }
  }

  async function unpublish() {
    if (!isPublished || busy) return;
    recordOperation(annotation.id, 'unpublish', 'started');
    dispatch({ type: 'operationStarted', operation: 'unpublish' });
    try {
      const nextArticle = unpublishedDistillationArticle({
        annotationId: annotation.id,
        article,
        fallbackContent: draft.trim(),
        now: new Date().toISOString(),
      });
      const nextAnnotation = await saveAndRefresh(
        nextArticle,
        agents,
        annotation.id,
        annotation.distillation?.updatedAt ?? null,
        uiLanguage,
        onStatusChange,
      );
      const nextDistillation =
        nextAnnotation?.distillation ||
        nextArticle.annotations.find((item) => item.id === annotation.id)?.distillation;
      await annotationWindowActions.commitSedimentation({
        articleId: article.id,
        annotationId: annotation.id,
        distillation: nextDistillation,
        transition: 'unpublish',
      });
    } catch (error) {
      dispatch({ type: 'reviewNoticeShown', notice: distillationSaveErrorMessage(error) });
    } finally {
      recordOperation(annotation.id, 'unpublish', 'settled');
      dispatch({ type: 'operationSettled' });
    }
  }

  function selectReviewAgent(agent: PublicAgent) {
    if (activeAgentId === agent.id) {
      dispatch({ type: 'reviewNoticeShown', notice: t('sedimentation.selectReviewerRequired') });
      return;
    }
    dispatch({ type: 'reviewAgentSelected', agentId: agent.id });
  }

  async function submitReview() {
    if (!activeAgent || busy) return;
    recordOperation(annotation.id, 'review', 'started');
    dispatch({ type: 'reviewSubmitted' });
    const effectiveReviewDraft = reviewDraft;
    let workingArticle = article;
    let workingAnnotation = annotation;
    try {
      const now = new Date().toISOString();
      const userMessage = effectiveReviewDraft.trim()
        ? ({
            id: makeId('distillation_review_message'),
            author: { kind: 'user', username: 'reader' },
            content: effectiveReviewDraft.trim(),
            createdAt: now,
          } satisfies AnnotationDistillationReviewMessage)
        : undefined;
      const result = await requestAgentReviewRound({
        agent: activeAgent,
        articlePrompt: promptArticle(workingArticle, articlePlainText(workingArticle)),
        annotation: workingAnnotation,
        draft,
        requestReviewStream: (payload, onEvent) =>
          annotationWindowActions.requestAgentDistillationReviewStream(payload, onEvent),
        reviewDraft: effectiveReviewDraft,
        reviewMode: 'review',
        sessions,
        uiLanguage,
        userMessage,
        onOptimisticSession: (session) => {
          const optimisticNow = new Date().toISOString();
          const nextAnnotation = annotationWithReviewSession({
            annotation: workingAnnotation,
            session,
            now: optimisticNow,
          });
          const nextArticle = updateArticleAnnotation(
            workingArticle,
            workingAnnotation.id,
            () => nextAnnotation,
            optimisticNow,
          );
          workingAnnotation = nextAnnotation;
          workingArticle = nextArticle;
          onStatusChange({
            type: 'ready',
            agents,
            article: nextArticle,
            annotation: nextAnnotation,
            uiLanguage,
          });
        },
      });
      workingAnnotation = result.annotation;
      workingArticle = updateArticleAnnotation(
        workingArticle,
        workingAnnotation.id,
        () => result.annotation,
        new Date().toISOString(),
      );
      await saveAndRefresh(
        workingArticle,
        agents,
        annotation.id,
        annotation.distillation?.updatedAt ?? null,
        uiLanguage,
        onStatusChange,
      );
      if (
        pendingReviewProposals(result.message.proposals || []).length > 0 &&
        draftRef.current === draft
      ) {
        previewReviewProposals(result.message.id, result.message.proposals || [], false);
      }
    } catch (error) {
      const conflict = isDistillationConflict(error);
      dispatch({
        type: 'reviewNoticeShown',
        notice: conflict
          ? distillationSaveErrorMessage(error)
          : assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed'),
      });
      if (workingArticle !== article && !conflict) {
        try {
          await saveAndRefresh(
            workingArticle,
            agents,
            annotation.id,
            annotation.distillation?.updatedAt ?? null,
            uiLanguage,
            onStatusChange,
          );
        } catch {
          dispatch({
            type: 'reviewNoticeShown',
            notice: assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed'),
          });
        }
      }
    } finally {
      recordOperation(annotation.id, 'review', 'settled');
      dispatch({ type: 'operationSettled' });
    }
  }

  const handlePublishKeyDown = useCompositionSubmit({
    messageSendShortcut,
    onSubmit: () => void publish(),
  });
  const handleReviewKeyDown = useCompositionSubmit({
    messageSendShortcut,
    onSubmit: () => void submitReview(),
  });

  function requestOrganize() {
    if (activeAgent && !busy && !hasPendingDraftPreview) dispatch({ type: 'organizeRequested' });
  }

  function confirmOrganize() {
    if (!activeAgent || busy || hasPendingDraftPreview) return;
    dispatch({ type: 'organizeConfirmClosed' });
    void runOrganize();
  }

  async function runOrganize() {
    if (!activeAgent || busy) return;
    recordOperation(annotation.id, 'organize', 'started');
    dispatchProposalWorkflow({ type: 'reset-organize-decisions' });
    const now = new Date().toISOString();
    const instruction = t('sedimentation.organizeDiscussionInstruction');
    const session =
      existingSessionForAgent(sessions, activeAgent) || createReviewSession(activeAgent, now);
    let workingMessage: AnnotationDistillationReviewMessage = {
      id: makeId('distillation_review_message'),
      author: annotationAgentAuthorRef(activeAgent),
      content: '',
      createdAt: now,
      status: 'pending',
    };
    const proposalSource = distillationProposalSource({
      draft,
      sessionId: session.id,
      messageId: workingMessage.id,
      agentId: activeAgent.id,
    });
    const setMessage = (message: AnnotationDistillationReviewMessage) => {
      workingMessage = message;
      dispatch({
        type: 'organizeProgressed',
        state: {
          type: message.status === 'failed' ? 'failed' : 'running',
          agent: activeAgent,
          message,
        },
      });
    };
    dispatch({
      type: 'organizeStarted',
      state: { type: 'running', agent: activeAgent, message: workingMessage },
    });

    try {
      const finalMessage = await annotationWindowActions.requestAgentDistillationReviewStream(
        {
          agentId: activeAgent.id,
          agentUsername: activeAgent.username,
          uiLanguage,
          reviewMessageId: workingMessage.id,
          distillationReviewMode: 'organize_discussion',
          ...distillationReviewPayloadFields(draft, instruction, session),
          article: promptArticle(article, articlePlainText(article)),
          annotation,
          userComment: {
            id: makeId('distillation_review_request'),
            author: { kind: 'user', username: 'reader' },
            content: instruction,
            createdAt: now,
          },
        },
        (event) => {
          if (event.type === 'start') return;
          if (event.type === 'progress') {
            setMessage({
              ...workingMessage,
              assistantProgress: applyAssistantRuntimeProgress(
                workingMessage.assistantProgress,
                event.progress,
              ),
            });
            return;
          }
          if (event.type === 'item') {
            setMessage(
              appendReviewItemToMessage(
                workingMessage,
                reviewItemWithProposalSource(event.item, proposalSource),
              ),
            );
            return;
          }
          if (event.type === 'delta') {
            setMessage({ ...workingMessage, content: `${workingMessage.content}${event.delta}` });
          }
        },
      );
      const sourcedFinalMessage = reviewMessageWithProposalSource(finalMessage, proposalSource);
      workingMessage = {
        ...workingMessage,
        content: sourcedFinalMessage.content || workingMessage.content || '',
        errorMessage: undefined,
        items: sourcedFinalMessage.items || workingMessage.items || [],
        proposals: sourcedFinalMessage.proposals || workingMessage.proposals || [],
        status: 'done',
      };
      dispatch({
        type: 'organizeProgressed',
        state: { type: 'done', agent: activeAgent, message: workingMessage },
      });
      if (draftRef.current === draft)
        previewOrganizeProposals(workingMessage.proposals || [], false);
    } catch (error) {
      const errorMessage = assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed');
      workingMessage = { ...workingMessage, errorMessage, status: 'failed' };
      dispatch({
        type: 'organizeProgressed',
        state: { type: 'failed', agent: activeAgent, message: workingMessage },
      });
    } finally {
      recordOperation(annotation.id, 'organize', 'settled');
      dispatch({ type: 'operationSettled' });
    }
  }

  function recordDraftSelection() {
    const textarea = draftTextareaRef.current;
    if (!textarea) return;
    draftSelectionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
  }

  function changeDraft(value: string) {
    updateDraft(value);
    dispatch({ type: 'draftEdited', draft: value });
    recordDraftSelection();
  }

  function replaceDraft(value: string) {
    updateDraft(value);
    dispatch({ type: 'draftReplaced', draft: value });
  }

  function updateDraft(value: string) {
    draftRef.current = value;
    window.localStorage.setItem(draftKey, value);
  }

  function openDraftPreview(preview: PendingDraftPreview) {
    dispatch({ type: 'draftPreviewOpened' });
    dispatchProposalWorkflow({ type: 'open-preview', preview });
  }

  function handleDraftAnchorEnter(proposal: AnnotationDistillationProposal) {
    if (pendingDraftPreview) return;
    const result = planDistillationProposalDraftAnchor(draftRef.current, proposal);
    dispatch({ type: 'proposalAnchorEntered', anchor: result.ok ? result : null });
  }

  function syncDraftPreviewScroll() {
    const textarea = draftTextareaRef.current;
    if (textarea) {
      dispatch({ type: 'draftScrolled', left: textarea.scrollLeft, top: textarea.scrollTop });
    }
  }

  function previewReviewProposals(
    messageId: string,
    proposals: AnnotationDistillationProposal[],
    showFailure = true,
  ) {
    const pendingProposals = pendingReviewProposals(proposals);
    if (pendingProposals.length === 0) return false;
    const selection = pendingProposals.length === 1 ? draftSelectionRef.current : null;
    const result = planDistillationProposalChangeSet(draftRef.current, pendingProposals, selection);
    if (!result.ok) {
      if (showFailure) {
        dispatch({ type: 'reviewNoticeShown', notice: proposalApplyFailureMessage(result.reason) });
      }
      return false;
    }
    openDraftPreview({
      source: 'review',
      messageId,
      proposals: pendingProposals,
      changeSet: result.changeSet,
      decisions: draftPreviewDecisionsForProposals(pendingProposals),
    });
    dispatch({ type: 'reviewNoticeShown', notice: t('sedimentation.previewReady') });
    focusDraftChange(result.changeSet.changes[0]);
    return true;
  }

  function previewOrganizeProposals(
    proposals: AnnotationDistillationProposal[],
    showFailure = true,
  ) {
    const pendingProposals = pendingOrganizeProposals(
      proposals,
      appliedOrganizeProposalIds,
      dismissedOrganizeProposalIds,
    );
    if (pendingProposals.length === 0) return false;
    const result = planDistillationProposalChangeSet(draftRef.current, pendingProposals, null);
    if (!result.ok) {
      if (showFailure) setOrganizeNotice(proposalApplyFailureMessage(result.reason));
      return false;
    }
    openDraftPreview({
      source: 'organize',
      proposals: pendingProposals,
      changeSet: result.changeSet,
      decisions: draftPreviewDecisionsForProposals(pendingProposals),
    });
    setOrganizeNotice(t('sedimentation.previewReady'));
    focusDraftChange(result.changeSet.changes[0]);
    return true;
  }

  async function decideDraftPreview(
    proposalId: string,
    decision: Exclude<DraftPreviewDecision, 'pending'>,
  ) {
    const preview = pendingDraftPreview;
    if (!preview || preview.decisions[proposalId] !== 'pending') return;
    const nextDecisions = { ...preview.decisions, [proposalId]: decision };
    if (hasPendingDraftPreviewDecisions(nextDecisions)) {
      dispatchProposalWorkflow({ type: 'update-preview-decisions', decisions: nextDecisions });
      return;
    }
    const acceptedChanges = acceptedDraftPreviewChanges(preview.changeSet, nextDecisions);
    replaceDraft(draftPreviewDraft(preview.changeSet, nextDecisions));

    if (preview.source === 'review') {
      dispatchProposalWorkflow({ type: 'close-preview' });
      await updateProposalStatusesById(
        preview.messageId,
        draftPreviewStatusesFromDecisions(nextDecisions),
      );
      dispatch({ type: 'reviewNoticeShown', notice: '' });
    } else {
      dispatchProposalWorkflow({ type: 'apply-organize-decisions', decisions: nextDecisions });
      setOrganizeNotice(acceptedChanges.length > 0 ? t('sedimentation.organizeAddedToDraft') : '');
    }
    focusDraftChange(acceptedChanges[0]);
  }

  async function ignoreProposal(messageId: string, proposalId: string) {
    if (
      pendingDraftPreview?.source === 'review' &&
      pendingDraftPreview.proposals.some((proposal) => proposal.id === proposalId)
    ) {
      dispatchProposalWorkflow({ type: 'close-preview' });
    }
    await updateProposalStatusesById(messageId, { [proposalId]: 'ignored' });
    dispatch({ type: 'reviewNoticeShown', notice: '' });
  }

  async function restoreProposal(messageId: string, proposalId: string) {
    await updateProposalStatusesById(messageId, { [proposalId]: 'pending' });
    dispatch({ type: 'reviewNoticeShown', notice: '' });
  }

  async function updateProposalStatusesById(
    messageId: string,
    proposalStatusById: Record<string, AnnotationDistillationProposal['status']>,
  ) {
    const nextArticle = articleWithReviewProposalStatuses({
      annotation,
      article,
      messageId,
      now: new Date().toISOString(),
      proposalStatusById,
    });
    await saveAndRefresh(
      nextArticle,
      agents,
      annotation.id,
      annotation.distillation?.updatedAt ?? null,
      uiLanguage,
      onStatusChange,
    );
  }

  function focusDraftChange(change: DistillationProposalDraftChange | undefined) {
    requestAnimationFrame(() => {
      const textarea = draftTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      if (change) {
        textarea.setSelectionRange(change.changeOffset, change.changeOffset + change.changeLength);
        scrollTextareaToOffset(textarea, change.changeOffset);
        syncDraftPreviewScroll();
      }
    });
  }

  function setOrganizeNotice(notice: string) {
    dispatch({ type: 'organizeNoticeShown', notice });
  }

  const canReview = Boolean(activeAgent) && !busy && !hasPendingDraftPreview;
  const canOrganize = Boolean(activeAgent) && !busy && !hasPendingDraftPreview;

  return {
    draft: {
      value: draft,
      change: changeDraft,
      textareaRef: draftTextareaRef,
      preview: pendingDraftPreview,
      hoveredAnchor: hoveredDraftAnchor,
      scroll: draftPreviewScroll,
      recordSelection: recordDraftSelection,
      syncScroll: syncDraftPreviewScroll,
      handlePublishKeyDown,
      decidePreview: decideDraftPreview,
      enterProposalAnchor: handleDraftAnchorEnter,
      leaveProposalAnchor: () => dispatch({ type: 'proposalAnchorLeft' }),
    },
    publication: {
      isPublished,
      canPublish: Boolean(draft.trim()) && !busy && !hasPendingDraftPreview,
      canUnpublish: isPublished && !busy,
      publish,
      unpublish,
    },
    review: {
      agents: reviewAgents,
      sessions,
      activeAgentId,
      reviewing: activeOperation === 'review',
      notice: reviewNotice,
      value: reviewDraft,
      change: (value: string) => dispatch({ type: 'reviewDraftChanged', draft: value }),
      canSubmit: canReview,
      selectAgent: selectReviewAgent,
      submit: submitReview,
      handleKeyDown: handleReviewKeyDown,
      previewProposals: previewReviewProposals,
      ignoreProposal,
      restoreProposal,
      pendingProposalIds: pendingDraftProposalIds(pendingDraftPreview, 'review'),
    },
    organize: {
      state: organizeState,
      appliedProposalIds: appliedOrganizeProposalIds,
      dismissedProposalIds: dismissedOrganizeProposalIds,
      pendingProposalIds: pendingDraftProposalIds(pendingDraftPreview, 'organize'),
      canRun: canOrganize,
      confirmOpen: organizeConfirmOpen,
      request: requestOrganize,
      confirm: confirmOrganize,
      cancel: () => dispatch({ type: 'organizeConfirmClosed' }),
      close: () => {
        dispatchProposalWorkflow({ type: 'close-organize' });
        dispatch({ type: 'organizeClosed' });
      },
      retry: runOrganize,
      previewProposals: previewOrganizeProposals,
    },
    shortcut: { messageSendShortcut, shortcutModifier },
  };
}

type SedimentationState = {
  activeOperation: DistillationOperation;
  draft: string;
  draftPreviewScroll: { left: number; top: number };
  hoveredDraftAnchor: HoveredDraftAnchor | null;
  organizeConfirmOpen: boolean;
  organizeState: OrganizeDiscussionState;
  reviewDraft: string;
  reviewNotice: string;
  selectedReviewAgentId: string | null;
};

type SedimentationEvent =
  | { type: 'draftEdited'; draft: string }
  | { type: 'draftPreviewOpened' }
  | { type: 'draftReplaced'; draft: string }
  | { type: 'draftScrolled'; left: number; top: number }
  | { type: 'operationSettled' }
  | { type: 'operationStarted'; operation: Exclude<DistillationOperation, null> }
  | { type: 'organizeClosed' }
  | { type: 'organizeConfirmClosed' }
  | { type: 'organizeNoticeShown'; notice: string }
  | { type: 'organizeProgressed'; state: OrganizeDiscussionState }
  | { type: 'organizeRequested' }
  | { type: 'organizeStarted'; state: OrganizeDiscussionState }
  | { type: 'proposalAnchorEntered'; anchor: HoveredDraftAnchor | null }
  | { type: 'proposalAnchorLeft' }
  | { type: 'reviewAgentSelected'; agentId: string }
  | { type: 'reviewDraftChanged'; draft: string }
  | { type: 'reviewNoticeShown'; notice: string }
  | { type: 'reviewSubmitted' };

function initialSedimentationState({
  annotation,
  articleId,
}: {
  annotation: Annotation;
  articleId: string;
}): SedimentationState {
  return {
    activeOperation: null,
    draft: initialDistillationDraft(articleId, annotation),
    draftPreviewScroll: { left: 0, top: 0 },
    hoveredDraftAnchor: null,
    organizeConfirmOpen: false,
    organizeState: { type: 'idle' },
    reviewDraft: '',
    reviewNotice: '',
    selectedReviewAgentId: null,
  };
}

function sedimentationReducer(
  state: SedimentationState,
  event: SedimentationEvent,
): SedimentationState {
  switch (event.type) {
    case 'draftEdited':
      return { ...state, draft: event.draft, hoveredDraftAnchor: null };
    case 'draftPreviewOpened':
      return { ...state, hoveredDraftAnchor: null };
    case 'draftReplaced':
      return { ...state, draft: event.draft };
    case 'draftScrolled':
      return { ...state, draftPreviewScroll: { left: event.left, top: event.top } };
    case 'operationSettled':
      return { ...state, activeOperation: null };
    case 'operationStarted':
      return { ...state, activeOperation: event.operation };
    case 'organizeClosed':
      return { ...state, organizeState: { type: 'idle' } };
    case 'organizeConfirmClosed':
      return { ...state, organizeConfirmOpen: false };
    case 'organizeNoticeShown':
      return state.organizeState.type === 'idle'
        ? state
        : { ...state, organizeState: { ...state.organizeState, notice: event.notice } };
    case 'organizeProgressed':
      return { ...state, organizeState: event.state };
    case 'organizeRequested':
      return { ...state, organizeConfirmOpen: true };
    case 'organizeStarted':
      return {
        ...state,
        activeOperation: 'organize',
        organizeState: event.state,
        reviewNotice: '',
      };
    case 'proposalAnchorEntered':
      return { ...state, hoveredDraftAnchor: event.anchor };
    case 'proposalAnchorLeft':
      return { ...state, hoveredDraftAnchor: null };
    case 'reviewAgentSelected':
      return { ...state, reviewNotice: '', selectedReviewAgentId: event.agentId };
    case 'reviewDraftChanged':
      return { ...state, reviewDraft: event.draft };
    case 'reviewNoticeShown':
      return { ...state, reviewNotice: event.notice };
    case 'reviewSubmitted':
      return { ...state, activeOperation: 'review', reviewDraft: '', reviewNotice: '' };
  }
}

function pendingDraftProposalIds(
  preview: PendingDraftPreview | null,
  source: PendingDraftPreview['source'],
) {
  if (!preview || preview.source !== source) return [];
  return preview.proposals.map((proposal) => proposal.id);
}

async function saveAndRefresh(
  nextArticle: ArticleRecord,
  agents: Agent[],
  annotationId: string,
  expectedDistillationUpdatedAt: string | null,
  uiLanguage: UiLanguage,
  onStatusChange: (status: SedimentationReadyStatus) => void,
): Promise<Annotation | null> {
  const annotation = nextArticle.annotations.find((item) => item.id === annotationId);
  if (!annotation) return null;
  let nextFullArticle: ArticleRecord | null;
  try {
    nextFullArticle = await annotationWindowActions.saveDistillationAndReload({
      articleId: nextArticle.id,
      annotationId,
      distillation: annotation.distillation,
      expectedDistillationUpdatedAt,
      updatedAt: annotation.updatedAt,
    });
  } catch (error) {
    if (isDistillationConflict(error)) {
      const currentArticle = await annotationWindowActions.loadArticle(nextArticle.id);
      const currentAnnotation = currentArticle?.annotations.find(
        (item) => item.id === annotationId,
      );
      if (currentArticle && currentAnnotation) {
        onStatusChange({
          type: 'ready',
          agents,
          article: currentArticle,
          annotation: currentAnnotation,
          uiLanguage,
        });
      }
    }
    throw error;
  }
  const nextAnnotation = nextFullArticle?.annotations.find((item) => item.id === annotationId);
  if (!nextFullArticle || !nextAnnotation) return null;
  onStatusChange({
    type: 'ready',
    agents,
    article: nextFullArticle,
    annotation: nextAnnotation,
    uiLanguage,
  });
  return nextAnnotation;
}

function initialDistillationDraft(articleId: string, annotation: Annotation) {
  const localDraft = window.localStorage.getItem(distillationDraftKey(articleId, annotation.id));
  return localDraft ?? annotation.distillation?.content ?? '';
}

function distillationDraftKey(articleId: string, annotationId: string) {
  return `annotation-distillation-draft:${articleId}:${annotationId}`;
}

function recordOperation(
  annotationId: string,
  operation: Exclude<DistillationOperation, null>,
  phase: 'settled' | 'started',
) {
  recordRendererPerformanceTiming('annotation.distillation_operation', {
    annotationId,
    operation,
    phase,
  });
}

function isDistillationConflict(error: unknown) {
  return (
    isDesktopIpcErrorLike(error) &&
    error.code === desktopIpcErrorCodes.annotationDistillationConflict
  );
}

function distillationSaveErrorMessage(error: unknown) {
  return isDistillationConflict(error)
    ? i18next.t('sedimentation.saveConflict')
    : i18next.t('common.saveFailed');
}

function scrollTextareaToOffset(textarea: HTMLTextAreaElement, offset: number) {
  const text = textarea.value.slice(0, offset);
  const linesBefore = text.split('\n').length - 1;
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 28;
  const targetTop = linesBefore * lineHeight;
  textarea.scrollTop = Math.max(0, targetTop - textarea.clientHeight / 3);
}
