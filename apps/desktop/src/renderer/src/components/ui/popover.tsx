import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import * as React from 'react';
import { cn } from '../../lib/utils';

type PopoverTriggerProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger> & {
  asChild?: boolean;
};

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverTriggerProps>(
  ({ asChild, children, ...props }, ref) => (
    <PopoverPrimitive.Trigger
      ref={ref}
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {asChild ? undefined : children}
    </PopoverPrimitive.Trigger>
  ),
);
PopoverTrigger.displayName = 'PopoverTrigger';

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup> &
  Pick<
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Positioner>,
    'align' | 'side' | 'sideOffset'
  >;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Popup>,
  PopoverContentProps
>(({ className, align = 'start', sideOffset = 8, side, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Positioner
      align={align}
      side={side}
      sideOffset={sideOffset}
      style={{ zIndex: 'var(--app-z-popover, 160)' }}
    >
      <PopoverPrimitive.Popup
        className={cn(
          'ui-popover-content z-[var(--app-z-popover)] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none',
          className,
        )}
        ref={ref}
        {...props}
      />
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverContent, PopoverTrigger };
