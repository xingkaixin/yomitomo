import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import { cn } from '../../lib/utils';

export type ShimmeringTextProps = Omit<React.ComponentProps<typeof motion.span>, 'children'> & {
  text: string;
  duration?: number;
  isStopped?: boolean;
};

export function ShimmeringText({
  text,
  duration = 1,
  isStopped = false,
  className,
  ...props
}: ShimmeringTextProps) {
  const createCharVariants = React.useCallback(
    (charIndex: number): Variants => ({
      running: {
        color: ['var(--color)', 'var(--shimmering-color)', 'var(--color)'],
        transition: {
          delay: (charIndex * duration) / text.length,
          duration,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatDelay: text.length * 0.05,
          repeatType: 'loop',
        },
      },
      stopped: {
        color: 'var(--color)',
        transition: {
          duration: duration * 0.5,
          ease: 'easeOut',
        },
      },
    }),
    [duration, text.length],
  );

  return (
    <motion.span className={cn('shimmering-text', className)} {...props}>
      {text.split('').map((char, index) => (
        <motion.span
          aria-hidden="true"
          className="shimmering-text-char"
          initial="stopped"
          animate={isStopped ? 'stopped' : 'running'}
          variants={createCharVariants(index)}
          key={`${char}-${index}`}
        >
          {char}
        </motion.span>
      ))}
      <span className="sr-only">{text}</span>
    </motion.span>
  );
}
