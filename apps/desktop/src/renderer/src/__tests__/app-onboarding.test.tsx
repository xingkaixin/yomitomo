// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeAppI18n } from '../i18n/app-i18n';
import { emptyStore } from '../settings/app-settings';
import { OnboardingFlow } from '../shell/app-onboarding';

function renderOnboarding(onSaveSettings = vi.fn().mockResolvedValue(emptyStore)) {
  const onStartReading = vi.fn();
  render(<OnboardingFlow onSaveSettings={onSaveSettings} onStartReading={onStartReading} />);
  return { onSaveSettings, onStartReading };
}

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(cleanup);

describe('OnboardingFlow', () => {
  it.each([
    [/导入电子书/, 'import-ebook'],
    [/导入 PDF/, 'import-pdf'],
    [/粘贴网页链接/, 'import-web'],
    ['先进入阅读库', undefined],
  ])('enters the selected destination after saving: %s', async (label, command) => {
    const { onSaveSettings, onStartReading } = renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(onStartReading).toHaveBeenCalledOnce());
    expect(onStartReading.mock.calls[0]?.[0]).toBe(command);
    expect(onSaveSettings).toHaveBeenCalledWith({ onboardingCompletedAt: expect.any(String) });
  });

  it('keeps the task choices available when saving fails', async () => {
    const { onStartReading } = renderOnboarding(
      vi.fn().mockRejectedValue(new Error('Save failed')),
    );

    fireEvent.click(screen.getByRole('button', { name: /导入电子书/ }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Save failed');
    expect(onStartReading).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /导入电子书/ })).toHaveProperty('disabled', false);
  });

  it('saves the chosen language without leaving onboarding', async () => {
    const { onSaveSettings, onStartReading } = renderOnboarding();

    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    await waitFor(() => expect(onSaveSettings).toHaveBeenCalledWith({ uiLanguage: 'en' }));
    expect(onStartReading).not.toHaveBeenCalled();
  });
});
