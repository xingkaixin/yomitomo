import type {
  Agent,
  AgentAnnotationDensity,
  AgentKind,
  DesktopStore,
  LlmProvider,
  MessageSendShortcut,
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

export const userAnnotationColors = ['#f4c95d', '#efa927'];

export const agentKindOptions: Array<{
  value: AgentKind;
  label: string;
  description: string;
}> = [
  { value: 'annotation', label: '阅读助手', description: '参与阅读器批注和评论讨论' },
  { value: 'review', label: '审核助手', description: '审读读后笔记和整理产物' },
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

export const messageSendShortcutOptions: Array<{
  value: MessageSendShortcut;
}> = [{ value: 'enter' }, { value: 'mod-enter' }];

export const defaultUser: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: userAnnotationColors[0],
  updatedAt: '',
};

const defaultProviderPreset = providerPresets.find((preset) => preset.id === 'deepseek');

export const emptyProvider: ProviderDraft = {
  presetId: defaultProviderPreset?.id,
  name: defaultProviderPreset?.name || '深度求索',
  type: defaultProviderPreset?.type || 'openai-chat',
  logo: defaultProviderPreset?.logo,
  baseUrl: defaultProviderPreset?.baseUrl || 'https://api.deepseek.com',
  modelName: defaultProviderPreset?.modelName || 'deepseek-chat',
  modelNames: defaultProviderPreset?.modelNames,
  modelInputMode: 'list',
  apiKey: '',
  reasoningEffort: 'none',
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
    presetId: personality?.id,
    enabled: personality?.defaultEnabled ?? true,
    nickname: kind === 'review' ? '审核助手' : '阅读伙伴',
    username: personality?.name || (kind === 'review' ? '审核助手' : '阅读伙伴'),
    avatar: defaultAvatar,
    annotationColor: personality?.defaultColor || annotationColors[1],
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
    (draft.reasoningEffort || 'none') !== (provider.reasoningEffort || 'none')
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
    (draft.presetId || '') !== (agent.presetId || '') ||
    Boolean(draft.enabled) !== Boolean(agent.enabled) ||
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
  return /^[\p{L}\p{N}_-]+$/u.test(value.trim());
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
  return value.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 32);
}
