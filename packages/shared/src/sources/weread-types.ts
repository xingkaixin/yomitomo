export type WeReadOpenMethod = 'deeplink' | 'web';
export type WeReadSyncMode = 'manual' | 'auto';

export type WeReadSettings = {
  configured: boolean;
  openMethod: WeReadOpenMethod;
  syncMode?: WeReadSyncMode;
  status?: 'idle' | 'connected' | 'error';
  lastSyncAt?: string;
  lastTestAt?: string;
  message?: string;
};

export type WeReadBook = {
  bookId: string;
  title: string;
  author?: string;
  cover?: string;
  intro?: string;
  reviewCount: number;
  noteCount: number;
  bookmarkCount: number;
  readingProgress: number;
  markedStatus?: number;
  sort?: number;
  currentChapterUid?: number;
  currentChapterOffset?: number;
  readingTime?: number;
  recordReadingTime?: number;
  lastReadAt?: number;
  syncedAt?: string;
  updatedAt: string;
};

export type WeReadChapter = {
  bookId: string;
  chapterUid: number;
  chapterIdx: number;
  title: string;
  level: number;
  wordCount?: number;
};

export type WeReadHighlight = {
  bookmarkId: string;
  bookId: string;
  chapterUid: number;
  chapterIdx?: number;
  range?: string;
  markText: string;
  colorStyle?: number;
  createTime: number;
};

export type WeReadUser = {
  userVid?: number;
  name?: string;
  avatar?: string;
};

export type WeReadThought = {
  reviewId: string;
  bookId: string;
  userVid?: number;
  author?: WeReadUser;
  chapterUid?: number;
  chapterIdx?: number;
  chapterName?: string;
  range?: string;
  abstract?: string;
  content: string;
  createTime: number;
};

export type WeReadBookDetail = {
  book: WeReadBook;
  chapters: WeReadChapter[];
  highlights: WeReadHighlight[];
  thoughts: WeReadThought[];
};

export type WeReadSyncResult = {
  settings: WeReadSettings;
  books: WeReadBook[];
  syncedBook?: WeReadBookDetail;
};

export type WeReadReadingStatsMode = 'weekly' | 'monthly' | 'annually' | 'overall';

export type WeReadReadingStatsItem = {
  stat: string;
  counts: string;
};

export type WeReadReadingStatsBook = {
  bookId?: string;
  title?: string;
  author?: string;
  cover?: string;
  readTime?: number;
  finishReadingTime?: number;
};

export type WeReadReadingStats = {
  mode: WeReadReadingStatsMode;
  totalReadTime: number;
  readDays?: number;
  dayAverageReadTime?: number;
  compare?: number;
  readRate?: number;
  wrReadTime?: number;
  wrListenTime?: number;
  readStat: WeReadReadingStatsItem[];
  readTimes: Record<string, number>;
  readLongest: WeReadReadingStatsBook[];
  preferCategory: WeReadReadingStatsItem[];
  preferCategoryWord?: string;
  preferTimeWord?: string;
  preferTime?: number[];
  preferAuthor?: string;
  preferPublisher?: string;
  authorCount?: number;
  registTime?: number;
};

export type WeReadReadingStatsSnapshot = {
  id: string;
  mode: WeReadReadingStatsMode;
  periodStart: number;
  sourceBaseTime?: number;
  data: WeReadReadingStats;
  fetchedAt: string;
};

export type WeReadReadingStatsState = {
  snapshots: WeReadReadingStatsSnapshot[];
};
