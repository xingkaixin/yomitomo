// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyStore } from '../settings/app-settings';
import { OnboardingFlow } from '../app-onboarding';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('OnboardingFlow', () => {
  it('completes onboarding from the enter button', async () => {
    vi.useFakeTimers();
    const onSaveSettings = vi.fn().mockResolvedValue({
      ...emptyStore,
      settings: { onboardingCompletedAt: '2026-05-10T00:00:00.000Z' },
    });

    render(<OnboardingFlow store={emptyStore} onSaveSettings={onSaveSettings} />);

    expect(screen.getByRole('dialog', { name: /你有多久/ })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    fireEvent.click(screen.getByRole('button', { name: /进入 Yomitomo/ }));

    expect(onSaveSettings).toHaveBeenCalledTimes(1);
    const settings = onSaveSettings.mock.calls[0]?.[0];
    expect(settings.onboardingCompletedAt).toEqual(expect.any(String));
    expect(new Date(settings.onboardingCompletedAt).toString()).not.toBe('Invalid Date');
  });
});
