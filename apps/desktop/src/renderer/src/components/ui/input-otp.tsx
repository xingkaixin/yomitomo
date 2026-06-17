import * as React from 'react';
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from 'input-otp';
import { Dot } from 'lucide-react';
import { cn } from '../../lib/utils';

export const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput>
>(({ className, containerClassName, ...props }, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={cn('input-otp', containerClassName)}
    className={cn('input-otp-native', className)}
    pattern={REGEXP_ONLY_DIGITS}
    {...props}
  />
));
InputOTP.displayName = 'InputOTP';

export function InputOTPGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('input-otp-group', className)} {...props} />;
}

export function InputOTPSlot({
  index,
  className,
  masked = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { index: number; masked?: boolean }) {
  const inputContext = React.useContext(OTPInputContext);
  const slot = inputContext.slots[index];
  const visibleChar = slot?.char ? (masked ? '•' : slot.char) : '';

  return (
    <div
      className={cn(
        'input-otp-slot',
        slot?.isActive && 'is-active',
        slot?.hasFakeCaret && 'has-caret',
        className,
      )}
      {...props}
    >
      {visibleChar}
      {slot?.hasFakeCaret ? <span className="input-otp-caret" /> : null}
    </div>
  );
}

export function InputOTPSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('input-otp-separator', className)} role="separator" {...props}>
      <Dot aria-hidden="true" size={18} />
    </div>
  );
}
