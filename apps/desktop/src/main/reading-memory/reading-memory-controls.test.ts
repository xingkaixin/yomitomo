import { readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReadingMemoryControls } from './reading-memory-controls';
import {
  createReadingMemoryModelLifecycle,
  type ReadingMemoryModelLifecycle,
  type ReadingMemoryModelLifecycleState,
} from './reading-memory-model-lifecycle';
import {
  parseReadingMemoryModelManifest,
  readingMemoryModelRelease,
} from './reading-memory-model-manifest';
import type { ReadingMemorySemanticIndex } from './reading-memory-semantic-index';

const manifest = parseReadingMemoryModelManifest(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../download/model-releases/reading-memory-embedding-v1/manifest.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);
const modelBase = {
  internalId: manifest.internalId,
  downloadSizeBytes: manifest.distributionDownloadSizeBytes,
};
const installation: ReadingMemoryModelLifecycleState = {
  ...modelBase,
  status: 'available',
  directory: '/different/internal/directory',
  manifest,
};
const notInstalled: ReadingMemoryModelLifecycleState = {
  ...modelBase,
  status: 'not-installed',
  resumeBytes: 0,
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('reading memory controls', () => {
  it.each<{
    state: ReadingMemoryModelLifecycleState;
    downloadedBytes: number;
    failure: string | null;
  }>([
    { state: { ...modelBase, status: 'checking' }, downloadedBytes: 0, failure: null },
    {
      state: { ...notInstalled, resumeBytes: 24 },
      downloadedBytes: 24,
      failure: null,
    },
    {
      state: { ...modelBase, status: 'downloading', downloadedBytes: 128 },
      downloadedBytes: 128,
      failure: null,
    },
    { state: installation, downloadedBytes: 0, failure: null },
    {
      state: { ...modelBase, status: 'failed', failure: 'network', resumeBytes: 64 },
      downloadedBytes: 64,
      failure: 'network',
    },
  ])('projects the $state.status model without exposing its manifest', async (testCase) => {
    const fixture = createFixture();
    fixture.setState(testCase.state);

    expect(await fixture.controls.status()).toEqual({
      model: {
        ...modelBase,
        status: testCase.state.status,
        downloadedBytes: testCase.downloadedBytes,
        directory: join(fixture.userDataPath, 'models', manifest.internalId),
        sourceUrl: readingMemoryModelRelease.manifestUrl,
        failure: testCase.failure,
      },
      ...(await fixture.index.getStatus()),
    });
    expect(fixture.lifecycle.reconcile).not.toHaveBeenCalled();
    expect(fixture.lifecycle.download).not.toHaveBeenCalled();
  });

  it('coalesces repeated downloads and reconciles only after installation finishes', async () => {
    const fixture = createFixture();
    const downloaded = deferred();
    fixture.lifecycle.download.mockImplementation(async () => {
      fixture.setState({ ...modelBase, status: 'downloading', downloadedBytes: 128 });
      await downloaded.promise;
      fixture.setState(installation);
      return installation;
    });

    const first = fixture.controls.download();
    expect(fixture.controls.download()).toBe(first);
    await nextTurn();
    expect((await fixture.controls.status()).model).toMatchObject({
      status: 'downloading',
      downloadedBytes: 128,
    });
    expect(fixture.index.reconcile).not.toHaveBeenCalled();

    downloaded.resolve();
    expect((await first).model.status).toBe('available');
    expect(fixture.lifecycle.download).toHaveBeenCalledTimes(1);
    expect(fixture.index.reconcile).toHaveBeenCalledExactlyOnceWith('model-downloaded');
  });

  it('keeps status responsive while cancellation waits for the actual download exit', async () => {
    const fixture = createFixture();
    const exited = deferred();
    const partial: ReadingMemoryModelLifecycleState = { ...notInstalled, resumeBytes: 128 };
    fixture.lifecycle.download.mockImplementation(async () => {
      fixture.setState({ ...modelBase, status: 'downloading', downloadedBytes: 128 });
      await exited.promise;
      fixture.setState(partial);
      return partial;
    });
    fixture.lifecycle.cancelDownload.mockImplementation(async () => {
      await exited.promise;
      return partial;
    });
    const download = fixture.controls.download();
    await nextTurn();
    let canceled = false;
    const cancellation = fixture.controls.cancel().then((snapshot) => {
      canceled = true;
      return snapshot;
    });

    expect((await fixture.controls.status()).model.status).toBe('downloading');
    expect(fixture.lifecycle.cancelDownload).toHaveBeenCalledTimes(1);
    expect(canceled).toBe(false);

    exited.resolve();
    expect((await cancellation).model).toMatchObject({
      status: 'not-installed',
      downloadedBytes: 128,
    });
    await download;
    expect(fixture.index.reconcile).not.toHaveBeenCalled();
  });

  it('cancels a queued download before it can begin', async () => {
    const fixture = createFixture();
    const download = fixture.controls.download();
    await fixture.controls.cancel();
    await download;
    expect(fixture.lifecycle.download).not.toHaveBeenCalled();
    expect(fixture.index.reconcile).not.toHaveBeenCalled();
  });

  it('cancels an active download before deleting and never reconciles the canceled result', async () => {
    const fixture = createFixture();
    const exited = deferred();
    fixture.lifecycle.download.mockImplementation(async () => {
      await exited.promise;
      return installation;
    });
    fixture.lifecycle.cancelDownload.mockImplementation(async () => {
      exited.resolve();
      return notInstalled;
    });
    const download = fixture.controls.download();
    await nextTurn();

    await fixture.controls.remove();
    await download;
    expect(fixture.lifecycle.cancelDownload).toHaveBeenCalledTimes(1);
    expect(fixture.lifecycle.remove).toHaveBeenCalledTimes(1);
    expect(fixture.index.reconcile).not.toHaveBeenCalled();
  });

  it('serializes repeated removals and a later download through worker suspension', async () => {
    const fixture = createFixture();
    const released = deferred();
    const events: string[] = [];
    fixture.index.suspend.mockImplementation(async () => {
      events.push('suspend');
      await released.promise;
    });
    fixture.lifecycle.remove.mockImplementation(async () => {
      events.push('remove');
      fixture.setState(notInstalled);
      return notInstalled;
    });
    fixture.index.resume.mockImplementation(async () => {
      events.push('resume');
    });
    fixture.lifecycle.download.mockImplementation(async () => {
      events.push('download');
      fixture.setState(installation);
      return installation;
    });

    const first = fixture.controls.remove();
    const second = fixture.controls.remove();
    const download = fixture.controls.download();
    await nextTurn();
    expect(events).toEqual(['suspend']);
    expect(fixture.lifecycle.remove).not.toHaveBeenCalled();
    expect(fixture.lifecycle.download).not.toHaveBeenCalled();

    released.resolve();
    await Promise.all([first, second, download]);
    expect(events).toEqual([
      'suspend',
      'remove',
      'resume',
      'suspend',
      'remove',
      'resume',
      'download',
    ]);
    expect((await fixture.controls.status()).model.status).toBe('available');
  });

  it('honors a new download requested after deleting an in-flight download', async () => {
    const fixture = createFixture();
    const exited = deferred();
    const events: string[] = [];
    fixture.lifecycle.download
      .mockImplementationOnce(async () => {
        events.push('download-start');
        await exited.promise;
        events.push('download-exit');
        return notInstalled;
      })
      .mockImplementationOnce(async () => {
        events.push('download-again');
        fixture.setState(installation);
        return installation;
      });
    fixture.lifecycle.cancelDownload.mockImplementation(async () => {
      events.push('cancel');
      exited.resolve();
      return notInstalled;
    });
    fixture.lifecycle.remove.mockImplementation(async () => {
      events.push('remove');
      fixture.setState(notInstalled);
      return notInstalled;
    });
    const first = fixture.controls.download();
    await nextTurn();
    const removal = fixture.controls.remove();
    const second = fixture.controls.download();

    await Promise.all([first, removal, second]);
    expect(events).toEqual([
      'download-start',
      'cancel',
      'download-exit',
      'remove',
      'download-again',
    ]);
    expect((await fixture.controls.status()).model.status).toBe('available');
  });

  it('resumes after a failed removal and accepts subsequent index commands', async () => {
    const fixture = createFixture();
    fixture.lifecycle.remove.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(fixture.controls.remove()).rejects.toThrow('storage unavailable');
    expect(fixture.index.resume).toHaveBeenCalledTimes(1);
    await fixture.controls.rebuild();
    expect(fixture.index.rebuild).toHaveBeenCalledTimes(1);
  });

  it('returns index command results without deleting or downloading a model', async () => {
    const fixture = createFixture();

    expect((await fixture.controls.pause()).semantic.indexingPaused).toBe(true);
    expect((await fixture.controls.resume()).semantic.indexingPaused).toBe(false);
    await fixture.controls.rebuild();
    expect(fixture.index.pauseIndexing).toHaveBeenCalledTimes(1);
    expect(fixture.index.resumeIndexing).toHaveBeenCalledTimes(1);
    expect(fixture.index.rebuild).toHaveBeenCalledTimes(1);
    expect(fixture.lifecycle.remove).not.toHaveBeenCalled();
    expect(fixture.lifecycle.download).not.toHaveBeenCalled();
  });

  it('wakes projection after a successful rebuild and resets only restored databases on reconcile', async () => {
    const onProjectionRebuild = vi.fn();
    const fixture = createFixture(onProjectionRebuild);
    const reset = deferred();
    fixture.index.rebuild.mockImplementationOnce(() => reset.promise);

    const rebuilding = fixture.controls.rebuild();
    await nextTurn();
    expect(onProjectionRebuild).not.toHaveBeenCalled();
    reset.resolve();
    await rebuilding;
    expect(onProjectionRebuild).toHaveBeenCalledTimes(1);

    await fixture.controls.reconcile('startup');
    expect(fixture.index.rebuild).toHaveBeenCalledTimes(1);
    await fixture.controls.reconcile('database-restored');
    expect(fixture.index.rebuild).toHaveBeenCalledTimes(2);
    expect(onProjectionRebuild).toHaveBeenCalledTimes(2);
    expect(fixture.index.reconcile).toHaveBeenLastCalledWith('database-restored');
  });

  it('does not wake projection after a failed reset and allows a later retry', async () => {
    const onProjectionRebuild = vi.fn();
    const fixture = createFixture(onProjectionRebuild);
    fixture.index.rebuild.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(fixture.controls.rebuild()).rejects.toThrow('storage unavailable');
    expect(onProjectionRebuild).not.toHaveBeenCalled();
    await fixture.controls.rebuild();
    expect(onProjectionRebuild).toHaveBeenCalledTimes(1);
  });

  it('keeps a later pause effective when resume was requested in the same turn', async () => {
    const fixture = createFixture();
    const resumed = fixture.controls.resume();
    const paused = fixture.controls.pause();
    await Promise.all([resumed, paused]);
    const snapshot = await fixture.controls.status();
    expect(snapshot.semantic.indexingPaused).toBe(true);
  });

  it('cancels downloads and waits for native exit on disposal, rejecting new controls', async () => {
    const fixture = createFixture();
    const downloadExited = deferred();
    const workerExited = deferred();
    fixture.lifecycle.download.mockImplementation(async () => {
      await downloadExited.promise;
      return notInstalled;
    });
    fixture.lifecycle.cancelDownload.mockImplementation(async () => {
      await downloadExited.promise;
      return notInstalled;
    });
    fixture.index.dispose.mockImplementation(() => workerExited.promise);
    const download = fixture.controls.download();
    await nextTurn();
    let disposed = false;
    const disposal = fixture.controls.dispose();
    void disposal.then(() => {
      disposed = true;
    });
    expect(fixture.controls.dispose()).toBe(disposal);
    try {
      for (const command of [
        'download',
        'remove',
        'pause',
        'resume',
        'rebuild',
        'cancel',
      ] as const) {
        await expect(fixture.controls[command]()).rejects.toThrow(
          'Reading memory controls are stopped',
        );
      }
      expect(fixture.lifecycle.cancelDownload).toHaveBeenCalledTimes(1);
      expect(fixture.index.dispose).not.toHaveBeenCalled();
      downloadExited.resolve();
      await nextTurn();
      expect(fixture.index.dispose).toHaveBeenCalledOnce();
      expect(disposed).toBe(false);
      workerExited.resolve();
      await Promise.all([download, disposal]);
      expect(disposed).toBe(true);
      expect(fixture.index.pauseIndexing).not.toHaveBeenCalled();
      expect(fixture.index.reconcile).not.toHaveBeenCalled();
    } finally {
      downloadExited.resolve();
      workerExited.resolve();
      await Promise.all([download, disposal]);
    }
  });

  it('does not reopen controls when disposal starts during update recovery', async () => {
    const fixture = createFixture();
    const recovered = deferred();
    fixture.index.resume.mockImplementation(() => recovered.promise);
    await fixture.controls.suspendForAppUpdate();
    await expect(fixture.controls.rebuild()).rejects.toThrow('Reading memory controls are stopped');
    const recovery = fixture.controls.resumeAfterAppUpdateFailure();
    await nextTurn();
    const disposal = fixture.controls.dispose();
    recovered.resolve();
    await Promise.all([recovery, disposal]);
    await expect(fixture.controls.pause()).rejects.toThrow('Reading memory controls are stopped');
    expect(fixture.index.pauseIndexing).not.toHaveBeenCalled();
  });

  it('waits for worker release and deletes only the model files, preserving reading assets', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'yomitomo-memory-controls-test-'));
    temporaryDirectories.push(userDataPath);
    const modelDirectory = join(userDataPath, 'models', manifest.internalId);
    const partialDirectory = join(userDataPath, 'models', `.${manifest.internalId}.partial`);
    await mkdir(modelDirectory, { recursive: true });
    await mkdir(partialDirectory, { recursive: true });
    await writeFile(join(modelDirectory, 'model.onnx'), 'installed model');
    await writeFile(join(partialDirectory, 'model.onnx'), 'partial model');
    const assets = ['yomitomo.sqlite', 'article.html', 'book.epub', 'document.pdf'];
    await Promise.all(
      assets.map((asset) => writeFile(join(userDataPath, asset), `original ${asset}`)),
    );
    const fixture = createFixture();
    const released = deferred();
    fixture.index.suspend.mockImplementation(() => released.promise);
    const lifecycle = createReadingMemoryModelLifecycle({ userDataPath });
    const controls = createReadingMemoryControls({
      modelLifecycle: lifecycle,
      semanticIndex: fixture.index,
      userDataPath,
    });

    const removal = controls.remove();
    await nextTurn();
    expect(fixture.index.suspend).toHaveBeenCalledTimes(1);
    expect(await readFile(join(modelDirectory, 'model.onnx'), 'utf8')).toBe('installed model');
    expect(fixture.index.resume).not.toHaveBeenCalled();

    released.resolve();
    expect((await removal).model.status).toBe('not-installed');
    await expect(access(modelDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(partialDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    for (const asset of assets) {
      expect(await readFile(join(userDataPath, asset), 'utf8')).toBe(`original ${asset}`);
    }
    expect(fixture.index.resume).toHaveBeenCalledTimes(1);
    expect(fixture.index.rebuild).not.toHaveBeenCalled();
    lifecycle.dispose();
  });
});

function createFixture(onProjectionRebuild?: () => void) {
  let state = notInstalled;
  let indexingPaused = false;
  const lifecycle = {
    getState: vi.fn(() => state),
    reconcile: vi.fn(async () => state),
    download: vi.fn(async () => {
      state = installation;
      return state;
    }),
    cancelDownload: vi.fn(async () => state),
    remove: vi.fn(async () => {
      state = notInstalled;
      return state;
    }),
    dispose: vi.fn(),
  } satisfies ReadingMemoryModelLifecycle;
  const index = {
    getStatus: vi.fn<ReadingMemorySemanticIndex['getStatus']>(async () => ({
      projection: {
        state: 'available',
        coverage: { projectedAssetCount: 3, eligibleAssetCount: 3 },
      },
      semantic: {
        state: state.status === 'not-installed' ? 'not_installed' : state.status,
        modelVersion: state.internalId,
        queryModelVersion: state.status === 'available' ? state.internalId : null,
        coverage: { indexedEntryCount: 0, eligibleEntryCount: 3 },
        indexingPaused,
      },
    })),
    reconcile: vi.fn(async () => {}),
    search: vi.fn(),
    pauseIndexing: vi.fn(async () => {
      indexingPaused = true;
    }),
    resumeIndexing: vi.fn(() => {
      indexingPaused = false;
    }),
    rebuild: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  } satisfies ReadingMemorySemanticIndex;
  const userDataPath = '/tmp/yomitomo-memory-controls-test';
  return {
    lifecycle,
    index,
    userDataPath,
    setState: (next: ReadingMemoryModelLifecycleState) => {
      state = next;
    },
    controls: createReadingMemoryControls({
      modelLifecycle: lifecycle,
      semanticIndex: index,
      userDataPath,
      onProjectionRebuild,
    }),
  };
}

function deferred() {
  let resolve: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve: () => resolve() };
}
