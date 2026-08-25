export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'download-error'
  | 'downloaded'
  | 'error'
  | 'unsupported';

export type AppUpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

export type AppUpdateTrigger = 'manual' | 'auto';

export type AppUpdateState = {
  status: AppUpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  releaseName?: string | null;
  releaseDate?: string;
  checkedAt?: string;
  message?: string;
  progress?: AppUpdateProgress;
  trigger?: AppUpdateTrigger;
  simulation?: 'development';
};
