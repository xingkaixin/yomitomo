import type { ReleaseNoteHighlight } from '@yomitomo/shared';
import type { AppUpdateState } from '../../../app-update-types';

export type ActiveReleaseDialog =
  | { scene: 'after-update'; version: string; highlights: ReleaseNoteHighlight[] }
  | { scene: 'before-update'; version: string };

export type UpdateDialogState = {
  dialog: ActiveReleaseDialog | null;
  handledDownloadedKey: string | null;
  handledManualKey: string | null;
};

export type UpdateDialogEvent =
  | { type: 'afterUpdateOpened'; version: string; highlights: ReleaseNoteHighlight[] }
  | { type: 'closed' }
  | { type: 'requested'; updateState: AppUpdateState | null }
  | { type: 'updateStateChanged'; updateState: AppUpdateState | null };

export const initialUpdateDialogState: UpdateDialogState = {
  dialog: null,
  handledDownloadedKey: null,
  handledManualKey: null,
};

// A（更新前）：手动检查命中即弹；自动检查命中只点亮常驻入口，用户从 header 主动请求时再弹。
export function updateDialogReducer(
  state: UpdateDialogState,
  event: UpdateDialogEvent,
): UpdateDialogState {
  switch (event.type) {
    case 'afterUpdateOpened':
      return {
        ...state,
        dialog: { scene: 'after-update', version: event.version, highlights: event.highlights },
      };
    case 'closed':
      return state.dialog ? { ...state, dialog: null } : state;
    case 'requested': {
      const update = event.updateState;
      if (!update?.availableVersion || !canOpenUpdateDialog(update.status)) return state;
      return { ...state, dialog: { scene: 'before-update', version: update.availableVersion } };
    }
    case 'updateStateChanged': {
      const update = event.updateState;
      if (!update?.availableVersion) return state;
      // checkedAt 去重：同一次命中只弹一次，再次检查会重新弹。
      const handledKey = update.checkedAt ?? update.availableVersion;
      const beforeUpdate = { scene: 'before-update', version: update.availableVersion } as const;
      if (update.status === 'available' && update.trigger === 'manual') {
        if (state.handledManualKey === handledKey) return state;
        return { ...state, dialog: beforeUpdate, handledManualKey: handledKey };
      }
      if (update.status !== 'downloaded' || state.handledDownloadedKey === handledKey) return state;
      const showingVersion =
        state.dialog?.scene === 'before-update' && state.dialog.version === update.availableVersion;
      return {
        ...state,
        dialog: showingVersion ? state.dialog : beforeUpdate,
        handledDownloadedKey: handledKey,
      };
    }
  }
}

function canOpenUpdateDialog(status: AppUpdateState['status']) {
  return (
    status === 'available' ||
    status === 'downloading' ||
    status === 'download-error' ||
    status === 'downloaded'
  );
}
