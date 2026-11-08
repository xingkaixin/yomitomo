import React from 'react';
import { cn } from '../../lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-28 w-full resize-y rounded-xl border px-3 py-2 text-sm border-[color:var(--app-edge)] bg-[image:var(--app-field)] text-[hsl(var(--foreground))] shadow-[var(--app-field-shadow)] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--app-interactive-focus-ring)] disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
