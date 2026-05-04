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

const ChartContext = React.createContext<ChartConfig | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error('useChart must be used within a ChartContainer');
  return context;
}

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
      <ChartContext.Provider value={config}>
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
      </ChartContext.Provider>
    );
  },
);
ChartContainer.displayName = 'ChartContainer';

export const ChartTooltip = Tooltip;

type ChartTooltipContentProps = React.HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    name?: string | number;
    value?: React.ReactNode;
    color?: string;
  }>;
  label?: React.ReactNode;
  hideLabel?: boolean;
  hideIndicator?: boolean;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel,
  hideIndicator,
}: ChartTooltipContentProps) {
  const config = useChart();
  const items = payload?.filter((item) => item.value !== undefined) || [];

  if (!active || items.length === 0) return null;

  return (
    <div
      className={cn(
        'grid min-w-32 gap-2 rounded-lg border border-border/70 bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-xl shadow-[#6d4f251f]',
        className,
      )}
    >
      {hideLabel ? null : <div className="font-bold">{label}</div>}
      <div className="grid gap-1.5">
        {items.map((item) => {
          const key = String(item.dataKey || item.name || '');
          const itemConfig = config[key];
          return (
            <div className="flex items-center gap-2" key={key}>
              {hideIndicator ? null : (
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: item.color || itemConfig?.color }}
                />
              )}
              <span className="text-muted-foreground">{itemConfig?.label || item.name}</span>
              <span className="ml-auto font-mono font-bold tabular-nums">{item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
