import * as React from 'react';
import { ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '../../lib/utils';

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
  }
>;

type ChartContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof ResponsiveContainer>['children'];
};

export const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ className, children, config, style, ...props }, ref) => {
    const colorVars = Object.entries(config).reduce(
      (vars, [key, value]) => {
        if (value.color) vars[`--color-${key}`] = value.color;
        return vars;
      },
      {} as Record<string, string>,
    );

    return (
      <div
        className={cn(
          'flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke="#fff"]]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none',
          className,
        )}
        ref={ref}
        style={{ ...colorVars, ...style } as React.CSSProperties}
        {...props}
      >
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    );
  },
);
ChartContainer.displayName = 'ChartContainer';

export const ChartTooltip = Tooltip;
