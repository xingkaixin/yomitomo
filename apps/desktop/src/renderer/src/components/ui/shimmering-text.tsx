import * as React from 'react';

import { cn } from '../../lib/utils';

type ShimmeringTextStyle = React.CSSProperties & {
  '--shimmer-dur'?: string;
};

export type ShimmeringTextProps = Omit<React.ComponentPropsWithoutRef<'span'>, 'children'> & {
  text: string;
  duration?: number;
  isStopped?: boolean;
};

export function ShimmeringText({
  text,
  duration = 1,
  isStopped = false,
  className,
  style,
  ...props
}: ShimmeringTextProps) {
  const shimmerStyle: ShimmeringTextStyle = {
    ...style,
    '--shimmer-dur': `${duration}s`,
  };

  return (
    <span
      {...props}
      className={cn('shimmering-text', className)}
      data-shimmer={isStopped ? 'paused' : 'running'}
      data-text={text}
      style={shimmerStyle}
    >
      {text}
    </span>
  );
}
