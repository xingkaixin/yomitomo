import type { StoreDatabase, StoreReadProfileEntry } from '../store/store-db';
import { measureStoreRead } from '../store/store-read-profile';
import { rowToArticleSummary } from '../store/store-normalizers';
import { readArticleSummaryCounts } from './article-summary-counts';
import { readArticleSummaryRowsForStore } from './article-summary-queries';

export function readArticleStatsSummaryRows(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
) {
  const rows = readArticleSummaryRowsForStore(database, profile);
  const articleCounts = measureStoreRead(profile, 'read_article_stats_summary_counts', () =>
    readArticleSummaryCounts(database, profile),
  );
  return rows.map((row) => rowToArticleSummary(row, [], articleCounts.get(row.id)));
}
