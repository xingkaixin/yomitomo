import type {
  Agent,
  AgentAnnotationDensity,
  AgentKind,
  LlmProvider,
  MessageSendShortcut,
  PublicAgent,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import i18next from 'i18next';
import {
  agentPersonalities,
  annotationAgentPersonalities,
  customPersonality,
  customPersonalityId,
  defaultAgentSoul,
  defaultUserAnnotationColor,
  defaultUserProfile,
  localizedAgentPersonalitiesForKind,
  localizedAgentPersonality,
  providerPresets,
  resolveAgentPublicIdentity,
  resolveAgentPresetId,
  resolveAgentPersonalityPresentation,
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

export type ProviderDraft = Partial<LlmProvider> & { removeApiKey?: boolean };
export type ProviderTestState = { status: 'idle' | 'testing' | 'success' | 'error' };
export type AgentDraft = Partial<Agent> & { personalityId?: string };
export type UserDraft = Partial<UserProfile>;

export const annotationColors = [
  defaultUserAnnotationColor,
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

export const userAnnotationColors = [annotationColors[0], annotationColors[1]];

export const agentKindOptions: Array<{
  value: AgentKind;
}> = [{ value: 'annotation' }, { value: 'review' }];

export const annotationDensityOptions: Array<{
  value: AgentAnnotationDensity;
}> = [{ value: 'low' }, { value: 'medium' }, { value: 'high' }];

export const messageSendShortcutOptions: Array<{
  value: MessageSendShortcut;
}> = [{ value: 'enter' }, { value: 'mod-enter' }];

export { defaultUserProfile as defaultUser };

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

export { emptyDesktopStore as emptyStore } from '../../../app-store';

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

export function agentPersonalityName(agent: Agent, uiLanguage?: UiLanguage) {
  const presentation = resolveAgentPersonalityPresentation(resolveAgentPresetId(agent), uiLanguage);
  return (
    presentation?.name ||
    agentPersonalities.find((personality) => personality.soul === agent.soul)?.name ||
    i18next.t('settings.agents.customPersonality', { defaultValue: 'Custom personality' })
  );
}

export function agentKindLabel(kind: AgentKind | undefined) {
  const normalizedKind = kind || 'annotation';
  return i18next.t(`settings.agents.modes.${normalizedKind}`, { defaultValue: normalizedKind });
}

export function personalitiesForKind(kind: AgentKind | undefined, uiLanguage?: UiLanguage) {
  const normalizedKind = kind || 'annotation';
  return localizedAgentPersonalitiesForKind(normalizedKind, uiLanguage);
}

export function localizedPersonalityForAgent(agent: Agent, uiLanguage?: UiLanguage) {
  const personality = agentPersonalities.find(
    (item) => item.id === (agent.presetId || findAgentPersonalityId(agent.soul)),
  );
  return personality ? localizedAgentPersonality(personality, uiLanguage) : undefined;
}

export function publicAgentForLocale(agent: Agent, uiLanguage?: UiLanguage): PublicAgent {
  return resolveAgentPublicIdentity(agent, uiLanguage);
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
  if (textField(draft.apiKey).trim() || draft.removeApiKey) return true;
  return !recordsEqual(normalizeProviderDraft(draft), normalizeProviderDraft(provider));
}

export function agentDraftHasChanges(draft: AgentDraft, agent: Agent | null) {
  if (!agent) return true;

  const personalityId =
    draft.personalityId || findAgentPersonalityId(draft.soul || defaultAgentSoul);
  const personality = agentPersonalities.find((item) => item.id === personalityId);
  const soul = personality?.soul || draft.soul || '';
  const temperature =
    personality?.temperature ?? draft.temperature ?? customPersonality.temperature;

  return [
    textField(draft.providerId) !== agent.providerId,
    textField(draft.kind, 'annotation') !== textField(agent.kind, 'annotation'),
    textField(draft.presetId) !== textField(agent.presetId),
    draft.enabled !== agent.enabled,
    textField(draft.nickname).trim() !== agent.nickname,
    textField(draft.username).trim() !== agent.username,
    textField(draft.avatar).trim() !== agent.avatar,
    textField(draft.annotationColor) !== agent.annotationColor,
    textField(draft.annotationDensity, 'medium') !== agent.annotationDensity,
    Math.abs(temperature - agent.temperature) > 0.001,
    soul.trim() !== agent.soul,
  ].some(Boolean);
}

export function isValidUsername(value: string) {
  return /^[\p{L}\p{N}_-]+$/u.test(value.trim());
}

function normalizeProviderDraft(draft: ProviderDraft) {
  const normalized: Record<string, unknown> = {
    ...draft,
    name: textField(draft.name).trim(),
    type: textField(draft.type, 'anthropic'),
    presetId: textField(draft.presetId),
    logo: textField(draft.logo),
    baseUrl: textField(draft.baseUrl).trim(),
    modelName: textField(draft.modelName).trim(),
    modelNames: draft.modelNames || [],
    modelInputMode: textField(draft.modelInputMode, 'list'),
    reasoningEffort: textField(draft.reasoningEffort, 'none'),
  };
  for (const field of providerDraftMetadataFields) delete normalized[field];
  return normalized;
}

const providerDraftMetadataFields = [
  'id',
  'apiKey',
  'hasApiKey',
  'createdAt',
  'updatedAt',
  'removeApiKey',
] as const satisfies ReadonlyArray<keyof ProviderDraft>;

function recordsEqual(left: Record<string, unknown>, right: Record<string, unknown>) {
  const fields = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...fields].every((field) => JSON.stringify(left[field]) === JSON.stringify(right[field]));
}

function textField(value: string | undefined, fallback = '') {
  return value || fallback;
}

export function sanitizeUsernameInput(value: string) {
  return value.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 32);
}
