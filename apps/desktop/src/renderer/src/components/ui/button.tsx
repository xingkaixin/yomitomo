import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const raisedSurface =
  'border-[color:var(--app-edge)] bg-[image:var(--app-raised)] text-[hsl(var(--foreground))] shadow-[var(--app-raised-shadow)]';

export const buttonVariants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full border text-sm font-medium transition-[transform,filter,box-shadow,background-color,color] duration-[120ms] ease-out motion-reduce:transition-none motion-reduce:active:translate-y-0 hover:brightness-[0.98] active:translate-y-px active:shadow-[var(--app-well-shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--app-interactive-focus-ring)] disabled:pointer-events-none disabled:opacity-55',
  {
    variants: {
      variant: {
        default:
          'border-[color:var(--app-ink-edge)] bg-[image:var(--app-ink)] text-[color:var(--app-ink-fg)] shadow-[var(--app-ink-shadow)]',
        secondary: raisedSurface,
        outline: raisedSurface,
        destructive:
          'border-[color:var(--app-action-danger-border)] bg-[var(--app-action-danger-bg)] text-[color:var(--app-action-danger-fg)] shadow-[var(--app-ink-shadow)]',
        ghost:
          'border-transparent bg-transparent text-[hsl(var(--muted-foreground))] shadow-none hover:bg-[var(--app-interactive-hover-bg)] hover:text-[hsl(var(--foreground))] hover:brightness-100 active:shadow-none',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      data-variant={variant ?? 'default'}
      ref={ref}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
