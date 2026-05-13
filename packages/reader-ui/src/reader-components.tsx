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
  CircleUserRound,
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
  FocusCoReadingMessage,
  FocusCoReadingPlan,
  FocusCoReadingSectionPlan,
  MessageSendShortcut,
  PublicAgent,
  QuestionStatus,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import {
  agentReadingIntentLabel,
  agentReadingIntentOptions,
  makeId,
  normalizeSelectionActionShortcuts,
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

export type AgentDockItem = {
  agent: PublicAgent;
  state: 'active' | 'done';
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
const coReadingAnalysisPhases = [
  '扫描章节边界',
  '提炼章节主旨',
  '读取助手角色卡',
  '生成分配方案',
] as const;
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
  shortcuts,
  onAnnotate,
  onCopy,
}: {
  action: SelectionMenuAction;
  shortcuts?: Partial<SelectionActionShortcuts>;
  onAnnotate: () => void;
  onCopy: () => void;
}) {
  const shortcutKeys = normalizeSelectionActionShortcuts(shortcuts);

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
        <Kbd className="reader-kbd">{shortcutKeys.copy}</Kbd>
      </button>
      <button className="reader-selection-primary" type="button" onClick={onAnnotate}>
        <MessageSquarePlus size={15} strokeWidth={2.2} />
        添加批注
        <Kbd className="reader-kbd">{shortcutKeys.annotate}</Kbd>
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
                    <ReadingIntentLabelContent intent={annotation.readingIntent} short />
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
  const markerId = React.useId().replace(/:/g, '');
  return (
    <svg className="reader-annotation-connection" aria-hidden="true">
      <defs>
        <marker
          id={markerId}
          markerHeight="14"
          markerUnits="userSpaceOnUse"
          markerWidth="14"
          orient="auto"
          refX="10"
          refY="7"
          viewBox="0 0 12 14"
        >
          <path
            className="reader-annotation-arrowhead"
            d="M1.2 2.2 C4.3 4 7 6.1 10 7 M10 7 C6.8 7.6 4.2 9.2 1.3 11.8"
            style={{ stroke: connection.color }}
          />
        </marker>
      </defs>
      <path
        className="reader-annotation-connection-line"
        d={connection.path}
        markerEnd={`url(#${markerId})`}
        style={{ stroke: connection.color }}
      />
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

export function AgentReadingDock({
  completionBurstKey,
  completing,
  items,
}: {
  completionBurstKey: number;
  completing: boolean;
  items: AgentDockItem[];
}) {
  if (items.length === 0) return null;

  return (
    <div
      className={['reader-agent-dock', completing ? 'is-completing' : ''].filter(Boolean).join(' ')}
      aria-label="助手共读状态"
    >
      <div className="reader-agent-dock-list">
        {items.map((item, index) => {
          const color = item.agent.annotationColor || cursorColorFromId(item.agent.id);
          return (
            <div
              className={`reader-agent-dock-item is-${item.state}`}
              key={item.agent.id}
              style={
                {
                  '--agent-color': color,
                  '--reader-dock-delay': `${index * 80}ms`,
                } as React.CSSProperties
              }
              title={`${item.agent.nickname}${item.state === 'active' ? ' 正在共读' : ' 已完成'}`}
            >
              <AvatarBadge avatar={item.agent.avatar} fallback={item.agent.nickname.slice(0, 1)} />
            </div>
          );
        })}
      </div>
      {completionBurstKey > 0 && completing ? (
        <ReadingCompletionBurst key={completionBurstKey} />
      ) : null}
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
                <ReadingIntentLabelContent intent={annotation.readingIntent} short />
              ) : annotation.annotationType ? (
                <AnnotationTypeLabelContent type={annotation.annotationType} />
              ) : (
                <AnnotationTypeLabelContent type="question" />
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
          typeLabel: comment.readingIntent ? (
            <ReadingIntentLabelContent intent={comment.readingIntent} short />
          ) : (
            <>
              <CornerDownRight
                aria-hidden="true"
                className="reader-reading-intent-icon"
                focusable="false"
                size={13}
                strokeWidth={2.3}
              />
              追问
            </>
          ),
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
  articleId,
  agents,
  annotatingAgents,
  focusCoReadingPlan,
  messageSendShortcut,
  readingSections,
  shortcutModifier,
  onCancel,
  onPlanFocusCoReading,
  onSaveFocusCoReadingPlan,
  onStartAgentPlan,
}: {
  articleId: string;
  agents: PublicAgent[];
  annotatingAgents: string[];
  focusCoReadingPlan?: FocusCoReadingPlan;
  messageSendShortcut: MessageSendShortcut;
  readingSections: ReaderReadingSection[];
  shortcutModifier: string;
  onCancel: () => void;
  onPlanFocusCoReading: (selectedAgentIds: string[]) => Promise<FocusCoReadingPlan>;
  onSaveFocusCoReadingPlan: (plan: FocusCoReadingPlan) => void | Promise<void>;
  onStartAgentPlan: (agent: PublicAgent, readingPlan: AgentReadingPlanItem[]) => void;
}) {
  const availableAgents = useMemo(
    () => agents.filter((agent) => !annotatingAgents.includes(agent.id)),
    [agents, annotatingAgents],
  );
  const [expandedSectionIds, setExpandedSectionIds] = useState<string[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [draftPlan, setDraftPlan] = useState<FocusCoReadingPlan | undefined>(focusCoReadingPlan);
  const [sectionPlans, setSectionPlans] = useState<FocusCoReadingSectionPlan[]>([]);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [messageCaretIndexes, setMessageCaretIndexes] = useState<Record<string, number>>({});
  const [selectedFocusMentionIndex, setSelectedFocusMentionIndex] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [planningProgress, setPlanningProgress] = useState(0);
  const [planError, setPlanError] = useState('');
  const [addingPlanAgents, setAddingPlanAgents] = useState(false);
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const focusMessageTextareaRefs = useRef(new Map<string, HTMLTextAreaElement>());

  useEffect(() => {
    if (!addingPlanAgents && !addingSectionId) return;

    function closeAddMenusOnPointerDown(event: PointerEvent) {
      const clickedAddMenu = event
        .composedPath()
        .some(
          (target) =>
            target instanceof HTMLElement && target.classList.contains('reader-focus-add-wrap'),
        );
      if (clickedAddMenu) return;
      setAddingPlanAgents(false);
      setAddingSectionId(null);
    }

    window.addEventListener('pointerdown', closeAddMenusOnPointerDown, true);
    return () => window.removeEventListener('pointerdown', closeAddMenusOnPointerDown, true);
  }, [addingPlanAgents, addingSectionId]);

  useEffect(() => {
    const saved = focusCoReadingPlan?.selectedAgentIds.filter((id) =>
      availableAgents.some((agent) => agent.id === id),
    );
    setSelectedAgentIds(saved && saved.length > 0 ? saved : []);
  }, [articleId, availableAgents, focusCoReadingPlan?.selectedAgentIds]);

  useEffect(() => {
    setExpandedSectionIds((ids) => {
      const nextIds = ids.filter((id) => readingSections.some((section) => section.id === id));
      return nextIds.length === ids.length ? ids : nextIds;
    });
  }, [readingSections]);

  useEffect(() => {
    setSectionPlans(
      normalizeFocusSectionPlans(focusCoReadingPlan?.sections, readingSections, availableAgents),
    );
    setDraftPlan(focusCoReadingPlan);
  }, [availableAgents, focusCoReadingPlan, readingSections]);

  const sectionPlansById = useMemo(
    () => new Map(sectionPlans.map((section) => [section.sectionId, section])),
    [sectionPlans],
  );
  const selectedRouteAgents = availableAgents.filter((agent) =>
    selectedAgentIds.includes(agent.id),
  );
  const addablePlanAgents = availableAgents.filter((agent) => !selectedAgentIds.includes(agent.id));
  const assignedAgentIds = new Set(sectionPlans.flatMap((section) => section.agentIds));
  const assignedAgentCount = assignedAgentIds.size;
  const plannedSectionCount = sectionPlans.filter((section) => section.agentIds.length > 0).length;
  const canPlan = selectedAgentIds.length > 0 && readingSections.length > 0 && !planning;
  const canStart = plannedSectionCount > 0 && assignedAgentCount > 0;
  const planningPhaseIndex = Math.min(
    coReadingAnalysisPhases.length - 1,
    Math.floor((planningProgress / 100) * coReadingAnalysisPhases.length),
  );

  useEffect(() => {
    if (!planning) return;
    const interval = window.setInterval(() => {
      setPlanningProgress((progress) => Math.min(88, progress + 4));
    }, 420);
    return () => window.clearInterval(interval);
  }, [planning]);

  function addPlanAgent(agentId: string) {
    if (selectedAgentIds.includes(agentId)) return;
    saveSections(sectionPlans, uniqueIds([...selectedAgentIds, agentId]));
  }

  function togglePlanAddMenu() {
    setAddingSectionId(null);
    setAddingPlanAgents((open) => !open);
  }

  function toggleSectionAddMenu(sectionId: string) {
    setAddingPlanAgents(false);
    setAddingSectionId((openId) => (openId === sectionId ? null : sectionId));
  }

  function closePlanAddMenuOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setAddingPlanAgents(false);
  }

  function closeSectionAddMenuOnBlur(event: React.FocusEvent<HTMLDivElement>, sectionId: string) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setAddingSectionId((openId) => (openId === sectionId ? null : openId));
  }

  function removePlanAgent(agentId: string) {
    const nextIds = selectedAgentIds.filter((id) => id !== agentId);
    const nextSections = sectionPlans.map((section) => {
      const agentIds = section.agentIds.filter((id) => id !== agentId);
      return {
        ...section,
        agentIds,
        messages: filterFocusMessagesForAgents(section.messages, agentIds),
      };
    });
    saveSections(nextSections, nextIds);
  }

  async function planCoReading() {
    if (!canPlan) return;
    setPlanning(true);
    setPlanningProgress(6);
    setPlanError('');
    try {
      const plan = await onPlanFocusCoReading(selectedAgentIds);
      const nextSections = normalizeFocusSectionPlans(
        plan.sections,
        readingSections,
        availableAgents,
      );
      setDraftPlan(plan);
      setSectionPlans(nextSections);
      setPlanningProgress(100);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : '共读规划失败');
      setPlanningProgress(100);
    } finally {
      window.setTimeout(() => setPlanning(false), 520);
    }
  }

  function saveSections(
    nextSections: FocusCoReadingSectionPlan[],
    nextSelectedAgentIds = selectedAgentIds,
  ) {
    const now = new Date().toISOString();
    const basePlan = draftPlan || focusCoReadingPlan;
    const normalizedSections = normalizeFocusSectionPlans(
      nextSections,
      readingSections,
      availableAgents,
    ).filter(focusSectionHasContent);
    const plan: FocusCoReadingPlan = {
      id: basePlan?.id || makeId('focus_co_reading'),
      articleId,
      selectedAgentIds: uniqueIds([
        ...nextSelectedAgentIds,
        ...normalizedSections.flatMap((section) => section.agentIds),
      ]),
      sections: normalizedSections,
      createdAt: basePlan?.createdAt || now,
      updatedAt: now,
    };
    setDraftPlan(plan);
    setSelectedAgentIds(plan.selectedAgentIds);
    setSectionPlans(normalizeFocusSectionPlans(plan.sections, readingSections, availableAgents));
    void Promise.resolve(onSaveFocusCoReadingPlan(plan)).catch((error) => {
      setPlanError(error instanceof Error ? error.message : '共读方案保存失败');
    });
  }

  function updateSection(
    sectionId: string,
    update: (section: FocusCoReadingSectionPlan) => FocusCoReadingSectionPlan,
  ) {
    const readerSection = readingSections.find((section) => section.id === sectionId);
    if (!readerSection) return;
    const current = sectionPlansById.get(sectionId) || focusSectionFromReaderSection(readerSection);
    const nextSection = update(current);
    const nextSectionsById = new Map(sectionPlans.map((section) => [section.sectionId, section]));
    if (focusSectionHasContent(nextSection)) nextSectionsById.set(sectionId, nextSection);
    else nextSectionsById.delete(sectionId);
    const nextSections = readingSections.flatMap((section) => {
      const plan = nextSectionsById.get(section.id);
      return plan ? [plan] : [];
    });
    saveSections(nextSections);
  }

  function addSectionAgent(sectionId: string, agentId: string) {
    updateSection(sectionId, (section) => ({
      ...section,
      agentIds: uniqueIds([...section.agentIds, agentId]),
    }));
  }

  function toggleSectionExpanded(sectionId: string) {
    setExpandedSectionIds((ids) =>
      ids.includes(sectionId) ? ids.filter((id) => id !== sectionId) : [...ids, sectionId],
    );
  }

  function removeSectionAgent(sectionId: string, agentId: string) {
    updateSection(sectionId, (section) => {
      const agentIds = section.agentIds.filter((id) => id !== agentId);
      return {
        ...section,
        agentIds,
        messages: filterFocusMessagesForAgents(section.messages, agentIds),
      };
    });
  }

  function addSectionMessage(sectionId: string) {
    const content = messageDrafts[sectionId]?.trim();
    if (!content) return;
    updateSection(sectionId, (section) => ({
      ...section,
      messages: [...section.messages, focusMessageFromDraft(content, section, availableAgents)],
    }));
    setMessageDrafts((drafts) => ({ ...drafts, [sectionId]: '' }));
  }

  function updateFocusMessageDraft(sectionId: string, value: string) {
    setMessageDrafts((drafts) => ({
      ...drafts,
      [sectionId]: value,
    }));
  }

  function updateFocusMessageCaret(sectionId: string, element: HTMLTextAreaElement) {
    setMessageCaretIndexes((indexes) => ({
      ...indexes,
      [sectionId]: element.selectionStart,
    }));
  }

  function getFocusMentionQuery(sectionId: string) {
    return getMentionQuery(messageDrafts[sectionId] || '', messageCaretIndexes[sectionId] || 0);
  }

  function matchedFocusMentionAgents(sectionId: string, sectionAgents: PublicAgent[]) {
    const mentionQuery = getFocusMentionQuery(sectionId);
    if (!mentionQuery) return [];
    return sectionAgents
      .filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query))
      .slice(0, 5);
  }

  function setFocusMessageTextarea(sectionId: string, element: HTMLTextAreaElement | null) {
    if (element) focusMessageTextareaRefs.current.set(sectionId, element);
    else focusMessageTextareaRefs.current.delete(sectionId);
  }

  function insertFocusMessageMention(
    sectionId: string,
    agent: PublicAgent,
    mentionQuery = getFocusMentionQuery(sectionId),
  ) {
    let nextCaretIndex = 0;
    setMessageDrafts((drafts) => {
      const next = mentionDraftWithAgent(drafts[sectionId] || '', agent.nickname, mentionQuery);
      nextCaretIndex = next.caretIndex;
      return {
        ...drafts,
        [sectionId]: next.content,
      };
    });
    setSelectedFocusMentionIndex(0);
    requestAnimationFrame(() => {
      const textarea = focusMessageTextareaRefs.current.get(sectionId);
      textarea?.focus();
      textarea?.setSelectionRange(nextCaretIndex, nextCaretIndex);
      if (textarea) updateFocusMessageCaret(sectionId, textarea);
    });
  }

  function handleFocusMessageKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    sectionId: string,
    matchedAgents: PublicAgent[],
  ) {
    if (matchedAgents.length > 0 && event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedFocusMentionIndex((index) => (index + 1) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedFocusMentionIndex(
        (index) => (index - 1 + matchedAgents.length) % matchedAgents.length,
      );
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'Tab') {
      event.preventDefault();
      insertFocusMessageMention(
        sectionId,
        matchedAgents[selectedFocusMentionIndex] || matchedAgents[0],
      );
      return;
    }

    if (isMessageSendShortcutEvent(event, messageSendShortcut)) {
      event.preventDefault();
      addSectionMessage(sectionId);
    }
  }

  function removeSectionMessage(sectionId: string, messageId: string) {
    updateSection(sectionId, (section) => ({
      ...section,
      messages: section.messages.filter((message) => message.id !== messageId),
    }));
  }

  function startReadingPlan() {
    if (!canStart) return;

    for (const agent of availableAgents) {
      const readingPlan = sectionPlans.flatMap((section) =>
        section.agentIds.includes(agent.id) ? [focusSectionToReadingPlanItem(section, agent)] : [],
      );
      if (readingPlan.length > 0) onStartAgentPlan(agent, readingPlan);
    }

    onCancel();
  }

  return (
    <div className="reader-agent-annotate-menu">
      <header className="reader-plan-header">
        <div>
          <strong>聚焦共读</strong>
          <span>按章节规划助手参与和读者留言，再一起进入批注流</span>
        </div>
        <p>
          <b>{assignedAgentCount}</b> 助手 · <b>{plannedSectionCount}</b> 章节
        </p>
      </header>

      <div className="reader-focus-toolbar">
        <div className="reader-focus-agent-picker" aria-label="参与规划的助手">
          <div className="reader-focus-add-wrap" onBlur={closePlanAddMenuOnBlur}>
            <button
              className="reader-focus-add"
              type="button"
              aria-expanded={addingPlanAgents}
              onClick={togglePlanAddMenu}
            >
              <CircleUserRound size={16} />
              <strong>添加助手</strong>
            </button>
            {addingPlanAgents ? (
              <div className="reader-focus-add-menu">
                {addablePlanAgents.length > 0 ? (
                  addablePlanAgents.map((agent) => (
                    <button key={agent.id} type="button" onClick={() => addPlanAgent(agent.id)}>
                      <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
                      <strong>{agent.nickname}</strong>
                    </button>
                  ))
                ) : (
                  <em>暂无可添加助手</em>
                )}
              </div>
            ) : null}
          </div>
          {selectedRouteAgents.map((agent) => (
            <button
              className="reader-focus-agent-chip"
              key={agent.id}
              type="button"
              onClick={() => removePlanAgent(agent.id)}
            >
              <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
              <strong>{agent.nickname}</strong>
              <X size={13} />
            </button>
          ))}
        </div>
        <button
          className="reader-focus-plan"
          disabled={!canPlan}
          type="button"
          onClick={planCoReading}
        >
          <Sparkles size={15} />
          {planning ? coReadingAnalysisPhases[planningPhaseIndex] : '开始分析文章'}
        </button>
      </div>
      {planning ? (
        <div className="reader-focus-progress">
          <div>
            <strong>{coReadingAnalysisPhases[planningPhaseIndex]}</strong>
            <span>{Math.round(planningProgress)}%</span>
          </div>
          <i>
            <b style={{ width: `${planningProgress}%` }} />
          </i>
        </div>
      ) : null}

      {readingSections.length > 0 ? (
        <section className="reader-focus-card-list" aria-label="共读章节">
          {readingSections.map((section, index) => {
            const plan = sectionPlansById.get(section.id) || focusSectionFromReaderSection(section);
            const sectionAgents = availableAgents.filter((agent) =>
              plan.agentIds.includes(agent.id),
            );
            const addableSectionAgents = availableAgents.filter(
              (agent) => !plan.agentIds.includes(agent.id),
            );
            const mentionAgents = matchedFocusMentionAgents(section.id, sectionAgents);
            const expanded = expandedSectionIds.includes(section.id);
            return (
              <article
                className={`reader-focus-section-card${expanded ? ' is-open' : ''}`}
                key={section.id}
              >
                <button
                  className="reader-focus-card-summary"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggleSectionExpanded(section.id)}
                >
                  <b>§{index + 1}</b>
                  <div className="reader-focus-card-copy">
                    <div className="reader-focus-card-title">
                      <strong>{section.title}</strong>
                      {plan.tag ? <em>{plan.tag}</em> : null}
                    </div>
                    <small>{plan.summary || '展开后可手动安排助手和留言'}</small>
                  </div>
                  <div className="reader-focus-card-agents">
                    {plan.messages.length > 0 ? (
                      <small className="reader-focus-message-count">
                        {plan.messages.length} 条留言
                      </small>
                    ) : null}
                    {sectionAgents.length > 0 ? (
                      sectionAgents.map((agent) => (
                        <i key={agent.id}>
                          <AvatarBadge
                            avatar={agent.avatar}
                            fallback={agent.nickname.slice(0, 1)}
                          />
                          <strong>{agent.nickname}</strong>
                        </i>
                      ))
                    ) : (
                      <small>未分配</small>
                    )}
                  </div>
                  {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {expanded ? (
                  <div className="reader-focus-card-body">
                    <div className="reader-focus-card-section">
                      <strong>已分配助手</strong>
                      <div className="reader-focus-assigned-list">
                        <div
                          className="reader-focus-add-wrap"
                          onBlur={(event) => closeSectionAddMenuOnBlur(event, section.id)}
                        >
                          <button
                            className="reader-focus-add"
                            type="button"
                            aria-expanded={addingSectionId === section.id}
                            onClick={() => toggleSectionAddMenu(section.id)}
                          >
                            <CircleUserRound size={16} />
                            <strong>添加助手</strong>
                          </button>
                          {addingSectionId === section.id ? (
                            <div className="reader-focus-add-menu">
                              {addableSectionAgents.length > 0 ? (
                                addableSectionAgents.map((agent) => (
                                  <button
                                    key={agent.id}
                                    type="button"
                                    onClick={() => addSectionAgent(section.id, agent.id)}
                                  >
                                    <AvatarBadge
                                      avatar={agent.avatar}
                                      fallback={agent.nickname.slice(0, 1)}
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
                        {sectionAgents.map((agent) => (
                          <button
                            className="reader-focus-assigned-chip"
                            key={agent.id}
                            type="button"
                            onClick={() => removeSectionAgent(section.id, agent.id)}
                          >
                            <AvatarBadge
                              avatar={agent.avatar}
                              fallback={agent.nickname.slice(0, 1)}
                            />
                            <strong>{agent.nickname}</strong>
                            <X size={13} />
                          </button>
                        ))}
                      </div>
                    </div>

                    {plan.messages.length > 0 ? (
                      <div className="reader-focus-messages">
                        {plan.messages.map((message) => {
                          const targets = focusMessageTargetAgents(message, availableAgents);
                          return (
                            <div className="reader-focus-message" key={message.id}>
                              <MessageSquare size={14} />
                              <div className="reader-focus-message-body">
                                <p>{message.content}</p>
                                <div className="reader-focus-message-targets">
                                  {targets.length > 0 ? (
                                    targets.map((target) => (
                                      <em key={target.id || target.nickname}>@{target.nickname}</em>
                                    ))
                                  ) : (
                                    <em>全局留言</em>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                aria-label="删除留言"
                                onClick={() => removeSectionMessage(section.id, message.id)}
                              >
                                <X size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <div className="reader-focus-message-input">
                      <div className="reader-focus-message-box">
                        <textarea
                          ref={(element) => setFocusMessageTextarea(section.id, element)}
                          disabled={sectionAgents.length === 0}
                          value={messageDrafts[section.id] || ''}
                          placeholder={
                            sectionAgents.length > 0
                              ? '给助手留言，或 @ 指定助手…'
                              : '添加助手后可留言'
                          }
                          onChange={(event) => {
                            updateFocusMessageDraft(section.id, event.currentTarget.value);
                            updateFocusMessageCaret(section.id, event.currentTarget);
                          }}
                          onClick={(event) =>
                            updateFocusMessageCaret(section.id, event.currentTarget)
                          }
                          onKeyDown={(event) =>
                            handleFocusMessageKeyDown(event, section.id, mentionAgents)
                          }
                          onKeyUp={(event) =>
                            updateFocusMessageCaret(section.id, event.currentTarget)
                          }
                          onSelect={(event) =>
                            updateFocusMessageCaret(section.id, event.currentTarget)
                          }
                        />
                        {mentionAgents.length > 0 ? (
                          <div className="reader-agent-menu reader-focus-agent-menu">
                            {mentionAgents.map((agent, mentionIndex) => (
                              <button
                                className={
                                  mentionIndex === selectedFocusMentionIndex ? 'is-active' : ''
                                }
                                key={agent.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => insertFocusMessageMention(section.id, agent)}
                              >
                                <AvatarBadge
                                  avatar={agent.avatar}
                                  fallback={agent.nickname.slice(0, 1)}
                                />
                                <strong>{agent.nickname}</strong>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="reader-focus-message-footer">
                        <div className="reader-focus-message-agents">
                          <small>可 @ 的助手：</small>
                          {sectionAgents.map((agent) => (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => insertFocusMessageMention(section.id, agent)}
                            >
                              <AvatarBadge
                                avatar={agent.avatar}
                                fallback={agent.nickname.slice(0, 1)}
                              />
                              <strong>{agent.nickname}</strong>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={sectionAgents.length === 0}
                          onClick={() => addSectionMessage(section.id)}
                        >
                          <SubmitShortcutKeys
                            shortcut={messageSendShortcut}
                            shortcutModifier={shortcutModifier}
                          />
                          <MessageSquarePlus size={15} />
                          留言
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : (
        <div className="reader-focus-empty">当前文章缺少可规划章节</div>
      )}

      <div className="reader-plan-footer">
        <p className="reader-plan-help">
          {planError || `${selectedAgentIds.length} 位助手已加入规划`}
        </p>
        <div className="reader-agent-annotate-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button disabled={!canStart} type="button" onClick={startReadingPlan}>
            开始共读
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

function normalizeFocusSectionPlans(
  sections: FocusCoReadingSectionPlan[] | undefined,
  readingSections: ReaderReadingSection[],
  agents: PublicAgent[],
): FocusCoReadingSectionPlan[] {
  const planBySectionId = new Map((sections || []).map((section) => [section.sectionId, section]));
  const agentIds = new Set(agents.map((agent) => agent.id));
  return readingSections.map((readerSection) => {
    const section = planBySectionId.get(readerSection.id);
    const sectionAgentIds = uniqueIds(section?.agentIds || []).filter((agentId) =>
      agentIds.has(agentId),
    );
    return {
      sectionId: readerSection.id,
      sectionTitle: readerSection.title,
      sectionStart: readerSection.start,
      sectionEnd: readerSection.end,
      summary: section?.summary,
      tag: section?.tag,
      targetDensity: section?.targetDensity,
      needsFurtherPlanning: section?.needsFurtherPlanning,
      agentIds: sectionAgentIds,
      messages: filterFocusMessagesForAgents(section?.messages || [], sectionAgentIds),
    };
  });
}

function uniqueIds(ids: string[]) {
  return ids.filter((id, index, list) => Boolean(id) && list.indexOf(id) === index);
}

function focusSectionFromReaderSection(section: ReaderReadingSection): FocusCoReadingSectionPlan {
  return {
    sectionId: section.id,
    sectionTitle: section.title,
    sectionStart: section.start,
    sectionEnd: section.end,
    agentIds: [],
    messages: [],
  };
}

function focusSectionHasContent(section: FocusCoReadingSectionPlan) {
  return (
    section.agentIds.length > 0 ||
    section.messages.length > 0 ||
    Boolean(section.summary) ||
    Boolean(section.tag)
  );
}

function filterFocusMessagesForAgents(
  messages: FocusCoReadingSectionPlan['messages'],
  agentIds: string[],
) {
  if (agentIds.length === 0) return [];
  const allowed = new Set(agentIds);
  return messages.flatMap((message) => filterFocusMessageTargetsForAgents(message, allowed));
}

function focusMessageFromDraft(
  content: string,
  section: FocusCoReadingSectionPlan,
  agents: PublicAgent[],
): FocusCoReadingSectionPlan['messages'][number] {
  const assignedAgents = agents.filter((agent) => section.agentIds.includes(agent.id));
  const targets = mentionedAgentsFromText(content, assignedAgents);
  const target = targets[0];
  const agentIds = targets.map((agent) => agent.id);
  const agentUsernames = targets.map((agent) => agent.username);
  const agentNicknames = targets.map((agent) => agent.nickname);
  return {
    id: makeId('focus_message'),
    content,
    agentId: target?.id,
    agentUsername: target?.username,
    agentNickname: target?.nickname,
    agentIds: agentIds.length > 0 ? agentIds : undefined,
    agentUsernames: agentUsernames.length > 0 ? agentUsernames : undefined,
    agentNicknames: agentNicknames.length > 0 ? agentNicknames : undefined,
    createdAt: new Date().toISOString(),
  };
}

function mentionedAgentsFromText(content: string, agents: PublicAgent[]) {
  return agents.filter((agent) => {
    const handles = [agent.username, agent.nickname].filter(Boolean);
    return handles.some((handle) =>
      new RegExp(`(^|\\s)@${escapeRegExp(handle)}(?=[\\s，。,.!?！？、;；:]|$)`, 'u').test(content),
    );
  });
}

function focusSectionToReadingPlanItem(
  section: FocusCoReadingSectionPlan,
  agent: PublicAgent,
): AgentReadingPlanItem {
  return {
    sectionId: section.sectionId,
    sectionTitle: section.sectionTitle,
    sectionStart: section.sectionStart,
    sectionEnd: section.sectionEnd,
    sectionSummary: section.summary,
    sectionTag: section.tag,
    messages: section.messages
      .filter((message) => focusMessageAppliesToAgent(message, agent.id))
      .map((message) => ({
        content: message.content,
        agentId: message.agentId,
        agentUsername: message.agentUsername,
        agentNickname: message.agentNickname,
        agentIds: message.agentIds,
        agentUsernames: message.agentUsernames,
        agentNicknames: message.agentNicknames,
      })),
  };
}

function focusMessageAgentIds(message: FocusCoReadingMessage) {
  return uniqueIds([...(message.agentIds || []), ...(message.agentId ? [message.agentId] : [])]);
}

function filterFocusMessageTargetsForAgents(
  message: FocusCoReadingMessage,
  allowed: Set<string>,
): FocusCoReadingMessage[] {
  const targetAgentIds = focusMessageAgentIds(message);
  if (targetAgentIds.length === 0) return [message];

  const targets = targetAgentIds
    .map((agentId) => {
      const arrayIndex = message.agentIds?.indexOf(agentId) ?? -1;
      return {
        id: agentId,
        username: arrayIndex >= 0 ? message.agentUsernames?.[arrayIndex] : message.agentUsername,
        nickname: arrayIndex >= 0 ? message.agentNicknames?.[arrayIndex] : message.agentNickname,
      };
    })
    .filter((target) => allowed.has(target.id));
  if (targets.length === 0) return [];

  return [
    {
      ...message,
      agentId: targets[0].id,
      agentUsername: targets[0].username,
      agentNickname: targets[0].nickname,
      agentIds: targets.map((target) => target.id),
      agentUsernames: targets
        .map((target) => target.username)
        .filter((value): value is string => Boolean(value)),
      agentNicknames: targets
        .map((target) => target.nickname)
        .filter((value): value is string => Boolean(value)),
    },
  ];
}

function focusMessageAppliesToAgent(message: FocusCoReadingMessage, agentId: string) {
  const agentIds = focusMessageAgentIds(message);
  return agentIds.length === 0 || agentIds.includes(agentId);
}

function focusMessageTargetAgents(message: FocusCoReadingMessage, agents: PublicAgent[]) {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const fromIds = focusMessageAgentIds(message)
    .map((agentId) => byId.get(agentId))
    .filter((agent): agent is PublicAgent => Boolean(agent));
  if (fromIds.length > 0) return fromIds;
  if (message.agentNickname) {
    return [
      {
        id: message.agentId || message.agentUsername || message.agentNickname,
        nickname: message.agentNickname,
      },
    ];
  }
  return (message.agentNicknames || []).map((nickname, index) => ({
    id: message.agentIds?.[index] || message.agentUsernames?.[index] || nickname,
    nickname,
  }));
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
        <Kbd className={key.length === 1 ? 'reader-kbd reader-kbd-symbol' : 'reader-kbd'} key={key}>
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
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState('');
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
    onSave(note);
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
            {threadComments.length} 条留言
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
                <strong>留言</strong>
                <span>{threadComments.length} 条</span>
              </div>
              <button type="button" onClick={toggleComments} aria-label="收起评论">
                <ChevronUp size={14} />
                <span>收起</span>
              </button>
            </header>
            {threadComments.length > 0 ? (
              <div className="reader-comments">
                {threadComments.map((comment) => {
                  const commentAuthor = commentPersona(comment, userProfile, agents);
                  const commentExpanded = expandedCommentIds.has(comment.id);
                  return (
                    <div className="reader-comment" key={comment.id}>
                      <AvatarBadge
                        avatar={commentAuthor.avatar}
                        fallback={commentAuthor.fallback}
                      />
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
            ) : (
              <div className="reader-comments-empty">还没有留言</div>
            )}
            <div className="reader-comment-box">
              <textarea
                aria-label="留言内容"
                ref={textareaRef}
                placeholder="给这条批注留言，输入 @ 呼叫助手"
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
                aria-label="添加留言"
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
