export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported';

export type AppUpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

export type AppUpdateState = {
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  releaseName?: string | null;
  releaseDate?: string;
  checkedAt?: string;
  message?: string;
  progress?: AppUpdateProgress;
};
