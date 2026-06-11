import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';

type TooltipProviderProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider> & {
  delayDuration?: number;
  skipDelayDuration?: number;
};

export function TooltipProvider({
  delayDuration,
  skipDelayDuration,
  delay = delayDuration,
  timeout = skipDelayDuration,
  ...props
}: TooltipProviderProps) {
  return <TooltipPrimitive.Provider delay={delay} timeout={timeout} {...props} />;
}

export const Tooltip = TooltipPrimitive.Root;

type TooltipTriggerProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger> & {
  asChild?: boolean;
};

export const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipTriggerProps>(
  ({ asChild, children, ...props }, ref) => (
    <TooltipPrimitive.Trigger
      ref={ref}
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {asChild ? undefined : children}
    </TooltipPrimitive.Trigger>
  ),
);
TooltipTrigger.displayName = 'TooltipTrigger';

export type TooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Popup> &
  Pick<
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Positioner>,
    'align' | 'collisionPadding' | 'side' | 'sideOffset'
  >;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Popup>,
  TooltipContentProps
>(({ align, className, side, sideOffset = 7, collisionPadding = 10, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Positioner
      align={align}
      collisionPadding={collisionPadding}
      side={side}
      sideOffset={sideOffset}
    >
      <TooltipPrimitive.Popup
        className={['reader-tooltip-content', className].filter(Boolean).join(' ')}
        ref={ref}
        render={(popupProps, state) => (
          <div
            {...popupProps}
            data-state={state.open ? (state.instant ? 'instant-open' : 'delayed-open') : 'closed'}
          />
        )}
        {...props}
      />
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = 'TooltipContent';
