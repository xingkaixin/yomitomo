import type {
  AgentReadingPlanItem,
  FocusCoReadingMessage,
  FocusCoReadingSectionPlan,
  PublicAgent,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import type { ReaderReadingSection } from '../reader-types';
import { escapeRegExp } from '../reader-mention-utils';

export function normalizeFocusSectionPlans(
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

export function uniqueIds(ids: string[]) {
  return ids.filter((id, index, list) => Boolean(id) && list.indexOf(id) === index);
}

export function focusSectionFromReaderSection(
  section: ReaderReadingSection,
): FocusCoReadingSectionPlan {
  return {
    sectionId: section.id,
    sectionTitle: section.title,
    sectionStart: section.start,
    sectionEnd: section.end,
    agentIds: [],
    messages: [],
  };
}

export function focusSectionHasContent(section: FocusCoReadingSectionPlan) {
  return (
    section.agentIds.length > 0 ||
    section.messages.length > 0 ||
    Boolean(section.summary) ||
    Boolean(section.tag)
  );
}

export function filterFocusMessagesForAgents(
  messages: FocusCoReadingSectionPlan['messages'],
  agentIds: string[],
) {
  if (agentIds.length === 0) return [];
  const allowed = new Set(agentIds);
  return messages.flatMap((message) => filterFocusMessageTargetsForAgents(message, allowed));
}

export function focusMessageFromDraft(
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

export function focusSectionToReadingPlanItem(
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
    targetDensity: section.targetDensity,
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

export function filterFocusMessageTargetsForAgents(
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

export function focusMessageTargetAgents(message: FocusCoReadingMessage, agents: PublicAgent[]) {
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
