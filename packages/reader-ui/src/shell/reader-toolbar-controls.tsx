import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowHorizontalIcon,
  CaseSensitiveIcon,
  MinusSignIcon,
  PaintBoardIcon,
} from '@hugeicons/core-free-icons';
import type React from 'react';
import { useId, useReducer } from 'react';
import {
  readerBackgroundOptions,
  readerBackgroundTone,
  readerDistillationColorOptions,
} from '../reader-settings';
import type { ReaderSettings } from '../reader-types';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { ReaderTooltip } from '../shared/reader-component-primitives';

export type ReaderAnnotationLineControl = {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
};

export function ReaderSettingsToolbarControls({
  annotationLine,
  labels = defaultToolbarLabels,
  settings,
  onChange,
}: {
  annotationLine?: ReaderAnnotationLineControl;
  labels?: ReaderToolbarLabels;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
}) {
  return (
    <>
      <ReaderToolbarSliderPopover
        icon={<HugeiconsIcon icon={CaseSensitiveIcon} size={17} />}
        label={labels.fontSize}
        max={28}
        min={16}
        step={1}
        unit="px"
        value={settings.fontSize}
        onChange={(fontSize) => onChange({ ...settings, fontSize })}
      />
      <ReaderToolbarSliderPopover
        icon={<HugeiconsIcon icon={ArrowHorizontalIcon} size={16} />}
        label={labels.articleWidth}
        max={1080}
        min={600}
        step={40}
        unit="px"
        value={settings.contentWidth}
        onChange={(contentWidth) => onChange({ ...settings, contentWidth })}
      />
      <ReaderToolbarAppearancePopover
        annotationLine={annotationLine}
        labels={labels}
        settings={settings}
        onChange={onChange}
      />
    </>
  );
}

export type ReaderToolbarLabels = {
  annotationColor: string;
  appearance: string;
  articleWidth: string;
  distillationColor: string;
  fontSize: string;
  paper: string;
  paperName?: (label: string) => string;
};

const defaultToolbarLabels: ReaderToolbarLabels = {
  annotationColor: '批注划线',
  appearance: '阅读外观',
  articleWidth: '文章宽度',
  distillationColor: '沉淀划线',
  fontSize: '字号',
  paper: '纸张',
};

export function ReaderToolbarAppearancePopover({
  annotationLine,
  labels = defaultToolbarLabels,
  showPaper = true,
  settings,
  onChange,
}: {
  annotationLine?: ReaderAnnotationLineControl;
  labels?: ReaderToolbarLabels;
  showPaper?: boolean;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
}) {
  const [open, dispatch] = useReducer(sliderPopoverReducer, false);
  const popoverId = useId();
  const tone = readerBackgroundTone(settings.backgroundColor);
  const paperName = labels.paperName ?? ((label: string) => label);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => dispatch({ type: 'openChanged', open: nextOpen })}
    >
      <ReaderTooltip content={labels.appearance} side="bottom">
        <PopoverTrigger asChild>
          <button
            aria-controls={popoverId}
            aria-expanded={open}
            aria-label={labels.appearance}
            className={open ? 'reader-icon-button is-active' : 'reader-icon-button'}
            type="button"
          >
            <HugeiconsIcon icon={PaintBoardIcon} size={16} />
          </button>
        </PopoverTrigger>
      </ReaderTooltip>
      <PopoverContent className="reader-toolbar-popover reader-appearance-popover" id={popoverId}>
        {showPaper ? (
          <div className="reader-appearance-section">
            <span className="reader-appearance-label">{labels.paper}</span>
            <div className="reader-appearance-swatches" role="radiogroup" aria-label={labels.paper}>
              {readerBackgroundOptions
                .filter((paper) => paper.tone === tone)
                .map((paper) => (
                  <button
                    aria-checked={settings.backgroundColor === paper.value}
                    aria-label={paperName(paper.label)}
                    className="reader-appearance-paper"
                    key={paper.value}
                    role="radio"
                    style={{ background: paper.value, color: paper.ink }}
                    type="button"
                    onClick={() => onChange({ ...settings, backgroundColor: paper.value })}
                  >
                    文
                  </button>
                ))}
            </div>
          </div>
        ) : null}
        {annotationLine ? (
          <ReaderLineColorSection
            colors={annotationLine.colors}
            label={labels.annotationColor}
            value={annotationLine.value}
            onChange={annotationLine.onChange}
          />
        ) : null}
        <ReaderLineColorSection
          colors={readerDistillationColorOptions}
          label={labels.distillationColor}
          value={settings.distillationColor}
          onChange={(distillationColor) => onChange({ ...settings, distillationColor })}
        />
      </PopoverContent>
    </Popover>
  );
}

function ReaderLineColorSection({
  colors,
  label,
  value,
  onChange,
}: {
  colors: readonly string[];
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="reader-appearance-section">
      <span className="reader-appearance-label">{label}</span>
      <div className="reader-appearance-swatches" role="radiogroup" aria-label={label}>
        {colors.map((color, index) => (
          <button
            aria-checked={value === color}
            aria-label={`${label} ${index + 1}`}
            className="reader-appearance-line"
            key={color}
            role="radio"
            style={{ '--reader-swatch': color } as React.CSSProperties}
            type="button"
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
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
  const [open, dispatch] = useReducer(sliderPopoverReducer, false);
  const popoverId = useId();
  const percent = ((value - min) / Math.max(1, max - min)) * 100;
  const formattedValue = `${Math.round(value)}${unit}`;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => dispatch({ type: 'openChanged', open: nextOpen })}
    >
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
            <HugeiconsIcon icon={MinusSignIcon} size={16} />
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
            <HugeiconsIcon icon={Add01Icon} size={16} />
          </button>
          <strong>{formattedValue}</strong>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type SliderPopoverEvent = { type: 'openChanged'; open: boolean };

function sliderPopoverReducer(_open: boolean, event: SliderPopoverEvent) {
  return event.open;
}
