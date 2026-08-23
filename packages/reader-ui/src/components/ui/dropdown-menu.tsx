import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import * as React from 'react';
import { composePopupClassName } from './popup-class-name';

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

export type DropdownMenuSurfaceProps = Omit<
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Popup>,
  'style'
> & {
  baseClassName: string;
  positionerStyle?: React.CSSProperties;
  style?: React.CSSProperties;
} & Pick<
    React.ComponentPropsWithoutRef<typeof MenuPrimitive.Positioner>,
    'align' | 'side' | 'sideOffset'
  >;

export const DropdownMenuSurface = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Popup>,
  DropdownMenuSurfaceProps
>(
  (
    { align, baseClassName, className, positionerStyle, side, sideOffset, style, ...props },
    ref,
  ) => (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        style={positionerStyle}
      >
        <MenuPrimitive.Popup
          className={composePopupClassName(baseClassName, className)}
          ref={ref}
          style={{ position: 'static', ...style }}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  ),
);
DropdownMenuSurface.displayName = 'DropdownMenuSurface';

type DropdownMenuContentProps = Omit<DropdownMenuSurfaceProps, 'baseClassName' | 'positionerStyle'>;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuSurface>,
  DropdownMenuContentProps
>((props, ref) => (
  <DropdownMenuSurface
    align="end"
    baseClassName="reader-popup-content reader-dropdown-content t-dropdown"
    positionerStyle={{ zIndex: 'var(--reader-z-popover, var(--app-z-popover, 160))' }}
    ref={ref}
    side="bottom"
    sideOffset={6}
    {...props}
  />
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
