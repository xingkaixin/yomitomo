import type {
  Agent,
  AgentAnnotationDensity,
  AgentKind,
  DesktopStore,
  LlmProvider,
  UserProfile,
} from '@yomitomo/shared';
import {
  agentPersonalities,
  annotationAgentPersonalities,
  customPersonality,
  customPersonalityId,
  defaultAgentSoul,
  providerPresets,
  reviewAgentPersonalities,
} from '@yomitomo/shared';
export type { AgentPersonality } from '@yomitomo/shared';
export {
  agentPersonalities,
  annotationAgentPersonalities,
  customPersonality,
  customPersonalityId,
  defaultAgentSoul,
  reviewAgentPersonalities,
} from '@yomitomo/shared';

export type ProviderDraft = Partial<LlmProvider>;
export type AgentDraft = Partial<Agent> & { personalityId?: string };
export type UserDraft = Partial<UserProfile>;

export const annotationColors = [
  '#f4c95d',
  '#efa927',
  '#8ab6d6',
  '#6fa48f',
  '#9eb376',
  '#d98aa5',
  '#b99ac8',
  '#d58b63',
  '#a7b8e8',
  '#c8b88a',
];


export const agentKindOptions: Array<{
  value: AgentKind;
  label: string;
  description: string;
}> = [
  { value: 'annotation', label: '阅读助手', description: '参与阅读器批注和评论讨论' },
  { value: 'review', label: '审核助手', description: '审读读后卡片和整理产物' },
];

export const annotationDensityOptions: Array<{
  value: AgentAnnotationDensity;
  label: string;
  description: string;
}> = [
  { value: 'low', label: '克制', description: '约 2-4 条' },
  { value: 'medium', label: '标准', description: '约 4-7 条' },
  { value: 'high', label: '积极', description: '约 7-12 条' },
];

export const defaultUser: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: annotationColors[0],
  updatedAt: '',
};

const defaultProviderPreset = providerPresets.find((preset) => preset.id === 'anthropic');

export const emptyProvider: ProviderDraft = {
  presetId: defaultProviderPreset?.id,
  name: defaultProviderPreset?.name || 'Anthropic',
  type: defaultProviderPreset?.type || 'anthropic',
  logo: defaultProviderPreset?.logo,
  baseUrl: defaultProviderPreset?.baseUrl || 'https://api.anthropic.com',
  modelName: defaultProviderPreset?.modelName || 'claude-sonnet-4-5',
  modelNames: defaultProviderPreset?.modelNames,
  modelInputMode: 'list',
  apiKey: '',
  reasoningEffort: 'default',
};

export const emptyStore: DesktopStore = {
  user: defaultUser,
  settings: {},
  providers: [],
  agents: [],
  articles: [],
};

export function createEmptyAgent(
  defaultAvatar: string,
  kind: AgentKind = 'annotation',
): AgentDraft {
  const personality =
    kind === 'review' ? reviewAgentPersonalities[0] : annotationAgentPersonalities[0];

  return {
    kind,
    nickname: kind === 'review' ? '审核助手' : '阅读伙伴',
    username: kind === 'review' ? 'reviewer' : 'yomitomo',
    avatar: defaultAvatar,
    annotationColor: annotationColors[1],
    annotationDensity: 'medium',
    personalityId: personality?.id,
    temperature: personality?.temperature ?? 0.35,
    soul: personality?.soul || defaultAgentSoul,
  };
}

export function findAgentPersonalityId(soul: string) {
  return (
    agentPersonalities.find((personality) => personality.soul === soul)?.id || customPersonalityId
  );
}

export function agentPersonalityName(agent: Agent) {
  return (
    agentPersonalities.find((personality) => personality.soul === agent.soul)?.name || '自定义个性'
  );
}

export function agentKindLabel(kind: AgentKind | undefined) {
  return (
    agentKindOptions.find((option) => option.value === (kind || 'annotation'))?.label || '阅读助手'
  );
}

export function personalitiesForKind(kind: AgentKind | undefined) {
  const normalizedKind = kind || 'annotation';
  return agentPersonalities.filter((personality) => personality.kind === normalizedKind);
}

export function userDraftHasChanges(draft: UserDraft, user: UserProfile) {
  return (
    (draft.nickname || '').trim() !== user.nickname ||
    (draft.username || '').trim() !== user.username ||
    (draft.avatar || '') !== user.avatar ||
    (draft.annotationColor || '') !== user.annotationColor
  );
}

export function providerDraftHasChanges(draft: ProviderDraft, provider: LlmProvider | null) {
  if (!provider) return true;

  return (
    (draft.name || '').trim() !== provider.name ||
    (draft.type || 'anthropic') !== provider.type ||
    (draft.presetId || '') !== (provider.presetId || '') ||
    (draft.logo || '') !== (provider.logo || '') ||
    (draft.baseUrl || '').trim() !== provider.baseUrl ||
    (draft.apiKey || '').trim() !== provider.apiKey ||
    (draft.modelName || '').trim() !== provider.modelName ||
    modelNamesChanged(draft.modelNames, provider.modelNames) ||
    (draft.modelInputMode || 'list') !== (provider.modelInputMode || 'list') ||
    (draft.reasoningEffort || 'default') !== (provider.reasoningEffort || 'default')
  );
}

export function agentDraftHasChanges(draft: AgentDraft, agent: Agent | null) {
  if (!agent) return true;

  const personalityId =
    draft.personalityId || findAgentPersonalityId(draft.soul || defaultAgentSoul);
  const personality = agentPersonalities.find((item) => item.id === personalityId);
  const soul = personality?.soul || draft.soul || '';
  const temperature =
    personality?.temperature ?? draft.temperature ?? customPersonality.temperature;

  return (
    (draft.providerId || '') !== agent.providerId ||
    (draft.kind || 'annotation') !== (agent.kind || 'annotation') ||
    (draft.nickname || '').trim() !== agent.nickname ||
    (draft.username || '').trim() !== agent.username ||
    (draft.avatar || '').trim() !== agent.avatar ||
    (draft.annotationColor || '') !== agent.annotationColor ||
    (draft.annotationDensity || 'medium') !== agent.annotationDensity ||
    Math.abs(Number(temperature) - agent.temperature) > 0.001 ||
    soul.trim() !== agent.soul
  );
}

export function isValidUsername(value: string) {
  return /^[A-Za-z0-9_]+$/.test(value.trim());
}

function modelNamesChanged(left: string[] | undefined, right: string[] | undefined) {
  const leftNames = left || [];
  const rightNames = right || [];
  return (
    leftNames.length !== rightNames.length ||
    leftNames.some((item, index) => item !== rightNames[index])
  );
}

export function sanitizeUsernameInput(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
}
