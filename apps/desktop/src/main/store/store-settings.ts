import type { AppSettingsPatch, DesktopStore, UserProfile } from '@yomitomo/shared';
import type { UserStorePatch } from '../../ipc-contract';
import { getDatabase } from './store-db';
import { readShellStore } from './store-snapshot';
import {
  readAppLockSettings as readStoredAppLockSettings,
  saveUserProfile,
  upsertSettings,
} from './settings-repository';

export function readAppLockSettings() {
  return readStoredAppLockSettings(getDatabase());
}

export async function saveUser(input: Partial<UserProfile>): Promise<UserStorePatch> {
  return { user: saveUserProfile(getDatabase(), input) };
}

// Article summaries load through the paginated catalog, so settings snapshots omit them like
// store:get does.
export async function saveSettings(input: AppSettingsPatch): Promise<DesktopStore> {
  upsertSettings(getDatabase(), input);
  return readShellStore();
}
