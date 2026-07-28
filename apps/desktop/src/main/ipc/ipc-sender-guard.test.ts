import type { WebFrameMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopIpcInvokeRoles, desktopIpcMainEventRoles } from '../../ipc-authorization';
import { desktopIpcErrorCodes } from '../../ipc-errors';
import {
  assertDesktopIpcInvokeSenderAuthorized,
  assertDesktopIpcMainEventSenderAuthorized,
  configureDesktopIpcRendererRoles,
} from './ipc-sender-guard';
import { createRendererRoleRegistry } from './renderer-role-registry';

vi.mock('electron', () => ({ ipcMain: { on: vi.fn() } }));
vi.mock('../app/logger', () => ({ logError: vi.fn() }));

let roles = createRendererRoleRegistry();

beforeEach(() => {
  roles = createRendererRoleRegistry();
  configureDesktopIpcRendererRoles(roles);
});

afterEach(() => {
  configureDesktopIpcRendererRoles(null);
});

describe('desktop IPC sender authorization', () => {
  it('lets the main window call every declared channel', () => {
    const main = senderEvent(1);
    roles.register('main', main.sender);

    for (const channel of Object.keys(desktopIpcInvokeRoles)) {
      expect(() => assertInvoke(channel, main)).not.toThrow();
    }
    for (const channel of Object.keys(desktopIpcMainEventRoles)) {
      expect(() => assertMainEvent(channel, main)).not.toThrow();
    }
  });

  it('limits the annotation window to its own responsibilities', () => {
    const annotation = senderEvent(2);
    roles.register('annotation', annotation.sender);

    const allowed = Object.entries(desktopIpcInvokeRoles)
      .filter(([, allowedRoles]) => (allowedRoles as readonly string[]).includes('annotation'))
      .map(([channel]) => channel);

    expect(allowed.toSorted()).toEqual([
      'agent:mention-route',
      'annotation-sedimentation:commit',
      'annotation-sedimentation:open',
      'app:info',
      'article:delete-comment',
      'article:get',
      'article:save-annotation-distillation',
      'article:save-comment',
      'performance:timing',
      'store:get',
      'url:open',
    ]);
    for (const channel of allowed) {
      expect(() => assertInvoke(channel, annotation)).not.toThrow();
    }
  });

  it('refuses privileged channels from the annotation window', () => {
    const annotation = senderEvent(2);
    roles.register('annotation', annotation.sender);

    for (const channel of [
      'data:database-restore',
      'provider:read-api-key',
      'log:read',
      'updates:install',
      'settings:save',
      'weread:sync',
    ]) {
      expect(() => assertInvoke(channel, annotation)).toThrow(
        desktopIpcErrorCodes.senderNotAuthorized,
      );
    }
    expect(() => assertMainEvent('agent:annotate:stream', annotation)).toThrow(
      desktopIpcErrorCodes.senderNotAuthorized,
    );
  });

  it('refuses senders that are unregistered, destroyed or not the top frame', () => {
    const unregistered = senderEvent(3);
    const destroyed = senderEvent(4, { destroyed: true });
    const subframe = senderEvent(5, { fromSubframe: true });
    roles.register('main', destroyed.sender);
    roles.register('main', subframe.sender);

    for (const event of [unregistered, destroyed, subframe]) {
      expect(() => assertInvoke('store:get', event)).toThrow(
        desktopIpcErrorCodes.senderNotAuthorized,
      );
    }
  });

  it('refuses a sender whose window was unregistered on close', () => {
    const main = senderEvent(6);
    const unregister = roles.register('main', main.sender);

    expect(() => assertInvoke('store:get', main)).not.toThrow();
    unregister();
    expect(() => assertInvoke('store:get', main)).toThrow(desktopIpcErrorCodes.senderNotAuthorized);
  });
});

type GuardSenderEvent = ReturnType<typeof senderEvent>;

function assertInvoke(channel: string, event: GuardSenderEvent) {
  assertDesktopIpcInvokeSenderAuthorized(
    channel as Parameters<typeof assertDesktopIpcInvokeSenderAuthorized>[0],
    event,
  );
}

function assertMainEvent(channel: string, event: GuardSenderEvent) {
  assertDesktopIpcMainEventSenderAuthorized(
    channel as Parameters<typeof assertDesktopIpcMainEventSenderAuthorized>[0],
    event,
  );
}

function senderEvent(id: number, options: { destroyed?: boolean; fromSubframe?: boolean } = {}) {
  const mainFrame = { name: `frame-${id}` } as WebFrameMain;
  const sender = {
    id,
    isDestroyed: () => Boolean(options.destroyed),
    mainFrame,
    send: vi.fn(),
  };
  return {
    sender,
    senderFrame: options.fromSubframe ? ({ name: `subframe-${id}` } as WebFrameMain) : mainFrame,
  };
}
