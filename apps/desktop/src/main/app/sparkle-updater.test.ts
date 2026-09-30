import { describe, expect, it, vi } from 'vitest';
import { SparkleUpdater } from './sparkle-updater';

vi.mock('electron', () => ({ app: { getVersion: () => '1.0.0' } }));

function fixture() {
  let send: (json: string) => void;
  const native = {
    initialize: (callback: (json: string) => void) => {
      send = callback;
    },
    check: vi.fn(),
    download: vi.fn(),
    install: vi.fn(),
  };
  const updater = new SparkleUpdater(native);
  return { updater, native, emit: (event: object) => send(JSON.stringify(event)) };
}

describe('Sparkle updater', () => {
  it('checks without downloading and waits for verified readiness before completing a download', async () => {
    const { updater, native, emit } = fixture();
    const available = vi.fn();
    const downloaded = vi.fn();
    updater.on('update-available', available);
    updater.on('update-downloaded', downloaded);
    const check = updater.checkForUpdates();
    emit({ type: 'update-available', version: '1.0.1' });
    expect(available).toHaveBeenCalledOnce();
    expect(native.download).not.toHaveBeenCalled();
    emit({ type: 'check-complete' });
    await check;
    const completed = vi.fn();
    const download = updater.downloadUpdate().then(completed);
    emit({ type: 'update-available', version: '1.0.1' });
    emit({ type: 'download-progress', percent: 100, total: 100, transferred: 100 });
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    expect(available).toHaveBeenCalledOnce();
    emit({ type: 'update-downloaded', version: '1.0.1' });
    await download;
    expect(downloaded).toHaveBeenCalledWith(expect.objectContaining({ version: '1.0.1' }));
    updater.quitAndInstall();
    expect(native.install).toHaveBeenCalledOnce();
  });

  it('rejects failed downloads and permits retrying', async () => {
    const { updater, emit } = fixture();
    updater.on('error', vi.fn());
    const download = updater.downloadUpdate();
    const rejected = expect(download).rejects.toThrow('Signature invalid');
    emit({ type: 'error', error: 'Signature invalid' });
    await rejected;
    const retry = updater.downloadUpdate();
    emit({ type: 'update-downloaded', version: '1.0.1' });
    await retry;
  });
});
