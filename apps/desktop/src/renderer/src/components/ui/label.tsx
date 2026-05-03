import * as React from 'react';
import { cn } from '../../lib/utils';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      className={cn(
        'text-xs font-bold uppercase tracking-normal text-muted-foreground',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Label.displayName = 'Label';
