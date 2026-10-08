import type {
  AgentMentionDirective,
  AgentMentionRoutePlan,
  AgentReadingIntent,
  AgentReadingPlanItem,
  Annotation,
  PublicAgent,
} from '@yomitomo/shared';
import { findMentionedAgents } from '@yomitomo/core';
import i18next from 'i18next';
import type { PromptArticle } from '../../shell/app-reading-types';
import type { YomitomoDesktopApi } from '../../../../preload';

export function targetAnchorReadingPlan(
  anchor: Annotation['anchor'] | undefined,
  readingIntent: AgentReadingIntent | undefined,
): AgentReadingPlanItem[] {
  if (!anchor) return [];
  return [
    {
      sectionId: 'target-selection',
      sectionTitle: i18next.t('source.selection'),
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

type MentionRouteRequester = Pick<YomitomoDesktopApi['agent'], 'planMentionRoute'>;

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
          await desktop.planMentionRoute({
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
