import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, Tick01Icon } from '@hugeicons/core-free-icons';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import React from 'react';
import { cn } from '../../lib/utils';
import { composePopupClassName } from './popup-class-name';

type SelectProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.Root<string>>,
  'onValueChange'
> & {
  onValueChange?: (value: string) => void;
};

function Select({ onValueChange, ...props }: SelectProps) {
  const handleValueChange = React.useCallback(
    (value: string | null) => {
      if (value !== null) {
        onValueChange?.(value);
      }
    },
    [onValueChange],
  );

  return <SelectPrimitive.Root {...props} onValueChange={handleValueChange} />;
}

const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    data-slot="select-trigger"
    className={cn(
      'flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm border-[color:var(--app-edge)] bg-[image:var(--app-field)] text-[hsl(var(--foreground))] shadow-[var(--app-field-shadow)] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--app-interactive-focus-ring)] disabled:cursor-not-allowed disabled:opacity-55 [&>span]:line-clamp-1',
      className,
    )}
    ref={ref}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon>
      <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 opacity-60" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

type SelectContentProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Popup> &
  Pick<
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Positioner>,
    'align' | 'side' | 'sideOffset'
  > & {
    position?: 'popper' | 'item-aligned';
  };

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Popup>,
  SelectContentProps
>(
  (
    { className, children, position = 'popper', align = 'start', sideOffset = 4, side, ...props },
    ref,
  ) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={position !== 'popper'}
        className="z-[var(--app-z-tooltip)]"
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={composePopupClassName(
            'ui-popup-content ui-select-content t-dropdown relative max-h-96 min-w-[var(--anchor-width)] overflow-hidden rounded-xl border border-[color:var(--app-edge)] bg-[image:var(--app-card-surface)] text-[hsl(var(--foreground))] shadow-[var(--app-float-shadow)]',
            className,
          )}
          ref={ref}
          {...props}
        >
          <SelectPrimitive.List
            className={cn(
              'ui-select-scroll-area max-h-[min(22rem,calc(var(--available-height)-1rem))] overflow-y-auto p-1',
              position === 'popper' && 'w-full min-w-[var(--anchor-width)]',
            )}
          >
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  ),
);
SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    className={cn(
      'relative flex w-full cursor-default select-none items-center gap-2 rounded-lg py-2 pr-8 pl-3 text-sm outline-none transition-colors data-[highlighted]:bg-[var(--app-interactive-hover-bg)] data-[disabled]:pointer-events-none data-[disabled]:opacity-55',
      className,
    )}
    ref={ref}
    {...props}
  >
    <span className="absolute right-2 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <HugeiconsIcon icon={Tick01Icon} className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

export { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue };
