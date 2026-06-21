import type { Agent } from './agents/agent-types';
import type { ArticleSummaryRecord } from './sources/article-types';
import type { Collection, CollectionMember, LibraryPin } from './sources/collection-types';
import type { LlmProvider } from './providers/provider-types';
import type { AppSettings } from './settings-types';
import type { UserProfile } from './user-types';

export type DesktopStore = {
  user: UserProfile;
  settings: AppSettings;
  providers: LlmProvider[];
  agents: Agent[];
  articles: ArticleSummaryRecord[];
  collections: Collection[];
  collectionMembers: CollectionMember[];
  pins: LibraryPin[];
};
