import {
  Popover,
  PopoverSurface,
  PopoverTrigger,
  type PopoverSurfaceProps,
} from '@yomitomo/reader-ui/ui-popover';
import React from 'react';

type PopoverContentProps = Omit<
  PopoverSurfaceProps,
  'baseClassName' | 'baseStyle' | 'positionerStyle'
>;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverSurface>,
  PopoverContentProps
>((props, ref) => (
  <PopoverSurface
    align="start"
    baseClassName="ui-popup-content ui-popover-content t-dropdown z-[var(--app-z-popover)] rounded-xl border border-[color:var(--app-edge)] bg-[image:var(--app-card-surface)] text-[hsl(var(--foreground))] shadow-[var(--app-float-shadow)] p-4 outline-none"
    positionerStyle={{ zIndex: 'var(--app-z-popover, 160)' }}
    ref={ref}
    sideOffset={8}
    {...props}
  />
));
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverContent, PopoverTrigger };
