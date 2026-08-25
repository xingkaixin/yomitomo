// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore, ReleaseNoteHighlight } from '@yomitomo/shared';
import type { AppUpdateState } from '../../../app-update-types';
import { UpdateReleaseDialog, UpdateReleaseDialogView } from '../shell/app-update-dialog';
import { initializeAppI18n } from '../i18n/app-i18n';

beforeEach(() => {
  initializeAppI18n('zh-CN');
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const highlights: ReleaseNoteHighlight[] = [
  { type: 'new', title: '助读队列', description: '逐条生成批注' },
  { type: 'fixed', title: '修复进度回退' },
];

const available = (trigger: AppUpdateState['trigger']): AppUpdateState => ({
  status: 'available',
  currentVersion: '0.8.0',
  availableVersion: '0.9.0',
  trigger,
});

describe('UpdateReleaseDialogView', () => {
  it('renders the after-update scene with full highlights and a single primary action', () => {
    render(
      <UpdateReleaseDialogView
        scene="after-update"
        version="0.7.0"
        highlights={highlights}
        onPrimary={() => undefined}
        onSecondary={() => undefined}
      />,
    );
    expect(screen.getByText('已更新到')).toBeTruthy();
    expect(screen.getByText('v0.7.0')).toBeTruthy();
    expect(screen.getByText('助读队列')).toBeTruthy();
    expect(screen.getByText('修复进度回退')).toBeTruthy();
    expect(screen.getByText('开始使用')).toBeTruthy();
    expect(screen.queryByText('立即更新')).toBeNull();
  });

  it('renders the before-update scene with later/update actions', () => {
    render(
      <UpdateReleaseDialogView
        scene="before-update"
        version="0.7.0"
        highlights={[highlights[0]]}
        onPrimary={() => undefined}
        onSecondary={() => undefined}
      />,
    );
    expect(screen.getByText('发现新版本')).toBeTruthy();
    expect(screen.getByText('立即更新')).toBeTruthy();
    expect(screen.getByText('稍后')).toBeTruthy();
  });

  it('closes through the secondary action on Escape', () => {
    const onSecondary = vi.fn();

    render(
      <UpdateReleaseDialogView
        scene="before-update"
        version="0.7.0"
        highlights={[highlights[0]]}
        onPrimary={() => undefined}
        onSecondary={onSecondary}
      />,
    );

    fireEvent.keyDown(screen.getByRole('dialog', { name: '发现新版本 0.7.0' }), {
      key: 'Escape',
    });

    expect(onSecondary).toHaveBeenCalledOnce();
  });

  it('degrades to a version-only prompt when there are no highlights', () => {
    render(
      <UpdateReleaseDialogView
        scene="after-update"
        version="0.7.0"
        highlights={[]}
        onPrimary={() => undefined}
        onSecondary={() => undefined}
      />,
    );
    expect(screen.getByText('v0.7.0')).toBeTruthy();
    expect(screen.getByText('Yomitomo 已更新到最新版本。')).toBeTruthy();
    expect(screen.queryByText('修复进度回退')).toBeNull();
  });

  it('shows filled progress, transferred bytes, total bytes, and speed while downloading', () => {
    render(
      <UpdateReleaseDialogView
        scene="before-update"
        version="0.9.0"
        highlights={[]}
        downloadStatus="downloading"
        downloadProgress={{
          percent: 42.6,
          transferred: 45 * 1024 * 1024,
          total: 105 * 1024 * 1024,
          bytesPerSecond: 3.2 * 1024 * 1024,
        }}
        onPrimary={() => undefined}
        onSecondary={() => undefined}
      />,
    );
    const progress = screen.getByRole('progressbar', { name: /更新下载进度 43%/ });
    expect(progress.getAttribute('aria-valuenow')).toBe('43');
    expect(progress.querySelector<HTMLElement>('.update-dialog-progress-fill')?.style.width).toBe(
      '43%',
    );
    expect(progress.querySelector('.update-dialog-progress-copy.is-base')?.textContent).toContain(
      '正在下载 43%',
    );
    expect(progress.querySelector('.update-dialog-progress-copy.is-base')?.textContent).toContain(
      '45 MB / 105 MB · 3.2 MB/秒',
    );
    expect(screen.getByText('后台下载')).toBeTruthy();
    expect(screen.queryByText('立即更新')).toBeNull();
  });

  it('shows a preparing state before the first progress event', () => {
    render(
      <UpdateReleaseDialogView
        scene="before-update"
        version="0.9.0"
        highlights={[]}
        downloadStatus="downloading"
        onPrimary={() => undefined}
        onSecondary={() => undefined}
      />,
    );

    const progress = screen.getByRole('progressbar', { name: /正在准备下载/ });
    expect(progress.querySelector('.update-dialog-progress-copy.is-base')?.textContent).toContain(
      '正在准备下载…',
    );
  });

  it('offers a download retry after a recoverable failure', () => {
    const onPrimary = vi.fn();
    render(
      <UpdateReleaseDialogView
        scene="before-update"
        version="0.9.0"
        highlights={[]}
        downloadStatus="error"
        onPrimary={onPrimary}
        onSecondary={() => undefined}
      />,
    );

    fireEvent.click(screen.getByText('重试下载'));
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it('switches the primary button to restart-install once downloaded', () => {
    render(
      <UpdateReleaseDialogView
        scene="before-update"
        version="0.9.0"
        highlights={[]}
        downloadStatus="downloaded"
        onPrimary={() => undefined}
        onSecondary={() => undefined}
      />,
    );
    expect(screen.getByText('更新已就绪')).toBeTruthy();
    expect(screen.getByText('重启并更新')).toBeTruthy();
    expect(screen.getByText('稍后重启')).toBeTruthy();
    expect(screen.queryByText('立即更新')).toBeNull();
  });
});

const stubDesktop = (getReleaseNote = vi.fn().mockResolvedValue(null)) => {
  const download = vi.fn().mockResolvedValue(undefined);
  const install = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('yomitomoDesktop', {
    app: {
      getInfo: vi.fn().mockResolvedValue({ desktopVersion: '0.8.0' }),
    },
    updates: {
      getReleaseNote,
      download,
      install,
    },
  });
  return { download, getReleaseNote, install };
};

describe('UpdateReleaseDialog before-update gating', () => {
  const store = {
    settings: { lastSeenVersion: '0.8.0', uiLanguage: 'zh-CN' },
  } as unknown as DesktopStore;

  const container = (updateState: AppUpdateState | null, openRequest: number) => (
    <UpdateReleaseDialog
      store={store}
      updateState={updateState}
      openRequest={openRequest}
      onSaveSettings={vi.fn().mockResolvedValue(store)}
    />
  );

  it('does not pop the dialog for an auto-check hit', async () => {
    stubDesktop();
    await act(async () => {
      render(container(available('auto'), 0));
    });
    expect(screen.queryByText('发现新版本')).toBeNull();
  });

  it('pops the dialog for a manual-check hit', async () => {
    stubDesktop();
    await act(async () => {
      render(container(available('manual'), 0));
    });
    expect(await screen.findByText('发现新版本')).toBeTruthy();
    expect(screen.getByText('v0.9.0')).toBeTruthy();
  });

  it('shows the version prompt while the release note is still pending', async () => {
    stubDesktop(vi.fn(() => new Promise(() => {})));
    await act(async () => {
      render(container(available('manual'), 0));
    });

    expect(await screen.findByText('发现新版本')).toBeTruthy();
    expect(screen.getByText('v0.9.0')).toBeTruthy();
  });

  it('keeps the version prompt when the release note request rejects', async () => {
    stubDesktop(vi.fn().mockRejectedValue(new Error('offline')));
    await act(async () => {
      render(container(available('manual'), 0));
    });

    expect(await screen.findByText('发现新版本')).toBeTruthy();
    expect(screen.getByText('v0.9.0')).toBeTruthy();
  });

  it('ignores a release note that arrives after the dialog was closed', async () => {
    let resolveNote: (note: unknown) => void = () => {};
    stubDesktop(vi.fn(() => new Promise((resolve) => (resolveNote = resolve))));
    await act(async () => {
      render(container(available('manual'), 0));
    });
    expect(await screen.findByText('发现新版本')).toBeTruthy();

    fireEvent.click(screen.getByText('稍后'));
    await act(async () => {
      resolveNote({ version: '0.9.0', highlights });
    });

    expect(screen.queryByText('发现新版本')).toBeNull();
  });

  it('pops the dialog for an auto-check hit when the user requests it from the header', async () => {
    stubDesktop();
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(container(available('auto'), 0));
    });
    expect(screen.queryByText('发现新版本')).toBeNull();
    await act(async () => {
      view.rerender(container(available('auto'), 1));
    });
    expect(await screen.findByText('发现新版本')).toBeTruthy();
    expect(screen.getByText('v0.9.0')).toBeTruthy();
  });

  it('reopens a dismissed download as a restart confirmation when it finishes', async () => {
    stubDesktop();
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(container(available('manual'), 0));
    });

    await act(async () => {
      view.rerender(
        container(
          {
            ...available('manual'),
            status: 'downloading',
            progress: { percent: 50, transferred: 50, total: 100, bytesPerSecond: 10 },
          },
          0,
        ),
      );
    });
    fireEvent.click(screen.getByText('后台下载'));
    expect(screen.queryByText('发现新版本')).toBeNull();

    await act(async () => {
      view.rerender(
        container(
          {
            ...available('manual'),
            status: 'downloaded',
            checkedAt: '2026-08-25T00:00:00.000Z',
          },
          0,
        ),
      );
    });
    expect(await screen.findByText('更新已就绪')).toBeTruthy();

    fireEvent.click(screen.getByText('稍后重启'));
    expect(screen.queryByText('更新已就绪')).toBeNull();
  });

  it('opens the current download when requested from the header', async () => {
    stubDesktop();
    const downloading: AppUpdateState = {
      ...available('auto'),
      status: 'downloading',
      progress: { percent: 50, transferred: 50, total: 100, bytesPerSecond: 10 },
    };
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(container(downloading, 0));
    });

    await act(async () => {
      view.rerender(container(downloading, 1));
    });
    expect(await screen.findByRole('progressbar')).toBeTruthy();
  });
});
