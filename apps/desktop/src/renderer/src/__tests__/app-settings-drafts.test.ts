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

  it('preserves newer general edits after an autosave override completes', async () => {
    const pending = deferred<DesktopStore>();
    stubDesktop({ store: { saveSettings: () => pending.promise } });
    const { drafts, store } = startDrafts();
    const submitted = { ...emptyStore.settings, saveArticleImages: true };
    drafts().general.update(submitted);
    const request = drafts().general.save(submitted);
    drafts().general.update({ ...submitted, saveArticleImages: false });

    pending.resolve({ ...emptyStore, settings: submitted });
    await request;

    expect(store().settings.saveArticleImages).toBe(true);
    expect(drafts().general.value.saveArticleImages).toBe(false);
    expect(drafts().general).toMatchObject({ canSave: true, saveState: 'idle' });
  });

  it('does not replace a profile restored while saving', async () => {
    const pending = deferred<UserStorePatch>();
    stubDesktop({ store: { saveUser: () => pending.promise } });
    const { drafts, sync } = startDrafts();
    const request = drafts().profile.save({ ...emptyStore.user, nickname: 'A' });
    const restored = { ...emptyStore.user, nickname: 'restored' };
    sync({ ...emptyStore, user: restored });

    pending.resolve({ user: { ...emptyStore.user, nickname: 'A' } });
    await request;

    expect(drafts().profile.value).toEqual(restored);
    expect(drafts().profile.saveState).toBe('idle');
  });

  it('keeps the selected provider when another provider finishes saving', async () => {
    const first = makeProvider('first');
    const second = makeProvider('second');
    const pending = deferred<DesktopStore>();
    stubDesktop({ provider: { save: () => pending.promise } });
    const { drafts, store } = startDrafts({ ...emptyStore, providers: [first, second] });
    const edited = { ...first, name: 'edited' };
    drafts().provider.update(edited);
    const request = drafts().provider.save();
    drafts().provider.select(second);

    pending.resolve({ ...emptyStore, providers: [edited, second] });

    await expect(request).resolves.toBeUndefined();
    expect(store().providers[0]).toEqual(edited);
    expect(drafts().provider).toMatchObject({
      saveState: 'idle',
      selectedProviderId: second.id,
      value: second,
    });
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

  it('selects the first provider once providers load and clears the editor when they are gone', () => {
    const first = makeProvider('first');
    const { drafts, sync } = startDrafts();
    expect(drafts().provider.selectedProviderId).toBeNull();

    sync({ ...emptyStore, providers: [first] });
    expect(drafts().provider).toMatchObject({ selectedProviderId: first.id, value: first });

    sync({ ...emptyStore, providers: [] });
    expect(drafts().provider).toMatchObject({ canSave: false, selectedProviderId: null });
  });

  it('keeps a new provider form when a store update still has no providers', () => {
    const { drafts, sync } = startDrafts();
    drafts().provider.create();
    drafts().provider.update({ ...drafts().provider.value, name: 'typing' });

    sync({ ...emptyStore, providers: [] });

    expect(drafts().provider.value.name).toBe('typing');
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

  it('saves only the general section and preserves unsaved shortcut edits', async () => {
    const saveSettings = vi.fn().mockResolvedValue(emptyStore);
    stubDesktop({ store: { saveSettings } });
    const { drafts } = startDrafts();
    drafts().general.update({
      ...drafts().general.value,
      saveArticleImages: !emptyStore.settings.saveArticleImages,
      selectionActionShortcuts: { copy: 'Mod+K', annotate: 'Mod+K', ask: 'Mod+L' },
    });

    await drafts().general.save();

    expect(saveSettings).toHaveBeenCalledOnce();
    const payload = saveSettings.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ saveArticleImages: true });
    expect(payload).not.toHaveProperty('selectionActionShortcuts');
    expect(payload).not.toHaveProperty('readingAssistantProviderId');
    expect(drafts().shortcuts.value.selectionActionShortcuts).toEqual({
      copy: 'Mod+K',
      annotate: 'Mod+K',
      ask: 'Mod+L',
    });
  });

  it('detects telemetryEnabled-only general settings changes', () => {
    const { drafts } = startDrafts();

    drafts().general.update({ ...emptyStore.settings, telemetryEnabled: false });

    expect(drafts().general.canSave).toBe(true);
  });

  it('does not reset edited settings drafts for store updates outside draft sync', () => {
    const { desktopStore, drafts, sync } = startDrafts(
      makeStore({ settings: { saveArticleImages: false } }),
    );
    drafts().general.update({ ...drafts().general.value, saveArticleImages: true });

    desktopStore.getState().applyStore(makeStore({ settings: { saveArticleImages: false } }));
    expect(drafts().general.value.saveArticleImages).toBe(true);

    sync(makeStore({ settings: { saveArticleImages: false } }));
    expect(drafts().general.value.saveArticleImages).toBe(false);
  });
});

function startDrafts(initialStore: DesktopStore = emptyStore) {
  const desktopStore = createDesktopStore();
  const draftStore = createSettingsDraftStore(desktopStore);
  onTestFinished(bindSettingsDraftEvents(desktopStore, draftStore));
  desktopStore.getState().receiveStore(initialStore);
  return {
    desktopStore,
    drafts: () => settingsDraftsView(draftStore.getState()),
    store: () => desktopStore.getState().store!,
    sync: (store: DesktopStore) => desktopStore.getState().receiveStore(store),
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
