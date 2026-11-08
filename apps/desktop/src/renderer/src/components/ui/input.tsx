import React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      data-slot="input"
      className={cn(
        'flex h-11 w-full rounded-xl border px-3 py-2 text-sm border-[color:var(--app-edge)] bg-[image:var(--app-field)] text-[hsl(var(--foreground))] shadow-[var(--app-field-shadow)] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--app-interactive-focus-ring)] file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
