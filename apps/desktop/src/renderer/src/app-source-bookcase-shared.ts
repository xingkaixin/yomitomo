import type {
  Agent,
  AgentMentionDirective,
  AgentMentionRoutePlan,
  AgentReadingIntent,
  AgentReadingPlanItem,
  Annotation,
  ArticleReadingProgress,
  ArticleRecord,
  MessageSendShortcut,
  PublicAgent,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import { agentPersonalities, agentPersonalityName } from '@yomitomo/shared';
import { findMentionedAgents, sortAnnotations, type HighlightBox } from '@yomitomo/core';
import { mergeAgentAnnotationAsThought } from '@yomitomo/reader-ui/reader-agent-annotation-playback';
import type { SelectionAction } from '@yomitomo/reader-ui/reader-app-view';
import type { ReaderSettings } from '@yomitomo/reader-ui/reader-types';
import { annotationNavigationForReferenceIndex } from '@yomitomo/reader-ui/reader-navigation';
import { clampNumber, defaultReaderSettings } from '@yomitomo/reader-ui/reader-settings';
import type { ArticleUpdater, PromptArticle } from './app-reading-types';

const DESKTOP_READER_SETTINGS_KEY = 'yomitomo.desktop.readerSettings';

export type SourceSelectionAction = SelectionAction;

export function defaultTocOpen() {
  return false;
}

export function usesOverlayToc() {
  return true;
}

export function buildAnnotationConnectionPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 1) {
    return `M ${formatPathNumber(startX)} ${formatPathNumber(startY)} L ${formatPathNumber(endX)} ${formatPathNumber(endY)}`;
  }

  const normalX = -deltaY / length;
  const normalY = deltaX / length;
  const segmentCount = Math.max(3, Math.min(6, Math.round(length / 74)));
  const amplitude = Math.min(18, Math.max(7, length * 0.035));
  const points = Array.from({ length: segmentCount + 1 }, (_, index) => {
    const progress = index / segmentCount;
    const endpoint = index === 0 || index === segmentCount;
    const direction = index % 2 === 0 ? -1 : 1;
    const offset = endpoint ? 0 : Math.sin(Math.PI * progress) * amplitude * direction;
    return {
      x: startX + deltaX * progress + normalX * offset,
      y: startY + deltaY * progress + normalY * offset,
    };
  });

  return smoothPathThroughPoints(points);
}

function smoothPathThroughPoints(points: Array<{ x: number; y: number }>) {
  const first = points[0];
  let path = `M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[Math.min(points.length - 1, index + 2)];
    const control1X = current.x + (next.x - previous.x) / 6;
    const control1Y = current.y + (next.y - previous.y) / 6;
    const control2X = next.x - (afterNext.x - current.x) / 6;
    const control2Y = next.y - (afterNext.y - current.y) / 6;

    path += ` C ${formatPathNumber(control1X)} ${formatPathNumber(control1Y)}, ${formatPathNumber(control2X)} ${formatPathNumber(control2Y)}, ${formatPathNumber(next.x)} ${formatPathNumber(next.y)}`;
  }

  return path;
}

function formatPathNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function readDesktopReaderSettings(): ReaderSettings {
  if (typeof window === 'undefined') return defaultReaderSettings;

  try {
    const raw = window.localStorage.getItem(DESKTOP_READER_SETTINGS_KEY);
    if (!raw) return defaultReaderSettings;
    return normalizeDesktopReaderSettings(JSON.parse(raw) as Partial<ReaderSettings>);
  } catch {
    return defaultReaderSettings;
  }
}

export function normalizeDesktopReaderSettings(settings: Partial<ReaderSettings> | undefined) {
  return {
    fontSize: clampNumber(settings?.fontSize, 16, 28, defaultReaderSettings.fontSize),
    contentWidth: clampNumber(
      settings?.contentWidth,
      600,
      1080,
      defaultReaderSettings.contentWidth,
    ),
  };
}

export function writeDesktopReaderSettings(settings: ReaderSettings) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(DESKTOP_READER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}

export function promptArticle(
  currentArticle: ArticleRecord | null,
  articleText: string,
): PromptArticle {
  return {
    id: currentArticle?.id,
    title: currentArticle?.title || '',
    url: currentArticle?.canonicalUrl || currentArticle?.url || '',
    byline: currentArticle?.byline,
    text: articleText,
    ebookIndex: currentArticle?.ebook?.index,
    ebookMetadata: currentArticle?.ebook?.metadata,
  };
}

export function articleWithAnnotations(article: ArticleRecord, annotations: Annotation[]) {
  return {
    ...article,
    annotations: sortAnnotations(annotations),
    updatedAt: new Date().toISOString(),
  };
}

export function articleWithMergedAgentAnnotation(
  article: ArticleRecord,
  annotation: Annotation,
  currentMerge?: ReturnType<typeof mergeAgentAnnotationAsThought> | null,
) {
  const result = currentMerge || mergeAgentAnnotationAsThought(article.annotations, annotation);
  return {
    activeId: result.activeId,
    article: articleWithAnnotations(article, result.annotations),
  };
}

export function navigationForActiveAnnotation(annotations: Annotation[], activeId: string | null) {
  if (!activeId) return null;
  const activeIndex = annotations.findIndex((annotation) => annotation.id === activeId);
  return activeIndex >= 0 ? annotationNavigationForReferenceIndex(annotations, activeIndex) : null;
}

export function annotationViewportPositions(
  annotations: Annotation[],
  boxes: HighlightBox[],
  canvasOffsetTop: number,
) {
  const indexById = new Map(annotations.map((annotation, index) => [annotation.id, index]));
  const positions = new Map<
    string,
    { annotationId: string; index: number; top: number; bottom: number }
  >();

  for (const box of boxes) {
    const index = indexById.get(box.annotationId);
    if (index === undefined) continue;

    const top = canvasOffsetTop + box.top;
    const bottom = top + box.height;
    const current = positions.get(box.annotationId);
    positions.set(box.annotationId, {
      annotationId: box.annotationId,
      index,
      top: current ? Math.min(current.top, top) : top,
      bottom: current ? Math.max(current.bottom, bottom) : bottom,
    });
  }

  return Array.from(positions.values()).toSorted(
    (left, right) => left.top - right.top || left.index - right.index,
  );
}

export function publicAnnotationAgents(agents: Agent[]): PublicAgent[] {
  return agents
    .filter((agent) => agent.kind === 'annotation' && agent.enabled)
    .map((agent) => {
      const personality = agentPersonalities.find(
        (item) => item.id === agent.presetId || item.soul === agent.soul,
      );
      return {
        id: agent.id,
        kind: agent.kind,
        enabled: agent.enabled,
        presetId: agent.presetId,
        nickname: agent.nickname,
        username: agent.username,
        avatar: agent.avatar,
        annotationColor: agent.annotationColor,
        annotationDensity: agent.annotationDensity,
        personalityName: agentPersonalityName(agent),
        pinyin: personality?.pinyin,
        temperature: agent.temperature,
      };
    });
}

export function publicReviewAgents(agents: Agent[]): PublicAgent[] {
  return agents
    .filter((agent) => agent.kind === 'review' && agent.enabled)
    .map((agent) => {
      const personality = agentPersonalities.find(
        (item) => item.id === agent.presetId || item.soul === agent.soul,
      );
      return {
        id: agent.id,
        kind: agent.kind,
        enabled: agent.enabled,
        presetId: agent.presetId,
        nickname: agent.nickname,
        username: agent.username,
        avatar: agent.avatar,
        annotationColor: agent.annotationColor,
        annotationDensity: agent.annotationDensity,
        personalityName: agentPersonalityName(agent),
        pinyin: personality?.pinyin,
        temperature: agent.temperature,
      };
    });
}

export function targetAnchorReadingPlan(
  anchor: Annotation['anchor'] | undefined,
  readingIntent: AgentReadingIntent | undefined,
): AgentReadingPlanItem[] {
  if (!anchor) return [];
  return [
    {
      sectionId: 'target-selection',
      sectionTitle: '选区',
      sectionStart: anchor.start,
      sectionEnd: anchor.end,
      ...(readingIntent ? { readingIntent } : {}),
    },
  ];
}

export function agentInstructionFromNote(note: string, mentionedAgents: PublicAgent[]) {
  let instruction = note.trim();
  for (const agent of mentionedAgents) {
    const handles = [agent.username, agent.nickname].filter(Boolean);
    for (const handle of handles) {
      instruction = instruction.replace(
        new RegExp(`(^|\\s)@${escapeRegExp(handle)}(?=[\\s，。,.!?！？、;；:]|$)`, 'gu'),
        ' ',
      );
    }
  }
  return instruction.replace(/\s+/g, ' ').trim();
}

type MentionRouteRequester = Pick<typeof window.yomitomoDesktop, 'planAgentMentionRoute'>;

export async function planSelectionMentionRoute({
  desktop,
  note,
  targetAnchor,
  agents,
  article,
}: {
  desktop: MentionRouteRequester | undefined;
  note: string;
  targetAnchor: Annotation['anchor'];
  agents: PublicAgent[];
  article: PromptArticle;
}): Promise<AgentMentionRoutePlan> {
  if (agents.length === 0) return { createUserThought: true, directives: [] };
  if (!desktop) return fallbackMentionRoute(note, agents, 'comment');
  try {
    const route = normalizeMentionRoute(
      await desktop.planAgentMentionRoute({
        note,
        targetAnchor,
        agents,
        allowedActions: ['comment', 'create_thought'],
        article,
      }),
      agents,
      ['comment', 'create_thought'],
    );
    return route.directives.length > 0 ? route : fallbackMentionRoute(note, agents, 'comment');
  } catch {
    return fallbackMentionRoute(note, agents, 'comment');
  }
}

export async function routeFocusReadingPlanMessages({
  desktop,
  agent,
  agents,
  article,
  readingPlan,
}: {
  desktop: MentionRouteRequester | undefined;
  agent: PublicAgent;
  agents: PublicAgent[];
  article: PromptArticle;
  readingPlan: AgentReadingPlanItem[];
}): Promise<AgentReadingPlanItem[]> {
  if (!desktop || readingPlan.length === 0) return readingPlan;
  const routed = await Promise.all(
    readingPlan.map(async (item) => ({
      ...item,
      messages: await routeFocusMessagesForAgent({
        desktop,
        agent,
        agents,
        article,
        planItem: item,
      }),
    })),
  );
  return routed;
}

export function mentionDirectivesForAgent(
  route: AgentMentionRoutePlan,
  agent: PublicAgent,
  action?: AgentMentionDirective['action'],
) {
  return route.directives
    .filter(
      (directive) =>
        directive.agentId === agent.id ||
        directive.agentUsername === agent.username ||
        (!directive.agentId && directive.agentUsername === agent.nickname),
    )
    .filter((directive) => !action || directive.action === action);
}

function fallbackMentionRoute(
  note: string,
  agents: PublicAgent[],
  action: AgentMentionDirective['action'],
): AgentMentionRoutePlan {
  const instruction = agentInstructionFromNote(note, agents);
  return {
    createUserThought: Boolean(instruction),
    directives: agents.map((agent) => ({
      agentId: agent.id,
      agentUsername: agent.username,
      action,
      instruction: instruction || undefined,
    })),
  };
}

function normalizeMentionRoute(
  route: AgentMentionRoutePlan,
  agents: PublicAgent[],
  allowedActions: AgentMentionDirective['action'][],
) {
  const allowed = new Set(allowedActions);
  const agentIds = new Set(agents.map((agent) => agent.id));
  const agentUsernames = new Set(agents.map((agent) => agent.username));
  const directives = route.directives.filter(
    (directive) =>
      allowed.has(directive.action) &&
      ((directive.agentId && agentIds.has(directive.agentId)) ||
        agentUsernames.has(directive.agentUsername)),
  );
  return { createUserThought: route.createUserThought, directives };
}

async function routeFocusMessagesForAgent({
  desktop,
  agent,
  agents,
  article,
  planItem,
}: {
  desktop: MentionRouteRequester;
  agent: PublicAgent;
  agents: PublicAgent[];
  article: PromptArticle;
  planItem: AgentReadingPlanItem;
}) {
  const messages = planItem.messages || [];
  if (messages.length === 0) return messages;
  const routed = await Promise.all(
    messages.map(async (message) => {
      const mentionedAgents = findMentionedAgents(message.content, agents);
      if (mentionedAgents.length === 0) return [message];
      if (!mentionedAgents.some((item) => item.id === agent.id)) return [];
      try {
        const route = normalizeMentionRoute(
          await desktop.planAgentMentionRoute({
            note: message.content,
            targetSection: {
              sectionId: planItem.sectionId,
              sectionTitle: planItem.sectionTitle,
              text: article.text.slice(planItem.sectionStart, planItem.sectionEnd),
            },
            agents: mentionedAgents,
            allowedActions: ['create_thought'],
            article,
          }),
          mentionedAgents,
          ['create_thought'],
        );
        const directives = mentionDirectivesForAgent(route, agent, 'create_thought');
        if (directives.length === 0) {
          return [
            {
              ...message,
              content:
                agentInstructionFromNote(message.content, mentionedAgents) || message.content,
              agentId: agent.id,
              agentUsername: agent.username,
              agentNickname: agent.nickname,
              agentIds: [agent.id],
              agentUsernames: [agent.username],
              agentNicknames: [agent.nickname],
            },
          ];
        }
        return directives.map((directive) =>
          Object.assign({}, message, {
            content:
              directive.instruction ||
              agentInstructionFromNote(message.content, mentionedAgents) ||
              message.content,
            agentId: agent.id,
            agentUsername: agent.username,
            agentNickname: agent.nickname,
            agentIds: [agent.id],
            agentUsernames: [agent.username],
            agentNicknames: [agent.nickname],
          }),
        );
      } catch {
        return [
          {
            ...message,
            content: agentInstructionFromNote(message.content, mentionedAgents) || message.content,
            agentId: agent.id,
            agentUsername: agent.username,
            agentNickname: agent.nickname,
            agentIds: [agent.id],
            agentUsernames: [agent.username],
            agentNicknames: [agent.nickname],
          },
        ];
      }
    }),
  );
  return routed.flat();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rendererPerformanceElapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

export function recordRendererPerformanceTiming(event: string, data: Record<string, unknown>) {
  void window.yomitomoDesktop?.recordPerformanceTiming?.({ event, data });
}

export type SourceBookcaseProps = {
  agents: Agent[];
  annotations: Annotation[];
  article: ArticleRecord | null;
  focusAnnotationId: string | null;
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  selectedAnnotationId: string | null;
  userProfile: UserProfile;
  onFocusedAnnotation: () => void;
  onClose: () => void;
  onDeleteArticleAnnotation?: (articleId: string, annotationId: string) => Promise<void> | void;
  onDeleteArticleComment?: (
    articleId: string,
    annotationId: string,
    commentId: string,
  ) => Promise<void> | void;
  onOpenAnnotation: (annotationId: string | null) => void;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  onSaveArticleReadingProgress: (
    articleId: string,
    progress: ArticleReadingProgress,
  ) => Promise<void> | void;
  onUpdateArticle: (articleId: string, update: ArticleUpdater) => Promise<void> | void;
};

export type WebSourceBookcaseProps = Omit<SourceBookcaseProps, 'article'> & {
  article: ArticleRecord;
};

export type EbookArticleRecord = ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> };

export type EbookBookcaseProps = Omit<SourceBookcaseProps, 'article'> & {
  article: EbookArticleRecord;
};
