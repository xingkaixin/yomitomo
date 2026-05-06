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

export type AgentPersonality = {
  id: string;
  kind: AgentKind;
  name: string;
  description: string;
  icon: 'leaf' | 'pyramid' | 'question' | 'quill' | 'lens' | 'scales' | 'checklist';
  temperature: number;
  soul: string;
};

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

export const defaultAgentSoul =
  '你是一个克制、敏锐的结对阅读伙伴。优先回应用户正在讨论的文本，给出清晰、具体、可追问的判断。';

export const agentReadingIntentOptions: Array<{
  value: AgentReadingIntent;
  label: string;
  shortLabel: string;
  description: string;
  prompt: string;
}> = [
  {
    value: 'explain',
    label: '解释',
    shortLabel: '解释',
    description: '解释概念、背景和句子里的隐含信息。',
    prompt:
      '动作取向：解释。优先澄清概念、背景、隐含定义和句子里的信息压缩，让读者能准确理解原文。',
  },
  {
    value: 'decompose',
    label: '拆解',
    shortLabel: '拆解',
    description: '拆出结构、因果链、前提和结论。',
    prompt: '动作取向：拆解。优先拆出论证结构、因果链、前提、证据和结论之间的关系。',
  },
  {
    value: 'challenge',
    label: '挑战',
    shortLabel: '挑战',
    description: '指出薄弱前提、跳跃和可验证处。',
    prompt: '动作取向：挑战。优先指出薄弱前提、推理跳跃、证据缺口、替代解释和可验证判断。',
  },
  {
    value: 'question',
    label: '追问',
    shortLabel: '追问',
    description: '提出能推动继续阅读的问题。',
    prompt: '动作取向：追问。优先提出具体、可继续阅读和可继续讨论的问题，帮助读者打开下一层理解。',
  },
  {
    value: 'connect',
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

export function normalizeQuestionStatus(value: unknown): QuestionStatus | null {
  return value === 'open' || value === 'answered' || value === 'parked' ? value : null;
}

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
    soul: '你是 Yomitomo 的读后笔记证据校验员。你的任务是审查读后笔记中的关键判断是否有充分证据支撑，区分文章观点、读者观点和助手补充，指出证据缺失、归因含混和过度外推。输出要具体、克制、可执行。',
  },
  {
    id: 'reader-focus-reviewer',
    kind: 'review',
    name: '读者关注守门员',
    description: '检查读后笔记是否保留了读者真实关注和讨论线索。',
    icon: 'scales',
    temperature: 0.3,
    soul: '你是 Yomitomo 的读者关注守门员。你的任务是审查读后笔记是否保留了用户批注、用户评论和讨论 thread 中真正重要的关注点，指出遗漏、错配和被模型声音覆盖的地方。输出要尊重读者视角，并给出具体改写建议。',
  },
  {
    id: 'insight-editor',
    kind: 'review',
    name: '洞察编辑',
    description: '审查洞见是否清晰、可迁移，并压掉泛泛而谈的表达。',
    icon: 'checklist',
    temperature: 0.35,
    soul: '你是 Yomitomo 的读后笔记洞察编辑。你的任务是审查读后笔记里的核心主张、可复用洞见和后续行动是否准确、精炼、有迁移价值，指出空泛表达和可改写句子。输出要像严谨编辑给出的修改意见。',
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

export type Agent = {
  id: string;
  kind: AgentKind;
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

export type ArticleRecord = {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  byline?: string;
  excerpt?: string;
  siteName?: string;
  siteIconUrl?: string;
  leadImageUrl?: string;
  themeColor?: string;
  contentHtml?: string;
  contentHash: string;
  annotations: Annotation[];
  readingDeliberation?: ReadingDeliberationRecord;
  readingCard?: ReadingCardRecord;
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
  saveArticleImages?: boolean;
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

export type AgentReadingPlanItem = {
  sectionId: string;
  sectionTitle: string;
  sectionStart: number;
  sectionEnd: number;
  readingIntent: AgentReadingIntent;
};

export type DesktopClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'hello' }
  | { type: 'agent:list'; requestId: string }
  | {
      type: 'article:get';
      requestId: string;
      payload: { id: string; url: string; canonicalUrl: string };
    }
  | { type: 'article:save'; requestId: string; payload: ArticleRecord }
  | { type: 'agent:message'; requestId: string; payload: AgentMessagePayload }
  | { type: 'agent:annotate'; requestId: string; payload: AgentAnnotatePayload };

export type DesktopServerMessage =
  | { type: 'auth:result'; ok: boolean; message?: string; pairingId?: string }
  | {
      type: 'status';
      ok: boolean;
      user: UserProfile;
      settings: AppSettings;
      agents: PublicAgent[];
      pairingId: string;
    }
  | {
      type: 'agent:list:result';
      requestId: string;
      user: UserProfile;
      settings: AppSettings;
      agents: PublicAgent[];
    }
  | { type: 'article:get:result'; requestId: string; article: ArticleRecord | null }
  | { type: 'article:updated'; article: ArticleRecord }
  | {
      type: 'article:deleted';
      article: { id: string; url: string; canonicalUrl: string };
    }
  | { type: 'agent:message:start'; requestId: string; annotationId: string; comment: Comment }
  | {
      type: 'agent:message:delta';
      requestId: string;
      annotationId: string;
      commentId: string;
      delta: string;
    }
  | { type: 'agent:message:done'; requestId: string; annotationId: string; commentId: string }
  | { type: 'agent:message:result'; requestId: string; annotationId: string; comment: Comment }
  | { type: 'agent:annotate:start'; requestId: string; agent: PublicAgent }
  | { type: 'agent:annotate:item'; requestId: string; annotation: Annotation }
  | { type: 'agent:annotate:done'; requestId: string }
  | { type: 'agent:annotate:result'; requestId: string; annotations: Annotation[] }
  | { type: 'error'; requestId?: string; message: string };

export type DesktopClientMessageParseError = {
  requestId?: string;
  message: string;
};

export type DesktopClientMessageParseResult =
  | { ok: true; message: DesktopClientMessage }
  | { ok: false; error: DesktopClientMessageParseError };

const MESSAGE_LIMITS = {
  tokenChars: 512,
  requestIdChars: 128,
  idChars: 256,
  usernameChars: 64,
  urlChars: 4096,
  titleChars: 512,
  bylineChars: 512,
  siteNameChars: 256,
  excerptChars: 2000,
  themeColorChars: 64,
  imageDataUrlChars: 8_000_000,
  contentHtmlChars: 12_000_000,
  articleTextChars: 300_000,
  annotations: 1000,
  commentsPerAnnotation: 200,
  commentChars: 20_000,
  anchorExactChars: 20_000,
  anchorContextChars: 2000,
  readingPlanItems: 100,
};

export function parseDesktopClientMessage(value: unknown): DesktopClientMessageParseResult {
  if (!isPlainObject(value)) return parseError(undefined, '消息必须是 JSON object');

  const type = value.type;
  const requestId = optionalBoundedString(value.requestId, MESSAGE_LIMITS.requestIdChars);
  if (requestId === false) return parseError(undefined, 'requestId 超出长度限制');

  if (type === 'auth') {
    if (!boundedString(value.token, MESSAGE_LIMITS.tokenChars)) {
      return parseError(undefined, 'auth.token 必须是非空字符串');
    }
    return { ok: true, message: value as { type: 'auth'; token: string } };
  }

  if (type === 'hello') return { ok: true, message: { type: 'hello' } };

  if (!requestId) return parseError(undefined, 'requestId 必须是非空字符串');

  if (type === 'agent:list') {
    return { ok: true, message: value as { type: 'agent:list'; requestId: string } };
  }

  if (type === 'article:get') {
    if (!isPlainObject(value.payload)) return parseError(requestId, 'article:get.payload 缺失');
    const payload = value.payload;
    if (!boundedString(payload.id, MESSAGE_LIMITS.idChars)) {
      return parseError(requestId, 'article:get.payload.id 必须是非空字符串');
    }
    if (!isHttpUrl(payload.url) || !isHttpUrl(payload.canonicalUrl)) {
      return parseError(requestId, 'article:get URL 必须是 http 或 https');
    }
    return { ok: true, message: value as DesktopClientMessage };
  }

  if (type === 'article:save') {
    const error = validateArticleRecord(value.payload);
    if (error) return parseError(requestId, error);
    return { ok: true, message: value as DesktopClientMessage };
  }

  if (type === 'agent:message') {
    const error = validateAgentMessagePayload(value.payload);
    if (error) return parseError(requestId, error);
    return { ok: true, message: value as DesktopClientMessage };
  }

  if (type === 'agent:annotate') {
    const error = validateAgentAnnotatePayload(value.payload);
    if (error) return parseError(requestId, error);
    return { ok: true, message: value as DesktopClientMessage };
  }

  return parseError(requestId, '未知消息类型');
}

export function isDesktopSocketOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return true;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
  } catch {
    return false;
  }

  return false;
}

function validateAgentMessagePayload(value: unknown) {
  if (!isPlainObject(value)) return 'agent:message.payload 缺失';
  if (!validateAgentIdentity(value)) return 'Agent 标识必须包含有效 username';
  const articleError = validatePromptArticle(value.article);
  if (articleError) return `agent:message.${articleError}`;
  if (value.readingIntent !== undefined && !normalizeAgentReadingIntent(value.readingIntent)) {
    return 'agent:message.readingIntent 无效';
  }
  const annotationError = validateAnnotation(value.annotation);
  if (annotationError) return `agent:message.annotation ${annotationError}`;
  const commentError = validateComment(value.userComment);
  if (commentError) return `agent:message.userComment ${commentError}`;
  return '';
}

function validateAgentAnnotatePayload(value: unknown) {
  if (!isPlainObject(value)) return 'agent:annotate.payload 缺失';
  if (!validateAgentIdentity(value)) return 'Agent 标识必须包含有效 username';
  const articleError = validatePromptArticle(value.article);
  if (articleError) return `agent:annotate.${articleError}`;
  if (value.readingIntent !== undefined && !normalizeAgentReadingIntent(value.readingIntent)) {
    return 'agent:annotate.readingIntent 无效';
  }
  if (value.annotationType !== undefined && !normalizeAnnotationType(value.annotationType)) {
    return 'agent:annotate.annotationType 无效';
  }
  if (
    value.instruction !== undefined &&
    !limitedString(value.instruction, MESSAGE_LIMITS.commentChars)
  ) {
    return 'agent:annotate.instruction 超出长度限制';
  }
  if (value.readingPlan !== undefined) {
    const article = value.article as { text: string };
    const readingPlanError = validateAgentReadingPlan(value.readingPlan, article.text.length);
    if (readingPlanError) return `agent:annotate.readingPlan ${readingPlanError}`;
  }
  if (value.targetAnchor !== undefined) {
    const anchorError = validateTextAnchor(value.targetAnchor);
    if (anchorError) return `agent:annotate.targetAnchor ${anchorError}`;
  }
  return '';
}

function validateAgentReadingPlan(value: unknown, articleTextLength: number) {
  if (!Array.isArray(value)) return '必须是数组';
  if (value.length < 1 || value.length > MESSAGE_LIMITS.readingPlanItems) {
    return '数量无效';
  }

  for (const item of value) {
    if (!isPlainObject(item)) return '条目必须是 object';
    if (!boundedString(item.sectionId, MESSAGE_LIMITS.idChars)) return 'sectionId 无效';
    if (!boundedString(item.sectionTitle, MESSAGE_LIMITS.titleChars)) return 'sectionTitle 无效';
    const sectionStart = item.sectionStart;
    const sectionEnd = item.sectionEnd;
    if (!isValidSectionOffset(sectionStart, articleTextLength)) return 'sectionStart 无效';
    if (!isValidSectionOffset(sectionEnd, articleTextLength)) return 'sectionEnd 无效';
    if (sectionEnd <= sectionStart) return 'sectionEnd 必须大于 sectionStart';
    if (!normalizeAgentReadingIntent(item.readingIntent)) return 'readingIntent 无效';
  }

  return '';
}

function isValidSectionOffset(value: unknown, articleTextLength: number): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= articleTextLength
  );
}

function validateAgentIdentity(value: Record<string, unknown>) {
  return (
    optionalBoundedString(value.agentId, MESSAGE_LIMITS.idChars) !== false &&
    boundedString(value.agentUsername, MESSAGE_LIMITS.usernameChars)
  );
}

function validatePromptArticle(value: unknown) {
  if (!isPlainObject(value)) return 'article 缺失';
  if (!boundedString(value.title, MESSAGE_LIMITS.titleChars)) return 'article.title 无效';
  if (!isHttpUrl(value.url)) return 'article.url 必须是 http 或 https';
  if (!boundedString(value.text, MESSAGE_LIMITS.articleTextChars)) {
    return 'article.text 超出传输容量边界';
  }
  return '';
}

function validateArticleRecord(value: unknown) {
  if (!isPlainObject(value)) return 'article:save.payload 缺失';
  if (!boundedString(value.id, MESSAGE_LIMITS.idChars)) return 'article.id 无效';
  if (!isHttpUrl(value.url) || !isHttpUrl(value.canonicalUrl)) {
    return 'article URL 必须是 http 或 https';
  }
  if (!boundedString(value.title, MESSAGE_LIMITS.titleChars)) return 'article.title 无效';
  if (optionalBoundedString(value.byline, MESSAGE_LIMITS.bylineChars) === false) {
    return 'article.byline 超出长度限制';
  }
  if (optionalBoundedString(value.excerpt, MESSAGE_LIMITS.excerptChars) === false) {
    return 'article.excerpt 超出长度限制';
  }
  if (optionalBoundedString(value.siteName, MESSAGE_LIMITS.siteNameChars) === false) {
    return 'article.siteName 超出长度限制';
  }
  if (
    value.siteIconUrl !== undefined &&
    value.siteIconUrl !== null &&
    !isImageSourceUrl(value.siteIconUrl)
  ) {
    return 'article.siteIconUrl 必须是 http、https 或 data:image';
  }
  if (
    value.leadImageUrl !== undefined &&
    value.leadImageUrl !== null &&
    !isImageSourceUrl(value.leadImageUrl)
  ) {
    return 'article.leadImageUrl 必须是 http、https 或 data:image';
  }
  if (optionalBoundedString(value.themeColor, MESSAGE_LIMITS.themeColorChars) === false) {
    return 'article.themeColor 超出长度限制';
  }
  if (optionalBoundedString(value.contentHtml, MESSAGE_LIMITS.contentHtmlChars) === false) {
    return 'article.contentHtml 超出存储容量边界';
  }
  if (!boundedString(value.contentHash, MESSAGE_LIMITS.idChars)) return 'article.contentHash 无效';
  if (!Array.isArray(value.annotations)) return 'article.annotations 必须是数组';
  if (value.annotations.length > MESSAGE_LIMITS.annotations) {
    return 'article.annotations 超出数量限制';
  }
  for (const annotation of value.annotations) {
    const error = validateAnnotation(annotation);
    if (error) return `article.annotations ${error}`;
  }
  if (!boundedString(value.createdAt, MESSAGE_LIMITS.idChars)) return 'article.createdAt 无效';
  if (!boundedString(value.updatedAt, MESSAGE_LIMITS.idChars)) return 'article.updatedAt 无效';
  return '';
}

function validateAnnotation(value: unknown) {
  if (!isPlainObject(value)) return '元素必须是 object';
  if (!boundedString(value.id, MESSAGE_LIMITS.idChars)) return 'id 无效';
  const anchorError = validateTextAnchor(value.anchor);
  if (anchorError) return `anchor ${anchorError}`;
  if (value.author !== 'user' && value.author !== 'ai') return 'author 无效';
  if (value.readingIntent !== undefined && !normalizeAgentReadingIntent(value.readingIntent)) {
    return 'readingIntent 无效';
  }
  if (value.questionStatus !== undefined && !normalizeQuestionStatus(value.questionStatus)) {
    return 'questionStatus 无效';
  }
  if (!boundedString(value.color, MESSAGE_LIMITS.idChars)) return 'color 无效';
  if (!Array.isArray(value.comments)) return 'comments 必须是数组';
  if (value.comments.length > MESSAGE_LIMITS.commentsPerAnnotation) {
    return 'comments 超出数量限制';
  }
  for (const comment of value.comments) {
    const error = validateComment(comment);
    if (error) return `comment ${error}`;
  }
  if (!boundedString(value.createdAt, MESSAGE_LIMITS.idChars)) return 'createdAt 无效';
  if (!boundedString(value.updatedAt, MESSAGE_LIMITS.idChars)) return 'updatedAt 无效';
  return '';
}

function validateComment(value: unknown) {
  if (!isPlainObject(value)) return '必须是 object';
  if (!boundedString(value.id, MESSAGE_LIMITS.idChars)) return 'id 无效';
  if (value.author !== 'user' && value.author !== 'ai') return 'author 无效';
  if (value.readingIntent !== undefined && !normalizeAgentReadingIntent(value.readingIntent)) {
    return 'readingIntent 无效';
  }
  if (value.questionStatus !== undefined && !normalizeQuestionStatus(value.questionStatus)) {
    return 'questionStatus 无效';
  }
  if (!limitedString(value.content, MESSAGE_LIMITS.commentChars)) {
    return 'content 超出长度限制';
  }
  if (!boundedString(value.createdAt, MESSAGE_LIMITS.idChars)) return 'createdAt 无效';
  return '';
}

function validateTextAnchor(value: unknown) {
  if (!isPlainObject(value)) return '缺失';
  if (!boundedString(value.exact, MESSAGE_LIMITS.anchorExactChars)) return 'exact 无效';
  if (!limitedString(value.prefix, MESSAGE_LIMITS.anchorContextChars)) return 'prefix 无效';
  if (!limitedString(value.suffix, MESSAGE_LIMITS.anchorContextChars)) return 'suffix 无效';
  if (!Number.isFinite(value.start) || !Number.isFinite(value.end)) return 'start/end 无效';
  return '';
}

function parseError(
  requestId: string | undefined,
  message: string,
): { ok: false; error: DesktopClientMessageParseError } {
  return { ok: false, error: { requestId, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function limitedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function optionalBoundedString(value: unknown, maxLength: number): string | undefined | false {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > maxLength) return false;
  return value;
}

function isHttpUrl(value: unknown) {
  if (!boundedString(value, MESSAGE_LIMITS.urlChars)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isImageSourceUrl(value: unknown) {
  if (isHttpUrl(value)) return true;
  if (typeof value !== 'string') return false;
  if (value.length > MESSAGE_LIMITS.imageDataUrlChars) return false;
  return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(value);
}

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
