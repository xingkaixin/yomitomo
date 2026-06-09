import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="color-swatches">
      {colors.map((color) => (
        <button
          className={value === color ? 'color-swatch is-active' : 'color-swatch'}
          key={color}
          style={{ backgroundColor: color }}
          type="button"
          aria-pressed={value === color}
          aria-label={t('settings.profile.chooseColor', { color })}
          onClick={() => onChange(color)}
        >
          {value === color ? <Check size={15} /> : null}
        </button>
      ))}
    </div>
  );
}
