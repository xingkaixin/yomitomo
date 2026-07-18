export type ProviderType = 'openai-chat' | 'openai-responses' | 'anthropic' | 'gemini';

export type ProviderPresetId =
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

export type ArticleTextBudgetProfile = {
  defaultFactor: number;
  modelFactors?: Record<string, number>;
};

export type ProviderPreset = {
  id: ProviderPresetId;
  name: string;
  type: ProviderType;
  baseUrl: string;
  modelName: string;
  logo: string;
  modelNames: string[];
  articleTextBudget: ArticleTextBudgetProfile;
};

export type ProviderModel = {
  id: string;
  name: string;
};

export type ProviderModelInputMode = 'list' | 'custom';

export type LlmProvider = {
  id: string;
  name: string;
  type: ProviderType;
  presetId?: ProviderPresetId;
  logo?: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey?: boolean;
  modelName: string;
  modelNames?: string[];
  modelInputMode?: ProviderModelInputMode;
  reasoningEffort?: ReasoningEffort;
  createdAt: string;
  updatedAt: string;
};
