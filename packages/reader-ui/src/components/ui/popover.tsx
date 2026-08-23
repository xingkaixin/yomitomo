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

export type PopoverSurfaceProps = Omit<
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup>,
  'style'
> & {
  baseClassName: string;
  baseStyle?: React.CSSProperties;
  positionerStyle?: React.CSSProperties;
  style?: React.CSSProperties;
} & Pick<
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Positioner>,
    'align' | 'collisionPadding' | 'side' | 'sideOffset'
  >;

export const PopoverSurface = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Popup>,
  PopoverSurfaceProps
>(
  (
    {
      align,
      baseClassName,
      baseStyle,
      className,
      collisionPadding,
      positionerStyle,
      side,
      sideOffset,
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
        style={positionerStyle}
      >
        <PopoverPrimitive.Popup
          className={composePopupClassName(baseClassName, className)}
          ref={ref}
          style={baseStyle || style ? { ...baseStyle, ...style } : undefined}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  ),
);
PopoverSurface.displayName = 'PopoverSurface';

type PopoverContentProps = Omit<
  PopoverSurfaceProps,
  'baseClassName' | 'baseStyle' | 'positionerStyle'
>;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverSurface>,
  PopoverContentProps
>((props, ref) => (
  <PopoverSurface
    align="center"
    baseClassName="reader-popup-content reader-popover-content t-dropdown"
    baseStyle={{ position: 'static' }}
    collisionPadding={10}
    positionerStyle={{ zIndex: 'var(--reader-z-popover)' }}
    ref={ref}
    side="bottom"
    sideOffset={8}
    {...props}
  />
));
PopoverContent.displayName = 'PopoverContent';
