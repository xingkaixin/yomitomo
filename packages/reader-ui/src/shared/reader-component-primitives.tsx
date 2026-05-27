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
import {
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import type {
  AgentReadingIntent,
  AnnotationType,
  MessageSendShortcut,
  PublicAgent,
} from '@yomitomo/shared';
import { agentReadingIntentLabel, agentReadingIntentOptions } from '@yomitomo/shared';
import { annotationTypeLabel } from '@yomitomo/core';
import { Kbd } from '../components/ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { messageSendShortcutKeys } from '../reader-shortcuts';

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

export function ReadingIntentIcon({
  intent,
  size = 13,
}: {
  intent: AgentReadingIntent;
  size?: number;
}) {
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

export function ReadingIntentLabelContent({
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

export function AnnotationTypeLabelContent({ type }: { type: AnnotationType }) {
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

export function AnnotationTypeIcon({ type }: { type: AnnotationType }) {
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

export function AvatarBadge({ avatar, fallback = 'AI' }: { avatar?: string; fallback?: string }) {
  const value = avatar || fallback;
  const image = isImageAvatar(value);
  const svg = isSvgAvatar(value);
  const classes = ['reader-avatar-badge', image ? 'is-image' : '', svg ? 'is-svg' : '']
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{image ? <img alt="" src={value} /> : value}</span>;
}

type AgentAvatarStackProps = {
  agents: PublicAgent[];
  activeAgentIds?: Set<string> | string[];
  ariaLabel?: string;
  className?: string;
  itemClassName?: string;
  onAgentClick?: (agent: PublicAgent) => void;
};
type AgentAvatarStackStyle = CSSProperties & { '--reader-avatar-color': string };

export function AgentAvatarStack({
  agents,
  activeAgentIds,
  ariaLabel,
  className,
  itemClassName,
  onAgentClick,
}: AgentAvatarStackProps) {
  const [revealedAgentId, setRevealedAgentId] = useState<string | null>(null);
  if (agents.length === 0) return null;

  const activeIds = activeAgentIds instanceof Set ? activeAgentIds : new Set(activeAgentIds || []);

  function revealAgent(event: MouseEvent<HTMLElement>, agentId: string) {
    event.preventDefault();
    event.stopPropagation();
    setRevealedAgentId((current) => (current === agentId ? null : agentId));
  }

  return (
    <span
      className={['reader-agent-avatar-stack', className || ''].filter(Boolean).join(' ')}
      aria-label={ariaLabel || agents.map((agent) => agent.nickname).join('、')}
    >
      {agents.map((agent) => {
        const active = activeIds.has(agent.id);
        const classes = [
          'reader-agent-avatar-stack-item',
          active ? 'is-active' : '',
          revealedAgentId === agent.id ? 'is-revealed' : '',
          itemClassName || '',
        ]
          .filter(Boolean)
          .join(' ');
        const content = (
          <>
            <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
            {revealedAgentId === agent.id ? (
              <b className="reader-agent-avatar-stack-label">{agent.nickname}</b>
            ) : null}
          </>
        );
        const style: AgentAvatarStackStyle = { '--reader-avatar-color': agent.annotationColor };
        const triggerProps = {
          className: classes,
          style,
          onDoubleClick: (event: MouseEvent<HTMLElement>) => revealAgent(event, agent.id),
        };
        const trigger = onAgentClick ? (
          <button
            {...triggerProps}
            type="button"
            aria-label={`@${agent.nickname}`}
            onClick={() => onAgentClick(agent)}
          >
            {content}
          </button>
        ) : (
          <span {...triggerProps}>{content}</span>
        );

        return (
          <ReaderTooltip content={agent.nickname} key={agent.id}>
            {trigger}
          </ReaderTooltip>
        );
      })}
    </span>
  );
}

export function SubmitShortcutKeys({
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

export function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((key) => (
        <Kbd className={key.length === 1 ? 'reader-kbd reader-kbd-symbol' : 'reader-kbd'} key={key}>
          {key}
        </Kbd>
      ))}
    </>
  );
}

export function ShortcutTooltipContent({ label, keys }: { label: string; keys: string[] }) {
  return (
    <span className="reader-shortcut-tooltip">
      <span>{label}</span>
      <span className="reader-shortcut-tooltip-keys">
        <ShortcutKeys keys={keys} />
      </span>
    </span>
  );
}

export function SubmitShortcutTooltipContent({
  label = '快捷键',
  shortcut,
  shortcutModifier,
}: {
  label?: string;
  shortcut: MessageSendShortcut;
  shortcutModifier: string;
}) {
  return (
    <ShortcutTooltipContent
      keys={messageSendShortcutKeys(shortcut, shortcutModifier)}
      label={label}
    />
  );
}

export function ReaderTooltip({
  children,
  content,
  disabled = false,
  side = 'top',
}: {
  children: ReactElement;
  content: ReactNode;
  disabled?: boolean;
  side?: ComponentPropsWithoutRef<typeof TooltipContent>['side'];
}) {
  if (disabled) return children;
  return (
    <TooltipProvider delayDuration={360} skipDelayDuration={80}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
