import { performance } from 'node:perf_hooks';
import type { DesktopStoreGetResult } from '../../app-store-errors';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';
import {
  clearAgentRuntimeTraces,
  getAgentRuntimeTracePath,
  readAgentRuntimeTraces,
} from '../agents/agent-runtime-trace-log';
import { clearLogFile, getLogPath, readLogFile } from '../app/logger';

export function registerStoreDataIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('store:get', async (): Promise<DesktopStoreGetResult> => {
    const startedAt = performance.now();
    context.recordStartupTiming('store.get_start');
    try {
      const importStartedAt = performance.now();
      const { readStoreWithProfile } = await context.getStoreModule();
      const importDurationMs = context.elapsedMs(importStartedAt);
      const readStartedAt = performance.now();
      const { store, profile } = await readStoreWithProfile();
      const readDurationMs = context.elapsedMs(readStartedAt);
      context.scheduleLogPrune(store.settings.logRetentionDays);
      context.recordStartupTiming('store.get_success', {
        durationMs: context.elapsedMs(startedAt),
        importDurationMs,
        readDurationMs,
        articleCount: store.articles.length,
        annotationCount: store.articles.reduce(
          (count, article) => count + (article.annotationCount ?? article.annotations.length),
          0,
        ),
        commentCount: store.articles.reduce((count, article) => {
          const commentCount =
            article.commentCount ??
            article.annotations.reduce(
              (annotationCount, annotation) =>
                annotationCount + annotation.comments.filter((comment) => !comment.replyTo).length,
              0,
            );
          return count + commentCount;
        }, 0),
      });
      context.recordStartupTiming('store.get_profile', { steps: profile });
      return { ok: true, store };
    } catch (error) {
      context.logError('store.get_failed', error);
      context.recordStartupTiming('store.get_error', { durationMs: context.elapsedMs(startedAt) });
      return { ok: false, error: await context.storeLoadErrorInfo(error) };
    }
  });
  handleDesktopIpc('data:paths', async () => {
    const { getDataManagementPaths } = await import('../data-management');
    return getDataManagementPaths();
  });
  handleDesktopIpc('data:open-path', async (_event, kind) => {
    const { openDataManagementPath } = await import('../data-management');
    return openDataManagementPath(kind);
  });
  handleDesktopIpc('data:database-backup', async () => {
    const { backupDatabaseWithDialog } = await import('../data-management');
    return backupDatabaseWithDialog(context.getMainWindow());
  });
  handleDesktopIpc('data:database-restore', async () => {
    const { restoreDatabaseWithDialog } = await import('../data-management');
    const result = await restoreDatabaseWithDialog(context.getMainWindow());
    if (!result.canceled) context.sendFullStoreUpdated(result.store);
    return result;
  });
  handleDesktopIpc('log:path', () => getLogPath());
  handleDesktopIpc('log:read', () => readLogFile());
  handleDesktopIpc('log:clear', () => clearLogFile());
  handleDesktopIpc('agent-trace:path', () => getAgentRuntimeTracePath());
  handleDesktopIpc('agent-trace:list', (_event, input) => readAgentRuntimeTraces(input));
  handleDesktopIpc('agent-trace:clear', () => clearAgentRuntimeTraces());
  handleDesktopIpc('assistant-executions:list', async (_event, input) => {
    const { queryAssistantExecutionRuns } = await context.getStoreModule();
    return queryAssistantExecutionRuns(input);
  });
  handleDesktopIpc('assistant-executions:summary', async (_event, input) => {
    const { queryAssistantExecutionSummary } = await context.getStoreModule();
    return queryAssistantExecutionSummary(input);
  });
  handleDesktopIpc('updates:get-status', async () => {
    const { getAppUpdateState } = await context.getAppUpdaterModule();
    return getAppUpdateState();
  });
  handleDesktopIpc('updates:check', async () => {
    const { checkForAppUpdates } = await context.getAppUpdaterModule();
    return checkForAppUpdates();
  });
  handleDesktopIpc('updates:download', async () => {
    const { downloadAppUpdate } = await context.getAppUpdaterModule();
    return downloadAppUpdate();
  });
  handleDesktopIpc('updates:install', async () => {
    const { installAppUpdate } = await context.getAppUpdaterModule();
    return installAppUpdate();
  });
  handleDesktopIpc('updates:simulate-available', async () => {
    const { simulateUpdateAvailable } = await context.getAppUpdaterModule();
    return simulateUpdateAvailable();
  });
  handleDesktopIpc('release-notes:get', async (_event, input) => {
    const { getReleaseNote } = await import('../app/release-notes');
    return getReleaseNote(input.version, input.source);
  });
}
