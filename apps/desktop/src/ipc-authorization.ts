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
  'article:delete': mainOnly,
  'article:delete-annotation': mainOnly,
  'article:delete-comment': annotationAndMain,
  'article:merge-agent-annotation': mainOnly,
  'article:save-annotation': mainOnly,
  'article:save-annotation-distillation': annotationAndMain,
  'article:save-comment': annotationAndMain,
  'article:get': annotationAndMain,
  'article:get-cover': mainOnly,
  'article:get-site-icon': mainOnly,
  'article:import-url': mainOnly,
  'article:import-url-cancel': mainOnly,
  'article:list-library': mainOnly,
  'article:stats-summaries': mainOnly,
  'article:reading-progress': mainOnly,
  'article:reader-chat-state': mainOnly,
  'article-translation:get-current': mainOnly,
  'article-translation:translate': mainOnly,
  'article-translation:delete-current': mainOnly,
  'ebook:import-file': mainOnly,
  'ebook:read-file': mainOnly,
  'pdf:import-file': mainOnly,
  'pdf:read-file': mainOnly,
  'pdf:get-thumbnail': mainOnly,
  'text:import-prepare': mainOnly,
  'text:import-commit': mainOnly,
  'distillation-library:list': mainOnly,
  'library-catalog:list': mainOnly,
  'library-collection:list': mainOnly,
  'library-collection:create': mainOnly,
  'library-collection:rename': mainOnly,
  'library-collection:delete': mainOnly,
  'library-collection:add-members': mainOnly,
  'library-collection:remove-member': mainOnly,
  'library-pin:list': mainOnly,
  'library-pin:set': mainOnly,
  'provider:delete': mainOnly,
  'provider:list-models': mainOnly,
  'provider:read-api-key': mainOnly,
  'provider:save': mainOnly,
  'provider:test': mainOnly,
  'settings:save': mainOnly,
  'user:save': mainOnly,
  'weread:get-settings': mainOnly,
  'weread:get-state': mainOnly,
  'weread:read-api-key': mainOnly,
  'weread:save-settings': mainOnly,
  'weread:test': mainOnly,
  'weread:sync': mainOnly,
  'weread:sync-book': mainOnly,
  'weread:get-book': mainOnly,
  'weread:open': mainOnly,
  'weread:get-reading-stats': mainOnly,
  'weread:query-reading-stats': mainOnly,
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
