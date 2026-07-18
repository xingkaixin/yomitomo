// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AutoSaveStatus } from '../settings/app-settings-save-status';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe('AutoSaveStatus', () => {
  it('does not render an inert retry button', () => {
    render(<AutoSaveStatus error="save failed" state="error" />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('runs the provided retry action', () => {
    const onRetry = vi.fn();
    render(<AutoSaveStatus error="save failed" state="error" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
