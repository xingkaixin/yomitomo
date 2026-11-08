import type {
  Agent,
  AgentAnnotationDensity,
  AgentKind,
  LlmProvider,
  MessageSendShortcut,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import i18next from 'i18next';
import {
  agentPersonalities,
  customPersonalityId,
  defaultUserAnnotationColor,
  defaultUserProfile,
  localizedAgentPersonalitiesForKind,
  localizedAgentPersonality,
  providerPresets,
  resolveAgentPresetId,
  resolveAgentPersonalityPresentation,
} from '@yomitomo/shared';
export type { AgentPersonality } from '@yomitomo/shared';

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
  modelName: defaultProviderPreset?.modelName || 'deepseek-flash',
  modelNames: defaultProviderPreset?.modelNames,
  modelInputMode: 'list',
  apiKey: '',
  reasoningEffort: 'none',
};

export { emptyDesktopStore as emptyStore } from '../../../app-store';

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

export function userDraftHasChanges(draft: UserDraft, user: UserProfile) {
  return (
    (draft.nickname || '').trim() !== user.nickname ||
    (draft.username || '').trim() !== user.username ||
    (draft.avatar || '') !== user.avatar
  );
}

export function providerDraftHasChanges(draft: ProviderDraft, provider: LlmProvider | null) {
  if (!provider) return true;
  if (textField(draft.apiKey).trim() || draft.removeApiKey) return true;
  return !recordsEqual(normalizeProviderDraft(draft), normalizeProviderDraft(provider));
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
