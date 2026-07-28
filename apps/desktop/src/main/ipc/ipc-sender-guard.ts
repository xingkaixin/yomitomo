import type { WebContents, WebFrameMain } from 'electron';
import type { DesktopIpcInvokeChannel, DesktopIpcToMainEventChannel } from '../../ipc-contract';
import {
  desktopIpcInvokeRoles,
  desktopIpcMainEventRoles,
  type RendererRole,
} from '../../ipc-authorization';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../ipc-errors';
import { logError } from '../app/logger';
import type { RendererRoleRegistry } from './renderer-role-registry';

type SenderEvent = {
  sender: Pick<WebContents, 'id' | 'isDestroyed' | 'mainFrame'>;
  senderFrame?: WebFrameMain | null;
};

let rendererRoles: RendererRoleRegistry | null = null;

export function configureDesktopIpcRendererRoles(registry: RendererRoleRegistry | null) {
  rendererRoles = registry;
}

export function assertDesktopIpcInvokeSenderAuthorized(
  channel: DesktopIpcInvokeChannel,
  event: SenderEvent,
) {
  assertSenderAuthorized('invoke', channel, desktopIpcInvokeRoles[channel], event);
}

export function assertDesktopIpcMainEventSenderAuthorized(
  channel: DesktopIpcToMainEventChannel,
  event: SenderEvent,
) {
  assertSenderAuthorized('event', channel, desktopIpcMainEventRoles[channel], event);
}

function assertSenderAuthorized(
  kind: 'event' | 'invoke',
  channel: string,
  allowedRoles: readonly RendererRole[],
  event: SenderEvent,
) {
  if (!rendererRoles) return;

  const denial = senderDenialReason(allowedRoles, event);
  if (!denial) return;

  logError('ipc.sender_not_authorized', new Error(denial), {
    channel,
    kind,
    senderId: event.sender.id,
  });
  throw new DesktopIpcError(desktopIpcErrorCodes.senderNotAuthorized);
}

function senderDenialReason(allowedRoles: readonly RendererRole[], event: SenderEvent) {
  if (event.sender.isDestroyed()) return 'sender_destroyed';
  // A subframe can be cross-origin content; only the window's own document may call main.
  if (event.senderFrame && event.senderFrame !== event.sender.mainFrame) return 'sender_subframe';

  const role = rendererRoles?.roleOf(event.sender.id);
  if (!role) return 'sender_unregistered';
  return allowedRoles.includes(role) ? null : 'role_not_allowed';
}
