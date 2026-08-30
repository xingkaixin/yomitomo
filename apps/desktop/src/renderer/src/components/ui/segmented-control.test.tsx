// @vitest-environment jsdom

import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl, type SegmentedControlProps } from './segmented-control';

const options = [
  { value: 'first', label: 'First' },
  { value: 'disabled', label: 'Disabled', disabled: true },
  { value: 'last', label: 'Last' },
];

function Controlled({
  role,
  initialValue = 'first',
}: {
  role: SegmentedControlProps<string>['role'];
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <SegmentedControl
      aria-label="View"
      role={role}
      value={value}
      options={options}
      onValueChange={setValue}
    />
  );
}

afterEach(cleanup);

describe.each([
  { role: 'tablist', itemRole: 'tab', selectedAttribute: 'aria-selected' },
  { role: 'radiogroup', itemRole: 'radio', selectedAttribute: 'aria-checked' },
] as const)('SegmentedControl $role', ({ role, itemRole, selectedAttribute }) => {
  it('moves selection and focus together with wrapping arrow keys while skipping disabled options', () => {
    render(<Controlled role={role} />);
    const first = screen.getByRole<HTMLButtonElement>(itemRole, { name: 'First' });
    const disabled = screen.getByRole<HTMLButtonElement>(itemRole, { name: 'Disabled' });
    const last = screen.getByRole<HTMLButtonElement>(itemRole, { name: 'Last' });
    first.focus();

    expect(first.tabIndex).toBe(0);
    expect(disabled.tabIndex).toBe(-1);
    expect(last.tabIndex).toBe(-1);

    for (const [key, expected] of [
      ['ArrowRight', last],
      ['ArrowRight', first],
      ['ArrowLeft', last],
      ['ArrowUp', first],
      ['ArrowDown', last],
    ] as const) {
      fireEvent.keyDown(document.activeElement!, { key });
      expect(document.activeElement).toBe(expected);
      expect(expected.getAttribute(selectedAttribute)).toBe('true');
      expect(expected.tabIndex).toBe(0);
      expect([first, disabled, last].filter((button) => button.tabIndex === 0)).toEqual([expected]);
    }
    expect(disabled.getAttribute(selectedAttribute)).toBe('false');
  });

  it.each(['missing', 'disabled'])(
    'keeps an enabled Tab entry when the selected value is %s',
    (initialValue) => {
      render(<Controlled role={role} initialValue={initialValue} />);
      const first = screen.getByRole<HTMLButtonElement>(itemRole, { name: 'First' });
      const last = screen.getByRole<HTMLButtonElement>(itemRole, { name: 'Last' });
      expect(
        screen.getAllByRole<HTMLButtonElement>(itemRole).filter((button) => button.tabIndex === 0),
      ).toEqual([first]);

      first.focus();
      fireEvent.keyDown(first, { key: 'ArrowRight' });

      expect(document.activeElement).toBe(last);
      expect(last.getAttribute(selectedAttribute)).toBe('true');
    },
  );
});

it('keeps the default radio role and does not select anything when every option is disabled', () => {
  const onValueChange = vi.fn();
  render(
    <SegmentedControl
      aria-label="View"
      value="first"
      options={[{ value: 'first', label: 'First', disabled: true }]}
      onValueChange={onValueChange}
    />,
  );
  const group = screen.getByRole('radiogroup', { name: 'View' });
  fireEvent.keyDown(group, { key: 'ArrowRight' });

  expect(onValueChange).not.toHaveBeenCalled();
  expect(
    screen.getAllByRole<HTMLButtonElement>('radio').every((button) => button.tabIndex === -1),
  ).toBe(true);
});
