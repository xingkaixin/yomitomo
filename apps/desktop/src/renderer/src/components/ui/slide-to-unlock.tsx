import * as React from 'react';
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion';

import { cn } from '../../lib/utils';

type SlideToUnlockContextValue = {
  x: MotionValue<number>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  handleRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  handleWidth: number;
  textOpacity: MotionValue<number>;
  onDragStart: () => void;
  onDragEnd: () => void;
};

const SlideToUnlockContext = React.createContext<SlideToUnlockContextValue | null>(null);

function useSlideToUnlock() {
  const context = React.useContext(SlideToUnlockContext);
  if (!context) {
    throw new Error('SlideToUnlock components must be used within SlideToUnlock');
  }
  return context;
}

export type SlideToUnlockRootProps = React.ComponentProps<'div'> & {
  handleWidth?: number;
  onUnlock?: () => void;
};

export function SlideToUnlock({
  className,
  handleWidth = 56,
  children,
  onUnlock,
  ...props
}: SlideToUnlockRootProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const handleRef = React.useRef<HTMLDivElement>(null);
  const unlockedRef = React.useRef(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const x = useMotionValue(0);
  const textOpacity = useTransform(x, [0, handleWidth], [1, 0]);

  const handleDragStart = React.useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = React.useCallback(() => {
    setIsDragging(false);

    const track = trackRef.current;
    const handle = handleRef.current;
    const trackWidth = track?.offsetWidth ?? 0;
    const maxX = Math.max(0, trackWidth - handleWidth);

    if (maxX > 0 && handleIsAtTrackEnd(track, handle)) {
      if (!unlockedRef.current) {
        unlockedRef.current = true;
        void animate(x, x.get(), { bounce: 0, duration: 0.16, type: 'spring' }).then(() =>
          onUnlock?.(),
        );
      }
      return;
    }

    void animate(x, 0, { bounce: 0, duration: 0.25, type: 'spring' });
  }, [handleWidth, onUnlock, x]);

  return (
    <SlideToUnlockContext.Provider
      value={{
        handleWidth,
        handleRef,
        isDragging,
        onDragEnd: handleDragEnd,
        onDragStart: handleDragStart,
        textOpacity,
        trackRef,
        x,
      }}
    >
      <div className={cn('slide-to-unlock', className)} data-slot="slide-to-unlock" {...props}>
        {children}
      </div>
    </SlideToUnlockContext.Provider>
  );
}

export type SlideToUnlockTrackProps = React.ComponentProps<'div'>;

export function SlideToUnlockTrack({ className, children, ...props }: SlideToUnlockTrackProps) {
  const { trackRef } = useSlideToUnlock();

  return (
    <div
      ref={trackRef}
      className={cn('slide-to-unlock-track', className)}
      data-slot="track"
      {...props}
    >
      {children}
    </div>
  );
}

export type SlideToUnlockTextProps = Omit<
  React.ComponentPropsWithoutRef<typeof motion.div>,
  'children'
> & {
  children: React.JSX.Element | ((props: { isDragging: boolean }) => React.JSX.Element);
};

export function SlideToUnlockText({
  className,
  children,
  style,
  ...props
}: SlideToUnlockTextProps) {
  const { handleWidth, isDragging, textOpacity } = useSlideToUnlock();

  return (
    <motion.div
      className={cn('slide-to-unlock-text', className)}
      data-dragging={isDragging || undefined}
      data-slot="text"
      style={{ marginLeft: handleWidth, opacity: textOpacity, ...style }}
      {...props}
    >
      {typeof children === 'function' ? children({ isDragging }) : children}
    </motion.div>
  );
}

export type SlideToUnlockHandleProps = React.ComponentPropsWithoutRef<typeof motion.div>;

export function SlideToUnlockHandle({
  className,
  children,
  style,
  ...props
}: SlideToUnlockHandleProps) {
  const { handleRef, handleWidth, onDragEnd, onDragStart, trackRef, x } = useSlideToUnlock();

  return (
    <motion.div
      ref={handleRef}
      className={cn('slide-to-unlock-handle', className)}
      data-slot="handle"
      drag="x"
      dragConstraints={trackRef}
      dragElastic={0}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      role="button"
      style={{ width: handleWidth, x, ...style }}
      tabIndex={0}
      {...props}
    >
      {children ?? (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M24 12 12.75 3v4.696H0v8.608h12.75V21z" fill="currentColor" />
        </svg>
      )}
    </motion.div>
  );
}

function handleIsAtTrackEnd(track: HTMLDivElement | null, handle: HTMLDivElement | null) {
  if (!track || !handle) return false;
  const trackRect = track.getBoundingClientRect();
  const handleRect = handle.getBoundingClientRect();
  return handleRect.right >= trackRect.right - 5;
}
