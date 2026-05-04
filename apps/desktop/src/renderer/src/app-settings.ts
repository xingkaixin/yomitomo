import type {
  Agent,
  AgentAnnotationDensity,
  AgentKind,
  DesktopStore,
  LlmProvider,
  UserProfile,
} from '@yomitomo/shared';
import { providerPresets } from '@yomitomo/shared';

export type ProviderDraft = Partial<LlmProvider>;
export type AgentDraft = Partial<Agent> & { personalityId?: string };
export type UserDraft = Partial<UserProfile>;

export type AgentPersonality = {
  id: string;
  kind: AgentKind;
  name: string;
  description: string;
  icon: 'leaf' | 'pyramid' | 'question' | 'quill' | 'lens' | 'scales' | 'checklist';
  temperature: number;
  soul: string;
};

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

export const annotationAgentPersonalities: AgentPersonality[] = [
  {
    id: 'reading-partner',
    kind: 'annotation',
    name: '克制阅读伙伴',
    description: '安静陪伴，适度提醒，帮助你稳步理解与反馈。',
    icon: 'leaf',
    temperature: 0.35,
    soul: defaultAgentSoul,
  },
  {
    id: 'first-principles',
    kind: 'annotation',
    name: '第一性原理审阅者',
    description: '回到本质，拆解假设，挑战推理与结论。',
    icon: 'pyramid',
    temperature: 0.25,
    soul: '你是一个基于第一性原理思考的阅读伙伴。先拆解概念、约束和因果链，再指出论证里的关键前提、跳跃和可验证判断。',
  },
  {
    id: 'question-coach',
    kind: 'annotation',
    name: '追问型导师',
    description: '通过追问引导思考，帮助你发现更深层理解。',
    icon: 'question',
    temperature: 0.6,
    soul: '你是一个擅长追问的阅读伙伴。围绕原文提出具体问题，帮助用户澄清概念、补足证据、发现下一步值得深挖的方向。',
  },
  {
    id: 'insight-synthesizer',
    kind: 'annotation',
    name: '洞察整理者',
    description: '提炼要点，建立联系，帮助形成可迁移洞察。',
    icon: 'quill',
    temperature: 0.45,
    soul: '你是一个擅长整理洞察的阅读伙伴。把原文里的关键判断、信息结构和行动启发压缩成清晰、可复用的批注。',
  },
];

export const reviewAgentPersonalities: AgentPersonality[] = [
  {
    id: 'evidence-reviewer',
    kind: 'review',
    name: '证据校验员',
    description: '核对每条判断是否能回到原文、批注或证据编号。',
    icon: 'lens',
    temperature: 0.2,
    soul: '你是 Yomitomo 的读后卡片证据校验员。你的任务是审查读后卡片中的关键判断是否有充分证据支撑，区分文章观点、读者观点和助手补充，指出证据缺失、归因含混和过度外推。输出要具体、克制、可执行。',
  },
  {
    id: 'reader-focus-reviewer',
    kind: 'review',
    name: '读者关注守门员',
    description: '检查卡片是否保留了读者真实关注和讨论线索。',
    icon: 'scales',
    temperature: 0.3,
    soul: '你是 Yomitomo 的读者关注守门员。你的任务是审查读后卡片是否保留了用户批注、用户评论和讨论 thread 中真正重要的关注点，指出遗漏、错配和被模型声音覆盖的地方。输出要尊重读者视角，并给出具体改写建议。',
  },
  {
    id: 'insight-editor',
    kind: 'review',
    name: '洞察编辑',
    description: '审查洞见是否清晰、可迁移，并压掉泛泛而谈的表达。',
    icon: 'checklist',
    temperature: 0.35,
    soul: '你是 Yomitomo 的读后卡片洞察编辑。你的任务是审查卡片里的核心主张、可复用洞见和后续行动是否准确、精炼、有迁移价值，指出空泛表达和可改写句子。输出要像严谨编辑给出的修改意见。',
  },
];

export const agentPersonalities: AgentPersonality[] = [
  ...annotationAgentPersonalities,
  ...reviewAgentPersonalities,
];

export const customPersonality = {
  id: customPersonalityId,
  name: '自定义个性',
  description: '编写系统提示词，调整温度，打造你的专属助手。',
  icon: 'custom',
  temperature: 0.7,
} as const;

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

export function createEmptyAgent(defaultAvatar: string): AgentDraft {
  return {
    kind: 'annotation',
    nickname: '阅读伙伴',
    username: 'yomitomo',
    avatar: defaultAvatar,
    annotationColor: annotationColors[1],
    annotationDensity: 'medium',
    temperature: annotationAgentPersonalities[0]?.temperature ?? 0.35,
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
