import React, { useMemo } from 'react';
import {
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
  type LucideIcon,
} from 'lucide-react';
import type {
  AgentReadingIntent,
  AnnotationType,
  ArticleRecord,
  ReadingCardRecord,
  ReadingCardSection as PersistedReadingCardSection,
  ReadingDeliberationRecord,
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

export type ReadingReceiptBoardDisposition = ReadingReceiptDisposition | 'pending';

type ReadingReceiptDragGeometry = {
  height: number;
  offsetX: number;
  offsetY: number;
  sourceDisposition: ReadingReceiptBoardDisposition;
  width: number;
  x: number;
  y: number;
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
  deliberation,
  evidenceUnits,
  onOpenEvidence,
}: {
  deliberation: ReadingDeliberationRecord;
  evidenceUnits: ReadingCardEvidenceUnit[];
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
          <span>收束草稿</span>
          <h4>{deliberation.title}</h4>
        </div>
        <time>{formatDate(deliberation.updatedAt)}</time>
      </header>
      <div className="reading-deliberation-sections" onClick={openEvidence}>
        {sections.map((section) => (
          <article key={section.title}>
            <h5>{section.title}</h5>
            <div
              className="reading-card-markdown"
              dangerouslySetInnerHTML={{
                __html: renderReadingCardMarkdown(section.content, evidenceByIndex),
              }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

export function ReadingReceiptTriageBoard({
  evidenceUnits,
  receiptDispositionById,
  onChangeDisposition,
  onOpenEvidence,
}: {
  evidenceUnits: ReadingCardEvidenceUnit[];
  receiptDispositionById: Record<string, ReadingReceiptBoardDisposition>;
  onChangeDisposition: (evidenceId: string, disposition: ReadingReceiptBoardDisposition) => void;
  onOpenEvidence: (annotationId: string) => void;
}) {
  const [activeEvidenceId, setActiveEvidenceId] = React.useState<string | null>(null);
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
  const suppressNextClickRef = React.useRef(false);
  const groupedUnits = useMemo(
    () =>
      receiptBoardColumns.map((column) => ({
        ...column,
        units: evidenceUnits.filter(
          (unit) => (receiptDispositionById[unit.id] || 'pending') === column.value,
        ),
      })),
    [evidenceUnits, receiptDispositionById],
  );
  const pendingCount = groupedUnits.find((column) => column.value === 'pending')?.units.length ?? 0;
  const draggingDisposition = draggingEvidenceId
    ? receiptDispositionById[draggingEvidenceId] || 'pending'
    : null;
  const draggedUnit = draggingEvidenceId
    ? evidenceUnits.find((unit) => unit.id === draggingEvidenceId) || null
    : null;

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
          onChangeDisposition(current.evidenceId, targetDisposition);
          setActiveEvidenceId(null);
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
  }, [onChangeDisposition]);

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
  }

  return (
    <section className="reading-receipt-triage">
      <header>
        <div>
          <span>收束阅读</span>
          <h4>把这次阅读留下的批注归类</h4>
          <p>拖动卡片到纳入、追问或暂放。需要看完整上下文时展开卡片，或回到原文里的批注。</p>
        </div>
        <strong>
          {evidenceUnits.length - pendingCount}/{evidenceUnits.length} 已归类
        </strong>
      </header>
      {evidenceUnits.length > 0 ? (
        <div className={dragState ? 'reading-receipt-board is-dragging' : 'reading-receipt-board'}>
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
                          stackIndex={unitIndex}
                          unit={unit}
                          onDragCancel={cancelPendingDrag}
                          onDragStart={startDragging}
                          onOpenEvidence={onOpenEvidence}
                          onToggleActive={toggleActiveEvidence}
                        />
                      ))
                    : null}
                </div>
              </section>
            );
          })}
          {dragState && draggedUnit ? (
            <ReadingReceiptBoardCardPreview
              disposition={draggingDisposition || 'pending'}
              state={dragState}
              unit={draggedUnit}
            />
          ) : null}
        </div>
      ) : (
        <p className="reading-card-placeholder">这篇文章还没有批注，可以直接收束成轻量回执。</p>
      )}
    </section>
  );
}

const receiptBoardColumns: Array<{
  value: ReadingReceiptBoardDisposition;
  label: string;
  description: string;
}> = [
  { value: 'pending', label: '待定', description: '还没有决定后续动作' },
  { value: 'include', label: '纳入', description: '进入这次回执' },
  { value: 'question', label: '追问', description: '保留成未收束问题' },
  { value: 'exclude', label: '暂放', description: '本次先不处理' },
];

function ReadingReceiptBoardCard({
  active,
  covered,
  disposition,
  dragging,
  extractDirection,
  stackIndex,
  unit,
  onDragCancel,
  onDragStart,
  onOpenEvidence,
  onToggleActive,
}: {
  active: boolean;
  covered: boolean;
  disposition: ReadingReceiptBoardDisposition;
  dragging: boolean;
  extractDirection: 'left' | 'right';
  stackIndex: number;
  unit: ReadingCardEvidenceUnit;
  onDragCancel: () => void;
  onDragStart: (evidenceId: string, geometry: ReadingReceiptDragGeometry) => void;
  onOpenEvidence: (annotationId: string) => void;
  onToggleActive: (evidenceId: string) => void;
}) {
  function startDrag(event: React.PointerEvent<HTMLElement>) {
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

  return (
    <article
      aria-label={`批注卡片：${unit.quote}`}
      className={[
        `reading-receipt-board-card is-${disposition}`,
        active ? `is-active is-extract-${extractDirection}` : '',
        covered ? 'is-covered' : '',
        dragging ? 'is-dragging' : '',
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
      <ReadingReceiptBoardCardFooter unit={unit} onOpenEvidence={openEvidence} />
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
  unit,
  onOpenEvidence,
}: {
  unit: ReadingCardEvidenceUnit;
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
      <button
        className="reading-card-evidence-open"
        type="button"
        aria-label={`查看批注：${unit.quote}`}
        onClick={onOpenEvidence}
      >
        查看批注
      </button>
    </footer>
  );
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
          <span>收束队列</span>
          <h4>每条痕迹如何进入回执</h4>
        </div>
        <strong>
          {workbench.includeCount + workbench.questionCount}/{evidenceUnits.length}
        </strong>
      </header>
      <p className="reading-card-evidence-section-note">
        每条痕迹默认进入本次收束；只有你改成追问或暂放时，回执生成才会改变处理方式。
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
  { value: 'question', label: '追问' },
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

      <ReadingReceiptWorkbenchPanel
        isCurrent={isCurrent}
        readingCard={readingCard}
        sourceUpdatedAt={sourceUpdatedAt}
        workbench={workbench}
        onOpenEvidence={onOpenEvidence}
      />

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
          eyebrow="还没收束的问题"
          fallback="暂无未收束问题。"
          section={receiptSections.questions}
          title="继续想的线索"
          onOpenEvidence={onOpenEvidence}
        />
      </div>

      {readingCard.review ? (
        <ReadingCardReviewPanel
          evidenceUnits={evidenceUnits}
          retryingReviewerId={retryingReviewerId}
          review={readingCard.review}
          onOpenEvidence={onOpenEvidence}
          onRetryReviewer={onRetryReviewer}
        />
      ) : null}

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
              : '这些新批注或评论还没有进入当前回执，需要先重新收束，再重新打磨。'}
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
          <dt>追问</dt>
          <dd>{workbench.questionCount + openQuestionCount}</dd>
        </div>
        <div>
          <dt>暂放</dt>
          <dd>{workbench.excludeCount}</dd>
        </div>
        <div>
          <dt>最近收束</dt>
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
  | 'question'
  | 'exclude'
  | 'unreferenced'
  | 'pending';

type ReadingReceiptEvidenceTreatment = {
  kind: ReadingReceiptEvidenceTreatmentKind;
  label: string;
  hint: string;
};

type ReadingReceiptWorkbench = {
  totalCount: number;
  includedCount: number;
  includeCount: number;
  questionCount: number;
  excludeCount: number;
  pendingCount: number;
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
    const disposition = dispositionById[unit.id] || 'include';
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
    questionCount: units.filter((entry) => entry.disposition === 'question').length,
    excludeCount: units.filter((entry) => entry.disposition === 'exclude').length,
    pendingCount: units.filter((entry) => entry.disposition === 'pending').length,
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

  if (disposition === 'pending') {
    return {
      kind: 'pending',
      label: '待归类',
      hint: '拖到纳入、追问或暂放后，才能进入下一步收束。',
    };
  }

  if (disposition === 'exclude') {
    return {
      kind: 'exclude',
      label: '暂不放入',
      hint: '本次收束不会使用这条痕迹。',
    };
  }

  if (disposition === 'question') {
    return {
      kind: 'question',
      label: '先追问',
      hint: '本次收束会把它保留为未收束问题。',
    };
  }

  if (readingCard && latestEvidenceTimestamp(unit) > timestamp(readingCard.updatedAt)) {
    return {
      kind: 'new',
      label: '新内容',
      hint: '这条痕迹晚于当前回执，重新收束后才会被纳入。',
    };
  }

  if (evidenceHasQuestionStatus(unit, 'open')) {
    return {
      kind: 'open',
      label: '待追问',
      hint: included ? '回执已引用，但问题还没有收束。' : '这条痕迹会进入未收束问题。',
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
      hint: '当前回执还没有引用它，可重新收束或暂放。',
    };
  }

  return {
    kind: 'pending',
    label: '将纳入',
    hint: '默认会参与这次收束；不用处理也可以直接收束。',
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
