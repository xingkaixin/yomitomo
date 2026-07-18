import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { RotateCcw, Send, Sparkles, UploadCloud } from 'lucide-react';
import type {
  Agent,
  Annotation,
  AnnotationDistillationProposal,
  AnnotationDistillationReviewMessage,
  ArticleRecord,
  PublicAgent,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import { makeId, normalizeUiLanguage } from '@yomitomo/shared';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { applyAppTheme, readCachedThemeId, themeRegistry } from '../theme/app-theme';
import { FloatingComposer } from '@yomitomo/reader-ui/floating-composer';
import { promptArticle, publicReviewAgents } from '../source/bookcase/app-source-bookcase-shared';
import { articlePlainText } from '../shell/app-utils';
import {
  AgentAvatarStack,
  ReaderTooltipProvider,
  ReaderTooltip,
  SubmitShortcutTooltipContent,
} from '@yomitomo/reader-ui/reader-component-primitives';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { useCompositionSubmit } from '@yomitomo/reader-ui/use-composition-submit';
import {
  applyAssistantRuntimeProgress,
  assistantRuntimeErrorMessage,
} from '../shell/app-assistant-runtime-progress';
import { useSourceAwareWindowTransition } from '../shell/app-window-transition';
import {
  DraftAnchorHighlightLayer,
  DraftChangePreviewLayer,
  type HoveredDraftAnchor,
} from './app-annotation-sedimentation-draft-preview';
import {
  OrganizeDiscussionCard,
  OrganizeDiscussionConfirmDialog,
  type OrganizeDiscussionState,
} from './app-annotation-sedimentation-organize-card';
import {
  distillationReviewPayloadFields,
  requestAgentReviewRound,
} from './app-annotation-sedimentation-review-request';
import { SedimentationReviewTimeline } from './app-annotation-sedimentation-review-timeline';
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

type SedimentationWindowStatus =
  | { type: 'loading' }
  | {
      type: 'ready';
      agents: Agent[];
      article: ArticleRecord;
      annotation: Annotation;
      uiLanguage: UiLanguage;
    }
  | { type: 'missing' }
  | { type: 'error'; message: string };

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

function pendingDraftProposalIds(
  preview: PendingDraftPreview | null,
  source: PendingDraftPreview['source'],
) {
  if (!preview || preview.source !== source) return [];
  return preview.proposals.map((proposal) => proposal.id);
}

export function AnnotationSedimentationWindowApp() {
  const { t } = useTranslation();
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
    document.title =
      status.type === 'ready'
        ? sedimentationWindowTitle(status.annotation)
        : t('sedimentation.title');
  }, [status, t]);

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
            ? {
                type: 'ready',
                agents: store.agents,
                article,
                annotation,
                uiLanguage: normalizeUiLanguage(store.settings?.uiLanguage),
              }
            : { type: 'missing' },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({
          type: 'error',
          message: error instanceof Error ? error.message : t('sedimentation.loadFailed'),
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
  const { t } = useTranslation();
  const { agents, article, annotation, uiLanguage } = status;
  const reviewAgents = useMemo(() => publicReviewAgents(agents, uiLanguage), [agents, uiLanguage]);
  const userProfile = sedimentationUserProfile(annotation, article);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(
    () => reviewAgents[0]?.id || null,
  );
  const activeAgent = reviewAgents.find((agent) => agent.id === activeAgentId) || null;
  const activeAgents = activeAgent ? [activeAgent] : [];
  const [draft, setDraft] = useState(() => initialDistillationDraft(article.id, annotation));
  const [reviewDraft, setReviewDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
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
  const reviewTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shortcutModifier = getShortcutModifier();
  const messageSendShortcut = 'mod-enter' as const;
  const hasPendingDraftPreview = Boolean(pendingDraftPreview);
  const canPublish = Boolean(draft.trim()) && !saving && !hasPendingDraftPreview;
  const organizing = organizeState.type === 'running';
  const assistantBusy = reviewing || organizing;
  const canReview = activeAgents.length > 0 && !assistantBusy && !hasPendingDraftPreview;
  const canOrganize = activeAgents.length > 0 && !assistantBusy && !hasPendingDraftPreview;
  const sessions = annotation.distillation?.reviewSessions || [];
  const isPublished = annotation.distillation?.status === 'published';
  const statusLabel = isPublished
    ? t('sedimentation.status.published')
    : t('sedimentation.status.draft');
  const publishLabel = isPublished ? t('sedimentation.updatePublish') : t('sedimentation.publish');
  const canUnpublish = isPublished && !saving;

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

  async function publishDistillation() {
    const content = draft.trim();
    if (!content) return;
    const transition = isPublished ? 'update' : 'publish';
    setSaving(true);
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
        uiLanguage,
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
        uiLanguage,
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

  async function submitReviewRound(input?: {
    reviewDraftOverride?: string;
    reviewMode?: 'review' | 'organize_discussion';
  }) {
    if (activeAgents.length === 0 || assistantBusy) return;
    setReviewing(true);
    setReviewNotice('');
    const effectiveReviewDraft = input?.reviewDraftOverride ?? reviewDraft;
    if (!input?.reviewDraftOverride) setReviewDraft('');
    let workingArticle = article;
    let workingAnnotation = annotation;
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
      const completedReviewMessages: AnnotationDistillationReviewMessage[] = [];
      for (const agent of activeAgents) {
        const result = await requestAgentReviewRound({
          agent,
          articlePrompt: promptArticle(workingArticle, articlePlainText(workingArticle)),
          annotation: workingAnnotation,
          draft,
          requestReviewStream: (payload, onEvent) =>
            window.yomitomoDesktop.requestAgentDistillationReviewStream(payload, onEvent),
          reviewDraft: effectiveReviewDraft,
          reviewMode: input?.reviewMode || 'review',
          sessions: workingAnnotation.distillation?.reviewSessions || sessions,
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
        completedReviewMessages.push(result.message);
        workingArticle = updateArticleAnnotation(
          workingArticle,
          workingAnnotation.id,
          () => result.annotation,
          new Date().toISOString(),
        );
      }
      await saveAndRefresh(workingArticle, agents, annotation.id, uiLanguage, onStatusChange);
      const previewMessage = completedReviewMessages.find(
        (message) => pendingReviewProposals(message.proposals || []).length > 0,
      );
      if (previewMessage && draftRef.current === draft) {
        previewReviewProposals(previewMessage.id, previewMessage.proposals || [], {
          showFailure: false,
        });
      }
    } catch (error) {
      setReviewNotice(assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed'));
      if (workingArticle !== article) {
        try {
          await saveAndRefresh(workingArticle, agents, annotation.id, uiLanguage, onStatusChange);
        } catch {
          setReviewNotice(assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed'));
        }
      }
    } finally {
      setReviewing(false);
    }
  }

  const handlePublishKeyDown = useCompositionSubmit({
    messageSendShortcut,
    onSubmit: () => void publishDistillation(),
  });
  const handleReviewKeyDown = useCompositionSubmit({
    messageSendShortcut,
    onSubmit: () => void submitReviewRound(),
  });

  function organizeDiscussion() {
    if (!canOrganize) return;
    setOrganizeConfirmOpen(true);
  }

  function confirmOrganizeDiscussion() {
    if (!canOrganize) return;
    setOrganizeConfirmOpen(false);
    void runOrganizeDiscussion();
  }

  async function runOrganizeDiscussion() {
    const agent = activeAgents[0];
    if (!agent || assistantBusy) return;
    setAppliedOrganizeProposalIds(new Set());
    setDismissedOrganizeProposalIds(new Set());
    setReviewNotice('');
    const now = new Date().toISOString();
    const instruction = t('sedimentation.organizeDiscussionInstruction');
    const session = existingSessionForAgent(sessions, agent) || createReviewSession(agent, now);
    let workingMessage: AnnotationDistillationReviewMessage = {
      id: makeId('distillation_review_message'),
      author: 'ai',
      content: '',
      createdAt: now,
      status: 'pending',
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      agentAvatar: agent.avatar,
    };
    const proposalSource = distillationProposalSource({
      draft,
      sessionId: session.id,
      messageId: workingMessage.id,
      agentId: agent.id,
    });
    const setMessage = (message: AnnotationDistillationReviewMessage) => {
      workingMessage = message;
      setOrganizeState({
        type: message.status === 'failed' ? 'failed' : 'running',
        agent,
        message,
      });
    };
    setOrganizeState({ type: 'running', agent, message: workingMessage });

    try {
      const finalMessage = await window.yomitomoDesktop.requestAgentDistillationReviewStream(
        {
          agentId: agent.id,
          agentUsername: agent.username,
          uiLanguage,
          reviewMessageId: workingMessage.id,
          distillationReviewMode: 'organize_discussion',
          ...distillationReviewPayloadFields(draft, instruction, session),
          article: promptArticle(article, articlePlainText(article)),
          annotation,
          userComment: {
            id: makeId('distillation_review_request'),
            author: 'user',
            content: instruction,
            createdAt: now,
          },
        },
        (event) => {
          if (event.type === 'start') return;
          if (event.type === 'progress') {
            setMessage(
              Object.assign({}, workingMessage, {
                assistantProgress: applyAssistantRuntimeProgress(
                  workingMessage.assistantProgress,
                  event.progress,
                ),
              }),
            );
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
          if (event.type !== 'delta') return;
          setMessage(
            Object.assign({}, workingMessage, {
              content: `${workingMessage.content}${event.delta}`,
            }),
          );
        },
      );
      const sourcedFinalMessage = reviewMessageWithProposalSource(finalMessage, proposalSource);
      workingMessage = Object.assign({}, workingMessage, {
        content: sourcedFinalMessage.content || workingMessage.content || '',
        errorMessage: undefined,
        items: sourcedFinalMessage.items || workingMessage.items || [],
        proposals: sourcedFinalMessage.proposals || workingMessage.proposals || [],
        status: 'done' as const,
      });
      setOrganizeState({ type: 'done', agent, message: workingMessage });
      if (draftRef.current === draft) {
        previewOrganizeProposals(workingMessage.proposals || [], { showFailure: false });
      }
    } catch (error) {
      const errorMessage = assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed');
      workingMessage = Object.assign({}, workingMessage, {
        errorMessage,
        status: 'failed' as const,
      });
      setOrganizeState({ type: 'failed', agent, message: workingMessage });
    }
  }

  function recordDraftSelection() {
    const textarea = draftTextareaRef.current;
    if (!textarea) return;
    draftSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }

  function handleDraftAnchorEnter(proposal: AnnotationDistillationProposal) {
    if (pendingDraftPreview) return;
    const result = planDistillationProposalDraftAnchor(draftRef.current, proposal);
    setHoveredDraftAnchor(result.ok ? result : null);
  }

  function handleDraftAnchorLeave() {
    setHoveredDraftAnchor(null);
  }

  function syncDraftPreviewScroll() {
    const textarea = draftTextareaRef.current;
    if (!textarea) return;
    setDraftPreviewScroll({ left: textarea.scrollLeft, top: textarea.scrollTop });
  }

  async function handleProposalPreview(
    messageId: string,
    proposals: AnnotationDistillationProposal[],
  ) {
    previewReviewProposals(messageId, proposals, { showFailure: true });
  }

  function previewReviewProposals(
    messageId: string,
    proposals: AnnotationDistillationProposal[],
    options: { showFailure: boolean },
  ) {
    const pendingProposals = pendingReviewProposals(proposals);
    if (pendingProposals.length === 0) return false;
    const selection = pendingProposals.length === 1 ? draftSelectionRef.current : null;
    const result = planDistillationProposalChangeSet(draftRef.current, pendingProposals, selection);
    if (!result.ok) {
      if (options.showFailure) {
        setReviewNotice(proposalApplyFailureMessage(result.reason));
      }
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
    focusDraftChangeSet(result.changeSet);
    return true;
  }

  async function handleDraftPreviewDecision(
    proposalId: string,
    decision: Exclude<DraftPreviewDecision, 'pending'>,
  ) {
    const preview = pendingDraftPreview;
    if (!preview || preview.decisions[proposalId] !== 'pending') return;
    const nextDecisions: DraftPreviewDecisions = {
      ...preview.decisions,
      [proposalId]: decision,
    };
    if (hasPendingDraftPreviewDecisions(nextDecisions)) {
      setPendingDraftPreview(Object.assign({}, preview, { decisions: nextDecisions }));
      return;
    }
    await finalizeDraftPreview(preview, nextDecisions);
  }

  async function finalizeDraftPreview(
    preview: PendingDraftPreview,
    decisions: DraftPreviewDecisions,
  ) {
    const acceptedChanges = acceptedDraftPreviewChanges(preview.changeSet, decisions);
    const nextDraft = draftPreviewDraft(preview.changeSet, decisions);
    setDraft(nextDraft);
    setPendingDraftPreview(null);

    if (preview.source === 'review') {
      await updateProposalStatusesById(
        preview.messageId,
        draftPreviewStatusesFromDecisions(decisions),
      );
      setReviewNotice('');
    } else {
      applyOrganizePreviewDecisions(decisions);
      setOrganizeNotice(acceptedChanges.length > 0 ? t('sedimentation.organizeAddedToDraft') : '');
    }

    if (acceptedChanges[0]) {
      focusDraftChange(acceptedChanges[0]);
    } else {
      focusDraftTextarea();
    }
  }

  function applyOrganizePreviewDecisions(decisions: DraftPreviewDecisions) {
    setAppliedOrganizeProposalIds((current) => {
      return organizeProposalDecisionSets({
        appliedProposalIds: current,
        dismissedProposalIds: new Set(),
        decisions,
      }).appliedProposalIds;
    });
    setDismissedOrganizeProposalIds((current) => {
      return organizeProposalDecisionSets({
        appliedProposalIds: new Set(),
        dismissedProposalIds: current,
        decisions,
      }).dismissedProposalIds;
    });
  }

  async function handleProposalIgnore(messageId: string, proposalId: string) {
    if (
      pendingDraftPreview?.source === 'review' &&
      pendingDraftPreview.proposals.some((proposal) => proposal.id === proposalId)
    ) {
      setPendingDraftPreview(null);
    }
    await updateProposalStatus(messageId, proposalId, 'ignored');
    setReviewNotice('');
  }

  async function handleProposalRestore(messageId: string, proposalId: string) {
    await updateProposalStatus(messageId, proposalId, 'pending');
    setReviewNotice('');
  }

  function handleOrganizeProposalPreview(proposals: AnnotationDistillationProposal[]) {
    previewOrganizeProposals(proposals, { showFailure: true });
  }

  function previewOrganizeProposals(
    proposals: AnnotationDistillationProposal[],
    options: { showFailure: boolean },
  ) {
    const pendingProposals = pendingOrganizeProposals(
      proposals,
      appliedOrganizeProposalIds,
      dismissedOrganizeProposalIds,
    );
    if (pendingProposals.length === 0) return false;
    const result = planDistillationProposalChangeSet(draftRef.current, pendingProposals, null);
    if (!result.ok) {
      if (options.showFailure) {
        setOrganizeNotice(proposalApplyFailureMessage(result.reason));
      }
      return false;
    }
    setPendingDraftPreview({
      source: 'organize',
      proposals: pendingProposals,
      changeSet: result.changeSet,
      decisions: draftPreviewDecisionsForProposals(pendingProposals),
    });
    setOrganizeNotice(t('sedimentation.previewReady'));
    focusDraftChangeSet(result.changeSet);
    return true;
  }

  function focusDraftChangeSet(changeSet: DistillationProposalDraftChangeSet) {
    focusDraftChange(changeSet.changes[0]);
  }

  function focusDraftChange(change: DistillationProposalDraftChange | undefined) {
    if (!change) return;
    requestAnimationFrame(() => {
      const textarea = draftTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(change.changeOffset, change.changeOffset + change.changeLength);
      scrollTextareaToOffset(textarea, change.changeOffset);
      syncDraftPreviewScroll();
    });
  }

  function focusDraftTextarea() {
    requestAnimationFrame(() => {
      const textarea = draftTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
    });
  }

  function setOrganizeNotice(notice: string) {
    setOrganizeState((current) =>
      current.type === 'idle' ? current : Object.assign({}, current, { notice }),
    );
  }

  async function updateProposalStatus(
    messageId: string,
    proposalId: string,
    proposalStatus: AnnotationDistillationProposal['status'],
  ) {
    await updateProposalStatuses(messageId, [proposalId], proposalStatus);
  }

  async function updateProposalStatuses(
    messageId: string,
    proposalIds: string[],
    proposalStatus: AnnotationDistillationProposal['status'],
  ) {
    await updateProposalStatusesById(
      messageId,
      Object.fromEntries(proposalIds.map((proposalId) => [proposalId, proposalStatus])) as Record<
        string,
        AnnotationDistillationProposal['status']
      >,
    );
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
    await saveAndRefresh(nextArticle, agents, annotation.id, uiLanguage, onStatusChange);
  }

  return (
    <ReaderTooltipProvider>
      <main
        className={[sedimentationWindowClassName(), className].filter(Boolean).join(' ')}
        style={style}
      >
        <section className="annotation-sedimentation-quote" aria-label={t('sedimentation.quote')}>
          <span aria-hidden="true">“</span>
          <p>{annotation.anchor.exact}</p>
        </section>
        <section className="annotation-sedimentation-body">
          <section
            className="annotation-sedimentation-document"
            aria-label={t('sedimentation.document')}
          >
            <header>
              <div className="annotation-sedimentation-document-title">
                <strong>{t('sedimentation.draftTitle')}</strong>
                <span
                  className={`annotation-sedimentation-status is-${isPublished ? 'published' : 'draft'}`}
                >
                  {statusLabel}
                </span>
              </div>
              <div className="annotation-sedimentation-document-actions">
                {isPublished ? (
                  <ReaderTooltip
                    content={
                      <SedimentationActionTooltipContent
                        label={t('sedimentation.unpublish')}
                        description={t('sedimentation.unpublishTooltip')}
                      />
                    }
                  >
                    <button
                      className="is-secondary"
                      type="button"
                      disabled={!canUnpublish}
                      onClick={() => void unpublishDistillation()}
                    >
                      <RotateCcw size={15} />
                      <span>{t('sedimentation.unpublish')}</span>
                    </button>
                  </ReaderTooltip>
                ) : null}
                <ReaderTooltip
                  content={
                    <SedimentationActionTooltipContent
                      label={t('sedimentation.organizeDiscussion')}
                      description={t('sedimentation.organizeTooltip')}
                    />
                  }
                >
                  <button
                    className="is-secondary"
                    type="button"
                    disabled={!canOrganize}
                    onClick={organizeDiscussion}
                  >
                    <Sparkles size={15} />
                    <span>{t('sedimentation.organizeDiscussion')}</span>
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
            <div className="annotation-sedimentation-draft-workspace">
              <div
                className={[
                  'annotation-sedimentation-draft-editor',
                  pendingDraftPreview ? 'has-preview' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {pendingDraftPreview ? (
                  <DraftChangePreviewLayer
                    changeSet={pendingDraftPreview.changeSet}
                    decisions={pendingDraftPreview.decisions}
                    scrollLeft={draftPreviewScroll.left}
                    scrollTop={draftPreviewScroll.top}
                    onDecision={(proposalId, decision) =>
                      void handleDraftPreviewDecision(proposalId, decision)
                    }
                  />
                ) : hoveredDraftAnchor ? (
                  <DraftAnchorHighlightLayer
                    anchor={hoveredDraftAnchor}
                    draft={draft}
                    scrollLeft={draftPreviewScroll.left}
                    scrollTop={draftPreviewScroll.top}
                  />
                ) : null}
                <textarea
                  ref={draftTextareaRef}
                  value={draft}
                  readOnly={Boolean(pendingDraftPreview)}
                  placeholder={pendingDraftPreview ? '' : t('sedimentation.draftPlaceholder')}
                  onChange={(event) => {
                    setHoveredDraftAnchor(null);
                    setDraft(event.target.value);
                    recordDraftSelection();
                  }}
                  onClick={recordDraftSelection}
                  onKeyDown={handlePublishKeyDown}
                  onKeyUp={recordDraftSelection}
                  onScroll={syncDraftPreviewScroll}
                  onSelect={recordDraftSelection}
                />
              </div>
              {organizeState.type !== 'idle' ? (
                <OrganizeDiscussionCard
                  state={organizeState}
                  appliedProposalIds={appliedOrganizeProposalIds}
                  dismissedProposalIds={dismissedOrganizeProposalIds}
                  pendingProposalIds={pendingDraftProposalIds(pendingDraftPreview, 'organize')}
                  onProposalAnchorEnter={handleDraftAnchorEnter}
                  onProposalAnchorLeave={handleDraftAnchorLeave}
                  onPreviewProposals={handleOrganizeProposalPreview}
                  onClose={() => {
                    if (pendingDraftPreview?.source === 'organize') setPendingDraftPreview(null);
                    setOrganizeState({ type: 'idle' });
                  }}
                  onRetry={() => void runOrganizeDiscussion()}
                />
              ) : null}
            </div>
          </section>

          <aside
            className="annotation-sedimentation-review-panel"
            aria-label={t('sedimentation.reviewPanel')}
          >
            <header>
              <div>
                <strong>{t('sedimentation.reviewTitle')}</strong>
                <span>{reviewNotice || t('sedimentation.reviewHint')}</span>
              </div>
            </header>
            <SedimentationReviewTimeline
              agents={reviewAgents}
              sessions={sessions}
              userProfile={userProfile}
              pendingProposalIds={pendingDraftProposalIds(pendingDraftPreview, 'review')}
              onProposalAnchorEnter={handleDraftAnchorEnter}
              onProposalAnchorLeave={handleDraftAnchorLeave}
              onProposalPreview={handleProposalPreview}
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
                    aria-label={t('sedimentation.reviewAgents')}
                  >
                    <AgentAvatarStack
                      agents={reviewAgents}
                      activeAgentIds={activeAgentId ? [activeAgentId] : []}
                      ariaLabel={t('sedimentation.reviewAgents')}
                      className={reviewing ? 'is-reviewing' : ''}
                      revealLabelOnDoubleClick={false}
                      onAgentClick={selectReviewAgent}
                    />
                  </div>
                }
                submitDisabled={!canReview}
                submitIcon={<Send size={14} />}
                submitLabel={t('sedimentation.send')}
                submitTooltip={
                  <SubmitShortcutTooltipContent
                    label={t('sedimentation.sendReviewRequest')}
                    shortcut={messageSendShortcut}
                    shortcutModifier={shortcutModifier}
                  />
                }
                textarea={{
                  value: reviewDraft,
                  placeholder: t('sedimentation.reviewPlaceholder'),
                  rows: 2,
                  onChange: (event) => setReviewDraft(event.target.value),
                  onKeyDown: handleReviewKeyDown,
                }}
                onSubmit={() => void submitReviewRound()}
              />
            </footer>
          </aside>
        </section>
        <OrganizeDiscussionConfirmDialog
          disabled={!canOrganize}
          open={organizeConfirmOpen}
          onCancel={() => setOrganizeConfirmOpen(false)}
          onConfirm={confirmOrganizeDiscussion}
        />
      </main>
    </ReaderTooltipProvider>
  );
}

function SedimentationActionTooltipContent({
  description,
  label,
}: {
  description: string;
  label: string;
}) {
  return (
    <span className="annotation-sedimentation-action-tooltip">
      <strong>{label}</strong>
      <em>{description}</em>
    </span>
  );
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
  const { t } = useTranslation();
  return (
    <main
      className={[sedimentationWindowClassName(), className].filter(Boolean).join(' ')}
      style={style}
    >
      <section className="annotation-sedimentation-empty">
        <strong>
          {status.type === 'loading' ? t('sedimentation.loading') : t('sedimentation.openFailed')}
        </strong>
        <p>{status.type === 'error' ? status.message : t('sedimentation.missing')}</p>
      </section>
    </main>
  );
}

async function saveAndRefresh(
  nextArticle: ArticleRecord,
  agents: Agent[],
  annotationId: string,
  uiLanguage: UiLanguage,
  onStatusChange: (status: SedimentationWindowStatus) => void,
): Promise<Annotation | null> {
  const annotation = nextArticle.annotations.find((item) => item.id === annotationId);
  if (!annotation) return null;
  const patch = await window.yomitomoDesktop.saveArticleAnnotationDistillation({
    articleId: nextArticle.id,
    annotationId,
    distillation: annotation.distillation,
    updatedAt: annotation.updatedAt,
  });
  if (!patch) return null;
  const nextFullArticle = await window.yomitomoDesktop.getArticle(patch.article.id);
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

function sedimentationWindowClassName() {
  return ['annotation-sedimentation-window', `is-${window.yomitomoDesktop.platform ?? 'unknown'}`]
    .filter(Boolean)
    .join(' ');
}

function sedimentationWindowTitle(annotation: Annotation) {
  const quote = compactTitleText(annotation.anchor.exact);
  return quote
    ? i18next.t('sedimentation.windowTitle', { title: quote })
    : i18next.t('sedimentation.title');
}

function compactTitleText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 34 ? `${normalized.slice(0, 34)}...` : normalized;
}

function sedimentationUserProfile(annotation: Annotation, article: ArticleRecord): UserProfile {
  return {
    id: annotation.userId || 'user',
    nickname: annotation.userNickname || i18next.t('common.me'),
    username: annotation.userUsername || 'user',
    avatar: annotation.userAvatar || '',
    annotationColor: annotation.userAnnotationColor || annotation.color,
    updatedAt: article.updatedAt,
  };
}

function scrollTextareaToOffset(textarea: HTMLTextAreaElement, offset: number) {
  const text = textarea.value.slice(0, offset);
  const linesBefore = text.split('\n').length - 1;
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 28;
  const targetTop = linesBefore * lineHeight;
  const visibleHeight = textarea.clientHeight;
  textarea.scrollTop = Math.max(0, targetTop - visibleHeight / 3);
}
