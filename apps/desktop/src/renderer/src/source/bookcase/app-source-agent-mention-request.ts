import type { AgentMentionDirective, AgentMentionRoutePlan, PublicAgent } from '@yomitomo/shared';

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
