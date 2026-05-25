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
import type { AgentReadingIntent, AnnotationType, MessageSendShortcut } from '@yomitomo/shared';
import { agentReadingIntentLabel, agentReadingIntentOptions } from '@yomitomo/shared';
import { annotationTypeLabel } from '@yomitomo/core';
import { Kbd } from './components/ui/kbd';
import { messageSendShortcutKeys } from './reader-shortcuts';

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
