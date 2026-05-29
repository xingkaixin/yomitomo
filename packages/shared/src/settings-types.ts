export type MessageSendShortcut = 'enter' | 'mod-enter';

export type AssistantExecutionMode = 'fast_response' | 'deep_verification';

export type SelectionActionShortcuts = {
  copy: string;
  annotate: string;
};

export type AppSettings = {
  themeId?: string;
  libraryPageSize?: number;
  defaultProviderId?: string;
  readingAssistantProviderId?: string;
  reviewAssistantProviderId?: string;
  assistantExecutionMode?: AssistantExecutionMode;
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  saveArticleImages?: boolean;
  developerModeEnabled?: boolean;
  logRetentionDays?: number;
  onboardingCompletedAt?: string;
};

export function normalizeAssistantExecutionMode(value: unknown): AssistantExecutionMode {
  return value === 'deep_verification' ? 'deep_verification' : 'fast_response';
}
