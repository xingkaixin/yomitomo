import type { LibraryTypeFilter } from './library-entity-types';

type LibrarySessionState = {
  searchQuery: string;
  selectedTypes: Set<LibraryTypeFilter>;
  activeCollectionId: string | null;
};

// 阅读库会话级导航状态：仅存活于应用进程生命周期，切换菜单或进入文章再返回时
// 由 LibraryHome 读回，不持久化到 DB，应用退出即清空。
export const librarySession: LibrarySessionState = {
  searchQuery: '',
  selectedTypes: new Set(),
  activeCollectionId: null,
};
