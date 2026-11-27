import desktopPackage from '../../desktop/package.json';

export type ReleaseDownloads = {
  version: string;
  mac: string;
  windows: string;
};

const releaseVersion = desktopPackage.version;
const releaseBaseUrl = `https://download.yomitomo.app/releases/download/v${releaseVersion}`;

export const releaseDownloads: ReleaseDownloads = {
  version: releaseVersion,
  mac: `${releaseBaseUrl}/Yomitomo-${releaseVersion}-mac-arm64.dmg`,
  windows: `${releaseBaseUrl}/Yomitomo-${releaseVersion}-win-x64.exe`,
};
