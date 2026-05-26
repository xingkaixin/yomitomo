export type MessageSendShortcut = 'enter' | 'mod-enter';

export type SelectionActionShortcuts = {
  copy: string;
  annotate: string;
};

export type AppSettings = {
  defaultProviderId?: string;
  readingAssistantProviderId?: string;
  reviewAssistantProviderId?: string;
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  saveArticleImages?: boolean;
  developerModeEnabled?: boolean;
  logRetentionDays?: number;
  onboardingCompletedAt?: string;
};
