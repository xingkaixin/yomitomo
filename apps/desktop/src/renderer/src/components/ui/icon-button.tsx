import * as React from 'react';
import { cn } from '../../lib/utils';

export type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  'aria-label': string;
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, type = 'button', ...props }, ref) => (
    <button className={cn(className)} ref={ref} type={type} {...props} />
  ),
);
IconButton.displayName = 'IconButton';
