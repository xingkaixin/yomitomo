import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import * as React from 'react';

export function DropdownMenu(props: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root modal={false} {...props} />;
}

type DropdownMenuTriggerProps = React.ComponentPropsWithoutRef<typeof MenuPrimitive.Trigger> & {
  asChild?: boolean;
};

export const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, DropdownMenuTriggerProps>(
  ({ asChild, children, ...props }, ref) => (
    <MenuPrimitive.Trigger
      ref={ref}
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {asChild ? undefined : children}
    </MenuPrimitive.Trigger>
  ),
);
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

type DropdownMenuContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Popup>,
  'style'
> & {
  style?: React.CSSProperties;
} & Pick<
    React.ComponentPropsWithoutRef<typeof MenuPrimitive.Positioner>,
    'align' | 'side' | 'sideOffset'
  >;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Popup>,
  DropdownMenuContentProps
>(({ align = 'end', className, side = 'bottom', sideOffset = 6, style, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Positioner
      align={align}
      side={side}
      sideOffset={sideOffset}
      style={{ zIndex: 'var(--reader-z-popover, var(--app-z-popover, 160))' }}
    >
      <MenuPrimitive.Popup
        className={className}
        ref={ref}
        style={{ position: 'static', ...style }}
        {...props}
      />
    </MenuPrimitive.Positioner>
  </MenuPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

type DropdownMenuItemProps = React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & {
  asChild?: boolean;
};

export const DropdownMenuItem = React.forwardRef<HTMLElement, DropdownMenuItemProps>(
  ({ asChild, children, nativeButton, ...props }, ref) => (
    <MenuPrimitive.Item
      nativeButton={asChild ? true : nativeButton}
      ref={ref}
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {asChild ? undefined : children}
    </MenuPrimitive.Item>
  ),
);
DropdownMenuItem.displayName = 'DropdownMenuItem';
