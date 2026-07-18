import type { WebContents } from 'electron';
import type {
  DesktopIpcToRendererEventArgs,
  DesktopIpcToRendererEventChannel,
} from '../../ipc-contract';
import { sendDesktopIpcRendererEvent } from './ipc-events';

type RendererStateEventChannel = Extract<
  DesktopIpcToRendererEventChannel,
  'article:patched' | 'collection:patched' | 'library-pin:patched' | 'store:updated'
>;

export type RendererStateEventTargetRole = 'annotation' | 'main';

type RendererStateEventTarget = Pick<WebContents, 'id' | 'isDestroyed' | 'send'>;
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

export function createRendererStateEventDispatcher() {
  const targets = new Map<
    number,
    { role: RendererStateEventTargetRole; webContents: RendererStateEventTarget }
  >();

  function registerTarget(
    role: RendererStateEventTargetRole,
    webContents: RendererStateEventTarget,
  ) {
    targets.set(webContents.id, { role, webContents });
    return () => {
      const target = targets.get(webContents.id);
      if (target?.webContents === webContents) targets.delete(webContents.id);
    };
  }

  function dispatch<Channel extends RendererStateEventChannel>(
    source: RendererStateEventSource | null,
    channel: Channel,
    ...args: DesktopIpcToRendererEventArgs<Channel>
  ) {
    const policy = eventPolicies[channel];
    for (const [id, target] of targets) {
      if (target.webContents.isDestroyed()) {
        targets.delete(id);
        continue;
      }
      if (!policy.targetRoles.includes(target.role)) continue;
      if (policy.senderDelivery === 'exclude' && source?.id === id) continue;
      sendDesktopIpcRendererEvent(target.webContents, channel, ...args);
    }
  }

  return { dispatch, registerTarget };
}

export type RendererStateEventDispatcher = ReturnType<typeof createRendererStateEventDispatcher>;
