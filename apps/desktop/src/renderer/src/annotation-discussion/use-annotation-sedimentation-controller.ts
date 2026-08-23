import { useEffect, useMemo, useRef, useState } from 'react';
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
import { articlePlainText } from '../shell/app-utils';
import {
  applyAssistantRuntimeProgress,
  assistantRuntimeErrorMessage,
} from '../shell/app-assistant-runtime-progress';
import { recordRendererPerformanceTiming } from '../shell/app-renderer-performance';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
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
  type DistillationProposalDraftChangeSet,
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
  draftPreviewStatusesFromDecisions,
  distillationProposalSource,
  existingSessionForAgent,
  hasPendingDraftPreviewDecisions,
  organizeProposalDecisionSets,
  pendingOrganizeProposals,
  pendingReviewProposals,
  publishedDistillationArticle,
  reviewItemWithProposalSource,
  reviewMessageWithProposalSource,
  unpublishedDistillationArticle,
  updateArticleAnnotation,
  type DraftPreviewDecision,
  type DraftPreviewDecisions,
} from './app-annotation-sedimentation-state';
import { annotationWindowActions } from './app-annotation-window-actions';

type DistillationOperation = 'organize' | 'publish' | 'review' | 'unpublish' | 'update' | null;

type PendingDraftPreview =
  | {
      source: 'review';
      messageId: string;
      proposals: AnnotationDistillationProposal[];
      changeSet: DistillationProposalDraftChangeSet;
      decisions: DraftPreviewDecisions;
    }
  | {
      source: 'organize';
      proposals: AnnotationDistillationProposal[];
      changeSet: DistillationProposalDraftChangeSet;
      decisions: DraftPreviewDecisions;
    };

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
  const [activeAgentId, setActiveAgentId] = useState<string | null>(
    () => reviewAgents[0]?.id || null,
  );
  const activeAgent = reviewAgents.find((agent) => agent.id === activeAgentId) || null;
  const [draft, setDraft] = useState(() => initialDistillationDraft(article.id, annotation));
  const [reviewDraft, setReviewDraft] = useState('');
  const [activeOperation, setActiveOperation] = useState<DistillationOperation>(null);
  const [reviewNotice, setReviewNotice] = useState('');
  const [organizeState, setOrganizeState] = useState<OrganizeDiscussionState>({ type: 'idle' });
  const [organizeConfirmOpen, setOrganizeConfirmOpen] = useState(false);
  const [pendingDraftPreview, setPendingDraftPreview] = useState<PendingDraftPreview | null>(null);
  const [hoveredDraftAnchor, setHoveredDraftAnchor] = useState<HoveredDraftAnchor | null>(null);
  const [draftPreviewScroll, setDraftPreviewScroll] = useState({ left: 0, top: 0 });
  const [appliedOrganizeProposalIds, setAppliedOrganizeProposalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [dismissedOrganizeProposalIds, setDismissedOrganizeProposalIds] = useState<Set<string>>(
    () => new Set(),
  );
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

  useEffect(() => {
    setActiveAgentId((current) => {
      if (current && reviewAgents.some((agent) => agent.id === current)) return current;
      return reviewAgents[0]?.id || null;
    });
  }, [reviewAgents]);

  useEffect(() => {
    window.localStorage.setItem(draftKey, draft);
  }, [draft, draftKey]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (pendingDraftPreview) setHoveredDraftAnchor(null);
  }, [pendingDraftPreview]);

  async function publish() {
    const content = draft.trim();
    if (!content || busy) return;
    const transition = isPublished ? 'update' : 'publish';
    recordOperation(annotation.id, transition, 'started');
    setActiveOperation(transition);
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
      setReviewNotice(distillationSaveErrorMessage(error));
    } finally {
      recordOperation(annotation.id, transition, 'settled');
      setActiveOperation(null);
    }
  }

  async function unpublish() {
    if (!isPublished || busy) return;
    recordOperation(annotation.id, 'unpublish', 'started');
    setActiveOperation('unpublish');
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
      setReviewNotice(distillationSaveErrorMessage(error));
    } finally {
      recordOperation(annotation.id, 'unpublish', 'settled');
      setActiveOperation(null);
    }
  }

  function selectReviewAgent(agent: PublicAgent) {
    setActiveAgentId((current) => {
      if (current === agent.id) {
        setReviewNotice(t('sedimentation.selectReviewerRequired'));
        return current;
      }
      setReviewNotice('');
      return agent.id;
    });
  }

  async function submitReview() {
    if (!activeAgent || busy) return;
    recordOperation(annotation.id, 'review', 'started');
    setActiveOperation('review');
    setReviewNotice('');
    const effectiveReviewDraft = reviewDraft;
    setReviewDraft('');
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
      setReviewNotice(
        conflict
          ? distillationSaveErrorMessage(error)
          : assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed'),
      );
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
          setReviewNotice(assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed'));
        }
      }
    } finally {
      recordOperation(annotation.id, 'review', 'settled');
      setActiveOperation(null);
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
    if (activeAgent && !busy && !hasPendingDraftPreview) setOrganizeConfirmOpen(true);
  }

  function confirmOrganize() {
    if (!activeAgent || busy || hasPendingDraftPreview) return;
    setOrganizeConfirmOpen(false);
    void runOrganize();
  }

  async function runOrganize() {
    if (!activeAgent || busy) return;
    recordOperation(annotation.id, 'organize', 'started');
    setActiveOperation('organize');
    setAppliedOrganizeProposalIds(new Set());
    setDismissedOrganizeProposalIds(new Set());
    setReviewNotice('');
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
      setOrganizeState({
        type: message.status === 'failed' ? 'failed' : 'running',
        agent: activeAgent,
        message,
      });
    };
    setOrganizeState({ type: 'running', agent: activeAgent, message: workingMessage });

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
      setOrganizeState({ type: 'done', agent: activeAgent, message: workingMessage });
      if (draftRef.current === draft)
        previewOrganizeProposals(workingMessage.proposals || [], false);
    } catch (error) {
      const errorMessage = assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed');
      workingMessage = { ...workingMessage, errorMessage, status: 'failed' };
      setOrganizeState({ type: 'failed', agent: activeAgent, message: workingMessage });
    } finally {
      recordOperation(annotation.id, 'organize', 'settled');
      setActiveOperation(null);
    }
  }

  function recordDraftSelection() {
    const textarea = draftTextareaRef.current;
    if (!textarea) return;
    draftSelectionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
  }

  function changeDraft(value: string) {
    setHoveredDraftAnchor(null);
    setDraft(value);
    recordDraftSelection();
  }

  function handleDraftAnchorEnter(proposal: AnnotationDistillationProposal) {
    if (pendingDraftPreview) return;
    const result = planDistillationProposalDraftAnchor(draftRef.current, proposal);
    setHoveredDraftAnchor(result.ok ? result : null);
  }

  function syncDraftPreviewScroll() {
    const textarea = draftTextareaRef.current;
    if (textarea) setDraftPreviewScroll({ left: textarea.scrollLeft, top: textarea.scrollTop });
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
      if (showFailure) setReviewNotice(proposalApplyFailureMessage(result.reason));
      return false;
    }
    setPendingDraftPreview({
      source: 'review',
      messageId,
      proposals: pendingProposals,
      changeSet: result.changeSet,
      decisions: draftPreviewDecisionsForProposals(pendingProposals),
    });
    setReviewNotice(t('sedimentation.previewReady'));
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
    setPendingDraftPreview({
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
      setPendingDraftPreview({ ...preview, decisions: nextDecisions });
      return;
    }
    const acceptedChanges = acceptedDraftPreviewChanges(preview.changeSet, nextDecisions);
    setDraft(draftPreviewDraft(preview.changeSet, nextDecisions));
    setPendingDraftPreview(null);

    if (preview.source === 'review') {
      await updateProposalStatusesById(
        preview.messageId,
        draftPreviewStatusesFromDecisions(nextDecisions),
      );
      setReviewNotice('');
    } else {
      applyOrganizePreviewDecisions(nextDecisions);
      setOrganizeNotice(acceptedChanges.length > 0 ? t('sedimentation.organizeAddedToDraft') : '');
    }
    focusDraftChange(acceptedChanges[0]);
  }

  function applyOrganizePreviewDecisions(decisions: DraftPreviewDecisions) {
    setAppliedOrganizeProposalIds(
      (current) =>
        organizeProposalDecisionSets({
          appliedProposalIds: current,
          dismissedProposalIds: new Set(),
          decisions,
        }).appliedProposalIds,
    );
    setDismissedOrganizeProposalIds(
      (current) =>
        organizeProposalDecisionSets({
          appliedProposalIds: new Set(),
          dismissedProposalIds: current,
          decisions,
        }).dismissedProposalIds,
    );
  }

  async function ignoreProposal(messageId: string, proposalId: string) {
    if (
      pendingDraftPreview?.source === 'review' &&
      pendingDraftPreview.proposals.some((proposal) => proposal.id === proposalId)
    ) {
      setPendingDraftPreview(null);
    }
    await updateProposalStatusesById(messageId, { [proposalId]: 'ignored' });
    setReviewNotice('');
  }

  async function restoreProposal(messageId: string, proposalId: string) {
    await updateProposalStatusesById(messageId, { [proposalId]: 'pending' });
    setReviewNotice('');
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
    setOrganizeState((current) => (current.type === 'idle' ? current : { ...current, notice }));
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
      leaveProposalAnchor: () => setHoveredDraftAnchor(null),
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
      change: setReviewDraft,
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
      cancel: () => setOrganizeConfirmOpen(false),
      close: () => {
        if (pendingDraftPreview?.source === 'organize') setPendingDraftPreview(null);
        setOrganizeState({ type: 'idle' });
      },
      retry: runOrganize,
      previewProposals: previewOrganizeProposals,
    },
    shortcut: { messageSendShortcut, shortcutModifier },
  };
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
