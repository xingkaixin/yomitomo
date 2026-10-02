// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeAppI18n } from '../i18n/app-i18n';
import { emptyStore } from '../settings/app-settings';
import { OnboardingFlow } from '../shell/app-onboarding';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(cleanup);

describe('OnboardingFlow', () => {
  it.each([
    ['导入 EPUB', 'import-ebook'],
    ['导入 PDF', 'import-pdf'],
    ['导入网页', 'import-web'],
    ['先进入阅读库', undefined],
  ])('enters the selected destination after saving: %s', async (label, command) => {
    const onSaveSettings = vi.fn().mockResolvedValue(emptyStore);
    const onStartReading = vi.fn();
    render(<OnboardingFlow onSaveSettings={onSaveSettings} onStartReading={onStartReading} />);

    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(onStartReading).toHaveBeenCalledWith(command));
    expect(onSaveSettings).toHaveBeenCalledWith({ onboardingCompletedAt: expect.any(String) });
  });

  it('keeps the task choices available when saving fails', async () => {
    const onSaveSettings = vi.fn().mockRejectedValue(new Error('Save failed'));
    const onStartReading = vi.fn();
    render(<OnboardingFlow onSaveSettings={onSaveSettings} onStartReading={onStartReading} />);

    fireEvent.click(screen.getByRole('button', { name: '导入 EPUB' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Save failed');
    expect(onStartReading).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '导入 EPUB' })).toHaveProperty('disabled', false);
  });
});
