import {
  desktopIpcInvokeDescriptors,
  type DesktopIpcInvokeChannel,
  type DesktopIpcToMainEventChannel,
} from './ipc-contract';
import {
  annotationAndMain,
  desktopIpcInvokeRolesFromDescriptors,
  mainOnly,
  type DesktopIpcRendererRoles,
} from './ipc/desktop-ipc-descriptor';

/**
 * Every renderer loads the same preload, so the main process is the authoritative place
 * to decide what a window may call. The matrices below are exhaustive by type: adding a
 * channel without choosing its roles fails to compile, which keeps the default a denial.
 */
export type { RendererRole } from './ipc/desktop-ipc-descriptor';

export const desktopIpcInvokeRoles = desktopIpcInvokeRolesFromDescriptors(
  desktopIpcInvokeDescriptors,
) satisfies Record<DesktopIpcInvokeChannel, DesktopIpcRendererRoles>;

export const desktopIpcMainEventRoles = {
  'agent:annotate:stream': mainOnly,
  'agent:comment:stream': annotationAndMain,
  'agent:distillation-review:stream': annotationAndMain,
  'agent:stream-cancel': annotationAndMain,
  'app:renderer-ready': mainOnly,
} as const satisfies Record<DesktopIpcToMainEventChannel, DesktopIpcRendererRoles>;
