import { describe, expect, it } from 'vitest';
import { createPdfTextAnchor, type TextAnchor } from '@yomitomo/shared';
import type { DesktopIpcInvokeArgs } from './ipc-contract';
import { DesktopIpcError, desktopIpcErrorCodes } from './ipc-errors';
import { validateDesktopIpcInvokeArgs } from './ipc-schemas';

describe('desktop IPC argument schemas', () => {
  it('accepts a bounded discussion thought draft without changing ordinary opens', () => {
    const target = { articleId: 'article_1', annotationId: 'annotation_1' };

    expect(validateDesktopIpcInvokeArgs('annotation-discussion:open', [target])).toEqual([target]);
    expect(
      validateDesktopIpcInvokeArgs('annotation-discussion:open', [
        { ...target, thoughtDraft: '  跨资料的新想法  ' },
      ]),
    ).toEqual([{ ...target, thoughtDraft: '跨资料的新想法' }]);
    expect(
      validateDesktopIpcInvokeArgs('annotation-discussion:open', [
        { ...target, thoughtDraft: 'a'.repeat(8_192) },
      ]),
    ).toEqual([{ ...target, thoughtDraft: 'a'.repeat(8_192) }]);
  });

  it.each(['', '   ', 'a'.repeat(8_193), `${' '.repeat(8_192)}a`, 42])(
    'rejects empty, oversized, or non-text discussion drafts %#',
    (thoughtDraft) => {
      const input = { articleId: 'article_1', annotationId: 'annotation_1', thoughtDraft };
      const args = [input] as unknown as DesktopIpcInvokeArgs<'annotation-discussion:open'>;
      expect(() => validateDesktopIpcInvokeArgs('annotation-discussion:open', args)).toThrow(
        DesktopIpcError,
      );
    },
  );

  const pdfAnchor = createPdfTextAnchor({
    pageText: 'Reading memory connects saved judgments',
    pageIndex: 0,
    start: 0,
    end: 39,
    pageWidth: 600,
    pageHeight: 400,
    rects: [{ x: 0.03, y: 0.18, width: 0.7, height: 0.05 }],
  });

  it('preserves PDF location fields when validating annotation writes', () => {
    const args = annotationArgs(pdfAnchor);

    expect(validateDesktopIpcInvokeArgs('article:save-annotation', args)).toEqual(args);
  });

  it('keeps ordinary text anchor parsing and EPUB locations unchanged', () => {
    const anchor = {
      exact: 'Reading memory',
      prefix: '',
      suffix: '',
      start: 0,
      end: 14,
      chapterId: 'chapter_1',
      textStartInBook: 20,
      textEndInBook: 34,
    };
    const untrustedAnchor = { ...anchor, injected: true };
    const args = annotationArgs(untrustedAnchor);

    expect(validateDesktopIpcInvokeArgs('article:save-annotation', args)).toEqual(
      annotationArgs(anchor),
    );
  });

  it.each([
    { pageIndex: undefined },
    { pageIndex: -1 },
    { pageIndex: 0.5 },
    { pageWidth: 0 },
    { pageHeight: Number.NaN },
    { rects: undefined },
    { rects: [{ x: -0.1, y: 0.2, width: 0.3, height: 0.04 }] },
    { rects: [{ x: 0.1, y: 0.2, width: Number.POSITIVE_INFINITY, height: 0.04 }] },
  ])('rejects malformed PDF fields instead of stripping their discriminator: %j', (invalid) => {
    const args = annotationArgs({ ...pdfAnchor, ...invalid });

    expect(() => validateDesktopIpcInvokeArgs('article:save-annotation', args)).toThrow(
      DesktopIpcError,
    );
  });

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

function annotationArgs(anchor: TextAnchor): DesktopIpcInvokeArgs<'article:save-annotation'> {
  return [
    {
      articleId: 'pdf_fixture',
      annotation: {
        id: 'annotation_fixture',
        anchor,
        author: { kind: 'user', username: 'reader' },
        color: '#f4c95d',
        comments: [],
        createdAt: '2026-08-30T04:00:00.000Z',
        updatedAt: '2026-08-30T04:00:00.000Z',
      },
    },
  ];
}
