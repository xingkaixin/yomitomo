import type {
  Agent,
  AgentAnnotationDensity,
  DesktopStore,
  LlmProvider,
  UserProfile,
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

export const defaultAgentSoul =
  '你是一个克制、敏锐的结对阅读伙伴。优先回应用户正在讨论的文本，给出清晰、具体、可追问的判断。';

export const customPersonalityId = 'custom';

export const agentPersonalities = [
  {
    id: 'reading-partner',
    name: '克制阅读伙伴',
    description: '安静陪伴，适度提醒，帮助你稳步理解与反馈。',
    icon: 'leaf',
    temperature: 0.35,
    soul: defaultAgentSoul,
  },
  {
    id: 'first-principles',
    name: '第一性原理审阅者',
    description: '回到本质，拆解假设，挑战推理与结论。',
    icon: 'pyramid',
    temperature: 0.25,
    soul: '你是一个基于第一性原理思考的阅读伙伴。先拆解概念、约束和因果链，再指出论证里的关键前提、跳跃和可验证判断。',
  },
  {
    id: 'question-coach',
    name: '追问型导师',
    description: '通过追问引导思考，帮助你发现更深层理解。',
    icon: 'question',
    temperature: 0.6,
    soul: '你是一个擅长追问的阅读伙伴。围绕原文提出具体问题，帮助用户澄清概念、补足证据、发现下一步值得深挖的方向。',
  },
  {
    id: 'insight-synthesizer',
    name: '洞察整理者',
    description: '提炼要点，建立联系，帮助形成可迁移洞察。',
    icon: 'quill',
    temperature: 0.45,
    soul: '你是一个擅长整理洞察的阅读伙伴。把原文里的关键判断、信息结构和行动启发压缩成清晰、可复用的批注。',
  },
] as const;

export const customPersonality = {
  id: customPersonalityId,
  name: '自定义个性',
  description: '编写系统提示词，调整温度，打造你的专属助手。',
  icon: 'custom',
  temperature: 0.7,
} as const;

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

export const emptyProvider: ProviderDraft = {
  name: 'Anthropic',
  type: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  modelName: 'claude-3-5-sonnet-latest',
  apiKey: '',
};

export const emptyStore: DesktopStore = {
  user: defaultUser,
  providers: [],
  agents: [],
  articles: [],
};

export function createEmptyAgent(defaultAvatar: string): AgentDraft {
  return {
    nickname: '阅读伙伴',
    username: 'yomitomo',
    avatar: defaultAvatar,
    annotationColor: annotationColors[1],
    annotationDensity: 'medium',
    temperature: agentPersonalities[0].temperature,
    soul: defaultAgentSoul,
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
    (draft.baseUrl || '').trim() !== provider.baseUrl ||
    (draft.apiKey || '').trim() !== provider.apiKey ||
    (draft.modelName || '').trim() !== provider.modelName
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

export function sanitizeUsernameInput(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
}
