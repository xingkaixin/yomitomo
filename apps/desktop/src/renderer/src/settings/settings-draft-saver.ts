import type { SaveState } from '../shell/app-types';

export type SaveStatusState = { saveError: string; saveState: SaveState };

export const idleSaveStatus: SaveStatusState = { saveError: '', saveState: 'idle' };

export type SaveableDraft<TValue, TResult = unknown> = {
  canSave: boolean;
  reset: (value: TValue) => void;
  save: (override?: TValue) => Promise<TResult | undefined>;
  saveError: string;
  saveState: SaveState;
  update: (value: TValue) => void;
  value: TValue;
};

type DraftSaverOptions<TValue, TResult> = {
  errorMessage: (error: unknown) => string;
  getValue: () => TValue;
  hasChanges: () => boolean;
  onSaved?: (result: TResult, value: TValue) => boolean | void;
  persist: (value: TValue) => Promise<TResult>;
  resetDelayMs?: number;
  setStatus: (status: SaveStatusState) => void;
  setValue: (value: TValue) => void;
};

export type DraftSaver<TValue, TResult> = {
  canSave: () => boolean;
  save: (override?: TValue) => Promise<TResult | undefined>;
  update: (value: TValue) => void;
};

/**
 * Saves one editable draft outside React. Pending saves and the last failed value are plain
 * variables, so a second click is rejected before any rerender.
 */
export function createDraftSaver<TValue, TResult>({
  errorMessage,
  getValue,
  hasChanges,
  onSaved,
  persist,
  resetDelayMs = 1200,
  setStatus,
  setValue,
}: DraftSaverOptions<TValue, TResult>): DraftSaver<TValue, TResult> {
  let failed: { value: TValue } | undefined;
  let pendingSaves = 0;
  let activeSave: symbol | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let status = idleSaveStatus;

  function publish(next = status) {
    status = next;
    setStatus(pendingSaves > 0 ? { saveError: status.saveError, saveState: 'saving' } : status);
  }

  function clearIdleTimer() {
    if (idleTimer === undefined) return;
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }

  function update(value: TValue) {
    failed = undefined;
    activeSave = undefined;
    clearIdleTimer();
    setValue(value);
    publish(idleSaveStatus);
  }

  async function save(override?: TValue) {
    if (override === undefined && (pendingSaves > 0 || (!failed && !hasChanges()))) {
      return undefined;
    }
    const value = override ?? failed?.value ?? getValue();
    const request = Symbol();
    activeSave = request;
    pendingSaves += 1;
    clearIdleTimer();
    publish({ saveError: '', saveState: 'saving' });
    try {
      const result = await persist(value);
      if (activeSave !== request) return undefined;
      failed = undefined;
      if (onSaved?.(result, value) === false) {
        status = idleSaveStatus;
        return result;
      }
      status = { saveError: '', saveState: 'saved' };
      idleTimer = setTimeout(() => {
        idleTimer = undefined;
        publish(idleSaveStatus);
      }, resetDelayMs);
      return result;
    } catch (error) {
      if (activeSave !== request) return undefined;
      failed = { value };
      status = { saveError: errorMessage(error), saveState: 'error' };
      return undefined;
    } finally {
      pendingSaves -= 1;
      publish();
    }
  }

  return {
    canSave: () => pendingSaves === 0 && hasChanges(),
    save,
    update,
  };
}
