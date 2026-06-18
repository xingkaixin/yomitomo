import { contextBridge } from 'electron';
import { createYomitomoDesktopApi } from './desktop-api-fragments';

export type {
  AppInfo,
  AgentRuntimeTraceEntry,
  AgentRuntimeTraceListInput,
  AgentRuntimeTraceTaskType,
  AppLockSetEnabledInput,
  AppLockSetLockedInput,
  AppLockSetPinInput,
  AppLockSetShortcutInput,
  AppLockStatus,
  AppLockUnlockInput,
  AppLockVerifyPinInput,
  AppLockVerifyPinResult,
  AnnotationDiscussionWindowOpenInput,
  AnnotationDiscussionWindowOpenResult,
  AnnotationDiscussionWindowState,
  AnnotationDiscussionWindowStateEvent,
  AnnotationDiscussionWindowsCloseArticleInput,
  AnnotationDiscussionWindowsCloseArticleResult,
  AnnotationSedimentationWindowOpenInput,
  AnnotationSedimentationWindowOpenResult,
  AnnotationSedimentationCommitInput,
  AnnotationSedimentationCommitResult,
  AnnotationDistillationCommitTransition,
  AnnotationDistillationCommittedEvent,
  AssistantExecutionQueryInput,
  AssistantExecutionRun,
  AssistantExecutionStatus,
  AssistantExecutionSummary,
  AssistantExecutionSummaryGroup,
  AssistantExecutionTotals,
  AssistantExecutionUsage,
  ArticleAnnotationDeleteInput,
  ArticleAnnotationUpsertInput,
  ArticleCommentDeleteInput,
  ArticleCommentUpsertInput,
  ArticleImportResult,
  ArticleImportUrlInput,
  ArticleReaderChatStateSaveInput,
  DataManagementPathKind,
  DataManagementPaths,
  DatabaseBackupResult,
  DatabaseRestoreResult,
  EbookImportFileInput,
  PerformanceTimingInput,
  PdfImportFileInput,
  WeReadOpenTarget,
  WeReadReadingStatsQueryInput,
  WeReadSaveSettingsInput,
} from '../ipc-contract';

const preloadLoadedAt = performance.now();

const api = createYomitomoDesktopApi({
  platform: process.platform,
  preloadLoadedAt,
});

contextBridge.exposeInMainWorld('yomitomoDesktop', api);

export type YomitomoDesktopApi = typeof api;
