import type React from 'react';
import { CaseSensitive, Minus, MoveHorizontal, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReaderSettings } from '../reader-types';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { ReaderTooltip } from '../shared/reader-component-primitives';

export function ReaderSettingsToolbarControls({
  labels = { articleWidth: '文章宽度', fontSize: '字号' },
  settings,
  onChange,
}: {
  labels?: { articleWidth: string; fontSize: string };
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
}) {
  return (
    <>
      <ReaderToolbarSliderPopover
        icon={<CaseSensitive size={17} />}
        label={labels.fontSize}
        max={28}
        min={16}
        step={1}
        unit="px"
        value={settings.fontSize}
        onChange={(fontSize) => onChange({ ...settings, fontSize })}
      />
      <ReaderToolbarSliderPopover
        icon={<MoveHorizontal size={16} />}
        label={labels.articleWidth}
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
  const percent = ((value - min) / Math.max(1, max - min)) * 100;
  const formattedValue = `${Math.round(value)}${unit}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ReaderTooltip content={label} side="bottom">
        <PopoverTrigger asChild>
          <button
            aria-controls={popoverId}
            aria-expanded={open}
            aria-label={label}
            className={open ? 'reader-icon-button is-active' : 'reader-icon-button'}
            type="button"
          >
            {icon}
          </button>
        </PopoverTrigger>
      </ReaderTooltip>
      <PopoverContent className="reader-toolbar-popover" id={popoverId}>
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
      </PopoverContent>
    </Popover>
  );
}
