// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLockGate } from '../app-lock/app-lock-gate';
import { initializeAppI18n } from '../i18n/app-i18n';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
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
