import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentMessagePayload,
  AgentMentionInstructionPayload,
  AgentMentionRoutePlan,
  AgentReviewPayload,
  AnnotationMetadata,
  AnnotationMetadataPayload,
  AppSettings,
  ArticleDeletePatch,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ArticleRecord,
  ArticleUpsertPatch,
  Comment,
  DesktopStore,
  FocusCoReadingRoutePayload,
  FocusCoReadingRouteResult,
  LlmProvider,
  ProviderModel,
  UserProfile,
  WeReadBook,
  WeReadBookDetail,
  WeReadOpenMethod,
  WeReadReadingStatsMode,
  WeReadReadingStatsState,
  WeReadSettings,
  WeReadSyncResult,
} from '@yomitomo/shared';
import type { DesktopStoreGetResult } from './app-store-errors';
import type { AppUpdateState } from './app-update-types';

export type AppInfo = {
  desktopVersion: string;
};

export type ArticleImportResult =
  | { status: 'duplicate'; article: ArticleRecord }
  | { status: 'imported'; article: ArticleRecord; patch: ArticleUpsertPatch };

export type ArticleAnnotationDeleteInput = {
  articleId: string;
  annotationId: string;
};

export type ArticleCommentDeleteInput = {
  articleId: string;
  annotationId: string;
  commentId: string;
};

export type DataManagementPathKind = 'dataDir' | 'logFile' | 'databaseFile';

export type DataManagementPaths = {
  dataDir: string;
  logFile: string;
  databaseFile: string;
};

export type DatabaseBackupResult = { canceled: true } | { canceled: false; filePath: string };

export type DatabaseRestoreResult =
  | { canceled: true }
  | { canceled: false; backupPath: string; store: DesktopStore };

export type EbookImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

export type PdfImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

export type PerformanceTimingInput = {
  event: string;
  data?: Record<string, unknown>;
};

export type ProviderTestResult = {
  ok: boolean;
  message: string;
};

export type WeReadSaveSettingsInput = {
  apiKey?: string;
  removeApiKey?: boolean;
  openMethod: WeReadOpenMethod;
};

export type WeReadOpenTarget = {
  bookId: string;
  chapterUid?: number;
  range?: string;
  userVid?: number;
};

export type WeReadState = {
  settings: WeReadSettings;
  books: WeReadBook[];
};

export type WeReadReadingStatsQueryInput = {
  mode: WeReadReadingStatsMode;
  baseTime?: number;
};

export type DesktopIpcInvokeMap = {
  'agent:annotate': {
    args: [payload: AgentAnnotatePayload];
    result: AgentAnnotateResult;
  };
  'agent:comment': {
    args: [payload: AgentMessagePayload];
    result: Comment;
  };
  'agent:delete': {
    args: [id: string];
    result: DesktopStore;
  };
  'agent:mention-route': {
    args: [payload: AgentMentionInstructionPayload];
    result: AgentMentionRoutePlan;
  };
  'agent:review': {
    args: [payload: AgentReviewPayload];
    result: Comment[];
  };
  'agent:save': {
    args: [agent: Partial<Agent>];
    result: DesktopStore;
  };
  'annotation:metadata': {
    args: [payload: AnnotationMetadataPayload];
    result: AnnotationMetadata;
  };
  'app:info': {
    args: [];
    result: AppInfo;
  };
  'article:delete': {
    args: [id: string];
    result: ArticleDeletePatch;
  };
  'article:delete-annotation': {
    args: [input: ArticleAnnotationDeleteInput];
    result: ArticleUpsertPatch | null;
  };
  'article:delete-comment': {
    args: [input: ArticleCommentDeleteInput];
    result: ArticleUpsertPatch | null;
  };
  'article:get': {
    args: [id: string];
    result: ArticleRecord | null;
  };
  'article:get-cover': {
    args: [id: string];
    result: string;
  };
  'article:import-url': {
    args: [url: string];
    result: ArticleImportResult;
  };
  'article:reading-progress': {
    args: [input: { articleId: string; progress: ArticleReadingProgress }];
    result: ArticleReadingProgressPatch;
  };
  'article:save': {
    args: [article: ArticleRecord];
    result: ArticleUpsertPatch;
  };
  'data:database-backup': {
    args: [];
    result: DatabaseBackupResult;
  };
  'data:database-restore': {
    args: [];
    result: DatabaseRestoreResult;
  };
  'data:open-path': {
    args: [kind: DataManagementPathKind];
    result: void;
  };
  'data:paths': {
    args: [];
    result: DataManagementPaths;
  };
  'ebook:import-file': {
    args: [input: EbookImportFileInput];
    result: ArticleImportResult;
  };
  'ebook:read-file': {
    args: [articleId: string];
    result: ArrayBuffer;
  };
  'pdf:import-file': {
    args: [input: PdfImportFileInput];
    result: ArticleImportResult;
  };
  'pdf:read-file': {
    args: [articleId: string];
    result: ArrayBuffer;
  };
  'focus-co-reading:route': {
    args: [payload: FocusCoReadingRoutePayload];
    result: FocusCoReadingRouteResult;
  };
  'log:clear': {
    args: [];
    result: void;
  };
  'log:path': {
    args: [];
    result: string;
  };
  'log:read': {
    args: [];
    result: string;
  };
  'performance:timing': {
    args: [input: PerformanceTimingInput];
    result: void;
  };
  'provider:delete': {
    args: [id: string];
    result: DesktopStore;
  };
  'provider:list-models': {
    args: [provider: Partial<LlmProvider>];
    result: ProviderModel[];
  };
  'provider:read-api-key': {
    args: [providerId: string];
    result: string;
  };
  'provider:save': {
    args: [provider: Partial<LlmProvider> & { removeApiKey?: boolean }];
    result: DesktopStore;
  };
  'provider:test': {
    args: [provider: Partial<LlmProvider>];
    result: ProviderTestResult;
  };
  'settings:save': {
    args: [settings: AppSettings];
    result: DesktopStore;
  };
  'store:get': {
    args: [];
    result: DesktopStoreGetResult;
  };
  'updates:check': {
    args: [];
    result: AppUpdateState;
  };
  'updates:download': {
    args: [];
    result: AppUpdateState;
  };
  'updates:get-status': {
    args: [];
    result: AppUpdateState;
  };
  'updates:install': {
    args: [];
    result: AppUpdateState;
  };
  'url:open': {
    args: [url: string];
    result: void;
  };
  'weread:get-state': {
    args: [];
    result: WeReadState;
  };
  'weread:read-api-key': {
    args: [];
    result: string;
  };
  'weread:save-settings': {
    args: [input: WeReadSaveSettingsInput];
    result: WeReadState;
  };
  'weread:test': {
    args: [apiKey?: string];
    result: ProviderTestResult;
  };
  'weread:sync': {
    args: [];
    result: WeReadSyncResult;
  };
  'weread:sync-book': {
    args: [bookId: string];
    result: WeReadBookDetail | null;
  };
  'weread:get-book': {
    args: [bookId: string];
    result: WeReadBookDetail | null;
  };
  'weread:open': {
    args: [target: WeReadOpenTarget];
    result: void;
  };
  'weread:get-reading-stats': {
    args: [];
    result: WeReadReadingStatsState;
  };
  'weread:query-reading-stats': {
    args: [input: WeReadReadingStatsQueryInput];
    result: WeReadReadingStatsState;
  };
  'user:save': {
    args: [user: Partial<UserProfile>];
    result: DesktopStore;
  };
};

export type DesktopIpcInvokeChannel = keyof DesktopIpcInvokeMap;

export type DesktopIpcInvokeArgs<Channel extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[Channel]['args'];

export type DesktopIpcInvokeResult<Channel extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[Channel]['result'];
