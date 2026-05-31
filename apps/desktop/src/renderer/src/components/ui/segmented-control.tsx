import * as React from 'react';
import { cn } from '../../lib/utils';

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = {
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onValueChange: (value: T) => void;
  'aria-label': string;
  role?: 'radiogroup' | 'tablist';
  className?: string;
  optionClassName?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
  'aria-label': ariaLabel,
  role = 'radiogroup',
  className,
  optionClassName,
}: SegmentedControlProps<T>) {
  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );

  function moveSelection(direction: -1 | 1) {
    const enabledOptions = options.filter((option) => !option.disabled);
    const currentEnabledIndex = enabledOptions.findIndex((option) => option.value === value);
    if (currentEnabledIndex === -1) return;
    const nextIndex =
      (currentEnabledIndex + direction + enabledOptions.length) % enabledOptions.length;
    onValueChange(enabledOptions[nextIndex].value);
  }

  return (
    <div
      aria-label={ariaLabel}
      className={cn('segmented-control', className)}
      role={role}
      style={
        {
          '--segment-count': options.length,
          '--segment-index': selectedIndex,
        } as React.CSSProperties
      }
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          moveSelection(-1);
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          moveSelection(1);
        }
      }}
    >
      <span className="segmented-control-indicator" aria-hidden="true" />
      {options.map((option) => (
        <button
          aria-label={option.ariaLabel}
          aria-checked={role === 'radiogroup' ? value === option.value : undefined}
          aria-selected={role === 'tablist' ? value === option.value : undefined}
          className={cn('segmented-control-option', optionClassName)}
          disabled={option.disabled}
          key={option.value}
          role={role === 'tablist' ? 'tab' : 'radio'}
          type="button"
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
