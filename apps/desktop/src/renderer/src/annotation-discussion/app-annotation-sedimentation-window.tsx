import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Check,
  Eye,
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
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewMessage,
  AnnotationDistillationReviewSession,
  ArticleRecord,
  Comment,
  PublicAgent,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import { hashText, makeId, normalizeUiLanguage } from '@yomitomo/shared';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { formatAbsoluteTime, formatRelativeTime } from './app-annotation-discussion-utils';
import { applyAppTheme, readCachedThemeId, themeRegistry } from '../theme/app-theme';
import { FloatingComposer } from '@yomitomo/reader-ui/floating-composer';
import { renderSafeMarkdown } from '@yomitomo/core/article-extraction';
import { promptArticle, publicReviewAgents } from '../source/bookcase/app-source-bookcase-shared';
import { articlePlainText } from '../shell/app-utils';
import {
  AgentAvatarStack,
  AvatarBadge,
  ReaderTooltip,
  SubmitShortcutTooltipContent,
} from '@yomitomo/reader-ui/reader-component-primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { useCompositionSubmit } from '@yomitomo/reader-ui/use-composition-submit';
import {
  applyAssistantRuntimeProgress,
  assistantRuntimeErrorMessage,
  AssistantRuntimeProgressList,
} from '../shell/app-assistant-runtime-progress';
import { useSourceAwareWindowTransition } from '../shell/app-window-transition';
import {
  composeDistillationProposalDraftChangeSetEntries,
  normalizeDistillationProposalDraftChangeSetEntries,
  planDistillationProposalChangeSet,
  proposalApplyFailureMessage,
  updateReviewProposalStatusMap,
  type DistillationProposalDraftChange,
  type DistillationProposalDraftChangeSet,
  type DistillationProposalDraftChangeSetEntry,
  type DraftSelectionSnapshot,
} from './app-annotation-sedimentation-proposals';

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

type OrganizeDiscussionState =
  | { type: 'idle' }
  | {
      type: 'running' | 'done' | 'failed';
      agent: PublicAgent;
      message: AnnotationDistillationReviewMessage;
      notice?: string;
    };

type PendingDraftPreview =
  | {
      source: 'review';
      messageId: string;
      proposals: AnnotationDistillationProposal[];
      changeSet: DistillationProposalDraftChangeSet;
      decisions: PendingDraftPreviewDecisions;
    }
  | {
      source: 'organize';
      proposals: AnnotationDistillationProposal[];
      changeSet: DistillationProposalDraftChangeSet;
      decisions: PendingDraftPreviewDecisions;
    };

type PendingDraftPreviewDecision = 'pending' | 'accepted' | 'rejected';
type PendingDraftPreviewDecisions = Record<string, PendingDraftPreviewDecision>;

function pendingDraftProposalIds(
  preview: PendingDraftPreview | null,
  source: PendingDraftPreview['source'],
) {
  if (!preview || preview.source !== source) return [];
  return preview.proposals.map((proposal) => proposal.id);
}

function pendingReviewProposals(proposals: AnnotationDistillationProposal[]) {
  return proposals.filter((proposal) => proposal.status === 'pending');
}

function pendingOrganizeProposals(
  proposals: AnnotationDistillationProposal[],
  appliedProposalIds: Set<string>,
  dismissedProposalIds: Set<string>,
) {
  return proposals.filter(
    (proposal) =>
      proposal.status === 'pending' &&
      !appliedProposalIds.has(proposal.id) &&
      !dismissedProposalIds.has(proposal.id),
  );
}

function pendingDraftPreviewDecisions(
  proposals: AnnotationDistillationProposal[],
): PendingDraftPreviewDecisions {
  return Object.fromEntries(proposals.map((proposal) => [proposal.id, 'pending']));
}

function previewStatusesFromDecisions(decisions: PendingDraftPreviewDecisions) {
  return Object.fromEntries(
    Object.entries(decisions).map(([proposalId, decision]) => [
      proposalId,
      decision === 'accepted' ? 'accepted' : 'ignored',
    ]),
  ) as Record<string, AnnotationDistillationProposal['status']>;
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
          article: workingArticle,
          annotation: workingAnnotation,
          draft,
          reviewDraft: effectiveReviewDraft,
          reviewMode: input?.reviewMode || 'review',
          sessions: workingAnnotation.distillation?.reviewSessions || sessions,
          uiLanguage,
          userMessage,
          onOptimisticSession: (session) => {
            const nextAnnotation = annotationWithReviewSession(workingAnnotation, session);
            const nextArticle = updateAnnotation(
              workingArticle,
              workingAnnotation.id,
              () => nextAnnotation,
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
        workingArticle = updateAnnotation(
          workingArticle,
          workingAnnotation.id,
          () => result.annotation,
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
      decisions: pendingDraftPreviewDecisions(pendingProposals),
    });
    setReviewNotice(t('sedimentation.previewReady'));
    focusDraftChangeSet(result.changeSet);
    return true;
  }

  async function handleDraftPreviewDecision(
    proposalId: string,
    decision: Exclude<PendingDraftPreviewDecision, 'pending'>,
  ) {
    const preview = pendingDraftPreview;
    if (!preview || preview.decisions[proposalId] !== 'pending') return;
    const nextDecisions: PendingDraftPreviewDecisions = {
      ...preview.decisions,
      [proposalId]: decision,
    };
    if (Object.values(nextDecisions).some((value) => value === 'pending')) {
      setPendingDraftPreview(Object.assign({}, preview, { decisions: nextDecisions }));
      return;
    }
    await finalizeDraftPreview(preview, nextDecisions);
  }

  async function finalizeDraftPreview(
    preview: PendingDraftPreview,
    decisions: PendingDraftPreviewDecisions,
  ) {
    const acceptedChanges = preview.changeSet.changes.filter(
      (change) => decisions[change.proposalId] === 'accepted',
    );
    const nextDraft = composeDistillationProposalDraftChangeSetEntries(
      preview.changeSet.baseDraft,
      acceptedChanges,
    );
    setDraft(nextDraft);
    setPendingDraftPreview(null);

    if (preview.source === 'review') {
      await updateProposalStatusesById(preview.messageId, previewStatusesFromDecisions(decisions));
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

  function applyOrganizePreviewDecisions(decisions: PendingDraftPreviewDecisions) {
    setAppliedOrganizeProposalIds((current) => {
      const next = new Set(current);
      for (const [proposalId, decision] of Object.entries(decisions)) {
        if (decision === 'accepted') next.add(proposalId);
      }
      return next;
    });
    setDismissedOrganizeProposalIds((current) => {
      const next = new Set(current);
      for (const [proposalId, decision] of Object.entries(decisions)) {
        if (decision === 'rejected') next.add(proposalId);
      }
      return next;
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
      decisions: pendingDraftPreviewDecisions(pendingProposals),
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
    const nextSessions = updateReviewProposalStatusMap(
      annotation.distillation?.reviewSessions || [],
      messageId,
      proposalStatusById,
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
    await saveAndRefresh(nextArticle, agents, annotation.id, uiLanguage, onStatusChange);
  }

  return (
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
              ) : null}
              <textarea
                ref={draftTextareaRef}
                value={draft}
                readOnly={Boolean(pendingDraftPreview)}
                placeholder={pendingDraftPreview ? '' : t('sedimentation.draftPlaceholder')}
                onChange={(event) => {
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
          <ReviewSessions
            agents={reviewAgents}
            sessions={sessions}
            userProfile={userProfile}
            pendingProposalIds={pendingDraftProposalIds(pendingDraftPreview, 'review')}
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
  uiLanguage,
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
  uiLanguage?: UiLanguage;
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
    status: 'pending',
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
  };
  const proposalSource = distillationProposalSource({
    draft,
    sessionId: session.id,
    messageId: assistantMessage.id,
    agentId: agent.id,
  });
  let workingSession = {
    ...session,
    messages: [...session.messages, ...(userMessage ? [userMessage] : []), assistantMessage],
    updatedAt: now,
  };
  onOptimisticSession(workingSession);

  const finalMessage = await window.yomitomoDesktop
    .requestAgentDistillationReviewStream(
      {
        agentId: agent.id,
        agentUsername: agent.username,
        uiLanguage,
        reviewMessageId: assistantMessage.id,
        distillationReviewMode: reviewMode,
        ...distillationReviewPayloadFields(draft, reviewDraft, session),
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
        if (event.type === 'item') {
          const item = reviewItemWithProposalSource(event.item, proposalSource);
          workingSession = updateSessionMessage(workingSession, assistantMessage.id, (message) =>
            appendReviewItemToMessage(message, item),
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
    )
    .catch((error: unknown) => {
      const errorMessage = assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed');
      workingSession = updateSessionMessage(workingSession, assistantMessage.id, (message) =>
        Object.assign({}, message, {
          errorMessage,
          status: 'failed' as const,
        }),
      );
      onOptimisticSession(workingSession);
      throw error;
    });
  const sourcedFinalMessage = reviewMessageWithProposalSource(finalMessage, proposalSource);
  workingSession = updateSessionMessage(workingSession, assistantMessage.id, (message) =>
    Object.assign({}, message, {
      content:
        sourcedFinalMessage.content ||
        workingSession.messages.find((item) => item.id === assistantMessage.id)?.content ||
        '',
      errorMessage: undefined,
      items: sourcedFinalMessage.items || message.items || [],
      proposals: sourcedFinalMessage.proposals || message.proposals || [],
      status: 'done' as const,
    }),
  );
  const completedMessage =
    workingSession.messages.find((message) => message.id === assistantMessage.id) ||
    assistantMessage;

  return {
    annotation: annotationWithReviewSession(annotation, workingSession),
    message: completedMessage,
  };
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

function OrganizeDiscussionConfirmDialog({
  disabled,
  open,
  onCancel,
  onConfirm,
}: {
  disabled: boolean;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onCancel() : undefined)}>
      <DialogPortal>
        <DialogOverlay className="annotation-sedimentation-confirm-overlay">
          <DialogContent
            aria-describedby="annotation-sedimentation-organize-confirm-description"
            aria-labelledby="annotation-sedimentation-organize-confirm-title"
            className="annotation-sedimentation-confirm"
          >
            <header>
              <span className="annotation-sedimentation-confirm-icon" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <div>
                <DialogTitle id="annotation-sedimentation-organize-confirm-title">
                  {t('sedimentation.organizeConfirmTitle')}
                </DialogTitle>
                <DialogDescription id="annotation-sedimentation-organize-confirm-description">
                  {t('sedimentation.organizeConfirmDescription')}
                </DialogDescription>
              </div>
            </header>
            <footer>
              <button type="button" onClick={onCancel}>
                {t('sedimentation.organizeConfirmCancel')}
              </button>
              <button className="is-primary" type="button" disabled={disabled} onClick={onConfirm}>
                {t('sedimentation.organizeConfirmSubmit')}
              </button>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function DraftChangePreviewLayer({
  changeSet,
  decisions,
  onDecision,
  scrollLeft,
  scrollTop,
}: {
  changeSet: DistillationProposalDraftChangeSet;
  decisions: PendingDraftPreviewDecisions;
  onDecision: (
    proposalId: string,
    decision: Exclude<PendingDraftPreviewDecision, 'pending'>,
  ) => void;
  scrollLeft: number;
  scrollTop: number;
}) {
  let cursor = 0;
  const visibleChanges = normalizeDistillationProposalDraftChangeSetEntries(
    changeSet.baseDraft,
    changeSet.changes.filter((change) => decisions[change.proposalId] !== 'rejected'),
  );
  return (
    <div
      className="annotation-sedimentation-draft-preview-layer"
      aria-label={i18next.t('sedimentation.draftChangePreview')}
      role="region"
    >
      <div
        className="annotation-sedimentation-draft-preview-text"
        style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
      >
        {visibleChanges.map((change, index) => {
          const before = changeSet.baseDraft.slice(cursor, change.range.start);
          cursor = change.kind === 'insert' ? change.range.start : change.range.end;
          return (
            <span key={`${change.range.start}-${change.range.end}-${index}`}>
              <span>{before}</span>
              <DraftChangePreviewChange
                change={change}
                decision={decisions[change.proposalId] || 'pending'}
                onDecision={onDecision}
              />
            </span>
          );
        })}
        <span>{changeSet.baseDraft.slice(cursor)}</span>
      </div>
    </div>
  );
}

function DraftChangePreviewChange({
  change,
  decision,
  onDecision,
}: {
  change: DistillationProposalDraftChangeSetEntry;
  decision: PendingDraftPreviewDecision;
  onDecision: (
    proposalId: string,
    decision: Exclude<PendingDraftPreviewDecision, 'pending'>,
  ) => void;
}) {
  return (
    <span className="annotation-sedimentation-draft-preview-change">
      <DraftChangePreviewMark change={change} />
      {decision === 'pending' ? (
        <span
          className="annotation-sedimentation-draft-preview-change-actions"
          contentEditable={false}
        >
          <button type="button" onClick={() => onDecision(change.proposalId, 'accepted')}>
            <Check size={13} />
            <span>{i18next.t('sedimentation.keepProposalChange')}</span>
          </button>
          <button
            className="is-secondary"
            type="button"
            onClick={() => onDecision(change.proposalId, 'rejected')}
          >
            <X size={13} />
            <span>{i18next.t('sedimentation.discardProposalChange')}</span>
          </button>
        </span>
      ) : (
        <span
          className="annotation-sedimentation-draft-preview-change-state"
          contentEditable={false}
        >
          <Check size={12} />
          <span>{i18next.t('sedimentation.keptProposalChange')}</span>
        </span>
      )}
    </span>
  );
}

function DraftChangePreviewMark({ change }: { change: DistillationProposalDraftChange }) {
  if (change.kind === 'insert') {
    return (
      <ins className="annotation-sedimentation-draft-preview-insert">{change.insertedText}</ins>
    );
  }
  if (change.kind === 'delete') {
    return (
      <del className="annotation-sedimentation-draft-preview-delete">{change.deletedText}</del>
    );
  }
  return (
    <>
      <del className="annotation-sedimentation-draft-preview-delete">{change.deletedText}</del>
      <ins className="annotation-sedimentation-draft-preview-insert">{change.insertedText}</ins>
    </>
  );
}

function OrganizeDiscussionCard({
  appliedProposalIds,
  dismissedProposalIds,
  onClose,
  onPreviewProposals,
  onRetry,
  pendingProposalIds,
  state,
}: {
  appliedProposalIds: Set<string>;
  dismissedProposalIds: Set<string>;
  onClose: () => void;
  onPreviewProposals: (proposals: AnnotationDistillationProposal[]) => void;
  onRetry: () => void;
  pendingProposalIds: string[];
  state: Exclude<OrganizeDiscussionState, { type: 'idle' }>;
}) {
  const { t } = useTranslation();
  const { agent, message } = state;
  const isRunning = state.type === 'running';
  const isFailed = state.type === 'failed';
  const minimized = pendingProposalIds.length > 0;
  const structuredItems = (message.items || []).filter((item) => item.type !== 'proposal');
  const proposals = message.proposals || [];
  const appendableProposalCount = pendingOrganizeProposals(
    proposals,
    appliedProposalIds,
    dismissedProposalIds,
  ).length;
  const statusLabel = minimized
    ? t('sedimentation.previewingProposal')
    : isFailed
      ? t('sedimentation.organizeCardFailed')
      : isRunning
        ? t('sedimentation.organizeCardRunning')
        : appendableProposalCount > 0
          ? t('sedimentation.organizeCardDoneWithProposals', { count: appendableProposalCount })
          : structuredItems.length > 0
            ? t('sedimentation.organizeCardDoneWithFindings', { count: structuredItems.length })
            : t('sedimentation.organizeCardDone');
  const errorMessage = message.errorMessage || t('sedimentation.reviewFailed');
  const fallback = isFailed ? errorMessage : t('sedimentation.organizeCardEmpty');
  const shouldShowMarkdown =
    structuredItems.length === 0 && (Boolean(message.content.trim()) || proposals.length === 0);
  const html = useMemo(
    () => renderSafeMarkdown(message.content || fallback),
    [fallback, message.content],
  );
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [hasScrollMore, setHasScrollMore] = useState(false);

  function updateScrollHint() {
    const body = bodyRef.current;
    if (!body) {
      setHasScrollMore(false);
      return;
    }
    setHasScrollMore(body.scrollTop + body.clientHeight < body.scrollHeight - 3);
  }

  useEffect(() => {
    updateScrollHint();
    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(body);
    return () => observer.disconnect();
  }, [
    message.assistantProgress,
    message.content,
    message.items,
    message.proposals,
    state.notice,
    state.type,
  ]);

  if (minimized) {
    return (
      <article className={`annotation-sedimentation-organize-card is-${state.type} is-minimized`}>
        <header>
          <div className="annotation-sedimentation-organize-title">
            <span className="annotation-sedimentation-organize-icon">
              <Sparkles size={15} />
            </span>
            <div>
              <strong>{t('sedimentation.organizeCardTitle')}</strong>
              <span>{statusLabel}</span>
            </div>
          </div>
          <div className="annotation-sedimentation-organize-meta">
            <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
            <span>{agent.nickname}</span>
          </div>
        </header>
      </article>
    );
  }

  return (
    <article className={`annotation-sedimentation-organize-card is-${state.type}`}>
      <header>
        <div className="annotation-sedimentation-organize-title">
          <span className="annotation-sedimentation-organize-icon">
            <Sparkles size={15} />
          </span>
          <div>
            <strong>{t('sedimentation.organizeCardTitle')}</strong>
            <span>{statusLabel}</span>
          </div>
        </div>
        <div className="annotation-sedimentation-organize-meta">
          <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
          <span>{agent.nickname}</span>
          {isFailed ? (
            <button type="button" onClick={onRetry}>
              <RotateCcw size={14} />
              <span>{t('sedimentation.organizeCardRetry')}</span>
            </button>
          ) : null}
          {!isRunning ? (
            <button
              className="is-icon"
              type="button"
              aria-label={t('sedimentation.organizeCardClose')}
              onClick={onClose}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </header>
      <div
        ref={bodyRef}
        className={[
          'annotation-sedimentation-organize-body',
          hasScrollMore ? 'has-scroll-more' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onScroll={updateScrollHint}
      >
        <AssistantRuntimeProgressList progress={message.assistantProgress} />
        {structuredItems.length > 0 ? (
          <StructuredReviewItems items={structuredItems} />
        ) : shouldShowMarkdown ? (
          <div
            className="annotation-discussion-markdown"
            dangerouslySetInnerHTML={{
              __html: html,
            }}
          />
        ) : null}
        {isFailed && message.content ? (
          <p className="annotation-sedimentation-review-error">{errorMessage}</p>
        ) : null}
        {proposals.length > 0 ? (
          <OrganizeProposalList
            appliedProposalIds={appliedProposalIds}
            dismissedProposalIds={dismissedProposalIds}
            pendingProposalIds={pendingProposalIds}
            proposals={proposals}
            onPreviewProposals={onPreviewProposals}
          />
        ) : null}
        {state.notice ? (
          <p className="annotation-sedimentation-organize-notice">{state.notice}</p>
        ) : null}
        <span className="annotation-sedimentation-organize-scroll-glow" aria-hidden="true" />
      </div>
    </article>
  );
}

function OrganizeProposalList({
  appliedProposalIds,
  dismissedProposalIds,
  onPreviewProposals,
  pendingProposalIds,
  proposals,
}: {
  appliedProposalIds: Set<string>;
  dismissedProposalIds: Set<string>;
  onPreviewProposals: (proposals: AnnotationDistillationProposal[]) => void;
  pendingProposalIds: string[];
  proposals: AnnotationDistillationProposal[];
}) {
  const { t } = useTranslation();
  const pendingProposals = pendingOrganizeProposals(
    proposals,
    appliedProposalIds,
    dismissedProposalIds,
  );
  return (
    <section
      className="annotation-sedimentation-proposals annotation-sedimentation-organize-proposals"
      aria-label={t('sedimentation.proposals')}
    >
      {proposals.map((proposal) => {
        const applied = appliedProposalIds.has(proposal.id);
        const dismissed = dismissedProposalIds.has(proposal.id);
        const previewing = pendingProposalIds.includes(proposal.id);
        return (
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
              <ProposalDiffPreview proposal={proposal} />
            </div>
            <div className="annotation-sedimentation-proposal-actions">
              {applied ? (
                <span className="annotation-sedimentation-proposal-state">
                  {t('sedimentation.organizeAddedToDraft')}
                </span>
              ) : dismissed ? (
                <span className="annotation-sedimentation-proposal-state">
                  {t('sedimentation.discardedProposal')}
                </span>
              ) : previewing ? (
                <span className="annotation-sedimentation-proposal-state">
                  {t('sedimentation.previewingProposal')}
                </span>
              ) : (
                <button type="button" onClick={() => onPreviewProposals(pendingProposals)}>
                  <Eye size={14} />
                  <span>{t('sedimentation.previewProposal')}</span>
                </button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ReviewSessions({
  agents,
  onProposalIgnore,
  onProposalPreview,
  onProposalRestore,
  pendingProposalIds,
  sessions,
  userProfile,
}: {
  agents: PublicAgent[];
  onProposalPreview: (
    messageId: string,
    proposals: AnnotationDistillationProposal[],
  ) => void | Promise<void>;
  onProposalIgnore: (messageId: string, proposalId: string) => void | Promise<void>;
  onProposalRestore: (messageId: string, proposalId: string) => void | Promise<void>;
  pendingProposalIds: string[];
  sessions: AnnotationDistillationReviewSession[];
  userProfile: UserProfile;
}) {
  const { t } = useTranslation();
  const messages = reviewTimelineMessages(sessions, agents);
  const listRef = useRef<HTMLElement | null>(null);
  const scrollSignal = messages
    .map(
      (item) =>
        `${item.key}:${item.message.content.length}:${item.message.items?.length || 0}:${
          item.message.proposals?.length || 0
        }`,
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
        <strong>{t('sedimentation.noReviewTitle')}</strong>
        <p>{t('sedimentation.noReviewDescription')}</p>
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
      aria-label={t('sedimentation.reviewSessions')}
    >
      {messages.map((message) => (
        <ReviewTimelineMessage
          item={message}
          key={message.key}
          agents={agents}
          userProfile={userProfile}
          onProposalIgnore={onProposalIgnore}
          onProposalPreview={onProposalPreview}
          onProposalRestore={onProposalRestore}
          pendingProposalIds={pendingProposalIds}
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
  agents,
  item,
  onProposalIgnore,
  onProposalPreview,
  onProposalRestore,
  pendingProposalIds,
  userProfile,
}: {
  agents: PublicAgent[];
  item: ReviewTimelineItem;
  onProposalPreview: (
    messageId: string,
    proposals: AnnotationDistillationProposal[],
  ) => void | Promise<void>;
  onProposalIgnore: (messageId: string, proposalId: string) => void | Promise<void>;
  onProposalRestore: (messageId: string, proposalId: string) => void | Promise<void>;
  pendingProposalIds: string[];
  userProfile: UserProfile;
}) {
  const { t } = useTranslation();
  const { message } = item;
  const isUser = message.author === 'user';
  const agent = isUser ? undefined : agents.find((candidate) => candidate.id === message.agentId);
  const avatar = isUser ? userProfile.avatar : agent?.avatar || message.agentAvatar;
  const nickname = isUser
    ? userProfile.nickname
    : agent?.nickname ||
      message.agentNickname ||
      message.agentUsername ||
      t('sedimentation.reviewAssistant');
  const isFailed = message.status === 'failed';
  const fallback = isUser
    ? userProfile.nickname.slice(0, 1) || t('common.me')
    : nickname.slice(0, 1) || t('sedimentation.reviewAssistantFallback');
  const className = [
    'annotation-discussion-message',
    'annotation-sedimentation-review-message',
    isUser ? 'is-user' : 'is-assistant',
    isFailed ? 'is-failed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const reviewingLabel = t('sedimentation.reviewing');
  const errorMessage = message.errorMessage || t('sedimentation.reviewFailed');
  const structuredItems = (message.items || []).filter(
    (reviewItem) => reviewItem.type !== 'proposal',
  );
  const html = useMemo(
    () => renderSafeMarkdown(message.content || (isFailed ? errorMessage : reviewingLabel)),
    [errorMessage, isFailed, message.content, reviewingLabel],
  );

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
        {structuredItems.length > 0 ? (
          <StructuredReviewItems items={structuredItems} />
        ) : (
          <div
            className="annotation-discussion-markdown"
            dangerouslySetInnerHTML={{
              __html: html,
            }}
          />
        )}
        {isFailed && message.content ? (
          <p className="annotation-sedimentation-review-error">{errorMessage}</p>
        ) : null}
        {!isUser && message.proposals?.length ? (
          <ReviewProposalList
            messageId={message.id}
            proposals={message.proposals}
            pendingProposalIds={pendingProposalIds}
            onIgnore={onProposalIgnore}
            onPreview={onProposalPreview}
            onRestore={onProposalRestore}
          />
        ) : null}
      </div>
    </article>
  );
}

function StructuredReviewItems({ items }: { items: AnnotationDistillationReviewItem[] }) {
  const visibleItems = items.filter((item) => item.type !== 'proposal');
  if (visibleItems.length === 0) return null;
  return (
    <div className="annotation-sedimentation-review-items">
      {visibleItems.map((item) => {
        if (item.type === 'overview') {
          return (
            <article
              className={`annotation-sedimentation-review-item is-overview is-${item.stance}`}
              key={item.id}
            >
              <span>{reviewStanceLabel(item.stance)}</span>
              <p>{item.content}</p>
            </article>
          );
        }
        return (
          <article
            className={`annotation-sedimentation-review-item is-finding is-${item.severity}`}
            key={item.id}
          >
            <header>
              <span>
                {reviewFindingCategoryLabel(item.category)} ·{' '}
                {reviewFindingSeverityLabel(item.severity)}
              </span>
              <strong>{item.title}</strong>
            </header>
            <p>{item.content}</p>
            {item.draftTargetText ? <blockquote>{item.draftTargetText}</blockquote> : null}
          </article>
        );
      })}
    </div>
  );
}

function ReviewProposalList({
  messageId,
  onIgnore,
  onPreview,
  onRestore,
  pendingProposalIds,
  proposals,
}: {
  messageId: string;
  onPreview: (
    messageId: string,
    proposals: AnnotationDistillationProposal[],
  ) => void | Promise<void>;
  onIgnore: (messageId: string, proposalId: string) => void | Promise<void>;
  onRestore: (messageId: string, proposalId: string) => void | Promise<void>;
  pendingProposalIds: string[];
  proposals: AnnotationDistillationProposal[];
}) {
  const { t } = useTranslation();
  const pendingProposals = pendingReviewProposals(proposals);
  return (
    <section
      className="annotation-sedimentation-proposals"
      aria-label={t('sedimentation.proposals')}
    >
      {proposals.map((proposal) => {
        const previewing = pendingProposalIds.includes(proposal.id);
        return (
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
              <ProposalDiffPreview proposal={proposal} />
            </div>
            <div className="annotation-sedimentation-proposal-actions">
              {proposal.status === 'pending' ? (
                previewing ? (
                  <span className="annotation-sedimentation-proposal-state">
                    {t('sedimentation.previewingProposal')}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void onPreview(messageId, pendingProposals)}
                    >
                      <Eye size={14} />
                      <span>{t('sedimentation.previewProposal')}</span>
                    </button>
                    <button
                      className="is-secondary"
                      type="button"
                      onClick={() => void onIgnore(messageId, proposal.id)}
                    >
                      <X size={14} />
                      <span>{t('sedimentation.ignoreProposal')}</span>
                    </button>
                  </>
                )
              ) : null}
              {proposal.status === 'ignored' ? (
                <button
                  className="is-secondary"
                  type="button"
                  onClick={() => void onRestore(messageId, proposal.id)}
                >
                  <RotateCcw size={14} />
                  <span>{t('sedimentation.restoreProposal')}</span>
                </button>
              ) : null}
              {proposal.status === 'accepted' ? (
                <span className="annotation-sedimentation-proposal-state">
                  {t('sedimentation.acceptedProposal')}
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function reviewStanceLabel(
  value: Extract<AnnotationDistillationReviewItem, { type: 'overview' }>['stance'],
) {
  if (i18next.language.startsWith('zh')) {
    if (value === 'solid') return '基本站得住';
    if (value === 'weak') return '仍需补强';
    return '有亮点也有缺口';
  }
  if (value === 'solid') return 'Solid';
  if (value === 'weak') return 'Needs work';
  return 'Mixed';
}

function reviewFindingCategoryLabel(
  value: Extract<AnnotationDistillationReviewItem, { type: 'finding' }>['category'],
) {
  const zh = i18next.language.startsWith('zh');
  if (value === 'evidence') return zh ? '证据' : 'Evidence';
  if (value === 'logic') return zh ? '逻辑' : 'Logic';
  if (value === 'coverage') return zh ? '覆盖' : 'Coverage';
  if (value === 'clarity') return zh ? '表达' : 'Clarity';
  return zh ? '行动' : 'Action';
}

function reviewFindingSeverityLabel(
  value: Extract<AnnotationDistillationReviewItem, { type: 'finding' }>['severity'],
) {
  const zh = i18next.language.startsWith('zh');
  if (value === 'high') return zh ? '关键' : 'High';
  if (value === 'low') return zh ? '轻微' : 'Low';
  return zh ? '一般' : 'Medium';
}

function proposalKindLabel(kind: AnnotationDistillationProposal['kind']) {
  if (kind === 'insert') return i18next.t('sedimentation.proposalKind.insert');
  if (kind === 'replace') return i18next.t('sedimentation.proposalKind.replace');
  return i18next.t('sedimentation.proposalKind.delete');
}

function ProposalDiffPreview({ proposal }: { proposal: AnnotationDistillationProposal }) {
  if (proposal.kind === 'insert') {
    return (
      <blockquote className="proposal-diff">
        <ins className="proposal-diff-insert">{proposal.content || ''}</ins>
      </blockquote>
    );
  }
  if (proposal.kind === 'replace') {
    return (
      <blockquote className="proposal-diff">
        <del className="proposal-diff-delete">{proposal.targetText || ''}</del>
        <ins className="proposal-diff-insert">{proposal.replacementText || ''}</ins>
      </blockquote>
    );
  }
  return (
    <blockquote className="proposal-diff">
      <del className="proposal-diff-delete">{proposal.targetText || ''}</del>
    </blockquote>
  );
}

function reviewTimelineMessages(
  sessions: AnnotationDistillationReviewSession[],
  agents: PublicAgent[],
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

      const agentId = message.agentId || session.agentId;
      const agent = agents.find((item) => item.id === agentId);
      items.push({
        key: `assistant:${session.id}:${message.id}`,
        message: {
          ...message,
          agentId,
          agentUsername: agent?.username || message.agentUsername || session.agentUsername,
          agentNickname: agent?.nickname || message.agentNickname || session.agentNickname,
          agentAvatar: agent?.avatar || message.agentAvatar || session.agentAvatar,
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
  const patch = await window.yomitomoDesktop.saveArticle(nextArticle);
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

function appendReviewItemToMessage(
  message: AnnotationDistillationReviewMessage,
  item: AnnotationDistillationReviewItem,
) {
  return Object.assign({}, message, {
    items: [...(message.items || []), item],
    proposals:
      item.type === 'proposal'
        ? [...(message.proposals || []), item.proposal]
        : message.proposals || [],
  });
}

type DistillationProposalSource = Required<
  Pick<
    AnnotationDistillationProposal,
    'sourceDraftHash' | 'sourceReviewSessionId' | 'sourceReviewMessageId' | 'sourceAgentId'
  >
>;

function distillationProposalSource({
  agentId,
  draft,
  messageId,
  sessionId,
}: {
  agentId: string;
  draft: string;
  messageId: string;
  sessionId: string;
}): DistillationProposalSource {
  return {
    sourceDraftHash: hashText(draft),
    sourceReviewSessionId: sessionId,
    sourceReviewMessageId: messageId,
    sourceAgentId: agentId,
  };
}

function reviewMessageWithProposalSource(
  message: AnnotationDistillationReviewMessage,
  source: DistillationProposalSource,
) {
  return {
    ...message,
    items: message.items?.map((item) => reviewItemWithProposalSource(item, source)),
    proposals: message.proposals?.map((proposal) => proposalWithSource(proposal, source)),
  };
}

function reviewItemWithProposalSource(
  item: AnnotationDistillationReviewItem,
  source: DistillationProposalSource,
): AnnotationDistillationReviewItem {
  if (item.type !== 'proposal') return item;
  return {
    ...item,
    proposal: proposalWithSource(item.proposal, source),
  };
}

function proposalWithSource(
  proposal: AnnotationDistillationProposal,
  source: DistillationProposalSource,
) {
  return {
    ...proposal,
    ...source,
  };
}

function reviewRequestComment(
  message: AnnotationDistillationReviewMessage | undefined,
  createdAt: string,
): Comment {
  return {
    id: message?.id || makeId('distillation_review_request'),
    author: 'user',
    content: message?.content || i18next.t('sedimentation.reviewPrompt.defaultRequest'),
    createdAt: message?.createdAt || createdAt,
  };
}

function distillationReviewPayloadFields(
  draft: string,
  reviewDraft: string,
  session: AnnotationDistillationReviewSession,
) {
  return {
    instruction: draft,
    distillationDraft: draft,
    distillationReviewRequest:
      reviewDraft.trim() || i18next.t('sedimentation.reviewPrompt.defaultReviewRequest'),
    distillationReviewTranscript: distillationReviewTranscript(session),
  };
}

function distillationReviewTranscript(session: AnnotationDistillationReviewSession) {
  return session.messages
    .map((message) =>
      i18next.t('sedimentation.reviewPrompt.transcriptLine', {
        role:
          message.author === 'user'
            ? i18next.t('sedimentation.reviewPrompt.userRole')
            : i18next.t('sedimentation.reviewPrompt.assistantRole'),
        content: message.content,
      }),
    )
    .join('\n');
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

function timestamp(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
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
