import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import * as React from 'react';

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

type DialogTriggerProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger> & {
  asChild?: boolean;
};

const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ asChild, children, ...props }, ref) => (
    <DialogPrimitive.Trigger
      ref={ref}
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Trigger>
  ),
);
DialogTrigger.displayName = 'DialogTrigger';

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Backdrop>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop className={className} ref={ref} {...props} />
));
DialogOverlay.displayName = 'DialogOverlay';

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Popup className={className} ref={ref} {...props} />
));
DialogContent.displayName = 'DialogContent';

type DialogCloseProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close> & {
  asChild?: boolean;
};

const DialogClose = React.forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ asChild, children, ...props }, ref) => (
    <DialogPrimitive.Close
      ref={ref}
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Close>
  ),
);
DialogClose.displayName = 'DialogClose';

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
