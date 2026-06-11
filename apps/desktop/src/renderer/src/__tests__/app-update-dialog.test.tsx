// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseNoteHighlight } from '@yomitomo/shared';
import { UpdateReleaseDialogView } from '../shell/app-update-dialog';
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
});
