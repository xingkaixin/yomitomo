import type { WebContents } from 'electron';
import type { RendererRole } from '../../ipc-authorization';

export type RendererRoleTarget = Pick<WebContents, 'id' | 'isDestroyed' | 'send'>;
export type RendererRoleEntry = { role: RendererRole; webContents: RendererRoleTarget };

/**
 * Single source of truth for which role a live renderer plays: inbound IPC authorization
 * and outbound state events both read it, so a window cannot be trusted by one and
 * unknown to the other.
 */
export function createRendererRoleRegistry() {
  const entries = new Map<number, RendererRoleEntry>();

  return {
    register(role: RendererRole, webContents: RendererRoleTarget) {
      entries.set(webContents.id, { role, webContents });
      return () => {
        if (entries.get(webContents.id)?.webContents === webContents) {
          entries.delete(webContents.id);
        }
      };
    },
    roleOf(webContentsId: number): RendererRole | null {
      const entry = entries.get(webContentsId);
      if (!entry) return null;
      if (entry.webContents.isDestroyed()) {
        entries.delete(webContentsId);
        return null;
      }
      return entry.role;
    },
    liveEntries(): RendererRoleEntry[] {
      const live: RendererRoleEntry[] = [];
      for (const [id, entry] of entries) {
        if (entry.webContents.isDestroyed()) entries.delete(id);
        else live.push(entry);
      }
      return live;
    },
  };
}

export type RendererRoleRegistry = ReturnType<typeof createRendererRoleRegistry>;
