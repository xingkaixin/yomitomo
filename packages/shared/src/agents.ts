import { agentPersonalities } from './agent-presets';

import type {
  Agent,
  AgentReadingIntent,
  AnnotationConfidence,
  AnnotationEvidenceSource,
  AnnotationMove,
  AnnotationType,
} from './types';

export const agentReadingIntentOptions: Array<{
  value: AgentReadingIntent;
  icon: string;
  label: string;
  shortLabel: string;
  description: string;
  prompt: string;
}> = [
  {
    value: 'explain',
    icon: '💬',
    label: '解释',
    shortLabel: '解释',
    description: '解释概念、背景和句子里的隐含信息。',
    prompt:
      '动作取向：解释。优先澄清概念、背景、隐含定义和句子里的信息压缩，让读者能准确理解原文。',
  },
  {
    value: 'decompose',
    icon: '🪓',
    label: '拆解',
    shortLabel: '拆解',
    description: '拆出结构、因果链、前提和结论。',
    prompt: '动作取向：拆解。优先拆出论证结构、因果链、前提、证据和结论之间的关系。',
  },
  {
    value: 'challenge',
    icon: '⚔️',
    label: '挑战',
    shortLabel: '挑战',
    description: '指出薄弱前提、跳跃和可验证处。',
    prompt: '动作取向：挑战。优先指出薄弱前提、推理跳跃、证据缺口、替代解释和可验证判断。',
  },
  {
    value: 'question',
    icon: '❓',
    label: '追问',
    shortLabel: '追问',
    description: '提出能推动继续阅读的问题。',
    prompt: '动作取向：追问。优先提出具体、可继续阅读和可继续讨论的问题，帮助读者打开下一层理解。',
  },
  {
    value: 'connect',
    icon: '📄',
    label: '联系全文',
    shortLabel: '全文',
    description: '把选段放回全文主题和上下文。',
    prompt:
      '动作取向：联系全文。优先把当前片段放回全文主线、上下文、前后论点和读者已形成的批注关系里。',
  },
];

export function normalizeAgentReadingIntent(value: unknown): AgentReadingIntent | null {
  return value === 'explain' ||
    value === 'decompose' ||
    value === 'challenge' ||
    value === 'question' ||
    value === 'connect'
    ? value
    : null;
}

export function normalizeAnnotationType(value: unknown): AnnotationType | null {
  return value === 'key_point' ||
    value === 'assumption' ||
    value === 'concept' ||
    value === 'question' ||
    value === 'quote'
    ? value
    : null;
}

export function normalizeAnnotationMove(value: unknown): AnnotationMove | null {
  return value === 'explain_concept' ||
    value === 'surface_assumption' ||
    value === 'ask_question' ||
    value === 'connect_previous' ||
    value === 'challenge_argument' ||
    value === 'reader_application' ||
    value === 'style_observation' ||
    value === 'structure_marker' ||
    value === 'definition_watch' ||
    value === 'foreshadowing_watch'
    ? value
    : null;
}

export function normalizeAnnotationEvidenceSource(value: unknown): AnnotationEvidenceSource | null {
  return value === 'localText' ||
    value === 'chapterSummary' ||
    value === 'trace' ||
    value === 'relatedPassage'
    ? value
    : null;
}

export function normalizeAnnotationConfidence(value: unknown): AnnotationConfidence | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

export function agentReadingIntentLabel(intent: AgentReadingIntent) {
  return agentReadingIntentOptions.find((option) => option.value === intent)?.label || intent;
}

export function agentReadingIntentIcon(intent: AgentReadingIntent) {
  return agentReadingIntentOptions.find((option) => option.value === intent)?.icon || '';
}

export function agentReadingIntentDisplayLabel(intent: AgentReadingIntent) {
  const icon = agentReadingIntentIcon(intent);
  const label = agentReadingIntentLabel(intent);
  return icon ? `${icon} ${label}` : label;
}

export const customPersonalityId = 'custom';

export const customPersonality = {
  id: customPersonalityId,
  name: '自定义个性',
  description: '编写系统提示词，调整温度，打造你的专属助手。',
  icon: 'custom',
  temperature: 0.7,
} as const;

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
