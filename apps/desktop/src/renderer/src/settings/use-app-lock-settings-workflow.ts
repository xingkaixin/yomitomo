import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedAppSettings } from '@yomitomo/shared';
import {
  desktopIpcErrorCodes,
  desktopIpcErrorRetryAfterMs,
  isDesktopIpcErrorLike,
} from '../../../ipc-errors';
import type { SaveState } from '../shell/app-types';
import { appSettingsActions } from './app-settings-actions';

type ClosedState = { phase: 'closed'; saveState: 'idle' | 'saved' };
type EnablePinState = { phase: 'enable-pin'; pin: string };
type ConfirmState = { phase: 'confirm'; pin: string; confirmPin: string };
type DisableState = { phase: 'disable'; pin: string };
type SavingState = { phase: 'saving'; operation: 'enable' | 'disable' };
type ErrorState =
  | { phase: 'error'; step: 'enable-pin'; pin: string; message: string }
  | {
      phase: 'error';
      step: 'confirm';
      pin: string;
      confirmPin: string;
      message: string;
    }
  | { phase: 'error'; step: 'disable'; pin: string; message: string };

export type AppLockSettingsWorkflowState =
  | ClosedState
  | EnablePinState
  | ConfirmState
  | DisableState
  | SavingState
  | ErrorState;

type AppLockWorkflowMessages = {
  confirmPinMismatch: string;
  disablePinRequired: string;
  pinRequired: string;
  retryAfter: (seconds: number) => string;
  saveFailed: string;
};

type UseAppLockSettingsWorkflowOptions = {
  messages: AppLockWorkflowMessages;
  onSettingsChange: (settings: ResolvedAppSettings) => void;
};

export type AppLockSettingsDialogModel = {
  canSubmit: boolean;
  confirmPin: string;
  disablePin: string;
  error: string;
  mode: 'enable' | 'disable' | null;
  pin: string;
  saving: boolean;
  setupStep: 'pin' | 'confirm';
};

export function useAppLockSettingsWorkflow({
  messages,
  onSettingsChange,
}: UseAppLockSettingsWorkflowOptions) {
  const [state, setState] = useState<AppLockSettingsWorkflowState>(closedState);
  const resetTimerRef = useRef<number | null>(null);
  const requestVersionRef = useRef(0);

  useEffect(
    () => () => {
      requestVersionRef.current += 1;
      clearResetTimer(resetTimerRef);
    },
    [],
  );

  function open(checked: boolean) {
    clearResetTimer(resetTimerRef);
    setState((current) => {
      if (current.phase === 'saving') return current;
      return checked ? { phase: 'enable-pin', pin: '' } : { phase: 'disable', pin: '' };
    });
  }

  function close() {
    setState((current) => (current.phase === 'saving' ? current : closedState()));
  }

  function updatePin(value: string) {
    const pin = digitsOnly(value);
    setState((current) => editableStateWithPin(current, pin));
  }

  async function submit(completedValue?: string) {
    const current = state;
    const completedPin = completedValue === undefined ? undefined : digitsOnly(completedValue);
    const editable = editableState(current);
    if (!editable) return;

    if (editable.phase === 'enable-pin') {
      const pin = completedPin ?? editable.pin;
      if (!validPin(pin)) {
        setState({ phase: 'error', step: 'enable-pin', pin, message: messages.pinRequired });
        return;
      }
      setState({ phase: 'confirm', pin, confirmPin: '' });
      return;
    }

    if (editable.phase === 'confirm') {
      const confirmPin = completedPin ?? editable.confirmPin;
      if (!validPin(editable.pin) || editable.pin !== confirmPin) {
        setState({
          phase: 'error',
          step: 'confirm',
          pin: editable.pin,
          confirmPin: '',
          message: messages.confirmPinMismatch,
        });
        return;
      }
      await enable(editable.pin, confirmPin);
      return;
    }

    const pin = completedPin ?? editable.pin;
    if (!validPin(pin)) {
      setState({ phase: 'error', step: 'disable', pin, message: messages.disablePinRequired });
      return;
    }
    await disable(pin);
  }

  async function enable(pin: string, confirmPin: string) {
    const requestVersion = startSaving('enable');
    try {
      const nextStore = await appSettingsActions.enableAppLock(pin, confirmPin);
      finishSaving(requestVersion, nextStore.settings);
    } catch (error) {
      failSaving(requestVersion, {
        phase: 'error',
        step: 'confirm',
        pin,
        confirmPin,
        message: appLockErrorMessage(error, messages),
      });
    }
  }

  async function disable(pin: string) {
    const requestVersion = startSaving('disable');
    try {
      const nextStore = await appSettingsActions.disableAppLock(pin);
      finishSaving(requestVersion, nextStore.settings);
    } catch (error) {
      failSaving(requestVersion, {
        phase: 'error',
        step: 'disable',
        pin,
        message: appLockErrorMessage(error, messages),
      });
    }
  }

  function startSaving(operation: SavingState['operation']) {
    clearResetTimer(resetTimerRef);
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setState({ phase: 'saving', operation });
    return requestVersion;
  }

  function finishSaving(requestVersion: number, settings: ResolvedAppSettings) {
    if (requestVersion !== requestVersionRef.current) return;
    onSettingsChange(settings);
    setState({ phase: 'closed', saveState: 'saved' });
    resetTimerRef.current = window.setTimeout(() => {
      setState((current) =>
        current.phase === 'closed' && current.saveState === 'saved' ? closedState() : current,
      );
      resetTimerRef.current = null;
    }, 1200);
  }

  function failSaving(requestVersion: number, errorState: ErrorState) {
    if (requestVersion !== requestVersionRef.current) return;
    setState(errorState);
  }

  const dialog = useMemo(() => dialogModel(state), [state]);
  const saveState: SaveState =
    state.phase === 'saving'
      ? 'saving'
      : state.phase === 'error'
        ? 'error'
        : state.phase === 'closed'
          ? state.saveState
          : 'idle';

  return {
    close,
    dialog,
    error: state.phase === 'error' ? state.message : '',
    open,
    saveState,
    state,
    submit,
    updatePin,
  };
}

function closedState(): ClosedState {
  return { phase: 'closed', saveState: 'idle' };
}

function editableState(
  state: AppLockSettingsWorkflowState,
): EnablePinState | ConfirmState | DisableState | null {
  if (state.phase !== 'error') {
    return state.phase === 'enable-pin' || state.phase === 'confirm' || state.phase === 'disable'
      ? state
      : null;
  }
  if (state.step === 'confirm') {
    return {
      phase: 'confirm',
      pin: state.pin,
      confirmPin: state.confirmPin,
    };
  }
  return {
    phase: state.step,
    pin: state.pin,
  };
}

function editableStateWithPin(
  state: AppLockSettingsWorkflowState,
  pin: string,
): AppLockSettingsWorkflowState {
  const editable = editableState(state);
  if (!editable) return state;
  if (editable.phase === 'confirm') return { ...editable, confirmPin: pin };
  return { ...editable, pin };
}

function dialogModel(state: AppLockSettingsWorkflowState): AppLockSettingsDialogModel {
  const editable = editableState(state);
  const operation = state.phase === 'saving' ? state.operation : null;
  const mode =
    operation === 'disable' || editable?.phase === 'disable'
      ? 'disable'
      : operation === 'enable' || editable
        ? 'enable'
        : null;
  const setupStep = editable?.phase === 'confirm' || operation === 'enable' ? 'confirm' : 'pin';
  const pin = editable?.phase === 'enable-pin' ? editable.pin : '';
  const confirmPin = editable?.phase === 'confirm' ? editable.confirmPin : '';
  const disablePin = editable?.phase === 'disable' ? editable.pin : '';
  return {
    canSubmit: editable
      ? validPin(editable.phase === 'confirm' ? editable.confirmPin : editable.pin)
      : false,
    confirmPin,
    disablePin,
    error: state.phase === 'error' ? state.message : '',
    mode,
    pin,
    saving: state.phase === 'saving',
    setupStep,
  };
}

function clearResetTimer(timerRef: { current: number | null }) {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function validPin(value: string) {
  return /^\d{4}$/.test(value);
}

function appLockErrorMessage(error: unknown, messages: AppLockWorkflowMessages) {
  const retryAfterMs = desktopIpcErrorRetryAfterMs(error);
  if (retryAfterMs) return messages.retryAfter(Math.ceil(retryAfterMs / 1_000));
  if (isDesktopIpcErrorLike(error)) {
    if (
      error.code === desktopIpcErrorCodes.appLockPinInvalid ||
      error.code === desktopIpcErrorCodes.appLockPinRequired ||
      error.code === desktopIpcErrorCodes.appLockPinMismatch
    ) {
      return messages.saveFailed;
    }
    return error.message || messages.saveFailed;
  }
  if (error instanceof Error && error.message) return error.message;
  return messages.saveFailed;
}
