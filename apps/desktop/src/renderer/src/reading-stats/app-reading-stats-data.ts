import i18next from 'i18next';
import type { ArticleSummaryRecord } from '@yomitomo/shared';
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

const statsViewDataCache = new WeakMap<
  ArticleSummaryRecord[],
  { language: string; data: ReadingStatsViewData }
>();

export function getReadingStatsViewData(articles: ArticleSummaryRecord[]): ReadingStatsViewData {
  const language = i18next.language || 'zh-CN';
  const cached = statsViewDataCache.get(articles);
  if (cached?.language === language) return cached.data;

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

  statsViewDataCache.set(articles, { language, data });
  return data;
}

export function preloadReadingStatsFirstPaintData(articles: ArticleSummaryRecord[]) {
  getReadingStatsViewData(articles);
}

export function periodSummary(stats: ReadingStatsPeriod) {
  return i18next.t('readingStats.summary.period', {
    aiComments: stats.aiComments,
    annotations: stats.annotations,
    distillations: stats.distillations,
    thoughts: stats.thoughts,
  });
}

export function nextGoalText(litStampCount: number, remaining: number) {
  if (remaining <= 0) return i18next.t('readingStats.goals.sevenDayLitNext');
  return i18next.t('readingStats.goals.sevenDayRemaining', {
    count: litStampCount,
    remaining,
  });
}

export function activityStampLabel(day: ActivityStamp) {
  if (day.status === 'unstarted')
    return i18next.t('readingStats.activity.label.unstarted', { date: day.date });
  if (day.status === 'today')
    return i18next.t('readingStats.activity.label.today', { date: day.date });
  return i18next.t('readingStats.activity.label.recorded', {
    annotations: day.annotations,
    date: day.date,
    distillations: day.distillations,
    special: day.special
      ? i18next.t('readingStats.activity.label.special', { count: day.streak })
      : '',
    thoughts: day.thoughts,
  });
}

export function activityStampTitle(day: ActivityStamp) {
  if (day.status === 'unstarted')
    return i18next.t('readingStats.activity.title.unstarted', { date: day.date });
  if (day.status === 'today')
    return i18next.t('readingStats.activity.title.today', { date: day.date });
  return i18next.t('readingStats.activity.title.recorded', {
    annotations: day.annotations,
    date: day.date,
    distillations: day.distillations,
    special: day.special
      ? i18next.t('readingStats.activity.title.special', { count: day.streak })
      : '',
    thoughts: day.thoughts,
  });
}

export function activityMapDescription(
  hasLitStamp: boolean,
  litStampCount: number,
  currentStreak: number,
) {
  if (!hasLitStamp) return i18next.t('readingStats.activity.map.empty');
  if (currentStreak > 0 && currentStreak < 7)
    return i18next.t('readingStats.activity.map.remaining', {
      count: litStampCount,
      remaining: 7 - currentStreak,
    });
  return i18next.t('readingStats.activity.map.collected', { count: litStampCount });
}

export function chartActivityDescription(recordedDays: number) {
  if (recordedDays >= 21) return i18next.t('readingStats.chart.descriptionMature');
  if (recordedDays <= 6)
    return i18next.t('readingStats.chart.descriptionEarly', { count: recordedDays });
  return i18next.t('readingStats.chart.descriptionBuilding', { count: recordedDays });
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
      { id: 'start', text: i18next.t('readingStats.insights.start') },
      { id: 'trend', text: i18next.t('readingStats.insights.trend') },
    ];
  }

  return [
    peak
      ? {
          id: 'peak',
          text: i18next.t('readingStats.insights.peak', {
            count: dayInteractions(peak),
            label: peak.label,
          }),
        }
      : {
          id: 'peak',
          text: i18next.t('readingStats.insights.activeDays', { count: activeDays.length }),
        },
    stats.distillations > 0
      ? {
          id: 'depth',
          text: i18next.t('readingStats.insights.distillations', {
            count: stats.distillations,
          }),
        }
      : stats.thoughts > 0
        ? {
            id: 'discussion',
            text: i18next.t('readingStats.insights.thoughts', { count: stats.thoughts }),
          }
        : {
            id: 'highlight',
            text: i18next.t('readingStats.insights.annotations', {
              count: stats.annotations,
            }),
          },
    stats.aiComments > 0
      ? {
          id: 'ai',
          text: i18next.t('readingStats.insights.aiComments', { count: stats.aiComments }),
        }
      : { id: 'ai', text: i18next.t('readingStats.insights.aiEmpty') },
  ];
}

function dayInteractions(day: ReadingActivityDay) {
  return day.articles + day.annotations + day.thoughts + day.distillations + day.aiComments;
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

function firstActivityDate(articles: ArticleSummaryRecord[]) {
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
      visit(annotation.distillation?.publishedAt || annotation.distillation?.updatedAt);
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
