import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { AppMenuCommand } from '../../app-menu-types';

export type AppMenuOptions = {
  appName: string;
  isPackaged: boolean;
  locale: string;
  onCommand: (command: AppMenuCommand) => void;
  platform: NodeJS.Platform;
};

export type AppMenuInstallOptions = AppMenuOptions & {
  logInfo: (event: string, data?: Record<string, unknown>) => void;
};

type AppMenuLabels = ReturnType<typeof appMenuLabels>;

export function installAppMenu(options: AppMenuInstallOptions) {
  const template = buildAppMenuTemplate(options);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  options.logInfo('app.menu.installed', {
    platform: options.platform,
    packaged: options.isPackaged,
    reloadCommandsEnabled: !options.isPackaged,
    topLevelMenus: template.map((item) => item.label || item.role || ''),
  });
}

export function buildAppMenuTemplate(options: AppMenuOptions): MenuItemConstructorOptions[] {
  const labels = appMenuLabels(options.locale);
  const template: MenuItemConstructorOptions[] = [];

  if (options.platform === 'darwin') {
    template.push(buildMacAppMenu(options, labels));
  }

  template.push(
    buildFileMenu(options, labels),
    buildEditMenu(labels),
    buildViewMenu(options, labels),
  );

  if (options.platform === 'darwin') {
    template.push(buildWindowMenu(labels));
  }

  template.push(buildHelpMenu(options, labels));
  return template;
}

function buildMacAppMenu(
  options: AppMenuOptions,
  labels: AppMenuLabels,
): MenuItemConstructorOptions {
  return {
    label: options.appName,
    submenu: [
      commandItem(labels.about, 'open-about', options),
      { type: 'separator' },
      commandItem(labels.settings, 'open-settings', options, 'Command+,'),
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };
}

function buildFileMenu(options: AppMenuOptions, labels: AppMenuLabels): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    commandItem(labels.importWeb, 'import-web', options, 'CmdOrCtrl+N'),
    commandItem(labels.importEbook, 'import-ebook', options, 'CmdOrCtrl+Shift+N'),
    commandItem(labels.importPdf, 'import-pdf', options, 'CmdOrCtrl+Alt+N'),
    { type: 'separator' },
    commandItem(labels.syncWeRead, 'sync-weread', options),
    { type: 'separator' },
    commandItem(labels.backupDatabase, 'backup-database', options),
    commandItem(labels.restoreDatabase, 'restore-database', options),
    { type: 'separator' },
  ];

  if (options.platform === 'darwin') {
    submenu.push({ role: 'close' });
  } else {
    submenu.push({ role: 'quit', label: labels.exit });
  }

  return { label: labels.file, submenu };
}

function buildEditMenu(labels: AppMenuLabels): MenuItemConstructorOptions {
  return {
    label: labels.edit,
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
      { type: 'separator' },
      { role: 'startSpeaking' },
      { role: 'stopSpeaking' },
    ],
  };
}

function buildViewMenu(options: AppMenuOptions, labels: AppMenuLabels): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [];

  if (!options.isPackaged) {
    submenu.push(
      { role: 'reload', label: labels.reload },
      { role: 'forceReload', label: labels.forceReload },
      { role: 'toggleDevTools', label: labels.toggleDevTools },
      { type: 'separator' },
    );
  }

  submenu.push(
    {
      label: labels.zoom,
      submenu: [
        { role: 'resetZoom', label: labels.resetZoom },
        { role: 'zoomIn', label: labels.zoomIn },
        { role: 'zoomOut', label: labels.zoomOut },
      ],
    },
    { type: 'separator' },
    { role: 'togglefullscreen', label: labels.toggleFullscreen },
  );

  return { label: labels.view, submenu };
}

function buildWindowMenu(labels: AppMenuLabels): MenuItemConstructorOptions {
  return {
    label: labels.window,
    submenu: [
      { role: 'minimize' },
      { role: 'zoom', label: labels.windowZoom },
      { type: 'separator' },
      { role: 'front' },
    ],
  };
}

function buildHelpMenu(options: AppMenuOptions, labels: AppMenuLabels): MenuItemConstructorOptions {
  return {
    label: labels.help,
    submenu: [
      commandItem(labels.helpDocs, 'open-help-docs', options),
      commandItem(labels.releaseNotes, 'open-release-notes', options),
      commandItem(labels.reportIssue, 'report-issue', options),
      { type: 'separator' },
      commandItem(labels.checkUpdates, 'check-updates', options),
    ],
  };
}

function commandItem(
  label: string,
  command: AppMenuCommand,
  options: AppMenuOptions,
  accelerator?: string,
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: () => options.onCommand(command),
  };
}

function appMenuLabels(locale: string) {
  if (locale.toLowerCase().startsWith('zh')) {
    return {
      about: '关于 Yomitomo',
      backupDatabase: '备份数据库...',
      checkUpdates: '检查更新...',
      edit: '编辑',
      exit: '退出',
      file: '文件',
      forceReload: '强制重新载入',
      help: '帮助',
      helpDocs: '帮助文档',
      importEbook: '导入电子书...',
      importPdf: '导入 PDF...',
      importWeb: '导入网页文章...',
      releaseNotes: '更新日志',
      reload: '重新载入',
      reportIssue: '反馈问题',
      resetZoom: '实际大小',
      restoreDatabase: '恢复数据库...',
      settings: '设置...',
      syncWeRead: '同步微信读书',
      toggleDevTools: '切换开发者工具',
      toggleFullscreen: '进入/退出全屏',
      view: '显示',
      window: '窗口',
      windowZoom: '缩放',
      zoom: '缩放',
      zoomIn: '放大',
      zoomOut: '缩小',
    };
  }

  return {
    about: 'About Yomitomo',
    backupDatabase: 'Back Up Database...',
    checkUpdates: 'Check for Updates...',
    edit: 'Edit',
    exit: 'Exit',
    file: 'File',
    forceReload: 'Force Reload',
    help: 'Help',
    helpDocs: 'Yomitomo Help',
    importEbook: 'Import Ebook...',
    importPdf: 'Import PDF...',
    importWeb: 'New Web Article...',
    releaseNotes: 'Release Notes',
    reload: 'Reload',
    reportIssue: 'Report Issue',
    resetZoom: 'Actual Size',
    restoreDatabase: 'Restore Database...',
    settings: 'Settings...',
    syncWeRead: 'Sync WeRead',
    toggleDevTools: 'Toggle Developer Tools',
    toggleFullscreen: 'Enter / Exit Full Screen',
    view: 'View',
    window: 'Window',
    windowZoom: 'Zoom',
    zoom: 'Zoom',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
  };
}
