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
  type RendererRole,
} from './ipc/desktop-ipc-descriptor';

/**
 * Every renderer loads the same preload, so the main process is the authoritative place
 * to decide what a window may call. The matrices below are exhaustive by type: adding a
 * channel without choosing its roles fails to compile, which keeps the default a denial.
 */
export type { RendererRole } from './ipc/desktop-ipc-descriptor';

const desktopIpcLegacyInvokeRoles = {
  'agent:delete': mainOnly,
  'agent:mention-route': annotationAndMain,
  'agent:review': mainOnly,
  'agent:save': mainOnly,
  'agent-trace:clear': mainOnly,
  'agent-trace:list': mainOnly,
  'agent-trace:path': mainOnly,
  'assistant-executions:list': mainOnly,
  'assistant-executions:detail': mainOnly,
  'assistant-executions:summary': mainOnly,
  'annotation-discussion:open': mainOnly,
  'annotation-discussion:close-article': mainOnly,
  'annotation-sedimentation:open': annotationAndMain,
  'annotation-sedimentation:commit': annotationAndMain,
  'provider:delete': mainOnly,
  'provider:list-models': mainOnly,
  'provider:read-api-key': mainOnly,
  'provider:save': mainOnly,
  'provider:test': mainOnly,
  'settings:save': mainOnly,
  'user:save': mainOnly,
} as const;

export const desktopIpcInvokeRoles = {
  ...desktopIpcLegacyInvokeRoles,
  ...desktopIpcInvokeRolesFromDescriptors(desktopIpcInvokeDescriptors),
} as const satisfies Record<DesktopIpcInvokeChannel, DesktopIpcRendererRoles>;

export const desktopIpcMainEventRoles = {
  'agent:annotate:stream': mainOnly,
  'agent:comment:stream': annotationAndMain,
  'agent:distillation-review:stream': annotationAndMain,
  'agent:stream-cancel': annotationAndMain,
  'app:renderer-ready': mainOnly,
} as const satisfies Record<DesktopIpcToMainEventChannel, readonly RendererRole[]>;
