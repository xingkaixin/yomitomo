import { HugeiconsIcon } from '@hugeicons/react';
import { ComputerIcon, Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import type { ThemePreference } from '@yomitomo/shared';
import { SegmentedControl } from '../components/ui/segmented-control';

const themeIcons = {
  system: ComputerIcon,
  light: Sun03Icon,
  dark: Moon02Icon,
} as const satisfies Record<ThemePreference, unknown>;

export function ThemeSelector({
  themePreference,
  onSelectThemePreference,
}: {
  themePreference: ThemePreference;
  onSelectThemePreference: (preference: ThemePreference) => void;
}) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      aria-label={t('theme.title')}
      className="app-nav-theme-switch"
      options={(Object.keys(themeIcons) as ThemePreference[]).map((preference) => ({
        value: preference,
        ariaLabel: t(`theme.${preference}`),
        label: <HugeiconsIcon icon={themeIcons[preference]} aria-hidden="true" size={15} />,
      }))}
      value={themePreference}
      onValueChange={(preference) => {
        if (preference === themePreference) return;
        onSelectThemePreference(preference);
      }}
    />
  );
}
