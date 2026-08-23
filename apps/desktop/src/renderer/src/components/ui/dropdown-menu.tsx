import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSurface,
  DropdownMenuTrigger,
  type DropdownMenuSurfaceProps,
} from '@yomitomo/reader-ui/ui-dropdown-menu';
import * as React from 'react';

type DropdownMenuContentProps = Omit<DropdownMenuSurfaceProps, 'baseClassName' | 'positionerStyle'>;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuSurface>,
  DropdownMenuContentProps
>((props, ref) => (
  <DropdownMenuSurface
    align="end"
    baseClassName="ui-popup-content ui-dropdown-content t-dropdown"
    positionerStyle={{ zIndex: 'var(--app-z-popover, 160)' }}
    ref={ref}
    side="bottom"
    sideOffset={6}
    {...props}
  />
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger };
