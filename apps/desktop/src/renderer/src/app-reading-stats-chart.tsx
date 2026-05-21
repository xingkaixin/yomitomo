import React, { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  XAxis,
  YAxis,
  type CurveProps,
} from 'recharts';
import type { ReadingActivityDay } from '@yomitomo/core';
import { ChartContainer, ChartTooltip, type ChartConfig } from './components/ui/chart';
import { chartActivityDescription } from './app-reading-stats-data';

const chartConfig = {
  articles: {
    label: '文章',
    color: 'var(--chart-3)',
  },
  annotations: {
    label: '批注',
    color: 'var(--chart-1)',
  },
  comments: {
    label: '讨论',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig;

type ChartActivityDay = Omit<ReadingActivityDay, 'articles' | 'annotations' | 'comments'> & {
  articles: number | null;
  annotations: number | null;
  comments: number | null;
  recordStatus: 'unstarted' | 'recording';
};

type ChartMode = 'recorded' | 'window';

type ChartTooltipPayload = {
  dataKey?: string | number;
  name?: string | number;
  value?: React.ReactNode;
  color?: string;
  payload?: ChartActivityDay;
};

type InkPoint = {
  x: number;
  y: number;
};

export function ReadingStatsChart({
  activityDays,
  activityStartDate,
  onReady,
  recordedDays,
}: {
  activityDays: ReadingActivityDay[];
  activityStartDate: string;
  onReady: () => void;
  recordedDays: number;
}) {
  const [chartMode, setChartMode] = useState<ChartMode>('recorded');
  const fullChartData = buildChartData(activityDays.slice(-21), activityStartDate);
  const chartRecordedDays = fullChartData.reduce(
    (count, day) => (day.recordStatus === 'recording' ? count + 1 : count),
    0,
  );
  const effectiveChartMode = chartRecordedDays >= 21 ? 'window' : chartMode;
  const chartData =
    effectiveChartMode === 'recorded'
      ? fullChartData.filter((day) => day.recordStatus === 'recording')
      : fullChartData;
  const chartUnstartedRange =
    effectiveChartMode === 'window' ? unstartedChartRange(fullChartData) : null;
  const chartTitle = chartRecordedDays >= 21 ? '近 21 天活动' : '伴读活动趋势';

  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <div className="stats-chart-card">
      <div className="stats-section-heading">
        <h3>{chartTitle}</h3>
        <p>{chartActivityDescription(recordedDays)}</p>
      </div>
      <div className="stats-chart-toolbar">
        {chartRecordedDays < 21 ? (
          <div aria-label="趋势范围" className="stats-chart-switch" role="group">
            <button
              aria-pressed={effectiveChartMode === 'recorded'}
              onClick={() => setChartMode('recorded')}
              type="button"
            >
              已记录 {recordedDays} 天
            </button>
            <button
              aria-pressed={effectiveChartMode === 'window'}
              onClick={() => setChartMode('window')}
              type="button"
            >
              近 21 天
            </button>
          </div>
        ) : null}
        <div className="stats-chart-legend" aria-hidden="true">
          <span>
            <i style={{ background: chartConfig.articles.color }} />
            文章
          </span>
          <span>
            <i style={{ background: chartConfig.annotations.color }} />
            批注
          </span>
          <span>
            <i style={{ background: chartConfig.comments.color }} />
            讨论
          </span>
        </div>
      </div>
      <ChartContainer className="h-[240px] w-full" config={chartConfig}>
        <LineChart accessibilityLayer data={chartData} margin={{ left: 0, right: 8, top: 8 }}>
          {chartUnstartedRange ? (
            <ReferenceArea
              className="stats-chart-unstarted-area"
              ifOverflow="visible"
              label={{
                className: 'stats-chart-unstarted-label',
                offset: 12,
                position: 'insideTopLeft',
                value: '尚未开始记录',
              }}
              stroke="none"
              x1={chartUnstartedRange.x1}
              x2={chartUnstartedRange.x2}
            />
          ) : null}
          <CartesianGrid strokeDasharray="2 8" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="label"
            tickLine={false}
            tickMargin={10}
            minTickGap={16}
          />
          <YAxis axisLine={false} tickLine={false} width={24} />
          <ChartTooltip content={<StatsChartTooltip />} />
          <Line
            activeDot={{ r: 5, strokeWidth: 0 }}
            className="stats-handdrawn-stroke"
            dataKey="articles"
            dot={false}
            shape={renderArticlesLine}
            stroke="var(--color-articles)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            type="linear"
          />
          <Line
            activeDot={{ r: 5, strokeWidth: 0 }}
            className="stats-handdrawn-stroke"
            dataKey="annotations"
            dot={false}
            shape={renderAnnotationsLine}
            stroke="var(--color-annotations)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            type="linear"
          />
          <Line
            activeDot={{ r: 5, strokeWidth: 0 }}
            className="stats-handdrawn-stroke"
            dataKey="comments"
            dot={false}
            shape={renderCommentsLine}
            stroke="var(--color-comments)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            type="linear"
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

function renderArticlesLine(props: CurveProps) {
  return <HandDrawnCurve {...props} seed={11} />;
}

function renderAnnotationsLine(props: CurveProps) {
  return <HandDrawnCurve {...props} seed={23} />;
}

function renderCommentsLine(props: CurveProps) {
  return <HandDrawnCurve {...props} seed={37} />;
}

function HandDrawnCurve({
  className,
  clipPath,
  pathRef,
  points,
  stroke,
  strokeDasharray,
  strokeWidth,
  seed,
}: CurveProps & { seed: number }) {
  const width = strokeWidthValue(strokeWidth);
  const primaryPath = buildHandDrawnPath(points, seed, 0);
  const ghostPath = buildHandDrawnPath(points, seed, 1);
  if (!primaryPath) return null;

  return (
    <g className={className} clipPath={clipPath}>
      <path
        d={ghostPath}
        fill="none"
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.28}
        strokeWidth={width + 1.2}
      />
      <path
        d={primaryPath}
        fill="none"
        ref={pathRef}
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={width}
      />
    </g>
  );
}

function StatsChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: React.ReactNode;
  payload?: ChartTooltipPayload[];
}) {
  if (!active) return null;

  const data = payload?.[0]?.payload;
  if (data?.recordStatus === 'unstarted') {
    return (
      <div className="stats-chart-tooltip">
        <div className="stats-chart-tooltip-label">{label}</div>
        <div className="stats-chart-tooltip-empty">尚未开始记录</div>
      </div>
    );
  }

  const items = payload?.filter((item) => item.value !== undefined && item.value !== null) || [];
  if (items.length === 0) return null;

  return (
    <div className="stats-chart-tooltip">
      <div className="stats-chart-tooltip-label">{label}</div>
      <div className="stats-chart-tooltip-items">
        {items.map((item) => {
          const key = String(item.dataKey || item.name || '');
          const itemConfig = chartConfig[key as keyof typeof chartConfig];
          return (
            <div className="stats-chart-tooltip-item" key={key}>
              <span
                className="stats-chart-tooltip-dot"
                style={{ background: item.color || itemConfig?.color }}
              />
              <span>{itemConfig?.label || item.name}</span>
              <strong>{item.value}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildChartData(days: ReadingActivityDay[], startDate: string): ChartActivityDay[] {
  return days.map((day) => {
    if (day.date < startDate) {
      return {
        ...day,
        articles: null,
        annotations: null,
        comments: null,
        recordStatus: 'unstarted',
      };
    }

    return {
      ...day,
      recordStatus: 'recording',
    };
  });
}

function unstartedChartRange(days: ChartActivityDay[]) {
  const unstarted = days.filter((day) => day.recordStatus === 'unstarted');
  const first = unstarted[0];
  const last = unstarted.at(-1);
  if (!first || !last) return null;
  return { x1: first.label, x2: last.label };
}

function buildHandDrawnPath(points: CurveProps['points'], seed: number, pass: number) {
  const inkPoints = toInkPoints(points);
  const [firstPoint] = inkPoints;
  if (!firstPoint) return '';

  const segments = [`M ${svgNumber(firstPoint.x)} ${svgNumber(firstPoint.y)}`];
  for (let index = 1; index < inkPoints.length; index += 1) {
    const start = inkPoints[index - 1];
    const end = inkPoints[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const xAmp = Math.min(3.6, Math.max(1.4, Math.abs(dx) * 0.03));
    const yAmp = Math.min(4.2, Math.max(2.1, Math.abs(dy) * 0.04));
    const base = seed * 101 + pass * 37 + index * 17;
    const first = {
      x: start.x + dx * 0.34 + jitter(base + 1, xAmp),
      y: start.y + dy * 0.34 + jitter(base + 2, yAmp),
    };
    const second = {
      x: start.x + dx * 0.68 + jitter(base + 3, xAmp),
      y: start.y + dy * 0.68 + jitter(base + 4, yAmp),
    };

    segments.push(
      `L ${svgNumber(first.x)} ${svgNumber(first.y)}`,
      `L ${svgNumber(second.x)} ${svgNumber(second.y)}`,
      `L ${svgNumber(end.x)} ${svgNumber(end.y)}`,
    );
  }
  return segments.join(' ');
}

function toInkPoints(points: CurveProps['points']): InkPoint[] {
  return (points || []).flatMap((point) => {
    if (typeof point.x !== 'number' || typeof point.y !== 'number') return [];
    return [{ x: point.x, y: point.y }];
  });
}

function jitter(seed: number, amplitude: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return (value - Math.floor(value) - 0.5) * amplitude * 2;
}

function strokeWidthValue(value: CurveProps['strokeWidth']) {
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(String(value || 3));
  return Number.isFinite(parsed) ? parsed : 3;
}

function svgNumber(value: number) {
  return value.toFixed(2);
}
