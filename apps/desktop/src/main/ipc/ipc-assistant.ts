import {
  activeAssistantRuns,
  assistantArticleTexts,
  cancelAssistantRun,
  loadAssistantSessions,
} from '../assistant-sessions/assistant-session-lifecycle';
import { handleDesktopIpc, type DesktopMainIpcContext } from './ipc';
import { sendDesktopIpcRendererEvent } from './ipc-events';

export function registerAssistantIpc(context: Pick<DesktopMainIpcContext, 'getMainWindow'>) {
  handleDesktopIpc('assistant:save-article-text', (_event, input) =>
    assistantArticleTexts.save(input.articleId, input.snapshot),
  );
  handleDesktopIpc('assistant:has-article-text', (_event, articleId) =>
    assistantArticleTexts.has(articleId),
  );
  handleDesktopIpc('assistant:deliver', async (_event, request) => {
    const { runtime } = await loadAssistantSessions();
    const { runKey, deliveryId } = await runtime.deliver(request);
    return { runKey: runKey ?? null, deliveryId };
  });
  handleDesktopIpc('assistant:cancel', (_event, request) => cancelAssistantRun(request));
  handleDesktopIpc('assistant:runs', (_event, articleId) => activeAssistantRuns(articleId));
  // Discussion windows have no reader, so passage links jump in the main window's reader.
  handleDesktopIpc('assistant:reveal-passage', (_event, request) => {
    const mainWindow = focusMainWindow(context);
    if (!mainWindow) return;
    sendDesktopIpcRendererEvent(mainWindow.webContents, 'assistant:reveal-passage', request);
  });
  handleDesktopIpc('assistant:open-model-settings', () => {
    const mainWindow = focusMainWindow(context);
    if (!mainWindow) return;
    sendDesktopIpcRendererEvent(mainWindow.webContents, 'app-menu:command', 'open-model-settings');
  });
}

function focusMainWindow(context: Pick<DesktopMainIpcContext, 'getMainWindow'>) {
  const mainWindow = context.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}
