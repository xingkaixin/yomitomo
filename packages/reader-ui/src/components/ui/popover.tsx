import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import * as React from 'react';
import { composePopupClassName } from './popup-class-name';

export function Popover(props: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root modal={false} {...props} />;
}

type PopoverTriggerProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger> & {
  asChild?: boolean;
};

export const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverTriggerProps>(
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

type PopoverContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup>,
  'style'
> & {
  style?: React.CSSProperties;
} & Pick<
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Positioner>,
    'align' | 'collisionPadding' | 'side' | 'sideOffset'
  >;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Popup>,
  PopoverContentProps
>(
  (
    {
      align = 'center',
      className,
      collisionPadding = 10,
      side = 'bottom',
      sideOffset = 8,
      style,
      ...props
    },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        collisionPadding={collisionPadding}
        side={side}
        sideOffset={sideOffset}
        style={{ zIndex: 'var(--reader-z-popover)' }}
      >
        <PopoverPrimitive.Popup
          className={composePopupClassName(
            'reader-popup-content reader-popover-content t-dropdown',
            className,
          )}
          ref={ref}
          style={{ position: 'static', ...style }}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = 'PopoverContent';
