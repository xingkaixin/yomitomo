import { join } from 'node:path';
import { app } from 'electron';

type DesktopAppEnvironment = 'development' | 'production';

type DesktopAppProfile = {
  environment: DesktopAppEnvironment;
  keychainService: string;
  userDataDirectory: string;
};

const PRODUCTION_PROFILE: DesktopAppProfile = {
  environment: 'production',
  keychainService: 'app.yomitomo.desktop',
  userDataDirectory: '@yomitomo/desktop',
};

const DEVELOPMENT_PROFILE: DesktopAppProfile = {
  environment: 'development',
  keychainService: 'app.yomitomo.desktop.dev',
  userDataDirectory: '@yomitomo/desktop-dev',
};

export function getDesktopAppProfile(): DesktopAppProfile {
  const profile = app.isPackaged ? PRODUCTION_PROFILE : DEVELOPMENT_PROFILE;
  if (!process.env.YOMITOMO_USER_DATA_DIR) return profile;
  // Fixed accounts such as app-lock:default:pin would otherwise be overwritten and deleted by
  // isolated runs while the real profile's database still points at them.
  return { ...profile, keychainService: `${profile.keychainService}.isolated` };
}

export function configureDesktopAppStorage() {
  const profile = getDesktopAppProfile();
  app.setName('Yomitomo');
  if (process.env.YOMITOMO_USER_DATA_DIR) {
    app.setPath('userData', process.env.YOMITOMO_USER_DATA_DIR);
    return;
  }
  app.setPath('userData', join(app.getPath('appData'), profile.userDataDirectory));
}
