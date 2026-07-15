import type { ReactNode } from 'react';

export function SettingsNavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={active ? 'settings-nav-item is-active' : 'settings-nav-item'}
      type="button"
      onClick={onClick}
    >
      {icon ? icon : null}
      <span>{label}</span>
    </button>
  );
}
