import type { ArticleRecord } from '@yomitomo/shared';
import {
  computeReadingActivityDays,
  computeReadingStats,
  type ReadingActivityDay,
  type ReadingStatsPeriod,
} from '@yomitomo/core';

export type ActivityStamp = ReadingActivityDay & {
  special: boolean;
  streak: number;
  status: ActivityStampStatus;
};

export type ActivityStampStatus = 'unstarted' | 'empty' | 'today' | 'lit';

export type ReadingInsight = {
  id: string;
  text: string;
};

export type ReadingStatsViewData = {
  stats: ReturnType<typeof computeReadingStats>;
  activityDays: ReadingActivityDay[];
  activityStartDate: string;
  activityStamps: ActivityStamp[];
  hasLitStamp: boolean;
  litStampCount: number;
  currentStreak: number;
  recordedDays: number;
  weekActiveDays: number;
  peakDay: ReadingActivityDay | null;
  sevenDayProgress: number;
  sevenDayRemaining: number;
  insights: ReadingInsight[];
};

const statsViewDataCache = new WeakMap<ArticleRecord[], ReadingStatsViewData>();

export function getReadingStatsViewData(articles: ArticleRecord[]): ReadingStatsViewData {
  const cached = statsViewDataCache.get(articles);
  if (cached) return cached;

  const stats = computeReadingStats(articles);
  const activityDays = computeReadingActivityDays(articles);
  const activityStartDate =
    firstActivityDate(articles) || activityDays.at(-1)?.date || localDateKey(new Date());
  const activityStamps = buildActivityStamps(activityDays, activityStartDate);
  const litStampCount = activityStamps.reduce(
    (count, day) => (day.status === 'lit' ? count + 1 : count),
    0,
  );
  const currentStreak = activityStamps.at(-1)?.streak || 0;
  const recordedDays = activityStamps.reduce(
    (count, day) => (day.status !== 'unstarted' ? count + 1 : count),
    0,
  );
  const sevenDayProgress = Math.min(7, currentStreak || Math.min(litStampCount, 7));
  const data = {
    stats,
    activityDays,
    activityStartDate,
    activityStamps,
    hasLitStamp: litStampCount > 0,
    litStampCount,
    currentStreak,
    recordedDays,
    weekActiveDays: activityDays.slice(-7).filter((day) => day.score > 0).length,
    peakDay: peakActivityDay(activityDays, activityStartDate),
    sevenDayProgress,
    sevenDayRemaining: Math.max(0, 7 - sevenDayProgress),
    insights: buildReadingInsights(activityDays, activityStartDate, stats.total),
  };

  statsViewDataCache.set(articles, data);
  return data;
}

export function preloadReadingStatsFirstPaintData(articles: ArticleRecord[]) {
  getReadingStatsViewData(articles);
}

export function periodSummary(stats: ReadingStatsPeriod) {
  return `${stats.articles} 篇文章 · ${stats.comments} 次讨论 · ${stats.annotations} 条批注 · ${stats.aiComments} 次助手参与`;
}

export function nextGoalText(litStampCount: number, remaining: number) {
  if (remaining <= 0) return '七日章已点亮，继续收集下一枚藏书票';
  return `已收集 ${litStampCount} 枚藏书票，再读 ${remaining} 天点亮七日章`;
}

export function activityStampLabel(day: ActivityStamp) {
  if (day.status === 'unstarted') return `${day.date}：伴读旅程尚未开始`;
  if (day.status === 'today') return `${day.date}：今天读一篇，盖下第一枚藏书票`;
  const special = day.special ? `，连续 ${day.streak} 天特殊印章` : '';
  return `${day.date}：${day.annotations} 条批注，${day.comments} 条讨论${special}`;
}

export function activityStampTitle(day: ActivityStamp) {
  if (day.status === 'unstarted') return `${day.date} · 未开始`;
  if (day.status === 'today') return `${day.date} · 今天读一篇，盖下第一枚藏书票`;
  const special = day.special ? ` · 连续 ${day.streak} 天特殊印章` : '';
  return `${day.date} · 批注 ${day.annotations} · 讨论 ${day.comments}${special}`;
}

export function activityMapDescription(
  hasLitStamp: boolean,
  litStampCount: number,
  currentStreak: number,
) {
  if (!hasLitStamp) return '今天读一篇，盖下第一枚藏书票。连续 7 天会点亮纪念章。';
  if (currentStreak > 0 && currentStreak < 7)
    return `已收集 ${litStampCount} 枚藏书票，再读 ${7 - currentStreak} 天点亮七日章。`;
  return `已收集 ${litStampCount} 枚藏书票。连续 7 天会点亮纪念章。`;
}

export function chartActivityDescription(recordedDays: number) {
  if (recordedDays >= 21) return '批注、讨论和阅读趋势';
  if (recordedDays <= 6) return `已记录 ${recordedDays} 天，正在形成你的伴读节奏`;
  return `已记录 ${recordedDays} 天，正在形成批注、讨论和阅读趋势`;
}

function peakActivityDay(days: ReadingActivityDay[], startDate: string) {
  const activeDays = days.filter((day) => day.date >= startDate && day.score > 0);
  return activeDays.reduce<ReadingActivityDay | null>((peak, day) => {
    if (!peak || dayInteractions(day) > dayInteractions(peak)) return day;
    return peak;
  }, null);
}

function buildReadingInsights(
  days: ReadingActivityDay[],
  startDate: string,
  stats: ReadingStatsPeriod,
): ReadingInsight[] {
  const activeDays = days.filter((day) => day.date >= startDate && day.score > 0);
  const peak = peakActivityDay(days, startDate);

  if (activeDays.length === 0) {
    return [
      { id: 'start', text: '今天读完一篇文章后，这里会出现第一条伴读洞察。' },
      { id: 'trend', text: '批注、讨论和助手参与会一起形成你的阅读趋势。' },
    ];
  }

  return [
    peak
      ? {
          id: 'peak',
          text: `你在 ${peak.label} 最活跃，产生了 ${dayInteractions(peak)} 次互动。`,
        }
      : { id: 'peak', text: `已记录 ${activeDays.length} 个活跃日，伴读节奏正在成形。` },
    stats.annotations >= stats.comments
      ? {
          id: 'depth',
          text: `目前已留下 ${stats.annotations} 条批注，深读痕迹正在累积。`,
        }
      : {
          id: 'discussion',
          text: `讨论 ${stats.comments} 次，问题推进是当前主要节奏。`,
        },
    stats.aiComments > 0
      ? {
          id: 'ai',
          text: `助手参与 ${stats.aiComments} 次，阅读高峰日的协作更集中。`,
        }
      : { id: 'ai', text: '完成一次助手讨论后，这里会显示协作趋势。' },
  ];
}

function dayInteractions(day: ReadingActivityDay) {
  return day.articles + day.annotations + day.comments + day.aiComments;
}

function buildActivityStamps(days: ReadingActivityDay[], startDate: string): ActivityStamp[] {
  const today = days.at(-1)?.date || localDateKey(new Date().toISOString());
  let streak = 0;
  return days.map((day) => {
    streak = day.score > 0 ? streak + 1 : 0;
    const status = activityStampStatus(day, startDate, today);
    return {
      ...day,
      special: status === 'lit' && streak > 0 && streak % 7 === 0,
      streak,
      status,
    };
  });
}

function activityStampStatus(
  day: ReadingActivityDay,
  startDate: string,
  today: string,
): ActivityStampStatus {
  if (day.score > 0) return 'lit';
  if (day.date < startDate) return 'unstarted';
  if (day.date === today) return 'today';
  return 'empty';
}

function firstActivityDate(articles: ArticleRecord[]) {
  let first = '';
  const visit = (value: string | undefined) => {
    const date = localDateKey(value);
    if (date && (!first || date < first)) first = date;
  };

  for (const article of articles) {
    visit(article.createdAt);
    visit(article.updatedAt);
    for (const annotation of article.annotations) {
      visit(annotation.createdAt);
      for (const comment of annotation.comments) visit(comment.createdAt);
    }
  }
  return first;
}

function localDateKey(value: string | Date | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
