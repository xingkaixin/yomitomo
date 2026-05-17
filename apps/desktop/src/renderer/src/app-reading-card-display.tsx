import React, { useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  CornerDownRight,
  FileText,
  Layers2,
  Lightbulb,
  MessageCircle,
  Puzzle,
  ShieldAlert,
  Sparkles,
  Sprout,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  Agent,
  AgentReadingIntent,
  AnnotationType,
  ArticleRecord,
  ReadingCardRecord,
  ReadingCardSection as PersistedReadingCardSection,
  ReadingDeliberationRecord,
  ReadingReceiptState,
  UserProfile,
} from '@yomitomo/shared';
import {
  buildReadingCardStats,
  questionStatusLabel,
  type ReadingCardEvidenceUnit,
  type ReadingReceiptDisposition,
} from '@yomitomo/core';
import { formatDate, formatDateTime } from './app-utils';
import {
  openReadingCardEvidence,
  parseReadingCardMarkdownSections,
  readingCardSectionIndex,
  renderReadingCardMarkdown,
  splitReadingCardSection,
} from './app-reading-card-markdown';
import { ReadingCardReviewPanel } from './app-reading-card-review';
import { AvatarImage } from './app-ui';
import type {
  ReadingReceiptClarificationAgent,
  ReadingReceiptClarificationOpinion,
  ReadingReceiptClarificationStreamEvent,
} from '../../preload';

export type ReadingReceiptBoardDisposition = ReadingReceiptDisposition | 'clarify';

type ReadingReceiptDragGeometry = {
  height: number;
  offsetX: number;
  offsetY: number;
  sourceDisposition: ReadingReceiptBoardDisposition;
  width: number;
  x: number;
  y: number;
};

type ReadingReceiptClarificationRound = {
  id: string;
  userThought: string;
  opinions: ReadingReceiptClarificationOpinion[];
  draftOpinions: ReadingReceiptClarificationDraftOpinion[];
};

type ReadingReceiptClarificationDraftOpinion = ReadingReceiptClarificationAgent & {
  rawText: string;
  reason: string;
  state: 'pending' | 'streaming';
};

const annotationTypeIcons: Record<AnnotationType, LucideIcon> = {
  key_point: Lightbulb,
  assumption: TriangleAlert,
  concept: Puzzle,
  question: Sprout,
  quote: Sparkles,
};

const readingIntentIcons: Record<AgentReadingIntent, LucideIcon> = {
  explain: MessageCircle,
  decompose: Layers2,
  challenge: ShieldAlert,
  question: CornerDownRight,
  connect: FileText,
};

export function ReadingDeliberationPanel({
  canConfirm,
  confirming,
  deliberation,
  evidenceUnits,
  userProfile,
  userJudgment,
  onBackToTriage,
  onChangeUserJudgment,
  onConfirm,
  onOpenEvidence,
}: {
  canConfirm: boolean;
  confirming: boolean;
  deliberation: ReadingDeliberationRecord;
  evidenceUnits: ReadingCardEvidenceUnit[];
  userProfile: UserProfile;
  userJudgment: string;
  onBackToTriage: () => void;
  onChangeUserJudgment: (value: string) => void;
  onConfirm: () => void;
  onOpenEvidence: (annotationId: string) => void;
}) {
  const evidenceByIndex = useMemo(
    () => new Map(evidenceUnits.map((unit) => [unit.index, unit])),
    [evidenceUnits],
  );
  const sections =
    deliberation.sections.length > 0
      ? deliberation.sections
      : parseReadingCardMarkdownSections(deliberation.contentMarkdown);

  function openEvidence(event: React.MouseEvent<HTMLDivElement>) {
    openReadingCardEvidence(event, evidenceByIndex, onOpenEvidence);
  }

  return (
    <section className="reading-deliberation-panel">
      <header>
        <div>
          <span>阅读所得</span>
          <h4>{deliberation.title}</h4>
        </div>
        <time>{formatDate(deliberation.updatedAt)}</time>
      </header>
      <div className="reading-deliberation-sections" onClick={openEvidence}>
        {sections.map((section) => {
          const sectionKind = readingDeliberationSectionKind(section.title);
          return (
            <article
              className={`reading-deliberation-section is-${sectionKind}`}
              key={section.title}
            >
              <header>
                <span>{readingDeliberationSectionLabel(sectionKind)}</span>
                <h5>{section.title}</h5>
              </header>
              <div
                className="reading-card-markdown"
                dangerouslySetInnerHTML={{
                  __html: renderReadingCardMarkdown(section.content, evidenceByIndex, userProfile),
                }}
              />
            </article>
          );
        })}
      </div>
      <section className="reading-deliberation-confirmation">
        <header>
          <div>
            <span>我的判断</span>
            <h5>补上这次阅读真正留下的一句话</h5>
          </div>
          <strong>{userJudgment.trim().length > 0 ? '可进入下一步' : '必填'}</strong>
        </header>
        <textarea
          value={userJudgment}
          rows={3}
          placeholder="我读完后真正留下的是..."
          onChange={(event) => onChangeUserJudgment(event.target.value)}
        />
        <div className="reading-deliberation-confirmation-actions">
          <button type="button" className="is-secondary" onClick={onBackToTriage}>
            <Undo2 size={14} />
            回到拣选
          </button>
          <button type="button" disabled={!canConfirm} onClick={onConfirm}>
            <Sparkles size={14} />
            {confirming ? '打磨中...' : '确认并打磨成回执'}
          </button>
        </div>
      </section>
    </section>
  );
}

function readingDeliberationSectionKind(title: string) {
  if (title === '一句话所得') return 'takeaway';
  if (title === '材料合成') return 'material';
  if (title === '对我的影响') return 'impact';
  if (title === '还需要补一句') return 'missing';
  if (title === '给回执的整理方向') return 'direction';
  return 'note';
}

function readingDeliberationSectionLabel(kind: string) {
  const labels: Record<string, string> = {
    takeaway: '所得',
    material: '合成',
    impact: '影响',
    missing: '待补',
    direction: '方向',
    note: '材料',
  };
  return labels[kind] || labels.note;
}

export function ReadingReceiptTriageBoard({
  annotationAgents = [],
  article,
  evidenceUnits,
  locked = false,
  receiptDispositionById,
  sourceUpdatedAt,
  userProfile,
  onChangeDisposition,
  onOpenEvidence,
  onPersistReadingReceiptState,
}: {
  annotationAgents?: Agent[];
  article: ArticleRecord;
  evidenceUnits: ReadingCardEvidenceUnit[];
  locked?: boolean;
  receiptDispositionById: Record<string, ReadingReceiptBoardDisposition>;
  sourceUpdatedAt: string;
  userProfile: UserProfile;
  onChangeDisposition: (evidenceId: string, disposition: ReadingReceiptBoardDisposition) => void;
  onOpenEvidence: (annotationId: string) => void;
  onPersistReadingReceiptState: (state: ReadingReceiptState) => void;
}) {
  const [activeEvidenceId, setActiveEvidenceId] = React.useState<string | null>(null);
  const [clarifyingEvidenceId, setClarifyingEvidenceId] = React.useState<string | null>(null);
  const [clarificationAgentIdsByEvidenceId, setClarificationAgentIdsByEvidenceId] = React.useState<
    Record<string, string[]>
  >({});
  const [clarificationRoundsByEvidenceId, setClarificationRoundsByEvidenceId] = React.useState<
    Record<string, ReadingReceiptClarificationRound[]>
  >({});
  const [clarificationThoughtByEvidenceId, setClarificationThoughtByEvidenceId] = React.useState<
    Record<string, string>
  >({});
  const [clarificationThoughtOpenByEvidenceId, setClarificationThoughtOpenByEvidenceId] =
    React.useState<Record<string, boolean>>({});
  const [expandedClarificationRoundByEvidenceId, setExpandedClarificationRoundByEvidenceId] =
    React.useState<Record<string, string>>({});
  const [addingClarificationAgentsForEvidenceId, setAddingClarificationAgentsForEvidenceId] =
    React.useState<string | null>(null);
  const [clarificationLoadingEvidenceId, setClarificationLoadingEvidenceId] = React.useState<
    string | null
  >(null);
  const [clarificationErrorByEvidenceId, setClarificationErrorByEvidenceId] = React.useState<
    Record<string, string>
  >({});
  const [draggingEvidenceId, setDraggingEvidenceId] = React.useState<string | null>(null);
  const [dropReadyDisposition, setDropReadyDisposition] =
    React.useState<ReadingReceiptBoardDisposition | null>(null);
  const [dragState, setDragState] = React.useState<ReadingReceiptDragGeometry | null>(null);
  const columnElementsRef = React.useRef(new Map<ReadingReceiptBoardDisposition, HTMLElement>());
  const pendingDragRef = React.useRef<
    (ReadingReceiptDragGeometry & { evidenceId: string; startX: number; startY: number }) | null
  >(null);
  const dragStateRef = React.useRef<(ReadingReceiptDragGeometry & { evidenceId: string }) | null>(
    null,
  );
  const pendingReceiptStateRef = React.useRef<ReadingReceiptState | null>(null);
  const suppressNextClickRef = React.useRef(false);
  const [receiptPersistVersion, setReceiptPersistVersion] = React.useState(0);
  const groupedUnits = useMemo(
    () =>
      receiptBoardColumns.map((column) => ({
        ...column,
        units: evidenceUnits.filter(
          (unit) => (receiptDispositionById[unit.id] || 'clarify') === column.value,
        ),
      })),
    [evidenceUnits, receiptDispositionById],
  );
  const clarifyCount = groupedUnits.find((column) => column.value === 'clarify')?.units.length ?? 0;
  const draggingDisposition = draggingEvidenceId
    ? receiptDispositionById[draggingEvidenceId] || 'clarify'
    : null;
  const draggedUnit = draggingEvidenceId
    ? evidenceUnits.find((unit) => unit.id === draggingEvidenceId) || null
    : null;
  const evidenceKey = React.useMemo(
    () => evidenceUnits.map((unit) => unit.id).join('|'),
    [evidenceUnits],
  );

  React.useEffect(() => {
    const persistedState =
      article.readingReceiptState?.sourceUpdatedAt === sourceUpdatedAt
        ? article.readingReceiptState
        : null;
    setClarificationAgentIdsByEvidenceId(
      readingReceiptHydratedAgentIds(persistedState, evidenceUnits),
    );
    setClarificationRoundsByEvidenceId(readingReceiptHydratedRounds(persistedState, evidenceUnits));
    setClarificationThoughtByEvidenceId(
      readingReceiptHydratedThoughts(persistedState, evidenceUnits),
    );
    setClarificationThoughtOpenByEvidenceId(
      readingReceiptHydratedThoughtOpen(persistedState, evidenceUnits),
    );
    setExpandedClarificationRoundByEvidenceId(
      readingReceiptHydratedExpandedRounds(persistedState, evidenceUnits),
    );
    pendingReceiptStateRef.current = null;
  }, [article.id, evidenceKey, evidenceUnits, sourceUpdatedAt]);

  React.useEffect(() => {
    if (!pendingReceiptStateRef.current) return;
    const persistHandle = window.setTimeout(() => {
      const pendingState = pendingReceiptStateRef.current;
      if (!pendingState) return;
      pendingReceiptStateRef.current = null;
      onPersistReadingReceiptState({ ...pendingState, updatedAt: new Date().toISOString() });
    }, 320);
    return () => window.clearTimeout(persistHandle);
  }, [receiptPersistVersion, onPersistReadingReceiptState]);

  React.useEffect(() => {
    if (!addingClarificationAgentsForEvidenceId) return;
    function closeMenuOnPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.reading-receipt-clarify-add-wrap')) return;
      setAddingClarificationAgentsForEvidenceId(null);
    }
    window.addEventListener('pointerdown', closeMenuOnPointerDown, true);
    return () => window.removeEventListener('pointerdown', closeMenuOnPointerDown, true);
  }, [addingClarificationAgentsForEvidenceId]);

  React.useEffect(() => {
    if (!locked) return;
    pendingDragRef.current = null;
    dragStateRef.current = null;
    setDragState(null);
    setDraggingEvidenceId(null);
    setDropReadyDisposition(null);
    setClarifyingEvidenceId(null);
    setAddingClarificationAgentsForEvidenceId(null);
  }, [locked]);

  const queueReadingReceiptStatePersistence = React.useCallback(
    (overrides: Partial<ReadingReceiptStateBuildInput> = {}) => {
      pendingReceiptStateRef.current = buildPersistedReadingReceiptState({
        clarificationAgentIdsByEvidenceId,
        clarificationRoundsByEvidenceId,
        clarificationThoughtByEvidenceId,
        evidenceUnits,
        receiptDispositionById,
        sourceUpdatedAt,
        ...overrides,
      });
      setReceiptPersistVersion((current) => current + 1);
    },
    [
      clarificationAgentIdsByEvidenceId,
      clarificationRoundsByEvidenceId,
      clarificationThoughtByEvidenceId,
      evidenceUnits,
      receiptDispositionById,
      sourceUpdatedAt,
    ],
  );

  React.useEffect(() => {
    function movePendingDrag(event: PointerEvent) {
      const pending = pendingDragRef.current;
      if (!pending) return;
      const current = dragStateRef.current;
      if (!current) {
        const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
        if (distance < 5) return;
        suppressNextClickRef.current = true;
        const next = {
          ...pending,
          x: event.clientX,
          y: event.clientY,
        };
        dragStateRef.current = next;
        setDraggingEvidenceId(pending.evidenceId);
        setActiveEvidenceId(pending.evidenceId);
        setClarifyingEvidenceId(null);
        setDragState(next);
        setDropReadyDisposition(dropDispositionForDrag(columnElementsRef.current, next));
        return;
      }
      const next = { ...current, x: event.clientX, y: event.clientY };
      dragStateRef.current = next;
      setDragState(next);
      setDropReadyDisposition(dropDispositionForDrag(columnElementsRef.current, next));
    }

    function finishPendingDrag() {
      const current = dragStateRef.current;
      if (current) {
        const targetDisposition = dropDispositionForDrag(columnElementsRef.current, current);
        if (targetDisposition) {
          const nextDispositionById = {
            ...receiptDispositionById,
            [current.evidenceId]: targetDisposition,
          };
          onChangeDisposition(current.evidenceId, targetDisposition);
          queueReadingReceiptStatePersistence({ receiptDispositionById: nextDispositionById });
          setActiveEvidenceId(null);
          setClarifyingEvidenceId(null);
        } else {
          setActiveEvidenceId(current.evidenceId);
        }
      }
      pendingDragRef.current = null;
      dragStateRef.current = null;
      suppressNextClickRef.current = false;
      setDragState(null);
      setDraggingEvidenceId(null);
      setDropReadyDisposition(null);
    }

    window.addEventListener('pointermove', movePendingDrag);
    window.addEventListener('pointerup', finishPendingDrag);
    window.addEventListener('pointercancel', finishPendingDrag);
    return () => {
      window.removeEventListener('pointermove', movePendingDrag);
      window.removeEventListener('pointerup', finishPendingDrag);
      window.removeEventListener('pointercancel', finishPendingDrag);
    };
  }, [onChangeDisposition, queueReadingReceiptStatePersistence, receiptDispositionById]);

  function setColumnElement(
    disposition: ReadingReceiptBoardDisposition,
    element: HTMLElement | null,
  ) {
    if (element) {
      columnElementsRef.current.set(disposition, element);
      return;
    }
    columnElementsRef.current.delete(disposition);
  }

  function startDragging(evidenceId: string, geometry: ReadingReceiptDragGeometry) {
    if (locked) return;
    pendingDragRef.current = {
      ...geometry,
      evidenceId,
      startX: geometry.x,
      startY: geometry.y,
    };
  }

  function cancelPendingDrag() {
    pendingDragRef.current = null;
  }

  function toggleActiveEvidence(evidenceId: string) {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    setActiveEvidenceId((current) => (current === evidenceId ? null : evidenceId));
    setClarifyingEvidenceId(null);
  }

  function toggleClarification(evidenceId: string) {
    if (locked) return;
    if (clarifyingEvidenceId === evidenceId) {
      setActiveEvidenceId(null);
      setClarifyingEvidenceId(null);
      setAddingClarificationAgentsForEvidenceId(null);
      return;
    }
    setActiveEvidenceId(evidenceId);
    setClarifyingEvidenceId(evidenceId);
    setAddingClarificationAgentsForEvidenceId(null);
  }

  function toggleClarificationAgent(evidenceId: string, agentId: string) {
    if (locked) return;
    const selected = clarificationAgentIdsByEvidenceId[evidenceId] || [];
    const next = selected.includes(agentId)
      ? selected.filter((id) => id !== agentId)
      : [...selected, agentId];
    const nextAgentIdsByEvidenceId = {
      ...clarificationAgentIdsByEvidenceId,
      [evidenceId]: next,
    };
    setClarificationAgentIdsByEvidenceId(nextAgentIdsByEvidenceId);
    setAddingClarificationAgentsForEvidenceId(null);
    queueReadingReceiptStatePersistence({
      clarificationAgentIdsByEvidenceId: nextAgentIdsByEvidenceId,
    });
  }

  function changeClarificationThought(evidenceId: string, value: string) {
    if (locked) return;
    const nextThoughtByEvidenceId = { ...clarificationThoughtByEvidenceId, [evidenceId]: value };
    setClarificationThoughtByEvidenceId(nextThoughtByEvidenceId);
    queueReadingReceiptStatePersistence({
      clarificationThoughtByEvidenceId: nextThoughtByEvidenceId,
    });
  }

  function startClarificationThought(evidenceId: string) {
    if (locked) return;
    setClarificationThoughtOpenByEvidenceId((current) => ({ ...current, [evidenceId]: true }));
  }

  function toggleClarificationAgentMenu(evidenceId: string) {
    if (locked) return;
    setAddingClarificationAgentsForEvidenceId((current) =>
      current === evidenceId ? null : evidenceId,
    );
  }

  function closeClarificationAgentMenu(evidenceId: string, event: React.FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setAddingClarificationAgentsForEvidenceId((current) =>
      current === evidenceId ? null : current,
    );
  }

  function toggleClarificationRound(evidenceId: string, roundId: string) {
    setExpandedClarificationRoundByEvidenceId((current) => ({
      ...current,
      [evidenceId]: roundId,
    }));
  }

  function updateClarificationRound(
    evidenceId: string,
    roundId: string,
    update: (round: ReadingReceiptClarificationRound) => ReadingReceiptClarificationRound,
  ) {
    setClarificationRoundsByEvidenceId((current) => ({
      ...current,
      [evidenceId]: (current[evidenceId] || []).map((round) =>
        round.id === roundId ? update(round) : round,
      ),
    }));
  }

  async function runClarificationRound(evidenceId: string, selectedAgentIds: string[]) {
    if (locked) return;
    const unit = evidenceUnits.find((item) => item.id === evidenceId);
    if (!unit) return;
    if (selectedAgentIds.length === 0) {
      setClarificationErrorByEvidenceId((current) => ({
        ...current,
        [evidenceId]: '请选择至少一位阅读助手参与讨论。',
      }));
      return;
    }
    const userThought = (clarificationThoughtByEvidenceId[evidenceId] || '').trim();
    const previousRounds = clarificationRoundsByEvidenceId[evidenceId] || [];
    if (previousRounds.length > 0 && !userThought) {
      setClarificationThoughtOpenByEvidenceId((current) => ({ ...current, [evidenceId]: true }));
      setClarificationErrorByEvidenceId((current) => ({
        ...current,
        [evidenceId]: '请先写下你的补充想法，再让助手发表下一轮观点。',
      }));
      return;
    }
    const roundId = `clarification_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const selectedAgentIdSet = new Set(selectedAgentIds);
    const draftOpinions = annotationAgents
      .filter((agent) => selectedAgentIdSet.has(agent.id))
      .map((agent) => ({
        agentId: agent.id,
        agentNickname: agent.nickname,
        agentUsername: agent.username,
        agentAvatar: agent.avatar,
        agentColor: agent.annotationColor,
        rawText: '',
        reason: '',
        state: 'pending' as const,
      }));
    setClarificationLoadingEvidenceId(evidenceId);
    setClarificationErrorByEvidenceId((current) => ({ ...current, [evidenceId]: '' }));
    setExpandedClarificationRoundByEvidenceId((current) => ({ ...current, [evidenceId]: roundId }));
    setClarificationRoundsByEvidenceId((current) => ({
      ...current,
      [evidenceId]: [
        ...(current[evidenceId] || []),
        {
          id: roundId,
          userThought,
          opinions: [],
          draftOpinions,
        },
      ],
    }));
    try {
      const result = await window.yomitomoDesktop.generateReadingReceiptClarificationStream(
        {
          article,
          evidenceUnit: unit,
          selectedAgentIds,
          previousRounds: previousRounds.map((round) => ({
            userThought: round.userThought,
            opinions: round.opinions,
          })),
          userThought,
        },
        (event) => {
          applyClarificationStreamEvent(evidenceId, roundId, event);
        },
      );
      const nextRounds = [
        ...previousRounds,
        {
          id: roundId,
          userThought,
          opinions: result.opinions,
          draftOpinions: [],
        },
      ];
      const nextRoundsByEvidenceId = {
        ...clarificationRoundsByEvidenceId,
        [evidenceId]: nextRounds,
      };
      const nextThoughtByEvidenceId = { ...clarificationThoughtByEvidenceId, [evidenceId]: '' };
      updateClarificationRound(evidenceId, roundId, (round) => ({
        ...round,
        opinions: result.opinions,
        draftOpinions: [],
      }));
      setClarificationThoughtByEvidenceId(nextThoughtByEvidenceId);
      setClarificationThoughtOpenByEvidenceId((current) => ({ ...current, [evidenceId]: false }));
      queueReadingReceiptStatePersistence({
        clarificationRoundsByEvidenceId: nextRoundsByEvidenceId,
        clarificationThoughtByEvidenceId: nextThoughtByEvidenceId,
      });
    } catch (error) {
      setClarificationErrorByEvidenceId((current) => ({
        ...current,
        [evidenceId]: error instanceof Error ? error.message : '澄清讨论失败',
      }));
    } finally {
      setClarificationLoadingEvidenceId(null);
    }
  }

  function applyClarificationStreamEvent(
    evidenceId: string,
    roundId: string,
    event: ReadingReceiptClarificationStreamEvent,
  ) {
    if (event.type === 'agent_delta') {
      updateClarificationRound(evidenceId, roundId, (round) => ({
        ...round,
        draftOpinions: round.draftOpinions.map((opinion) =>
          opinion.agentId === event.agentId
            ? {
                ...opinion,
                rawText: opinion.rawText + event.delta,
                reason: readingReceiptClarificationReasonPreview(opinion.rawText + event.delta),
                state: 'streaming',
              }
            : opinion,
        ),
      }));
      return;
    }
    if (event.type === 'agent_start') {
      updateClarificationRound(evidenceId, roundId, (round) => ({
        ...round,
        draftOpinions: upsertClarificationDraftOpinion(round.draftOpinions, event.agent),
      }));
      return;
    }
    updateClarificationRound(evidenceId, roundId, (round) => ({
      ...round,
      opinions: [
        ...round.opinions.filter((opinion) => opinion.agentId !== event.opinion.agentId),
        event.opinion,
      ],
      draftOpinions: round.draftOpinions.filter(
        (opinion) => opinion.agentId !== event.opinion.agentId,
      ),
    }));
  }

  function resolveClarification(
    evidenceId: string,
    disposition: Exclude<ReadingReceiptBoardDisposition, 'clarify'>,
  ) {
    if (locked) return;
    const nextDispositionById = {
      ...receiptDispositionById,
      [evidenceId]: disposition,
    };
    onChangeDisposition(evidenceId, disposition);
    queueReadingReceiptStatePersistence({ receiptDispositionById: nextDispositionById });
    setActiveEvidenceId(null);
    setClarifyingEvidenceId(null);
  }

  return (
    <section className={locked ? 'reading-receipt-triage is-locked' : 'reading-receipt-triage'}>
      <header>
        <div>
          <span>{locked ? '拣选结果' : '拣选'}</span>
          <h4>{locked ? '已确认的阅读所得材料' : '把要进入阅读所得的材料确认下来'}</h4>
          <p>
            {locked
              ? '上一步的材料边界已锁定。可以查看批注，但不能再拖动或发起澄清讨论。'
              : '不确定的先留在待澄清。想清楚后拖到纳入或暂放；点开卡片可回到原文。'}
          </p>
        </div>
        <strong>
          {evidenceUnits.length - clarifyCount}/{evidenceUnits.length} 已确认
        </strong>
      </header>
      {evidenceUnits.length > 0 ? (
        <div
          className={[
            'reading-receipt-board',
            dragState ? 'is-dragging' : '',
            locked ? 'is-locked' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {groupedUnits.map((column, columnIndex) => {
            const visibleUnits = dragState
              ? column.units.filter((unit) => unit.id !== draggingEvidenceId)
              : column.units;
            const showLiveDropzone = Boolean(dragState && draggingDisposition !== column.value);
            return (
              <section
                aria-label={`${column.label}列`}
                className={[
                  `reading-receipt-board-column is-${column.value}`,
                  draggingDisposition === column.value ? 'is-source' : '',
                  dropReadyDisposition === column.value ? 'is-drop-ready' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={column.value}
                ref={(element) => setColumnElement(column.value, element)}
              >
                <header>
                  <div>
                    <span>{column.label}</span>
                    <p>{column.description}</p>
                  </div>
                  <strong>{visibleUnits.length}</strong>
                </header>
                <div className="reading-receipt-board-list">
                  {showLiveDropzone || visibleUnits.length === 0 ? (
                    <p
                      className={
                        showLiveDropzone
                          ? 'reading-receipt-board-dropzone is-live'
                          : 'reading-receipt-board-dropzone'
                      }
                    >
                      拖到这里
                    </p>
                  ) : null}
                  {visibleUnits.length > 0
                    ? visibleUnits.map((unit, unitIndex) => (
                        <ReadingReceiptBoardCard
                          active={activeEvidenceId === unit.id}
                          covered={
                            activeEvidenceId !== unit.id && unitIndex < visibleUnits.length - 1
                          }
                          disposition={column.value}
                          dragging={draggingEvidenceId === unit.id}
                          extractDirection={
                            columnIndex === receiptBoardColumns.length - 1 ? 'left' : 'right'
                          }
                          key={unit.id}
                          locked={locked}
                          stackIndex={unitIndex}
                          annotationAgents={annotationAgents}
                          addingAgentMenuOpen={addingClarificationAgentsForEvidenceId === unit.id}
                          clarifying={clarifyingEvidenceId === unit.id}
                          errorMessage={clarificationErrorByEvidenceId[unit.id] || ''}
                          expandedRoundId={expandedClarificationRoundByEvidenceId[unit.id] || ''}
                          fixedAgentIds={defaultClarificationAgentIds(unit, annotationAgents)}
                          loading={clarificationLoadingEvidenceId === unit.id}
                          rounds={clarificationRoundsByEvidenceId[unit.id] || []}
                          selectedAgentIds={clarificationAgentIdsByEvidenceId[unit.id] || []}
                          thought={clarificationThoughtByEvidenceId[unit.id] || ''}
                          thoughtOpen={Boolean(clarificationThoughtOpenByEvidenceId[unit.id])}
                          unit={unit}
                          userProfile={userProfile}
                          onChangeThought={changeClarificationThought}
                          onCloseAgentMenu={closeClarificationAgentMenu}
                          onDragCancel={cancelPendingDrag}
                          onDragStart={startDragging}
                          onOpenEvidence={onOpenEvidence}
                          onRunClarificationRound={runClarificationRound}
                          onResolveClarification={resolveClarification}
                          onStartThought={startClarificationThought}
                          onToggleActive={toggleActiveEvidence}
                          onToggleAgentMenu={toggleClarificationAgentMenu}
                          onToggleClarificationAgent={toggleClarificationAgent}
                          onToggleClarification={toggleClarification}
                          onToggleRound={toggleClarificationRound}
                        />
                      ))
                    : null}
                </div>
              </section>
            );
          })}
          {dragState && draggedUnit ? (
            <ReadingReceiptBoardCardPreview
              disposition={draggingDisposition || 'clarify'}
              state={dragState}
              unit={draggedUnit}
            />
          ) : null}
        </div>
      ) : (
        <p className="reading-card-placeholder">这篇文章还没有批注，可以直接生成轻量阅读所得。</p>
      )}
    </section>
  );
}

const receiptBoardColumns: Array<{
  value: ReadingReceiptBoardDisposition;
  label: string;
  description: string;
}> = [
  { value: 'clarify', label: '待澄清', description: '还没有完成材料判断' },
  { value: 'include', label: '纳入', description: '确认进入回执材料' },
  { value: 'exclude', label: '暂放', description: '本次不进入回执' },
];

function ReadingReceiptBoardCard({
  active,
  addingAgentMenuOpen,
  annotationAgents,
  clarifying,
  covered,
  disposition,
  dragging,
  errorMessage,
  expandedRoundId,
  extractDirection,
  fixedAgentIds,
  loading,
  locked,
  rounds,
  selectedAgentIds,
  stackIndex,
  thought,
  thoughtOpen,
  unit,
  userProfile,
  onChangeThought,
  onCloseAgentMenu,
  onDragCancel,
  onDragStart,
  onOpenEvidence,
  onRunClarificationRound,
  onResolveClarification,
  onStartThought,
  onToggleActive,
  onToggleAgentMenu,
  onToggleClarificationAgent,
  onToggleClarification,
  onToggleRound,
}: {
  active: boolean;
  addingAgentMenuOpen: boolean;
  annotationAgents: Agent[];
  clarifying: boolean;
  covered: boolean;
  disposition: ReadingReceiptBoardDisposition;
  dragging: boolean;
  errorMessage: string;
  expandedRoundId: string;
  extractDirection: 'left' | 'right';
  fixedAgentIds: string[];
  loading: boolean;
  locked: boolean;
  rounds: ReadingReceiptClarificationRound[];
  selectedAgentIds: string[];
  stackIndex: number;
  thought: string;
  thoughtOpen: boolean;
  unit: ReadingCardEvidenceUnit;
  userProfile: UserProfile;
  onChangeThought: (evidenceId: string, value: string) => void;
  onCloseAgentMenu: (evidenceId: string, event: React.FocusEvent<HTMLElement>) => void;
  onDragCancel: () => void;
  onDragStart: (evidenceId: string, geometry: ReadingReceiptDragGeometry) => void;
  onOpenEvidence: (annotationId: string) => void;
  onRunClarificationRound: (evidenceId: string, selectedAgentIds: string[]) => void;
  onResolveClarification: (
    evidenceId: string,
    disposition: Exclude<ReadingReceiptBoardDisposition, 'clarify'>,
  ) => void;
  onStartThought: (evidenceId: string) => void;
  onToggleActive: (evidenceId: string) => void;
  onToggleAgentMenu: (evidenceId: string) => void;
  onToggleClarificationAgent: (evidenceId: string, agentId: string) => void;
  onToggleClarification: (evidenceId: string) => void;
  onToggleRound: (evidenceId: string, roundId: string) => void;
}) {
  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (locked) return;
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest?.('button')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onDragStart(unit.id, {
      height: rect.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      sourceDisposition: disposition,
      width: rect.width,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function cancelDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    onDragCancel();
  }

  function toggleActive(event: React.MouseEvent<HTMLElement>) {
    event.stopPropagation();
    onToggleActive(unit.id);
  }

  function openEvidence(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onOpenEvidence(unit.id);
  }

  function toggleClarification(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (locked) return;
    onToggleClarification(unit.id);
  }

  function resolveClarification(
    nextDisposition: Exclude<ReadingReceiptBoardDisposition, 'clarify'>,
  ) {
    onResolveClarification(unit.id, nextDisposition);
  }

  function toggleClarificationAgent(agentId: string) {
    onToggleClarificationAgent(unit.id, agentId);
  }

  function toggleAgentMenu() {
    onToggleAgentMenu(unit.id);
  }

  function closeAgentMenu(event: React.FocusEvent<HTMLElement>) {
    onCloseAgentMenu(unit.id, event);
  }

  function changeThought(event: React.ChangeEvent<HTMLTextAreaElement>) {
    onChangeThought(unit.id, event.target.value);
  }

  function runClarificationRound(nextSelectedAgentIds: string[]) {
    void onRunClarificationRound(unit.id, nextSelectedAgentIds);
  }

  function startThought() {
    onStartThought(unit.id);
  }

  function toggleRound(roundId: string) {
    onToggleRound(unit.id, roundId);
  }

  return (
    <article
      aria-label={`批注卡片：${unit.quote}`}
      className={[
        `reading-receipt-board-card is-${disposition}`,
        active ? `is-active is-extract-${extractDirection}` : '',
        covered ? 'is-covered' : '',
        dragging ? 'is-dragging' : '',
        locked ? 'is-locked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ zIndex: active ? 80 : stackIndex + 1 }}
      onClick={active ? toggleActive : undefined}
      onPointerDown={startDrag}
      onPointerUp={cancelDrag}
    >
      <header className="reading-receipt-board-card-head" onClick={toggleActive}>
        <ReadingReceiptBoardCardHead unit={unit} />
      </header>
      <ReadingReceiptBoardCardFooter
        clarifying={clarifying}
        disposition={disposition}
        locked={locked}
        unit={unit}
        onToggleClarification={toggleClarification}
        onOpenEvidence={openEvidence}
      />
      {disposition === 'clarify' && clarifying && !locked ? (
        <ReadingReceiptClarificationPanel
          addingAgentMenuOpen={addingAgentMenuOpen}
          annotationAgents={annotationAgents}
          errorMessage={errorMessage}
          expandedRoundId={expandedRoundId}
          fixedAgentIds={fixedAgentIds}
          loading={loading}
          rounds={rounds}
          selectedAgentIds={selectedAgentIds}
          thought={thought}
          thoughtOpen={thoughtOpen}
          unit={unit}
          userProfile={userProfile}
          onChangeThought={changeThought}
          onCloseAgentMenu={closeAgentMenu}
          onResolve={resolveClarification}
          onRunRound={runClarificationRound}
          onStartThought={startThought}
          onToggleAgentMenu={toggleAgentMenu}
          onToggleAgent={toggleClarificationAgent}
          onToggleRound={toggleRound}
        />
      ) : null}
    </article>
  );
}

function ReadingReceiptBoardCardPreview({
  disposition,
  state,
  unit,
}: {
  disposition: ReadingReceiptBoardDisposition;
  state: ReadingReceiptDragGeometry;
  unit: ReadingCardEvidenceUnit;
}) {
  return (
    <article
      aria-hidden="true"
      className={`reading-receipt-board-card is-${disposition} is-floating is-dragging`}
      style={{
        height: state.height,
        left: state.x - state.offsetX,
        top: state.y - state.offsetY,
        width: state.width,
      }}
    >
      <header className="reading-receipt-board-card-head">
        <ReadingReceiptBoardCardHead unit={unit} />
      </header>
      <ReadingReceiptBoardCardFooter unit={unit} />
    </article>
  );
}

function ReadingReceiptBoardCardHead({ unit }: { unit: ReadingCardEvidenceUnit }) {
  return (
    <>
      <blockquote>{unit.quote}</blockquote>
      <AvatarImage
        value={unit.annotationAuthorAvatar}
        fallback={unit.annotationAuthorLabel.slice(0, 1) || '我'}
        className="reading-receipt-board-avatar"
      />
    </>
  );
}

function ReadingReceiptBoardCardFooter({
  clarifying = false,
  disposition,
  locked = false,
  unit,
  onToggleClarification,
  onOpenEvidence,
}: {
  clarifying?: boolean;
  disposition?: ReadingReceiptBoardDisposition;
  locked?: boolean;
  unit: ReadingCardEvidenceUnit;
  onToggleClarification?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenEvidence?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <footer>
      <div className="reading-receipt-board-card-labels">
        {unit.annotationType ? <ReadingCardAnnotationTypeChip unit={unit} /> : null}
        {unit.readingIntent ? <ReadingCardReadingIntentChip unit={unit} /> : null}
        {unit.questionStatus ? <span>{questionStatusLabel(unit.questionStatus)}</span> : null}
        {unit.comments.length > 0 ? <span>{unit.comments.length} 评论</span> : null}
      </div>
      <div className="reading-receipt-board-card-actions">
        {disposition === 'clarify' && !locked ? (
          <button
            className="reading-receipt-clarify-open"
            type="button"
            aria-label={`${clarifying ? '关闭讨论' : '澄清讨论'}：${unit.quote}`}
            onClick={onToggleClarification}
          >
            {clarifying ? '关闭讨论' : '澄清讨论'}
          </button>
        ) : null}
        <button
          className="reading-card-evidence-open"
          type="button"
          aria-label={`查看批注：${unit.quote}`}
          onClick={onOpenEvidence}
        >
          查看批注
        </button>
      </div>
    </footer>
  );
}

function ReadingReceiptClarificationPanel({
  addingAgentMenuOpen,
  annotationAgents,
  errorMessage,
  expandedRoundId,
  fixedAgentIds,
  loading,
  rounds,
  selectedAgentIds,
  thought,
  thoughtOpen,
  unit,
  userProfile,
  onChangeThought,
  onCloseAgentMenu,
  onResolve,
  onRunRound,
  onStartThought,
  onToggleAgentMenu,
  onToggleAgent,
  onToggleRound,
}: {
  addingAgentMenuOpen: boolean;
  annotationAgents: Agent[];
  errorMessage: string;
  expandedRoundId: string;
  fixedAgentIds: string[];
  loading: boolean;
  rounds: ReadingReceiptClarificationRound[];
  selectedAgentIds: string[];
  thought: string;
  thoughtOpen: boolean;
  unit: ReadingCardEvidenceUnit;
  userProfile: UserProfile;
  onChangeThought: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onCloseAgentMenu: (event: React.FocusEvent<HTMLElement>) => void;
  onResolve: (disposition: Exclude<ReadingReceiptBoardDisposition, 'clarify'>) => void;
  onRunRound: (selectedAgentIds: string[]) => void;
  onStartThought: () => void;
  onToggleAgentMenu: () => void;
  onToggleAgent: (agentId: string) => void;
  onToggleRound: (roundId: string) => void;
}) {
  const fixedAgentIdSet = new Set(fixedAgentIds);
  const selectedDiscussionAgentIds = Array.from(new Set([...fixedAgentIds, ...selectedAgentIds]));
  const selectedManualAgentIds = selectedAgentIds.filter((id) => !fixedAgentIdSet.has(id));
  const canRunFirstRound = rounds.length === 0 && selectedDiscussionAgentIds.length > 0 && !loading;
  const canRunNextRound =
    rounds.length > 0 &&
    selectedDiscussionAgentIds.length > 0 &&
    thought.trim().length > 0 &&
    !loading;
  const activeRoundId = expandedRoundId || rounds.at(-1)?.id || '';
  return (
    <section
      aria-label={`澄清讨论面板：${unit.quote}`}
      className="reading-receipt-clarify-panel"
      onClick={(event) => event.stopPropagation()}
    >
      <header>
        <span>发表观点</span>
        <p>成员各自判断这条材料该纳入还是暂放。观点不会自动决策，最后仍由你决定。</p>
      </header>
      <ReadingReceiptClarificationMembers
        addingAgentMenuOpen={addingAgentMenuOpen}
        agents={annotationAgents}
        fixedAgentIds={fixedAgentIds}
        selectedAgentIds={selectedManualAgentIds}
        userProfile={userProfile}
        onCloseAgentMenu={onCloseAgentMenu}
        onToggleAgent={onToggleAgent}
        onToggleAgentMenu={onToggleAgentMenu}
      />
      {rounds.length === 0 ? (
        <button
          className="reading-receipt-clarify-run"
          type="button"
          disabled={!canRunFirstRound}
          onClick={() => onRunRound(selectedDiscussionAgentIds)}
        >
          {loading ? '发表中...' : '发表观点'}
        </button>
      ) : null}
      {errorMessage ? <p className="reading-receipt-clarify-error">{errorMessage}</p> : null}
      {rounds.length > 0 ? (
        <ReadingReceiptClarificationRounds
          activeRoundId={activeRoundId}
          rounds={rounds}
          onToggleRound={onToggleRound}
        />
      ) : null}
      {rounds.length > 0 && !thoughtOpen ? (
        <button
          className="reading-receipt-clarify-run is-secondary"
          type="button"
          disabled={loading}
          onClick={onStartThought}
        >
          带着我的想法再发表观点
        </button>
      ) : null}
      {rounds.length > 0 && thoughtOpen ? (
        <div className="reading-receipt-clarify-thought">
          <label>
            <span>我的补充</span>
            <textarea
              value={thought}
              rows={3}
              placeholder="写下你的疑问、倾向或反例，下一轮助手会基于这段想法重新站队。"
              onChange={onChangeThought}
            />
          </label>
          <button
            className="reading-receipt-clarify-run"
            type="button"
            disabled={!canRunNextRound}
            onClick={() => onRunRound(selectedDiscussionAgentIds)}
          >
            {loading ? '发表中...' : '发表观点'}
          </button>
        </div>
      ) : null}
      <div className="reading-receipt-clarify-decisions">
        <button type="button" className="is-include" onClick={() => onResolve('include')}>
          我决定纳入
        </button>
        <button type="button" className="is-exclude" onClick={() => onResolve('exclude')}>
          我决定暂放
        </button>
      </div>
    </section>
  );
}

function ReadingReceiptClarificationMembers({
  addingAgentMenuOpen,
  agents,
  fixedAgentIds,
  selectedAgentIds,
  userProfile,
  onCloseAgentMenu,
  onToggleAgent,
  onToggleAgentMenu,
}: {
  addingAgentMenuOpen: boolean;
  agents: Agent[];
  fixedAgentIds: string[];
  selectedAgentIds: string[];
  userProfile: UserProfile;
  onCloseAgentMenu: (event: React.FocusEvent<HTMLElement>) => void;
  onToggleAgent: (agentId: string) => void;
  onToggleAgentMenu: () => void;
}) {
  const fixedAgentIdSet = new Set(fixedAgentIds);
  const selectedAgentIdSet = new Set([...fixedAgentIds, ...selectedAgentIds]);
  const fixedAgents = agents.filter((agent) => fixedAgentIdSet.has(agent.id));
  const selectedAgents = agents.filter(
    (agent) => selectedAgentIds.includes(agent.id) && !fixedAgentIdSet.has(agent.id),
  );
  const addableAgents = agents.filter((agent) => !selectedAgentIdSet.has(agent.id));
  return (
    <div className="reading-receipt-clarify-members" aria-label="讨论成员">
      <span>讨论成员</span>
      <div>
        <span className="reading-receipt-clarify-member-chip is-fixed">
          <AvatarImage
            value={userProfile.avatar}
            fallback={userProfile.nickname.slice(0, 1) || '我'}
            className="reading-receipt-clarify-avatar"
          />
          {userProfile.nickname || '我'}
        </span>
        {fixedAgents.map((agent) => (
          <span className="reading-receipt-clarify-member-chip is-fixed" key={agent.id}>
            <AvatarImage
              value={agent.avatar}
              fallback={agent.nickname.slice(0, 1) || '助'}
              className="reading-receipt-clarify-avatar"
            />
            {agent.nickname}
          </span>
        ))}
        <div className="reading-receipt-clarify-add-wrap" onBlur={onCloseAgentMenu}>
          <button
            className="reading-receipt-clarify-add"
            type="button"
            aria-expanded={addingAgentMenuOpen}
            onClick={onToggleAgentMenu}
          >
            <CircleUserRound size={15} />
            添加助手
          </button>
          {addingAgentMenuOpen ? (
            <div className="reading-receipt-clarify-add-menu">
              {addableAgents.length > 0 ? (
                addableAgents.map((agent) => (
                  <button
                    aria-label={agent.nickname}
                    key={agent.id}
                    type="button"
                    onClick={() => onToggleAgent(agent.id)}
                  >
                    <AvatarImage
                      value={agent.avatar}
                      fallback={agent.nickname.slice(0, 1) || '助'}
                      className="reading-receipt-clarify-avatar"
                    />
                    <strong>{agent.nickname}</strong>
                  </button>
                ))
              ) : (
                <em>暂无可添加助手</em>
              )}
            </div>
          ) : null}
        </div>
        {selectedAgents.map((agent) => (
          <button
            className="reading-receipt-clarify-member-chip"
            key={agent.id}
            type="button"
            onClick={() => onToggleAgent(agent.id)}
          >
            <AvatarImage
              value={agent.avatar}
              fallback={agent.nickname.slice(0, 1) || '助'}
              className="reading-receipt-clarify-avatar"
            />
            {agent.nickname}
            <X size={12} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ReadingReceiptClarificationRounds({
  activeRoundId,
  rounds,
  onToggleRound,
}: {
  activeRoundId: string;
  rounds: ReadingReceiptClarificationRound[];
  onToggleRound: (roundId: string) => void;
}) {
  return (
    <div className="reading-receipt-clarify-rounds">
      {rounds.map((round, index) => (
        <section
          className={activeRoundId === round.id ? 'is-expanded' : 'is-collapsed'}
          key={round.id}
        >
          <button type="button" onClick={() => onToggleRound(round.id)}>
            <strong>第 {index + 1} 轮</strong>
            <ReadingReceiptClarificationRoundSummary round={round} />
            {activeRoundId === round.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {activeRoundId === round.id ? (
            <>
              {round.userThought ? <q>{round.userThought}</q> : null}
              <div
                className={[
                  'reading-receipt-clarify-stance-grid',
                  round.draftOpinions.length > 0 ? 'has-drafts' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <ReadingReceiptClarificationStanceColumn
                  label="纳入"
                  opinions={round.opinions.filter((opinion) => opinion.stance === 'include')}
                />
                {round.draftOpinions.length > 0 ? (
                  <ReadingReceiptClarificationDraftColumn opinions={round.draftOpinions} />
                ) : null}
                <ReadingReceiptClarificationStanceColumn
                  label="暂放"
                  opinions={round.opinions.filter((opinion) => opinion.stance === 'exclude')}
                />
              </div>
            </>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function ReadingReceiptClarificationRoundSummary({
  round,
}: {
  round: ReadingReceiptClarificationRound;
}) {
  return (
    <span className="reading-receipt-clarify-round-summary">
      <span>
        纳入
        {round.opinions
          .filter((opinion) => opinion.stance === 'include')
          .map((opinion) => (
            <AvatarImage
              key={opinion.agentId}
              value={opinion.agentAvatar}
              fallback={opinion.agentNickname.slice(0, 1) || '助'}
              className="reading-receipt-clarify-avatar"
            />
          ))}
      </span>
      <span>
        暂放
        {round.opinions
          .filter((opinion) => opinion.stance === 'exclude')
          .map((opinion) => (
            <AvatarImage
              key={opinion.agentId}
              value={opinion.agentAvatar}
              fallback={opinion.agentNickname.slice(0, 1) || '助'}
              className="reading-receipt-clarify-avatar"
            />
          ))}
      </span>
      {round.draftOpinions.length > 0 ? <span>发表中 {round.draftOpinions.length}</span> : null}
    </span>
  );
}

function ReadingReceiptClarificationStanceColumn({
  label,
  opinions,
}: {
  label: string;
  opinions: ReadingReceiptClarificationOpinion[];
}) {
  return (
    <div>
      <span>{label}</span>
      {opinions.length > 0 ? (
        opinions.map((opinion) => (
          <article key={opinion.agentId}>
            <header>
              <AvatarImage
                value={opinion.agentAvatar}
                fallback={opinion.agentNickname.slice(0, 1) || '助'}
                className="reading-receipt-clarify-avatar"
              />
              <strong>{opinion.agentNickname}</strong>
            </header>
            <p>{opinion.reason}</p>
          </article>
        ))
      ) : (
        <p>这一轮没人站这边。</p>
      )}
    </div>
  );
}

function ReadingReceiptClarificationDraftColumn({
  opinions,
}: {
  opinions: ReadingReceiptClarificationDraftOpinion[];
}) {
  return (
    <div className="reading-receipt-clarify-drafts">
      <span>发表中</span>
      {opinions.map((opinion) => (
        <article key={opinion.agentId}>
          <header>
            <AvatarImage
              value={opinion.agentAvatar}
              fallback={opinion.agentNickname.slice(0, 1) || '助'}
              className="reading-receipt-clarify-avatar"
            />
            <strong>{opinion.agentNickname}</strong>
          </header>
          <p>
            {opinion.reason || (opinion.state === 'pending' ? '等待发表观点。' : '正在组织理由...')}
          </p>
        </article>
      ))}
    </div>
  );
}

function upsertClarificationDraftOpinion(
  draftOpinions: ReadingReceiptClarificationDraftOpinion[],
  agent: ReadingReceiptClarificationAgent,
) {
  if (draftOpinions.some((opinion) => opinion.agentId === agent.agentId)) return draftOpinions;
  return [
    ...draftOpinions,
    {
      ...agent,
      rawText: '',
      reason: '',
      state: 'pending' as const,
    },
  ];
}

function readingReceiptClarificationReasonPreview(rawText: string) {
  const reason = rawText.match(/"reason"\s*:\s*"((?:\\.|[^"\\])*)/s)?.[1];
  if (reason) {
    return reason.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').slice(0, 420);
  }
  const text = rawText.replace(/```(?:json)?|```/g, '').trim();
  if (!text || text.startsWith('{')) return '';
  return text.slice(0, 420);
}

function defaultClarificationAgentIds(unit: ReadingCardEvidenceUnit, agents: Agent[]) {
  const byId = new Map(agents.map((agent) => [agent.id, agent.id]));
  const byUsername = new Map(agents.map((agent) => [agent.username, agent.id]));
  const ids = new Set<string>();

  function collect(agentId?: string, agentUsername?: string) {
    const id = (agentId && byId.get(agentId)) || (agentUsername && byUsername.get(agentUsername));
    if (id) ids.add(id);
  }

  if (unit.annotationAuthor === 'ai') {
    collect(unit.annotationAgentId, unit.annotationAgentUsername);
  }
  if (unit.annotationBody?.author === 'ai') {
    collect(unit.annotationBody.agentId, unit.annotationBody.agentUsername);
  }
  for (const comment of unit.comments) {
    if (comment.author === 'ai') collect(comment.agentId, comment.agentUsername);
  }

  return Array.from(ids);
}

type ReadingReceiptStateBuildInput = {
  clarificationAgentIdsByEvidenceId: Record<string, string[]>;
  clarificationRoundsByEvidenceId: Record<string, ReadingReceiptClarificationRound[]>;
  clarificationThoughtByEvidenceId: Record<string, string>;
  evidenceUnits: ReadingCardEvidenceUnit[];
  receiptDispositionById: Record<string, ReadingReceiptBoardDisposition>;
  sourceUpdatedAt: string;
};

function buildPersistedReadingReceiptState(input: ReadingReceiptStateBuildInput) {
  const clarifications = input.evidenceUnits.flatMap((unit) => {
    const selectedAgentIds = input.clarificationAgentIdsByEvidenceId[unit.id] || [];
    const rounds = (input.clarificationRoundsByEvidenceId[unit.id] || [])
      .map((round) => ({
        id: round.id,
        userThought: round.userThought,
        opinions: round.opinions,
      }))
      .filter((round) => round.opinions.length > 0 || round.userThought.trim().length > 0);
    const thought = input.clarificationThoughtByEvidenceId[unit.id] || '';
    if (selectedAgentIds.length === 0 && rounds.length === 0 && !thought.trim()) return [];
    return [
      {
        evidenceId: unit.id,
        selectedAgentIds,
        rounds,
        thought: thought.trim() ? thought : undefined,
      },
    ];
  });
  return {
    sourceUpdatedAt: input.sourceUpdatedAt,
    dispositions: input.evidenceUnits.map((unit) => ({
      evidenceId: unit.id,
      disposition: normalizePersistedReceiptDisposition(input.receiptDispositionById[unit.id]),
    })),
    clarifications,
    updatedAt: new Date().toISOString(),
  } satisfies ReadingReceiptState;
}

function readingReceiptHydratedAgentIds(
  state: ReadingReceiptState | null,
  evidenceUnits: ReadingCardEvidenceUnit[],
) {
  if (!state) return {};
  return Object.fromEntries(
    evidenceUnits.map((unit) => {
      const clarification = state.clarifications.find((item) => item.evidenceId === unit.id);
      return [unit.id, clarification?.selectedAgentIds || []];
    }),
  );
}

function readingReceiptHydratedRounds(
  state: ReadingReceiptState | null,
  evidenceUnits: ReadingCardEvidenceUnit[],
): Record<string, ReadingReceiptClarificationRound[]> {
  if (!state) return {};
  return Object.fromEntries(
    evidenceUnits.map((unit) => {
      const clarification = state.clarifications.find((item) => item.evidenceId === unit.id);
      return [
        unit.id,
        (clarification?.rounds || []).map((round) => ({
          id: round.id,
          userThought: round.userThought,
          opinions: round.opinions,
          draftOpinions: [],
        })),
      ];
    }),
  );
}

function readingReceiptHydratedThoughts(
  state: ReadingReceiptState | null,
  evidenceUnits: ReadingCardEvidenceUnit[],
) {
  if (!state) return {};
  return Object.fromEntries(
    evidenceUnits.map((unit) => {
      const clarification = state.clarifications.find((item) => item.evidenceId === unit.id);
      return [unit.id, clarification?.thought || ''];
    }),
  );
}

function readingReceiptHydratedThoughtOpen(
  state: ReadingReceiptState | null,
  evidenceUnits: ReadingCardEvidenceUnit[],
) {
  if (!state) return {};
  return Object.fromEntries(
    evidenceUnits.map((unit) => {
      const clarification = state.clarifications.find((item) => item.evidenceId === unit.id);
      return [unit.id, Boolean(clarification?.thought?.trim())];
    }),
  );
}

function readingReceiptHydratedExpandedRounds(
  state: ReadingReceiptState | null,
  evidenceUnits: ReadingCardEvidenceUnit[],
) {
  if (!state) return {};
  return Object.fromEntries(
    evidenceUnits.map((unit) => {
      const clarification = state.clarifications.find((item) => item.evidenceId === unit.id);
      return [unit.id, clarification?.rounds.at(-1)?.id || ''];
    }),
  );
}

function normalizePersistedReceiptDisposition(
  disposition: ReadingReceiptBoardDisposition | undefined,
) {
  return disposition === 'include' || disposition === 'exclude' ? disposition : 'clarify';
}

function dropDispositionForDrag(
  columnElements: Map<ReadingReceiptBoardDisposition, HTMLElement>,
  dragGeometry: ReadingReceiptDragGeometry,
) {
  let bestDisposition: ReadingReceiptBoardDisposition | null = null;
  let bestOverlap = 0;
  for (const column of receiptBoardColumns) {
    if (column.value === dragGeometry.sourceDisposition) continue;
    const element = columnElements.get(column.value);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0) return column.value;
    const overlap = dragColumnOverlap(rect, dragGeometry);
    if (overlap >= 0.5 && overlap > bestOverlap) {
      bestDisposition = column.value;
      bestOverlap = overlap;
    }
  }
  return bestDisposition;
}

function dragColumnOverlap(rect: DOMRect, dragGeometry: ReadingReceiptDragGeometry) {
  if (dragGeometry.width <= 0) return 0;
  const cardLeft = dragGeometry.x - dragGeometry.offsetX;
  const cardRight = cardLeft + dragGeometry.width;
  const cardTop = dragGeometry.y - dragGeometry.offsetY;
  const cardBottom = cardTop + dragGeometry.height;
  const verticalOverlap = Math.max(
    0,
    Math.min(cardBottom, rect.bottom) - Math.max(cardTop, rect.top),
  );
  if (verticalOverlap <= 0) return 0;
  const overlap = Math.max(0, Math.min(cardRight, rect.right) - Math.max(cardLeft, rect.left));
  return overlap / dragGeometry.width;
}

export function ReadingCardEvidencePanel({
  evidenceUnits,
  readingCard,
  receiptDispositionById,
  onChangeDisposition,
  onOpenEvidence,
}: {
  evidenceUnits: ReadingCardEvidenceUnit[];
  readingCard: ReadingCardRecord | null;
  receiptDispositionById: Record<string, ReadingReceiptBoardDisposition>;
  onChangeDisposition: (evidenceId: string, disposition: ReadingReceiptBoardDisposition) => void;
  onOpenEvidence: (annotationId: string) => void;
}) {
  const workbench = useMemo(
    () => buildReadingReceiptWorkbench(evidenceUnits, readingCard, receiptDispositionById),
    [evidenceUnits, readingCard, receiptDispositionById],
  );

  return (
    <section className="reading-card-evidence-section">
      <header>
        <div>
          <span>材料去向</span>
          <h4>每条痕迹如何进入回执</h4>
        </div>
        <strong>
          {workbench.includeCount}/{evidenceUnits.length}
        </strong>
      </header>
      <p className="reading-card-evidence-section-note">
        只有纳入的痕迹会进入本次回执；暂放的痕迹会留在阅读现场，但不参与这次生成。
      </p>
      {evidenceUnits.length > 0 ? (
        <div className="reading-card-evidence-list">
          {workbench.units.map(({ disposition, treatment, unit }) => (
            <ReadingCardEvidence
              disposition={disposition}
              treatment={treatment}
              unit={unit}
              key={unit.id}
              onChangeDisposition={onChangeDisposition}
              onOpenEvidence={onOpenEvidence}
            />
          ))}
        </div>
      ) : (
        <p className="reading-card-placeholder">暂无</p>
      )}
    </section>
  );
}

function ReadingCardEvidence({
  disposition,
  unit,
  treatment,
  onChangeDisposition,
  onOpenEvidence,
}: {
  disposition: ReadingReceiptBoardDisposition;
  unit: ReadingCardEvidenceUnit;
  treatment: ReadingReceiptEvidenceTreatment;
  onChangeDisposition: (evidenceId: string, disposition: ReadingReceiptBoardDisposition) => void;
  onOpenEvidence: (annotationId: string) => void;
}) {
  return (
    <article className={`reading-card-evidence is-${treatment.kind}`}>
      <header>
        <div className="reading-card-evidence-heading">
          <div className="reading-card-evidence-chips">
            {unit.annotationType ? <ReadingCardAnnotationTypeChip unit={unit} /> : null}
            {unit.questionStatus ? <span>{questionStatusLabel(unit.questionStatus)}</span> : null}
            <span>{unit.annotationAuthorLabel}</span>
          </div>
          <time>{formatDateTime(unit.createdAt)}</time>
        </div>
        <span className="reading-card-evidence-treatment">{treatment.label}</span>
      </header>
      <blockquote>{unit.quote}</blockquote>
      <p className="reading-card-evidence-hint">{treatment.hint}</p>
      {unit.annotationBody || unit.comments.length > 0 ? (
        <div className="reading-card-thread">
          {unit.annotationBody ? (
            <div className="reading-card-comment">
              <strong>{unit.annotationBody.authorLabel} · 批注</strong>
              {unit.annotationBody.questionStatus ? (
                <span>{questionStatusLabel(unit.annotationBody.questionStatus)}</span>
              ) : null}
              <p>{unit.annotationBody.content}</p>
            </div>
          ) : null}
          {unit.comments.map((comment) => (
            <div className="reading-card-comment" key={comment.id}>
              <strong>{comment.authorLabel} · 评论</strong>
              {comment.questionStatus ? (
                <span>{questionStatusLabel(comment.questionStatus)}</span>
              ) : null}
              <p>{comment.content}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="reading-card-evidence-actions">
        <ReadingReceiptDispositionControl
          disposition={disposition}
          unit={unit}
          onChangeDisposition={onChangeDisposition}
        />
        <button
          className="reading-card-evidence-open"
          type="button"
          aria-label={`回到批注：${unit.quote}`}
          onClick={() => onOpenEvidence(unit.id)}
        >
          回到批注
        </button>
      </div>
    </article>
  );
}

const receiptDispositionOptions: Array<{
  value: ReadingReceiptDisposition;
  label: string;
}> = [
  { value: 'include', label: '纳入' },
  { value: 'exclude', label: '暂放' },
];

function ReadingReceiptDispositionControl({
  disposition,
  unit,
  onChangeDisposition,
}: {
  disposition: ReadingReceiptBoardDisposition;
  unit: ReadingCardEvidenceUnit;
  onChangeDisposition: (evidenceId: string, disposition: ReadingReceiptBoardDisposition) => void;
}) {
  return (
    <div className="reading-receipt-disposition-control" aria-label={`处理批注：${unit.quote}`}>
      {receiptDispositionOptions.map((option) => (
        <button
          className={
            option.value === disposition ? `is-active is-${option.value}` : `is-${option.value}`
          }
          type="button"
          aria-label={`${option.label}：${unit.quote}`}
          aria-pressed={option.value === disposition}
          key={option.value}
          onClick={() => onChangeDisposition(unit.id, option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ReadingCardAnnotationTypeChip({ unit }: { unit: ReadingCardEvidenceUnit }) {
  const Icon = unit.annotationTypeKey ? annotationTypeIcons[unit.annotationTypeKey] : null;
  return (
    <span>
      {Icon ? (
        <Icon
          aria-hidden="true"
          className="reading-card-evidence-chip-icon"
          focusable="false"
          size={12}
          strokeWidth={2.4}
        />
      ) : null}
      {unit.annotationType}
    </span>
  );
}

function ReadingCardReadingIntentChip({ unit }: { unit: ReadingCardEvidenceUnit }) {
  const Icon = unit.readingIntentKey ? readingIntentIcons[unit.readingIntentKey] : null;
  return (
    <span className="reading-receipt-board-card-intent">
      {Icon ? (
        <Icon
          aria-hidden="true"
          className="reading-card-evidence-chip-icon"
          focusable="false"
          size={12}
          strokeWidth={2.4}
        />
      ) : null}
      {unit.readingIntent}
    </span>
  );
}

export function ReadingCardDeck({
  article,
  evidenceUnits,
  isCurrent,
  readingCard,
  receiptDispositionById,
  retryingReviewerId,
  sourceUpdatedAt,
  stats,
  userJudgment,
  onOpenEvidence,
  onRetryReviewer,
}: {
  article: ArticleRecord;
  evidenceUnits: ReadingCardEvidenceUnit[];
  isCurrent: boolean;
  readingCard: ReadingCardRecord;
  receiptDispositionById: Record<string, ReadingReceiptBoardDisposition>;
  retryingReviewerId: string | null;
  sourceUpdatedAt: string | null;
  stats: ReturnType<typeof buildReadingCardStats> | null;
  userJudgment: string;
  onOpenEvidence: (annotationId: string) => void;
  onRetryReviewer: (reviewerId: string) => void;
}) {
  const sections = normalizeReadingCardViewSections(readingCard);
  const receiptSections = normalizeReadingReceiptSections(sections);
  const evidenceByIndex = useMemo(
    () => new Map(evidenceUnits.map((unit) => [unit.index, unit])),
    [evidenceUnits],
  );
  const workbench = useMemo(
    () => buildReadingReceiptWorkbench(evidenceUnits, readingCard, receiptDispositionById),
    [evidenceUnits, readingCard, receiptDispositionById],
  );

  return (
    <div className="reading-card-deck reading-receipt-deck">
      <section className="reading-card-cover reading-receipt-cover">
        <div>
          <span>读后回执</span>
          <h4>{article.title}</h4>
          <p>把这次阅读留下的停顿、判断和问题收成一个可回看的结果。</p>
        </div>
        <dl>
          <div>
            <dt>批注</dt>
            <dd>{stats?.annotations ?? 0}</dd>
          </div>
          <div>
            <dt>讨论</dt>
            <dd>{stats?.comments ?? 0}</dd>
          </div>
          <div>
            <dt>助手</dt>
            <dd>{stats?.aiContributions ?? 0}</dd>
          </div>
        </dl>
        <p>
          {readingCard.providerName || '任务供应商'} · {readingCard.modelName || '模型未记录'} ·{' '}
          {formatDate(readingCard.updatedAt)}
        </p>
      </section>

      <ReadingReceiptUserJudgmentPanel userJudgment={userJudgment} />

      <ReadingReceiptWorkbenchPanel
        isCurrent={isCurrent}
        readingCard={readingCard}
        sourceUpdatedAt={sourceUpdatedAt}
        workbench={workbench}
        onOpenEvidence={onOpenEvidence}
      />

      {readingCard.review ? (
        <ReadingCardReviewPanel
          evidenceUnits={evidenceUnits}
          retryingReviewerId={retryingReviewerId}
          review={readingCard.review}
          onOpenEvidence={onOpenEvidence}
          onRetryReviewer={onRetryReviewer}
        />
      ) : null}

      <ReadingReceiptMarkdownSection
        className="reading-receipt-takeaway"
        evidenceByIndex={evidenceByIndex}
        eyebrow="一句话带走"
        fallback="这份回执还没有提炼出一句话带走。"
        section={receiptSections.takeaway}
        title="这次阅读最后留下的判断"
        onOpenEvidence={onOpenEvidence}
      />

      <div className="reading-receipt-grid">
        <ReadingReceiptMarkdownSection
          className="reading-receipt-trace"
          evidenceByIndex={evidenceByIndex}
          eyebrow="我停下来的地方"
          fallback="暂无停顿记录。"
          section={receiptSections.trace}
          title="阅读现场"
          onOpenEvidence={onOpenEvidence}
        />
        <ReadingReceiptInsightSection
          evidenceByIndex={evidenceByIndex}
          section={receiptSections.insight}
          onOpenEvidence={onOpenEvidence}
        />
        <ReadingReceiptMarkdownSection
          className="reading-receipt-questions"
          evidenceByIndex={evidenceByIndex}
          eyebrow="还没想通的问题"
          fallback="暂无未决问题。"
          section={receiptSections.questions}
          title="继续想的线索"
          onOpenEvidence={onOpenEvidence}
        />
      </div>

      <details className="reading-receipt-draft" open>
        <summary>
          <span>可保存成稿</span>
          <strong>展开 Markdown 笔记</strong>
        </summary>
        <div>
          {(receiptSections.draft.length > 0 ? receiptSections.draft : sections).map((section) => (
            <ReadingCardSectionCard
              evidenceUnits={evidenceUnits}
              section={section}
              key={section.title}
              onOpenEvidence={onOpenEvidence}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function ReadingReceiptUserJudgmentPanel({ userJudgment }: { userJudgment: string }) {
  const trimmedJudgment = userJudgment.trim();
  if (!trimmedJudgment) return null;

  return (
    <section className="reading-receipt-user-judgment">
      <header>
        <span>我的补充判断</span>
        <h4>节点 2 确认的主轴</h4>
      </header>
      <p>{trimmedJudgment}</p>
    </section>
  );
}

function ReadingReceiptWorkbenchPanel({
  isCurrent,
  readingCard,
  sourceUpdatedAt,
  workbench,
  onOpenEvidence,
}: {
  isCurrent: boolean;
  readingCard: ReadingCardRecord;
  sourceUpdatedAt: string | null;
  workbench: ReadingReceiptWorkbench;
  onOpenEvidence: (annotationId: string) => void;
}) {
  const newUnits = workbench.units
    .filter(({ treatment }) => treatment.kind === 'new')
    .map(({ unit }) => unit);
  const openQuestionCount = workbench.units.filter(
    ({ treatment }) => treatment.kind === 'open',
  ).length;

  return (
    <section
      className={isCurrent ? 'reading-receipt-workbench' : 'reading-receipt-workbench is-stale'}
    >
      <header>
        <span>{isCurrent ? '已同步' : '待更新'}</span>
        <div>
          <h4>{isCurrent ? '这份回执已纳入当前阅读痕迹' : '阅读现场有新变化'}</h4>
          <p>
            {isCurrent
              ? '下面每条痕迹都会标明它在回执中的去向。'
              : '这些新批注或评论还没有进入当前回执，需要先重新生成阅读所得，再重新打磨。'}
          </p>
        </div>
      </header>
      <dl>
        <div>
          <dt>已引用</dt>
          <dd>
            {workbench.includedCount}/{workbench.totalCount}
          </dd>
        </div>
        <div>
          <dt>纳入</dt>
          <dd>{workbench.includeCount}</dd>
        </div>
        <div>
          <dt>未决问题</dt>
          <dd>{openQuestionCount}</dd>
        </div>
        <div>
          <dt>暂放</dt>
          <dd>{workbench.excludeCount}</dd>
        </div>
        <div>
          <dt>最近生成</dt>
          <dd>{formatDate(readingCard.updatedAt)}</dd>
        </div>
      </dl>
      {newUnits.length > 0 ? (
        <div className="reading-receipt-workbench-new">
          <strong>还没纳入的阅读动作</strong>
          {newUnits.slice(0, 3).map((unit) => (
            <button type="button" key={unit.id} onClick={() => onOpenEvidence(unit.id)}>
              <q>{unit.quote}</q>
            </button>
          ))}
        </div>
      ) : (
        <p>
          {sourceUpdatedAt
            ? `阅读痕迹同步到 ${formatDate(sourceUpdatedAt)}。`
            : '当前没有新的阅读痕迹等待处理。'}
        </p>
      )}
    </section>
  );
}

function ReadingReceiptMarkdownSection({
  className,
  evidenceByIndex,
  eyebrow,
  fallback,
  section,
  title,
  onOpenEvidence,
}: {
  className: string;
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>;
  eyebrow: string;
  fallback: string;
  section: PersistedReadingCardSection | null;
  title: string;
  onOpenEvidence: (annotationId: string) => void;
}) {
  function openEvidence(event: React.MouseEvent<HTMLDivElement>) {
    openReadingCardEvidence(event, evidenceByIndex, onOpenEvidence);
  }

  return (
    <section className={`reading-receipt-block ${className}`}>
      <header>
        <span>{eyebrow}</span>
        <h4>{title}</h4>
      </header>
      <div
        className="reading-card-markdown"
        dangerouslySetInnerHTML={{
          __html: renderReadingCardMarkdown(section?.content || fallback, evidenceByIndex),
        }}
        onClick={openEvidence}
      />
    </section>
  );
}

function ReadingReceiptInsightSection({
  evidenceByIndex,
  section,
  onOpenEvidence,
}: {
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>;
  section: PersistedReadingCardSection | null;
  onOpenEvidence: (annotationId: string) => void;
}) {
  const blocks = section ? splitReadingCardSection(section.content) : [];
  const cards =
    blocks.length >= 3
      ? blocks.slice(0, 3)
      : ['改变', '确认', '怀疑'].map((title, index) => ({
          title,
          content: blocks[index]?.content || '暂无',
        }));

  function openEvidence(event: React.MouseEvent<HTMLDivElement>) {
    openReadingCardEvidence(event, evidenceByIndex, onOpenEvidence);
  }

  return (
    <section className="reading-receipt-block reading-receipt-insights">
      <header>
        <span>改变 / 确认 / 怀疑</span>
        <h4>这篇文章对我产生了什么影响</h4>
      </header>
      <div className="reading-receipt-insight-grid" onClick={openEvidence}>
        {cards.map((block, index) => (
          <article key={`${block.title}-${index}`}>
            <strong>{block.title}</strong>
            <div
              className="reading-card-markdown"
              dangerouslySetInnerHTML={{
                __html: renderReadingCardMarkdown(block.content, evidenceByIndex),
              }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function normalizeReadingReceiptSections(sections: PersistedReadingCardSection[]) {
  const takeaway = findReadingCardSection(sections, ['一句话带走', '核心主张']);
  const trace = findReadingCardSection(sections, [
    '我停下来的地方',
    '我关注了什么',
    '讨论中浮现了什么',
  ]);
  const insight = findReadingCardSection(sections, [
    '改变 / 确认 / 怀疑',
    '改变／确认／怀疑',
    '改变、确认、怀疑',
    '可复用洞见',
  ]);
  const questions = findReadingCardSection(sections, [
    '还没想通的问题',
    '还没收束的问题',
    '未收束问题',
    '后续问题',
    '后续行动线索',
  ]);
  const reserved = new Set(
    [takeaway, trace, insight, questions].filter(
      (section): section is PersistedReadingCardSection => section !== null,
    ),
  );
  const explicitDraft = findReadingCardSection(sections, ['可保存成稿', '保存成稿']);
  const draft = explicitDraft
    ? [explicitDraft]
    : sections.filter((section) => !reserved.has(section));

  return {
    takeaway,
    trace,
    insight,
    questions,
    draft,
  };
}

type ReadingReceiptEvidenceTreatmentKind =
  | 'included'
  | 'new'
  | 'open'
  | 'answered'
  | 'parked'
  | 'exclude'
  | 'unreferenced'
  | 'clarify';

type ReadingReceiptEvidenceTreatment = {
  kind: ReadingReceiptEvidenceTreatmentKind;
  label: string;
  hint: string;
};

type ReadingReceiptWorkbench = {
  totalCount: number;
  includedCount: number;
  includeCount: number;
  excludeCount: number;
  clarifyCount: number;
  units: Array<{
    disposition: ReadingReceiptBoardDisposition;
    unit: ReadingCardEvidenceUnit;
    treatment: ReadingReceiptEvidenceTreatment;
  }>;
};

function buildReadingReceiptWorkbench(
  evidenceUnits: ReadingCardEvidenceUnit[],
  readingCard: ReadingCardRecord | null,
  dispositionById: Record<string, ReadingReceiptBoardDisposition> = {},
): ReadingReceiptWorkbench {
  const includedIndexes = collectReadingReceiptEvidenceIndexes(readingCard);
  const units = evidenceUnits.map((unit) => {
    const disposition = dispositionById[unit.id] || 'clarify';
    return {
      disposition,
      unit,
      treatment: readingReceiptEvidenceTreatment(unit, includedIndexes, readingCard, disposition),
    };
  });

  return {
    totalCount: evidenceUnits.length,
    includedCount: evidenceUnits.filter((unit) => includedIndexes.has(unit.index)).length,
    includeCount: units.filter((entry) => entry.disposition === 'include').length,
    excludeCount: units.filter((entry) => entry.disposition === 'exclude').length,
    clarifyCount: units.filter((entry) => entry.disposition === 'clarify').length,
    units,
  };
}

function collectReadingReceiptEvidenceIndexes(readingCard: ReadingCardRecord | null) {
  const indexes = new Set<number>();
  if (!readingCard) return indexes;

  const source = [
    readingCard.contentMarkdown,
    ...readingCard.sections.map((section) => section.content),
  ].join('\n');

  for (const match of source.matchAll(/\[#(\d+)\]|#(\d+)/g)) {
    indexes.add(Number(match[1] || match[2]));
  }

  return indexes;
}

function readingReceiptEvidenceTreatment(
  unit: ReadingCardEvidenceUnit,
  includedIndexes: Set<number>,
  readingCard: ReadingCardRecord | null,
  disposition: ReadingReceiptBoardDisposition,
): ReadingReceiptEvidenceTreatment {
  const included = includedIndexes.has(unit.index);

  if (disposition === 'clarify') {
    return {
      kind: 'clarify',
      label: '待澄清',
      hint: '还没有完成材料判断；确认后放入纳入或暂放。',
    };
  }

  if (disposition === 'exclude') {
    return {
      kind: 'exclude',
      label: '暂不放入',
      hint: '本次阅读所得不会使用这条痕迹。',
    };
  }

  if (readingCard && latestEvidenceTimestamp(unit) > timestamp(readingCard.updatedAt)) {
    return {
      kind: 'new',
      label: '新内容',
      hint: '这条痕迹晚于当前回执，重新生成阅读所得后才会被纳入。',
    };
  }

  if (evidenceHasQuestionStatus(unit, 'open')) {
    return {
      kind: 'open',
      label: '待追问',
      hint: included ? '回执已引用，但问题还没有想通。' : '这条痕迹会进入未决问题。',
    };
  }

  if (included) {
    return {
      kind: 'included',
      label: '已入回执',
      hint: '当前回执已经引用这条痕迹。',
    };
  }

  if (evidenceHasQuestionStatus(unit, 'answered')) {
    return {
      kind: 'answered',
      label: '已想通',
      hint: '问题已关闭，必要时可在成稿里保留结论。',
    };
  }

  if (evidenceHasQuestionStatus(unit, 'parked')) {
    return {
      kind: 'parked',
      label: '先放一放',
      hint: '这条线索暂不推进，回执可以只保留一个提醒。',
    };
  }

  if (readingCard) {
    return {
      kind: 'unreferenced',
      label: '未入回执',
      hint: '当前回执还没有引用它，可重新生成阅读所得或暂放。',
    };
  }

  return {
    kind: 'clarify',
    label: '待澄清',
    hint: '确认材料边界后，放入纳入或暂放。',
  };
}

function evidenceHasQuestionStatus(
  unit: ReadingCardEvidenceUnit,
  status: 'open' | 'answered' | 'parked',
) {
  return (
    unit.questionStatus === status ||
    unit.annotationBody?.questionStatus === status ||
    unit.comments.some((comment) => comment.questionStatus === status)
  );
}

function latestEvidenceTimestamp(unit: ReadingCardEvidenceUnit) {
  return Math.max(
    timestamp(unit.createdAt),
    timestamp(unit.updatedAt),
    unit.annotationBody ? timestamp(unit.annotationBody.createdAt) : 0,
    ...unit.comments.map((comment) => timestamp(comment.createdAt)),
  );
}

function timestamp(value: string) {
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : 0;
}

function findReadingCardSection(sections: PersistedReadingCardSection[], titles: string[]) {
  return (
    sections.find((section) =>
      titles.some((title) => section.title.trim().toLowerCase() === title.toLowerCase()),
    ) || null
  );
}

function ReadingCardSectionCard({
  evidenceUnits,
  section,
  onOpenEvidence,
}: {
  evidenceUnits: ReadingCardEvidenceUnit[];
  section: PersistedReadingCardSection;
  onOpenEvidence: (annotationId: string) => void;
}) {
  const blocks = splitReadingCardSection(section.content);
  const isCore = section.title === '核心主张' || section.title === '一句话带走';
  const evidenceByIndex = useMemo(
    () => new Map(evidenceUnits.map((unit) => [unit.index, unit])),
    [evidenceUnits],
  );

  function openEvidence(event: React.MouseEvent<HTMLDivElement>) {
    openReadingCardEvidence(event, evidenceByIndex, onOpenEvidence);
  }

  return (
    <section className={isCore ? 'reading-card-section-card is-core' : 'reading-card-section-card'}>
      <header>
        <span>{readingCardSectionIndex(section.title)}</span>
        <h4>{section.title}</h4>
      </header>
      {blocks.map((block, index) => (
        <article
          className={block.title ? 'reading-card-mini-card has-title' : 'reading-card-mini-card'}
          key={`${section.title}-${block.title || index}`}
        >
          {block.title ? <h5>{block.title}</h5> : null}
          <div
            className="reading-card-markdown"
            dangerouslySetInnerHTML={{
              __html: renderReadingCardMarkdown(block.content, evidenceByIndex),
            }}
            onClick={openEvidence}
          />
        </article>
      ))}
    </section>
  );
}

function normalizeReadingCardViewSections(
  readingCard: ReadingCardRecord,
): PersistedReadingCardSection[] {
  if (readingCard.sections.length > 0) return readingCard.sections;
  return parseReadingCardMarkdownSections(readingCard.contentMarkdown);
}
