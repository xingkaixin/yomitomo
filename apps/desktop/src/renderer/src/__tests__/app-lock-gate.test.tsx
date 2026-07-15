// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import { AppLockGate, useAppLockController } from '../app-lock/app-lock-gate';
import { initializeAppI18n } from '../i18n/app-i18n';
import { emptyStore } from '../settings/app-settings';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
});

describe('useAppLockController', () => {
  it('locks the app through the desktop preload facade', async () => {
    const lockedStore = makeStore({
      articles: [articleSummary({ id: 'article_secret' })],
      settings: { appLockEnabled: true, appLockLocked: true },
    });
    const onStoreUpdated = vi.fn();
    const latest: { current?: ReturnType<typeof useAppLockController> } = {};

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        platform: 'darwin',
        setAppLockLocked: vi.fn().mockResolvedValue(lockedStore),
      },
    });

    render(<Harness latest={latest} onStoreUpdated={onStoreUpdated} />);

    await act(async () => {
      await latest.current?.lockApp();
    });

    expect(window.yomitomoDesktop.setAppLockLocked).toHaveBeenCalledWith({ locked: true });
    expect(onStoreUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        articles: [],
        settings: expect.objectContaining({ appLockEnabled: true, appLockLocked: true }),
      }),
    );
  });

  it('handles slide, invalid PIN, and successful unlock states', async () => {
    const unlockedStore = makeStore({ settings: { appLockEnabled: true, appLockLocked: false } });
    const onStoreUpdated = vi.fn();
    const latest: { current?: ReturnType<typeof useAppLockController> } = {};

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        platform: 'darwin',
        unlockAppLock: vi
          .fn()
          .mockRejectedValueOnce({ code: 'APP_LOCK_PIN_INVALID', message: 'bad pin' })
          .mockResolvedValueOnce(unlockedStore),
      },
    });

    render(<Harness latest={latest} locked onStoreUpdated={onStoreUpdated} />);

    act(() => {
      latest.current?.completeSlide();
    });
    expect(screen.getByTestId('step').textContent).toBe('pin');

    act(() => {
      latest.current?.updatePin('12a34');
    });
    expect(screen.getByTestId('pin').textContent).toBe('1234');

    await act(async () => {
      await latest.current?.unlockApp();
    });
    expect(screen.getByTestId('error').textContent).toBe('PIN 不正确。');
    expect(screen.getByTestId('pin').textContent).toBe('');

    act(() => {
      latest.current?.updatePin('1234');
    });
    await act(async () => {
      await latest.current?.unlockApp('1234');
    });

    expect(window.yomitomoDesktop.unlockAppLock).toHaveBeenLastCalledWith({ pin: '1234' });
    expect(onStoreUpdated).toHaveBeenCalledWith(unlockedStore);
  });

  it('shows the retry delay returned by the main process', async () => {
    const latest: { current?: ReturnType<typeof useAppLockController> } = {};

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        platform: 'darwin',
        unlockAppLock: vi.fn().mockRejectedValue({
          code: 'APP_LOCK_RATE_LIMITED',
          detail: { retryAfterMs: 2_001 },
          message: 'APP_LOCK_RATE_LIMITED',
        }),
      },
    });

    render(<Harness latest={latest} locked onStoreUpdated={vi.fn()} />);

    await act(async () => {
      await latest.current?.unlockApp('1234');
    });

    expect(screen.getByTestId('error').textContent).toBe('错误次数过多，请在 3 秒后重试。');
  });
});

describe('AppLockGate', () => {
  it('does not mount protected children while locked', () => {
    render(
      <AppLockGate enabled locked onStoreUpdated={vi.fn()}>
        {() => <span data-testid="protected-content">敏感内容</span>}
      </AppLockGate>,
    );

    expect(screen.queryByTestId('protected-content')).toBeNull();
    expect(screen.getByRole('dialog')).not.toBeNull();
  });
});

function Harness({
  enabled = true,
  latest,
  locked = false,
  onStoreUpdated,
}: {
  enabled?: boolean;
  latest: { current?: ReturnType<typeof useAppLockController> };
  locked?: boolean;
  onStoreUpdated: (store: DesktopStore) => void;
}) {
  const controller = useAppLockController({
    enabled,
    locked,
    onStoreUpdated,
  });
  latest.current = controller;

  return (
    <>
      <span data-testid="step">{controller.step}</span>
      <span data-testid="pin">{controller.pin}</span>
      <span data-testid="error">{controller.error}</span>
    </>
  );
}

function makeStore(input: {
  articles?: DesktopStore['articles'];
  settings: DesktopStore['settings'];
}): DesktopStore {
  return {
    ...emptyStore,
    articles: input.articles || [],
    settings: {
      soundEffectsEnabled: false,
      ...input.settings,
    },
  };
}

function articleSummary(
  input: Partial<DesktopStore['articles'][number]>,
): DesktopStore['articles'][number] {
  return {
    id: input.id || 'article_1',
    title: input.title || '文章',
    url: input.url || '',
    canonicalUrl: input.canonicalUrl || input.url || '',
    excerpt: input.excerpt || '',
    byline: input.byline || '',
    siteName: input.siteName || '',
    contentHash: input.contentHash || 'hash',
    sourceType: input.sourceType || 'web',
    readingProgress: input.readingProgress,
    annotations: input.annotations || [],
    annotationCount: input.annotationCount || 0,
    commentCount: input.commentCount || 0,
    aiCommentCount: input.aiCommentCount || 0,
    distillationCount: input.distillationCount || 0,
    createdAt: input.createdAt || '2026-06-27T00:00:00.000Z',
    updatedAt: input.updatedAt || '2026-06-27T00:00:00.000Z',
  };
}
