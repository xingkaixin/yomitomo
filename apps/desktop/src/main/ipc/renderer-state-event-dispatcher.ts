import type { WebContents } from 'electron';
import type {
  DesktopIpcToRendererEventArgs,
  DesktopIpcToRendererEventChannel,
} from '../../ipc-contract';
import type { RendererRole } from '../../ipc-authorization';
import { sendDesktopIpcRendererEvent } from './ipc-events';
import type { RendererRoleRegistry, RendererRoleTarget } from './renderer-role-registry';

type RendererStateEventChannel = Extract<
  DesktopIpcToRendererEventChannel,
  'article:patched' | 'collection:patched' | 'library-pin:patched' | 'store:updated'
>;

export type RendererStateEventTargetRole = RendererRole;

type RendererStateEventSource = Pick<WebContents, 'id'>;
type RendererStateEventPolicy = {
  senderDelivery: 'exclude' | 'include';
  targetRoles: readonly RendererStateEventTargetRole[];
};

const eventPolicies: Record<RendererStateEventChannel, RendererStateEventPolicy> = {
  'article:patched': {
    senderDelivery: 'exclude',
    targetRoles: ['main', 'annotation'],
  },
  'collection:patched': {
    senderDelivery: 'exclude',
    targetRoles: ['main'],
  },
  'library-pin:patched': {
    senderDelivery: 'exclude',
    targetRoles: ['main'],
  },
  'store:updated': {
    senderDelivery: 'exclude',
    targetRoles: ['main'],
  },
};

export function createRendererStateEventDispatcher(roles: RendererRoleRegistry) {
  function dispatch<Channel extends RendererStateEventChannel>(
    source: RendererStateEventSource | null,
    channel: Channel,
    ...args: DesktopIpcToRendererEventArgs<Channel>
  ) {
    const policy = eventPolicies[channel];
    for (const target of roles.liveEntries()) {
      if (!policy.targetRoles.includes(target.role)) continue;
      if (policy.senderDelivery === 'exclude' && source?.id === target.webContents.id) continue;
      sendDesktopIpcRendererEvent(target.webContents, channel, ...args);
    }
  }

  return {
    dispatch,
    registerTarget: (role: RendererRole, webContents: RendererRoleTarget) =>
      roles.register(role, webContents),
  };
}

export type RendererStateEventDispatcher = ReturnType<typeof createRendererStateEventDispatcher>;
