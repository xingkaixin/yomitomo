import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('./main-paths', () => ({
  mainPath: (...segments: string[]) => segments.join('/'),
}));

vi.mock('./logger', () => ({
  logError: vi.fn(),
}));

const readFileMock = vi.mocked(readFile);

describe('release notes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('reads localized local release notes first', async () => {
    const { getReleaseNote } = await import('./release-notes');
    readFileMock.mockResolvedValueOnce(
      JSON.stringify({
        version: '0.6.0',
        highlights: [{ type: 'new', title: 'Reading memory' }],
      }),
    );

    const note = await getReleaseNote('0.6.0', 'local', 'en');

    expect(readFileMock).toHaveBeenCalledWith(
      '../../resources/release-notes/en/0.6.0.json',
      'utf8',
    );
    expect(note?.highlights[0]?.title).toBe('Reading memory');
  });

  it('falls back from English local notes to Chinese notes', async () => {
    const { getReleaseNote } = await import('./release-notes');
    readFileMock.mockRejectedValueOnce(new Error('missing en')).mockResolvedValueOnce(
      JSON.stringify({
        version: '0.6.0',
        highlights: [{ type: 'new', title: '阅读记忆底座' }],
      }),
    );

    const note = await getReleaseNote('0.6.0', 'local', 'en');

    expect(readFileMock).toHaveBeenNthCalledWith(
      2,
      '../../resources/release-notes/zh-CN/0.6.0.json',
      'utf8',
    );
    expect(note?.highlights[0]?.title).toBe('阅读记忆底座');
  });

  it('fetches localized remote release notes before legacy URLs', async () => {
    const { getReleaseNote } = await import('./release-notes');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: '0.6.0',
          highlights: [{ type: 'new', title: 'Reading memory' }],
        }),
      ),
    );

    const note = await getReleaseNote('0.6.0', 'remote', 'en');

    expect(fetch).toHaveBeenCalledWith('https://yomitomo.app/release-notes/en/0.6.0.json');
    expect(note?.highlights[0]?.title).toBe('Reading memory');
  });

  it('falls back to the legacy remote URL in development', async () => {
    const { getReleaseNote } = await import('./release-notes');
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            version: '0.6.0',
            highlights: [{ type: 'fixed', title: 'Legacy fallback' }],
          }),
        ),
      );

    const note = await getReleaseNote('0.6.0', 'remote', 'en');

    expect(fetch).toHaveBeenNthCalledWith(3, 'https://yomitomo.app/release-notes/0.6.0.json');
    expect(note?.highlights[0]?.title).toBe('Legacy fallback');
  });
});
