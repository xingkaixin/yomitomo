export type AppMenuCommand =
  | 'backup-database'
  | 'check-updates'
  | 'import-ebook'
  | 'import-pdf'
  | 'import-web'
  | 'open-about'
  | 'open-release-notes'
  | 'open-settings'
  | 'open-help-docs'
  | 'report-issue'
  | 'restore-database'
  | 'sync-weread';

export type AppMenuCommandRequest = {
  command: AppMenuCommand;
  id: number;
};
