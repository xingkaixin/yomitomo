import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { DayPicker, type DayPickerProps } from 'react-day-picker';
import { cn } from '../../lib/utils';
import { buttonVariants } from './button';
import 'react-day-picker/style.css';

export type CalendarProps = DayPickerProps;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      className={cn('calendar-root p-3', className)}
      classNames={{
        root: 'calendar-root',
        month: 'space-y-4',
        months: 'flex flex-col gap-4 sm:flex-row',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-bold',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'absolute left-1 top-0 size-8 rounded-full border-0 bg-transparent p-0 opacity-70 shadow-none hover:bg-accent hover:opacity-100 hover:shadow-none',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'absolute right-1 top-0 size-8 rounded-full border-0 bg-transparent p-0 opacity-70 shadow-none hover:bg-accent hover:opacity-100 hover:shadow-none',
        ),
        weekdays: 'flex',
        weekday: 'w-9 rounded-md text-[0.8rem] font-semibold text-muted-foreground',
        week: 'mt-2 flex w-full',
        day: 'relative size-9 p-0 text-center text-sm',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-9 rounded-md p-0 font-normal aria-selected:opacity-100',
        ),
        range_start: 'day-range-start',
        range_end: 'day-range-end',
        selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        today: 'bg-accent text-accent-foreground',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
      }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}
