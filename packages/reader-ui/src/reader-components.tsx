import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Copy,
  FileText,
  Layers2,
  Lightbulb,
  Maximize2,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  MoreHorizontal,
  Plus,
  Puzzle,
  ShieldAlert,
  Sparkles,
  Sprout,
  TriangleAlert,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  AgentReadingPlanItem,
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  MessageSendShortcut,
  PublicAgent,
  QuestionStatus,
  UserProfile,
} from '@yomitomo/shared';
import {
  agentReadingIntentDisplayLabel,
  agentReadingIntentLabel,
  agentReadingIntentOptions,
  renderMarkdown,
} from '@yomitomo/shared';
import {
  annotationPersona as annotationAuthor,
  annotationPrimaryComment,
  annotationThreadComments,
  annotationTypeLabel,
  commentPersona,
  getMentionQuery,
  isQuestionComment,
  questionStatusLabel,
  questionStatusOrOpen,
  replaceMentionQuery,
} from '@yomitomo/core';
import { Kbd } from './components/ui/kbd';
import { isMessageSendShortcutEvent, messageSendShortcutKeys } from './reader-utils';
import type {
  AnnotationFilterFacets,
  AnnotationFilterGroup,
  AnnotationFilterOption,
} from './reader-utils';

export type SelectionMenuAction = {
  x: number;
  y: number;
};

export type PendingComposer = {
  x: number;
  y: number;
};

export type ActiveConnection = {
  path: string;
  color: string;
};

export type ReaderSettings = {
  fontSize: number;
  contentWidth: number;
};

export type VirtualCursorState = {
  id: string;
  visible: boolean;
  leaving?: boolean;
  x: number;
  y: number;
  label: string;
  offscreen: 'above' | 'below' | null;
  agent?: PublicAgent;
};

export type HighlightChoiceAction = {
  x: number;
  y: number;
};

const DELETE_HOLD_MS = 1600;
const GOLDEN_RATIO_CONJUGATE = 0.618033988749895;
const VIRTUAL_CURSOR_PATH = 'M10.1 10.1 L19.3 32 L22.1 22.1 L32 19.3 Z';
const completionBurstParticles = [
  { x: -128, y: -42, rotate: -28, delay: 0, color: '#5EC0E8', shape: 'strip' },
  { x: -94, y: -82, rotate: 36, delay: 18, color: '#54CDA0', shape: 'dot' },
  { x: -58, y: -112, rotate: -74, delay: 34, color: '#F4C95D', shape: 'spark' },
  { x: -18, y: -96, rotate: 12, delay: 8, color: '#DBEEEF', shape: 'strip' },
  { x: 28, y: -116, rotate: 74, delay: 28, color: '#D683B2', shape: 'dot' },
  { x: 74, y: -88, rotate: -32, delay: 12, color: '#5EC0E8', shape: 'spark' },
  { x: 118, y: -52, rotate: 18, delay: 42, color: '#F4C95D', shape: 'strip' },
  { x: 142, y: -8, rotate: -62, delay: 58, color: '#54CDA0', shape: 'dot' },
  { x: 104, y: 34, rotate: 44, delay: 24, color: '#D683B2', shape: 'strip' },
  { x: 72, y: 74, rotate: -18, delay: 48, color: '#DBEEEF', shape: 'spark' },
  { x: 24, y: 92, rotate: 84, delay: 68, color: '#54CDA0', shape: 'dot' },
  { x: -24, y: 82, rotate: -42, delay: 38, color: '#5EC0E8', shape: 'strip' },
  { x: -78, y: 58, rotate: 26, delay: 62, color: '#F4C95D', shape: 'spark' },
  { x: -116, y: 12, rotate: -86, delay: 44, color: '#D683B2', shape: 'dot' },
  { x: -148, y: -6, rotate: 54, delay: 72, color: '#DBEEEF', shape: 'strip' },
  { x: 0, y: -142, rotate: 0, delay: 52, color: '#F4C95D', shape: 'spark' },
  { x: 154, y: -72, rotate: 92, delay: 82, color: '#5EC0E8', shape: 'strip' },
  { x: -154, y: -76, rotate: -96, delay: 86, color: '#54CDA0', shape: 'strip' },
] as const;
const annotationTypeOptions: AnnotationType[] = [
  'key_point',
  'assumption',
  'concept',
  'question',
  'quote',
];
const readingIntentIcons: Record<AgentReadingIntent, LucideIcon> = {
  explain: MessageCircle,
  decompose: Layers2,
  challenge: ShieldAlert,
  question: CornerDownRight,
  connect: FileText,
};
const annotationTypeIcons: Record<AnnotationType, LucideIcon> = {
  key_point: Lightbulb,
  assumption: TriangleAlert,
  concept: Puzzle,
  question: Sprout,
  quote: Sparkles,
};

function ReadingIntentIcon({ intent, size = 13 }: { intent: AgentReadingIntent; size?: number }) {
  const Icon = readingIntentIcons[intent];
  return (
    <Icon
      aria-hidden="true"
      className="reader-reading-intent-icon"
      focusable="false"
      size={size}
      strokeWidth={2.3}
    />
  );
}

function ReadingIntentLabelContent({
  intent,
  short = false,
}: {
  intent: AgentReadingIntent;
  short?: boolean;
}) {
  const option = agentReadingIntentOptions.find((item) => item.value === intent);
  const label = short
    ? option?.shortLabel || agentReadingIntentLabel(intent)
    : agentReadingIntentLabel(intent);
  return (
    <>
      <ReadingIntentIcon intent={intent} />
      {label}
    </>
  );
}

function AnnotationTypeLabelContent({ type }: { type: AnnotationType }) {
  const Icon = annotationTypeIcons[type];
  return (
    <>
      <Icon
        aria-hidden="true"
        className="reader-annotation-type-icon"
        focusable="false"
        size={13}
        strokeWidth={2.3}
      />
      {annotationTypeLabel(type)}
    </>
  );
}

function AnnotationTypeIcon({ type }: { type: AnnotationType }) {
  const Icon = annotationTypeIcons[type];
  return (
    <Icon
      aria-hidden="true"
      className="reader-annotation-type-icon"
      focusable="false"
      size={13}
      strokeWidth={2.3}
    />
  );
}

function moveAnnotationTypeSelection(
  event: React.KeyboardEvent<HTMLDivElement>,
  current: AnnotationType,
  onChange: (nextType: AnnotationType) => void,
) {
  const currentIndex = annotationTypeOptions.indexOf(current);
  const lastIndex = annotationTypeOptions.length - 1;
  const nextIndexByKey: Record<string, number> = {
    ArrowRight: Math.min(currentIndex + 1, lastIndex),
    ArrowDown: Math.min(currentIndex + 1, lastIndex),
    ArrowLeft: Math.max(currentIndex - 1, 0),
    ArrowUp: Math.max(currentIndex - 1, 0),
    Home: 0,
    End: lastIndex,
  };
  const nextIndex = nextIndexByKey[event.key];
  if (nextIndex === undefined) return;

  event.preventDefault();
  onChange(annotationTypeOptions[nextIndex]);
}

function moveReadingIntentSelection(
  event: React.KeyboardEvent<HTMLDivElement>,
  current: AgentReadingIntent,
  onChange: (nextIntent: AgentReadingIntent) => void,
) {
  const currentIndex = agentReadingIntentOptions.findIndex((option) => option.value === current);
  const lastIndex = agentReadingIntentOptions.length - 1;
  const nextIndexByKey: Record<string, number> = {
    ArrowRight: Math.min(currentIndex + 1, lastIndex),
    ArrowDown: Math.min(currentIndex + 1, lastIndex),
    ArrowLeft: Math.max(currentIndex - 1, 0),
    ArrowUp: Math.max(currentIndex - 1, 0),
    Home: 0,
    End: lastIndex,
  };
  const nextIndex = nextIndexByKey[event.key];
  if (nextIndex === undefined) return;

  event.preventDefault();
  onChange(agentReadingIntentOptions[nextIndex]!.value);
}

function mentionDraftWithAgent(
  content: string,
  username: string,
  mentionQuery: ReturnType<typeof getMentionQuery>,
) {
  if (mentionQuery) {
    const nextContent = replaceMentionQuery(content, mentionQuery, username);
    return {
      content: nextContent,
      caretIndex: mentionQuery.start + username.length + 2,
    };
  }

  const prefix = content.trimEnd();
  const nextContent = `${prefix ? `${prefix} ` : ''}@${username} `;
  return {
    content: nextContent,
    caretIndex: nextContent.length,
  };
}

export function SelectionMenu({
  action,
  onAnnotate,
  onCopy,
}: {
  action: SelectionMenuAction;
  onAnnotate: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      className="reader-selection-menu"
      style={{ left: action.x, top: action.y }}
      onMouseDown={(event) => event.preventDefault()}
      onMouseUp={(event) => event.stopPropagation()}
    >
      <button className="reader-selection-primary" type="button" onClick={onCopy}>
        <Copy size={15} strokeWidth={2.2} />
        复制
        <Kbd className="reader-kbd">C</Kbd>
      </button>
      <button className="reader-selection-primary" type="button" onClick={onAnnotate}>
        <MessageSquarePlus size={15} strokeWidth={2.2} />
        添加批注
        <Kbd className="reader-kbd">A</Kbd>
      </button>
    </div>
  );
}

export function HighlightChoiceMenu({
  action,
  agents,
  annotations,
  userProfile,
  onCancel,
  onSelect,
}: {
  action: HighlightChoiceAction;
  agents: PublicAgent[];
  annotations: Annotation[];
  userProfile: UserProfile;
  onCancel: () => void;
  onSelect: (annotationId: string) => void;
}) {
  return (
    <div className="reader-highlight-choice-menu" style={{ left: action.x, top: action.y }}>
      <header>
        <strong>选择批注</strong>
        <button type="button" onClick={onCancel} aria-label="关闭批注选择">
          <X size={14} />
        </button>
      </header>
      {annotations.map((annotation) => {
        const persona = annotationAuthor(annotation, userProfile, agents);
        const hasLabels = Boolean(annotation.annotationType || annotation.readingIntent);
        return (
          <button key={annotation.id} type="button" onClick={() => onSelect(annotation.id)}>
            <AvatarBadge avatar={persona.avatar} fallback={persona.fallback} />
            <span>
              <strong>{persona.nickname}</strong>
              <em>@{persona.username}</em>
            </span>
            {hasLabels ? (
              <b>
                {annotation.annotationType ? (
                  <span className="reader-highlight-choice-label">
                    <AnnotationTypeLabelContent type={annotation.annotationType} />
                  </span>
                ) : null}
                {annotation.annotationType && annotation.readingIntent ? <i>·</i> : null}
                {annotation.readingIntent ? (
                  <span className="reader-highlight-choice-label">
                    {agentReadingIntentDisplayLabel(annotation.readingIntent)}
                  </span>
                ) : null}
              </b>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function AnnotationConnection({ connection }: { connection: ActiveConnection }) {
  return (
    <svg className="reader-annotation-connection" aria-hidden="true">
      <path d={connection.path} style={{ stroke: connection.color }} />
    </svg>
  );
}

export function VirtualCursor({ cursor }: { cursor: VirtualCursorState }) {
  const color = cursor.agent?.annotationColor || cursorColorFromId(cursor.id);
  const gradientId = cursorSvgId('reader-cursor-fill', cursor.id);
  const bloomId = cursorSvgId('reader-cursor-bloom', cursor.id);
  return (
    <div
      className={[
        'reader-virtual-cursor',
        cursor.offscreen ? 'is-offscreen' : '',
        cursor.leaving ? 'is-leaving' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ left: cursor.x, top: cursor.y, '--cursor-color': color } as React.CSSProperties}
    >
      <svg
        aria-hidden="true"
        className="reader-virtual-pointer"
        focusable="false"
        viewBox="0 0 48 48"
      >
        <defs>
          <radialGradient id={bloomId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="52%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={gradientId}
            x1="10"
            x2="32"
            y1="10"
            y2="32"
          >
            <stop offset="0%" stopColor="#DBEEEF" />
            <stop offset="53%" stopColor={color} />
            <stop offset="100%" stopColor="#54CDA0" />
          </linearGradient>
        </defs>
        <ellipse
          className="reader-virtual-bloom"
          cx="23"
          cy="23"
          fill={`url(#${bloomId})`}
          rx="22"
          ry="15"
          transform="rotate(-45 23 23)"
        />
        <path
          className="reader-virtual-pointer-shape"
          d={VIRTUAL_CURSOR_PATH}
          fill={`url(#${gradientId})`}
        />
      </svg>
      <div className="reader-virtual-label">
        <AvatarBadge avatar={cursor.agent?.avatar} />
        {cursor.label}
      </div>
    </div>
  );
}

export function ReadingCompletionBurst() {
  return (
    <div className="reader-completion-burst" aria-hidden="true">
      <div className="reader-completion-burst-center">
        <span className="reader-completion-burst-ring" />
        <span className="reader-completion-burst-ring is-wide" />
        {completionBurstParticles.map((particle, index) => (
          <span
            className={`reader-completion-particle is-${particle.shape}`}
            key={`${particle.x}:${particle.y}:${index}`}
            style={
              {
                '--reader-confetti-color': particle.color,
                '--reader-confetti-delay': `${particle.delay}ms`,
                '--reader-confetti-rotate': `${particle.rotate}deg`,
                '--reader-confetti-x': `${particle.x}px`,
                '--reader-confetti-y': `${particle.y}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

function cursorSvgId(prefix: string, id: string) {
  return `${prefix}-${hashString(id).toString(36)}`;
}

function cursorColorFromId(id: string) {
  const hue = Math.round(((hashString(id) % 997) * GOLDEN_RATIO_CONJUGATE * 360) % 360);
  return `hsl(${hue},70%,55%)`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function AvatarBadge({ avatar, fallback = 'AI' }: { avatar?: string; fallback?: string }) {
  const value = avatar || fallback;
  const image = isImageAvatar(value);
  const svg = isSvgAvatar(value);
  const classes = ['reader-avatar-badge', image ? 'is-image' : '', svg ? 'is-svg' : '']
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{image ? <img alt="" src={value} /> : value}</span>;
}

export function EmptyNotes() {
  return (
    <div className="reader-empty">
      <strong>选择一段文字开始批注</strong>
      <p>选中阅读器内的文本后，可以写下想法。高亮和讨论会保存在当前文章下。</p>
    </div>
  );
}

export function AnnotationFilterPanel({
  facets,
  panelProps,
  onClear,
  onToggle,
}: {
  facets: AnnotationFilterFacets;
  panelProps?: React.HTMLAttributes<HTMLDivElement>;
  onClear: () => void;
  onToggle: (group: AnnotationFilterGroup, value: string) => void;
}) {
  const className = ['reader-filter-panel', 't-dropdown', 'is-open', panelProps?.className]
    .filter(Boolean)
    .join(' ');

  return (
    <div {...panelProps} className={className} data-origin="top-right">
      <header>
        <div>
          <strong>过滤筛选</strong>
          <span>{facets.activeCount > 0 ? `${facets.activeCount} 个条件` : '全部批注'}</span>
        </div>
      </header>
      <AnnotationFilterSection title="人物">
        {facets.people.map((option) => (
          <FilterChip
            group="person"
            key={option.id}
            option={option}
            onToggle={onToggle}
            leading={
              <AvatarBadge avatar={option.avatar} fallback={option.fallback || option.label} />
            }
          />
        ))}
      </AnnotationFilterSection>
      <AnnotationFilterSection title="类型">
        {facets.types.map((option) => (
          <FilterChip
            group="type"
            key={option.id}
            option={option}
            onToggle={onToggle}
            leading={<AnnotationTypeIcon type={option.id} />}
          />
        ))}
      </AnnotationFilterSection>
      <AnnotationFilterSection title="动作">
        {facets.actions.map((option) => (
          <FilterChip
            group="action"
            key={option.id}
            option={option}
            onToggle={onToggle}
            leading={<ReadingIntentIcon intent={option.id} />}
          />
        ))}
      </AnnotationFilterSection>
      <footer>
        <button type="button" disabled={facets.activeCount === 0} onClick={onClear}>
          清除过滤
        </button>
        <span>{facets.resultCount} 条结果</span>
      </footer>
    </div>
  );
}

function AnnotationFilterSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="reader-filter-group">
      <h3>{title}</h3>
      <div className="reader-filter-chip-grid">{children}</div>
    </section>
  );
}

function FilterChip({
  group,
  leading,
  option,
  onToggle,
}: {
  group: AnnotationFilterGroup;
  leading: React.ReactNode;
  option: AnnotationFilterOption;
  onToggle: (group: AnnotationFilterGroup, value: string) => void;
}) {
  return (
    <button
      className={option.selected ? 'reader-filter-chip is-selected' : 'reader-filter-chip'}
      type="button"
      disabled={option.disabled}
      aria-pressed={option.selected}
      onClick={() => onToggle(group, option.id)}
    >
      <span className="reader-filter-chip-main">
        <span className="reader-filter-chip-leading">{leading}</span>
        <span className="reader-filter-chip-label">{option.label}</span>
      </span>
      <b>{option.count}</b>
    </button>
  );
}

export function QuestionPanel({
  agents,
  annotations,
  userProfile,
  onFocus,
  onAnswer,
  onSetAnnotationQuestionStatus,
  onSetCommentQuestionStatus,
}: {
  agents: PublicAgent[];
  annotations: Annotation[];
  userProfile: UserProfile;
  onFocus: (annotationId: string) => void;
  onAnswer: (annotationId: string) => void;
  onSetAnnotationQuestionStatus: (annotationId: string, status: QuestionStatus) => void;
  onSetCommentQuestionStatus: (
    annotationId: string,
    commentId: string,
    status: QuestionStatus,
  ) => void;
}) {
  const [activeStatus, setActiveStatus] = useState<QuestionStatus>('open');
  const questions = annotations.flatMap((annotation) => {
    const annotationAuthorPersona = annotationAuthor(annotation, userProfile, agents);
    const annotationQuestion =
      annotation.annotationType === 'question' || annotation.questionStatus
        ? [
            {
              id: annotation.id,
              annotationId: annotation.id,
              status: questionStatusOrOpen(annotation.questionStatus),
              persona: annotationAuthorPersona,
              text: annotation.anchor.exact,
              quote: annotation.anchor.exact,
              createdAt: annotation.createdAt,
              typeLabel: annotation.readingIntent ? (
                agentReadingIntentDisplayLabel(annotation.readingIntent)
              ) : annotation.annotationType ? (
                <AnnotationTypeLabelContent type={annotation.annotationType} />
              ) : (
                '问题'
              ),
              setStatus: (status: QuestionStatus) =>
                onSetAnnotationQuestionStatus(annotation.id, status),
            },
          ]
        : [];
    const commentQuestions = annotationThreadComments(annotation)
      .filter(isQuestionComment)
      .map((comment) => {
        const commentAuthorPersona = commentPersona(comment, userProfile, agents);
        return {
          id: comment.id,
          annotationId: annotation.id,
          status: questionStatusOrOpen(comment.questionStatus),
          persona: commentAuthorPersona,
          text: comment.content,
          quote: annotation.anchor.exact,
          createdAt: comment.createdAt,
          typeLabel: comment.readingIntent
            ? agentReadingIntentDisplayLabel(comment.readingIntent)
            : '❓ 追问',
          setStatus: (status: QuestionStatus) =>
            onSetCommentQuestionStatus(annotation.id, comment.id, status),
        };
      });
    return [...annotationQuestion, ...commentQuestions];
  });
  const statusTabs: Array<{ status: QuestionStatus; label: string }> = [
    { status: 'open', label: '未答' },
    { status: 'answered', label: '已答' },
    { status: 'parked', label: '搁置' },
  ];
  const questionCounts = statusTabs.reduce<Record<QuestionStatus, number>>(
    (counts, tab) => {
      counts[tab.status] = questions.filter((question) => question.status === tab.status).length;
      return counts;
    },
    { open: 0, answered: 0, parked: 0 },
  );
  const activeStatusLabel =
    statusTabs.find((tab) => tab.status === activeStatus)?.label ||
    questionStatusLabel(activeStatus);
  const visibleQuestions = questions.filter((question) => question.status === activeStatus);

  if (questions.length === 0) return null;

  return (
    <section className="reader-question-panel" aria-label="待答问题">
      <header className="reader-question-panel-header">
        <div>
          <strong>待回应</strong>
          <span>INBOX · {questions.length}</span>
        </div>
      </header>
      <div className="reader-question-tabs" role="tablist" aria-label="待答问题状态">
        {statusTabs.map((tab) => (
          <button
            aria-selected={activeStatus === tab.status}
            className={activeStatus === tab.status ? 'is-active' : ''}
            key={tab.status}
            role="tab"
            type="button"
            onClick={() => setActiveStatus(tab.status)}
          >
            <i />
            <span>{tab.label}</span>
            <b>{questionCounts[tab.status]}</b>
          </button>
        ))}
      </div>
      <div className="reader-question-list">
        {visibleQuestions.length === 0 ? (
          <p className="reader-question-empty">当前没有{activeStatusLabel}内容。</p>
        ) : null}
        {visibleQuestions.map((question) => (
          <article
            className={`is-${question.status}`}
            key={question.id}
            style={questionCardStyle(question.persona.color)}
          >
            <div className="reader-question-open">
              <span className="reader-question-meta">
                <span className="reader-question-persona">
                  <AvatarBadge
                    avatar={question.persona.avatar}
                    fallback={question.persona.fallback}
                  />
                  <span>
                    <strong>{question.persona.nickname}</strong>
                  </span>
                </span>
                <time dateTime={question.createdAt}>{formatRelativeTime(question.createdAt)}</time>
              </span>
              <span className="reader-question-type">{question.typeLabel}</span>
              <em>“{question.quote}”</em>
              <span className="reader-question-content">{question.text}</span>
            </div>
            <div className="reader-question-actions">
              {question.status === 'open' ? (
                <>
                  <button type="button" onClick={() => question.setStatus('parked')}>
                    搁置
                  </button>
                  <button type="button" onClick={() => onAnswer(question.annotationId)}>
                    回答
                  </button>
                </>
              ) : null}
              {question.status === 'parked' ? (
                <button type="button" onClick={() => question.setStatus('open')}>
                  恢复
                </button>
              ) : null}
              {question.status === 'answered' ? (
                <button type="button" onClick={() => onFocus(question.annotationId)}>
                  查看
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AgentAnnotateMenu({
  agents,
  annotatingAgents,
  readingSections,
  onCancel,
  onStartAgentPlan,
}: {
  agents: PublicAgent[];
  annotatingAgents: string[];
  readingSections: ReaderReadingSection[];
  onCancel: () => void;
  onStartAgentPlan: (agent: PublicAgent, readingPlan: AgentReadingPlanItem[]) => void;
}) {
  const availableAgents = useMemo(
    () => agents.filter((agent) => !annotatingAgents.includes(agent.id)),
    [agents, annotatingAgents],
  );
  const [visibleAgentIds, setVisibleAgentIds] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<
    Record<string, Record<string, AgentReadingIntent>>
  >({});
  const [addingAgents, setAddingAgents] = useState(false);

  useEffect(() => {
    setVisibleAgentIds((ids) => {
      const next = ids.filter((id) => availableAgents.some((agent) => agent.id === id));
      return next.length > 0 ? next : availableAgents.map((agent) => agent.id);
    });
    setAssignments((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([agentId]) =>
          availableAgents.some((agent) => agent.id === agentId),
        ),
      ),
    );
  }, [availableAgents]);

  const visibleAgents = availableAgents.filter((agent) => visibleAgentIds.includes(agent.id));
  const hiddenAgents = availableAgents.filter((agent) => !visibleAgentIds.includes(agent.id));
  const actionCount = Object.values(assignments).reduce(
    (count, agentAssignments) => count + Object.keys(agentAssignments).length,
    0,
  );
  const assignedAgentCount = visibleAgents.filter(
    (agent) => Object.keys(assignments[agent.id] || {}).length > 0,
  ).length;
  const canStart = actionCount > 0 && assignedAgentCount > 0;
  const gridTemplateColumns = `220px repeat(${Math.max(1, readingSections.length)}, 88px)`;

  function setAssignment(agentId: string, sectionId: string, readingIntent: AgentReadingIntent) {
    setAssignments((current) => ({
      ...current,
      [agentId]: {
        ...current[agentId],
        [sectionId]: readingIntent,
      },
    }));
  }

  function clearAssignment(agentId: string, sectionId: string) {
    setAssignments((current) => {
      const agentAssignments = { ...current[agentId] };
      delete agentAssignments[sectionId];
      return { ...current, [agentId]: agentAssignments };
    });
  }

  function removeAgent(agentId: string) {
    setVisibleAgentIds((ids) => ids.filter((id) => id !== agentId));
    setAssignments((current) => {
      const next = { ...current };
      delete next[agentId];
      return next;
    });
  }

  function addAgent(agentId: string) {
    setVisibleAgentIds((ids) => (ids.includes(agentId) ? ids : [...ids, agentId]));
    setAddingAgents(false);
  }

  function startReadingPlan() {
    if (!canStart) return;

    for (const agent of visibleAgents) {
      const agentAssignments = assignments[agent.id] || {};
      const readingPlan = readingSections.flatMap((section) => {
        const readingIntent = agentAssignments[section.id];
        return readingIntent
          ? [
              {
                sectionId: section.id,
                sectionTitle: section.title,
                sectionStart: section.start,
                sectionEnd: section.end,
                readingIntent,
              },
            ]
          : [];
      });
      if (readingPlan.length > 0) onStartAgentPlan(agent, readingPlan);
    }

    onCancel();
  }

  function onCellDrop(event: React.DragEvent<HTMLDivElement>, agentId: string, sectionId: string) {
    event.preventDefault();
    const readingIntent = event.dataTransfer.getData('text/plain');
    if (!isAgentReadingIntent(readingIntent)) return;
    setAssignment(agentId, sectionId, readingIntent);
  }

  return (
    <div className="reader-agent-annotate-menu">
      <header className="reader-plan-header">
        <div>
          <strong>助手精读编排</strong>
          <span>像剧本一样安排每位助手的动作，动作位置代表他们在文章中介入的章节</span>
        </div>
        <p>
          <b>{assignedAgentCount}</b> 助手 · <b>{actionCount}</b> 动作
        </p>
      </header>

      <div className="reader-plan-action-bar" aria-label="可使用的动作">
        <span>动作</span>
        {agentReadingIntentOptions.map((option) => (
          <button
            className="reader-plan-action"
            data-description={option.description}
            draggable
            key={option.value}
            title={option.description}
            type="button"
            onDragStart={(event) => onActionDragStart(event, option.value)}
          >
            <ReadingIntentLabelContent intent={option.value} short />
          </button>
        ))}
      </div>

      <div className="reader-plan-grid-wrap">
        <div className="reader-plan-grid" style={{ gridTemplateColumns }}>
          <div className="reader-plan-corner" />
          {readingSections.map((section, index) => (
            <div className="reader-plan-section" key={section.id}>
              <span>§{index + 1}</span>
              <strong>{section.title}</strong>
            </div>
          ))}
          {visibleAgents.map((agent) => (
            <React.Fragment key={agent.id}>
              <div className="reader-plan-agent">
                <span
                  className="reader-plan-agent-color"
                  style={{ backgroundColor: agent.annotationColor }}
                />
                <AvatarBadge avatar={agent.avatar} />
                <strong>{agent.nickname}</strong>
                <button
                  type="button"
                  aria-label={`移除 ${agent.nickname}`}
                  onClick={() => removeAgent(agent.id)}
                >
                  <X size={14} />
                </button>
              </div>
              {readingSections.map((section) => {
                const readingIntent = assignments[agent.id]?.[section.id] || null;
                const option = readingIntent
                  ? agentReadingIntentOptions.find((item) => item.value === readingIntent)
                  : null;
                return (
                  <div
                    className={readingIntent ? 'reader-plan-cell is-filled' : 'reader-plan-cell'}
                    key={`${agent.id}-${section.id}`}
                    aria-label={`${agent.nickname} ${section.title} 动作槽`}
                    style={{ '--agent-color': agent.annotationColor } as React.CSSProperties}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => onCellDrop(event, agent.id, section.id)}
                  >
                    {option ? (
                      <button
                        className="reader-plan-cell-action"
                        type="button"
                        title={option.description}
                        onClick={() => clearAssignment(agent.id, section.id)}
                      >
                        <strong>
                          <ReadingIntentLabelContent intent={option.value} short />
                        </strong>
                      </button>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="reader-plan-footer">
        <div className="reader-plan-add">
          <button
            type="button"
            disabled={hiddenAgents.length === 0}
            onClick={() => setAddingAgents((open) => !open)}
          >
            <Plus size={15} />
            添加助手
          </button>
          {addingAgents && hiddenAgents.length > 0 ? (
            <div className="reader-plan-add-menu">
              {hiddenAgents.map((agent) => (
                <button key={agent.id} type="button" onClick={() => addAgent(agent.id)}>
                  <AvatarBadge avatar={agent.avatar} />
                  <span>{agent.nickname}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p className="reader-plan-help">拖拽动作到对应助手和章节。点击已安排的动作即可取消。</p>
        <div className="reader-agent-annotate-actions">
          <button type="button" onClick={onCancel}>
            取消编排
          </button>
          <button disabled={!canStart} type="button" onClick={startReadingPlan}>
            开始精读
          </button>
        </div>
      </div>
    </div>
  );
}

export type ReaderReadingSection = {
  id: string;
  title: string;
  start: number;
  end: number;
};

function isAgentReadingIntent(value: string): value is AgentReadingIntent {
  return agentReadingIntentOptions.some((option) => option.value === value);
}

function onActionDragStart(event: React.DragEvent<HTMLButtonElement>, intent: AgentReadingIntent) {
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', intent);
}

export function ReaderSettingsPanel({
  panelProps,
  settings,
  onChange,
}: {
  panelProps?: React.HTMLAttributes<HTMLDivElement>;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
}) {
  return (
    <div className="reader-settings-panel" {...panelProps}>
      <SettingStepper
        icon={<CaseSensitive size={17} />}
        label="字号"
        value={`${settings.fontSize}px`}
        onDecrease={() => onChange({ ...settings, fontSize: Math.max(16, settings.fontSize - 1) })}
        onIncrease={() => onChange({ ...settings, fontSize: Math.min(28, settings.fontSize + 1) })}
      />
      <SettingStepper
        icon={<Maximize2 size={16} />}
        label="文章宽度"
        value={`${settings.contentWidth}px`}
        onDecrease={() =>
          onChange({ ...settings, contentWidth: Math.max(680, settings.contentWidth - 40) })
        }
        onIncrease={() =>
          onChange({ ...settings, contentWidth: Math.min(1080, settings.contentWidth + 40) })
        }
      />
    </div>
  );
}

function SettingStepper({
  icon,
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="reader-setting-row">
      <div className="reader-setting-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="reader-stepper">
        <button type="button" onClick={onDecrease} aria-label={`减少${label}`}>
          <Minus size={14} />
        </button>
        <strong>{value}</strong>
        <button type="button" onClick={onIncrease} aria-label={`增加${label}`}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function SubmitShortcutKeys({
  shortcut,
  shortcutModifier,
}: {
  shortcut: MessageSendShortcut;
  shortcutModifier: string;
}) {
  return (
    <>
      {messageSendShortcutKeys(shortcut, shortcutModifier).map((key) => (
        <Kbd className="reader-kbd" key={key}>
          {key}
        </Kbd>
      ))}
    </>
  );
}

export function Composer({
  agents,
  composer,
  messageSendShortcut,
  shortcutModifier,
  onCancel,
  onSave,
}: {
  agents: PublicAgent[];
  composer: PendingComposer;
  messageSendShortcut: MessageSendShortcut;
  shortcutModifier: string;
  onCancel: () => void;
  onSave: (note: string, annotationType: AnnotationType, readingIntent: AgentReadingIntent) => void;
}) {
  const [note, setNote] = useState('');
  const [annotationType, setAnnotationType] = useState<AnnotationType>('key_point');
  const [readingIntent, setReadingIntent] = useState<AgentReadingIntent>('explain');
  const [caretIndex, setCaretIndex] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [revealedAgentId, setRevealedAgentId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionQuery = getMentionQuery(note, caretIndex);
  const matchedAgents =
    mentionQuery === null
      ? []
      : agents.filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query)).slice(0, 5);
  const mentionedAgents = agents.filter((agent) =>
    new RegExp(`(^|\\s)@${escapeRegExp(agent.username)}(?=[\\s，。,.!?！？、;；:]|$)`, 'u').test(
      note,
    ),
  );
  const canMentionAgents = agents.length > 0;

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery?.query]);

  useEffect(() => {
    if (matchedAgents.length > 0 && selectedMentionIndex >= matchedAgents.length) {
      setSelectedMentionIndex(0);
    }
  }, [matchedAgents.length, selectedMentionIndex]);

  useEffect(() => {
    function handleCancelShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }

    window.addEventListener('keydown', handleCancelShortcut);
    return () => window.removeEventListener('keydown', handleCancelShortcut);
  }, [onCancel]);

  function save() {
    onSave(note, annotationType, readingIntent);
  }

  function updateCaret(element: HTMLTextAreaElement) {
    setCaretIndex(element.selectionStart);
  }

  function insertAgent(agent: PublicAgent) {
    const next = mentionDraftWithAgent(note, agent.username, mentionQuery);
    setNote(next.content);
    setCaretIndex(next.caretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
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
      setSelectedMentionIndex((index) => (index - 1 + matchedAgents.length) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'Tab') {
      event.preventDefault();
      insertAgent(matchedAgents[selectedMentionIndex] || matchedAgents[0]!);
      return;
    }

    if (isMessageSendShortcutEvent(event, messageSendShortcut)) {
      event.preventDefault();
      save();
    }
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp') return;
    updateCaret(event.currentTarget);
  }

  return (
    <div className="reader-composer" style={{ left: composer.x, top: composer.y }}>
      <header className="reader-composer-header">
        <div className="reader-composer-title-row">
          <strong>批注</strong>
        </div>
        <div
          aria-label="批注类型"
          className="reader-composer-types"
          role="radiogroup"
          onKeyDown={(event) =>
            moveAnnotationTypeSelection(event, annotationType, setAnnotationType)
          }
        >
          <span className="reader-composer-group-label">批注类型</span>
          {annotationTypeOptions.map((type) => (
            <button
              aria-checked={annotationType === type}
              className={annotationType === type ? 'is-active' : ''}
              key={type}
              role="radio"
              tabIndex={annotationType === type ? 0 : -1}
              type="button"
              onClick={() => setAnnotationType(type)}
            >
              <AnnotationTypeLabelContent type={type} />
            </button>
          ))}
        </div>
        <div
          aria-label="批注动作"
          className="reader-composer-types reader-composer-intents"
          role="radiogroup"
          onKeyDown={(event) => moveReadingIntentSelection(event, readingIntent, setReadingIntent)}
        >
          <span className="reader-composer-group-label">批注动作</span>
          {agentReadingIntentOptions.map((option) => (
            <button
              aria-checked={readingIntent === option.value}
              className={readingIntent === option.value ? 'is-active' : ''}
              key={option.value}
              role="radio"
              tabIndex={readingIntent === option.value ? 0 : -1}
              title={option.description}
              type="button"
              onClick={() => setReadingIntent(option.value)}
            >
              <ReadingIntentLabelContent intent={option.value} short />
            </button>
          ))}
        </div>
      </header>
      <div className="reader-composer-editor">
        <textarea
          aria-label="批注内容"
          autoFocus
          ref={textareaRef}
          placeholder={canMentionAgents ? '写下批注，或 @ 助手给出指导…' : '写下你的批注…'}
          value={note}
          onChange={(event) => {
            setNote(event.currentTarget.value);
            updateCaret(event.currentTarget);
          }}
          onClick={(event) => updateCaret(event.currentTarget)}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onSelect={(event) => updateCaret(event.currentTarget)}
        />
        {matchedAgents.length > 0 ? (
          <div className="reader-agent-menu">
            {matchedAgents.map((agent, index) => (
              <button
                className={index === selectedMentionIndex ? 'is-active' : ''}
                key={agent.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertAgent(agent)}
              >
                <AvatarBadge avatar={agent.avatar} />
                <strong>{agent.nickname}</strong>
                <em>@{agent.username}</em>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="reader-composer-actions">
        <div className="reader-composer-agent-tray">
          <span aria-hidden="true">
            <AtSign size={16} />
          </span>
          {canMentionAgents
            ? agents.slice(0, 6).map((agent) => (
                <button
                  className={
                    mentionedAgents.some((item) => item.id === agent.id) ? 'is-active' : ''
                  }
                  key={agent.id}
                  type="button"
                  aria-label={`插入 @${agent.username}`}
                  title={`${agent.nickname} @${agent.username}`}
                  onClick={() => insertAgent(agent)}
                  onDoubleClick={() =>
                    setRevealedAgentId((current) => (current === agent.id ? null : agent.id))
                  }
                >
                  <AvatarBadge avatar={agent.avatar} />
                  {revealedAgentId === agent.id ? (
                    <b>
                      {agent.nickname}
                      <em>@{agent.username}</em>
                    </b>
                  ) : null}
                </button>
              ))
            : null}
        </div>
        <button className="reader-composer-cancel" type="button" onClick={onCancel}>
          <Kbd className="reader-kbd">Esc</Kbd>
          <span>取消</span>
        </button>
        <button type="button" onClick={save}>
          <SubmitShortcutKeys shortcut={messageSendShortcut} shortcutModifier={shortcutModifier} />
          <span>发布</span>
        </button>
      </div>
    </div>
  );
}

export function AnnotationCard({
  active,
  agents,
  annotation,
  exiting = false,
  isStackFront = true,
  messageSendShortcut,
  noteRef,
  shortcutModifier,
  stackCount = 1,
  stackIndex = 0,
  commentsCloseKey,
  replyRequestKey,
  style,
  userProfile,
  onAddComment,
  onDelete,
  onFocus,
}: {
  active: boolean;
  agents: PublicAgent[];
  annotation: Annotation;
  exiting?: boolean;
  isStackFront?: boolean;
  messageSendShortcut: MessageSendShortcut;
  noteRef: (element: HTMLElement | null) => void;
  shortcutModifier: string;
  stackCount?: number;
  stackIndex?: number;
  commentsCloseKey: number;
  replyRequestKey?: number;
  style?: React.CSSProperties;
  userProfile: UserProfile;
  onAddComment: (annotationId: string, content: string) => void;
  onDelete: (annotationId: string) => void;
  onFocus: (annotationId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(() => new Set());
  const [deleteHolding, setDeleteHolding] = useState(false);
  const [caretIndex, setCaretIndex] = useState(0);
  const [agentTrayOpen, setAgentTrayOpen] = useState(false);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const deleteTimerRef = useRef<number | null>(null);
  const previousCommentIdsRef = useRef<string[]>([]);
  const mentionQuery = getMentionQuery(draft, caretIndex);
  const mentionAgents = annotationMentionAgents(annotation, agents);
  const visibleMentionAgents = mentionAgents.slice(0, 2);
  const overflowMentionAgents = mentionAgents.slice(2);
  const matchedAgents =
    mentionQuery === null
      ? []
      : agents.filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query)).slice(0, 5);
  const author = annotationAuthor(annotation, userProfile, agents);
  const primaryComment = useMemo(() => annotationPrimaryComment(annotation), [annotation]);
  const threadComments = useMemo(() => annotationThreadComments(annotation), [annotation]);
  const threadCommentIds = useMemo(
    () => threadComments.map((comment) => comment.id),
    [threadComments],
  );
  const threadCommentIdKey = threadCommentIds.join('\u0000');
  const annotationStyle = {
    ...noteStyle(author.color, active),
    ...style,
  };
  const commentsPanelId = useMemo(
    () => `reader-comments-${hashString(annotation.id).toString(36)}`,
    [annotation.id],
  );

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery?.query]);

  useEffect(() => {
    if (matchedAgents.length > 0 && selectedMentionIndex >= matchedAgents.length)
      setSelectedMentionIndex(0);
  }, [matchedAgents.length, selectedMentionIndex]);

  useEffect(() => {
    if (!active && expanded) {
      setExpanded(false);
      setExpandedCommentIds(new Set());
    }
  }, [active, expanded]);

  useEffect(() => {
    setExpanded(false);
    setExpandedCommentIds(new Set());
    setAgentTrayOpen(false);
  }, [commentsCloseKey]);

  useEffect(() => {
    if (replyRequestKey === undefined) return;
    previousCommentIdsRef.current = threadCommentIds;
    setExpandedCommentIds(new Set());
    setExpanded(true);
    setAgentTrayOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [replyRequestKey]);

  useLayoutEffect(() => {
    if (!expanded) {
      previousCommentIdsRef.current = threadCommentIds;
      return;
    }

    const previousIds = new Set(previousCommentIdsRef.current);
    const addedIds = threadCommentIds.filter((commentId) => !previousIds.has(commentId));
    if (addedIds.length > 0) {
      setExpandedCommentIds((current) => {
        const next = new Set(current);
        for (const commentId of addedIds) next.add(commentId);
        return next;
      });
    }
    previousCommentIdsRef.current = threadCommentIds;
  }, [expanded, threadCommentIdKey]);

  useEffect(() => () => stopDeleteTimer(), []);

  const setNoteElement = useCallback(
    (element: HTMLElement | null) => {
      sectionRef.current = element;
      noteRef(element);
    },
    [noteRef],
  );

  function submit() {
    onAddComment(annotation.id, draft);
    setDraft('');
    setCaretIndex(0);
  }

  function stopDeleteTimer() {
    if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
  }

  function clearDeleteHold() {
    stopDeleteTimer();
    setDeleteHolding(false);
  }

  function startDeleteHold(event: React.PointerEvent<HTMLButtonElement>) {
    if (deleteTimerRef.current !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDeleteHolding(true);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      onDelete(annotation.id);
    }, DELETE_HOLD_MS);
  }

  function selectAgent(agent: PublicAgent) {
    insertAgent(agent);
  }

  function insertAgent(agent: PublicAgent) {
    const next = mentionDraftWithAgent(draft, agent.username, mentionQuery);
    setDraft(next.content);
    setCaretIndex(next.caretIndex);
    setAgentTrayOpen(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  function updateCaret(element: HTMLTextAreaElement) {
    setCaretIndex(element.selectionStart);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (matchedAgents.length > 0 && event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedMentionIndex((index) => (index + 1) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedMentionIndex((index) => (index - 1 + matchedAgents.length) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'Tab') {
      event.preventDefault();
      selectAgent(matchedAgents[selectedMentionIndex] || matchedAgents[0]);
      return;
    }

    if (isMessageSendShortcutEvent(event, messageSendShortcut)) {
      event.preventDefault();
      submit();
    }
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp') return;
    updateCaret(event.currentTarget);
  }

  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (active) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('button,textarea,input,a,[role="button"]')) return;
    onFocus(annotation.id);
  }

  function toggleComments() {
    if (expanded) {
      setExpanded(false);
      setExpandedCommentIds(new Set());
      setAgentTrayOpen(false);
      return;
    }

    if (!active) onFocus(annotation.id);
    previousCommentIdsRef.current = threadCommentIds;
    setExpandedCommentIds(new Set());
    setExpanded(true);
    setAgentTrayOpen(false);
  }

  function setCommentExpanded(commentId: string, nextExpanded: boolean) {
    setExpandedCommentIds((current) => {
      const next = new Set(current);
      if (nextExpanded) next.add(commentId);
      else next.delete(commentId);
      return next;
    });
  }

  function closeAgentTrayOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setAgentTrayOpen(false);
  }

  return (
    <section
      className={[
        'reader-note',
        active ? 'is-active' : '',
        exiting ? 'is-filtering-out' : '',
        stackCount > 1 ? 'is-stacked' : '',
        isStackFront ? 'is-stack-front' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-stack-count={stackCount}
      data-stack-index={stackIndex}
      data-annotation-id={annotation.id}
      ref={setNoteElement}
      style={annotationStyle}
      onClick={handleCardClick}
    >
      <div className="reader-note-body">
        <div className="reader-note-action-row">
          {annotation.annotationType ? (
            <span className="reader-note-type">
              <AnnotationTypeLabelContent type={annotation.annotationType} />
            </span>
          ) : null}
          {annotation.readingIntent ? (
            <span className="reader-note-intent">
              <ReadingIntentLabelContent intent={annotation.readingIntent} />
            </span>
          ) : null}
          <time dateTime={annotation.createdAt}>{formatTime(annotation.createdAt)}</time>
        </div>
        <button className="reader-note-anchor" type="button" onClick={() => onFocus(annotation.id)}>
          <span className="reader-note-persona">
            <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
            <strong>{author.nickname}</strong>
            <em>@{author.username}</em>
          </span>
        </button>
        <button className="reader-note-quote" type="button" onClick={() => onFocus(annotation.id)}>
          “{annotation.anchor.exact}”
        </button>
        {primaryComment ? (
          <div className="reader-note-primary-comment">
            <MarkdownContent content={primaryComment.content} pending={primaryComment.pending} />
          </div>
        ) : null}
        <div className="reader-note-toolbar">
          <button
            className="reader-comment-toggle"
            type="button"
            aria-controls={commentsPanelId}
            aria-expanded={expanded}
            onClick={toggleComments}
          >
            <MessageSquare size={14} />
            {threadComments.length} 条评论
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            className={deleteHolding ? 'reader-delete-note is-holding' : 'reader-delete-note'}
            style={{ '--delete-hold-ms': `${DELETE_HOLD_MS}ms` } as React.CSSProperties}
            type="button"
            aria-label="长按删除批注"
            onClick={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
            onPointerCancel={clearDeleteHold}
            onPointerDown={startDeleteHold}
            onPointerLeave={clearDeleteHold}
            onPointerUp={clearDeleteHold}
          >
            <Trash2 size={13} />
            <span>长按删除</span>
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="reader-note-comments-region" id={commentsPanelId}>
          <div className="reader-note-comments-panel">
            <header>
              <div>
                <strong>评论</strong>
                <span>{threadComments.length} 条</span>
              </div>
              <button type="button" onClick={toggleComments} aria-label="收起评论">
                <ChevronUp size={14} />
                <span>收起</span>
              </button>
            </header>
            <div className="reader-comments">
              {threadComments.map((comment) => {
                const commentAuthor = commentPersona(comment, userProfile, agents);
                const commentExpanded = expandedCommentIds.has(comment.id);
                return (
                  <div className="reader-comment" key={comment.id}>
                    <AvatarBadge avatar={commentAuthor.avatar} fallback={commentAuthor.fallback} />
                    <div className="reader-comment-body">
                      <div className="reader-comment-author">
                        <strong>{commentAuthor.nickname}</strong>
                        <em>@{commentAuthor.username}</em>
                        {comment.readingIntent ? (
                          <span>
                            <ReadingIntentLabelContent intent={comment.readingIntent} />
                          </span>
                        ) : null}
                        {comment.questionStatus ? (
                          <span>{questionStatusLabel(comment.questionStatus)}</span>
                        ) : null}
                        <time dateTime={comment.createdAt}>{formatTime(comment.createdAt)}</time>
                      </div>
                      <CommentMarkdownContent
                        content={comment.content}
                        expanded={commentExpanded}
                        pending={comment.pending}
                        onExpandedChange={(nextExpanded) =>
                          setCommentExpanded(comment.id, nextExpanded)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="reader-comment-box">
              <textarea
                aria-label="评论内容"
                ref={textareaRef}
                placeholder="继续评论，输入 @ 呼叫助手"
                value={draft}
                onChange={(event) => {
                  setDraft(event.currentTarget.value);
                  updateCaret(event.currentTarget);
                }}
                onClick={(event) => updateCaret(event.currentTarget)}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                onSelect={(event) => updateCaret(event.currentTarget)}
              />
              {matchedAgents.length > 0 ? (
                <div className="reader-agent-menu">
                  {matchedAgents.map((agent, index) => (
                    <button
                      className={index === selectedMentionIndex ? 'is-active' : ''}
                      key={agent.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectAgent(agent)}
                    >
                      <AvatarBadge avatar={agent.avatar} />
                      <strong>{agent.nickname}</strong>
                      <em>@{agent.username}</em>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="reader-note-footer">
              <div className="reader-comment-agent-tray">
                <span className="reader-comment-mention-label" aria-hidden="true">
                  @
                </span>
                {visibleMentionAgents.map((agent) => (
                  <button
                    className="reader-comment-agent-avatar"
                    key={agent.id}
                    type="button"
                    aria-label={`插入 @${agent.username}`}
                    title={`${agent.nickname} @${agent.username}`}
                    onClick={() => insertAgent(agent)}
                  >
                    <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
                  </button>
                ))}
                {overflowMentionAgents.length > 0 ? (
                  <div className="reader-comment-agent-more" onBlur={closeAgentTrayOnBlur}>
                    <button
                      className="reader-comment-agent-more-button"
                      type="button"
                      aria-expanded={agentTrayOpen}
                      aria-label={`更多助手，${overflowMentionAgents.length} 个`}
                      title={`更多助手，${overflowMentionAgents.length} 个`}
                      onClick={() => setAgentTrayOpen((open) => !open)}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {agentTrayOpen ? (
                      <div className="reader-comment-agent-more-menu">
                        {overflowMentionAgents.map((agent) => (
                          <button key={agent.id} type="button" onClick={() => insertAgent(agent)}>
                            <AvatarBadge
                              avatar={agent.avatar}
                              fallback={agent.nickname.slice(0, 1)}
                            />
                            <strong>{agent.nickname}</strong>
                            <em>@{agent.username}</em>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                className="reader-add-comment"
                type="button"
                aria-label="添加评论"
                onClick={submit}
              >
                <SubmitShortcutKeys
                  shortcut={messageSendShortcut}
                  shortcutModifier={shortcutModifier}
                />
                <span>发送</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CommentMarkdownContent({
  content,
  expanded,
  pending,
  onExpandedChange,
}: {
  content: string;
  expanded: boolean;
  pending?: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [collapsible, setCollapsible] = useState(false);
  const html = useMemo(() => renderMarkdown(content), [content]);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const target = element;

    function measure() {
      const styles = window.getComputedStyle(target);
      const lineHeight = Number.parseFloat(styles.lineHeight) || 21;
      setCollapsible(target.scrollHeight > lineHeight * 4 + 1);
    }

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [content, expanded]);

  return (
    <div
      className={[
        'reader-markdown',
        'reader-comment-markdown',
        collapsible && !expanded ? 'is-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="reader-markdown-content"
        ref={contentRef}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {pending ? <i className="reader-spinner" /> : null}
      {collapsible ? (
        <button
          className="reader-comment-expand"
          type="button"
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? '收起' : '展开'}
        </button>
      ) : null}
    </div>
  );
}

function MarkdownContent({ content, pending }: { content: string; pending?: boolean }) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div className="reader-markdown">
      <div className="reader-markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
      {pending ? <i className="reader-spinner" /> : null}
    </div>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return value;

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) return '刚刚';

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} 小时前`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays === 1) return '昨天';
  if (elapsedDays < 7) return `${elapsedDays} 天前`;

  return formatTime(value);
}

function annotationMentionAgents(annotation: Annotation, agents: PublicAgent[]) {
  const authorAgent =
    annotation.author === 'ai' && annotation.agentUsername
      ? agents.find(
          (agent) => agent.id === annotation.agentId || agent.username === annotation.agentUsername,
        ) || {
          id: annotation.agentId || `agent-${annotation.agentUsername}`,
          kind: 'annotation' as const,
          enabled: true,
          nickname: annotation.agentNickname || annotation.agentUsername,
          username: annotation.agentUsername,
          avatar: annotation.agentAvatar || annotation.agentUsername.slice(0, 1),
          annotationColor: annotation.agentAnnotationColor || annotation.color,
          annotationDensity: 'medium' as const,
          personalityName: '批注助手',
          temperature: 0.35,
        }
      : null;
  const ordered = authorAgent
    ? [authorAgent, ...agents.filter((agent) => agent.username !== authorAgent.username)]
    : agents;
  return ordered;
}

function matchesAgentMentionQuery(agent: PublicAgent, query: string) {
  const normalizedQuery = normalizeMentionSearch(query);
  if (!normalizedQuery) return true;

  return [agent.username, agent.nickname, agent.pinyin || ''].some((value) =>
    normalizeMentionSearch(value).includes(normalizedQuery),
  );
}

function normalizeMentionSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function noteStyle(color: string, active: boolean): React.CSSProperties {
  const accent = color || '#f4c95d';
  return {
    borderColor: alphaColor(accent, active ? 0.82 : 0.38),
    boxShadow: active
      ? `0 0 0 3px ${alphaColor(accent, 0.18)}, 0 10px 34px rgba(55,42,24,.08)`
      : undefined,
  };
}

function questionCardStyle(color: string): React.CSSProperties {
  const accent = color || '#f4c95d';
  return {
    borderColor: alphaColor(accent, 0.42),
    boxShadow: `inset 3px 0 0 ${alphaColor(accent, 0.58)}, 0 8px 22px rgba(55,42,24,.06)`,
  };
}

function alphaColor(color: string, alpha: number) {
  const hex = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(244,201,93,${alpha})`;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function isImageAvatar(value: string) {
  return (
    value.startsWith('data:image/') ||
    value.startsWith('blob:') ||
    value.startsWith('http') ||
    value.startsWith('/')
  );
}

function isSvgAvatar(value: string) {
  return value.startsWith('data:image/svg+xml') || value.endsWith('.svg');
}
