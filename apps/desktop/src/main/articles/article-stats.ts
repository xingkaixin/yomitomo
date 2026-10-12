import type { ArticleStatsRecord } from '@yomitomo/shared';
import type { StoreDatabase, StoreReadProfileEntry } from '../store/store-db';
import { measureStoreRead } from '../store/store-read-profile';
import { rowToArticleSummary } from '../store/store-normalizers';
import { readArticleActivityDates, readArticleSummaryCounts } from './article-summary-counts';
import { readArticleSummaryRowsForStore } from './article-summary-queries';

export function readArticleStatsSummaryRows(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
): ArticleStatsRecord[] {
  const rows = readArticleSummaryRowsForStore(database, profile);
  const articleCounts = measureStoreRead(profile, 'read_article_stats_summary_counts', () =>
    readArticleSummaryCounts(database, profile),
  );
  const activityDates = readArticleActivityDates(database, profile);
  return rows.map((row) =>
    Object.assign(rowToArticleSummary(row, articleCounts.get(row.id)), {
      activityDates: activityDates.get(row.id) || {
        annotations: [],
        thoughts: [],
        discussionComments: [],
        aiComments: [],
        distillations: [],
      },
    }),
  );
}
