import type React from 'react';
import { CaseSensitive, Maximize2, Minus, Plus } from 'lucide-react';
import type { ReaderSettings } from '../reader-types';

export function ReaderSettingsPanel({
  labels = { articleWidth: '文章宽度', fontSize: '字号' },
  panelProps,
  settings,
  onChange,
}: {
  labels?: { articleWidth: string; fontSize: string };
  panelProps?: React.HTMLAttributes<HTMLDivElement>;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
}) {
  return (
    <div className="reader-settings-panel" {...panelProps}>
      <SettingStepper
        icon={<CaseSensitive size={17} />}
        label={labels.fontSize}
        value={`${settings.fontSize}px`}
        onDecrease={() => onChange({ ...settings, fontSize: Math.max(16, settings.fontSize - 1) })}
        onIncrease={() => onChange({ ...settings, fontSize: Math.min(28, settings.fontSize + 1) })}
      />
      <SettingStepper
        icon={<Maximize2 size={16} />}
        label={labels.articleWidth}
        value={`${settings.contentWidth}px`}
        onDecrease={() =>
          onChange({ ...settings, contentWidth: Math.max(600, settings.contentWidth - 40) })
        }
        onIncrease={() =>
          onChange({ ...settings, contentWidth: Math.min(1080, settings.contentWidth + 40) })
        }
      />
    </div>
  );
}

function SettingStepper({
  icon,
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="reader-setting-row">
      <div className="reader-setting-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="reader-stepper">
        <button type="button" onClick={onDecrease} aria-label={`减少${label}`}>
          <Minus size={14} />
        </button>
        <strong>{value}</strong>
        <button type="button" onClick={onIncrease} aria-label={`增加${label}`}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
