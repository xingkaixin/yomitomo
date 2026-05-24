import type { Agent } from './agent-types';
import type { ArticleSummaryRecord } from './article-types';
import type { LlmProvider } from './provider-types';
import type { AppSettings } from './settings-types';
import type { UserProfile } from './user-types';

export type DesktopStore = {
  user: UserProfile;
  settings: AppSettings;
  providers: LlmProvider[];
  agents: Agent[];
  articles: ArticleSummaryRecord[];
};
