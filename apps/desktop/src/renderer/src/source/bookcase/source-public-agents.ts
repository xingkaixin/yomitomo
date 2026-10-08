import type { Agent, PublicAgent, UiLanguage } from '@yomitomo/shared';
import { resolveAgentPresetId, resolveAgentPublicIdentity } from '@yomitomo/shared';
import { resolveAgentPersonaAssets } from '../../settings/agent-persona-assets';

export function publicAnnotationAgents(
  agents: Agent[],
  uiLanguage?: UiLanguage,
  options: { includeDisabled?: boolean } = {},
): PublicAgent[] {
  return agents
    .filter((agent) => agent.kind === 'annotation' && (options.includeDisabled || agent.enabled))
    .map((agent) => publicAgentWithPersonaAssets(agent, uiLanguage));
}

export function publicReviewAgents(agents: Agent[], uiLanguage?: UiLanguage): PublicAgent[] {
  return agents
    .filter((agent) => agent.kind === 'review' && agent.enabled)
    .map((agent) => publicAgentWithPersonaAssets(agent, uiLanguage));
}

// Resolves authors of saved annotations and comments, including disabled agents.
export function publicPersonaAgents(agents: Agent[], uiLanguage?: UiLanguage): PublicAgent[] {
  return agents.map((agent) => publicAgentWithPersonaAssets(agent, uiLanguage));
}

export function publicAgentWithPersonaAssets(agent: Agent, uiLanguage?: UiLanguage): PublicAgent {
  const publicAgent = resolveAgentPublicIdentity(agent, uiLanguage);
  const assets = resolveAgentPersonaAssets(uiLanguage || 'zh-CN', resolveAgentPresetId(agent));
  return assets ? { ...publicAgent, avatar: assets.avatar } : publicAgent;
}
