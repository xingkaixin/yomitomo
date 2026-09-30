import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { app } from 'electron';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';

type SparkleEvent = {
  type: string;
  version?: string;
  releaseName?: string;
  releaseDate?: number;
  error?: string;
  total?: number;
  transferred?: number;
  percent?: number;
  bytesPerSecond?: number;
};

type SparkleNative = {
  initialize: (onEvent: (json: string) => void) => void;
  check: () => void;
  download: () => void;
  install: () => void;
};

type SparkleEvents = {
  'checking-for-update': [];
  'update-available': [UpdateInfo];
  'update-not-available': [UpdateInfo];
  'download-progress': [ProgressInfo];
  'update-downloaded': [UpdateInfo];
  error: [Error];
};

export class SparkleUpdater extends EventEmitter<SparkleEvents> {
  private pending?: {
    kind: 'check' | 'download';
    resolve: () => void;
    reject: (error: Error) => void;
  };

  constructor(private readonly native: SparkleNative) {
    super();
    native.initialize((json) => this.handleEvent(JSON.parse(json) as SparkleEvent));
  }

  checkForUpdates() {
    return this.run('check');
  }

  downloadUpdate() {
    return this.run('download');
  }

  quitAndInstall(_isSilent?: boolean, _isForceRunAfter?: boolean) {
    this.native.install();
  }

  private run(kind: 'check' | 'download') {
    if (this.pending)
      return Promise.reject(new Error('A Sparkle operation is already in progress'));
    return new Promise<void>((resolve, reject) => {
      this.pending = { kind, resolve, reject };
      try {
        this.native[kind]();
      } catch (error) {
        this.pending = undefined;
        reject(error);
      }
    });
  }

  private handleEvent(event: SparkleEvent) {
    const info: UpdateInfo = {
      version: event.version || app.getVersion(),
      files: [],
      path: '',
      sha512: '',
      releaseName: event.releaseName,
      releaseDate: event.releaseDate ? new Date(event.releaseDate).toISOString() : '',
    };
    switch (event.type) {
      case 'checking-for-update':
        this.emit('checking-for-update');
        break;
      case 'update-available':
        if (this.pending?.kind === 'check') this.emit('update-available', info);
        break;
      case 'update-not-available':
        if (this.pending?.kind === 'check') this.emit('update-not-available', info);
        break;
      case 'check-complete':
        this.finish(event.error ? new Error(event.error) : undefined);
        break;
      case 'download-progress':
        this.emit('download-progress', {
          total: event.total || 0,
          transferred: event.transferred || 0,
          percent: event.percent || 0,
          bytesPerSecond: event.bytesPerSecond || 0,
          delta: 0,
        });
        break;
      case 'update-downloaded':
        this.emit('update-downloaded', info);
        this.finish();
        break;
      case 'error': {
        const error = new Error(event.error || 'Sparkle update failed');
        this.finish(error);
        this.emit('error', error);
        break;
      }
    }
  }

  private finish(error?: Error) {
    const pending = this.pending;
    this.pending = undefined;
    if (error) pending?.reject(error);
    else pending?.resolve();
  }
}

export function packagedSparkleUpdater() {
  if (process.platform !== 'darwin' || !app.isPackaged || !process.resourcesPath) return null;
  const addon = join(process.resourcesPath, 'sparkle.node');
  if (!existsSync(addon)) return null;
  const require = createRequire(import.meta.url);
  return new SparkleUpdater(require(addon) as SparkleNative);
}
