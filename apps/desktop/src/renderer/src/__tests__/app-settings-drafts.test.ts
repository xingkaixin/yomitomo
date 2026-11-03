// @vitest-environment jsdom

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { AppSettingsPatch, DesktopStore, LlmProvider } from '@yomitomo/shared';
import type { UserStorePatch } from '../../../ipc-contract';

import { emptyStore } from '../settings/app-settings';
import { createSettingsDraftStore, settingsDraftsView } from '../settings/app-settings-drafts';
import { bindSettingsDraftEvents } from '../shell/app-desktop-event-bindings';
import { createDesktopStore } from '../shell/app-desktop-store';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

afterEach(() => {
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
});

describe('settings draft store', () => {
  it('updates the saved profile without overwriting edits made during the save', async () => {
    const pending = deferred<UserStorePatch>();
    stubDesktop({ store: { saveUser: () => pending.promise } });
    const { drafts, store } = startDrafts();
    drafts().profile.update({ ...emptyStore.user, nickname: 'A' });
    const request = drafts().profile.save();
    drafts().profile.update({ ...emptyStore.user, nickname: 'B' });

    pending.resolve({ user: { ...emptyStore.user, nickname: 'A' } });

    await expect(request).resolves.toBeUndefined();
    expect(drafts().profile.value.nickname).toBe('B');
    expect(store().user.nickname).toBe('A');
    expect(drafts().profile).toMatchObject({ canSave: true, saveState: 'idle' });
  });

  it('blocks duplicate creation while retaining the provider identity and newer input', async () => {
    const pending = deferred<DesktopStore>();
    const created = makeProvider('created');
    const save = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ ...emptyStore, providers: [{ ...created, name: 'newer input' }] });
    stubDesktop({ provider: { save } });
    const { drafts } = startDrafts();
    drafts().provider.create();
    const request = drafts().provider.save();
    drafts().provider.update({ ...drafts().provider.value, name: 'newer input' });
    const canSaveWhilePending = drafts().provider.canSave;
    await drafts().provider.save();
    const pendingRequestIds = save.mock.calls.map(([draft]) => draft.id ?? null);

    pending.resolve({ ...emptyStore, providers: [created] });
    await request;

    expect(canSaveWhilePending).toBe(false);
    expect(pendingRequestIds).toEqual([null]);
    expect(drafts().provider.value).toMatchObject({ id: created.id, name: 'newer input' });
    expect(drafts().provider.canSave).toBe(true);
    await drafts().provider.save();
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: created.id, name: 'newer input' }),
    );
    expect(drafts().provider).toMatchObject({ canSave: false, saveState: 'saved' });
  });

  it('persists the default model with route settings and preserves task overrides', async () => {
    const initial = makeStore({ settings: { reviewAssistantProviderId: 'review-provider' } });
    const saveSettings = vi.fn(async (patch: AppSettingsPatch) => ({
      ...initial,
      settings: normalizeAppSettings({ ...initial.settings, ...patch }),
    }));
    stubDesktop({ store: { saveSettings } });
    const { drafts, store } = startDrafts(initial);
    drafts().routes.update({ ...drafts().routes.value, defaultProviderId: 'default-provider' });
    expect(drafts().routes.canSave).toBe(true);

    await drafts().routes.save();

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultProviderId: 'default-provider',
        reviewAssistantProviderId: 'review-provider',
      }),
    );
    expect(store().settings.defaultProviderId).toBe('default-provider');
    expect(drafts().routes.canSave).toBe(false);
  });

  it('detects telemetryEnabled-only general settings changes', () => {
    const { drafts } = startDrafts();

    drafts().general.update({ ...emptyStore.settings, telemetryEnabled: false });

    expect(drafts().general.canSave).toBe(true);
  });
});

function startDrafts(initialStore: DesktopStore = emptyStore) {
  const desktopStore = createDesktopStore();
  const draftStore = createSettingsDraftStore(desktopStore);
  onTestFinished(bindSettingsDraftEvents(desktopStore, draftStore));
  desktopStore.getState().receiveStore(initialStore);
  return {
    drafts: () => settingsDraftsView(draftStore.getState()),
    store: () => desktopStore.getState().store!,
  };
}

function stubDesktop(value: object) {
  Object.defineProperty(window, 'yomitomoDesktop', { configurable: true, value });
}

function makeStore(
  input: { settings?: AppSettingsPatch; user?: DesktopStore['user'] } = {},
): DesktopStore {
  return {
    ...emptyStore,
    user: input.user || emptyStore.user,
    settings: normalizeAppSettings(input.settings),
  };
}

function makeProvider(id: string): LlmProvider {
  return {
    id,
    name: id,
    type: 'openai-chat',
    baseUrl: 'https://example.com',
    apiKey: '',
    modelName: 'test',
    createdAt: emptyStore.user.updatedAt,
    updatedAt: emptyStore.user.updatedAt,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
