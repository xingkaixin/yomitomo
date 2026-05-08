import * as React from 'react';

export type KbdProps = React.HTMLAttributes<HTMLElement>;

export const Kbd = React.forwardRef<HTMLElement, KbdProps>(({ className, ...props }, ref) => (
  <kbd
    className={[
      'pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    ref={ref}
    {...props}
  />
));
Kbd.displayName = 'Kbd';
