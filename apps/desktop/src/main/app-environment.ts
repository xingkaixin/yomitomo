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
  return app.isPackaged ? PRODUCTION_PROFILE : DEVELOPMENT_PROFILE;
}

export function configureDesktopAppStorage() {
  const profile = getDesktopAppProfile();
  app.setName('Yomitomo');
  app.setPath('userData', join(app.getPath('appData'), profile.userDataDirectory));
}
