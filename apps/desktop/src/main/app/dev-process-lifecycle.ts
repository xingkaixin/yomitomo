import { app, BrowserWindow } from 'electron';

type LogInfo = (event: string, data?: Record<string, unknown>) => void;

const PARENT_CHECK_INTERVAL_MS = 1_000;
const FORCE_EXIT_DELAY_MS = 1_500;

export function installDevProcessLifecycle(logInfo: LogInfo) {
  if (app.isPackaged) return;

  const initialParentPid = process.ppid;
  let exitRequested = false;
  let parentCheckTimer: NodeJS.Timeout | null = null;
  let forceExitTimer: NodeJS.Timeout | null = null;

  const stopTimers = () => {
    if (parentCheckTimer) {
      clearInterval(parentCheckTimer);
      parentCheckTimer = null;
    }
    if (forceExitTimer) {
      clearTimeout(forceExitTimer);
      forceExitTimer = null;
    }
  };

  const requestExit = (reason: string, data: Record<string, unknown> = {}) => {
    if (exitRequested) return;
    exitRequested = true;
    if (parentCheckTimer) {
      clearInterval(parentCheckTimer);
      parentCheckTimer = null;
    }

    logInfo('app.dev_lifecycle.exit_requested', {
      reason,
      pid: process.pid,
      initialParentPid,
      currentParentPid: process.ppid,
      windowCount: BrowserWindow.getAllWindows().length,
      ...data,
    });

    if (!app.isReady()) {
      app.exit(0);
      return;
    }

    app.quit();
    forceExitTimer = setTimeout(() => {
      logInfo('app.dev_lifecycle.force_exit', {
        reason,
        pid: process.pid,
        windowCount: BrowserWindow.getAllWindows().length,
      });
      app.exit(0);
    }, FORCE_EXIT_DELAY_MS);
    forceExitTimer.unref?.();
  };

  logInfo('app.dev_lifecycle.monitor_started', {
    pid: process.pid,
    initialParentPid,
  });

  parentCheckTimer = setInterval(() => {
    if (process.ppid === initialParentPid) return;
    requestExit('parent_changed');
  }, PARENT_CHECK_INTERVAL_MS);
  parentCheckTimer.unref?.();

  process.once('SIGINT', () => requestExit('signal', { signal: 'SIGINT' }));
  process.once('SIGTERM', () => requestExit('signal', { signal: 'SIGTERM' }));
  process.once('SIGHUP', () => requestExit('signal', { signal: 'SIGHUP' }));

  app.once('quit', stopTimers);
}
