// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../settings/app-settings-profile-dialog');
});

async function loadPreloadModule() {
  return import('../shell/app-secondary-module-preload');
}

describe('app-secondary-module-preload', () => {
  it('transitions a preload entry from not-started through scheduled, loading, and ready', async () => {
    const { preloadEntries } = await loadPreloadModule();
    const entry = preloadEntries.agents;

    expect(entry.status).toBe('not-started');

    entry.markScheduled();
    expect(entry.status).toBe('scheduled');

    const pending = entry.load();
    expect(entry.status).toBe('loading');

    await pending;
    expect(entry.status).toBe('ready');
    expect(entry.module).toBeDefined();
  });

  it('ignores markScheduled once an entry is ready and reuses the resolved module', async () => {
    const { preloadEntries } = await loadPreloadModule();
    const entry = preloadEntries.stats;

    const first = await entry.load();
    entry.markScheduled();
    expect(entry.status).toBe('ready');

    const second = await entry.load();
    expect(second).toBe(first);
  });

  it('transitions to failed on import rejection and can retry to ready afterwards', async () => {
    vi.doMock('../settings/app-settings-profile-dialog', () => Promise.reject(new Error('boom')));
    const { preloadEntries } = await loadPreloadModule();
    const entry = preloadEntries.profileDialog;

    await expect(entry.load()).rejects.toThrow();
    expect(entry.status).toBe('failed');
    expect(entry.module).toBeUndefined();

    vi.doUnmock('../settings/app-settings-profile-dialog');
    await entry.load();
    expect(entry.status).toBe('ready');
  });

  it('notifies subscribers on every status change and stops after unsubscribing', async () => {
    const { preloadEntries, subscribePreloadModules } = await loadPreloadModule();
    const listener = vi.fn();
    const unsubscribe = subscribePreloadModules(listener);

    preloadEntries.agents.markScheduled();
    expect(listener).toHaveBeenCalledTimes(1);

    await preloadEntries.agents.load();
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    await preloadEntries.stats.load();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
