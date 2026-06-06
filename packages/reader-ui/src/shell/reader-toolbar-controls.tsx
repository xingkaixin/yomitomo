import type React from 'react';
import { CaseSensitive, Minus, MoveHorizontal, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReaderSettings } from '../reader-types';
import { ReaderTooltip } from '../shared/reader-component-primitives';

export function ReaderSettingsToolbarControls({
  settings,
  onChange,
}: {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
}) {
  return (
    <>
      <ReaderToolbarSliderPopover
        icon={<CaseSensitive size={17} />}
        label="字号"
        max={28}
        min={16}
        step={1}
        unit="px"
        value={settings.fontSize}
        onChange={(fontSize) => onChange({ ...settings, fontSize })}
      />
      <ReaderToolbarSliderPopover
        icon={<MoveHorizontal size={16} />}
        label="文章宽度"
        max={1080}
        min={600}
        step={40}
        unit="px"
        value={settings.contentWidth}
        onChange={(contentWidth) => onChange({ ...settings, contentWidth })}
      />
    </>
  );
}

export function ReaderToolbarSliderPopover({
  icon,
  label,
  max,
  min,
  step,
  unit = '',
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  max: number;
  min: number;
  step: number;
  unit?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const controlRef = useRef<HTMLDivElement | null>(null);
  const percent = ((value - min) / Math.max(1, max - min)) * 100;
  const formattedValue = `${Math.round(value)}${unit}`;

  useEffect(() => {
    if (!open) return;

    const closeOtherPopover = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id !== popoverId) setOpen(false);
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && controlRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && controlRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('reader-toolbar-popover-open', closeOtherPopover);
    window.addEventListener('pointerdown', closeOnPointerDown, true);
    window.addEventListener('focusin', closeOnFocusIn, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('reader-toolbar-popover-open', closeOtherPopover);
      window.removeEventListener('pointerdown', closeOnPointerDown, true);
      window.removeEventListener('focusin', closeOnFocusIn, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, popoverId]);

  const toggleOpen = () => {
    setOpen((current) => {
      const nextOpen = !current;
      if (nextOpen) {
        window.dispatchEvent(
          new CustomEvent('reader-toolbar-popover-open', { detail: { id: popoverId } }),
        );
      }
      return nextOpen;
    });
  };

  return (
    <div className="reader-toolbar-popover-control" ref={controlRef}>
      <ReaderTooltip content={label} side="bottom">
        <button
          aria-controls={popoverId}
          aria-expanded={open}
          aria-label={label}
          className={open ? 'reader-icon-button is-active' : 'reader-icon-button'}
          type="button"
          onClick={toggleOpen}
        >
          {icon}
        </button>
      </ReaderTooltip>
      {open ? (
        <div className="reader-toolbar-popover" id={popoverId}>
          <div className="reader-toolbar-popover-slider-row">
            <button
              aria-label={`减少${label}`}
              className="reader-toolbar-popover-step"
              type="button"
              onClick={() => onChange(Math.max(min, value - step))}
            >
              <Minus size={16} />
            </button>
            <input
              aria-label={label}
              className="reader-toolbar-popover-slider"
              max={max}
              min={min}
              step={step}
              style={{ '--reader-toolbar-slider-percent': `${percent}%` } as React.CSSProperties}
              type="range"
              value={value}
              onChange={(event) => onChange(Number(event.currentTarget.value))}
            />
            <button
              aria-label={`增加${label}`}
              className="reader-toolbar-popover-step"
              type="button"
              onClick={() => onChange(Math.min(max, value + step))}
            >
              <Plus size={16} />
            </button>
            <strong>{formattedValue}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}
