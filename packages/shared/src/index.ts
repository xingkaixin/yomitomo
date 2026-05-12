import { agentPersonalities } from './agent-presets';

export type AnnotationAuthor = 'user' | 'ai';

export type ProviderType = 'openai-chat' | 'openai-responses' | 'anthropic' | 'gemini';

export type ProviderPresetId =
  | 'minimax'
  | 'dashscope'
  | 'deepseek'
  | 'moonshot'
  | 'zhipu'
  | 'doubao'
  | 'mimo'
  | 'openai'
  | 'anthropic'
  | 'gemini';

export type ReasoningEffort =
  | 'default'
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'auto';

export type ProviderPreset = {
  id: ProviderPresetId;
  name: string;
  type: ProviderType;
  baseUrl: string;
  modelName: string;
  logo: string;
  modelNames: string[];
};

export type ProviderModel = {
  id: string;
  name: string;
};

export type AnnotationType = 'key_point' | 'assumption' | 'concept' | 'question' | 'quote';

export type AgentAnnotationDensity = 'low' | 'medium' | 'high';

export type AgentReadingIntent = 'explain' | 'decompose' | 'challenge' | 'question' | 'connect';

export type QuestionStatus = 'open' | 'answered' | 'parked';

export type AgentKind = 'annotation' | 'review';

export type ProviderModelInputMode = 'list' | 'custom';

export type MessageSendShortcut = 'enter' | 'mod-enter';

export const defaultMessageSendShortcut: MessageSendShortcut = 'enter';

export function normalizeMessageSendShortcut(value: unknown): MessageSendShortcut {
  return value === 'mod-enter' ? 'mod-enter' : defaultMessageSendShortcut;
}

export type SelectionActionShortcuts = {
  copy: string;
  annotate: string;
};

export const defaultSelectionActionShortcuts: SelectionActionShortcuts = {
  copy: 'C',
  annotate: 'A',
};

export function normalizeSelectionActionShortcutKey(value: unknown, fallback: string) {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]$/.test(key) ? key : fallback;
}

export function normalizeSelectionActionShortcutDraft(value: unknown): SelectionActionShortcuts {
  const shortcuts =
    value && typeof value === 'object' ? (value as Partial<SelectionActionShortcuts>) : undefined;
  return {
    copy: normalizeSelectionActionShortcutKey(
      shortcuts?.copy,
      defaultSelectionActionShortcuts.copy,
    ),
    annotate: normalizeSelectionActionShortcutKey(
      shortcuts?.annotate,
      defaultSelectionActionShortcuts.annotate,
    ),
  };
}

export function selectionActionShortcutsConflict(shortcuts: SelectionActionShortcuts) {
  return shortcuts.copy === shortcuts.annotate;
}

export function normalizeSelectionActionShortcuts(value: unknown): SelectionActionShortcuts {
  const shortcuts = normalizeSelectionActionShortcutDraft(value);
  return selectionActionShortcutsConflict(shortcuts) ? defaultSelectionActionShortcuts : shortcuts;
}

export type AgentPersonality = {
  id: string;
  kind: AgentKind;
  name: string;
  pinyin?: string;
  roleTitle: string;
  gender: 'female' | 'male';
  description: string;
  introduction: string;
  selfIntroduction?: string;
  sceneDescription: string;
  portraitPrompt: string;
  scenePrompt: string;
  icon: 'leaf' | 'pyramid' | 'question' | 'quill' | 'lens' | 'scales' | 'checklist';
  temperature: number;
  defaultColor: string;
  defaultEnabled: boolean;
  soul: string;
};

export {
  agentPersonalities,
  agentPersonalitiesForKind,
  annotationAgentPersonalities,
  reviewAgentPersonalities,
  readingPartnerSoul,
} from './agent-presets';

export type LlmProvider = {
  id: string;
  name: string;
  type: ProviderType;
  presetId?: ProviderPresetId;
  logo?: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  modelNames?: string[];
  modelInputMode?: ProviderModelInputMode;
  reasoningEffort?: ReasoningEffort;
  createdAt: string;
  updatedAt: string;
};

export const reasoningEffortOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'default', label: '默认' },
  { value: 'none', label: '关闭' },
  { value: 'minimal', label: '极低' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
  { value: 'auto', label: '自动' },
];

export const providerPresets: ProviderPreset[] = [
  {
    id: 'minimax',
    name: 'MiniMax',
    type: 'openai-chat',
    baseUrl: 'https://api.minimaxi.com/v1',
    modelName: 'MiniMax-M2.7',
    logo: 'minimax.png',
    modelNames: [
      'MiniMax-M2.7',
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.5-highspeed',
      'MiniMax-M2.1',
      'MiniMax-M2',
    ],
  },
  {
    id: 'dashscope',
    name: '阿里云百炼',
    type: 'openai-chat',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen3.5-plus',
    logo: 'bailian.png',
    modelNames: [
      'qwen3.5-plus',
      'qwen3.5-flash',
      'qwen3-max',
      'kimi-k2.5',
      'glm-5',
      'deepseek-v3.2',
    ],
  },
  {
    id: 'deepseek',
    name: '深度求索',
    type: 'openai-chat',
    baseUrl: 'https://api.deepseek.com',
    modelName: 'deepseek-chat',
    logo: 'deepseek.png',
    modelNames: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'moonshot',
    name: '月之暗面',
    type: 'openai-chat',
    baseUrl: 'https://api.moonshot.cn',
    modelName: 'moonshot-v1-auto',
    logo: 'moonshot.webp',
    modelNames: [
      'moonshot-v1-auto',
      'kimi-k2.5',
      'kimi-k2.6',
      'kimi-k2-thinking',
      'kimi-k2-turbo-preview',
    ],
  },
  {
    id: 'zhipu',
    name: '智谱开放平台',
    type: 'openai-chat',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelName: 'glm-5',
    logo: 'zhipu.png',
    modelNames: ['glm-5', 'glm-4.7', 'glm-4.6', 'glm-4.5', 'glm-4.5-flash'],
  },
  {
    id: 'doubao',
    name: '火山引擎',
    type: 'openai-chat',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    modelName: 'doubao-seed-1-8-251228',
    logo: 'volcengine.png',
    modelNames: [
      'doubao-seed-1-8-251228',
      'doubao-seed-2-0-pro-260215',
      'doubao-seed-2-0-lite-260215',
      'doubao-1-5-pro-32k-250115',
      'deepseek-r1-250120',
    ],
  },
  {
    id: 'mimo',
    name: '小米 MiMo',
    type: 'openai-chat',
    baseUrl: 'https://api.xiaomimimo.com',
    modelName: 'mimo-v2.5',
    logo: 'mimo.svg',
    modelNames: ['mimo-v2.5', 'mimo-v2.5-pro', 'mimo-v2-flash', 'mimo-v2-omni'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai-responses',
    baseUrl: 'https://api.openai.com',
    modelName: 'gpt-5.2',
    logo: 'openai.png',
    modelNames: ['gpt-5.4', 'gpt-5.4-pro', 'gpt-5.2', 'gpt-5.2-pro', 'gpt-5.1', 'gpt-5'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    modelName: 'claude-sonnet-4-5',
    logo: 'anthropic.png',
    modelNames: [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-sonnet-4-5',
      'claude-haiku-4-5',
      'claude-opus-4-5',
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    modelName: 'gemini-2.5-flash',
    logo: 'google.png',
    modelNames: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3-pro-preview',
      'gemini-3.1-pro-preview',
    ],
  },
];

export { readingPartnerSoul as defaultAgentSoul } from './agent-presets';

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

export function normalizeQuestionStatus(value: unknown): QuestionStatus | null {
  return value === 'open' || value === 'answered' || value === 'parked' ? value : null;
}

export const customPersonalityId = 'custom';

export const customPersonality = {
  id: customPersonalityId,
  name: '自定义个性',
  description: '编写系统提示词，调整温度，打造你的专属助手。',
  icon: 'custom',
  temperature: 0.7,
} as const;

export type Agent = {
  id: string;
  kind: AgentKind;
  presetId?: string;
  enabled: boolean;
  providerId: string;
  nickname: string;
  username: string;
  avatar: string;
  annotationColor: string;
  annotationDensity: AgentAnnotationDensity;
  temperature: number;
  soul: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicAgent = Omit<Agent, 'providerId' | 'soul' | 'createdAt' | 'updatedAt'> & {
  personalityName: string;
  pinyin?: string;
};

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

export type UserProfile = {
  id: string;
  nickname: string;
  username: string;
  avatar: string;
  annotationColor: string;
  updatedAt: string;
};

export type TextAnchor = {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
};

export type Comment = {
  id: string;
  author: AnnotationAuthor;
  content: string;
  createdAt: string;
  replyTo?: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
  agentAnnotationColor?: string;
  userId?: string;
  userUsername?: string;
  userNickname?: string;
  userAvatar?: string;
  userAnnotationColor?: string;
  readingIntent?: AgentReadingIntent;
  questionStatus?: QuestionStatus;
  pending?: boolean;
};

export type Annotation = {
  id: string;
  anchor: TextAnchor;
  author: AnnotationAuthor;
  annotationType?: AnnotationType;
  color: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
  agentAnnotationColor?: string;
  userId?: string;
  userUsername?: string;
  userNickname?: string;
  userAvatar?: string;
  userAnnotationColor?: string;
  readingIntent?: AgentReadingIntent;
  questionStatus?: QuestionStatus;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
};

export type ArticleSourceType = 'web' | 'ebook';

export type EbookFormat = 'epub';

export type EbookMetadata = {
  format: EbookFormat;
  fileName: string;
  fileSize: number;
  language?: string;
  publisher?: string;
  description?: string;
};

export type EbookChapterRecord = {
  id: string;
  title: string;
  href?: string;
  html: string;
  textLength: number;
};

export type EbookRecord = {
  metadata: EbookMetadata;
  chapters: EbookChapterRecord[];
};

export type ArticleReadingProgress = {
  pageIndex: number;
  pageCount: number;
  chapterIndex?: number;
  chapterProgress?: number;
  progress: number;
  updatedAt: string;
};

export type ArticleRecord = {
  id: string;
  url: string;
  canonicalUrl: string;
  sourceType?: ArticleSourceType;
  title: string;
  byline?: string;
  excerpt?: string;
  siteName?: string;
  siteIconUrl?: string;
  leadImageUrl?: string;
  themeColor?: string;
  contentHtml?: string;
  contentHash: string;
  ebook?: EbookRecord;
  readingProgress?: ArticleReadingProgress;
  annotations: Annotation[];
  focusCoReadingPlan?: FocusCoReadingPlan;
  readingDeliberation?: ReadingDeliberationRecord;
  readingCard?: ReadingCardRecord;
  createdAt: string;
  updatedAt: string;
};

export type FocusCoReadingMessage = {
  id: string;
  content: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentIds?: string[];
  agentUsernames?: string[];
  agentNicknames?: string[];
  createdAt: string;
};

export type FocusCoReadingSectionPlan = {
  sectionId: string;
  sectionTitle: string;
  sectionStart: number;
  sectionEnd: number;
  summary?: string;
  tag?: string;
  agentIds: string[];
  messages: FocusCoReadingMessage[];
};

export type FocusCoReadingPlan = {
  id: string;
  articleId: string;
  selectedAgentIds: string[];
  sections: FocusCoReadingSectionPlan[];
  createdAt: string;
  updatedAt: string;
};

export type ReadingDeliberationSection = {
  title: string;
  content: string;
};

export type ReadingDeliberationRecord = {
  id: string;
  articleId: string;
  title: string;
  contentMarkdown: string;
  sections: ReadingDeliberationSection[];
  providerId: string;
  providerName: string;
  modelName: string;
  createdAt: string;
  updatedAt: string;
};

export type ReadingCardSection = {
  title: string;
  content: string;
};

export type ReadingCardReviewVerdict = 'pass' | 'revise';

export type ReadingCardReviewStatus = 'done' | 'error';

export type ReadingCardReviewSeverity = 'high' | 'medium' | 'low';

export type ReadingCardReviewFinding = {
  section: string;
  severity: ReadingCardReviewSeverity;
  problem: string;
  evidenceIds: number[];
  suggestedRewrite?: string;
};

export type ReadingCardReviewerResult = {
  id: string;
  reviewerId: string;
  reviewerNickname: string;
  reviewerUsername: string;
  reviewerAvatar: string;
  reviewerColor: string;
  status?: ReadingCardReviewStatus;
  verdict: ReadingCardReviewVerdict;
  summary: string;
  findings: ReadingCardReviewFinding[];
  acceptedClaims: string[];
  missingAngles: string[];
  rawResponse?: string;
  createdAt: string;
};

export type ReadingCardReviewRecord = {
  id: string;
  articleId: string;
  readingCardId: string;
  reviewerResults: ReadingCardReviewerResult[];
  createdAt: string;
  updatedAt: string;
};

export type ReadingCardRecord = {
  id: string;
  articleId: string;
  title: string;
  contentMarkdown: string;
  sections: ReadingCardSection[];
  review?: ReadingCardReviewRecord;
  providerId: string;
  providerName: string;
  modelName: string;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  defaultProviderId?: string;
  readingAssistantProviderId?: string;
  reviewAssistantProviderId?: string;
  readingNoteProviderId?: string;
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  saveArticleImages?: boolean;
  onboardingCompletedAt?: string;
};

export type DesktopStore = {
  user: UserProfile;
  settings: AppSettings;
  providers: LlmProvider[];
  agents: Agent[];
  articles: ArticleRecord[];
};

export type AgentMessagePayload = {
  agentId?: string;
  agentUsername: string;
  readingIntent?: AgentReadingIntent;
  agentRoster?: PublicAgent[];
  article: {
    title: string;
    url: string;
    text: string;
  };
  annotation: Annotation;
  userComment: Comment;
};

export type AgentAnnotatePayload = {
  agentId?: string;
  agentUsername: string;
  annotationType?: AnnotationType;
  readingIntent?: AgentReadingIntent;
  instruction?: string;
  readingPlan?: AgentReadingPlanItem[];
  targetAnchor?: TextAnchor;
  article: {
    title: string;
    url: string;
    text: string;
  };
};

export type FocusCoReadingRouteSectionInput = {
  sectionId: string;
  sectionTitle: string;
  sectionStart: number;
  sectionEnd: number;
};

export type FocusCoReadingRoutePayload = {
  selectedAgentIds: string[];
  sections: FocusCoReadingRouteSectionInput[];
  article: {
    title: string;
    url: string;
    text: string;
  };
};

export type FocusCoReadingRouteSection = {
  sectionId: string;
  summary?: string;
  tag?: string;
  agentIds: string[];
};

export type FocusCoReadingRouteResult = {
  sections: FocusCoReadingRouteSection[];
};

export type AnnotationMetadataPayload = {
  article: {
    title: string;
    url: string;
    text: string;
  };
  anchor: TextAnchor;
  note: string;
};

export type AnnotationMetadata = {
  annotationType: AnnotationType;
  readingIntent: AgentReadingIntent;
};

export type AgentReadingPlanItem = {
  sectionId: string;
  sectionTitle: string;
  sectionStart: number;
  sectionEnd: number;
  readingIntent?: AgentReadingIntent;
  sectionSummary?: string;
  sectionTag?: string;
  messages?: AgentReadingPlanMessage[];
};

export type AgentReadingPlanMessage = {
  content: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentIds?: string[];
  agentUsernames?: string[];
  agentNicknames?: string[];
};

export type AgentMentionInstructionPayload = {
  note: string;
  targetAnchor: TextAnchor;
  agents: PublicAgent[];
  article: {
    title: string;
    url: string;
    text: string;
  };
};

export type AgentMentionInstruction = {
  agentId?: string;
  agentUsername: string;
  instruction?: string;
  readingIntent?: AgentReadingIntent;
};

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function hashText(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function createTextAnchor(text: string, start: number, end: number): TextAnchor {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));

  return {
    exact: text.slice(safeStart, safeEnd),
    prefix: text.slice(Math.max(0, safeStart - 48), safeStart),
    suffix: text.slice(safeEnd, Math.min(text.length, safeEnd + 48)),
    start: safeStart,
    end: safeEnd,
  };
}

export function resolveTextAnchor(
  text: string,
  anchor: TextAnchor,
): { start: number; end: number } | null {
  if (!anchor.exact) return null;

  const direct = text.slice(anchor.start, anchor.end);
  if (direct === anchor.exact) {
    return { start: anchor.start, end: anchor.end };
  }

  const exactMatches = findAll(text, anchor.exact);
  if (exactMatches.length === 0) return null;
  if (exactMatches.length === 1) {
    const start = exactMatches[0];
    return { start, end: start + anchor.exact.length };
  }

  let bestStart = exactMatches[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const start of exactMatches) {
    const before = text.slice(Math.max(0, start - anchor.prefix.length), start);
    const after = text.slice(
      start + anchor.exact.length,
      start + anchor.exact.length + anchor.suffix.length,
    );
    const score =
      commonSuffixLength(before, anchor.prefix) +
      commonPrefixLength(after, anchor.suffix) -
      Math.abs(start - anchor.start) / 100;
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return { start: bestStart, end: bestStart + anchor.exact.length };
}

export function renderMarkdown(content: string): string {
  return renderMarkdownBlocks(content);
}

function renderMarkdownBlocks(content: string) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.match(/^```/)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].match(/^```/)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderMarkdownInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${renderParagraph(quoteLines)}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(`<li>${renderMarkdownInline(lines[index].replace(/^\s*[-*+]\s+/, ''))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderMarkdownInline(lines[index].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].startsWith('```') &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${renderParagraph(paragraphLines)}</p>`);
  }

  return blocks.join('');
}

function renderParagraph(lines: string[]) {
  return lines.map((line) => renderMarkdownInline(line)).join('<br>');
}

function renderMarkdownInline(content: string) {
  const tokens: string[] = [];
  const token = (value: string) => {
    const id = `@@YOMITOMOMD${tokens.length}@@`;
    tokens.push(value);
    return id;
  };

  let text = content.replace(/`([^`]+)`/g, (_match, code: string) =>
    token(`<code>${escapeHtml(code)}</code>`),
  );
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    if (!/^(https?:\/\/|mailto:)/i.test(href)) return escapeHtml(label);
    const safeHref = escapeHtml(href);
    return token(`<a href="${safeHref}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`);
  });

  text = escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');

  tokens.forEach((value, index) => {
    text = text.replace(`@@YOMITOMOMD${index}@@`, value);
  });

  return text;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function findAll(text: string, exact: string): number[] {
  const starts: number[] = [];
  let cursor = text.indexOf(exact);
  while (cursor >= 0) {
    starts.push(cursor);
    cursor = text.indexOf(exact, cursor + Math.max(1, exact.length));
  }
  return starts;
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return limit;
}

function commonSuffixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[left.length - 1 - index] !== right[right.length - 1 - index]) return index;
  }
  return limit;
}
