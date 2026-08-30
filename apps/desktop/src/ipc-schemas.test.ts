import { describe, expect, it } from 'vitest';
import type { DesktopIpcInvokeArgs } from './ipc-contract';
import { DesktopIpcError, desktopIpcErrorCodes } from './ipc-errors';
import { validateDesktopIpcInvokeArgs } from './ipc-schemas';

describe('desktop IPC argument schemas', () => {
  it.each([true, false])('preserves explicit remote reading consent %s', (consent) => {
    const args: DesktopIpcInvokeArgs<'settings:save'> = [{ readingMemoryRemoteConsent: consent }];

    expect(validateDesktopIpcInvokeArgs('settings:save', args)).toEqual(args);
  });

  it('rejects non-boolean remote reading consent', () => {
    const args = [
      { readingMemoryRemoteConsent: 'true' },
    ] as unknown as DesktopIpcInvokeArgs<'settings:save'>;

    expect(() => validateDesktopIpcInvokeArgs('settings:save', args)).toThrow(DesktopIpcError);
  });

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

  it('accepts inline image avatars when saving a discussion comment', () => {
    const avatar = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg"><desc>${'A'.repeat(5000)}</desc></svg>`,
    )}`;
    const args: DesktopIpcInvokeArgs<'article:save-comment'> = [
      {
        articleId: 'article_1',
        annotationId: 'annotation_1',
        comment: {
          id: 'comment_1',
          author: {
            kind: 'user',
            userId: 'user_1',
            username: 'reader',
            avatar,
          },
          content: 'A saved thought',
          createdAt: '2026-08-25T03:49:12.000Z',
        },
      },
    ];

    expect(validateDesktopIpcInvokeArgs('article:save-comment', args)).toEqual(args);
  });
});
