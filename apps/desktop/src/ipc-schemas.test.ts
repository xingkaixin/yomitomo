import { describe, expect, it } from 'vitest';
import type { DesktopIpcInvokeArgs } from './ipc-contract';
import { DesktopIpcError, desktopIpcErrorCodes } from './ipc-errors';
import { validateDesktopIpcInvokeArgs } from './ipc-schemas';

describe('desktop IPC argument schemas', () => {
  it('returns parsed arguments without unknown object fields', () => {
    const args = [
      {
        soundEffectsEnabled: true,
        selectionActionShortcuts: {
          copy: 'mod+c',
          injected: 'nested',
        },
        injected: 'root',
      },
    ] as unknown as DesktopIpcInvokeArgs<'settings:save'>;

    expect(validateDesktopIpcInvokeArgs('settings:save', args)).toEqual([
      {
        soundEffectsEnabled: true,
        selectionActionShortcuts: { copy: 'mod+c' },
      },
    ]);
  });

  it('preserves nested validation issue paths', () => {
    const args = [
      { selectionActionShortcuts: { copy: 42 } },
    ] as unknown as DesktopIpcInvokeArgs<'settings:save'>;

    try {
      validateDesktopIpcInvokeArgs('settings:save', args);
      expect.unreachable('expected invalid IPC arguments');
    } catch (error) {
      expect(error).toBeInstanceOf(DesktopIpcError);
      expect(error).toMatchObject({
        code: desktopIpcErrorCodes.invalidArgs,
        detail: {
          channel: 'settings:save',
          issues: [{ path: [0, 'selectionActionShortcuts', 'copy'] }],
        },
      });
    }
  });
});
