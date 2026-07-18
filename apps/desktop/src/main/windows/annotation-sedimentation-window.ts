import { BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type {
  AnnotationSedimentationCommitInput,
  AnnotationSedimentationWindowOpenInput,
} from '../../ipc-contract';
import { handleDesktopIpc } from '../ipc/ipc';
import { sendDesktopIpcRendererEvent } from '../ipc/ipc-events';
import {
  annotationWindowRoutes,
  closeAnnotationWindow,
  minimizeOtherAnnotationWindows,
  openAnnotationWindow,
  scheduleCloseAnnotationWindow,
  type AnnotationWindowConfiguration,
  type AnnotationWindowIpcContext,
} from './annotation-window-lifecycle';

const sedimentationWindowConfiguration = {
  route: annotationWindowRoutes.sedimentation,
  dimensions: {
    width: 860,
    height: 700,
    minWidth: 720,
    minHeight: 560,
  },
  initialTitle: ({ annotationId }) => `Distillation - ${annotationId.slice(0, 8)}`,
} satisfies AnnotationWindowConfiguration<AnnotationSedimentationWindowOpenInput>;

export function registerAnnotationSedimentationWindowIpc(context: AnnotationWindowIpcContext) {
  handleDesktopIpc('annotation-sedimentation:open', (event, input) =>
    openAnnotationSedimentationWindow(context, input, event),
  );
  handleDesktopIpc('annotation-sedimentation:commit', (event, input) =>
    completeAnnotationSedimentation(context, input, BrowserWindow.fromWebContents(event.sender)),
  );
}

function openAnnotationSedimentationWindow(
  context: AnnotationWindowIpcContext,
  input: AnnotationSedimentationWindowOpenInput,
  event: IpcMainInvokeEvent,
) {
  return openAnnotationWindow(context, event, input, sedimentationWindowConfiguration);
}

function completeAnnotationSedimentation(
  context: AnnotationWindowIpcContext,
  input: AnnotationSedimentationCommitInput,
  sourceWindow: BrowserWindow | null,
) {
  const closedDiscussion = closeAnnotationWindow(annotationWindowRoutes.discussion, input);
  const minimized =
    minimizeOtherAnnotationWindows(annotationWindowRoutes.discussion, input) +
    minimizeOtherAnnotationWindows(annotationWindowRoutes.sedimentation, input);
  const closedSedimentation = scheduleCloseAnnotationWindow(
    annotationWindowRoutes.sedimentation,
    input,
    sourceWindow,
  );
  notifyDistillationCommitted(context, input);
  restoreMainWindow(context);
  return {
    closed: closedDiscussion + closedSedimentation,
    minimized,
  };
}

function notifyDistillationCommitted(
  context: AnnotationWindowIpcContext,
  input: AnnotationSedimentationCommitInput,
) {
  const mainWindow = context.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  sendDesktopIpcRendererEvent(mainWindow.webContents, 'annotation-distillation:committed', input);
}

function restoreMainWindow(context: AnnotationWindowIpcContext) {
  const mainWindow = context.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}
