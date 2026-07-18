import type { AppSettings, DesktopStore, UserProfile } from '@yomitomo/shared';
import type { UserStorePatch } from '../../ipc-contract';
import { getDatabase } from './store-db';
import { readShellStore, readStore } from './store-snapshot';
import { saveUserProfile, upsertSettings } from './settings-repository';

export async function saveUser(input: Partial<UserProfile>): Promise<UserStorePatch> {
  return { user: saveUserProfile(getDatabase(), input) };
}

export async function saveSettings(input: AppSettings): Promise<DesktopStore> {
  upsertSettings(getDatabase(), input);
  return readStore();
}

export async function saveSettingsShell(input: AppSettings): Promise<DesktopStore> {
  upsertSettings(getDatabase(), input);
  return readShellStore();
}
