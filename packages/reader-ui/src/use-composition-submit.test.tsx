// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageSendShortcut } from '@yomitomo/shared';
import { useCompositionSubmit } from './use-composition-submit';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function TestTextarea({
  messageSendShortcut = 'enter',
  onCancel,
  onSubmit,
}: {
  messageSendShortcut?: MessageSendShortcut;
  onCancel?: () => void;
  onSubmit: () => void;
}) {
  const handleKeyDown = useCompositionSubmit({
    messageSendShortcut,
    onCancel,
    onSubmit,
  });

  return <textarea aria-label="composer" onKeyDown={handleKeyDown} />;
}

describe('useCompositionSubmit', () => {
  it('submits and prevents default for the configured send shortcut', () => {
    const onSubmit = vi.fn();
    render(<TestTextarea onSubmit={onSubmit} />);

    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
    fireEvent(screen.getByLabelText('composer'), event);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not submit while an IME composition is active', () => {
    const onSubmit = vi.fn();
    render(<TestTextarea onSubmit={onSubmit} />);

    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
    Object.defineProperty(event, 'isComposing', { configurable: true, value: true });
    fireEvent(screen.getByLabelText('composer'), event);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('cancels and prevents default on Escape when a cancel callback exists', () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(<TestTextarea onCancel={onCancel} onSubmit={onSubmit} />);

    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' });
    fireEvent(screen.getByLabelText('composer'), event);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });
});
