// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsSectionShell } from '../settings/app-settings-panels';
import { initializeAppI18n } from '../i18n/app-i18n';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  window.localStorage.clear();
  vi.clearAllMocks();
});

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

describe('SettingsSectionShell', () => {
  it('marks the active settings section', () => {
    render(
      <SettingsSectionShell activeSection="collection" onSectionChange={vi.fn()}>
        <div>content</div>
      </SettingsSectionShell>,
    );

    const nav = screen.getByRole('navigation', { name: '设置分类' });
    expect(within(nav).getByRole('button', { name: '通用' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('shows diagnostics sections only in developer mode', () => {
    const { rerender } = render(
      <SettingsSectionShell activeSection="about" onSectionChange={vi.fn()}>
        <div>content</div>
      </SettingsSectionShell>,
    );

    expect(screen.queryByText('助手调用链路')).toBeNull();

    rerender(
      <SettingsSectionShell activeSection="about" developerModeEnabled onSectionChange={vi.fn()}>
        <div>content</div>
      </SettingsSectionShell>,
    );

    expect(screen.getByText('助手调用链路')).toBeTruthy();
  });
});
