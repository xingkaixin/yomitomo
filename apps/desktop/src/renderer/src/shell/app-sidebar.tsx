import { HugeiconsIcon } from '@hugeicons/react';
import { SidebarLeftIcon } from '@hugeicons/core-free-icons';
import { useReducer, type TransitionEvent } from 'react';
import { useTranslation } from 'react-i18next';

type SidebarState = { collapsed: boolean; sliding: boolean };
type SidebarEvent = { type: 'toggled' } | { type: 'slideEnded' };

function sidebarReducer(state: SidebarState, event: SidebarEvent): SidebarState {
  switch (event.type) {
    case 'toggled':
      return { collapsed: !state.collapsed, sliding: true };
    case 'slideEnded':
      return state.sliding ? { ...state, sliding: false } : state;
  }
}

export function useAppSidebar() {
  const [state, dispatch] = useReducer(sidebarReducer, { collapsed: false, sliding: false });
  return {
    className: [
      state.collapsed ? 'is-sidebar-collapsed' : '',
      // Only user toggles slide; opening or closing the reader swaps the layout at once.
      state.sliding ? 'is-sidebar-sliding' : '',
    ],
    collapsed: state.collapsed,
    toggle: () => dispatch({ type: 'toggled' }),
    onContentTransitionEnd: (event: TransitionEvent<HTMLElement>) => {
      if (event.target === event.currentTarget && event.propertyName === 'margin-left') {
        dispatch({ type: 'slideEnded' });
      }
    },
  };
}

export function AppSidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      aria-expanded={!collapsed}
      aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
      className="app-sidebar-toggle"
      type="button"
      onClick={onToggle}
    >
      <HugeiconsIcon icon={SidebarLeftIcon} aria-hidden="true" size={18} />
    </button>
  );
}
