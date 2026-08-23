import type { AppSettingsPatch, DesktopStore, UserProfile } from '@yomitomo/shared';
import type { UserStorePatch } from '../../ipc-contract';
import { getDatabase } from './store-db';
import { readShellStore, readStore } from './store-snapshot';
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

export async function saveSettings(input: AppSettingsPatch): Promise<DesktopStore> {
  upsertSettings(getDatabase(), input);
  return readStore();
}

export async function saveSettingsShell(input: AppSettingsPatch): Promise<DesktopStore> {
  upsertSettings(getDatabase(), input);
  return readShellStore();
}
