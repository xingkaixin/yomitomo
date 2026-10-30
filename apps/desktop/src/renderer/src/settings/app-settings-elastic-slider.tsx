import React from 'react';

type SettingsElasticSliderProps = {
  ariaLabel: string;
  disabled?: boolean;
  formatValue: (value: number) => string;
  label: string;
  max: number;
  min: number;
  step: number;
  value: number;
  onCommit: (value: number) => void;
  onValueChange: (value: number) => void;
};

const elasticSliderCommitKeys = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function decimalsForStep(step: number) {
  const [, decimals = ''] = step.toString().split('.');
  return decimals.length;
}

function roundToStep(value: number, min: number, max: number, step: number) {
  const rounded = min + Math.round((value - min) / step) * step;
  return Number(clamp(rounded, min, max).toFixed(decimalsForStep(step)));
}

export function SettingsElasticSlider({
  ariaLabel,
  disabled,
  formatValue,
  label,
  max,
  min,
  step,
  value,
  onCommit,
  onValueChange,
}: SettingsElasticSliderProps) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef(false);
  const [{ active, rubberStretch }, dispatch] = React.useReducer(elasticSliderReducer, {
    active: false,
    rubberStretch: 0,
  });
  const percent = ((value - min) / (max - min)) * 100;
  const displayValue = formatValue(value);
  const tickCount = Math.max(0, Math.floor((max - min) / step) - 1);

  function valueFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const width = rect.width || track.offsetWidth || 1;
    const left = rect.width ? rect.left : 0;
    const rawPercent = clamp((clientX - left) / width, 0, 1);
    return roundToStep(min + rawPercent * (max - min), min, max, step);
  }

  function applyPointerValue(clientX: number) {
    const nextValue = valueFromClientX(clientX);
    onValueChange(nextValue);

    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return nextValue;
    const overflowLeft = Math.max(0, rect.left - clientX);
    const overflowRight = Math.max(0, clientX - rect.right);
    dispatch({
      type: 'stretched',
      stretch: Math.min(8, Math.sqrt(Math.max(overflowLeft, overflowRight))),
    });
    return nextValue;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    draggingRef.current = true;
    dispatch({ type: 'activated' });
    applyPointerValue(event.clientX);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || disabled) return;
    applyPointerValue(event.clientX);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || disabled) return;
    const nextValue = applyPointerValue(event.clientX);
    draggingRef.current = false;
    dispatch({ type: 'released' });
    onCommit(nextValue);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    let nextValue: number | null = null;
    const currentValue = value;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextValue = currentValue + step;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextValue = currentValue - step;
    if (event.key === 'PageUp') nextValue = currentValue + step * 4;
    if (event.key === 'PageDown') nextValue = currentValue - step * 4;
    if (event.key === 'Home') nextValue = min;
    if (event.key === 'End') nextValue = max;
    if (nextValue === null) return;
    event.preventDefault();
    onValueChange(roundToStep(nextValue, min, max, step));
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled || !elasticSliderCommitKeys.has(event.key)) return;
    onCommit(value);
  }

  return (
    <div className="settings-elastic-slider-control">
      <div
        ref={trackRef}
        className="settings-elastic-slider"
        data-active={active}
        data-disabled={disabled ? 'true' : undefined}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={value}
        aria-valuetext={displayValue}
        style={
          {
            '--settings-elastic-slider-percent': `${percent}%`,
            '--settings-elastic-slider-stretch': `${rubberStretch}px`,
          } as React.CSSProperties
        }
        onBlur={() => onCommit(value)}
        onFocus={() => dispatch({ type: 'activated' })}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => dispatch({ type: 'activated' })}
        onMouseLeave={() => {
          if (!draggingRef.current) dispatch({ type: 'released' });
        }}
      >
        <span className="settings-elastic-slider-fill" aria-hidden="true" />
        <span className="settings-elastic-slider-handle" aria-hidden="true" />
        {Array.from({ length: tickCount }, (_, index) => (
          <i
            key={index}
            className="settings-elastic-slider-tick"
            style={{ left: `${((index + 1) * step * 100) / (max - min)}%` }}
            aria-hidden="true"
          />
        ))}
        <span className="settings-elastic-slider-label" aria-hidden="true">
          {label}
        </span>
        <span className="settings-elastic-slider-value" aria-hidden="true">
          {displayValue}
        </span>
      </div>
    </div>
  );
}

type ElasticSliderState = { active: boolean; rubberStretch: number };

type ElasticSliderEvent =
  | { type: 'activated' }
  | { type: 'released' }
  | { type: 'stretched'; stretch: number };

function elasticSliderReducer(
  state: ElasticSliderState,
  event: ElasticSliderEvent,
): ElasticSliderState {
  switch (event.type) {
    case 'activated':
      return { ...state, active: true };
    case 'released':
      return { active: false, rubberStretch: 0 };
    case 'stretched':
      return { ...state, rubberStretch: event.stretch };
  }
}
